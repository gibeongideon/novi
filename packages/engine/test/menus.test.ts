import { describe, expect, it } from "vitest";

import { buildMenuTree, firstActionMenu, menuPath, type RawMenu } from "../src/index.js";

// Shape copied from Odoo 20 /web/webclient/load_menus (trimmed)
const raw = {
  root: {
    id: "root",
    name: "root",
    children: [83, 120],
    appID: false,
    xmlid: "",
    actionID: false,
    actionModel: false,
    actionPath: false,
    webIconData: null,
  },
  83: {
    id: 83,
    name: "Sales",
    children: [84, 90],
    appID: 83,
    xmlid: "sale.sale_menu_root",
    actionID: false,
    actionModel: false,
    actionPath: false,
    webIconData: "data:image/png;base64,AAA",
  },
  84: {
    id: 84,
    name: "Orders",
    children: [85, 86],
    appID: 83,
    xmlid: "sale.sale_order_menu",
    actionID: false,
    actionModel: false,
    actionPath: false,
  },
  85: {
    id: 85,
    name: "Quotations",
    children: [],
    appID: 83,
    xmlid: "sale.menu_sale_quotations",
    actionID: 300,
    actionModel: "ir.actions.act_window",
    actionPath: "quotations",
  },
  86: {
    id: 86,
    name: "Orders",
    children: [],
    appID: 83,
    xmlid: "sale.menu_sale_order",
    actionID: 301,
    actionModel: "ir.actions.act_window",
    actionPath: false,
  },
  90: {
    id: 90,
    name: "Reporting",
    children: [],
    appID: 83,
    xmlid: "sale.menu_reporting",
    actionID: false,
    actionModel: false,
    actionPath: false,
  },
  120: {
    id: 120,
    name: "Discuss",
    children: [],
    appID: 120,
    xmlid: "mail.menu_root_discuss",
    actionID: 133,
    actionModel: "ir.actions.client",
    actionPath: "discuss",
    webIconData: false,
  },
} as unknown as Record<string, RawMenu>;

describe("menu tree", () => {
  const tree = buildMenuTree(raw);

  it("builds apps from root children with nested sections, ignoring Odoo icon images (D-23)", () => {
    expect(tree.apps.map((a) => a.name)).toEqual(["Sales", "Discuss"]);
    expect(tree.apps[0]).not.toHaveProperty("icon");
    expect(tree.apps[0]!.children[0]!.children.map((c) => c.name)).toEqual(["Quotations", "Orders"]);
    expect(tree.byId.get(85)?.action).toEqual({
      id: 300,
      model: "ir.actions.act_window",
      path: "quotations",
    });
    expect(tree.byId.get(86)?.action).toEqual({ id: 301, model: "ir.actions.act_window" });
  });

  it("menuPath gives the breadcrumb trail", () => {
    expect(menuPath(tree, 85).map((n) => n.name)).toEqual(["Sales", "Orders", "Quotations"]);
    expect(menuPath(tree, 999)).toEqual([]);
  });

  it("an app root with its own action resolves to the matching sidebar entry", () => {
    const withRootAction = buildMenuTree({
      ...raw,
      83: { ...raw[83]!, actionID: 300, actionModel: "ir.actions.act_window" },
    } as Record<string, RawMenu>);
    expect(firstActionMenu(withRootAction.apps[0]!)?.id).toBe(85);
  });

  it("firstActionMenu finds what an app opens", () => {
    expect(firstActionMenu(tree.apps[0]!)?.id).toBe(85);
    expect(firstActionMenu(tree.apps[1]!)?.id).toBe(120);
    expect(firstActionMenu(tree.byId.get(90)!)).toBeUndefined();
  });
});
