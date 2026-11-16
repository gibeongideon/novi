/**
 * The generic kanban card (P2.11): values placed by role through the field widgets, Odoo-only
 * widgets left out, and card edits (priority stars) saved at once.
 */
import { EngineProvider, OdooRecord, RecordList, type Rpc, type SessionTransport } from "@novi/engine";
import { buildSpec, type KanbanSchema, type ModelsInfo, parseView } from "@novi/odoo-meta";
import { I18nProvider } from "@novi/ui";
import { KanbanView } from "@novi/views";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const models = {
  "x.lead": {
    fields: {
      name: { type: "char", string: "Name" },
      partner_id: { type: "many2one", string: "Customer", relation: "res.partner" },
      priority: {
        type: "selection",
        string: "Priority",
        selection: [
          ["0", "Normal"],
          ["1", "Good"],
          ["2", "Very good"],
        ],
      },
      rotting_days: { type: "integer", string: "Rotting" },
    },
  },
} as never as ModelsInfo;

const ARCH = `<kanban><templates><t t-name="card">
  <field name="name" class="fw-bold"/>
  <field name="partner_id"/>
  <footer><field name="priority" widget="priority"/><field name="rotting_days" widget="rotting_days"/></footer>
</t></templates></kanban>`;

const transport = {
  getSessionInfo: async () => ({ uid: 2, user_context: { lang: "en_US" } }),
  call: async () => [],
  loadAction: async () => ({}),
} as unknown as SessionTransport;

describe("kanban card (P2.11)", () => {
  it("shows the title, the customer and the stars; Odoo-only widgets stay out; stars save", async () => {
    const schema = parseView({ arch: ARCH, model: "x.lead", models }) as KanbanSchema;
    const rpc = vi.fn(async (_m: string, method: string) =>
      method === "web_save" ? [{ id: 1, name: "Big deal", priority: "2", rotting_days: 9 }] : [],
    ) as unknown as Rpc;
    const config = { model: "x.lead", models, schema, spec: buildSpec(schema) };
    const list = new RecordList(rpc, config);
    list.records = [
      new OdooRecord(rpc, config, {
        id: 1,
        name: "Big deal",
        partner_id: { id: 7, display_name: "Acme" },
        priority: "1",
        rotting_days: 9,
      }),
    ];
    const onOpen = vi.fn();
    render(
      <EngineProvider transport={transport} db="t">
        <I18nProvider>
          <KanbanView schema={schema} list={list} onOpen={onOpen} />
        </I18nProvider>
      </EngineProvider>,
    );
    const card = screen.getByRole("article");
    expect(card.textContent).toContain("Big deal");
    expect(card.textContent).toContain("Acme");
    expect(card.textContent).not.toContain("9"); // rotting_days: an Odoo widget NOVI doesn't have
    await userEvent.click(screen.getByRole("button", { name: "Very good" }));
    expect(rpc).toHaveBeenCalledWith(
      "x.lead",
      "web_save",
      expect.objectContaining({ ids: [1], kwargs: expect.objectContaining({ vals: { priority: "2" } }) }),
    );
    expect(onOpen).not.toHaveBeenCalled(); // the star click doesn't open the record
    await userEvent.click(card);
    expect(onOpen).toHaveBeenCalled();
  });
});
