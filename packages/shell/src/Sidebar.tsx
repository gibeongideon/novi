import type { MenuNode } from "@novi/engine";
import { cn } from "@novi/ui";
import { NavLink } from "react-router-dom";

/** The current app's menus (P1.11.2). Sections without an action become headings. */
export function Sidebar({ app, activeId }: { app: MenuNode; activeId?: number }) {
  return (
    <nav aria-label={app.name} className="grid gap-1 p-3 text-sm">
      {app.children.map((node) => (
        <MenuEntry key={node.id} node={node} activeId={activeId} depth={0} />
      ))}
    </nav>
  );
}

function MenuEntry({ node, activeId, depth }: { node: MenuNode; activeId?: number; depth: number }) {
  if (node.children.length) {
    return (
      <div className={cn("grid gap-1", depth === 0 && "mt-2 first:mt-0")}>
        <span className="px-2 pt-1 text-xs font-medium uppercase tracking-wide text-text-muted">
          {node.name}
        </span>
        {node.children.map((c) => (
          <MenuEntry key={c.id} node={c} activeId={activeId} depth={depth + 1} />
        ))}
      </div>
    );
  }
  if (!node.action) return <span className="px-2 py-1.5 text-text-muted">{node.name}</span>;
  return (
    <NavLink
      to={`/action/${node.action.id}?menu=${node.id}`}
      aria-current={node.id === activeId ? "page" : undefined}
      className={cn(
        "truncate rounded-md px-2 py-1.5 hover:bg-surface-sunken",
        node.id === activeId && "bg-surface-sunken font-medium text-primary",
      )}
      title={node.name}
    >
      {node.name}
    </NavLink>
  );
}
