/** In-memory sliding-window limit per key (client IP). One gateway process (D-28); fine until there are more. */
export function rateLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  /** Records an attempt; false when the key is over its limit. */
  return (key: string): boolean => {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) return false;
    hits.set(key, [...recent, now]);
    return true;
  };
}
