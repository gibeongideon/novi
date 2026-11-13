import { SignupError, submitSignup, useSignupConfig, useWorkspaceName } from "@novi/engine";
import { Button, Input, type MessageKey, useT } from "@novi/ui";
import { type FormEvent, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { publicCard, PublicPage } from "./PublicPage";
import { useDebounced } from "./useDebounced";

const FIELD_MESSAGES: Record<string, MessageKey> = {
  company: "invalidCompany",
  email: "invalidEmail",
  password: "invalidPassword",
  country: "invalidCountry",
  slug: "addressInvalid",
  slug_taken: "addressTaken",
  rate: "tooManySignups",
};

/** Self-service sign-up (P1.3): the workspace address previews from the server's naming rule. */
export function SignupPage({ productName = "NOVI" }: { productName?: string }) {
  const t = useT();
  const [params] = useSearchParams();
  const config = useSignupConfig();
  const [form, setForm] = useState({ company: "", email: "", password: "", country: "KE", slug: "" });
  const [slugEdited, setSlugEdited] = useState(false);
  const [error, setError] = useState<{ field: string; suggestion?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const debounced = useDebounced(form);
  const name = useWorkspaceName(debounced.company, slugEdited ? debounced.slug : "");
  const slug = slugEdited ? form.slug : (name.data?.slug ?? "");
  const address = config.data?.workspaceUrl.replace("{slug}", slug || "…").replace(/^https?:\/\//, "");
  const countryName = useMemo(() => new Intl.DisplayNames([navigator.language], { type: "region" }), []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await submitSignup({ ...form, slug: slug || undefined });
      setSentTo(form.email);
    } catch (err) {
      setError(
        err instanceof SignupError ? { field: err.field, suggestion: err.suggestion } : { field: "other" },
      );
    } finally {
      setBusy(false);
    }
  };

  const card = publicCard("md");
  if (sentTo) {
    return (
      <PublicPage>
        <section className={card} aria-live="polite">
          <h1 className="text-xl font-semibold">{t("checkEmailTitle")}</h1>
          <p className="text-text-muted">{t("checkEmailBody")}</p>
          <p className="font-medium">{sentTo}</p>
        </section>
      </PublicPage>
    );
  }

  // the rule comes from the server (one source: MIN_PASSWORD_LENGTH)
  const minLength = config.data?.minPasswordLength ?? "…";
  const fieldError = (f: string) =>
    error?.field === f ? t(FIELD_MESSAGES[f]!, { n: minLength }) : undefined;
  return (
    <PublicPage>
      <form onSubmit={submit} className={card} noValidate>
        <div className="grid gap-1">
          <span className="text-sm font-semibold text-text-muted">{productName}</span>
          <h1 className="text-2xl font-semibold">{t("createWorkspace")}</h1>
        </div>
        {params.get("invalid") ? (
          <p role="alert" className="text-sm text-danger">
            {t("invalidLink")}
          </p>
        ) : null}
        <label className="grid gap-1 text-sm">
          {t("companyName")}
          <Input
            required
            autoFocus
            autoComplete="organization"
            value={form.company}
            invalid={fieldError("company")}
            onChange={(e) => setForm({ ...form, company: e.target.value })}
          />
        </label>
        <div className="grid gap-1 text-sm">
          <label htmlFor="signup-slug">{t("workspaceAddress")}</label>
          <Input
            id="signup-slug"
            aria-describedby="address-preview"
            value={slug}
            invalid={fieldError("slug") ?? fieldError("slug_taken")}
            onChange={(e) => {
              setSlugEdited(true);
              setForm({ ...form, slug: e.target.value.toLowerCase() });
            }}
          />
          <span id="address-preview" className="text-xs text-text-muted">
            {address}
            {name.data && !name.data.available && slug
              ? ` · ${t(name.data.valid ? "addressTaken" : "addressInvalid")}`
              : ""}
          </span>
          {error?.field === "slug_taken" && error.suggestion ? (
            <button
              type="button"
              className="justify-self-start text-xs text-primary underline"
              onClick={() => {
                setSlugEdited(true);
                setForm({ ...form, slug: error.suggestion! });
                setError(null);
              }}
            >
              {error.suggestion}
            </button>
          ) : null}
        </div>
        <label className="grid gap-1 text-sm">
          {t("workEmail")}
          <Input
            type="email"
            required
            autoComplete="email"
            value={form.email}
            invalid={fieldError("email")}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm">
          {t("choosePassword", { n: minLength })}
          <Input
            type="password"
            required
            minLength={config.data?.minPasswordLength}
            autoComplete="new-password"
            value={form.password}
            invalid={fieldError("password")}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm">
          {t("country")}
          <select
            className="h-9 rounded-md border border-border bg-surface px-3 text-base"
            value={form.country}
            onChange={(e) => setForm({ ...form, country: e.target.value })}
          >
            {(config.data?.countries ?? ["KE"]).map((c) => (
              <option key={c} value={c}>
                {countryName.of(c)}
              </option>
            ))}
          </select>
        </label>
        {error && !["company", "email", "password", "slug", "slug_taken"].includes(error.field) ? (
          <p role="alert" className="text-sm text-danger">
            {t(FIELD_MESSAGES[error.field] ?? "signInFailed")}
          </p>
        ) : null}
        <Button type="submit" variant="primary" loading={busy}>
          {t("getStarted")}
        </Button>
        <Link to="/" className="text-center text-sm text-text-muted hover:text-text">
          {t("haveAccount")}
        </Link>
      </form>
    </PublicPage>
  );
}
