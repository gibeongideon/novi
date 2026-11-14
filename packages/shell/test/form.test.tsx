/**
 * The generic form view (P2.10) on a live record: layout from the arch, modifiers re-evaluated
 * on every change, status stepper, smart buttons. No Odoo needed: the record is built from a
 * parsed arch and metadata, as `loadFormView` builds it.
 */
import { EngineProvider, OdooRecord, type Rpc, type SessionTransport } from "@novi/engine";
import { buildSpec, type FormSchema, type ModelsInfo, parseView } from "@novi/odoo-meta";
import { I18nProvider } from "@novi/ui";
import { FormView } from "@novi/views";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const ARCH = `<form>
  <header>
    <button name="action_confirm" type="object" string="Confirm" class="btn-primary" invisible="state != 'draft'"/>
    <field name="state" widget="statusbar"/>
  </header>
  <sheet>
    <div class="oe_button_box" name="button_box">
      <button name="action_view_lines" type="object"><field name="line_count" widget="statinfo" string="Lines"/></button>
    </div>
    <div class="oe_title"><h1><field name="name"/></h1></div>
    <group>
      <group>
        <field name="kind"/>
        <field name="note" invisible="kind != 'other'" required="kind == 'other'"/>
      </group>
      <group><field name="done"/></group>
    </group>
    <notebook>
      <page string="Details" name="details"><field name="amount"/></page>
      <page string="More" name="more"><field name="ref"/></page>
    </notebook>
  </sheet>
</form>`;

const models: ModelsInfo = {
  "x.order": {
    fields: {
      name: { type: "char", string: "Name", required: true },
      state: {
        type: "selection",
        string: "Status",
        selection: [
          ["draft", "Draft"],
          ["done", "Done"],
        ],
      },
      line_count: { type: "integer", string: "Line Count", readonly: true },
      kind: {
        type: "selection",
        string: "Kind",
        selection: [
          ["normal", "Normal"],
          ["other", "Other"],
        ],
      },
      note: { type: "char", string: "Note" },
      done: { type: "boolean", string: "Done" },
      amount: { type: "float", string: "Amount" },
      ref: { type: "char", string: "Reference" },
    },
  },
} as never;

const transport = {
  getSessionInfo: async () => ({ uid: 2, user_context: { lang: "en_US" } }),
  call: async () => [],
  loadAction: async () => ({}),
} as unknown as SessionTransport;

function setup(values: Record<string, unknown> = {}) {
  const schema = parseView({ arch: ARCH, model: "x.order", models }) as FormSchema;
  const rpc = vi.fn(async () => ({ value: {} })) as unknown as Rpc;
  const record = new OdooRecord(
    rpc,
    { model: "x.order", models, schema, spec: buildSpec(schema) },
    {
      id: 7,
      name: "X001",
      state: "draft",
      line_count: 3,
      kind: "normal",
      note: false,
      done: false,
      amount: 2.5,
      ref: false,
      ...values,
    },
  );
  const onButton = vi.fn();
  render(
    <EngineProvider transport={transport} db="t">
      <I18nProvider>
        <FormView record={record} onButton={onButton} />
      </I18nProvider>
    </EngineProvider>,
  );
  return { record, onButton };
}

describe("form view (P2.10)", () => {
  it("lays out the arch: actions, stepper, stat chip, title, labelled fields, tabs", () => {
    setup();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "Status" }).textContent).toContain("Draft");
    expect(screen.getByRole("button", { name: /3\s*Lines/ })).toBeTruthy();
    expect((screen.getByLabelText(/Name/) as HTMLInputElement).value).toBe("X001");
    expect(screen.getByLabelText("Kind")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Details", selected: true })).toBeTruthy();
    expect(screen.queryByLabelText("Reference")).toBeNull(); // on the closed tab
  });

  it("re-evaluates invisible / required when a value changes", async () => {
    const { record } = setup();
    expect(screen.queryByLabelText(/Note/)).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText("Kind"), "other");
    expect(record.values.kind).toBe("other");
    expect(screen.getByText("Note").textContent).toContain("*");
    act(() => record.update({ state: "done" }));
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
  });

  it("sends button clicks with the arch's button", async () => {
    const { onButton } = setup();
    await userEvent.click(screen.getByRole("button", { name: /Lines/ }));
    expect(onButton).toHaveBeenCalledWith(expect.objectContaining({ name: "action_view_lines" }));
  });
});
