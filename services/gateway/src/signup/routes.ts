/**
 * Self-service sign-up (P1.3), served on the platform host only (not on workspaces).
 *   GET  /api/signup/config        → { enabled, workspaceUrl, countries, minPasswordLength }
 *   POST /api/signup               → 202 { id }  (sends the verification email)
 *   GET  /api/signup/verify?token  → 302 /signup/status/<id>  (queues provisioning)
 *   GET  /api/signup/:id           → progress for the status page
 * The provisioner (separate process with Docker/DB rights) does the rest (P1.4).
 */
import { randomBytes } from "node:crypto";

import type { SignupStore } from "@novi/provisioner";
import {
  type Mailer,
  MIN_PASSWORD_LENGTH,
  platformConfig,
  seal,
  SLUG_RE,
  slugify,
  SUPPORTED_COUNTRIES,
} from "@novi/provisioner";
import type { FastifyInstance, FastifyRequest } from "fastify";

import { rateLimiter } from "../rateLimit.js";
import type { FileTenantRegistry } from "../tenants/registry.js";
import { normalizeHost } from "../tenants/registry.js";

export interface SignupDeps {
  store: SignupStore;
  key: Buffer;
  mailer: Mailer;
  registry: FileTenantRegistry;
  platformHosts: string[];
  /** Max sign-up attempts per IP per hour (bot protection without a captcha). */
  perIpPerHour?: number;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function registerSignupRoutes(app: FastifyInstance, d: SignupDeps): void {
  const cfg = platformConfig();
  const allow = rateLimiter(d.perIpPerHour ?? 5, 3600_000);
  const isPlatform = (req: FastifyRequest) => d.platformHosts.includes(normalizeHost(req.headers.host));
  const origin = (req: FastifyRequest) => `${req.protocol}://${req.headers.host}`;
  const slugFree = (slug: string) => !d.store.slugTaken(slug) && !d.registry.bySlug(slug);

  app.get("/api/signup/config", async (req) => ({
    enabled: isPlatform(req),
    workspaceUrl: cfg.workspaceUrl,
    countries: SUPPORTED_COUNTRIES,
    minPasswordLength: MIN_PASSWORD_LENGTH,
  }));

  /** The suggested workspace name for a company (one naming rule: the server's slugify). */
  app.get<{ Querystring: { company?: string; slug?: string } }>("/api/signup/slug", async (req) => {
    const slug = (req.query.slug || slugify(req.query.company ?? "")).toLowerCase();
    return { slug, valid: SLUG_RE.test(slug), available: SLUG_RE.test(slug) && slugFree(slug) };
  });

  app.post<{
    Body: { company?: string; email?: string; password?: string; country?: string; slug?: string };
  }>("/api/signup", async (req, reply) => {
    if (!isPlatform(req)) return reply.code(404).send({ status: "not_found" });
    if (!allow(req.ip)) return reply.code(429).send({ status: "invalid", field: "rate" });

    const b = req.body ?? {};
    const company = (b.company ?? "").trim();
    const email = (b.email ?? "").trim().toLowerCase();
    const slug = (b.slug ?? slugify(company)).trim().toLowerCase();
    const invalid = (field: string) => reply.code(400).send({ status: "invalid", field });
    if (company.length < 2 || company.length > 80) return invalid("company");
    if (!EMAIL_RE.test(email)) return invalid("email");
    if ((b.password ?? "").length < MIN_PASSWORD_LENGTH) return invalid("password");
    if (!SUPPORTED_COUNTRIES.includes(b.country as (typeof SUPPORTED_COUNTRIES)[number]))
      return invalid("country");
    if (!SLUG_RE.test(slug)) return invalid("slug");
    if (!slugFree(slug))
      return reply.code(409).send({
        status: "invalid",
        field: "slug_taken",
        suggestion: `${slug}${(randomBytes(1)[0]! % 90) + 10}`,
      });

    const verifyToken = randomBytes(24).toString("base64url");
    const s = d.store.create({
      slug,
      company,
      country: b.country!,
      email,
      passwordSealed: seal(b.password!, d.key),
      status: "verify",
      verifyToken,
    });
    const link = `${origin(req)}/api/signup/verify?token=${verifyToken}`;
    await d.mailer.send(
      email,
      `Confirm your ${company} workspace`,
      `Hello,\n\nConfirm your email to create your NOVI workspace for ${company}:\n\n  ${link}\n\nIf you didn't sign up, ignore this email.\n`,
    );
    return reply.code(202).send({ status: "verify", id: s.id });
  });

  app.get<{ Querystring: { token?: string } }>("/api/signup/verify", async (req, reply) => {
    const s = d.store.byToken(req.query.token ?? "");
    if (!s || s.status !== "verify") return reply.redirect("/signup?invalid=1");
    d.store.update(s.id, { status: "queued", verifyToken: undefined });
    return reply.redirect(`/signup/status/${s.id}`);
  });

  app.get<{ Params: { id: string } }>("/api/signup/:id", async (req, reply) => {
    const s = d.store.get(req.params.id);
    if (!s) return reply.code(404).send({ status: "not_found" });
    // public by unguessable id: never expose email, password or internal errors
    return {
      status: s.status,
      company: s.company,
      slug: s.slug,
      steps: s.steps,
      url: s.status === "active" ? s.url : undefined,
    };
  });
}
