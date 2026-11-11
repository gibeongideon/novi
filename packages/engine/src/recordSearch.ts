/**
 * Record search for the global palette (P1.13.2). Odoo does the matching and the access rules
 * (`web_name_search`); group headings use Odoo's own model names (ir.model), never NOVI text.
 * Models that aren't installed or that the user can't read are skipped silently.
 */

/** Business records people look up by name, most useful first (Musk step 2: not every model). */
export const SEARCHABLE_MODELS = [
  "res.partner",
  "sale.order",
  "account.move",
  "crm.lead",
  "purchase.order",
  "product.template",
  "hr.employee",
] as const;

export interface RecordHit {
  model: string;
  id: number;
  name: string;
}

export interface RecordGroup {
  model: string;
  /** Odoo's model description (e.g. "Contact", "Sales Order"). */
  label: string;
  hits: RecordHit[];
}

/** Minimal ORM surface needed (JsonRpcTransport satisfies it). */
export interface SearchTransport {
  call<T = unknown>(
    model: string,
    method: string,
    call?: { ids?: number[]; kwargs?: Record<string, unknown> },
  ): Promise<T>;
}

export async function modelLabels(
  t: SearchTransport,
  models: readonly string[],
): Promise<Record<string, string>> {
  const rows = await t.call<{ model: string; name: string }[]>("ir.model", "search_read", {
    kwargs: { domain: [["model", "in", [...models]]], fields: ["model", "name"] },
  });
  return Object.fromEntries(rows.map((r) => [r.model, r.name]));
}

export async function searchRecords(
  t: SearchTransport,
  query: string,
  labels: Record<string, string>,
  limit = 5,
): Promise<RecordGroup[]> {
  const models = SEARCHABLE_MODELS.filter((m) => labels[m]); // installed models only
  const results = await Promise.allSettled(
    models.map((model) =>
      t.call<{ id: number; display_name: string }[]>(model, "web_name_search", {
        kwargs: { name: query, specification: { display_name: {} }, limit },
      }),
    ),
  );
  return results.flatMap((r, i) => {
    const model = models[i]!;
    if (r.status !== "fulfilled" || !r.value.length) return []; // no access / nothing found
    return [
      { model, label: labels[model]!, hits: r.value.map((v) => ({ model, id: v.id, name: v.display_name })) },
    ];
  });
}
