/**
 * ActionManager (P2.8): turns any Odoo action into a plain descriptor the shell knows how to show,
 * and runs buttons. Headless: no React, no router.
 *   window       ir.actions.act_window: open a view (current, dialog, fullscreen), domain/context evaluated
 *   url          ir.actions.act_url: open a link (new tab / same tab)
 *   report       ir.actions.report: a PDF/HTML/text URL to preview or download
 *   client       ir.actions.client: NOVI's own screen for the tag, else Odoo's screen embedded
 *   notification Odoo's `display_notification` client action, with the action to run after
 *   reload       Odoo's `soft_reload` (the screen), `reload` / `reload_context` (`full`: the app)
 *   close        ir.actions.act_window_close: close the dialog, reload what opened it
 *   none         nothing to do (a button returned False)
 * Server actions run on the server; whatever they return is resolved in turn.
 */
import {
  AccessDenied,
  AccessError,
  MissingError,
  NetworkError,
  type OdooContext,
  OdooError,
  RedirectWarning,
  SessionExpiredError,
  UserError,
  ValidationError,
} from "@novi/odoo-client";
import { Domain, type EvalContext, evaluate, type PyValue } from "@novi/odoo-expr";
import type { ButtonNode } from "@novi/odoo-meta";

import type { OdooRecord } from "./model/record.js";

export type RawAction = Record<string, unknown> & { type?: string; id?: number };

export interface WindowAction {
  id?: number;
  name: string;
  model: string;
  /** Open this record (form) instead of a list. */
  resId?: number;
  views: [number | false, string][];
  /** The action's search view (filters, group-bys, defaults). */
  searchViewId: number | false;
  /** First view type to show. */
  viewType: string;
  domain: PyValue[];
  context: OdooContext;
  /** current: the main area; new: a dialog (wizards); fullscreen/main: the main area without the dialog stack. */
  target: "current" | "new" | "fullscreen" | "main";
  limit?: number;
}

export type ActionDescriptor =
  | { kind: "window"; action: WindowAction }
  | { kind: "url"; url: string; target: "new" | "self" | "download" }
  | { kind: "report"; url: string; reportType: string; name: string }
  | { kind: "client"; tag: string; params: Record<string, unknown>; fallbackUrl?: string }
  | {
      kind: "notification";
      title?: string;
      message: string;
      type: string;
      sticky: boolean;
      next?: ActionDescriptor;
    }
  | { kind: "reload"; full?: boolean }
  | { kind: "close"; infos?: unknown }
  | { kind: "none" };

/** What the manager needs from the transport (the engine's session transport implements it). */
export interface ActionTransport {
  loadAction<T = RawAction>(actionId: number | string, context?: OdooContext): Promise<T>;
  runAction<T = unknown>(actionId: number | string, context?: OdooContext): Promise<T>;
  callButton<T = unknown>(model: string, method: string, ids: number[], context?: OdooContext): Promise<T>;
}

export interface ResolveOptions {
  /** The record the action is run from (Odoo's active_id / active_ids / active_model). */
  activeModel?: string;
  activeIds?: number[];
  /** Extra context (a button's context, evaluated). */
  context?: OdooContext;
}

export class ActionManager {
  constructor(
    private readonly transport: ActionTransport,
    /** User context + uid + companies (engine `baseEvalContext`). */
    private readonly base: () => EvalContext,
  ) {}

  private contextFor(opts: ResolveOptions): OdooContext {
    const user = (this.base().context ?? {}) as OdooContext;
    const active: OdooContext = opts.activeIds?.length
      ? { active_id: opts.activeIds[0], active_ids: opts.activeIds, active_model: opts.activeModel }
      : {};
    return { ...user, ...active, ...opts.context };
  }

  /** Any action: an id or xmlid (loaded), an action dict (from a button or a server action), or False. */
  async resolve(
    action: number | string | RawAction | boolean | null | undefined,
    opts: ResolveOptions = {},
  ): Promise<ActionDescriptor> {
    if (action === false || action === null || action === undefined || action === true)
      return { kind: "none" };
    const context = this.contextFor(opts);
    const raw =
      typeof action === "object" ? action : await this.transport.loadAction<RawAction>(action, context);
    switch (raw.type) {
      case "ir.actions.act_window":
        return { kind: "window", action: this.windowAction(raw, context) };
      case "ir.actions.server": {
        const next = await this.transport.runAction<RawAction | false>(raw.id!, {
          ...context,
          ...asContext(raw.context, this.evalContext(context)),
        });
        return this.resolve(next, opts);
      }
      case "ir.actions.report":
        return this.report(raw, context);
      case "ir.actions.act_url": {
        const target = raw.target === "self" ? "self" : raw.target === "download" ? "download" : "new";
        return { kind: "url", url: String(raw.url), target };
      }
      case "ir.actions.client":
        return this.client(raw, opts);
      case "ir.actions.act_window_close":
        return { kind: "close", infos: raw.infos };
      default:
        throw new Error(`Unknown action type ${String(raw.type)}`);
    }
  }

  /**
   * Runs a button of a view on a record (P2.8.7): saves the record first (as Odoo does), then calls
   * the model method (`type="object"`) or resolves the action (`type="action"`), with the button's
   * context evaluated on the record. The record is reloaded unless a new screen opens. Asking for
   * confirmation (`button.confirm`) is the screen's job before calling this.
   */
  /** The signed-in user's preferences: Odoo's own form (`res.users.action_get`), as a dialog (P2.10.9). */
  async preferences(): Promise<ActionDescriptor> {
    const uid = Number(this.base().uid) || 0;
    const raw = await this.transport.callButton<RawAction>(
      "res.users",
      "action_get",
      [uid],
      this.contextFor({}),
    );
    return this.resolve({ ...raw, res_id: uid });
  }

  async executeButton(record: OdooRecord, button: ButtonNode): Promise<ActionDescriptor> {
    if (button.special === "cancel") return { kind: "close" };
    if (!(await record.save())) throw new InvalidRecordError(record.invalidFields());
    if (button.special === "save") return { kind: "close" };
    const ctx = button.context ? asContext(button.context, record.evalContext()) : {};
    const opts = { activeModel: record.config.model, activeIds: [record.id!], context: ctx };
    let result: ActionDescriptor;
    if (button.kind === "object" && button.name) {
      const raw = await this.transport.callButton<RawAction | false>(
        record.config.model,
        button.name,
        [record.id!],
        {
          ...this.contextFor({}),
          ...record.config.context,
          ...ctx,
        },
      );
      result = await this.resolve(raw, opts);
    } else if (button.kind === "action" && button.name) {
      result = await this.resolve(/^\d+$/.test(button.name) ? Number(button.name) : button.name, opts);
    } else result = { kind: "none" };
    if (result.kind !== "window" || result.action.target === "new") await record.reload();
    return result;
  }

  private evalContext(context: OdooContext): EvalContext {
    const active = Object.fromEntries(
      ["active_id", "active_ids", "active_model"].filter((k) => k in context).map((k) => [k, context[k]]),
    );
    return { ...this.base(), ...active, context: context as never } as EvalContext;
  }

  private windowAction(raw: RawAction, context: OdooContext): WindowAction {
    const ctx = { ...context, ...asContext(raw.context, this.evalContext(context)) };
    const evalCtx = this.evalContext(ctx);
    const views = ((raw.views as [number | false, string][] | undefined) ?? []).filter(
      ([, t]) => t !== "search",
    );
    const resId = typeof raw.res_id === "number" && raw.res_id ? raw.res_id : undefined;
    const viewType = resId ? "form" : (views[0]?.[1] ?? "list");
    const target =
      raw.target === "new" || raw.target === "fullscreen" || raw.target === "main" ? raw.target : "current";
    return {
      id: typeof raw.id === "number" ? raw.id : undefined,
      name: String(raw.name ?? ""),
      model: String(raw.res_model),
      resId,
      views: views.length ? views : [[false, viewType]],
      searchViewId: Array.isArray(raw.search_view_id)
        ? (raw.search_view_id[0] as number)
        : typeof raw.search_view_id === "number"
          ? raw.search_view_id
          : false,
      viewType,
      domain: Domain.parse(
        ((raw.domain as string | PyValue[] | false) || []) as string | PyValue[],
        evalCtx,
      ).toList(),
      context: ctx,
      target,
      limit: typeof raw.limit === "number" ? raw.limit : undefined,
    };
  }

  private report(raw: RawAction, context: OdooContext): ActionDescriptor {
    const reportType = String(raw.report_type ?? "qweb-pdf");
    const name = String(raw.report_name);
    const ids = ((raw.context as OdooContext | undefined)?.active_ids ??
      context.active_ids ??
      []) as number[];
    const kind = reportType === "qweb-html" ? "html" : reportType === "qweb-text" ? "text" : "pdf";
    const data = raw.data ? `?options=${encodeURIComponent(JSON.stringify(raw.data))}` : "";
    return {
      kind: "report",
      url: `/report/${kind}/${name}${ids.length ? `/${ids.join(",")}` : ""}${data}`,
      reportType,
      name: String(raw.name ?? name),
    };
  }

  private async client(raw: RawAction, opts: ResolveOptions): Promise<ActionDescriptor> {
    const tag = String(raw.tag);
    const params = (raw.params as Record<string, unknown> | undefined) ?? {};
    if (tag === "display_notification") {
      return {
        kind: "notification",
        title: params.title as string | undefined,
        message: String(params.message ?? ""),
        type: String(params.type ?? "info"),
        sticky: !!params.sticky,
        next: params.next ? await this.resolve(params.next as RawAction, opts) : undefined,
      };
    }
    if (tag === "soft_reload") return { kind: "reload" };
    // the user's language or companies changed: the whole app starts again (Odoo's client too)
    if (tag === "reload" || tag === "reload_context") return { kind: "reload", full: true };
    return {
      kind: "client",
      tag,
      params,
      fallbackUrl: typeof raw.id === "number" ? `/odoo/action-${raw.id}` : undefined,
    };
  }
}

/** A button couldn't run because the record isn't valid yet (required values missing). */
export class InvalidRecordError extends Error {
  constructor(readonly fields: string[]) {
    super(`Required values missing: ${fields.join(", ")}`);
    this.name = "InvalidRecordError";
  }
}

/** A context as Odoo writes it (Python dict text or a dict), evaluated; {} when it can't be. */
function asContext(value: unknown, ctx: EvalContext): OdooContext {
  if (value && typeof value === "object") return value as OdooContext;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const v = evaluate(value, ctx);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as OdooContext) : {};
  } catch {
    return {};
  }
}

/** What the error dialog shows for an error raised by a user action (P2.8.9). */
export interface ErrorInfo {
  /** Picks the dialog's title (translated by the UI). */
  kind: "user" | "validation" | "access" | "missing" | "invalid" | "session" | "network" | "internal";
  /** Odoo's own message, as sent (already in the user's language). */
  message: string;
  /** RedirectWarning: the button that opens Odoo's suggested action. */
  redirect?: { action: unknown; buttonText?: string; context?: OdooContext };
  /** Server traceback, for "technical details" on internal errors. */
  debug?: string;
}

export function describeError(err: unknown): ErrorInfo {
  if (err instanceof InvalidRecordError) return { kind: "invalid", message: err.fields.join(", ") };
  if (err instanceof RedirectWarning)
    return {
      kind: "user",
      message: err.message,
      redirect: { action: err.action, buttonText: err.buttonText, context: err.additionalContext },
    };
  if (err instanceof ValidationError) return { kind: "validation", message: err.message };
  if (err instanceof AccessError || err instanceof AccessDenied)
    return { kind: "access", message: err.message };
  if (err instanceof MissingError) return { kind: "missing", message: err.message };
  if (err instanceof UserError) return { kind: "user", message: err.message };
  if (err instanceof SessionExpiredError) return { kind: "session", message: err.message };
  if (err instanceof NetworkError) return { kind: "network", message: err.message };
  if (err instanceof OdooError) return { kind: "internal", message: err.message, debug: err.debug };
  return { kind: "internal", message: err instanceof Error ? err.message : String(err) };
}

/** One step of the action stack (breadcrumbs, P2.8.8): an action, optionally one of its records. */
export interface StackEntry {
  action: number | string;
  resId?: number | "new";
}

/** `[{action: 12, resId: 42}, {action: 30}]` → `/action/12/42/action/30` (restorable on reload). */
export function encodeStack(entries: StackEntry[]): string {
  return entries
    .map(
      (e) => `/action/${encodeURIComponent(String(e.action))}${e.resId !== undefined ? `/${e.resId}` : ""}`,
    )
    .join("");
}

/** The inverse of `encodeStack`; unknown segments are ignored. */
export function decodeStack(path: string): StackEntry[] {
  const parts = path.split("/").filter(Boolean);
  const out: StackEntry[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] !== "action" || parts[i + 1] === undefined) continue;
    const raw = decodeURIComponent(parts[++i]!);
    const entry: StackEntry = { action: /^\d+$/.test(raw) ? Number(raw) : raw };
    const next = parts[i + 1];
    if (next === "new" || (next && /^\d+$/.test(next))) {
      entry.resId = next === "new" ? "new" : Number(next);
      i++;
    }
    out.push(entry);
  }
  return out;
}
