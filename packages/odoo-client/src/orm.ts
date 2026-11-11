/**
 * Typed helpers over any OrmTransport for the `web_*` methods the engine relies on
 * (signatures from odoo/addons/web/models/models.py in Odoo 20).
 */
import type { CallOptions, OdooContext, OrmTransport } from "./types.js";

export type Domain = unknown[];
/** Field specification for web_read / web_search_read: { field: {} | { fields: {...}, limit?, order?, context? } } */
export type Specification = Record<string, FieldSpec>;
export interface FieldSpec {
  fields?: Specification;
  limit?: number;
  order?: string;
  context?: OdooContext;
}
export type RecordValues = Record<string, unknown> & { id?: number };

export interface WebSearchReadParams {
  domain?: Domain;
  specification: Specification;
  offset?: number;
  limit?: number;
  order?: string;
  countLimit?: number;
  context?: OdooContext;
}

export interface WebSearchReadResult<R = RecordValues> {
  length: number;
  records: R[];
}

export interface OnchangeResult {
  value: Record<string, unknown>;
  warning?: { title?: string; message?: string; type?: string } | false;
}

export interface GetViewsResult {
  views: Record<string, { arch: string; id: number | false; model?: string; [k: string]: unknown }>;
  models: Record<string, { fields: Record<string, FieldInfo>; [k: string]: unknown }>;
}

export interface FieldInfo {
  type: string;
  string?: string;
  relation?: string;
  required?: boolean;
  readonly?: boolean;
  selection?: [string, string][];
  [k: string]: unknown;
}

export class Orm {
  constructor(readonly transport: OrmTransport) {}

  call<T = unknown>(
    model: string,
    method: string,
    ids?: number[],
    kwargs?: Record<string, unknown>,
    context?: OdooContext,
    opts?: CallOptions,
  ): Promise<T> {
    return this.transport.call<T>(model, method, { ids, kwargs, context }, opts);
  }

  getViews(
    model: string,
    views: [number | false, string][],
    options: Record<string, unknown> = {},
    context?: OdooContext,
    opts?: CallOptions,
  ): Promise<GetViewsResult> {
    return this.call<GetViewsResult>(model, "get_views", undefined, { views, options }, context, opts);
  }

  fieldsGet(
    model: string,
    attributes?: string[],
    context?: OdooContext,
    opts?: CallOptions,
  ): Promise<Record<string, FieldInfo>> {
    return this.call(model, "fields_get", undefined, attributes ? { attributes } : {}, context, opts);
  }

  webSearchRead<R = RecordValues>(
    model: string,
    p: WebSearchReadParams,
    opts?: CallOptions,
  ): Promise<WebSearchReadResult<R>> {
    const kwargs: Record<string, unknown> = { domain: p.domain ?? [], specification: p.specification };
    if (p.offset !== undefined) kwargs.offset = p.offset;
    if (p.limit !== undefined) kwargs.limit = p.limit;
    if (p.order !== undefined) kwargs.order = p.order;
    if (p.countLimit !== undefined) kwargs.count_limit = p.countLimit;
    return this.call(model, "web_search_read", undefined, kwargs, p.context, opts);
  }

  webRead<R = RecordValues>(
    model: string,
    ids: number[],
    specification: Specification,
    context?: OdooContext,
    opts?: CallOptions,
  ): Promise<R[]> {
    return this.call(model, "web_read", ids, { specification }, context, opts);
  }

  /** Create (ids = []) or update records; returns the saved records read with `specification`. */
  webSave<R = RecordValues>(
    model: string,
    ids: number[],
    vals: Record<string, unknown>,
    specification: Specification,
    context?: OdooContext,
    opts?: CallOptions,
  ): Promise<R[]> {
    return this.call(model, "web_save", ids, { vals, specification }, context, opts);
  }

  webUnlink(model: string, ids: number[], context?: OdooContext, opts?: CallOptions): Promise<boolean> {
    return this.call(model, "web_unlink", ids, {}, context, opts);
  }

  /** `fieldNames = []` returns defaults for a new record. */
  onchange(
    model: string,
    ids: number[],
    values: Record<string, unknown>,
    fieldNames: string[],
    fieldsSpec: Specification,
    context?: OdooContext,
    opts?: CallOptions,
  ): Promise<OnchangeResult> {
    return this.call(
      model,
      "onchange",
      ids,
      { values, field_names: fieldNames, fields_spec: fieldsSpec },
      context,
      opts,
    );
  }

  webNameSearch<R = RecordValues>(
    model: string,
    name: string,
    specification: Specification,
    p: { domain?: Domain; operator?: string; limit?: number; context?: OdooContext } = {},
    opts?: CallOptions,
  ): Promise<R[]> {
    return this.call(
      model,
      "web_name_search",
      undefined,
      { name, specification, domain: p.domain ?? [], operator: p.operator ?? "ilike", limit: p.limit ?? 8 },
      p.context,
      opts,
    );
  }

  webReadGroup<R = unknown>(
    model: string,
    p: {
      domain?: Domain;
      groupby: string[];
      aggregates?: string[];
      limit?: number;
      offset?: number;
      order?: string;
      context?: OdooContext;
      [k: string]: unknown;
    },
    opts?: CallOptions,
  ): Promise<R> {
    const { context, domain, ...rest } = p;
    return this.call(model, "web_read_group", undefined, { domain: domain ?? [], ...rest }, context, opts);
  }

  searchCount(
    model: string,
    domain: Domain = [],
    context?: OdooContext,
    opts?: CallOptions,
  ): Promise<number> {
    return this.call(model, "search_count", undefined, { domain }, context, opts);
  }
}
