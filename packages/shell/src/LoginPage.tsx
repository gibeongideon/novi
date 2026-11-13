import { type LoginFailure, useSession, useSignupConfig } from "@novi/engine";
import { Button, Input, type MessageKey, useT } from "@novi/ui";
import { type FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { publicCard, PublicPage } from "./PublicPage";
import { SsoButtons } from "./SsoButtons";

const MESSAGES: Record<LoginFailure, MessageKey> = {
  credentials: "wrongCredentials",
  code: "wrongCode",
  expired: "signInExpired",
  cooldown: "tooManyAttempts",
  tooShort: "signInFailed", // reset-only; never returned by sign-in
  twoFactorUnsupported: "twoFactorUnsupported",
  other: "signInFailed",
};

/** Two steps when the account uses 2FA: password, then the authenticator code (P1.6.2). */
export function LoginPage({ productName = "NOVI" }: { productName?: string }) {
  const t = useT();
  const { login, verifyCode, pending, loginError, resetLogin, passwordReset } = useSession();
  const signup = useSignupConfig();
  // a provider sign-in Odoo refused (not linked / no invitation), sent back here by the gateway
  const ssoError = useSearchParams()[0].get("ssoError");
  const [form, setForm] = useState({ login: "", password: "", code: "", remember: true });
  const [challenge, setChallenge] = useState<string | null>(null);

  const submitPassword = async (e: FormEvent) => {
    e.preventDefault();
    const res = await login({ login: form.login, password: form.password }).catch(() => null);
    if (res?.status === "twoFactor") setChallenge(res.challenge);
  };

  const submitCode = async (e: FormEvent) => {
    e.preventDefault();
    if (!challenge) return;
    await verifyCode({ challenge, code: form.code, remember: form.remember }).catch(
      (err: { reason?: string }) => {
        if (err?.reason === "expired") setChallenge(null); // back to the password step
      },
    );
  };

  const back = () => {
    setChallenge(null);
    setForm((f) => ({ ...f, code: "" }));
    resetLogin();
  };

  const error = loginError ? (
    <p role="alert" className="text-sm text-danger">
      {t(MESSAGES[loginError.reason])}
    </p>
  ) : ssoError ? (
    <p role="alert" className="text-sm text-danger">
      {t("ssoNotLinked")}
    </p>
  ) : null;

  return (
    <PublicPage>
      {challenge ? (
        <form onSubmit={submitCode} className={publicCard()}>
          <h1 className="text-xl font-semibold">{productName}</h1>
          <p className="text-sm text-text-muted">{t("twoFactorHelp")}</p>
          <label className="grid gap-1 text-sm">
            {t("twoFactorCode")}
            <Input
              autoFocus
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,7}"
              maxLength={7}
              className="text-center text-lg tracking-[0.4em]"
              value={form.code}
              invalid={loginError?.reason === "code" ? t("wrongCode") : undefined}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={form.remember}
              onChange={(e) => setForm({ ...form, remember: e.target.checked })}
            />
            {t("rememberDevice")}
          </label>
          {error}
          <div className="flex justify-between gap-2">
            <Button type="button" variant="ghost" onClick={back}>
              {t("back")}
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              {t("verify")}
            </Button>
          </div>
        </form>
      ) : (
        <form onSubmit={submitPassword} className={publicCard()}>
          <h1 className="text-xl font-semibold">{productName}</h1>
          <label className="grid gap-1 text-sm">
            {t("login")}
            <Input
              autoComplete="username"
              autoFocus
              required
              value={form.login}
              onChange={(e) => setForm({ ...form, login: e.target.value })}
            />
          </label>
          <div className="grid gap-1 text-sm">
            <div className="flex items-baseline justify-between">
              <label htmlFor="login-password">{t("password")}</label>
              {passwordReset ? (
                <Link to="/reset-password" className="text-xs text-text-muted hover:text-text">
                  {t("forgotPassword")}
                </Link>
              ) : null}
            </div>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={form.password}
              invalid={loginError?.reason === "credentials" ? t("wrongCredentials") : undefined}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          {error}
          <Button type="submit" variant="primary" loading={pending}>
            {t("signIn")}
          </Button>
          <SsoButtons />
          {signup.data?.enabled ? (
            <p className="text-center text-sm text-text-muted">
              {t("newHere")}{" "}
              <Link to="/signup" className="font-medium text-primary hover:underline">
                {t("createWorkspace")}
              </Link>
            </p>
          ) : null}
        </form>
      )}
    </PublicPage>
  );
}
