/**
 * Domains (P2.2): Odoo's record filters, e.g. `['|', ('state', '=', 'draft'), ('amount', '>', 0)]`.
 * Reads, combines, negates and prints them exactly as Odoo 20's own `Domain` class does at
 * construction time (flattening, TRUE/FALSE absorption, operator inversion, De Morgan), checked
 * against Odoo itself (corpus oracle). Query-time optimisations stay on the server.
 */
import {
  type EvalContext,
  type EvalOptions,
  evaluate,
  isTuple,
  pyEquals,
  type PyValue,
  tuple,
} from "./evaluate.js";

/** Every condition operator Odoo 20 accepts in a domain list (internal `any!`/`not any!` excluded). */
export const DOMAIN_OPERATORS = [
  "=",
  "!=",
  "<",
  ">",
  "<=",
  ">=",
  "=?",
  "in",
  "not in",
  "like",
  "not like",
  "ilike",
  "not ilike",
  "=like",
  "not =like",
  "=ilike",
  "not =ilike",
  "any",
  "not any",
  "child_of",
  "parent_of",
  "access",
] as const;
const OPERATORS = new Set<string>(DOMAIN_OPERATORS);
const INTERNAL = new Set(["any!", "not any!"]);

/** Operator pairs Odoo swaps when negating a simple condition (inequalities excepted). */
const INVERSE: Record<string, string> = {
  "=": "!=",
  "!=": "=",
  in: "not in",
  "not in": "in",
  like: "not like",
  "not like": "like",
  ilike: "not ilike",
  "not ilike": "ilike",
  "=like": "not =like",
  "not =like": "=like",
  "=ilike": "not =ilike",
  "not =ilike": "=ilike",
  any: "not any",
  "not any": "any",
};

type Tree =
  | { k: "bool"; v: boolean }
  | { k: "cond"; field: string; op: string; value: PyValue }
  | { k: "not"; child: Tree }
  | { k: "and" | "or"; children: Tree[] };

/** Malformed domain; `pyType` is the exception Odoo raises for the same input. */
export class DomainError extends Error {
  constructor(
    message: string,
    readonly pyType: "TypeError" | "ValueError",
  ) {
    super(message);
    this.name = "DomainError";
  }
}

const TRUE: Tree = { k: "bool", v: true };
const FALSE: Tree = { k: "bool", v: false };

function nary(k: "and" | "or", items: Tree[]): Tree {
  const zero = k === "and"; // neutral element: TRUE for AND, FALSE for OR
  const children: Tree[] = [];
  for (const c of items) {
    if (c.k === "bool") {
      if (c.v !== zero) return c; // absorbing element wins
    } else if (c.k === k) children.push(...c.children);
    else children.push(c);
  }
  if (!children.length) return zero ? TRUE : FALSE;
  return children.length === 1 ? children[0]! : { k, children };
}

function negate(t: Tree): Tree {
  switch (t.k) {
    case "bool":
      return t.v ? FALSE : TRUE;
    case "cond": {
      const op = INVERSE[t.op];
      return op && !t.field.includes(".") ? { ...t, op } : { k: "not", child: t };
    }
    case "not":
      return t.child;
    default:
      return { k: t.k === "and" ? "or" : "and", children: t.children.map(negate) };
  }
}

function condition(field: unknown, op: unknown, value: PyValue): Tree {
  if (typeof field !== "string" || !field) throw new DomainError("Empty field name", "TypeError");
  if (typeof op !== "string" || !OPERATORS.has(op))
    throw new DomainError(`Invalid operator ${JSON.stringify(op)} for ${field}`, "ValueError");
  return { k: "cond", field, op, value: value === null ? false : value };
}

function fromList(items: PyValue[]): Tree {
  const stack: Tree[] = [];
  const pop = () => {
    const t = stack.pop();
    if (!t) throw new DomainError("Malformed domain (missing operands)", "ValueError");
    return t;
  };
  for (const item of [...items].reverse()) {
    if (Array.isArray(item) && item.length === 3) {
      const [a, b, c] = item as [PyValue, PyValue, PyValue];
      if (typeof a === "string") {
        if (typeof b === "string" && INTERNAL.has(b))
          throw new DomainError(`Internal operator ${b} not allowed`, "ValueError");
        stack.push(condition(a, b, c));
      } else if (pyEquals(tuple([a, b, c]), tuple([1, "=", 1]))) stack.push(TRUE);
      else if (pyEquals(tuple([a, b, c]), tuple([0, "=", 1]))) stack.push(FALSE);
      else throw new DomainError(`Invalid domain item ${JSON.stringify(item)}`, "TypeError");
    } else if (item === "&") stack.push(nary("and", [pop(), pop()]));
    else if (item === "|") stack.push(nary("or", [pop(), pop()]));
    else if (item === "!") stack.push(negate(pop()));
    else throw new DomainError(`Invalid domain item ${JSON.stringify(item)}`, "ValueError");
  }
  return stack.length === 1 ? stack[0]! : nary("and", stack.reverse());
}

function toTree(input: PyValue | Domain): Tree {
  if (input instanceof Domain) return input.tree;
  if (input === true) return TRUE;
  if (input === false) return FALSE;
  if (!Array.isArray(input))
    throw new DomainError(`Invalid domain value ${JSON.stringify(input)}`, "TypeError");
  return input.length ? fromList(input) : TRUE;
}

export class Domain {
  private constructor(readonly tree: Tree) {}

  static readonly TRUE = new Domain(TRUE);
  static readonly FALSE = new Domain(FALSE);

  /** A domain value (list, `true`/`[]`, `false`), like Odoo's `Domain(value)`. */
  static from(value: PyValue | Domain): Domain {
    return value instanceof Domain ? value : new Domain(toTree(value));
  }

  /**
   * A domain from the arch or an action (P2.2.2): a Python expression string evaluated with the
   * record/context values (`[('partner_id', '=', partner_id)]`), or an already-evaluated list.
   */
  static parse(source: string | PyValue, ctx: EvalContext = {}, opts?: EvalOptions): Domain {
    return Domain.from(typeof source === "string" ? evaluate(source, ctx, opts) : source);
  }

  /** Conjunction, like `Domain.AND([...])`. */
  static and(items: (PyValue | Domain)[]): Domain {
    return new Domain(nary("and", items.map(toTree)));
  }

  /** Disjunction, like `Domain.OR([...])`. */
  static or(items: (PyValue | Domain)[]): Domain {
    return new Domain(nary("or", items.map(toTree)));
  }

  not(): Domain {
    return new Domain(negate(this.tree));
  }

  isTrue(): boolean {
    return this.tree.k === "bool" && this.tree.v;
  }

  isFalse(): boolean {
    return this.tree.k === "bool" && !this.tree.v;
  }

  /** Odoo's list form (prefix notation), ready for JSON-RPC. */
  toList(): PyValue[] {
    const out: PyValue[] = [];
    const walk = (t: Tree) => {
      if (t.k === "bool") out.push(tuple(t.v ? [1, "=", 1] : [0, "=", 1]));
      else if (t.k === "cond")
        out.push(tuple([t.field, t.op, Array.isArray(t.value) ? [...t.value] : t.value]));
      else if (t.k === "not") {
        out.push("!");
        walk(t.child);
      } else {
        for (let i = 1; i < t.children.length; i++) out.push(t.k === "and" ? "&" : "|");
        t.children.forEach(walk);
      }
    };
    walk(this.tree);
    return out;
  }

  /** Python text form, as Odoo stores domains (`ir.filters`, action domains). */
  toString(): string {
    return pyRepr(this.toList());
  }
}

/**
 * Python's `repr()` for the values domains and contexts hold. Whole floats print as integers
 * (`0` for `0.0`): JavaScript has one number type, and Odoo reads both the same in a domain.
 */
export function pyRepr(v: PyValue): string {
  if (v === null) return "None";
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") {
    const q = v.includes("'") && !v.includes('"') ? '"' : "'";
    let s = "";
    for (const ch of v) {
      const code = ch.codePointAt(0)!;
      if (ch === "\\") s += "\\\\";
      else if (ch === q) s += `\\${q}`;
      else if (ch === "\n") s += "\\n";
      else if (ch === "\r") s += "\\r";
      else if (ch === "\t") s += "\\t";
      else if (code < 0x20 || code === 0x7f) s += `\\x${code.toString(16).padStart(2, "0")}`;
      else s += ch;
    }
    return q + s + q;
  }
  if (Array.isArray(v)) {
    const inner = v.map(pyRepr).join(", ");
    return isTuple(v) ? `(${inner}${v.length === 1 ? "," : ""})` : `[${inner}]`;
  }
  if (typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype)
    return `{${Object.entries(v as Record<string, PyValue>)
      .map(([k, x]) => `${pyRepr(k)}: ${pyRepr(x)}`)
      .join(", ")}}`;
  throw new TypeError(`no Python repr for ${String(v)}`);
}
