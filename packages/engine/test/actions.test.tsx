// @vitest-environment jsdom
import type { ModelsInfo } from "@novi/odoo-meta";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OdooRecord, RecordList, type Rpc, useLeaveGuard } from "../src/index.js";

const models = {
  "x.tag": {
    fields: {
      name: { type: "char" },
      color: { type: "integer" },
      parent_id: { type: "many2one", relation: "x.tag" },
      active: { type: "boolean" },
    },
  },
} as unknown as ModelsInfo;
const spec = { name: {}, color: {}, parent_id: { fields: { display_name: {} } }, active: {} };
const config = { model: "x.tag", models, spec };

function fakeRpc(answers: Record<string, unknown> = {}) {
  const calls: { method: string; ids?: number[]; kwargs?: Record<string, unknown> }[] = [];
  const rpc: Rpc = async (_model, method, call = {}) => {
    calls.push({ method, ...call });
    return (answers[method] ?? true) as never;
  };
  return { rpc, calls };
}

describe("validation before save (P2.7.2)", () => {
  it("a value the widget couldn't parse blocks saving until the field is edited", async () => {
    const { rpc, calls } = fakeRpc({ web_save: [{ id: 1, name: "A", color: 3 }] });
    const r = new OdooRecord(rpc, config, { id: 1, name: "A", color: 0, parent_id: false, active: true });
    r.markInvalid("color", "Not a number");
    expect(r.fieldError("color")).toBe("Not a number");
    expect(r.invalidFields()).toEqual(["color"]);
    expect(await r.save()).toBe(false);
    expect(calls).toEqual([]);
    r.update({ color: 3 });
    expect(r.invalidFields()).toEqual([]);
    expect(await r.save()).toBe(true);
    expect(calls[0]!.kwargs!.vals).toEqual({ color: 3 }); // only what changed (P2.7.1)
  });
});

describe("record actions (P2.7.4)", () => {
  it("deletes, duplicates and archives through Odoo's own methods", async () => {
    const { rpc, calls } = fakeRpc({ copy: [42], web_read: [{ id: 1, name: "A", active: false }] });
    const r = new OdooRecord(rpc, config, { id: 1, name: "A", color: 0, parent_id: false, active: true });
    expect(await r.duplicate()).toBe(42);
    await r.setArchived(true);
    expect(r.values.active).toBe(false); // reloaded
    await r.delete();
    expect(calls.map((c) => [c.method, c.ids])).toEqual([
      ["copy", [1]],
      ["action_archive", [1]],
      ["web_read", [1]],
      ["web_unlink", [1]],
    ]);
    await expect(OdooRecord.create(rpc, config, {}).duplicate()).rejects.toThrow(/Save the record/);
  });
});

describe("bulk actions on the selection (P2.7.4, P2.7.5)", () => {
  it("writes the same values on every selected record in one web_save_multi call", async () => {
    const { rpc, calls } = fakeRpc({
      web_search_read: { records: [{ id: 1 }, { id: 2 }, { id: 3 }], length: 3 },
      copy: [7, 8],
    });
    const list = new RecordList(rpc, config);
    await list.load();
    list.select(1);
    list.select(3);
    await list.writeSelected({ color: 5, parent_id: { id: 9, display_name: "Root" } });
    const save = calls.find((c) => c.method === "web_save_multi")!;
    expect(save.ids).toEqual([1, 3]);
    expect(save.kwargs!.vals_list).toEqual([
      { color: 5, parent_id: 9 },
      { color: 5, parent_id: 9 },
    ]);
    expect(list.selectedIds).toEqual([1, 3]); // multi-edit keeps the selection, as Odoo's list does
    list.selectAll(false);
    list.select(1);
    list.select(2);
    expect(await list.duplicateSelected()).toEqual([7, 8]);
    await list.setArchivedSelected(true);
    expect(calls.find((c) => c.method === "action_archive")!.ids).toEqual([1, 2]);
    expect(list.selection.size).toBe(0);
    list.select(2);
    await list.deleteSelected();
    expect(calls.find((c) => c.method === "web_unlink")!.ids).toEqual([2]);
  });
});

describe("leaving with unsaved changes (P2.7.3)", () => {
  it("asks before the tab closes only while there are unsaved changes", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const { rerender } = renderHook(({ dirty }) => useLeaveGuard(dirty), { initialProps: { dirty: false } });
    expect(add.mock.calls.filter(([e]) => e === "beforeunload")).toHaveLength(0);
    rerender({ dirty: true });
    expect(add.mock.calls.filter(([e]) => e === "beforeunload")).toHaveLength(1);
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    rerender({ dirty: false });
    expect(remove.mock.calls.filter(([e]) => e === "beforeunload")).toHaveLength(1);
  });
});
