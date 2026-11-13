/**
 * The fallback widget (P2.13.11, read mode first): renders any Odoo field type from its metadata,
 * so a new type or an unregistered `widget=` never breaks a view. Formatting comes from the one
 * engine formatter (user's language, timezone, currencies). Edit mode arrives with P2.13.
 */
import { useFormat } from "@novi/engine";
import { useT } from "@novi/ui";

import type { FieldProps } from "./contract.js";

type Named = { id?: number; display_name?: string };
const named = (v: unknown): v is Named => !!v && typeof v === "object" && !Array.isArray(v);

export function FallbackField({ value, meta, context, options }: FieldProps) {
  const fmt = useFormat();
  const t = useT();
  if (value === false || value === null || value === undefined || value === "") return null;
  const digits = (meta.digits as [number, number] | undefined)?.[1];
  switch (meta.type) {
    case "many2one":
    case "reference":
    case "many2one_reference":
      return <>{named(value) ? (value.display_name ?? "") : String(value)}</>;
    case "one2many":
    case "many2many": {
      const items = Array.isArray(value) ? value : [];
      const names = items
        .filter(named)
        .map((x) => x.display_name)
        .filter(Boolean);
      return (
        <>
          {names.length
            ? names.join(", ")
            : items.length === 1
              ? t("recordCountOne")
              : items.length
                ? t("recordCount", { n: items.length })
                : null}
        </>
      );
    }
    case "selection":
      return <>{meta.selection?.find(([k]) => k === value)?.[1] ?? String(value)}</>;
    case "boolean":
      return value ? <>{t("yes")}</> : null;
    case "integer":
      return <>{fmt.integer(value as number)}</>;
    case "float":
      return <>{fmt.float(value as number, { digits })}</>;
    case "monetary": {
      const field =
        (options.currency_field as string | undefined) ??
        (meta.currency_field as string | undefined) ??
        "currency_id";
      const currency = context[field];
      return (
        <>
          {typeof currency === "number"
            ? fmt.monetary(value as number, currency)
            : fmt.float(value as number)}
        </>
      );
    }
    case "date":
      return <>{fmt.date(value as string)}</>;
    case "datetime":
      return <>{fmt.datetime(value as string)}</>;
    case "html":
      return (
        <>
          {String(value)
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()}
        </>
      );
    case "binary":
    case "image":
      return null; // images get their own widget (P2.13.9)
    default:
      return <>{typeof value === "object" ? JSON.stringify(value) : String(value)}</>;
  }
}
