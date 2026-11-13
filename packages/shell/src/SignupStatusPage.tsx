import { useSignupProgress } from "@novi/engine";
import { Button, cn, type MessageKey, Skeleton, useT } from "@novi/ui";
import { Check, Loader2 } from "lucide-react";
import { useParams } from "react-router-dom";

import { publicCard, PublicPage } from "./PublicPage";

/** Provisioning steps as the tenant script reports them (infra/provisioning/tenant.sh), in order. */
const STEPS: { label: MessageKey; done: string[] }[] = [
  { label: "step.database", done: ["clone_db", "create_db"] },
  { label: "step.files", done: ["copy_filestore", "create_filestore"] },
  { label: "step.apps", done: ["clone_db", "init_modules"] },
  { label: "step.start", done: ["start_instance"] },
  { label: "step.account", done: ["bootstrap_admin"] },
  { label: "step.address", done: ["register_gateway"] },
];

/** Live progress after the email is confirmed (P1.3.5); polls until the workspace is ready. */
export function SignupStatusPage() {
  const t = useT();
  const { id } = useParams();
  const progress = useSignupProgress(id);
  const p = progress.data;
  const card = publicCard("md");

  if (progress.isPending) return <Skeleton className="m-6 h-40 w-96" />;
  if (!p) {
    return (
      <PublicPage>
        <p role="alert">{t("invalidLink")}</p>
      </PublicPage>
    );
  }
  const done = new Set(p.steps);
  const ready = p.status === "active";
  return (
    <PublicPage>
      <section className={card} aria-live="polite">
        <div className="grid gap-1">
          <span className="text-sm font-semibold text-text-muted">{p.company}</span>
          <h1 className="text-2xl font-semibold">{ready ? t("workspaceReady") : t("settingUp")}</h1>
          <p className="text-text-muted">{ready ? t("workspaceReadyBody") : t("settingUpBody")}</p>
        </div>
        {p.status === "failed" ? (
          <p role="alert" className="text-danger">
            {t("setupFailed")}
          </p>
        ) : (
          <ol className="grid gap-2">
            {STEPS.map((s, i) => {
              const isDone = ready || s.done.some((x) => done.has(x));
              const isNext =
                !isDone && STEPS.slice(0, i).every((x) => ready || x.done.some((y) => done.has(y)));
              return (
                <li
                  key={s.label}
                  className={cn("flex items-center gap-2 text-sm", !isDone && !isNext && "text-text-muted")}
                >
                  <span className="grid size-5 place-items-center">
                    {isDone ? (
                      <Check className="size-4 text-success" aria-hidden />
                    ) : isNext && p.status === "provisioning" ? (
                      <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
                    ) : (
                      <span className="size-1.5 rounded-full bg-border" aria-hidden />
                    )}
                  </span>
                  {t(s.label)}
                </li>
              );
            })}
          </ol>
        )}
        {ready && p.url ? (
          <Button asChild variant="primary">
            <a href={p.url}>{t("openWorkspace")}</a>
          </Button>
        ) : null}
      </section>
    </PublicPage>
  );
}
