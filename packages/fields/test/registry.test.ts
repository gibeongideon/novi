import { describe, expect, it } from "vitest";

import type { FieldComponent } from "../src/index.js";
import { FieldRegistry } from "../src/index.js";

const C = (label: string): FieldComponent => Object.assign(() => null, { displayName: label });
const name = (c: FieldComponent) => (c as { displayName?: string }).displayName;

function registry() {
  return new FieldRegistry()
    .register({ types: ["char"], component: C("Char") })
    .register({ types: ["many2many"], widget: "many2many_tags", component: C("Tags") })
    .register({ types: ["integer", "float"], component: C("Number") })
    .setFallback(C("Fallback"));
}

describe("FieldRegistry.resolve", () => {
  it("prefers the arch widget when it supports the field type", () => {
    const res = registry().resolve("many2many", "many2many_tags");
    expect([name(res.component), res.source]).toEqual(["Tags", "widget"]);
  });

  it("uses the type default for an unknown or mismatched widget", () => {
    const r = registry();
    expect(r.resolve("char", "email")).toMatchObject({ source: "type" });
    expect(name(r.resolve("char", "many2many_tags").component)).toBe("Char");
  });

  it("one default widget can serve several types", () => {
    const r = registry();
    expect(name(r.resolve("integer").component)).toBe("Number");
    expect(name(r.resolve("float").component)).toBe("Number");
  });

  it("falls back for unknown types and never throws once a fallback is set", () => {
    const res = registry().resolve("properties_definition", "x");
    expect([name(res.component), res.source]).toEqual(["Fallback", "fallback"]);
    expect(() => new FieldRegistry().resolve("char")).toThrow(/no fallback/);
  });

  it("rejects duplicate registrations (one source per widget)", () => {
    const r = registry();
    expect(() => r.register({ types: ["char"], component: C("Other") })).toThrow(/already registered/);
    expect(() => r.register({ types: ["many2many"], widget: "many2many_tags", component: C("X") })).toThrow(
      /already registered/,
    );
    expect(() => r.register({ types: [], component: C("X") })).toThrow(/must not be empty/);
  });

  it("publishes a manifest for the coverage scanner", () => {
    expect(registry().manifest()).toEqual({
      widgets: ["many2many_tags"],
      fieldTypes: ["char", "float", "integer"],
    });
  });
});
