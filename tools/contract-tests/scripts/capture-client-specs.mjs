/**
 * Oracle for P2.4: what Odoo's own web client requests. Drives the official client of the dev
 * Odoo in headless Chromium (DevTools protocol), opens a set of screens and records each
 * `get_views` answer and each `web_search_read` / `web_read` specification. NOVI's spec builder
 * is then compared against it. Observation only (no Odoo code is copied); output is Odoo-derived,
 * so it stays in .cache/client-specs.json and is never committed.
 *   node tools/contract-tests/scripts/capture-client-specs.mjs
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import WebSocket from "ws";

const ODOO = process.env.ODOO_URL ?? "http://localhost:18069";
const PORT = 9333;
const OUT = new URL("../../../.cache/client-specs.json", import.meta.url);
// [action xmlid, open the first record too?]
const SCREENS = [
  ["sale.action_quotations_with_onboarding", true],
  ["sale.action_orders", false],
  ["account.action_move_out_invoice_type", true],
  ["account.action_move_in_invoice_type", false],
  ["contacts.action_contacts", true],
  ["crm.crm_lead_action_pipeline", true],
  ["stock.action_picking_tree_all", true],
  ["purchase.purchase_rfq", true],
  ["hr.open_view_employee_list_my", true],
  ["project.open_view_project_all", false],
  ["product.product_template_action", true],
];

const dir = join(homedir(), "novi-chrome-profile"); // snap Chromium: under $HOME, not a hidden folder
mkdirSync(dir, { recursive: true });
spawn(
  "chromium",
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${dir}`,
    "--window-size=1400,900",
    "about:blank",
  ],
  { stdio: "ignore" },
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let page;
for (let i = 0; i < 50 && !page; i++) {
  await sleep(200);
  page = await fetch(`http://127.0.0.1:${PORT}/json`)
    .then((r) => r.json())
    .then(
      (t) => t.find((x) => x.type === "page"),
      () => undefined,
    );
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.once("open", r));
let seq = 0;
const pending = new Map();
const listeners = [];
ws.on("message", (raw) => {
  const m = JSON.parse(raw);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m.result ?? {});
    pending.delete(m.id);
  } else if (m.method) listeners.forEach((l) => l(m));
});
const send = (method, params = {}) =>
  new Promise((r) => {
    const id = ++seq;
    pending.set(id, r);
    ws.send(JSON.stringify({ id, method, params }));
  });
const evalJs = (expression) =>
  send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }).then(
    (r) => r.result?.value,
  );

const captures = [];
let seen = 0;
let step = "login";
const requests = new Map();
listeners.push(async (m) => {
  if (m.method === "Network.requestWillBeSent" && m.params.request.url.includes("/web/dataset/call_kw")) {
    seen++;
    // large bodies aren't inlined in the event: fetch them
    const raw =
      m.params.request.postData ??
      (await send("Network.getRequestPostData", { requestId: m.params.requestId })).postData ??
      "{}";
    const body = JSON.parse(raw).params ?? {};
    if (["get_views", "web_search_read", "web_read"].includes(body.method))
      requests.set(m.params.requestId, { step, model: body.model, method: body.method, kwargs: body.kwargs });
  }
  if (m.method === "Network.loadingFinished" && requests.has(m.params.requestId)) {
    const req = requests.get(m.params.requestId);
    requests.delete(m.params.requestId);
    if (req.method === "get_views") {
      const r = await send("Network.getResponseBody", { requestId: m.params.requestId });
      captures.push({ ...req, result: JSON.parse(r.body ?? "{}").result });
    } else captures.push({ ...req, specification: req.kwargs.specification });
  }
});
await send("Network.enable");
await send("Page.enable");
const go = async (url, settle = 3500) => {
  await send("Page.navigate", { url });
  await sleep(settle);
};

await go(`${ODOO}/web/login`, 1500);
await evalJs(
  `document.querySelector('input[name=login]').value='admin';document.querySelector('input[name=password]').value='admin';document.querySelector('form.oe_login_form, form').submit();`,
);
await sleep(3000);
console.log("after login:", await evalJs("location.href"));
for (const [action, openRecord] of SCREENS) {
  step = `${action}:main`;
  await go(`${ODOO}/odoo/action-${action}`);
  if (openRecord) {
    const id = captures.filter((c) => c.step === step && c.method === "web_search_read").length
      ? await evalJs(
          `(async()=>{const r=await fetch('/web/dataset/call_kw',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',params:{model:${JSON.stringify(captures.find((c) => c.step === step && c.method === "web_search_read")?.model)},method:'search',args:[[]],kwargs:{limit:1}}})});return (await r.json()).result[0]})()`,
        )
      : undefined;
    if (id) {
      step = `${action}:form`;
      await go(`${ODOO}/odoo/action-${action}/${id}`);
    }
  }
}
writeFileSync(OUT, JSON.stringify(captures));
console.log(
  `captured ${captures.length} calls (${captures.filter((c) => c.method !== "get_views").length} reads) → ${OUT.pathname}`,
);
console.log(`call_kw requests seen: ${seen}`);
await send("Browser.close").catch(() => undefined);
ws.close();
