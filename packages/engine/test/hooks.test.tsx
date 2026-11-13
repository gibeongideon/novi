// @vitest-environment jsdom
import type { ModelsInfo } from "@novi/odoo-meta";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { EngineProvider, type SessionTransport, useRecord, useRecordList } from "../src/index.js";

const models = { "x.order": { fields: { name: { type: "char" } } } } as unknown as ModelsInfo;

function fakeTransport() {
  const calls: string[] = [];
  let name = "SO1";
  const t: SessionTransport = {
    authenticate: async () => ({ uid: 2 }),
    getSessionInfo: async () => ({ uid: 2, user_context: {} }),
    destroy: async () => undefined,
    loadMenus: async () => ({}),
    loadAction: async () => ({}) as never,
    setContext: () => undefined,
    call: async (
      _model: string,
      method: string,
      call?: { ids?: number[]; kwargs?: Record<string, unknown> },
    ) => {
      calls.push(method);
      if (method === "web_read") return [{ id: 1, name }] as never;
      if (method === "web_save") {
        name = (call?.kwargs?.vals as { name: string }).name;
        return [{ id: 1, name }] as never;
      }
      if (method === "web_search_read") {
        const offset = (call?.kwargs?.offset as number) ?? 0;
        return { records: [{ id: offset + 1, name: `R${offset + 1}` }], length: 3 } as never;
      }
      return undefined as never;
    },
  };
  return { t, calls };
}

const wrapper = (t: SessionTransport) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <EngineProvider transport={t} db="x">
        {children}
      </EngineProvider>
    );
  };

describe("React integration (P2.5.5)", () => {
  it("useRecord loads, re-renders on edits, and saves", async () => {
    const { t, calls } = fakeTransport();
    const config = { model: "x.order", models, spec: { name: {} } };
    const { result } = renderHook(() => useRecord(config, 1), { wrapper: wrapper(t) });
    await waitFor(() => expect(result.current.record?.values.name).toBe("SO1"));
    act(() => result.current.record!.update({ name: "SO1b" }));
    expect(result.current.record!.values.name).toBe("SO1b");
    expect(result.current.record!.dirty).toBe(true);
    let ok = false;
    await act(async () => {
      ok = await result.current.save();
    });
    expect(ok).toBe(true);
    expect(calls).toContain("web_save");
    expect(result.current.record!.dirty).toBe(false);
  });

  it("useRecordList re-renders when the page changes", async () => {
    const { t } = fakeTransport();
    const config = { model: "x.order", models, spec: { name: {} }, limit: 1 };
    const { result } = renderHook(() => useRecordList(config), { wrapper: wrapper(t) });
    await waitFor(() => expect(result.current.list?.records[0]?.values.name).toBe("R1"));
    await act(async () => {
      await result.current.list!.nextPage();
    });
    expect(result.current.list!.records[0]!.values.name).toBe("R2");
  });
});
