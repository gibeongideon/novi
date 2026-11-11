# Coverage report: novi_demo

Odoo 20.0+e-20261111 · generated 2026-11-11 13:48 UTC · `pnpm scan`

Scanned **499** window actions (**1691** views), 40 client actions, 174 server actions, 43 reports.

| Area | Native | Occurrences | Coverage |
|---|---|---|---|
| View types | 0 | 1691 | **0%** |
| Widgets | 0 | 5592 | **0%** |
| Field types (default widget) | 0 | 21557 | **0%** |
| Client actions | 0 | 40 | **0%** |

## Missing view types (by usage)

| Name | Uses | Examples |
|---|---|---|
| `search` | 492 |  |
| `form` | 422 |  |
| `list` | 363 |  |
| `kanban` | 150 |  |
| `graph` | 83 |  |
| `pivot` | 77 |  |
| `activity` | 43 |  |
| `calendar` | 35 |  |
| `map` | 9 |  |
| `hierarchy` | 7 |  |
| `gantt` | 5 |  |
| `cohort` | 3 |  |
| `grid` | 2 |  |

## Missing widgets (by usage)

| Name | Uses | Examples |
|---|---|---|
| `statinfo` | 373 | hr.leave.accrual.plan:form, stock.picking:form, account.analytic.account:form |
| `monetary` | 368 | hr.employee:list, product.value:form, account.analytic.account:kanban |
| `many2many_tags` | 351 | hr.employee:list, hr.employee:kanban, hr.employee:form |
| `<widget>web_ribbon` | 302 |  |
| `radio` | 271 | hr.leave.accrual.plan:form, stock.add.to.wave:form, stock.picking.to.batch:form |
| `many2one_avatar_user` | 256 | hr.employee:list, hr.employee:kanban, hr.employee:form |
| `upgrade_boolean` | 220 | res.config.settings:form |
| `badge` | 176 | stock.move.line:list, mail.alias:list, mail.alias:form |
| `handle` | 154 | account.report:list, account.report:form, mail.activity.plan:form |
| `image` | 118 | hr.employee:list, hr.employee:form, ir.module.module:form |
| `statusbar` | 107 | hr.leave.allocation:form, hr.leave:form, hr.attendance:form |
| `many2many_tax_tags` | 107 | account.move.line:list, account.move.line:kanban, account.move:form |
| `phone` | 98 | hr.employee:list, hr.employee:kanban, hr.employee:form |
| `priority` | 87 | stock.picking:list, stock.picking:kanban, stock.picking:form |
| `text` | 78 | ir.access:form, mail.activity.plan:form, mail.activity.type:form |
| `<widget>iap_buy_more_credits` | 77 |  |
| `res_partner_many2one` | 71 | account.move:form, res.partner:form, crm.lead:form |
| `boolean_toggle` | 68 | hr.employee:form, account.report:form, mail.followers.edit:form |
| `many2one_avatar_employee` | 67 | hr.employee:list, hr.employee:form, hr.leave.allocation:list |
| `float_time` | 60 | hr.leave:form, account.analytic.line:graph, hr.attendance:list |
| `kanban_activity` | 56 | hr.employee:kanban, stock.picking:kanban, stock.picking.batch:kanban |
| `list_activity` | 54 | hr.employee:list, account.move:list, res.partner:list |
| `email` | 52 | hr.employee:form, account.move:form, res.users:form |
| `relative_date` | 46 | mail.activity:list, stock.picking:list, hr.employee:list |
| `float` | 45 | hr.leave.allocation:kanban, hr.leave:kanban, account.analytic.line:grid |
| `daterange` | 45 | hr.leave:form, hr.attendance:form, account.move.line:list |
| `stock_rescheduling_popover` | 45 | stock.picking:list, stock.picking:kanban, stock.picking:form |
| `percentage` | 45 | hr.time.rule:form, account.account:list, account.move:form |
| `document_tax_mode_selector` | 42 | account.move:form, sale.order:form |
| `x2many_buttons` | 39 | res.partner.bank:form, account.move:form, account.payment:form |
| `properties` | 36 | hr.employee:kanban, stock.picking:kanban, res.partner:kanban |
| `many2one_bank` | 36 | account.move:form, account.payment:form |
| `labeled_monetary_field` | 36 | sale.order:form |
| `field_partner_autocomplete` | 32 | res.company:form, res.partner:form |
| `url` | 31 | ir.module.module:form, ir.attachment:kanban, ir.attachment:form |
| `color` | 31 | product.attribute:form, base.document.layout:form, hr.employee.cv.wizard:form |
| `<widget>pls_tooltip_button` | 30 |  |
| `<widget>documentation_link` | 29 |  |
| `stock_picking_locked_statusbar` | 28 | stock.picking:form |
| `boolean_favorite` | 28 | account.journal:kanban, product.product:kanban, stock.picking.type:kanban |
| … 195 more | | |

## Missing field types (default widget) (by usage)

| Name | Uses | Examples |
|---|---|---|
| `many2one` | 5746 | stock.quant:list |
| `boolean` | 4338 |  |
| `char` | 4085 | ir.cron:form, ir.actions.server:form |
| `selection` | 1700 | calendar.calendar:list, base.document.layout:form, quotation.document:kanban |
| `integer` | 983 | hr.export.work.entries:form |
| `float` | 951 | hr.leave.allocation:kanban, hr.leave:kanban, account.analytic.line:grid |
| `date` | 864 |  |
| `monetary` | 684 | hr.employee:list, product.value:form, account.analytic.account:kanban |
| `datetime` | 568 | stock.inventory.adjustment.name:form |
| `many2many` | 460 | stock.picking.batch:form, account.batch.payment:form, ir.cron:form |
| `text` | 379 | ir.access:form, mail.activity.plan:form, mail.activity.type:form |
| `one2many` | 266 | hr.employee:form, res.currency:form, calendar.event:form |
| `html` | 220 | account.payment:form |
| `properties` | 115 | hr.employee:kanban, stock.picking:kanban, res.partner:kanban |
| `binary` | 58 | hr.employee:form, hr.employee.skill:list, hr.resume.line:list |
| `json` | 57 |  |
| `reference` | 54 | ir.model.data:form |
| `many2one_reference` | 28 |  |
| `properties_definition` | 1 |  |

## Missing client actions (by usage)

| Name | Uses | Examples |
|---|---|---|
| `account_report` | 22 |  |
| `stock_barcode_client_action` | 3 |  |
| `stock_forecasted` | 2 |  |
| `allocation_report` | 1 |  |
| `stock_barcode_main_menu` | 1 |  |
| `account_report_followup` | 1 |  |
| `action_spreadsheet_dashboard` | 1 |  |
| `mail.action_discuss` | 1 |  |
| `stock_valuation_report` | 1 |  |
| `hr_attendance_greeting_message` | 1 |  |
| `mysubscription.dashboard` | 1 |  |
| `mail.discuss_notification_settings_action` | 1 |  |
| `reload` | 1 |  |
| `stock_report_generic` | 1 |  |
| `mail.discuss_call_settings_action` | 1 |  |
| `journal_create_wizard` | 1 |  |

## Scan errors (7)

- action 170 (account.analytic.plan): You are not allowed to access 'Analytic Plan' (account.analytic.plan) records. This operation is allowed for the following groups: - Analytic Accounting - Show 
- action 626 (account.return.check.template): You are not allowed to access 'Account Return Check Template' (account.return.check.template) records. This operation is allowed for the following groups: - Sho
- action 630 (account.return.check): You are not allowed to access 'Accounting Return Check' (account.return.check) records. This operation is allowed for the following groups: - Show Accounting Fe
- action 623 (account.return.creation.wizard): You are not allowed to access 'Return creation wizard' (account.return.creation.wizard) records. This operation is allowed for the following groups: - Show Full
- action 512 (account.auto.reconcile.wizard): You are not allowed to access 'Account automatic reconciliation wizard' (account.auto.reconcile.wizard) records. This operation is allowed for the following gro
- action 627 (account.return.creation.wizard): You are not allowed to access 'Return creation wizard' (account.return.creation.wizard) records. This operation is allowed for the following groups: - Show Full
- action 267 (account.automatic.entry.wizard): You are not allowed to access 'Create Automatic Entries' (account.automatic.entry.wizard) records. This operation is allowed for the following groups: - Show Fu
