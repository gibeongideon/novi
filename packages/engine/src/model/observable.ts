/**
 * Change notification for the headless models (P2.5.5): one version counter and a listener set,
 * so React reads them with `useSyncExternalStore(model.subscribe, () => model.version)`.
 */
export class Observable {
  private readonly listeners = new Set<() => void>();
  /** Increases on every change; React compares it to decide whether to re-render. */
  version = 0;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  protected notify(): void {
    this.version++;
    for (const l of this.listeners) l();
  }
}

/** How the models call Odoo: the engine transport's `call` (a fake in unit tests). */
export type Rpc = <T = unknown>(
  model: string,
  method: string,
  call?: { ids?: number[]; kwargs?: Record<string, unknown> },
) => Promise<T>;
