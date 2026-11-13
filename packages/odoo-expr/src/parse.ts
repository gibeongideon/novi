/**
 * Parser for the Python expression subset Odoo puts in view arch (P2.1.1): `invisible`, `readonly`,
 * `required`, `column_invisible`, `domain`, `context`, `filter_domain`, `options`.
 * Scope comes from the harvested corpus (all views of Odoo 20, `corpus/harvest.py`), not from
 * Python: literals, names, tuples/lists/dicts, `not and or`, comparisons (chained, `in`, `is`),
 * `+ - * / // %`, unary `- +`, `x if c else y`, attribute, subscript and calls with keywords.
 * Written from scratch (no Odoo code).
 */

export type Node =
  | { t: "lit"; v: null | boolean | number | string }
  | { t: "name"; id: string }
  | { t: "list" | "tuple"; items: Node[] }
  | { t: "dict"; entries: [Node, Node][] }
  | { t: "not"; arg: Node }
  | { t: "neg" | "pos"; arg: Node }
  | { t: "bool"; op: "and" | "or"; args: Node[] }
  | { t: "cmp"; first: Node; ops: CmpOp[]; rest: Node[] }
  | { t: "bin"; op: BinOp; left: Node; right: Node }
  | { t: "if"; test: Node; then: Node; else: Node }
  | { t: "attr"; obj: Node; name: string }
  | { t: "index"; obj: Node; key: Node }
  | { t: "call"; fn: Node; args: Node[]; kwargs: [string, Node][] };

export type CmpOp = "==" | "!=" | "<" | "<=" | ">" | ">=" | "in" | "not in" | "is" | "is not";
export type BinOp = "+" | "-" | "*" | "/" | "//" | "%";

export class ExprSyntaxError extends Error {
  constructor(
    message: string,
    readonly expr: string,
    readonly pos: number,
  ) {
    super(`${message} at ${pos} in: ${expr.length > 120 ? `${expr.slice(0, 117)}…` : expr}`);
    this.name = "ExprSyntaxError";
  }
}

type Tok =
  | { k: "num"; v: number; p: number }
  | { k: "str"; v: string; p: number }
  | { k: "name"; v: string; p: number }
  | { k: "op"; v: string; p: number }
  | { k: "end"; p: number };

// longest first: "==" before "=", "//" before "/"
const OPS = [
  "//",
  "**",
  "==",
  "!=",
  "<=",
  ">=",
  "<",
  ">",
  "=",
  "+",
  "-",
  "*",
  "/",
  "%",
  "(",
  ")",
  "[",
  "]",
  "{",
  "}",
  ",",
  ":",
  ".",
];
const ESCAPES: Record<string, string> = {
  n: "\n",
  t: "\t",
  r: "\r",
  "0": "\0",
  "\\": "\\",
  "'": "'",
  '"': '"',
};

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i))!;
      toks.push({ k: "num", v: Number(m[0]), p: i });
      i += m[0].length;
      continue;
    }
    const strStart = /^[rRuUbB]?['"]/.exec(src.slice(i));
    if (strStart) {
      const raw = /^[rR]/.test(strStart[0]);
      const q = strStart[0].slice(-1);
      const start = i;
      i += strStart[0].length;
      let v = "";
      while (i < src.length && src[i] !== q) {
        if (src[i] === "\\" && !raw) {
          const e = src[i + 1] ?? "";
          v += ESCAPES[e] ?? `\\${e}`;
          i += 2;
        } else v += src[i++];
      }
      if (src[i] !== q) throw new ExprSyntaxError("unterminated string", src, start);
      i++;
      // Python joins adjacent string literals: 'a' 'b' == 'ab'
      const prev = toks[toks.length - 1];
      if (prev?.k === "str") prev.v += v;
      else toks.push({ k: "str", v, p: start });
      continue;
    }
    const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (name) {
      toks.push({ k: "name", v: name[0], p: i });
      i += name[0].length;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new ExprSyntaxError(`unexpected character ${JSON.stringify(c)}`, src, i);
    toks.push({ k: "op", v: op, p: i });
    i += op.length;
  }
  toks.push({ k: "end", p: src.length });
  return toks;
}

// `true`/`false`/`null` are not Python, but Odoo's web client accepts them and widget options use them
const KEYWORD_LITERALS: Record<string, null | boolean> = {
  None: null,
  True: true,
  False: false,
  true: true,
  false: false,
  null: null,
};
const RESERVED = new Set(["and", "or", "not", "in", "is", "if", "else", "lambda", "for"]);

/** Parses one expression into an AST (cache it: arch expressions repeat). */
export function parse(src: string): Node {
  const toks = tokenize(src);
  let pos = 0;
  const peek = () => toks[pos]!;
  const isOp = (v: string, t = peek()) => t.k === "op" && t.v === v;
  const isKw = (v: string, t = peek()) => t.k === "name" && t.v === v;
  const fail = (msg: string): never => {
    throw new ExprSyntaxError(msg, src, peek().p);
  };
  const expect = (v: string) => (isOp(v) ? pos++ : fail(`expected '${v}'`));

  // precedence, low → high: if-else, or, and, not, comparison, + -, * / // %, unary, postfix
  const expr = (): Node => {
    const body = orExpr();
    if (!isKw("if")) return body;
    pos++;
    const test = orExpr();
    if (!isKw("else")) fail("expected 'else'");
    pos++;
    return { t: "if", test, then: body, else: expr() };
  };
  const boolChain = (op: "and" | "or", next: () => Node) => (): Node => {
    const args = [next()];
    while (isKw(op)) {
      pos++;
      args.push(next());
    }
    return args.length === 1 ? args[0]! : { t: "bool", op, args };
  };
  const notExpr = (): Node => {
    if (isKw("not")) {
      pos++;
      return { t: "not", arg: notExpr() };
    }
    return comparison();
  };
  const andExpr = boolChain("and", notExpr);
  const orExpr = boolChain("or", andExpr);
  const comparison = (): Node => {
    const first = additive();
    const ops: CmpOp[] = [];
    const rest: Node[] = [];
    for (;;) {
      const t = peek();
      let op: CmpOp | undefined;
      if (t.k === "op" && ["==", "!=", "<", "<=", ">", ">="].includes(t.v)) {
        op = t.v as CmpOp;
        pos++;
      } else if (isKw("in")) {
        op = "in";
        pos++;
      } else if (isKw("not") && isKw("in", toks[pos + 1])) {
        op = "not in";
        pos += 2;
      } else if (isKw("is")) {
        pos++;
        op = isKw("not") ? (pos++, "is not") : "is";
      }
      if (!op) break;
      ops.push(op);
      rest.push(additive());
    }
    return ops.length ? { t: "cmp", first, ops, rest } : first;
  };
  const binary = (opsHere: BinOp[], next: () => Node) => (): Node => {
    let left = next();
    for (;;) {
      const t = peek();
      if (t.k !== "op" || !opsHere.includes(t.v as BinOp)) return left;
      pos++;
      left = { t: "bin", op: t.v as BinOp, left, right: next() };
    }
  };
  const unary = (): Node => {
    if (isOp("-") || isOp("+")) {
      const neg = isOp("-");
      pos++;
      return { t: neg ? "neg" : "pos", arg: unary() };
    }
    if (isOp("**")) fail("'**' is not supported");
    return postfix();
  };
  const multiplicative = binary(["*", "/", "//", "%"], unary);
  const additive = binary(["+", "-"], multiplicative);

  const postfix = (): Node => {
    let node = atom();
    for (;;) {
      if (isOp(".")) {
        pos++;
        const t = peek();
        if (t.k !== "name") fail("expected an attribute name");
        pos++;
        node = { t: "attr", obj: node, name: (t as { v: string }).v };
      } else if (isOp("[")) {
        pos++;
        if (isOp(":")) fail("slices are not supported");
        const key = expr();
        if (isOp(":")) fail("slices are not supported");
        expect("]");
        node = { t: "index", obj: node, key };
      } else if (isOp("(")) {
        pos++;
        const args: Node[] = [];
        const kwargs: [string, Node][] = [];
        while (!isOp(")")) {
          const t = peek();
          if (t.k === "name" && isOp("=", toks[pos + 1])) {
            pos += 2;
            kwargs.push([t.v, expr()]);
          } else if (kwargs.length) fail("positional argument after keyword argument");
          else args.push(expr());
          if (!isOp(",")) break;
          pos++;
        }
        expect(")");
        node = { t: "call", fn: node, args, kwargs };
      } else return node;
    }
  };

  /** Items up to `close`, allowing a trailing comma; reports whether a comma was seen. */
  const sequence = (close: string): { items: Node[]; comma: boolean } => {
    const items: Node[] = [];
    let comma = false;
    while (!isOp(close)) {
      items.push(expr());
      if (!isOp(",")) break;
      comma = true;
      pos++;
    }
    expect(close);
    return { items, comma };
  };

  const atom = (): Node => {
    const t = peek();
    if (t.k === "num" || t.k === "str") {
      pos++;
      return { t: "lit", v: t.v };
    }
    if (t.k === "name") {
      if (t.v in KEYWORD_LITERALS) {
        pos++;
        return { t: "lit", v: KEYWORD_LITERALS[t.v]! };
      }
      if (RESERVED.has(t.v)) fail(`unexpected '${t.v}'`);
      pos++;
      return { t: "name", id: t.v };
    }
    if (isOp("(")) {
      pos++;
      const { items, comma } = sequence(")");
      return items.length === 1 && !comma ? items[0]! : { t: "tuple", items };
    }
    if (isOp("[")) {
      pos++;
      return { t: "list", items: sequence("]").items };
    }
    if (isOp("{")) {
      pos++;
      const entries: [Node, Node][] = [];
      while (!isOp("}")) {
        const k = expr();
        if (!isOp(":")) fail("sets are not supported (expected ':')");
        pos++;
        entries.push([k, expr()]);
        if (!isOp(",")) break;
        pos++;
      }
      expect("}");
      return { t: "dict", entries };
    }
    return fail(t.k === "end" ? "unexpected end of expression" : "unexpected token");
  };

  const tree = expr();
  if (peek().k !== "end") fail("unexpected token after the expression");
  return tree;
}
