/**
 * Sign-ups and their provisioning state (P1.3/P1.4). One JSON file per sign-up (mode 600), shared
 * by the gateway (creates, verifies, reports status) and the provisioner (executes). File-backed
 * on purpose (Musk step 2): one provisioner, no queue server; Postgres when there are several.
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type SignupStatus = "verify" | "queued" | "provisioning" | "active" | "failed";

export interface Signup {
  id: string;
  slug: string;
  company: string;
  country: string;
  email: string;
  /** AES-GCM sealed admin password; wiped once the workspace is ready. */
  passwordSealed?: string;
  status: SignupStatus;
  /** Email verification token (cleared once used). */
  verifyToken?: string;
  createdAt: string;
  updatedAt: string;
  /** Finished provisioning steps, e.g. ["clone_db", "start_instance"]. */
  steps: string[];
  url?: string;
  error?: string;
  attempts: number;
}

export class SignupStore {
  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  create(data: Omit<Signup, "id" | "createdAt" | "updatedAt" | "steps" | "attempts">): Signup {
    const now = new Date().toISOString();
    const s: Signup = {
      ...data,
      id: randomBytes(18).toString("base64url"),
      createdAt: now,
      updatedAt: now,
      steps: [],
      attempts: 0,
    };
    this.save(s);
    return s;
  }

  get(id: string): Signup | undefined {
    if (!/^[A-Za-z0-9_-]{10,64}$/.test(id)) return undefined;
    const file = join(this.dir, `${id}.json`);
    return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Signup) : undefined;
  }

  list(): Signup[] {
    return readdirSync(this.dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(join(this.dir, f), "utf8")) as Signup)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  byToken(token: string): Signup | undefined {
    return token ? this.list().find((s) => s.verifyToken === token) : undefined;
  }

  /** A slug is taken by any sign-up that isn't failed (failed ones can be retried or released). */
  slugTaken(slug: string): boolean {
    return this.list().some((s) => s.slug === slug && s.status !== "failed");
  }

  update(id: string, patch: Partial<Signup>): Signup {
    const s = this.get(id);
    if (!s) throw new Error(`unknown sign-up ${id}`);
    const next = { ...s, ...patch, updatedAt: new Date().toISOString() };
    this.save(next);
    return next;
  }

  private save(s: Signup): void {
    const file = join(this.dir, `${s.id}.json`);
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(s, null, 2), { mode: 0o600 });
    renameSync(tmp, file);
  }
}

/** "Acme Holdings Ltd." → "acmeholdings" (tenant ids: ^[a-z][a-z0-9]{1,30}$, see infra/provisioning). */
export function slugify(company: string): string {
  const base = company
    .toLowerCase()
    // letters that don't decompose into base + accent
    .replace(/[øœ]/g, (c) => (c === "ø" ? "o" : "oe"))
    .replace(/æ/g, "ae")
    .replace(/ß/g, "ss")
    .replace(/[łđ]/g, (c) => (c === "ł" ? "l" : "d"))
    .normalize("NFKD")
    .replace(/\b(ltd|limited|llc|inc|plc|co|company|gmbh|sa|sarl)\b\.?/g, "")
    .replace(/[^a-z0-9]/g, "")
    .replace(/^[0-9]+/, "")
    .slice(0, 30);
  return base.length >= 2 ? base : `ws${base}`.padEnd(4, "x");
}

export const SLUG_RE = /^[a-z][a-z0-9]{1,30}$/;
