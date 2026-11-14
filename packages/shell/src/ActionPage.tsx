import { RecordList, useAction, useActionManager, useListView } from "@novi/engine";
import { Badge, Button, Pager, Skeleton, useT } from "@novi/ui";
import { ListView } from "@novi/views";
import { ExternalLink, Plus } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { ActionMenus } from "./ActionMenus";
import { type Crumb, PageTitle } from "./PageTitle";
import { useActionRunner } from "./useActionRunner";

/** Odoo's help HTML as plain paragraphs (never injected as HTML). */
const helpText = (html: unknown) =>
  typeof html === "string"
    ? html
        .split(/<\/p>|<br\s*\/?>/i)
        .map((p) =>
          p
            .replace(/<[^>]+>/g, "")
            .replace(/&nbsp;/g, " ")
            .replace(/\s+/g, " ")
            .trim(),
        )
        .filter(Boolean)
    : [];

/**
 * An Odoo action. Window actions with a list view render through NOVI's engine (P2.9): pager,
 * sorting, selection with bulk actions (Odoo's toolbar included), groups, empty state. Client
 * actions show Odoo's own screen embedded until NOVI has its own (P2.8.5).
 */
export function ActionPage({ actionId, trail }: { actionId: number | undefined; trail: Crumb[] }) {
  const t = useT();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const action = useAction(actionId);
  const view = useListView(actionId);
  const am = useActionManager();
  const data = view.data;
  const list = data?.list;
  const runner = useActionRunner(() => list?.load());

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

  const openInOdoo = (
    <Button asChild variant="secondary" size="sm">
      <a href={`/odoo/action-${a.id}`} target="_blank" rel="noreferrer">
        <ExternalLink aria-hidden />
        {t("openInOdoo")}
      </a>
    </Button>
  );
  const selected = list?.selectedIds ?? [];
  const canArchive = !!data && "active" in data.schema.fields;
  const bulkContext = { activeModel: data?.action.model, activeIds: selected };

  return (
    <div className="grid gap-4 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <PageTitle trail={trail} title={a.name} />
        {data && data.schema.access.create !== false && !selected.length ? (
          <Button variant="primary" size="sm" onClick={() => navigate(`${pathname}/new${search}`)}>
            <Plus aria-hidden />
            {t("newRecord")}
          </Button>
        ) : null}
        {selected.length && list ? (
          <>
            <Badge tone="info">{t("selectedCount", { n: selected.length })}</Badge>
            <ActionMenus
              count={selected.length}
              canArchive={canArchive}
              toolbar={data!.toolbar}
              onDuplicate={() => void runner.guard(async () => void (await list.duplicateSelected()))}
              onArchive={(archived) =>
                void runner.guard(async () => am.resolve((await list.setArchivedSelected(archived)) as never))
              }
              onDelete={() => void runner.guard(async () => void (await list.deleteSelected()))}
              onToolbar={(item) => void runner.guard(() => am.resolve(item.id, bulkContext))}
            />
          </>
        ) : list instanceof RecordList ? (
          <Pager
            offset={list.offset}
            limit={list.limit}
            total={list.length}
            estimate={list.lengthIsEstimate}
            onPrevious={() => void runner.guard(async () => void (await list.previousPage()))}
            onNext={() => void runner.guard(async () => void (await list.nextPage()))}
          />
        ) : null}
        <span className="ms-auto">{openInOdoo}</span>
      </div>

      {view.isPending ? (
        <div className="grid gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : view.isError ? (
        <p role="alert" className="text-danger">
          {(view.error as Error).message}
        </p>
      ) : data && list ? (
        list instanceof RecordList && list.length === 0 ? (
          <div className="grid justify-items-center gap-2 py-12 text-center text-text-muted">
            {(helpText(a.help).length ? helpText(a.help) : [t("noRecords")]).map((p, i) => (
              <p key={i} className={i === 0 ? "text-base font-medium text-text" : "max-w-md text-sm"}>
                {p}
              </p>
            ))}
          </div>
        ) : (
          <ListView
            schema={data.schema}
            list={list}
            evalContext={data.evalContext}
            storageKey={`${data.action.model}.${data.action.id ?? ""}`}
            onOpen={(rec) =>
              navigate(`${pathname}/${rec.id}${search}`, {
                state: { ids: list instanceof RecordList ? list.records.map((r) => r.id) : [] },
              })
            }
            onButton={(rec, button) => void runner.guard(() => am.executeButton(rec, button))}
          />
        )
      ) : (
        <p className="text-text-muted">{t("nativeViewSoon")}</p>
      )}

      {runner.ui}
    </div>
  );
}
