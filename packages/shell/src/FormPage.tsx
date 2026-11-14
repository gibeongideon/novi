import {
  type FormTarget,
  useActionManager,
  useFormView,
  useLeaveGuard,
  useModel,
  useWindowAction,
} from "@novi/engine";
import type { ButtonNode } from "@novi/odoo-meta";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  Pager,
  Skeleton,
  toast,
  useT,
} from "@novi/ui";
import { FormView } from "@novi/views";
import { ExternalLink } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useBlocker, useLocation, useNavigate } from "react-router-dom";

import { ActionMenus } from "./ActionMenus";
import { OnchangeWarningDialog, useOnchangeWarnings } from "./OnchangeWarning";
import { type Crumb, PageTitle } from "./PageTitle";
import { rememberRecent } from "./recent";
import { useActionRunner } from "./useActionRunner";

/** Records the list showed when one was opened (record pager, P2.10.7). */
interface PagerState {
  ids?: number[];
}

/**
 * One record in the generic form view (P2.10): always editable, with a save/discard bar while
 * there are changes. Leaving by any in-app way saves first, as Odoo's client does (P2.10.6);
 * closing the tab asks first.
 */
export function FormPage({
  actionId,
  model,
  resId,
  trail,
  base,
}: {
  /** The action the record was opened from (its form view and context), if any. */
  actionId?: number | string;
  model?: string;
  resId: number | "new";
  trail: Crumb[];
  /** The URL a record id is appended to (`/action/12`, `/record/res.partner`). */
  base: string;
}) {
  const t = useT();
  const navigate = useNavigate();
  const { search, state } = useLocation();
  const am = useActionManager();
  const action = useWindowAction(actionId);
  const warnings = useOnchangeWarnings();
  const [showErrors, setShowErrors] = useState(false);
  const [confirm, setConfirm] = useState<ButtonNode | null>(null);

  const a = action.data;
  const target: FormTarget | undefined =
    actionId !== undefined
      ? a
        ? {
            model: a.model,
            viewId: a.views.find(([, type]) => type === "form")?.[0] ?? false,
            resId: resId === "new" ? undefined : resId,
            context: a.context,
            actionId: a.id,
          }
        : undefined
      : model
        ? { model, resId: resId === "new" ? undefined : resId }
        : undefined;
  const form = useFormView(target, warnings.show);
  const record = useModel(form.data?.record);
  const runner = useActionRunner(() => record?.reload());
  useLeaveGuard(!!record?.touched);
  // leaving by any way (menu, palette, breadcrumbs, pager, back button) saves first, as Odoo does;
  // when Odoo or the required fields refuse, the user stays on the record
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !!record?.touched && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => setShowErrors(false), [record]);

  const back = trail.at(-1)?.to ?? "/";
  const savedName = record && !record.isNew ? String(record.values.display_name ?? "") : "";
  useEffect(() => {
    if (record?.id && savedName) rememberRecent({ url: `${base}/${record.id}${search}`, label: savedName });
  }, [record?.id, savedName, base, search]);

  /** Saves; a new record's URL then gets its id (unless the user is leaving anyway). */
  const save = useCallback(
    async (relocate = true): Promise<boolean> => {
      if (!record) return false;
      (document.activeElement as HTMLElement | null)?.blur?.(); // the field being typed in commits first
      try {
        const wasNew = record.isNew;
        const ok = await record.save();
        if (!ok) {
          setShowErrors(true);
          const names = record.invalidFields().map((n) => record.fields[n]?.string ?? n);
          toast.error(t("invalidFields", { names: names.join(", ") }));
          return false;
        }
        setShowErrors(false);
        if (wasNew && relocate) navigate(`${base}/${record.id}${search}`, { replace: true, state });
        return true;
      } catch (e) {
        await runner.guard(() => Promise.reject(e));
        return false;
      }
    },
    [record, navigate, base, search, state, t, runner],
  );

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    void save(false).then((ok) => (ok ? blocker.proceed() : blocker.reset()));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per blocked navigation
  }, [blocker.state]);

  const press = (button: ButtonNode) => {
    if (button.confirm && !confirm) return setConfirm(button);
    setConfirm(null);
    if (record?.invalidFields().length) setShowErrors(true);
    void runner.guard(() => am.executeButton(record!, button));
  };

  if (actionId !== undefined && action.isSuccess && !a) {
    // not a window action (a screen Odoo draws in JavaScript): no form to show
    return (
      <p role="alert" className="p-6 text-danger">
        {t("noAction")}
      </p>
    );
  }
  if (form.isError || action.isError) {
    return (
      <p role="alert" className="p-6 text-danger">
        {((form.error ?? action.error) as Error).message}
      </p>
    );
  }
  if (!record) {
    return (
      <div className="grid gap-4 p-6">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const ids = (state as PagerState | null)?.ids ?? [];
  const at = record.id ? ids.indexOf(record.id) : -1;
  const sibling = (step: number) => ids[(at + step + ids.length) % ids.length];
  const title = record.isNew ? t("newRecord") : String(record.values.display_name ?? "");
  const canArchive = "active" in record.fields;

  return (
    <div className="grid gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <PageTitle trail={trail} title={title} />
        {record.dirty || record.isNew ? (
          <>
            <Badge tone="warning">{t("unsaved")}</Badge>
            <Button variant="primary" size="sm" onClick={() => void save()}>
              {t("save")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                record.discard(); // nothing left to save: leaving isn't held
                if (record.isNew) return navigate(back);
                setShowErrors(false);
              }}
            >
              {t("discard")}
            </Button>
          </>
        ) : null}
        {!record.isNew ? (
          <ActionMenus
            count={1}
            canArchive={canArchive}
            toolbar={form.data!.toolbar}
            onDuplicate={() =>
              void runner.guard(async () => {
                if (!(await save())) return;
                navigate(`${base}/${await record.duplicate()}${search}`, { state });
              })
            }
            onArchive={(archived) =>
              void runner.guard(async () => am.resolve((await record.setArchived(archived)) as never))
            }
            onDelete={() =>
              void runner.guard(async () => {
                await record.delete();
                record.discard();
                navigate(back);
              })
            }
            onToolbar={(item) =>
              void runner.guard(async () => {
                if (!(await save())) return;
                return am.resolve(item.id, { activeModel: record.config.model, activeIds: [record.id!] });
              })
            }
          />
        ) : null}
        <span className="ms-auto flex items-center gap-2">
          {at >= 0 && ids.length > 1 ? (
            <Pager
              offset={at}
              limit={1}
              total={ids.length}
              onPrevious={() => navigate(`${base}/${sibling(-1)}${search}`, { state })}
              onNext={() => navigate(`${base}/${sibling(1)}${search}`, { state })}
            />
          ) : null}
        </span>
      </div>

      <FormView
        record={record}
        onButton={press}
        onSave={() => void save()}
        showErrors={showErrors}
        chatter={record.id ? <ChatterSlot model={record.config.model} id={record.id} /> : undefined}
      />

      <Dialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent size="sm">
          <DialogTitle>{confirm?.string ?? t("confirm")}</DialogTitle>
          <DialogDescription>{confirm?.confirm}</DialogDescription>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              {t("cancel")}
            </Button>
            <Button variant="primary" onClick={() => confirm && press(confirm)}>
              {t("ok")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <OnchangeWarningDialog {...warnings} />
      {runner.ui}
    </div>
  );
}

/** Where the chatter will live (P3.7); until then, the record's discussion in Odoo. */
function ChatterSlot({ model, id }: { model: string; id: number }) {
  const t = useT();
  return (
    <section className="grid gap-2 rounded-lg border border-border bg-surface p-4">
      <h2 className="font-semibold">{t("discussion")}</h2>
      <p className="text-sm text-text-muted">{t("discussionSoon")}</p>
      <div>
        <Button asChild variant="secondary" size="sm">
          <a href={`/odoo/${model}/${id}`} target="_blank" rel="noreferrer">
            <ExternalLink aria-hidden />
            {t("openInOdoo")}
          </a>
        </Button>
      </div>
    </section>
  );
}
