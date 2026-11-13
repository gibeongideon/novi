import { useSsoProviders } from "@novi/engine";
import { Button, useT } from "@novi/ui";

/**
 * "Continue with …" for the workspace's SSO providers (P1.14). Each is a plain link: the browser
 * goes to the provider and comes back through Odoo's stock auth_oauth, which signs it in.
 * With a reset/invitation `token`, that first sign-in links the provider account to the user.
 */
export function SsoButtons({ token }: { token?: string | null }) {
  const t = useT();
  const { data } = useSsoProviders(token);
  if (!data?.length) return null;
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-3 text-xs text-text-muted">
        <span className="h-px flex-1 bg-border" aria-hidden />
        {t("or")}
        <span className="h-px flex-1 bg-border" aria-hidden />
      </div>
      {data.map((p) => (
        <Button key={p.url} asChild variant="secondary">
          <a href={p.url}>{t("continueWith", { name: p.name })}</a>
        </Button>
      ))}
    </div>
  );
}
