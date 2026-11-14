/**
 * Same-origin reverse proxy to each tenant's own Odoo (D-27). The browser only ever talks to the
 * tenant's NOVI host, so Odoo's own session cookie works there in every hosting mode, with no
 * session vault. Only the Odoo routes the web app needs are proxied (P1.8.2 allow-list).
 */
import { request as httpRequest } from "node:http";
import type { Duplex } from "node:stream";

import replyFrom from "@fastify/reply-from";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { Tenant } from "./tenants/registry.js";

/** Route prefixes the NOVI web app uses (PLAN §1). Everything else stays unreachable. */
// /auth_oauth/: the SSO return leg (P1.14), so Odoo sets its session on the tenant's own host
export const PROXIED_PREFIXES = [
  "/web/",
  "/json/2/",
  "/mail/",
  "/report/",
  "/odoo",
  "/websocket",
  "/auth_oauth/",
] as const;
/** Never exposed, even under an allowed prefix. */
export const BLOCKED_PREFIXES = ["/web/database"] as const;

export const isProxied = (url: string) =>
  PROXIED_PREFIXES.some((p) => url === p.replace(/\/$/, "") || url.startsWith(p)) &&
  !BLOCKED_PREFIXES.some((p) => url.startsWith(p));

/** Headers Odoo needs behind a proxy (`proxy_mode`): the browser's host, IP and scheme. */
function forwardedHeaders(req: { headers: Record<string, unknown>; ip: string; protocol: string }) {
  return {
    "x-forwarded-for": req.ip,
    "x-forwarded-host": String(req.headers.host ?? ""),
    "x-forwarded-proto": req.protocol,
  };
}

export async function registerProxy(app: FastifyInstance): Promise<void> {
  await app.register(async (scope) => {
    // stream bodies through untouched (JSON, form posts, file uploads)
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser("*", (_req, payload, done) => done(null, payload));
    await scope.register(replyFrom, { http: { requestOptions: { timeout: 120_000 } } });

    const handler = async (req: FastifyRequest, reply: FastifyReply) => {
      const url = req.url;
      if (!isProxied(url)) return reply.code(404).send({ status: "not_found" });
      const tenant = req.tenant!;
      return reply.from(`${tenant.odooUrl}${url}`, {
        // keep the browser's Host: Odoo builds URLs from it and the websocket Origin check needs it (D-17)
        rewriteRequestHeaders: (_r, headers) => ({
          ...headers,
          host: req.headers.host ?? "",
          ...forwardedHeaders(req),
        }),
        rewriteHeaders: (headers) => frameableBySameOrigin(headers),
      });
    };
    for (const p of PROXIED_PREFIXES) {
      const base = p.replace(/\/$/, "");
      scope.all(base, handler);
      scope.all(`${base}/*`, handler);
    }
  });
}

/** Websocket upgrades (Odoo bus) piped to the tenant's Odoo with the browser's Host and Origin kept. */
export function registerWebsocketProxy(
  app: FastifyInstance,
  resolve: (host?: string) => Tenant | null,
): void {
  app.server.on("upgrade", (req, socket: Duplex, head: Buffer) => {
    const tenant = resolve(req.headers.host);
    if (!tenant || tenant.status !== "active" || !req.url?.startsWith("/websocket")) {
      socket.end("HTTP/1.1 404 Not Found\r\n\r\n");
      return;
    }
    const target = new URL(tenant.wsUrl ?? tenant.odooUrl);
    const upstream = httpRequest({
      host: target.hostname,
      port: target.port,
      path: req.url,
      method: "GET",
      headers: {
        ...req.headers,
        "x-forwarded-for": req.socket.remoteAddress ?? "",
        "x-forwarded-host": req.headers.host ?? "",
      },
    });
    upstream.on("upgrade", (res, upSocket, upHead) => {
      const lines = [`HTTP/1.1 ${res.statusCode} ${res.statusMessage}`];
      for (let i = 0; i < res.rawHeaders.length; i += 2)
        lines.push(`${res.rawHeaders[i]}: ${res.rawHeaders[i + 1]}`);
      socket.write(lines.join("\r\n") + "\r\n\r\n");
      if (upHead.length) socket.write(upHead);
      if (head.length) upSocket.write(head);
      upSocket.pipe(socket).pipe(upSocket);
      const close = () => {
        upSocket.destroy();
        socket.destroy();
      };
      upSocket.on("error", close);
      socket.on("error", close);
    });
    upstream.on("response", (res) => {
      socket.end(`HTTP/1.1 ${res.statusCode} ${res.statusMessage}\r\n\r\n`);
    });
    upstream.on("error", () => socket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n"));
    upstream.end();
  });
}

/**
 * Odoo forbids framing its web client (`X-Frame-Options: DENY`). NOVI embeds Odoo's own screens
 * for client actions it doesn't render yet (P2.8.5, D-39), always from the same origin, so the
 * gateway relaxes DENY to SAMEORIGIN: other sites still can't frame Odoo (clickjacking stays
 * blocked); only NOVI, on the same host, can.
 */
export function frameableBySameOrigin<H extends Record<string, unknown>>(headers: H): H {
  const xfo = headers["x-frame-options"];
  return typeof xfo === "string" && xfo.toUpperCase() === "DENY"
    ? { ...headers, "x-frame-options": "SAMEORIGIN" }
    : headers;
}
