import { useAction, useListView } from "@novi/engine";
import { Badge, Button, Skeleton, useT } from "@novi/ui";
import { ListView } from "@novi/views";
import { ExternalLink } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

/**
 * An Odoo action. Window actions with a list view render through NOVI's own engine (P2.9 first
 * slice, read-only); everything else offers Odoo's own screen until its renderer exists (the
 * iframe fallback, P2.14, will embed it instead of linking).
 */
export function ActionPage() {
  const t = useT();
  const navigate = useNavigate();
  const actionId = Number(useParams().actionId) || undefined;
  const action = useAction(actionId);
  const list = useListView(actionId);

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
  const openInOdoo = (
    <Button asChild variant="secondary" size="sm">
      <a href={`/odoo/action-${a.id}`} target="_blank" rel="noreferrer">
        <ExternalLink aria-hidden />
        {t("openInOdoo")}
      </a>
    </Button>
  );
  // screens Odoo implements in JavaScript (Discuss, dashboards…): Odoo's own screen, embedded and
  // labelled, until NOVI has its own (client action registry, P2.8.5; iframe host, P2.14)
  if (a.type === "ir.actions.client") {
    const src = `/odoo/action-${a.id}`;
    return (
      <div className="grid h-full grid-rows-[auto_1fr] gap-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">{a.name}</h1>
          <p className="text-sm text-text-muted">{t("classicScreen")}</p>
          <Button asChild variant="secondary" size="sm" className="ms-auto">
            <a href={src} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden />
              {t("openInNewTab")}
            </a>
          </Button>
        </div>
        <iframe
          title={a.name}
          src={src}
          className="h-full min-h-[70vh] w-full rounded-lg border border-border bg-surface"
        />
      </div>
    );
  }
  const data = list.data;
  return (
    <div className="grid gap-4 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold">{a.name}</h1>
        {data ? (
          <Badge>{data.length === 1 ? t("recordCountOne") : t("recordCount", { n: data.length })}</Badge>
        ) : null}
        <span className="ms-auto">{openInOdoo}</span>
      </div>
      {list.isPending ? (
        <div className="grid gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : list.isError ? (
        <p role="alert" className="text-danger">
          {(list.error as Error).message}
        </p>
      ) : data ? (
        <>
          <p className="text-sm text-text-muted">{t("previewNote")}</p>
          <ListView
            schema={data.schema}
            records={data.records}
            evalContext={data.evalContext}
            onOpen={(id) => navigate(`/record/${data.schema.model}/${id}`)}
          />
        </>
      ) : (
        <p className="text-text-muted">{t("nativeViewSoon")}</p>
      )}
    </div>
  );
}
