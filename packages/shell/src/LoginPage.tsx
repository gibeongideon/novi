import { type LoginFailure, useSession } from "@novi/engine";
import { Button, Input, type MessageKey, useT } from "@novi/ui";
import { type FormEvent, useState } from "react";

const MESSAGES: Record<LoginFailure, MessageKey> = {
  credentials: "wrongCredentials",
  code: "wrongCode",
  expired: "signInExpired",
  twoFactorUnsupported: "twoFactorUnsupported",
  other: "signInFailed",
};

/** Two steps when the account uses 2FA: password, then the authenticator code (P1.6.2). */
export function LoginPage({ productName = "NOVI" }: { productName?: string }) {
  const t = useT();
  const { login, verifyCode, pending, loginError, resetLogin } = useSession();
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
  ) : null;

  return (
    <main className="novi-backdrop grid min-h-screen place-items-center bg-bg p-4">
      {challenge ? (
        <form
          onSubmit={submitCode}
          className="grid w-full max-w-sm gap-4 rounded-xl border border-border bg-surface p-6 shadow-md"
        >
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
        <form
          onSubmit={submitPassword}
          className="grid w-full max-w-sm gap-4 rounded-xl border border-border bg-surface p-6 shadow-md"
        >
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
          <label className="grid gap-1 text-sm">
            {t("password")}
            <Input
              type="password"
              autoComplete="current-password"
              required
              value={form.password}
              invalid={loginError?.reason === "credentials" ? t("wrongCredentials") : undefined}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </label>
          {error}
          <Button type="submit" variant="primary" loading={pending}>
            {t("signIn")}
          </Button>
        </form>
      )}
    </main>
  );
}
