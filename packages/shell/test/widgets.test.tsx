/**
 * Field widgets (P2.13): each resolved through the registry by type and arch `widget`, as the
 * views resolve them, and driven like a user would.
 */
import { EngineProvider, type SessionTransport } from "@novi/engine";
import { type FieldProps, fieldRegistry } from "@novi/fields";
import { I18nProvider } from "@novi/ui";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const transport = {
  getSessionInfo: async () => ({ uid: 2, user_context: { lang: "en_US" } }),
  call: async (_model: string, method: string, c?: { kwargs?: { name?: string } }) =>
    method === "web_name_search" && "urgent".startsWith(String(c?.kwargs?.name ?? "").toLowerCase())
      ? [{ id: 9, display_name: "Urgent" }]
      : [],
  loadAction: async () => ({}),
} as unknown as SessionTransport;

function show(type: string, widget: string | undefined, props: Partial<FieldProps>) {
  const W = fieldRegistry.resolve(type, widget).component;
  const onChange = vi.fn();
  render(
    <EngineProvider transport={transport} db="t">
      <I18nProvider>
        <W
          name="f"
          value={false}
          meta={{ type, string: "Field" } as never}
          options={{}}
          mode="edit"
          readonly={false}
          required={false}
          context={{}}
          label="Field"
          onChange={onChange}
          {...props}
        />
      </I18nProvider>
    </EngineProvider>,
  );
  return onChange;
}

const selection = [
  ["0", "Normal"],
  ["1", "Good"],
  ["2", "Very Good"],
];

describe("field widgets (P2.13)", () => {
  it("email, phone and url read as links", () => {
    show("char", "email", { value: "ann@example.com", mode: "read" });
    show("char", "phone", { value: "+254 700 000 000", mode: "read" });
    show("char", "url", { value: "example.com", mode: "read" });
    expect(screen.getByRole("link", { name: "ann@example.com" }).getAttribute("href")).toBe(
      "mailto:ann@example.com",
    );
    expect(screen.getByRole("link", { name: "+254 700 000 000" }).getAttribute("href")).toBe(
      "tel:+254700000000",
    );
    expect(screen.getByRole("link", { name: "example.com" }).getAttribute("href")).toBe(
      "https://example.com",
    );
  });

  it("percentage shows 0.15 as 15 and saves what is typed as a fraction", () => {
    const onChange = show("float", "percentage", { value: 0.15 });
    const input = screen.getByLabelText("Field") as HTMLInputElement;
    expect(input.value).toBe("15");
    fireEvent.change(input, { target: { value: "20" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(0.2);
  });

  it("float_time reads and types hours:minutes", () => {
    const onChange = show("float", "float_time", { value: 1.5 });
    const input = screen.getByLabelText("Field") as HTMLInputElement;
    expect(input.value).toBe("01:30");
    fireEvent.change(input, { target: { value: "2:15" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(2.25);
  });

  it("boolean_toggle is a switch", async () => {
    const onChange = show("boolean", "boolean_toggle", { value: false });
    await userEvent.click(screen.getByRole("switch", { name: "Field" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("radio shows every option", async () => {
    const onChange = show("selection", "radio", { meta: { type: "selection", selection } as never });
    await userEvent.click(screen.getByRole("radio", { name: "Good" }));
    expect(onChange).toHaveBeenCalledWith("1");
  });

  it("priority stars set a level, and clicking the current one clears it", async () => {
    const onChange = show("selection", "priority", {
      value: "1",
      mode: "read",
      meta: { type: "selection", selection } as never,
    });
    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Very Good" }));
    expect(onChange).toHaveBeenLastCalledWith("2");
    await userEvent.click(screen.getByRole("button", { name: "Good" }));
    expect(onChange).toHaveBeenLastCalledWith("0");
  });

  it("many2many_tags removes a tag and adds one found by Odoo", async () => {
    const value = [{ id: 1, display_name: "VIP" }];
    const onChange = show("many2many", "many2many_tags", {
      value,
      meta: { type: "many2many", relation: "res.partner.category" } as never,
    });
    await userEvent.click(screen.getByRole("button", { name: "Remove VIP" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
    await userEvent.type(screen.getByRole("combobox", { name: "Field" }), "urg");
    await userEvent.click(await screen.findByRole("option", { name: "Urgent" }));
    expect(onChange).toHaveBeenLastCalledWith([...value, { id: 9, display_name: "Urgent" }]);
  });

  it("unknown widgets use the type's widget", () => {
    expect(fieldRegistry.resolve("many2one", "some_future_widget").source).toBe("type");
  });
});
