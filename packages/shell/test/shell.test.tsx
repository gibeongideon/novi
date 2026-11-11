import { EngineProvider, type SessionTransport } from "@novi/engine";
import { AccessDenied, SessionExpiredError, type SessionInfo } from "@novi/odoo-client";
import { I18nProvider, TooltipProvider } from "@novi/ui";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { appIdentity } from "../src/appIcons";
import { wordFilter } from "../src/CommandPalette";
import { ShellRoutes } from "../src/index";

const MENUS = {
  root: {
    id: "root",
    name: "root",
    children: [10, 20],
    appID: false,
    xmlid: "",
    actionID: false,
    actionModel: false,
    actionPath: false,
  },
  10: {
    id: 10,
    name: "Sales",
    children: [11],
    appID: 10,
    xmlid: "sale.root",
    actionID: false,
    actionModel: false,
    actionPath: false,
    webIconData: false,
  },
  11: {
    id: 11,
    name: "Orders",
    children: [12, 13],
    appID: 10,
    xmlid: "sale.orders",
    actionID: false,
    actionModel: false,
    actionPath: false,
  },
  12: {
    id: 12,
    name: "Quotations",
    children: [],
    appID: 10,
    xmlid: "sale.quotations",
    actionID: 300,
    actionModel: "ir.actions.act_window",
    actionPath: false,
  },
  13: {
    id: 13,
    name: "Customers",
    children: [],
    appID: 10,
    xmlid: "sale.customers",
    actionID: 301,
    actionModel: "ir.actions.act_window",
    actionPath: false,
  },
  20: {
    id: 20,
    name: "Discuss",
    children: [],
    appID: 20,
    xmlid: "mail.root",
    actionID: 133,
    actionModel: "ir.actions.client",
    actionPath: "discuss",
  },
};

function fakeOdoo(loggedIn = false) {
  let session: SessionInfo | null = loggedIn
    ? { uid: 2, name: "Mitchell Admin", user_context: { lang: "en_US" } }
    : null;
  const t: SessionTransport = {
    async authenticate(login, password) {
      if (password !== "admin")
        throw new AccessDenied("Wrong login/password", {
          data: { name: "odoo.exceptions.AccessDenied", message: "Wrong login/password" },
        });
      session = { uid: 2, name: "Mitchell Admin", user_context: { lang: "en_US" }, username: login };
      return session;
    },
    async getSessionInfo() {
      if (!session) throw new SessionExpiredError("expired");
      return session;
    },
    async destroy() {
      session = null;
    },
    loadMenus: async () => MENUS,
    loadAction: async <T,>(id: number | string) =>
      ({
        id,
        name: id === 300 ? "Quotations" : "Customers",
        type: "ir.actions.act_window",
        res_model: "sale.order",
      }) as T,
  };
  return t;
}

function renderShell(transport: SessionTransport, path = "/") {
  return render(
    <EngineProvider transport={transport} db="novi_demo">
      <I18nProvider>
        <TooltipProvider>
          <MemoryRouter initialEntries={[path]}>
            <ShellRoutes />
          </MemoryRouter>
        </TooltipProvider>
      </I18nProvider>
    </EngineProvider>,
  );
}

describe("shell", () => {
  it("shows the login page, signs in, lists apps and opens an app's first screen", async () => {
    renderShell(fakeOdoo());
    await userEvent.type(await screen.findByLabelText("Email or login"), "admin");
    await userEvent.type(screen.getByLabelText("Password"), "admin");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    const sales = await screen.findByRole("link", { name: "Sales" });
    expect(screen.getByRole("link", { name: "Discuss" })).toBeTruthy();
    await userEvent.click(sales);

    expect(await screen.findByRole("heading", { name: "Quotations" })).toBeTruthy();
    // sidebar shows the app's sections, with the active entry marked
    const nav = screen.getByRole("navigation", { name: "Sales" });
    expect(nav.textContent).toContain("Orders");
    expect(screen.getByRole("link", { name: "Quotations", current: "page" })).toBeTruthy();
    // breadcrumbs: Sales > Orders > Quotations
    expect(screen.getByRole("navigation", { name: "Breadcrumb" }).textContent).toBe("SalesOrdersQuotations");
    expect(screen.getByRole("link", { name: "Open in Odoo" }).getAttribute("href")).toBe("/odoo/action-300");

    // a middle breadcrumb opens that section's first screen (not the launcher)
    await userEvent.click(screen.getByRole("link", { name: "Customers" }));
    expect(await screen.findByRole("heading", { name: "Customers" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Orders" }));
    expect(await screen.findByRole("heading", { name: "Quotations" })).toBeTruthy();
  });

  it("shows Odoo's message for wrong credentials", async () => {
    renderShell(fakeOdoo());
    await userEvent.type(await screen.findByLabelText("Email or login"), "admin");
    await userEvent.type(screen.getByLabelText("Password"), "nope");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Wrong login/password");
  });

  it("deep links survive a reload (menu from the URL)", async () => {
    renderShell(fakeOdoo(true), "/action/301?menu=13");
    expect(await screen.findByRole("heading", { name: "Customers" })).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByRole("navigation", { name: "Breadcrumb" }).textContent).toBe("SalesOrdersCustomers"),
    );
  });
});

describe("type-anywhere search (D-24)", () => {
  it("typing on the page opens the palette with that letter, finds a menu by its path and opens it", async () => {
    renderShell(fakeOdoo(true));
    await screen.findByRole("link", { name: "Sales" });
    await userEvent.keyboard("c");
    const input = await screen.findByPlaceholderText("Search apps and menus…");
    expect((input as HTMLInputElement).value).toBe("c");
    await userEvent.type(input, "ustom");
    await userEvent.click(await screen.findByText("Customers"));
    expect(await screen.findByRole("heading", { name: "Customers" })).toBeTruthy();
  });

  it("Ctrl+K and the search button open it empty", async () => {
    renderShell(fakeOdoo(true));
    await screen.findByRole("link", { name: "Sales" });
    await userEvent.keyboard("{Control>}k{/Control}");
    expect(((await screen.findByPlaceholderText("Search apps and menus…")) as HTMLInputElement).value).toBe(
      "",
    );
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByPlaceholderText("Search apps and menus…")).toBeTruthy();
  });
});

describe("search ranking", () => {
  const v = (t: string) => `${t}\u0000menu-1`;
  it("matches whole typed words, not scattered letters", () => {
    expect(wordFilter(v("Contacts Configuration Contact Tags"), "contact")).toBeGreaterThan(0);
    expect(wordFilter(v("CRM Configuration Activities Activity Types"), "contact")).toBe(0);
    expect(wordFilter(v("Sales Orders Customers"), "sal cust")).toBeGreaterThan(0);
  });
  it("prefers word starts and shorter paths", () => {
    expect(wordFilter(v("Contacts"), "con")).toBeGreaterThan(wordFilter(v("Invoicing Reconcile"), "con"));
    expect(wordFilter(v("Contacts"), "contacts")).toBeGreaterThan(
      wordFilter(v("Contacts Configuration Industries"), "contacts"),
    );
  });
  it("ignores the id suffix", () => {
    expect(wordFilter("Sales\u0000menu-12", "12")).toBe(0);
  });
});

describe("NOVI app identity (D-23)", () => {
  const node = (xmlid: string) => ({ id: 1, name: "X", appId: 1, xmlid, children: [] });
  it("maps apps by owning module and xmlid to icon, tile colour and group", () => {
    expect(appIdentity(node("sale.sale_menu_root"))).toMatchObject({ tone: 1, group: "sell" });
    expect(appIdentity(node("sale.sale_menu_root")).icon.displayName).toBe("ShoppingBag");
    expect(appIdentity(node("base.menu_administration")).group).toBe("admin");
  });
  it("unknown apps get a generic icon, 'other' group and a stable palette colour", () => {
    const a = appIdentity(node("custom_module.root"));
    expect(a.icon.displayName).toBe("AppWindow");
    expect(a.group).toBe("other");
    expect(appIdentity(node("custom_module.root")).tone).toBe(a.tone);
  });
});
