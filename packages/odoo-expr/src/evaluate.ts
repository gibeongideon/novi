/**
 * Evaluator for arch expressions (P2.1.2) with Python semantics: truthiness, `and`/`or` return an
 * operand, `None` is not `False`, tuples differ from lists, comparing unrelated types is an
 * error. Values follow Odoo's record evaluation context: many2one → id or false, x2many → list
 * of ids, dates → "YYYY-MM-DD" strings. Only what views use is built (see parse.ts); anything
 * else raises ExprError, which callers turn into a logged fallback (`safeEvaluate`).
 */
import { type Node, parse } from "./parse.js";

export type PyValue =
  | null
  | boolean
  | number
  | string
  | PyValue[]
  | { [key: string]: PyValue }
  | PyDate
  | RelativeDelta
  | PyFunction;

/** Variables visible to an expression: record fields, `context`, `uid`, `parent`, `self`, … */
export type EvalContext = Record<string, PyValue | undefined>;

export interface EvalOptions {
  /** "Today" for `context_today()` (default: the local date). */
  today?: Date;
}

export class ExprError extends Error {
  constructor(
    message: string,
    readonly expr?: string,
  ) {
    super(expr ? `${message} in: ${expr.length > 120 ? `${expr.slice(0, 117)}…` : expr}` : message);
    this.name = "ExprError";
  }
}

export class PyFunction {
  constructor(
    readonly name: string,
    readonly call: (args: PyValue[], kwargs: Record<string, PyValue>) => PyValue,
  ) {}
}

/** A calendar date (`context_today()`), with `+`/`-` relativedelta and `strftime`. */
export class PyDate {
  constructor(
    readonly year: number,
    readonly month: number,
    readonly day: number,
  ) {}
  strftime(fmt: string): string {
    const pad = (n: number, w = 2) => String(n).padStart(w, "0");
    return fmt.replace(/%([YmdHMS%])/g, (_, c: string) =>
      c === "Y"
        ? pad(this.year, 4)
        : c === "m"
          ? pad(this.month)
          : c === "d"
            ? pad(this.day)
            : c === "%"
              ? "%"
              : "00",
    );
  }
  shift(d: RelativeDelta, sign: 1 | -1): PyDate {
    // like dateutil: years/months first (day clipped to the month's end), then days/weeks
    const months = this.year * 12 + (this.month - 1) + sign * (d.years * 12 + d.months);
    const y = Math.floor(months / 12);
    const m = (months % 12) + 1;
    const day = Math.min(this.day, new Date(Date.UTC(y, m, 0)).getUTCDate());
    const t = new Date(Date.UTC(y, m - 1, day) + sign * (d.days + d.weeks * 7) * 86_400_000);
    return new PyDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }
}

export class RelativeDelta {
  constructor(
    readonly years = 0,
    readonly months = 0,
    readonly weeks = 0,
    readonly days = 0,
  ) {}
}

/** Python tuples are arrays marked here, so `(1,) != [1]` like in Python. */
const TUPLES = new WeakSet<PyValue[]>();
export const tuple = (items: PyValue[]): PyValue[] => {
  TUPLES.add(items);
  return items;
};
export const isTuple = (v: unknown): boolean => Array.isArray(v) && TUPLES.has(v);

const isDict = (v: unknown): v is Record<string, PyValue> =>
  typeof v === "object" && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

const typeName = (v: PyValue): string =>
  v === null
    ? "NoneType"
    : typeof v === "boolean"
      ? "bool"
      : typeof v === "number"
        ? "number"
        : typeof v === "string"
          ? "str"
          : Array.isArray(v)
            ? isTuple(v)
              ? "tuple"
              : "list"
            : v instanceof PyDate
              ? "date"
              : v instanceof RelativeDelta
                ? "relativedelta"
                : v instanceof PyFunction
                  ? "function"
                  : "dict";

/** Python truthiness. */
export function truthy(v: PyValue): boolean {
  if (v === null || v === false || v === 0 || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  if (isDict(v)) return Object.keys(v).length > 0;
  return true;
}

/** Python `==`: numbers and bools compare by value (True == 1), containers deeply. */
export function pyEquals(a: PyValue, b: PyValue): boolean {
  const num = (v: PyValue) => (typeof v === "boolean" ? Number(v) : v);
  if ((typeof a === "number" || typeof a === "boolean") && (typeof b === "number" || typeof b === "boolean"))
    return num(a) === num(b);
  if (Array.isArray(a) && Array.isArray(b))
    return isTuple(a) === isTuple(b) && a.length === b.length && a.every((x, i) => pyEquals(x, b[i]!));
  if (isDict(a) && isDict(b)) {
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every((k) => k in b && pyEquals(a[k]!, b[k]!));
  }
  if (a instanceof PyDate && b instanceof PyDate) return a.strftime("%Y-%m-%d") === b.strftime("%Y-%m-%d");
  return a === b;
}

function order(a: PyValue, b: PyValue, expr: string): number {
  const num = (v: PyValue) => (typeof v === "boolean" ? Number(v) : v);
  const na = num(a);
  const nb = num(b);
  if (typeof na === "number" && typeof nb === "number") return na - nb;
  if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
  if (a instanceof PyDate && b instanceof PyDate)
    return a.strftime("%Y%m%d").localeCompare(b.strftime("%Y%m%d"));
  if (Array.isArray(a) && Array.isArray(b) && isTuple(a) === isTuple(b)) {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (!pyEquals(a[i]!, b[i]!)) return order(a[i]!, b[i]!, expr);
    }
    return a.length - b.length;
  }
  throw new ExprError(`'<' not supported between ${typeName(a)} and ${typeName(b)}`, expr);
}

function contains(container: PyValue, item: PyValue, expr: string): boolean {
  if (typeof container === "string") {
    if (typeof item !== "string")
      throw new ExprError(`'in <string>' requires string, not ${typeName(item)}`, expr);
    return container.includes(item);
  }
  if (Array.isArray(container)) return container.some((x) => pyEquals(x, item));
  if (isDict(container)) return typeof item === "string" && item in container;
  throw new ExprError(`argument of type '${typeName(container)}' is not iterable`, expr);
}

function arithmetic(op: string, a: PyValue, b: PyValue, expr: string): PyValue {
  const num = (v: PyValue) => (typeof v === "boolean" ? Number(v) : v);
  const na = num(a);
  const nb = num(b);
  if (typeof na === "number" && typeof nb === "number") {
    if ((op === "/" || op === "//" || op === "%") && nb === 0) throw new ExprError("division by zero", expr);
    if (op === "+") return na + nb;
    if (op === "-") return na - nb;
    if (op === "*") return na * nb;
    if (op === "/") return na / nb;
    if (op === "//") return Math.floor(na / nb);
    return ((na % nb) + nb) % nb; // Python's sign rule
  }
  if (op === "+" && typeof a === "string" && typeof b === "string") return a + b;
  if (op === "+" && Array.isArray(a) && Array.isArray(b) && isTuple(a) === isTuple(b)) {
    const joined = [...a, ...b];
    return isTuple(a) ? tuple(joined) : joined;
  }
  if ((op === "+" || op === "-") && a instanceof PyDate && b instanceof RelativeDelta)
    return a.shift(b, op === "+" ? 1 : -1);
  if (op === "+" && a instanceof RelativeDelta && b instanceof PyDate) return b.shift(a, 1);
  throw new ExprError(`unsupported operand types for ${op}: ${typeName(a)} and ${typeName(b)}`, expr);
}

/** Built-in names (only those views use, plus their obvious neighbours). */
function builtins(opts: EvalOptions): Record<string, PyValue> {
  const fn = (name: string, call: PyFunction["call"]) => new PyFunction(name, call);
  return {
    bool: fn("bool", ([v]) => truthy(v ?? false)),
    len: fn("len", ([v]) => {
      if (typeof v === "string" || Array.isArray(v)) return v.length;
      if (isDict(v)) return Object.keys(v).length;
      throw new ExprError(`object of type '${typeName(v ?? null)}' has no len()`);
    }),
    context_today: fn("context_today", () => {
      const d = opts.today ?? new Date();
      return new PyDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
    }),
    // Odoo's evaluation context also offers today's date as a string
    current_date: (() => {
      const d = opts.today ?? new Date();
      return new PyDate(d.getFullYear(), d.getMonth() + 1, d.getDate()).strftime("%Y-%m-%d");
    })(),
    relativedelta: fn(
      "relativedelta",
      (_, kw) =>
        new RelativeDelta(
          Number(kw.years ?? 0),
          Number(kw.months ?? 0),
          Number(kw.weeks ?? 0),
          Number(kw.days ?? 0),
        ),
    ),
  };
}

const STR_METHODS: Record<string, (s: string, args: PyValue[]) => PyValue> = {
  lower: (s) => s.toLowerCase(),
  upper: (s) => s.toUpperCase(),
  strip: (s) => s.trim(),
  startswith: (s, [p]) => typeof p === "string" && s.startsWith(p),
  endswith: (s, [p]) => typeof p === "string" && s.endsWith(p),
};

function attribute(obj: PyValue, name: string, expr: string): PyValue {
  if (typeof obj === "string" && name in STR_METHODS)
    return new PyFunction(name, (args) => STR_METHODS[name]!(obj, args));
  if (isDict(obj) && name === "get" && !("get" in obj))
    return new PyFunction("get", ([k, d]) => (typeof k === "string" && k in obj ? obj[k]! : (d ?? null)));
  if (obj instanceof PyDate && name === "strftime")
    return new PyFunction("strftime", ([f]) => obj.strftime(String(f)));
  // Odoo web-client convention: x2many values are id lists with a JS-style `.length`
  if (Array.isArray(obj) && name === "length") return obj.length;
  // records (`parent`) are plain objects: their fields read as attributes
  if (isDict(obj) && name in obj) return obj[name]!;
  throw new ExprError(`'${typeName(obj)}' object has no attribute '${name}'`, expr);
}

function index(obj: PyValue, key: PyValue, expr: string): PyValue {
  if ((Array.isArray(obj) || typeof obj === "string") && typeof key === "number") {
    const i = key < 0 ? obj.length + key : key;
    if (!Number.isInteger(i) || i < 0 || i >= obj.length) throw new ExprError("index out of range", expr);
    return obj[i]!;
  }
  if (isDict(obj) && typeof key === "string") {
    if (!(key in obj)) throw new ExprError(`KeyError: '${key}'`, expr);
    return obj[key]!;
  }
  throw new ExprError(`'${typeName(obj)}' object is not subscriptable with ${typeName(key)}`, expr);
}

const cache = new Map<string, Node>();
/** Parse once per distinct expression (views repeat the same strings). */
export function compile(expr: string): Node {
  let node = cache.get(expr);
  if (!node) {
    node = parse(expr);
    if (cache.size > 5000) cache.clear();
    cache.set(expr, node);
  }
  return node;
}

/** Evaluates an arch expression. Throws ExprSyntaxError / ExprError. */
export function evaluate(expr: string, ctx: EvalContext = {}, opts: EvalOptions = {}): PyValue {
  return evaluateNode(compile(expr), ctx, opts, expr);
}

/** Evaluates an already-parsed expression (or one part of it, e.g. one value of a dict). */
export function evaluateNode(node: Node, ctx: EvalContext = {}, opts: EvalOptions = {}, expr = ""): PyValue {
  const base = builtins(opts);
  const run = (n: Node): PyValue => {
    switch (n.t) {
      case "lit":
        return n.v;
      case "name": {
        const v = ctx[n.id];
        if (v !== undefined) return v;
        if (n.id in base) return base[n.id]!;
        throw new ExprError(`name '${n.id}' is not defined`, expr);
      }
      case "list":
        return n.items.map(run);
      case "tuple":
        return tuple(n.items.map(run));
      case "dict": {
        const out: Record<string, PyValue> = {};
        for (const [k, v] of n.entries) {
          const key = run(k);
          // keys are kept as Python's str() of the key (views use strings, numbers, and False)
          if (typeof key === "string" || typeof key === "number") out[String(key)] = run(v);
          else if (typeof key === "boolean" || key === null)
            out[key === null ? "None" : key ? "True" : "False"] = run(v);
          else throw new ExprError("unsupported dict key", expr);
        }
        return out;
      }
      case "not":
        return !truthy(run(n.arg));
      case "neg":
      case "pos": {
        const v = run(n.arg);
        const num = typeof v === "boolean" ? Number(v) : v;
        if (typeof num !== "number")
          throw new ExprError(`bad operand type for unary: '${typeName(v)}'`, expr);
        return n.t === "neg" ? -num : num;
      }
      case "bool": {
        let v = run(n.args[0]!);
        for (const a of n.args.slice(1)) {
          if (n.op === "and" ? !truthy(v) : truthy(v)) return v;
          v = run(a);
        }
        return v;
      }
      case "cmp": {
        let left = run(n.first);
        for (let i = 0; i < n.ops.length; i++) {
          const right = run(n.rest[i]!);
          const op = n.ops[i]!;
          const ok =
            op === "=="
              ? pyEquals(left, right)
              : op === "!="
                ? !pyEquals(left, right)
                : op === "in"
                  ? contains(right, left, expr)
                  : op === "not in"
                    ? !contains(right, left, expr)
                    : op === "is"
                      ? left === right
                      : op === "is not"
                        ? left !== right
                        : (() => {
                            const c = order(left, right, expr);
                            return op === "<" ? c < 0 : op === "<=" ? c <= 0 : op === ">" ? c > 0 : c >= 0;
                          })();
          if (!ok) return false;
          left = right;
        }
        return true;
      }
      case "bin":
        return arithmetic(n.op, run(n.left), run(n.right), expr);
      case "if":
        return truthy(run(n.test)) ? run(n.then) : run(n.else);
      case "attr":
        return attribute(run(n.obj), n.name, expr);
      case "index":
        return index(run(n.obj), run(n.key), expr);
      case "call": {
        const fn = run(n.fn);
        if (!(fn instanceof PyFunction))
          throw new ExprError(`'${typeName(fn)}' object is not callable`, expr);
        const kwargs: Record<string, PyValue> = {};
        for (const [k, v] of n.kwargs) kwargs[k] = run(v);
        return fn.call(n.args.map(run), kwargs);
      }
    }
  };
  return run(node);
}

/** Truthiness of an expression (`invisible`, `readonly`, `required`, `column_invisible`). */
export function evaluateBool(expr: string, ctx?: EvalContext, opts?: EvalOptions): boolean {
  return truthy(evaluate(expr, ctx, opts));
}

/**
 * Never crashes a view (P2.1.5): on an unsupported construct or a runtime error, reports it
 * once per expression and returns `fallback`.
 */
export function safeEvaluate<T extends PyValue>(
  expr: string,
  ctx: EvalContext,
  fallback: T,
  onError: (err: Error, expr: string) => void = reportOnce,
  opts?: EvalOptions,
): PyValue {
  try {
    return evaluate(expr, ctx, opts);
  } catch (err) {
    onError(err as Error, expr);
    return fallback;
  }
}

const reported = new Set<string>();
function reportOnce(err: Error, expr: string) {
  if (reported.has(expr)) return;
  reported.add(expr);
  console.warn(`[odoo-expr] ${err.message}`);
}
