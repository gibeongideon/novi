import { useRecordName } from "@novi/engine";
import { Badge, Button, Skeleton, useT } from "@novi/ui";
import { ExternalLink } from "lucide-react";
import { useParams } from "react-router-dom";

/** One record (from search). The native form view replaces this in P2.10. */
export function RecordPage() {
  const t = useT();
  const { model, id } = useParams();
  const resId = Number(id) || undefined;
  const name = useRecordName(model, resId);

  if (name.isPending) return <Skeleton className="m-6 h-8 w-64" />;
  if (name.isError) {
    return (
      <p role="alert" className="p-6 text-danger">
        {(name.error as Error).message}
      </p>
    );
  }
  return (
    <div className="grid max-w-3xl gap-4 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold">{name.data}</h1>
        <Badge tone="info">{model}</Badge>
      </div>
      <p className="text-text-muted">{t("nativeViewSoon")}</p>
      <div>
        <Button asChild variant="secondary">
          <a href={`/odoo/${model}/${resId}`} target="_blank" rel="noreferrer">
            <ExternalLink aria-hidden />
            {t("openInOdoo")}
          </a>
        </Button>
      </div>
    </div>
  );
}
