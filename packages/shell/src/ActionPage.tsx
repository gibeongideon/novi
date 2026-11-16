import { RecordList, useAction, useActionManager, useListView } from "@novi/engine";
import type { ListSchema } from "@novi/odoo-meta";
import { Badge, Button, Pager, Skeleton, useT } from "@novi/ui";
import { KanbanView, ListView } from "@novi/views";
import { ExternalLink, LayoutGrid, List, Plus } from "lucide-react";

/** View types NOVI renders itself (P2.9 list, P2.11 kanban); others stay in Odoo for now. */
const NATIVE_VIEWS = ["list", "kanban"] as const;
type NativeView = (typeof NATIVE_VIEWS)[number];
const VIEW_ICON = { list: List, kanban: LayoutGrid } as const;
const VIEW_LABEL = { list: "viewList", kanban: "viewKanban" } as const;
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

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
  const [params, setParams] = useSearchParams();
  const action = useAction(actionId);
  // the views NOVI shows natively, in the action's order; `?view=` keeps the user's choice
  const offered = (action.data?.views ?? [])
    .map(([, type]) => type)
    .filter((type): type is NativeView => (NATIVE_VIEWS as readonly string[]).includes(type));
  const requested = params.get("view") as NativeView | null;
  const viewType = requested && offered.includes(requested) ? requested : (offered[0] ?? "list");
  const view = useListView(action.data ? actionId : undefined, viewType);
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
        ) : list instanceof RecordList && viewType === "list" ? (
          <Pager
            offset={list.offset}
            limit={list.limit}
            total={list.length}
            estimate={list.lengthIsEstimate}
            onPrevious={() => void runner.guard(async () => void (await list.previousPage()))}
            onNext={() => void runner.guard(async () => void (await list.nextPage()))}
          />
        ) : null}
        <span className="ms-auto flex items-center gap-2">
          {offered.length > 1 ? (
            <span role="group" aria-label={t("views")} className="flex rounded-md border border-border">
              {offered.map((type) => {
                const Icon = VIEW_ICON[type];
                return (
                  <Button
                    key={type}
                    variant={type === viewType ? "secondary" : "ghost"}
                    size="icon"
                    aria-label={t(VIEW_LABEL[type])}
                    aria-pressed={type === viewType}
                    onClick={() =>
                      setParams((p) => {
                        p.set("view", type);
                        return p;
                      })
                    }
                  >
                    <Icon aria-hidden />
                  </Button>
                );
              })}
            </span>
          ) : null}
          {openInOdoo}
        </span>
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
        ) : data.schema.viewType === "kanban" ? (
          <KanbanView
            schema={data.schema}
            list={list}
            evalContext={data.evalContext}
            onOpen={(rec) => navigate(`${pathname}/${rec.id}${search}`)}
            onButton={(rec, button) => void runner.guard(() => am.executeButton(rec, button))}
            onError={(e) => void runner.guard(() => Promise.reject(e))}
          />
        ) : (
          <ListView
            schema={data.schema as ListSchema}
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
