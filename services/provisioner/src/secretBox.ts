/**
 * Encrypts the admin password chosen at sign-up while it waits for email verification and
 * provisioning (AES-256-GCM). The key comes from PLATFORM_SECRET (base64, 32 bytes) in production;
 * locally a key is generated once into .cache/platform/secret (mode 600).
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function loadKey(env: NodeJS.ProcessEnv, devKeyFile: string): Buffer {
  if (env.PLATFORM_SECRET) {
    const key = Buffer.from(env.PLATFORM_SECRET, "base64");
    if (key.length !== 32) throw new Error("PLATFORM_SECRET must be 32 bytes, base64-encoded");
    return key;
  }
  if (env.NODE_ENV === "production") throw new Error("PLATFORM_SECRET is required in production");
  if (!existsSync(devKeyFile)) {
    mkdirSync(dirname(devKeyFile), { recursive: true });
    writeFileSync(devKeyFile, randomBytes(32).toString("base64"), { mode: 0o600 });
  }
  return Buffer.from(readFileSync(devKeyFile, "utf8").trim(), "base64");
}

export function seal(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

export function open(sealed: string, key: Buffer): string {
  const [iv, tag, data] = sealed.split(".").map((p) => Buffer.from(p, "base64"));
  const d = createDecipheriv("aes-256-gcm", key, iv!);
  d.setAuthTag(tag!);
  return Buffer.concat([d.update(data!), d.final()]).toString("utf8");
}
