import { Breadcrumb } from "@novi/ui";
import { useNavigate } from "react-router-dom";

/** A screen below the current one in the action stack (P2.10.12): its name and where it lives. */
export interface Crumb {
  label: string;
  to: string;
}

/**
 * The page title with the action stack before it (list › record › …). `leave` lets a form save
 * its changes before going back (P2.10.6).
 */
export function PageTitle({
  trail,
  title,
  leave,
}: {
  trail: readonly Crumb[];
  title: string;
  leave?(to: string): void;
}) {
  const navigate = useNavigate();
  if (!trail.length) return <h1 className="text-2xl font-semibold">{title}</h1>;
  return (
    <div className="grid min-w-0 gap-0.5">
      <Breadcrumb
        lastIsCurrent={false}
        items={trail.map((c) => ({ label: c.label, onSelect: () => (leave ?? navigate)(c.to) }))}
      />
      <h1 className="truncate text-2xl font-semibold">{title}</h1>
    </div>
  );
}
