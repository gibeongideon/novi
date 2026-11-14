import { type ReactNode, useId, useState } from "react";

import { cn } from "../../lib/cn";

export interface TabItem {
  key: string;
  label: string;
  content: ReactNode;
}

/**
 * Sections of a screen, one shown at a time (WAI-ARIA tabs: arrows move between tabs). The
 * first tab is open at start, as a notebook's first page in Odoo.
 */
export function Tabs({ items, className }: { items: readonly TabItem[]; className?: string }) {
  const id = useId();
  const [current, setCurrent] = useState(items[0]?.key);
  const open = items.find((i) => i.key === current) ?? items[0];
  if (!open) return null;
  const move = (step: number) => {
    const i = items.indexOf(open);
    const next = items[(i + step + items.length) % items.length]!;
    setCurrent(next.key);
    document.getElementById(`${id}-tab-${next.key}`)?.focus();
  };
  return (
    <div className={cn("grid gap-3", className)}>
      <div role="tablist" className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border">
        {items.map((item) => {
          const selected = item.key === open.key;
          return (
            <button
              key={item.key}
              id={`${id}-tab-${item.key}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${id}-panel`}
              tabIndex={selected ? 0 : -1}
              className={cn(
                "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
                selected ? "border-primary text-text" : "border-transparent text-text-muted hover:text-text",
              )}
              onClick={() => setCurrent(item.key)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight") move(1);
                else if (e.key === "ArrowLeft") move(-1);
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${open.key}`}>
        {open.content}
      </div>
    </div>
  );
}
