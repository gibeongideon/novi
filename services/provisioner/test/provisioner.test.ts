import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  open,
  type PlatformConfig,
  provision,
  type ScriptRunner,
  seal,
  SignupStore,
  slugify,
  tick,
} from "../src/index.js";

const key = randomBytes(32);
const cfg: PlatformConfig = {
  repoRoot: "/",
  signupsDir: "",
  devKeyFile: "",
  baseDomain: "novi.test",
  workspaceUrl: "https://{slug}.novi.test",
  firstPort: 0,
};
const store = () => new SignupStore(mkdtempSync(join(tmpdir(), "novi-signups-")));
const queued = (st: SignupStore) =>
  st.create({
    slug: "acme",
    company: "Acme Ltd",
    country: "KE",
    email: "o@acme.test",
    passwordSealed: seal("S3cret-pass!", key),
    status: "queued",
  });

describe("secret box", () => {
  it("round-trips and detects tampering", () => {
    const sealed = seal("S3cret-pass!", key);
    expect(sealed).not.toContain("S3cret");
    expect(open(sealed, key)).toBe("S3cret-pass!");
    expect(() =>
      open(
        sealed.replace(/.$/, (c) => (c === "A" ? "B" : "A")),
        key,
      ),
    ).toThrow();
    expect(() => open(sealed, randomBytes(32))).toThrow();
  });
});

describe("slugify", () => {
  it("makes tenant ids from company names", () => {
    expect(slugify("Acme Holdings Ltd.")).toBe("acmeholdings");
    expect(slugify("Ünïcødé Café Co")).toBe("unicodecafe");
    expect(slugify("42 Logistics")).toBe("logistics");
    expect(slugify("A")).toMatch(/^[a-z][a-z0-9]{1,30}$/);
  });
});

describe("worker", () => {
  it("provisions: passes the password only via env, records steps, wipes the password, emails the owner", async () => {
    const st = store();
    const s = queued(st);
    const sent: string[] = [];
    const calls: { args: string[]; env: Record<string, string> }[] = [];
    const run: ScriptRunner = async (args, env, onStep) => {
      calls.push({ args, env });
      onStep("clone_db");
      onStep("start_instance");
      return { code: 0, tail: "" };
    };
    const done = await provision(s, {
      store: st,
      key,
      cfg,
      run,
      port: async () => 18321,
      mailer: { send: async (to, subject) => void sent.push(`${to}|${subject}`) },
    });
    expect(done).toMatchObject({
      status: "active",
      url: "https://acme.novi.test",
      steps: ["clone_db", "start_instance"],
    });
    expect(done.passwordSealed).toBeUndefined();
    expect(calls[0]!.args).toEqual(["create", "acme", "Acme Ltd", "KE", "o@acme.test", "18321"]);
    expect(calls[0]!.args.join(" ")).not.toContain("S3cret");
    expect(calls[0]!.env).toEqual({ TENANT_ADMIN_PASSWORD: "S3cret-pass!", TENANT_HOST: "acme.novi.test" });
    expect(sent).toEqual(["o@acme.test|Your Acme Ltd workspace is ready"]);
  });

  it("rolls back with destroy on failure and keeps the sealed password for a retry", async () => {
    const st = store();
    queued(st);
    const calls: string[] = [];
    const run: ScriptRunner = async (args) => {
      calls.push(args[0]!);
      return args[0] === "create"
        ? { code: 1, tail: "module init failed, see init.log" }
        : { code: 0, tail: "" };
    };
    const done = await tick({
      store: st,
      key,
      cfg,
      run,
      port: async () => 1,
      mailer: { send: async () => undefined },
    });
    expect(calls).toEqual(["create", "destroy"]);
    expect(done).toMatchObject({ status: "failed", attempts: 1 });
    expect(done!.error).toContain("module init failed");
    expect(done!.passwordSealed).toBeDefined();
    expect(await tick({ store: st, key, cfg, run, mailer: { send: async () => undefined } })).toBeUndefined(); // nothing queued
    // a retry starts from a clean slate, then provisions again
    st.update(done!.id, { status: "queued" });
    await tick({ store: st, key, cfg, run, port: async () => 1, mailer: { send: async () => undefined } });
    expect(calls).toEqual(["create", "destroy", "destroy", "create", "destroy"]);
  });
});
