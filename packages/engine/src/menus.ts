/**
 * Odoo menu tree from GET /web/webclient/load_menus (Odoo 20 shape verified live): a flat map
 * keyed by id plus "root"; apps are root's children. Odoo's icon images are deliberately ignored:
 * NOVI has its own visual identity (D-23).
 */

export interface RawMenu {
  id: number | "root";
  name: string;
  children: number[];
  appID: number | false;
  xmlid: string;
  actionID: number | false;
  actionModel: string | false;
  actionPath: string | false;
}

export interface MenuNode {
  id: number;
  name: string;
  appId: number;
  xmlid: string;
  /** Action opened by this menu, if any. */
  action?: { id: number; model: string; path?: string };
  children: MenuNode[];
  parentId?: number;
}

export interface MenuTree {
  apps: MenuNode[];
  byId: Map<number, MenuNode>;
}

export function buildMenuTree(raw: Record<string, RawMenu>): MenuTree {
  const byId = new Map<number, MenuNode>();
  const build = (id: number, parentId?: number): MenuNode | undefined => {
    const r = raw[String(id)];
    if (!r || r.id === "root") return undefined;
    const node: MenuNode = {
      id,
      name: r.name,
      appId: r.appID || id,
      xmlid: r.xmlid,
      parentId,
      children: [],
      ...(r.actionID && r.actionModel
        ? {
            action: { id: r.actionID, model: r.actionModel, ...(r.actionPath ? { path: r.actionPath } : {}) },
          }
        : {}),
    };
    byId.set(id, node);
    node.children = r.children.map((c) => build(c, id)).filter((n): n is MenuNode => !!n);
    return node;
  };
  const apps = (raw.root?.children ?? []).map((id) => build(id)).filter((n): n is MenuNode => !!n);
  return { apps, byId };
}

/** Root-to-node path, for breadcrumbs. */
export function menuPath(tree: MenuTree, id: number): MenuNode[] {
  const path: MenuNode[] = [];
  for (let n = tree.byId.get(id); n; n = n.parentId ? tree.byId.get(n.parentId) : undefined) path.unshift(n);
  return path;
}

/**
 * The menu Odoo opens for a node: itself if it has an action, else its first descendant that does.
 * When an app root carries an action (e.g. Sales → Quotations), prefer the sidebar entry with the
 * same action so the sidebar highlights it and breadcrumbs show the full path, as Odoo does.
 */
export function firstActionMenu(node: MenuNode): MenuNode | undefined {
  if (node.action) return (node.children.length && findByAction(node, node.action.id)) || node;
  for (const c of node.children) {
    const hit = firstActionMenu(c);
    if (hit) return hit;
  }
  return undefined;
}

function findByAction(node: MenuNode, actionId: number): MenuNode | undefined {
  for (const c of node.children) {
    if (c.action?.id === actionId) return c;
    const hit = findByAction(c, actionId);
    if (hit) return hit;
  }
  return undefined;
}
