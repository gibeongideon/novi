/**
 * Field widget registry. Resolution order (COMPONENT-ARCHITECTURE §2):
 *   1. arch `widget="…"` if registered for this field type
 *   2. the default widget registered for the field type
 *   3. the fallback widget, which renders any type from `meta.type`. Never throws.
 * `source` tells the caller which step matched, so it can log misses.
 */
import type { FieldComponent, FieldDefinition } from "./contract.js";

export type ResolutionSource = "widget" | "type" | "fallback";

export interface Resolution {
  component: FieldComponent;
  source: ResolutionSource;
}

export class FieldRegistry {
  private readonly byWidget = new Map<string, FieldDefinition>();
  private readonly byType = new Map<string, FieldDefinition>();
  private fallback: FieldComponent | undefined;

  /** Registers a widget (`widget` set) or the default widget of its types (`widget` omitted). */
  register(def: FieldDefinition): this {
    if (!def.types.length) throw new Error("registerField: `types` must not be empty");
    if (def.widget) {
      if (this.byWidget.has(def.widget)) throw new Error(`Widget "${def.widget}" is already registered`);
      this.byWidget.set(def.widget, def);
      return this;
    }
    for (const t of def.types) {
      if (this.byType.has(t)) throw new Error(`Default widget for type "${t}" is already registered`);
      this.byType.set(t, def);
    }
    return this;
  }

  /** The widget used when nothing else matches (new Odoo types or widgets must never crash a view). */
  setFallback(component: FieldComponent): this {
    this.fallback = component;
    return this;
  }

  resolve(fieldType: string, widget?: string): Resolution {
    const named = widget ? this.byWidget.get(widget) : undefined;
    if (named?.types.includes(fieldType)) return { component: named.component, source: "widget" };
    const byType = this.byType.get(fieldType);
    if (byType) return { component: byType.component, source: "type" };
    if (!this.fallback) throw new Error("FieldRegistry: no fallback widget set");
    return { component: this.fallback, source: "fallback" };
  }

  /** What renders natively, for tools/coverage-scanner/supported.json (P1.17.7). */
  manifest(): { widgets: string[]; fieldTypes: string[] } {
    return { widgets: [...this.byWidget.keys()].sort(), fieldTypes: [...this.byType.keys()].sort() };
  }
}

/** The application-wide registry. Tests create their own `new FieldRegistry()`. */
export const fieldRegistry = new FieldRegistry();

export function registerField(def: FieldDefinition): void {
  fieldRegistry.register(def);
}
