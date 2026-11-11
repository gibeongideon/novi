import { useSession } from "@novi/engine";
import { Button, Input, useT } from "@novi/ui";
import { type FormEvent, useState } from "react";

export function LoginPage({ productName = "NOVI" }: { productName?: string }) {
  const t = useT();
  const { login, loggingIn, loginError } = useSession();
  const [form, setForm] = useState({ login: "", password: "" });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login(form).catch(() => undefined); // error shown from loginError
  };

  return (
    <main className="grid min-h-screen place-items-center bg-bg p-4">
      <form
        onSubmit={submit}
        className="grid w-full max-w-sm gap-4 rounded-lg border border-border bg-surface p-6 shadow-sm"
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
            invalid={loginError?.kind === "credentials" ? loginError.message : undefined}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </label>
        {loginError ? (
          <p role="alert" className="text-sm text-danger">
            {loginError.kind === "two-factor" ? t("twoFactorNotYet") : loginError.message}
          </p>
        ) : null}
        <Button type="submit" variant="primary" loading={loggingIn}>
          {t("signIn")}
        </Button>
      </form>
    </main>
  );
}
