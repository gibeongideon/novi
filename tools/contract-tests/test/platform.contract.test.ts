/**
 * Phase 1 end to end, live (P1.16.1, P1.16.2, P1.14): a customer signs up, confirms the email, the
 * provisioner creates their own Odoo + database, they sign in through the gateway and get their
 * menus; their session and credentials don't work on another tenant; and SSO through Odoo's stock
 * auth_oauth signs them in once their identity is linked by an emailed link.
 *
 * Needs the dev stack (Odoo, Postgres, Mailpit), Docker and the starter template; the new tenant
 * and the fake identity provider are removed afterwards.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildServer, FileTenantRegistry, loadConfig } from "@novi/gateway";
import { JsonRpcTransport, Orm } from "@novi/odoo-client";
import { loadKey, type Mailer, platformConfig, shellRunner, SignupStore, tick } from "@novi/provisioner";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { odooUp } from "./helpers.js";

const MAILPIT = "http://localhost:8025";
const IDP_PORT = 18399;
const IDP = "novi-test-idp";
const UA = "Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0 Safari/537.36";
const fixtures = fileURLToPath(new URL("../fixtures", import.meta.url));

const dockerUp = (() => {
  try {
    execFileSync("docker", ["image", "inspect", "novi/odoo20:stock"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();
const mailpitUp = await fetch(`${MAILPIT}/api/v1/info`).then(
  (r) => r.ok,
  () => false,
);

describe.runIf(odooUp && dockerUp && mailpitUp)("Phase 1 platform, end to end", () => {
  const signupsDir = mkdtempSync(join(tmpdir(), "novi-e2e-signups-"));
  process.env.SIGNUPS_DIR = signupsDir; // read by platformConfig() in the gateway and here
  const cfg = platformConfig();
  const slug = `e2e${Date.now().toString(36)}`;
  const host = `${slug}.localhost`;
  const email = `owner@${slug}.test`;
  const password = "E2e-Strong-Pass-2026";
  const mails: { to: string; text: string }[] = [];
  const mailer: Mailer = { send: async (to, _subject, text) => void mails.push({ to, text }) };

  const appP = buildServer({ ...loadConfig(), defaultTenant: undefined }, { mailer });
  let app: Awaited<typeof appP>;
  type Res = Awaited<ReturnType<typeof app.inject>>;
  const cookieOf = (res: Res) =>
    ([] as string[])
      .concat(res.headers["set-cookie"] ?? [])
      .find((c) => c.startsWith("session_id="))
      ?.split(";")[0];
  const login = (onHost: string, l: string, p: string) =>
    app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { host: onHost, "user-agent": UA },
      payload: { login: l, password: p },
    });
  const uidOf = async (onHost: string, cookie: string) => {
    const r = await app.inject({
      method: "POST",
      url: "/web/session/get_session_info",
      headers: { host: onHost, cookie, "content-type": "application/json" },
      payload: { jsonrpc: "2.0", method: "call", params: {} },
    });
    return (r.json() as { result?: { uid?: number } }).result?.uid ?? null;
  };
  let sessionCookie = "";
  let ownerUid = 0;

  beforeAll(async () => {
    app = await appP;
  });
  afterAll(async () => {
    await app?.close();
    execFileSync("docker", ["rm", "-f", IDP], { stdio: "ignore" });
    execFileSync("bash", [join(cfg.repoRoot, "infra/provisioning/tenant.sh"), "destroy", slug], {
      stdio: "ignore",
    });
    rmSync(signupsDir, { recursive: true, force: true });
  });

  it("P1.16.1 sign-up → email → own Odoo → sign in → menus", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/signup",
      headers: { host: "localhost" },
      payload: { company: `E2E ${slug}`, email, password, country: "KE", slug },
    });
    expect(res.statusCode).toBe(202);
    const { id } = res.json() as { id: string };

    const link = new URL(mails.find((m) => m.to === email)!.text.match(/http\S+verify\S+/)![0]);
    const verify = await app.inject({ url: link.pathname + link.search, headers: { host: "localhost" } });
    expect(verify.headers.location).toBe(`/signup/status/${id}`);

    const done = await tick({
      cfg,
      store: new SignupStore(signupsDir),
      key: loadKey(process.env, cfg.devKeyFile),
      mailer,
      run: shellRunner(cfg),
    });
    expect(done).toMatchObject({ slug, status: "active" });
    const progress = (await app.inject({ url: `/api/signup/${id}`, headers: { host: "localhost" } })).json();
    expect(progress).toMatchObject({ status: "active", url: cfg.workspaceUrl.replace("{slug}", slug) });
    expect(JSON.stringify(progress)).not.toContain(email); // public endpoint: no private data

    const signedIn = await login(host, email, password);
    expect(signedIn.json()).toEqual({ status: "ok" });
    sessionCookie = cookieOf(signedIn)!;
    ownerUid = (await uidOf(host, sessionCookie))!;
    expect(ownerUid).toBeGreaterThan(0);

    const menus = await app.inject({
      url: "/web/webclient/load_menus",
      headers: { host, cookie: sessionCookie },
    });
    const names = Object.values(menus.json() as Record<string, { name: string }>).map((m) => m.name);
    expect(names).toEqual(expect.arrayContaining(["Sales", "Inventory"]));
  }, 240_000);

  it("P1.16.2 a tenant's session and credentials don't work on another tenant", async () => {
    const other = new FileTenantRegistry(loadConfig().tenantsFile)
      .list()
      .find((t) => t.slug !== slug && t.status === "active");
    expect(other, "needs a second tenant (e.g. acme)").toBeDefined();
    const otherHost = other!.hosts[0]!;
    expect(await uidOf(otherHost, sessionCookie)).toBeNull();
    expect((await login(otherHost, email, password)).statusCode).toBe(401);
    expect(await uidOf(host, sessionCookie)).toBe(ownerUid); // still fine at home
  });

  it("P1.14 SSO: refused until linked by an emailed link, then signs in", async () => {
    // a new workspace offers no provider (Odoo's own "Odoo.com Accounts" is switched off)
    expect((await app.inject({ url: "/api/auth/providers", headers: { host } })).json()).toEqual([]);

    // the workspace admin configures a provider (stock auth.oauth.provider record)
    const tenant = new FileTenantRegistry(loadConfig().tenantsFile).bySlug(slug)!;
    const admin = new JsonRpcTransport({ baseUrl: tenant.odooUrl, db: tenant.db });
    await admin.authenticate(email, password);
    await new Orm(admin).webSave(
      "auth.oauth.provider",
      [],
      {
        name: "Test SSO",
        body: "Test SSO",
        client_id: "novi-test",
        enabled: true,
        scope: "openid email",
        auth_endpoint: `http://127.0.0.1:${IDP_PORT}/authorize`,
        validation_endpoint: "http://idp:8000/userinfo", // server to server, on the tenant's network
      },
      {},
    );
    execFileSync("docker", ["rm", "-f", IDP], { stdio: "ignore" });
    execFileSync("docker", [
      ...["run", "-d", "--name", IDP, "--network", `novi-tenant-${slug}`, "--network-alias", "idp"],
      ...["-p", `127.0.0.1:${IDP_PORT}:8000`, "-v", `${fixtures}:/idp:ro`, "--entrypoint", "python3"],
      ...["novi/odoo20:stock", "/idp/fake-idp.py"],
    ]);
    for (let i = 0; i < 50; i++) {
      if (
        await fetch(`http://127.0.0.1:${IDP_PORT}/userinfo`).then(
          () => true,
          () => false,
        )
      )
        break;
      await new Promise((r) => setTimeout(r, 200));
    }

    /** Browser round trip: provider → back to this host's /auth_oauth/signin (fragment → query). */
    const ssoSignIn = async (token?: string) => {
      const providers = (
        await app.inject({ url: `/api/auth/providers${token ? `?token=${token}` : ""}`, headers: { host } })
      ).json() as { name: string; url: string }[];
      const p = providers.find((x) => x.name === "Test SSO")!;
      expect(new URL(p.url).searchParams.get("redirect_uri")).toBe(`http://${host}/auth_oauth/signin`);
      const back = await fetch(`${p.url}&login_hint=${encodeURIComponent(email)}`, { redirect: "manual" });
      const callback = new URL(back.headers.get("location")!.replace("#", "?"));
      return app.inject({ url: callback.pathname + callback.search, headers: { host } });
    };

    // not linked yet: Odoo refuses (invitation-only workspace) and NOVI shows its own message
    const refused = await ssoSignIn();
    const odooLogin = refused.headers.location as string;
    expect(odooLogin).toMatch(/\/web\/login\?oauth_error=/);
    const shown = await app.inject({ url: odooLogin.replace(/^https?:\/\/[^/]+/, ""), headers: { host } });
    expect(shown.headers.location).toMatch(/^\/\?ssoError=/);

    // linking: the emailed reset link carries a token; choosing SSO there links the identity
    await app.inject({
      method: "POST",
      url: "/api/auth/reset",
      headers: { host },
      payload: { login: email },
    });
    const token = await resetToken(email);
    const linked = await ssoSignIn(token);
    expect(["/", `http://${host}/`]).toContain(linked.headers.location); // back to NOVI
    expect(await uidOf(host, cookieOf(linked)!)).toBe(ownerUid);

    // from now on, SSO alone signs them in
    const again = await ssoSignIn();
    expect(await uidOf(host, cookieOf(again)!)).toBe(ownerUid);
  }, 120_000);
});

/** The token from the newest password-reset email Odoo sent to `to` (Mailpit). */
async function resetToken(to: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const list = (await (
      await fetch(`${MAILPIT}/api/v1/search?query=to:${encodeURIComponent(to)}`)
    ).json()) as {
      messages: { ID: string; Subject: string }[];
    };
    const m = list.messages.find((x) => /password/i.test(x.Subject));
    if (m) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as { Text: string };
      return msg.Text.match(/token=([^&\s\]]+)/)![1]!;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no reset email for ${to}`);
}
