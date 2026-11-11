import { useAction } from "@novi/engine";
import { Badge, Button, Skeleton, useT } from "@novi/ui";
import { ExternalLink } from "lucide-react";
import { useParams } from "react-router-dom";

/**
 * An Odoo action. Until the view renderers land (P2) this shows what the action is and offers
 * Odoo's own screen (the iframe fallback, P2.14, will embed it instead of linking).
 */
export function ActionPage() {
  const t = useT();
  const actionId = Number(useParams().actionId) || undefined;
  const action = useAction(actionId);

  if (action.isPending) {
    return (
      <div className="grid gap-3 p-6">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
    );
  }
  if (action.isError || !action.data) {
    return (
      <p role="alert" className="p-6 text-danger">
        {(action.error as Error | null)?.message ?? t("noAction")}
      </p>
    );
  }
  const a = action.data;
  return (
    <div className="grid max-w-3xl gap-4 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold">{a.name}</h1>
        <Badge>{a.type}</Badge>
        {a.res_model ? <Badge tone="info">{a.res_model}</Badge> : null}
        {a.tag ? <Badge tone="info">{String(a.tag)}</Badge> : null}
      </div>
      <p className="text-text-muted">{t("nativeViewSoon")}</p>
      <div>
        <Button asChild variant="secondary">
          <a href={`/odoo/action-${a.id}`} target="_blank" rel="noreferrer">
            <ExternalLink aria-hidden />
            {t("openInOdoo")}
          </a>
        </Button>
      </div>
    </div>
  );
}
