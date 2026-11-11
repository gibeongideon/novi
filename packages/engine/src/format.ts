/**
 * The single formatter (UI-RULES §1): every number, amount, date and duration shown by NOVI goes
 * through here, using the *user's Odoo settings*, never JS/browser defaults.
 *   - lang_parameters  ← GET /web/webclient/translations (date/time format, separators, grouping)
 *   - currencies       ← session info `currencies` (symbol, position, digits)
 *   - tz               ← session `user_context.tz` (Odoo stores datetimes in UTC)
 * Scope = what the coverage scanner shows widgets need first (monetary, float_time, percentage,
 * numbers, dates). A React `useFormat()` wrapper arrives with the first React consumer (P1.11).
 */

/** Shape of `lang_parameters` from /web/webclient/translations. */
export interface LangParameters {
  code: string;
  direction: "ltr" | "rtl";
  date_format: string; // strftime, e.g. "%m/%d/%Y"
  time_format: string; // strftime, e.g. "%I:%M:%S %p"
  decimal_point: string;
  thousands_sep: string;
  /** Odoo grouping string, e.g. "[3,0]" (thousands) or "[3,2,0]" (Indian lakh/crore). */
  grouping: string;
  week_start?: number;
}

/** One entry of session info `currencies`. `digits` is [precision, scale]. */
export interface CurrencyInfo {
  name?: string;
  symbol: string;
  position: "before" | "after";
  digits?: [number, number];
}

export interface FormatSettings {
  lang: LangParameters;
  currencies: Record<string | number, CurrencyInfo>;
  /** IANA zone from user_context.tz; Odoo falls back to UTC when unset. */
  tz?: string;
}

export interface NumberOptions {
  /** Decimal places (Odoo `digits[1]`); default 2 for floats. */
  digits?: number;
  /** Apply thousands grouping (default true). */
  grouping?: boolean;
}

export interface Formatter {
  readonly settings: FormatSettings;
  integer(value: number | false | null | undefined): string;
  float(value: number | false | null | undefined, opts?: NumberOptions): string;
  /** Amount with the currency's symbol, position and digits. */
  monetary(
    value: number | false | null | undefined,
    currencyId: number | string,
    opts?: NumberOptions,
  ): string;
  /** Odoo `percentage` widget: 0.15 → "15%"; digits default 0… fits most Odoo usages. */
  percentage(value: number | false | null | undefined, opts?: NumberOptions): string;
  /** Odoo `float_time`: 1.5 → "01:30", -0.25 → "-00:15". */
  floatTime(value: number | false | null | undefined): string;
  /** Odoo date string "YYYY-MM-DD" → user date format (no timezone shift: dates have no time). */
  date(value: string | false | null | undefined): string;
  /** Odoo UTC datetime "YYYY-MM-DD HH:MM:SS" → user date + time format in the user's tz. */
  datetime(value: string | false | null | undefined, opts?: { seconds?: boolean }): string;
  /** Parses user-typed numbers with the user's separators ("1.234,5" in de_DE → 1234.5). NaN if invalid. */
  parseNumber(text: string): number;
}

const EMPTY = "";
/** Odoo separates amount and currency symbol with a non-breaking space. */
const NBSP = "\u00a0";

export function createFormatter(settings: FormatSettings): Formatter {
  const { lang } = settings;
  const tz = settings.tz || "UTC";
  const grouping = parseGrouping(lang.grouping);
  const locale = lang.code.replace("_", "-");

  const number = (value: number, opts: NumberOptions = {}): string => {
    const digits = opts.digits ?? 2;
    const negative = value < 0 || Object.is(value, -0);
    const [intPart, fracPart = ""] = Math.abs(value).toFixed(digits).split(".");
    const grouped = opts.grouping === false ? intPart! : groupDigits(intPart!, grouping, lang.thousands_sep);
    const out = fracPart ? `${grouped}${lang.decimal_point}${fracPart}` : grouped;
    return negative && Number(Math.abs(value).toFixed(digits)) !== 0 ? `-${out}` : out;
  };

  const isEmpty = (v: unknown): v is false | null | undefined => v === false || v === null || v === undefined;

  return {
    settings,
    integer: (v) => (isEmpty(v) ? EMPTY : number(v, { digits: 0 })),
    float: (v, opts) => (isEmpty(v) ? EMPTY : number(v, opts)),
    monetary(v, currencyId, opts = {}) {
      if (isEmpty(v)) return EMPTY;
      const cur = settings.currencies[currencyId];
      const amount = number(v, { digits: opts.digits ?? cur?.digits?.[1] ?? 2, grouping: opts.grouping });
      if (!cur) return amount;
      // Odoo uses a non-breaking space between amount and symbol
      return cur.position === "after" ? `${amount}${NBSP}${cur.symbol}` : `${cur.symbol}${NBSP}${amount}`;
    },
    percentage: (v, opts = {}) =>
      isEmpty(v) ? EMPTY : `${number(v * 100, { digits: opts.digits ?? 0, grouping: opts.grouping })}%`,
    floatTime(v) {
      if (isEmpty(v)) return EMPTY;
      const sign = v < 0 ? "-" : "";
      let minutes = Math.round(Math.abs(v) * 60);
      const hours = Math.floor(minutes / 60);
      minutes %= 60;
      return `${sign}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    },
    date(v) {
      if (!v) return EMPTY;
      const [y, m, d] = v.slice(0, 10).split("-").map(Number);
      return strftime(lang.date_format, { y: y!, m: m!, d: d!, H: 0, M: 0, S: 0 }, locale);
    },
    datetime(v, opts = {}) {
      if (!v) return EMPTY;
      const parts = zonedParts(new Date(`${v.replace(" ", "T")}Z`), tz);
      const time = opts.seconds === false ? lang.time_format.replace(/:%S/, "") : lang.time_format;
      return `${strftime(lang.date_format, parts, locale)} ${strftime(time, parts, locale)}`;
    },
    parseNumber(text) {
      const cleaned = text
        .trim()
        .split(lang.thousands_sep || "\u0000")
        .join("")
        .replace(/\s/g, "")
        .replace(lang.decimal_point, ".");
      return cleaned === "" || !/^[-+]?\d*\.?\d+$/.test(cleaned) ? Number.NaN : Number(cleaned);
    },
  };
}

// ── helpers ─────────────────────────────────────────────────────────────────────────────

/** "[3,2,0]" → [3,2,0]; anything unparsable → [3,0]. */
export function parseGrouping(raw: string): number[] {
  try {
    const g = JSON.parse(raw) as unknown;
    return Array.isArray(g) && g.every((n) => Number.isInteger(n)) ? (g as number[]) : [3, 0];
  } catch {
    return [3, 0];
  }
}

/**
 * Odoo/Python grouping semantics: sizes apply right-to-left; 0 repeats the previous size,
 * -1 stops grouping. [3,0] → 1,234,567 · [3,2,0] → 12,34,567.
 */
export function groupDigits(int: string, grouping: number[], sep: string): string {
  if (!sep || !grouping.length) return int;
  const groups: string[] = [];
  let rest = int;
  let last = 0;
  for (let i = 0; rest.length; i++) {
    const g = grouping[i];
    let size: number;
    if (g === undefined || g === 0) size = last;
    else if (g === -1) break;
    else size = g;
    if (!size || rest.length <= size) break;
    groups.unshift(rest.slice(-size));
    rest = rest.slice(0, -size);
    last = size;
  }
  return [rest, ...groups].filter(Boolean).join(sep);
}

interface Parts {
  y: number;
  m: number;
  d: number;
  H: number;
  M: number;
  S: number;
}

function zonedParts(date: Date, tz: string): Parts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year!, m: +p.month!, d: +p.day!, H: +p.hour!, M: +p.minute!, S: +p.second! };
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** The strftime subset Odoo language formats use. Month/day names come from Intl in the user's lang. */
export function strftime(pattern: string, t: Parts, locale: string): string {
  const utc = new Date(Date.UTC(t.y, t.m - 1, t.d));
  const name = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...o, timeZone: "UTC" }).format(utc);
  return pattern.replace(/%([a-zA-Z%])/g, (_, c: string) => {
    switch (c) {
      case "Y":
        return String(t.y);
      case "y":
        return pad(t.y % 100);
      case "m":
        return pad(t.m);
      case "d":
        return pad(t.d);
      case "e":
        return String(t.d);
      case "H":
        return pad(t.H);
      case "I":
        return pad(t.H % 12 || 12);
      case "M":
        return pad(t.M);
      case "S":
        return pad(t.S);
      case "p":
        return t.H < 12 ? "AM" : "PM";
      case "b":
        return name({ month: "short" });
      case "B":
        return name({ month: "long" });
      case "a":
        return name({ weekday: "short" });
      case "A":
        return name({ weekday: "long" });
      case "%":
        return "%";
      default:
        return `%${c}`;
    }
  });
}
