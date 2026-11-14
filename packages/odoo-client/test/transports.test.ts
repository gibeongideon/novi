import { describe, expect, it, vi } from "vitest";

import {
  AbortError,
  AccessError,
  capabilitiesFor,
  CookieJar,
  getVersion,
  Json2Transport,
  JsonRpcTransport,
  NetworkError,
  Orm,
  RedirectWarning,
  SessionExpiredError,
  TwoFactorRequiredError,
  UserError,
  ValidationError,
} from "../src/index.js";

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

function mockFetch(handler: Handler) {
  const calls: { url: string; init: RequestInit; body: unknown }[] = [];
  const fn = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init, body: init.body ? JSON.parse(String(init.body)) : undefined });
    return handler(url, init);
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

const rpcResult = (result: unknown, headers?: Record<string, string>) =>
  json({ jsonrpc: "2.0", id: 1, result }, 200, headers);

const rpcError = (name: string, message: string, extra: Record<string, unknown> = {}, code = 200) =>
  json({
    jsonrpc: "2.0",
    id: 1,
    error: { code, message: "Odoo Server Error", data: { name, message, ...extra } },
  });

describe("JsonRpcTransport", () => {
  it("sends the call_kw envelope with ids as first arg and merged context", async () => {
    const { fetch, calls } = mockFetch(() => rpcResult([{ id: 1 }]));
    const t = new JsonRpcTransport({ baseUrl: "http://odoo:8069/", fetch, context: { lang: "en_US" } });
    const out = await t.call("res.partner", "web_read", {
      ids: [1],
      kwargs: { specification: { name: {} } },
      context: { tz: "Africa/Nairobi" },
    });
    expect(out).toEqual([{ id: 1 }]);
    expect(calls[0]!.url).toBe("http://odoo:8069/web/dataset/call_kw/res.partner/web_read");
    expect(calls[0]!.body).toMatchObject({
      jsonrpc: "2.0",
      method: "call",
      params: {
        model: "res.partner",
        method: "web_read",
        args: [[1]],
        kwargs: { specification: { name: {} }, context: { lang: "en_US", tz: "Africa/Nairobi" } },
      },
    });
  });

  it("model methods get empty positional args", async () => {
    const { fetch, calls } = mockFetch(() => rpcResult(3));
    const t = new JsonRpcTransport({ baseUrl: "http://o", fetch });
    await t.call("res.partner", "search_count", { kwargs: { domain: [] } });
    expect((calls[0]!.body as { params: { args: unknown[] } }).params.args).toEqual([]);
  });

  it("maps Odoo exceptions to typed errors", async () => {
    const cases: [string, unknown][] = [
      ["odoo.exceptions.UserError", UserError],
      ["odoo.exceptions.ValidationError", ValidationError],
      ["odoo.exceptions.AccessError", AccessError],
    ];
    for (const [name, Ctor] of cases) {
      const { fetch } = mockFetch(() => rpcError(name, "nope"));
      const t = new JsonRpcTransport({ baseUrl: "http://o", fetch });
      const err = await t.call("x", "write", { ids: [1] }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(Ctor as new () => Error);
      expect((err as UserError).message).toBe("nope");
      expect((err as UserError).odooName).toBe(name);
    }
  });

  it("exposes RedirectWarning action and button text", async () => {
    const { fetch } = mockFetch(() =>
      rpcError("odoo.exceptions.RedirectWarning", "Configure first", {
        arguments: ["Configure first", 42, "Open settings", { active_id: 1 }],
      }),
    );
    const t = new JsonRpcTransport({ baseUrl: "http://o", fetch });
    const err = (await t.call("x", "action_post", { ids: [1] }).catch((e: unknown) => e)) as RedirectWarning;
    expect(err).toBeInstanceOf(RedirectWarning);
    expect(err.action).toBe(42);
    expect(err.buttonText).toBe("Open settings");
    expect(err.additionalContext).toEqual({ active_id: 1 });
  });

  it("detects session expiry (code 100) and calls the hook", async () => {
    const onSessionExpired = vi.fn();
    const { fetch } = mockFetch(() =>
      rpcError("odoo.http.SessionExpiredException", "Session expired", {}, 100),
    );
    const t = new JsonRpcTransport({ baseUrl: "http://o", fetch, onSessionExpired });
    await expect(t.call("x", "read", { ids: [1] }, { retry: false })).rejects.toBeInstanceOf(
      SessionExpiredError,
    );
    expect(onSessionExpired).toHaveBeenCalledOnce();
  });

  it("keeps session_id from Set-Cookie and sends it back", async () => {
    let n = 0;
    const { fetch, calls } = mockFetch(() =>
      n++ === 0
        ? rpcResult(
            { uid: 2, user_context: { lang: "fr_FR" } },
            { "Set-Cookie": "session_id=abc123; Path=/; HttpOnly" },
          )
        : rpcResult({ uid: 2 }),
    );
    const t = new JsonRpcTransport({ baseUrl: "http://o", fetch, db: "demo" });
    const info = await t.authenticate("admin", "admin");
    expect(info.uid).toBe(2);
    expect(t.sessionId).toBe("abc123");
    expect(t.context).toMatchObject({ lang: "fr_FR" });
    await t.getSessionInfo();
    expect((calls[1]!.init.headers as Record<string, string>).Cookie).toBe("session_id=abc123");
    expect(calls[0]!.body).toMatchObject({ params: { db: "demo", login: "admin", password: "admin" } });
  });

  it("raises TwoFactorRequiredError when authenticate returns uid null", async () => {
    const { fetch } = mockFetch(() => rpcResult({ uid: null }));
    const t = new JsonRpcTransport({ baseUrl: "http://o", fetch, db: "demo" });
    await expect(t.authenticate("u", "p")).rejects.toBeInstanceOf(TwoFactorRequiredError);
  });

  it("de-duplicates identical in-flight reads", async () => {
    const { fetch, calls } = mockFetch(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return rpcResult({ length: 0, records: [] });
    });
    const t = new JsonRpcTransport({ baseUrl: "http://o", fetch });
    const call = { kwargs: { domain: [], specification: {} } };
    const [a, b] = await Promise.all([
      t.call("res.partner", "web_search_read", call),
      t.call("res.partner", "web_search_read", call),
    ]);
    expect(a).toEqual(b);
    expect(calls).toHaveLength(1);
  });

  it("retries reads on 503 but never writes", async () => {
    let n = 0;
    const flaky = mockFetch(() => (n++ < 1 ? new Response("busy", { status: 503 }) : rpcResult(5)));
    const t = new JsonRpcTransport({ baseUrl: "http://o", fetch: flaky.fetch, retry: { baseDelayMs: 1 } });
    await expect(t.call("x", "search_count", { kwargs: { domain: [] } })).resolves.toBe(5);
    expect(flaky.calls).toHaveLength(2);

    const down = mockFetch(() => new Response("busy", { status: 503 }));
    const w = new JsonRpcTransport({ baseUrl: "http://o", fetch: down.fetch, retry: { baseDelayMs: 1 } });
    await expect(w.call("x", "write", { ids: [1], kwargs: { vals: {} } })).rejects.toBeInstanceOf(
      NetworkError,
    );
    expect(down.calls).toHaveLength(1);
  });

  it("turns HTML proxy pages into NetworkError", async () => {
    const { fetch } = mockFetch(() => new Response("<html>Bad gateway</html>", { status: 502 }));
    const t = new JsonRpcTransport({ baseUrl: "http://o", fetch, retry: { retries: 0 } });
    await expect(t.call("x", "write", { ids: [1] })).rejects.toBeInstanceOf(NetworkError);
  });

  it("supports AbortSignal", async () => {
    const { fetch } = mockFetch(
      (_u, init) =>
        new Promise((_res, rej) => init.signal?.addEventListener("abort", () => rej(new Error("aborted")))),
    );
    const t = new JsonRpcTransport({ baseUrl: "http://o", fetch });
    const ctrl = new AbortController();
    const p = t.call("x", "read", { ids: [1] }, { signal: ctrl.signal });
    ctrl.abort();
    await expect(p).rejects.toBeInstanceOf(AbortError);
  });

  it("treats a redirect on GET http routes as session expiry", async () => {
    const { fetch } = mockFetch(
      () => new Response(null, { status: 303, headers: { Location: "/web/login" } }),
    );
    const t = new JsonRpcTransport({ baseUrl: "http://o", fetch });
    await expect(t.loadMenus()).rejects.toBeInstanceOf(SessionExpiredError);
  });
});

describe("default headers", () => {
  it("are sent with every request; per-request headers win", async () => {
    const { fetch, calls } = mockFetch(() => rpcResult(1));
    const t = new JsonRpcTransport({
      baseUrl: "http://o",
      fetch,
      headers: { "X-Forwarded-For": "41.90.1.2" },
    });
    await t.call("x", "search_count", { kwargs: { domain: [] } });
    expect((calls[0]!.init.headers as Record<string, string>)["X-Forwarded-For"]).toBe("41.90.1.2");
  });
});

describe("Json2Transport", () => {
  it("posts named args with bearer auth and database header", async () => {
    const { fetch, calls } = mockFetch(() => json([{ id: 7, name: "Azure" }]));
    const t = new Json2Transport({
      baseUrl: "http://o",
      fetch,
      apiKey: "KEY",
      db: "demo",
      context: { lang: "en_US" },
    });
    const out = await t.call("res.partner", "web_read", {
      ids: [7],
      kwargs: { specification: { name: {} } },
    });
    expect(out).toEqual([{ id: 7, name: "Azure" }]);
    expect(calls[0]!.url).toBe("http://o/json/2/res.partner/web_read");
    expect(calls[0]!.body).toEqual({ ids: [7], specification: { name: {} }, context: { lang: "en_US" } });
    const h = calls[0]!.init.headers as Record<string, string>;
    expect(h.Authorization).toBe("bearer KEY");
    expect(h["X-Odoo-Database"]).toBe("demo");
  });

  it("maps HTTP status + serialised exception", async () => {
    const { fetch } = mockFetch(() => json({ name: "odoo.exceptions.AccessError", message: "denied" }, 403));
    const t = new Json2Transport({ baseUrl: "http://o", fetch, apiKey: "K" });
    const err = (await t.call("x", "unlink", { ids: [1] }).catch((e: unknown) => e)) as AccessError;
    expect(err).toBeInstanceOf(AccessError);
    expect(err.status).toBe(403);
  });

  it("treats 401 as an invalid/expired key", async () => {
    const onSessionExpired = vi.fn();
    const { fetch } = mockFetch(() =>
      json({ name: "werkzeug.exceptions.Unauthorized", message: "Invalid apikey" }, 401),
    );
    const t = new Json2Transport({ baseUrl: "http://o", fetch, apiKey: "bad", onSessionExpired });
    await expect(t.call("x", "search_count", {}, { retry: false })).rejects.toBeInstanceOf(
      SessionExpiredError,
    );
    expect(onSessionExpired).toHaveBeenCalled();
  });
});

describe("Orm helpers", () => {
  it("builds web_search_read kwargs", async () => {
    const { fetch, calls } = mockFetch(() => rpcResult({ length: 0, records: [] }));
    const orm = new Orm(new JsonRpcTransport({ baseUrl: "http://o", fetch }));
    await orm.webSearchRead("sale.order", {
      domain: [["state", "=", "sale"]],
      specification: { name: {} },
      limit: 80,
      countLimit: 10001,
    });
    expect(calls[0]!.body).toMatchObject({
      params: {
        kwargs: {
          domain: [["state", "=", "sale"]],
          specification: { name: {} },
          limit: 80,
          count_limit: 10001,
        },
      },
    });
  });

  it("onchange passes values, field_names and fields_spec", async () => {
    const { fetch, calls } = mockFetch(() => rpcResult({ value: {} }));
    const orm = new Orm(new JsonRpcTransport({ baseUrl: "http://o", fetch }));
    await orm.onchange("sale.order", [], { partner_id: 3 }, ["partner_id"], { partner_id: {} });
    expect(calls[0]!.body).toMatchObject({
      params: { args: [[]], kwargs: { values: { partner_id: 3 }, field_names: ["partner_id"] } },
    });
  });
});

describe("version + cookies", () => {
  it("reads /web/version and derives capabilities", async () => {
    const { fetch } = mockFetch(() => json({ version: "20.0", version_info: [20, 0, 0, "final", 0, ""] }));
    const v = await getVersion({ baseUrl: "http://o", fetch });
    expect(capabilitiesFor(v)).toEqual({ major: 20, json2: true, legacyRpc: true });
  });

  it("cookie jar drops expired cookies", () => {
    const jar = new CookieJar();
    jar.store(new Response(null, { headers: { "Set-Cookie": "session_id=a; Path=/" } }));
    expect(jar.header()).toBe("session_id=a");
    jar.store(new Response(null, { headers: { "Set-Cookie": "session_id=; Max-Age=0; Path=/" } }));
    expect(jar.header()).toBeUndefined();
  });
});

describe("call context", () => {
  it("merges a context given in kwargs with the session's, never drops it", async () => {
    const m = mockFetch(() => rpcResult(true));
    const t = new JsonRpcTransport({ baseUrl: "http://odoo", db: "db", fetch: m.fetch });
    t.setContext({ lang: "en_US", allowed_company_ids: [1] });
    await t.call("x.wizard", "onchange", {
      ids: [],
      kwargs: { values: {}, context: { active_ids: [42], active_model: "sale.order" } },
    });
    const body = m.calls[0]!.body as { params: { kwargs: { context: Record<string, unknown> } } };
    expect(body.params.kwargs.context).toEqual({
      lang: "en_US",
      allowed_company_ids: [1],
      active_ids: [42],
      active_model: "sale.order",
    });
  });
});
