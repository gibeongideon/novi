/**
 * Provisioner worker (P1.4): turns verified sign-ups into running workspaces, one at a time.
 * Runs the proven tenant script (infra/provisioning/tenant.sh: template clone ≈10 s, isolation
 * verified) and rolls back with `destroy` on failure. Holds the privileges (Docker, DB superuser)
 * the internet-facing gateway must never have.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";

import { type PlatformConfig, platformConfig } from "./config.js";
import { type Mailer, smtpMailer } from "./mailer.js";
import { loadKey, open } from "./secretBox.js";
import { type Signup, SignupStore } from "./signups.js";

/** Runs `tenant.sh <args>` with extra env; reports finished steps; resolves with the exit code. */
export type ScriptRunner = (
  args: string[],
  env: Record<string, string>,
  onStep: (step: string) => void,
) => Promise<{ code: number; tail: string }>;

export function shellRunner(cfg: PlatformConfig): ScriptRunner {
  return (args, env, onStep) =>
    new Promise((resolve) => {
      const child = spawn("bash", [`${cfg.repoRoot}infra/provisioning/tenant.sh`, ...args], {
        cwd: cfg.repoRoot,
        env: { ...process.env, ...env },
      });
      let tail = "";
      const read = (chunk: Buffer) => {
        const text = chunk.toString();
        tail = (tail + text).slice(-2000);
        for (const m of text.matchAll(/✓ (\w+)/g)) onStep(m[1]!);
      };
      child.stdout.on("data", read);
      child.stderr.on("data", read);
      child.on("close", (code) => resolve({ code: code ?? 1, tail }));
    });
}

/** A free local port for the tenant container (production uses the docker network instead). */
export async function freePort(from: number): Promise<number> {
  for (let p = from; p < from + 1000; p++) {
    const free = await new Promise<boolean>((res) => {
      const srv = createServer()
        .once("error", () => res(false))
        .once("listening", () => srv.close(() => res(true)));
      srv.listen(p, "127.0.0.1");
    });
    if (free) return p;
  }
  throw new Error("no free port");
}

export interface WorkerDeps {
  store: SignupStore;
  key: Buffer;
  mailer: Mailer;
  run: ScriptRunner;
  cfg: PlatformConfig;
  port?: () => Promise<number>;
}

/** Provisions one sign-up end to end. Never throws: failures are recorded on the sign-up. */
export async function provision(s: Signup, d: WorkerDeps): Promise<Signup> {
  const store = d.store;
  let cur = store.update(s.id, {
    status: "provisioning",
    steps: [],
    error: undefined,
    attempts: s.attempts + 1,
  });
  try {
    const password = open(s.passwordSealed ?? "", d.key);
    // re-runs are safe: a retry or a run interrupted by a restart first clears what it left behind
    if (s.attempts > 0) await d.run(["destroy", s.slug], {}, () => undefined);
    const port = await (d.port ?? (() => freePort(d.cfg.firstPort)))();
    const { code, tail } = await d.run(
      ["create", s.slug, s.company, s.country, s.email, String(port)],
      { TENANT_ADMIN_PASSWORD: password, TENANT_HOST: `${s.slug}.${d.cfg.baseDomain}` },
      (step) => {
        cur = store.update(s.id, { steps: [...(store.get(s.id)?.steps ?? []), step] });
      },
    );
    if (code !== 0) throw new Error(tail.split("\n").filter(Boolean).slice(-3).join(" | ") || `exit ${code}`);
    const url = d.cfg.workspaceUrl.replace("{slug}", s.slug);
    cur = store.update(s.id, { status: "active", url, passwordSealed: undefined }); // password no longer needed
    await d.mailer
      .send(
        s.email,
        `Your ${s.company} workspace is ready`,
        `Hello,\n\nYour NOVI workspace is ready:\n\n  ${url}\n\nSign in with ${s.email} and the password you chose.\n`,
      )
      .catch(() => undefined); // the workspace exists even if the email fails
    return cur;
  } catch (err) {
    // roll back everything the script created (container, volume, database, role, gateway entry)
    await d.run(["destroy", s.slug], {}, () => undefined).catch(() => undefined);
    return store.update(s.id, { status: "failed", error: (err as Error).message.slice(0, 500) });
  }
}

/** One pass: provision the oldest queued sign-up, if any. */
export async function tick(d: WorkerDeps): Promise<Signup | undefined> {
  const next = d.store.list().find((s) => s.status === "queued");
  return next ? provision(next, d) : undefined;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cfg = platformConfig();
  const deps: WorkerDeps = {
    cfg,
    store: new SignupStore(cfg.signupsDir),
    key: loadKey(process.env, cfg.devKeyFile),
    mailer: smtpMailer(),
    run: shellRunner(cfg),
  };
  // a provisioning interrupted by a restart is retried
  for (const s of deps.store.list())
    if (s.status === "provisioning") deps.store.update(s.id, { status: "queued" });
  console.log(`[provisioner] watching ${cfg.signupsDir}`);
  const loop = async () => {
    const done = await tick(deps).catch((e: unknown) => console.error("[provisioner]", e));
    if (done)
      console.log(`[provisioner] ${done.slug}: ${done.status}${done.error ? ` (${done.error})` : ""}`);
    setTimeout(loop, done ? 0 : 2000);
  };
  void loop();
}
