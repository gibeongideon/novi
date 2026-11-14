import { ChevronLeft, ChevronRight } from "lucide-react";

import { useT } from "../../lib/i18n.js";
import { Button } from "../../primitives/Button/index.js";

export interface PagerProps {
  /** First shown item, 0-based. */
  offset: number;
  limit: number;
  total: number;
  /** The total is a lower bound (Odoo counted up to its limit): shown as "10000+". */
  estimate?: boolean;
  onPrevious(): void;
  onNext(): void;
}

/**
 * Position in a long list and previous/next (L2 pattern): list pages now, the record pager of the
 * form view (P2.10.7) later. Previous/next wrap around like Odoo's pager.
 */
export function Pager({ offset, limit, total, estimate, onPrevious, onNext }: PagerProps) {
  const t = useT();
  if (total <= 0) return null;
  const from = offset + 1;
  const to = Math.min(offset + limit, total);
  const single = total <= limit && !estimate;
  return (
    <div className="flex items-center gap-1 text-sm text-text-muted">
      <span className="tabular-nums" aria-live="polite">
        {t("pagerOf", {
          from: from === to ? `${from}` : `${from}–${to}`,
          total: `${total}${estimate ? "+" : ""}`,
        })}
      </span>
      {single ? null : (
        <>
          <Button variant="ghost" size="sm" aria-label={t("previous")} onClick={onPrevious}>
            <ChevronLeft aria-hidden />
          </Button>
          <Button variant="ghost" size="sm" aria-label={t("next")} onClick={onNext}>
            <ChevronRight aria-hidden />
          </Button>
        </>
      )}
    </div>
  );
}
