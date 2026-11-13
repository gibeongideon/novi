import { type AuthClient, EngineProvider, LoginError, type SessionTransport } from "@novi/engine";
import { AccessDenied, SessionExpiredError, type SessionInfo } from "@novi/odoo-client";
import { I18nProvider, ThemeProvider, TooltipProvider } from "@novi/ui";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { appIdentity } from "../src/appIcons";
import { wordFilter } from "../src/CommandPalette";
import { ErrorBoundary } from "../src/ErrorBoundary";
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

const COMPANIES = {
  current_company: 1,
  allowed_companies: {
    1: { id: 1, name: "Nairobi HQ", sequence: 1 },
    3: { id: 3, name: "Mombasa Branch", sequence: 2 },
  },
};

type FakeOdoo = SessionTransport & { context: Record<string, unknown> };

function fakeOdoo(loggedIn = false): FakeOdoo {
  const user = (login = "admin"): SessionInfo => ({
    uid: 2,
    name: "Mitchell Admin",
    username: login,
    user_context: { lang: "en_US" },
    user_companies: COMPANIES,
  });
  let session: SessionInfo | null = loggedIn ? user() : null;
  const context: Record<string, unknown> = {};
  return {
    context,
    async authenticate(login, password) {
      if (password !== "admin")
        throw new AccessDenied("Wrong login/password", {
          data: { name: "odoo.exceptions.AccessDenied", message: "Wrong login/password" },
        });
      session = user(login);
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
    loadAction: async <T,>(id: number | string) => {
      if (id === 999) {
        session = null; // the Odoo session ended while browsing
        throw new SessionExpiredError("Session expired");
      }
      return {
        id,
        name: id === 300 ? "Quotations" : "Customers",
        type: "ir.actions.act_window",
        res_model: "sale.order",
      } as T;
    },
    setContext(patch) {
      Object.assign(context, patch);
    },
    async call<T>(model: string, method: string, c?: { ids?: number[]; kwargs?: Record<string, unknown> }) {
      if (model === "ir.model") return [{ model: "res.partner", name: "Contact" }] as T;
      if (method === "web_name_search") {
        const q = String(c?.kwargs?.name).toLowerCase();
        return ("azure interior".includes(q) ? [{ id: 14, display_name: "Azure Interior" }] : []) as T;
      }
      if (method === "web_read") return [{ id: c?.ids?.[0], display_name: "Azure Interior" }] as T;
      return [] as T;
    },
  };
}

function renderShell(transport: SessionTransport, path = "/", auth?: AuthClient) {
  return render(
    <EngineProvider transport={transport} db="novi_demo" auth={auth}>
      <ThemeProvider>
        <I18nProvider>
          <TooltipProvider>
            <MemoryRouter initialEntries={[path]}>
              <ShellRoutes />
            </MemoryRouter>
          </TooltipProvider>
        </I18nProvider>
      </ThemeProvider>
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
    expect((await screen.findByRole("alert")).textContent).toBe("Wrong email or password.");
  });

  it("deep links survive a reload (menu from the URL)", async () => {
    renderShell(fakeOdoo(true), "/action/301?menu=13");
    expect(await screen.findByRole("heading", { name: "Customers" })).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByRole("navigation", { name: "Breadcrumb" }).textContent).toBe("SalesOrdersCustomers"),
    );
  });
});

describe("two-factor sign-in via the gateway (P1.6.2)", () => {
  it("asks for the code after the password, then signs in; a wrong code shows a clear message", async () => {
    const odoo = fakeOdoo();
    const calls: string[] = [];
    const auth: AuthClient = {
      async login(login, password) {
        calls.push(`login:${login}:${password}`);
        return { status: "twoFactor", challenge: "c1" };
      },
      async verifyCode(challenge, code, remember) {
        calls.push(`code:${challenge}:${code}:${remember}`);
        if (code !== "123456") throw new LoginError("code", "Verification failed");
        await odoo.authenticate("twofa", "admin"); // the gateway handed the browser Odoo's session
      },
    };
    renderShell(odoo, "/", auth);
    await userEvent.type(await screen.findByLabelText("Email or login"), "twofa");
    await userEvent.type(screen.getByLabelText("Password"), "pw");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    const code = await screen.findByLabelText("Authentication code");
    await userEvent.type(code, "000000");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "That code didn't work. Use the latest code from your app.",
    );

    await userEvent.clear(code);
    await userEvent.type(code, "123456");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByRole("link", { name: "Sales" })).toBeTruthy();
    expect(calls).toEqual(["login:twofa:pw", "code:c1:000000:true", "code:c1:123456:true"]);
  });
});

describe("type-anywhere search (D-24)", () => {
  it("typing on the page opens the palette with that letter, finds a menu by its path and opens it", async () => {
    renderShell(fakeOdoo(true));
    await screen.findByRole("link", { name: "Sales" });
    await userEvent.keyboard("c");
    const input = await screen.findByPlaceholderText("Search apps, menus and records…");
    expect((input as HTMLInputElement).value).toBe("c");
    await userEvent.type(input, "ustom");
    await userEvent.click(await screen.findByText("Customers"));
    expect(await screen.findByRole("heading", { name: "Customers" })).toBeTruthy();
  });

  it("Ctrl+K and the search button open it empty", async () => {
    renderShell(fakeOdoo(true));
    await screen.findByRole("link", { name: "Sales" });
    await userEvent.keyboard("{Control>}k{/Control}");
    expect(
      ((await screen.findByPlaceholderText("Search apps, menus and records…")) as HTMLInputElement).value,
    ).toBe("");
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByPlaceholderText("Search apps, menus and records…")).toBeTruthy();
  });
});

describe("light and dark mode", () => {
  it("a single top-bar button toggles light and dark", async () => {
    renderShell(fakeOdoo(true));
    await screen.findByRole("link", { name: "Sales" });
    await userEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    await userEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});

describe("companies (P1.12.2)", () => {
  it("switching company updates the context of every call and Odoo's cids cookie", async () => {
    document.cookie = "cids=; max-age=0; path=/";
    const odoo = fakeOdoo(true);
    renderShell(odoo);
    await screen.findByRole("link", { name: "Sales" });
    await waitFor(() => expect(odoo.context.allowed_company_ids).toEqual([1]));
    await userEvent.click(screen.getByRole("button", { name: "Switch company: Nairobi HQ" }));
    await userEvent.click(await screen.findByRole("menuitemradio", { name: "Mombasa Branch" }));
    expect(odoo.context.allowed_company_ids).toEqual([3]);
    expect(document.cookie).toContain("cids=3");
    expect(screen.getByRole("button", { name: "Switch company: Mombasa Branch" })).toBeTruthy();
  });
});

describe("errors (P1.12.5)", () => {
  it("an expired Odoo session sends the user back to the login screen", async () => {
    renderShell(fakeOdoo(true), "/action/999?menu=12");
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeTruthy();
  });

  it("a crashing screen shows a recovery panel instead of a blank page", () => {
    const Bomb = () => {
      throw new Error("boom");
    };
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <I18nProvider>
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>
      </I18nProvider>,
    );
    expect(screen.getByRole("alert").textContent).toContain("Something went wrong");
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
    err.mockRestore();
  });
});

describe("record search (P1.13.2)", () => {
  it("finds a customer by name through Odoo and opens the record", async () => {
    renderShell(fakeOdoo(true));
    await screen.findByRole("link", { name: "Sales" });
    await userEvent.keyboard("azu");
    const group = await screen.findByText("Contact", {}, { timeout: 2000 }); // Odoo's model label
    expect(group).toBeTruthy();
    await userEvent.click(await screen.findByText("Azure Interior"));
    expect(await screen.findByRole("heading", { name: "Azure Interior" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open in Odoo" }).getAttribute("href")).toBe(
      "/odoo/res.partner/14",
    );
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

/** The gateway's platform API (P1.3) as the sign-up pages see it. */
function fakePlatform(progress: Record<string, unknown> = {}) {
  const posted: unknown[] = [];
  const reply = (body: unknown, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    if (url === "/api/signup/config")
      return reply({ enabled: true, workspaceUrl: "http://{slug}.localhost:8080", countries: ["KE", "UG"] });
    if (url.startsWith("/api/signup/slug")) {
      const q = new URLSearchParams(url.split("?")[1]);
      const slug = q.get("slug") ?? (q.get("company") ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
      return reply({ slug, valid: true, available: slug !== "taken" });
    }
    if (url === "/api/signup" && init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as { slug?: string };
      posted.push(body);
      return body.slug === "taken"
        ? reply({ status: "invalid", field: "slug_taken", suggestion: "taken42" }, 409)
        : reply({ status: "verify", id: "s1" }, 202);
    }
    if (url === "/api/signup/s1") return reply({ company: "Acme", slug: "acme", steps: [], ...progress });
    return reply({ status: "not_found" }, 404);
  });
  return posted;
}

describe("sign-up (P1.3)", () => {
  it("links to sign-up from the login page when the platform allows it", async () => {
    fakePlatform();
    renderShell(fakeOdoo());
    await userEvent.click(await screen.findByRole("link", { name: "Create your workspace" }));
    expect(await screen.findByRole("heading", { name: "Create your workspace" })).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it("previews the address from the company name and asks to check email", async () => {
    const posted = fakePlatform();
    renderShell(fakeOdoo(), "/signup");
    await userEvent.type(await screen.findByLabelText("Company name"), "Acme");
    expect(await screen.findByText("acme.localhost:8080")).toBeTruthy();
    await userEvent.type(screen.getByLabelText("Work email"), "owner@acme.test");
    await userEvent.type(screen.getByLabelText(/Choose a password/), "Strong-Pass-2026");
    await userEvent.click(screen.getByRole("button", { name: "Create workspace" }));
    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeTruthy();
    expect(posted[0]).toMatchObject({
      company: "Acme",
      email: "owner@acme.test",
      country: "KE",
      slug: "acme",
    });
    vi.unstubAllGlobals();
  });

  it("offers the server's suggestion when the address is taken", async () => {
    fakePlatform();
    renderShell(fakeOdoo(), "/signup");
    await userEvent.type(await screen.findByLabelText("Company name"), "Taken");
    await screen.findByText(/taken\.localhost:8080/);
    await userEvent.type(screen.getByLabelText("Work email"), "a@b.co");
    await userEvent.type(screen.getByLabelText(/Choose a password/), "Strong-Pass-2026");
    await userEvent.click(screen.getByRole("button", { name: "Create workspace" }));
    await userEvent.click(await screen.findByRole("button", { name: "taken42" }));
    expect(screen.getByLabelText("Workspace address")).toHaveProperty("value", "taken42");
    vi.unstubAllGlobals();
  });

  it("shows provisioning progress, then the way into the new workspace", async () => {
    fakePlatform({ status: "active", steps: ["clone_db"], url: "http://acme.localhost:8080" });
    renderShell(fakeOdoo(), "/signup/status/s1");
    expect(await screen.findByRole("heading", { name: "Your workspace is ready" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open workspace" }).getAttribute("href")).toBe(
      "http://acme.localhost:8080",
    );
    vi.unstubAllGlobals();
  });
});
