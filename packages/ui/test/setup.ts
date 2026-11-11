// jsdom gaps used by Radix primitives
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= RO as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => {};
Element.prototype.hasPointerCapture ??= () => false;

// Testing Library only auto-cleans with vitest globals; do it explicitly
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
afterEach(cleanup);
