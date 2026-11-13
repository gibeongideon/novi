/**
 * Which record fields an expression reads (P2.4.1): plain names, and `parent.<field>` for
 * sub-view rows reading their parent record. Used to load the fields modifiers depend on.
 */
import { compile } from "./evaluate.js";
import type { Node } from "./parse.js";

export interface ReferencedNames {
  names: string[];
  parentFields: string[];
}

export function referencedNames(expr: string): ReferencedNames {
  const names = new Set<string>();
  const parentFields = new Set<string>();
  const visit = (n: Node): void => {
    switch (n.t) {
      case "name":
        names.add(n.id);
        return;
      case "attr":
        if (n.obj.t === "name" && n.obj.id === "parent") parentFields.add(n.name);
        else visit(n.obj);
        return;
      case "lit":
        return;
      case "list":
      case "tuple":
        return n.items.forEach(visit);
      case "dict":
        return n.entries.forEach(([k, v]) => (visit(k), visit(v)));
      case "not":
      case "neg":
      case "pos":
        return visit(n.arg);
      case "bool":
        return n.args.forEach(visit);
      case "cmp":
        visit(n.first);
        return n.rest.forEach(visit);
      case "bin":
        visit(n.left);
        return visit(n.right);
      case "if":
        visit(n.test);
        visit(n.then);
        return visit(n.else);
      case "index":
        visit(n.obj);
        return visit(n.key);
      case "call":
        visit(n.fn);
        n.args.forEach(visit);
        return n.kwargs.forEach(([, v]) => visit(v));
    }
  };
  visit(compile(expr));
  return { names: [...names], parentFields: [...parentFields] };
}
