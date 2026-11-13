import { describe, expect, it } from "vitest";

import { Domain, DOMAIN_OPERATORS, DomainError } from "../src/index.js";

const list = (d: Domain) => JSON.parse(JSON.stringify(d.toList())) as unknown;

describe("domains (P2.2)", () => {
  it("reads arch domains with record values and prints them like Odoo", () => {
    const d = Domain.parse("['|', ('partner_id', '=', partner_id), ('state', 'in', ('draft', 'sent'))]", {
      partner_id: 7,
    });
    expect(list(d)).toEqual(["|", ["partner_id", "=", 7], ["state", "in", ["draft", "sent"]]]);
    expect(d.toString()).toBe("['|', ('partner_id', '=', 7), ('state', 'in', ['draft', 'sent'])]");
  });

  it("combines like Domain.AND / Domain.OR: flattens, drops TRUE, FALSE absorbs", () => {
    const a = [["a", "=", 1]];
    expect(list(Domain.and([a, [], [["b", "=", 2]]]))).toEqual(["&", ["a", "=", 1], ["b", "=", 2]]);
    expect(Domain.and([a, false]).isFalse()).toBe(true);
    expect(Domain.or([a, true]).isTrue()).toBe(true);
    expect(list(Domain.and([Domain.and([a, [["b", "=", 2]]]), [["c", "=", 3]]]))).toEqual([
      "&",
      "&",
      ["a", "=", 1],
      ["b", "=", 2],
      ["c", "=", 3],
    ]);
    expect(list(Domain.from([]))).toEqual([[1, "=", 1]]);
  });

  it("negates: inverts simple operators, keeps inequalities and paths under '!', applies De Morgan", () => {
    expect(list(Domain.from([["a", "in", [1]]]).not())).toEqual([["a", "not in", [1]]]);
    expect(list(Domain.from([["a", "<", 1]]).not())).toEqual(["!", ["a", "<", 1]]);
    expect(list(Domain.from([["p.name", "=", "x"]]).not())).toEqual(["!", ["p.name", "=", "x"]]);
    expect(list(Domain.from(["|", ["a", "=", 1], ["b", "=", 2]]).not())).toEqual([
      "&",
      ["a", "!=", 1],
      ["b", "!=", 2],
    ]);
  });

  it("accepts every Odoo operator and rejects what Odoo rejects", () => {
    for (const op of DOMAIN_OPERATORS) expect(() => Domain.from([["name", op, "x"]])).not.toThrow();
    expect(() => Domain.from([["a", "nope", 1]])).toThrow(DomainError);
    expect(() => Domain.from([["a", "any!", []]])).toThrow(DomainError);
    expect(() => Domain.from(["&", ["a", "=", 1]])).toThrow(/Malformed/);
    expect(() => Domain.from([["", "=", 1]])).toThrow(DomainError);
  });
});
