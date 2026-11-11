/**
 * L5 override registry (COMPONENT-ARCHITECTURE §2). Bespoke screens are registered, never wired
 * into renderers with `if (model === …)`. Prefer the smallest unit: a slot before a whole view.
 *
 *   registerOverride({ model: "crm.lead", view: "kanban", component: PipelineBoard, reason, owner });
 *   registerOverride({ model: "sale.order", view: "form", slot: "order_line", component: QuoteLines, reason, owner });
 *
 * Matching is most-specific-first: an override bound to an action beats a model-wide one.
 */
import type { ViewType } from "@novi/odoo-meta";
import type { ComponentType } from "react";

export interface OverrideTarget {
  model: string;
  view: ViewType;
  /** Restrict to one action (xml id like "crm.crm_lead_action_pipeline", or numeric id). */
  action?: string | number;
  /** Replace only one part of the view: a field name or a named arch node. */
  slot?: string;
}

export interface OverrideDefinition<P = unknown> extends OverrideTarget {
  component: ComponentType<P>;
  /** Why the generic renderer is not enough (UI-RULES §0.3). */
  reason: string;
  /** Person who owns this requirement (UI-RULES §0b: every requirement has a named owner). */
  owner: string;
}

export interface OverrideQuery {
  model: string;
  view: ViewType;
  action?: string | number;
}

const keyOf = (t: OverrideTarget) => `${t.model}|${t.view}|${t.action ?? "*"}|${t.slot ?? "*"}`;

export class OverrideRegistry {
  private readonly items = new Map<string, OverrideDefinition>();

  register<P>(def: OverrideDefinition<P>): this {
    if (!def.reason?.trim() || !def.owner?.trim()) {
      throw new Error(`Override for ${def.model}/${def.view} needs a reason and an owner`);
    }
    const key = keyOf(def);
    if (this.items.has(key)) throw new Error(`Override already registered for ${key}`);
    this.items.set(key, def as OverrideDefinition);
    return this;
  }

  /** Whole-view override for this model/view/action, if any. */
  view(q: OverrideQuery): OverrideDefinition | undefined {
    return this.lookup(q, undefined);
  }

  /** Slot override (e.g. one field or arch node), if any. */
  slot(q: OverrideQuery, slot: string): OverrideDefinition | undefined {
    return this.lookup(q, slot);
  }

  private lookup(q: OverrideQuery, slot: string | undefined): OverrideDefinition | undefined {
    const base = { model: q.model, view: q.view, slot };
    if (q.action !== undefined) {
      const specific = this.items.get(keyOf({ ...base, action: q.action }));
      if (specific) return specific;
    }
    return this.items.get(keyOf(base));
  }
}

export const overrideRegistry = new OverrideRegistry();

export function registerOverride<P>(def: OverrideDefinition<P>): void {
  overrideRegistry.register(def);
}
