import type { SessionInfo } from "@novi/odoo-client";
import { describe, expect, it } from "vitest";

import { activeCompanyIds, allowedCompanies, parseCids } from "../src/index.js";

// shape from Odoo 20 session info (verified live)
const info = {
  uid: 2,
  user_companies: {
    current_company: 1,
    allowed_companies: {
      1: { id: 1, name: "My Company (San Francisco)", sequence: 10, child_ids: [], parent_id: false },
      2: { id: 2, name: "My US Company", sequence: 10, child_ids: [], parent_id: false },
      3: { id: 3, name: "My Company (Chicago)", sequence: 10, child_ids: [], parent_id: false },
    },
  },
} as unknown as SessionInfo;

describe("companies", () => {
  it("lists allowed companies by sequence then name", () => {
    expect(allowedCompanies(info).map((c) => c.id)).toEqual([3, 1, 2]);
    expect(allowedCompanies(null)).toEqual([]);
  });

  it("parses Odoo's cids cookie", () => {
    expect(parseCids("1-3")).toEqual([1, 3]);
    expect(parseCids("x-0-2")).toEqual([2]);
    expect(parseCids(undefined)).toEqual([]);
  });

  it("uses the saved choice only for companies the user may still access", () => {
    expect(activeCompanyIds(info, "3")).toEqual([3]);
    expect(activeCompanyIds(info, "3-99")).toEqual([3]);
    expect(activeCompanyIds(info, "99")).toEqual([1]); // falls back to current company
    expect(activeCompanyIds(info, undefined)).toEqual([1]);
  });
});
