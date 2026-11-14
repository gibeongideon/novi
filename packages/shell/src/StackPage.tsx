import { decodeStack, encodeStack, useStackLabels, useWindowAction } from "@novi/engine";
import { useT } from "@novi/ui";
import { useLocation } from "react-router-dom";

import { ActionPage } from "./ActionPage";
import { FormPage } from "./FormPage";
import type { Crumb } from "./PageTitle";

/**
 * An action stack from the URL (P2.10.12): `/action/12/42/action/30` is the list of action 12,
 * its record 42, then action 30 opened from it. The last entry is shown; the others are the
 * breadcrumbs, restored on reload.
 */
export function StackPage() {
  const t = useT();
  const { pathname, search } = useLocation();
  const stack = decodeStack(pathname);
  const labels = useStackLabels(stack);
  const last = stack.at(-1);
  const action = useWindowAction(last?.resId === undefined ? last?.action : undefined);
  if (!last) return null;
  // a record entry sits on its action's list (`/action/12/42` → Quotations › S00042)
  const trail: Crumb[] = stack.flatMap((e, i) => {
    const out: Crumb[] = [];
    const listTo = `${encodeStack([...stack.slice(0, i), { action: e.action }])}${search}`;
    if (e.resId !== undefined || i < stack.length - 1)
      out.push({ label: labels[i]?.action ?? "…", to: listTo });
    if (e.resId !== undefined && i < stack.length - 1)
      out.push({
        label: e.resId === "new" ? t("newRecord") : (labels[i]?.record ?? "…"),
        to: `${encodeStack(stack.slice(0, i + 1))}${search}`,
      });
    return out;
  });
  // an action without a list (settings, a record to edit) opens its form directly
  const a = action.data;
  const base = encodeStack([...stack.slice(0, -1), { action: last.action }]);
  const formOnly = a && !a.views.some(([, type]) => type === "list");
  if (last.resId === undefined && formOnly)
    return (
      <FormPage key={pathname} actionId={last.action} resId={a.resId ?? "new"} trail={trail} base={base} />
    );
  return last.resId === undefined ? (
    <ActionPage key={pathname} actionId={Number(last.action) || undefined} trail={trail} />
  ) : (
    <FormPage key={pathname} actionId={last.action} resId={last.resId} trail={trail} base={base} />
  );
}
