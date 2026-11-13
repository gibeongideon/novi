/**
 * Minimal XML reader for view arch (P2.3.1): same code in the browser and in Node, no dependency.
 * Odoo serialises arch with lxml, so input is well-formed: elements, attributes, text, entities,
 * comments, CDATA and processing instructions are all this needs.
 */

export interface XmlElement {
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}
export type XmlNode = XmlElement | string;

export class XmlError extends Error {
  constructor(message: string, pos: number) {
    super(`${message} at ${pos}`);
    this.name = "XmlError";
  }
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s: string) =>
  s.includes("&")
    ? s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
        e[0] === "#"
          ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
          : (ENTITIES[e] ?? m),
      )
    : s;

const ATTR = /\s*([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/y;

/** Parses one XML document into its root element. Whitespace-only text is dropped. */
export function parseXml(src: string): XmlElement {
  let i = 0;
  const stack: XmlElement[] = [{ tag: "#document", attrs: {}, children: [] }];
  const top = () => stack[stack.length - 1]!;
  while (i < src.length) {
    const lt = src.indexOf("<", i);
    const text = src.slice(i, lt < 0 ? src.length : lt);
    if (text.trim()) top().children.push(decode(text));
    if (lt < 0) break;
    i = lt;
    if (src.startsWith("<!--", i)) {
      const end = src.indexOf("-->", i);
      if (end < 0) throw new XmlError("unterminated comment", i);
      i = end + 3;
    } else if (src.startsWith("<![CDATA[", i)) {
      const end = src.indexOf("]]>", i);
      if (end < 0) throw new XmlError("unterminated CDATA", i);
      top().children.push(src.slice(i + 9, end));
      i = end + 3;
    } else if (src.startsWith("<?", i) || src.startsWith("<!", i)) {
      const end = src.indexOf(">", i);
      if (end < 0) throw new XmlError("unterminated declaration", i);
      i = end + 1;
    } else if (src[i + 1] === "/") {
      const end = src.indexOf(">", i);
      const tag = src.slice(i + 2, end).trim();
      const open = stack.pop();
      if (!open || open.tag !== tag) throw new XmlError(`unexpected </${tag}>`, i);
      top().children.push(open);
      i = end + 1;
    } else {
      const m = /^<([^\s/>]+)/.exec(src.slice(i, i + 200));
      if (!m) throw new XmlError("bad tag", i);
      const el: XmlElement = { tag: m[1]!, attrs: {}, children: [] };
      i += m[0].length;
      for (;;) {
        ATTR.lastIndex = i;
        const a = ATTR.exec(src);
        if (!a) break;
        el.attrs[a[1]!] = decode(a[3] ?? a[4] ?? "");
        i = ATTR.lastIndex;
      }
      while (/\s/.test(src[i] ?? "")) i++;
      if (src.startsWith("/>", i)) {
        top().children.push(el);
        i += 2;
      } else if (src[i] === ">") {
        stack.push(el);
        i++;
      } else throw new XmlError(`bad attribute in <${el.tag}>`, i);
    }
  }
  if (stack.length !== 1) throw new XmlError(`unclosed <${top().tag}>`, src.length);
  const root = stack[0]!.children.find((c): c is XmlElement => typeof c !== "string");
  if (!root) throw new XmlError("no root element", 0);
  return root;
}

export const elements = (el: XmlElement): XmlElement[] =>
  el.children.filter((c): c is XmlElement => typeof c !== "string");

/** All text inside an element, whitespace collapsed. */
export const textOf = (el: XmlElement): string =>
  el.children
    .map((c) => (typeof c === "string" ? c : textOf(c)))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
