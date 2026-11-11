/**
 * Shared fixtures for the contract suite. Targets the local stack by default:
 *   ODOO_URL=http://localhost:18069  ODOO_DB=novi_demo  credentials from .cache/dev-credentials.json
 * When Odoo is not reachable, every suite is skipped (so `pnpm test` stays green offline);
 * set CONTRACT_REQUIRED=1 (CI) to turn that into a failure.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getVersion, Json2Transport, JsonRpcTransport, Orm } from "@novi/odoo-client";

export const ODOO_URL = process.env.ODOO_URL ?? "http://localhost:18069";
export const ODOO_DB = process.env.ODOO_DB ?? "novi_demo";
/** Odoo websocket (gevent) endpoint; local stack maps it to 18072. */
export const ODOO_WS_URL = process.env.ODOO_WS_URL ?? "ws://localhost:18072";

interface SeedUser {
  id: number;
  login: string;
  password: string;
  api_key?: string;
  totp_secret?: string;
}
export interface Seed {
  db: string;
  users: Record<string, SeedUser>;
}

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const credsFile = join(root, ".cache/dev-credentials.json");

export const seed: Seed | null = existsSync(credsFile)
  ? (JSON.parse(readFileSync(credsFile, "utf8")) as Seed)
  : null;

async function probe(): Promise<boolean> {
  try {
    await getVersion({ baseUrl: ODOO_URL, timeoutMs: 3000 });
    return !!seed;
  } catch {
    return false;
  }
}

export const odooUp = await probe();
if (!odooUp && process.env.CONTRACT_REQUIRED) {
  throw new Error(`Odoo not reachable at ${ODOO_URL} or not seeded (.cache/dev-credentials.json missing)`);
}

export function user(login: string): SeedUser {
  const u = seed?.users[login];
  if (!u) throw new Error(`seed user ${login} missing; run pnpm odoo:seed`);
  return u;
}

/** Logged-in session transport for a seeded user. */
export async function session(login = "admin"): Promise<JsonRpcTransport> {
  const u = user(login);
  const t = new JsonRpcTransport({ baseUrl: ODOO_URL, db: ODOO_DB });
  await t.authenticate(u.login, u.password);
  return t;
}

export function json2(login = "admin"): Json2Transport {
  const key = user(login).api_key;
  if (!key) throw new Error(`no api key for ${login}`);
  return new Json2Transport({ baseUrl: ODOO_URL, db: ODOO_DB, apiKey: key });
}

export async function both(): Promise<[string, Orm][]> {
  return [
    ["jsonrpc", new Orm(await session())],
    ["json2", new Orm(json2())],
  ];
}

/**
 * Reduces a value to its *shape* (keys + JSON types), so snapshots catch API changes
 * (renamed/removed keys, type changes) without breaking on data changes.
 */
export function shape(v: unknown, depth = 3): unknown {
  if (v === null) return "null";
  if (Array.isArray(v)) return depth && v.length ? [shape(v[0], depth - 1)] : "array";
  if (typeof v === "object") {
    if (!depth) return "object";
    return Object.fromEntries(
      Object.keys(v as object)
        .sort()
        .map((k) => [k, shape((v as Record<string, unknown>)[k], depth - 1)]),
    );
  }
  return typeof v;
}

/** RFC 6238 TOTP (SHA-1, 30 s, 6 digits) for the seeded 2FA user. */
export async function totp(base32Secret: string, at = Date.now()): Promise<string> {
  const { createHmac } = await import("node:crypto");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of base32Secret.replace(/=+$/, "").toUpperCase()) {
    bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  }
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac("sha1", key).update(counter).digest();
  const off = h[h.length - 1]! & 0xf;
  const code = (h.readUInt32BE(off) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, "0");
}

const usedTotpWindows = new Set<number>();
/**
 * A TOTP code from a window not used yet in this run: Odoo rejects re-used codes
 * (totp_last_counter), so consecutive 2FA tests wait for the next 30 s window.
 */
export async function freshTotp(secret: string): Promise<string> {
  let win = Math.floor(Date.now() / 30_000);
  while (usedTotpWindows.has(win)) {
    await new Promise((r) => setTimeout(r, 1000));
    win = Math.floor(Date.now() / 30_000);
  }
  usedTotpWindows.add(win);
  return totp(secret);
}
