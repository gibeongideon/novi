import { randomBytes } from "node:crypto";

/**
 * Logins that passed the password step and wait for their 2FA code. Held server-side (the browser
 * only gets an opaque challenge id), single use, expiring, and capped so it can't grow unbounded.
 */
export class PendingLogins<T> {
  private readonly items = new Map<string, { value: T; expires: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly max = 10_000,
    private readonly now: () => number = Date.now,
  ) {}

  add(value: T): string {
    this.sweep();
    if (this.items.size >= this.max) this.items.delete(this.items.keys().next().value!);
    const id = randomBytes(24).toString("base64url");
    this.items.set(id, { value, expires: this.now() + this.ttlMs });
    return id;
  }

  /** Returns and removes the pending login (single use), or undefined if unknown/expired. */
  take(id: string): T | undefined {
    const item = this.items.get(id);
    this.items.delete(id);
    return item && item.expires > this.now() ? item.value : undefined;
  }

  get size(): number {
    this.sweep();
    return this.items.size;
  }

  private sweep(): void {
    const t = this.now();
    for (const [k, v] of this.items) if (v.expires <= t) this.items.delete(k);
  }
}
