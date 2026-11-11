import { ChevronRight } from "lucide-react";
import { Fragment } from "react";

import { cn } from "../../lib/cn";
import { useT } from "../../lib/i18n";

export interface BreadcrumbItem {
  label: string;
  onSelect?: () => void;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

/** Odoo action stack as breadcrumbs; the last item is the current page. */
export function Breadcrumb({ items, className }: BreadcrumbProps) {
  const t = useT();
  return (
    <nav aria-label={t("breadcrumb")} className={cn("min-w-0", className)}>
      <ol className="flex min-w-0 items-center gap-1 text-sm text-text-muted">
        {items.map((item, i) => {
          const current = i === items.length - 1;
          return (
            <Fragment key={`${i}-${item.label}`}>
              {i > 0 ? <ChevronRight className="size-4 shrink-0" aria-hidden /> : null}
              <li className="min-w-0 truncate" title={item.label}>
                {current || !item.onSelect ? (
                  <span
                    aria-current={current ? "page" : undefined}
                    className={cn(current && "font-medium text-text")}
                  >
                    {item.label}
                  </span>
                ) : (
                  <button type="button" onClick={item.onSelect} className="hover:text-text hover:underline">
                    {item.label}
                  </button>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
