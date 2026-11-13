import { LoginError, useSession } from "@novi/engine";
import { Button, Input, useT } from "@novi/ui";
import { type FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { publicCard, PublicPage } from "./PublicPage";
import { SsoButtons } from "./SsoButtons";

/**
 * Password reset (P1.6.5). Without a token: ask for the email (Odoo sends the link). With the
 * token from that email: choose the new password. Odoo checks the token and its password rule.
 */
export function ResetPasswordPage({ productName = "NOVI" }: { productName?: string }) {
  const t = useT();
  const { passwordReset } = useSession();
  const [params] = useSearchParams();
  const token = params.get("token");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!passwordReset) return;
    setBusy(true);
    setError(null);
    try {
      await (token ? passwordReset.confirm(token, value) : passwordReset.request(value));
      setDone(true);
    } catch (err) {
      if (err instanceof LoginError && err.reason === "tooShort")
        setError(t("invalidPassword", { n: err.minLength ?? "" }));
      // otherwise Odoo's own translated reason (link expired or already used)
      else setError(err instanceof LoginError && err.message ? err.message : t("signInFailed"));
    } finally {
      setBusy(false);
    }
  };

  const back = (
    <Link to="/" className="text-center text-sm text-text-muted hover:text-text">
      {t("backToSignIn")}
    </Link>
  );
  if (done) {
    return (
      <PublicPage>
        <section className={publicCard()} aria-live="polite">
          <h1 className="text-xl font-semibold">{t("resetTitle")}</h1>
          <p className="text-text-muted">{t(token ? "passwordChanged" : "resetSent")}</p>
          {back}
        </section>
      </PublicPage>
    );
  }
  return (
    <PublicPage>
      <form onSubmit={submit} className={publicCard()}>
        <div className="grid gap-1">
          <span className="text-sm font-semibold text-text-muted">{productName}</span>
          <h1 className="text-xl font-semibold">{t("resetTitle")}</h1>
        </div>
        {token ? null : <p className="text-sm text-text-muted">{t("resetHelp")}</p>}
        <label className="grid gap-1 text-sm">
          {t(token ? "newPassword" : "login")}
          <Input
            autoFocus
            required
            type={token ? "password" : "text"}
            autoComplete={token ? "new-password" : "username"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" loading={busy} disabled={!passwordReset}>
          {t(token ? "setPassword" : "sendResetLink")}
        </Button>
        {token ? <SsoButtons token={token} /> : null}
        {back}
      </form>
    </PublicPage>
  );
}
