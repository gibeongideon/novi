import type { ModelsInfo, SearchSchema } from "@novi/odoo-meta";
import { parseView } from "@novi/odoo-meta";
import { describe, expect, it } from "vitest";

import { defaultState, periodDomain, searchQuery } from "../src/search.js";

const models = {
  "x.order": {
    fields: {
      name: { type: "char", string: "Name" },
      partner_id: { type: "many2one", string: "Customer", relation: "res.partner" },
      state: { type: "selection", string: "Status" },
      date_order: { type: "datetime", string: "Order Date" },
      user_id: { type: "many2one", string: "Salesperson", relation: "res.users" },
    },
  },
} as never as ModelsInfo;

const search = parseView({
  model: "x.order",
  models,
  arch: `<search>
    <field name="name"/>
    <field name="partner_id" operator="child_of"/>
    <field name="user_id"/>
    <filter name="draft" string="Quotations" domain="[('state', '=', 'draft')]"/>
    <filter name="sale" string="Orders" domain="[('state', '=', 'sale')]"/>
    <separator/>
    <filter name="mine" string="Mine" domain="[('user_id', '=', uid)]"/>
    <filter name="order_date" string="Order Date" date="date_order"/>
    <group><filter name="by_user" string="Salesperson" context="{'group_by': 'user_id'}"/></group>
  </search>`,
}) as SearchSchema;

describe("search (P2.12)", () => {
  it("ORs filters within a group, ANDs groups, ORs values of one field", () => {
    const q = searchQuery(
      search,
      {
        filters: ["draft", "sale", "mine"],
        groupBy: [],
        fields: [
          { name: "name", value: "S001", label: "S001" },
          { name: "name", value: "S002", label: "S002" },
          { name: "partner_id", value: 7, label: "Acme" },
        ],
      },
      { uid: 2 },
    );
    expect(q.domain).toEqual([
      "&",
      "&",
      "&",
      "|",
      ["state", "=", "draft"],
      ["state", "=", "sale"],
      ["user_id", "=", 2],
      "|",
      ["name", "ilike", "S001"],
      ["name", "ilike", "S002"],
      ["partner_id", "child_of", 7],
    ]);
  });

  it("date filters take periods: months within years, a year alone is the whole year", () => {
    const today = new Date(2026, 10, 16); // 16 Nov 2026
    expect(periodDomain("d", "date", ["month"], today).toList()).toEqual([
      "&",
      ["d", ">=", "2026-11-01"],
      ["d", "<=", "2026-11-30"],
    ]);
    expect(periodDomain("d", "date", ["q1", "year-1"], today).toList()).toEqual([
      "&",
      ["d", ">=", "2025-01-01"],
      ["d", "<=", "2025-03-31"],
    ]);
    expect(periodDomain("d", "datetime", ["year"], today).toList()).toEqual([
      "&",
      ["d", ">=", "2026-01-01 00:00:00"],
      ["d", "<=", "2026-12-31 23:59:59"],
    ]);
    const q = searchQuery(search, { filters: ["order_date"], groupBy: [], fields: [] }, {}, [], today);
    expect(q.domain).toEqual([
      "&",
      ["date_order", ">=", "2026-11-01 00:00:00"],
      ["date_order", "<=", "2026-11-30 23:59:59"],
    ]);
  });

  it("a favourite adds its domain and its grouping", () => {
    const q = searchQuery(search, { filters: [], groupBy: ["state"], fields: [], favorite: 3 }, { uid: 2 }, [
      {
        id: 3,
        name: "Big",
        domain: "[('user_id', '=', uid)]",
        context: "{'group_by': ['partner_id']}",
        is_default: false,
        user_ids: [],
      },
    ]);
    expect(q.domain).toEqual([["user_id", "=", 2]]);
    expect(q.groupBy).toEqual(["state", "partner_id"]);
  });

  it("starts from the action's search_default_* keys", () => {
    expect(
      defaultState(search, { search_default_mine: 1, search_default_by_user: 1, search_default_name: "S0" }),
    ).toEqual({
      filters: ["mine"],
      groupBy: ["user_id"],
      fields: [{ name: "name", value: "S0", label: "S0" }],
    });
  });
});
