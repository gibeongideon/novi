/**
 * Self-service sign-up client (P1.3). Talks to the NOVI gateway's platform API, not to Odoo.
 */
import { useQuery } from "@tanstack/react-query";

export interface SignupConfig {
  enabled: boolean;
  workspaceUrl: string;
  countries: string[];
  minPasswordLength: number;
}
export type SignupState = "verify" | "queued" | "provisioning" | "active" | "failed";
export interface SignupProgress {
  status: SignupState;
  company: string;
  slug: string;
  steps: string[];
  url?: string;
}
export interface SignupInput {
  company: string;
  email: string;
  password: string;
  country: string;
  slug?: string;
}

/** Field the server rejected (`company`, `email`, `password`, `country`, `slug`, `slug_taken`, `rate`). */
export class SignupError extends Error {
  constructor(
    readonly field: string,
    readonly suggestion?: string,
  ) {
    super(`invalid ${field}`);
    this.name = "SignupError";
  }
}

const json = async <T>(res: Response): Promise<T> => (await res.json()) as T;

export async function submitSignup(input: SignupInput, base = ""): Promise<{ id: string }> {
  const res = await fetch(`${base}/api/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await json<{ id?: string; field?: string; suggestion?: string }>(res);
  if (!res.ok) throw new SignupError(body.field ?? "other", body.suggestion);
  return { id: body.id! };
}

export function useSignupConfig() {
  return useQuery({
    queryKey: ["signup-config"],
    queryFn: async () => json<SignupConfig>(await fetch("/api/signup/config")),
    staleTime: Infinity,
  });
}

/** Suggested + availability-checked workspace name, from the server's own naming rule. */
export function useWorkspaceName(company: string, slug: string) {
  const q = slug ? `slug=${encodeURIComponent(slug)}` : `company=${encodeURIComponent(company)}`;
  return useQuery({
    queryKey: ["signup-slug", q],
    enabled: !!(slug || company.trim().length >= 2),
    queryFn: async () =>
      json<{ slug: string; valid: boolean; available: boolean }>(await fetch(`/api/signup/slug?${q}`)),
    placeholderData: (prev) => prev,
  });
}

/** Polls provisioning progress every 2 s until the workspace is ready or failed. */
export function useSignupProgress(id: string | undefined) {
  return useQuery({
    queryKey: ["signup", id],
    enabled: !!id,
    queryFn: async () => {
      const res = await fetch(`/api/signup/${id}`);
      if (!res.ok) throw new Error("not_found");
      return json<SignupProgress>(res);
    },
    refetchInterval: (q) =>
      q.state.data && ["active", "failed"].includes(q.state.data.status) ? false : 2000,
  });
}
