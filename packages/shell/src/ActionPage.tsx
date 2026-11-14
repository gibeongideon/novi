import { RecordList, useAction, useActionManager, useListView } from "@novi/engine";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Pager,
  Skeleton,
  useT,
} from "@novi/ui";
import { ListView } from "@novi/views";
import { ChevronDown, ExternalLink, Printer } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { ErrorDialog } from "./ErrorDialog";
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
export function ActionPage() {
  const t = useT();
  const navigate = useNavigate();
  const actionId = Number(useParams().actionId) || undefined;
  const action = useAction(actionId);
  const view = useListView(actionId);
  const am = useActionManager();
  const data = view.data;
  const list = data?.list;
  const runner = useActionRunner(() => list?.load());
  const [confirmDelete, setConfirmDelete] = useState(false);

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
        <h1 className="text-2xl font-semibold">{a.name}</h1>
        {selected.length && list ? (
          <>
            <Badge tone="info">{t("selectedCount", { n: selected.length })}</Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm">
                  {t("actions")}
                  <ChevronDown aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  onSelect={() => void runner.guard(async () => void (await list.duplicateSelected()))}
                >
                  {t("duplicate")}
                </DropdownMenuItem>
                {canArchive ? (
                  <>
                    <DropdownMenuItem
                      onSelect={() =>
                        void runner.guard(async () =>
                          am.resolve((await list.setArchivedSelected(true)) as never),
                        )
                      }
                    >
                      {t("archive")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() =>
                        void runner.guard(async () =>
                          am.resolve((await list.setArchivedSelected(false)) as never),
                        )
                      }
                    >
                      {t("unarchive")}
                    </DropdownMenuItem>
                  </>
                ) : null}
                <DropdownMenuItem className="text-danger" onSelect={() => setConfirmDelete(true)}>
                  {t("delete")}
                </DropdownMenuItem>
                {data!.toolbar.action.length ? <DropdownMenuSeparator /> : null}
                {data!.toolbar.action.map((item) => (
                  <DropdownMenuItem
                    key={item.id}
                    onSelect={() => void runner.guard(() => am.resolve(item.id, bulkContext))}
                  >
                    {item.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {data!.toolbar.print.length ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="sm" aria-label={t("print")}>
                    <Printer aria-hidden />
                    <ChevronDown aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {data!.toolbar.print.map((item) => (
                    <DropdownMenuItem
                      key={item.id}
                      onSelect={() => void runner.guard(() => am.resolve(item.id, bulkContext))}
                    >
                      {item.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
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
            onOpen={(rec) => navigate(`/record/${data.schema.model}/${rec.id}`)}
            onButton={(rec, button) => void runner.guard(() => am.executeButton(rec, button))}
          />
        )
      ) : (
        <p className="text-text-muted">{t("nativeViewSoon")}</p>
      )}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent size="sm">
          <DialogTitle>{t("deleteConfirmTitle", { n: selected.length })}</DialogTitle>
          <DialogDescription>{t("deleteConfirmBody")}</DialogDescription>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              {t("cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmDelete(false);
                void runner.guard(async () => void (await list?.deleteSelected()));
              }}
            >
              {t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ErrorDialog
        error={runner.error}
        onClose={runner.clearError}
        onRedirect={(target) => void runner.guard(() => am.resolve(target as never))}
      />
    </div>
  );
}
