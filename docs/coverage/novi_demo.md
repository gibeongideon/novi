# Coverage report: novi_demo

Odoo 20.0+e-20261111 · generated 2026-11-14 10:00 UTC · `pnpm scan`

Scanned **604** window actions (**2133** views), 48 client actions, 215 server actions, 46 reports.

| Area | Native | Occurrences | Coverage |
|---|---|---|---|
| View types | 956 | 2133 | **44.8%** |
| Widgets | 5312 | 8397 | **63.3%** |
| Field types (default widget) | 29485 | 31251 | **94.3%** |
| Client actions | 0 | 48 | **0%** |

## Missing view types (by usage)

| Name | Uses | Examples |
|---|---|---|
| `search` | 604 |  |
| `kanban` | 201 |  |
| `graph` | 114 |  |
| `pivot` | 102 |  |
| `activity` | 62 |  |
| `calendar` | 50 |  |
| `map` | 16 |  |
| `gantt` | 15 |  |
| `hierarchy` | 7 |  |
| `grid` | 3 |  |
| `cohort` | 3 |  |

## Missing widgets (by usage)

| Name | Uses | Examples |
|---|---|---|
| `daterange` | 146 | project.task:list, project.task:kanban, project.task:form |
| `<widget>iap_buy_more_credits` | 119 |  |
| `relative_date` | 95 | mail.activity:list, project.task:list, project.task:kanban |
| `list_activity` | 93 | hr.employee:list, project.task:list, project.task:form |
| `project_task_state_selection` | 83 | project.task:list, project.task:kanban, project.task:form |
| `kanban_activity` | 76 | hr.employee:kanban, project.task:kanban, stock.picking:kanban |
| `document_tax_mode_selector` | 52 | account.move:form, sale.order:form, purchase.order:form |
| `name_with_subtask_count` | 47 | project.task:list, project.task:form, project.task:kanban |
| `stock_rescheduling_popover` | 45 | stock.picking:list, stock.picking:kanban, stock.picking:form |
| `x2many_buttons` | 45 | res.partner.bank:form, account.move:form, account.payment:form |
| `project` | 43 | project.task:list, project.task:calendar, project.task:form |
| `color` | 43 | product.attribute:form, base.document.layout:form, hr.employee.cv.wizard:form |
| `<widget>documentation_link` | 41 |  |
| `many2many_tags_email` | 39 | mail.followers.edit:form, mail.compose.message:form, portal.share:form |
| `properties` | 38 | hr.employee:kanban, stock.picking:kanban, res.partner:kanban |
| `labeled_monetary_field` | 36 | sale.order:form |
| `activity_exception` | 33 | hr.leave.allocation:list, hr.leave:list, stock.picking:list |
| `kanban_color_picker` | 33 | project.task:kanban, utm.campaign:kanban, account.journal:kanban |
| `field_partner_autocomplete` | 32 | res.company:form, res.partner:form |
| `boolean_favorite` | 32 | account.journal:kanban, product.product:kanban, stock.picking.type:kanban |
| `color_picker` | 31 | account.account.tag:list, account.analytic.plan:list, account.analytic.plan:form |
| `float_time_selection` | 31 | hr.leave:kanban, hr.leave.generate.multi.wizard:form, res.config.settings:form |
| `account_review_state_selection_badge` | 31 | account.asset.variant:form, account.account:list, account.move:list |
| `<widget>pls_tooltip_button` | 30 |  |
| `boolean_checkbox` | 30 | product.product:form, product.template:form |
| `stock_picking_locked_statusbar` | 28 | stock.picking:form |
| `label_selection` | 26 | ir.access:list, stock.picking:kanban, stock.picking.batch:kanban |
| `m2o_cell_with_extra_fields` | 26 | account.move:form |
| `many2one_barcode` | 26 | account.move:form, sale.order:form, purchase.order:form |
| `account-tax-totals-field` | 26 | account.move:form, sale.order:form, purchase.order:form |
| `payment` | 26 | account.move:form |
| `rotting_statusbar_duration` | 25 | project.task:form, crm.lead:form |
| `html` | 24 | project.task:form, account.payment:form |
| `CopyClipboardChar` | 24 | account.move:form, hr.expense:form, calendar.event:form |
| `badges_many2one` | 23 | mail.activity:form, project.task:list, hr.employee.skill:form |
| `extract_state_header` | 23 | account.bank.statement:form, account.move:form, hr.expense:form |
| `<widget>section_state` | 23 |  |
| `selection` | 23 | calendar.calendar:list, base.document.layout:form, quotation.document:kanban |
| `mail_composer_attachment_list` | 23 | mail.compose.message:form, mail.template.preview:form |
| `sms_widget` | 23 | sms.sms:form, sms.composer:form, sms.template:form |
| … 213 more | | |

## Missing field types (default widget) (by usage)

| Name | Uses | Examples |
|---|---|---|
| `many2many` | 656 | stock.picking.batch:form, account.batch.payment:form, ir.cron:form |
| `one2many` | 386 | hr.employee:form, res.currency:form, account.fiscal.position:form |
| `html` | 291 | project.task:form, account.payment:form |
| `properties` | 178 | hr.employee:kanban, stock.picking:kanban, res.partner:kanban |
| `json` | 77 |  |
| `reference` | 64 | ir.model.data:form |
| `binary` | 60 | hr.employee:form, hr.employee.skill:list, spreadsheet.template:list |
| `many2one_reference` | 53 |  |
| `properties_definition` | 1 |  |

## Missing client actions (by usage)

| Name | Uses | Examples |
|---|---|---|
| `account_report` | 23 |  |
| `account_import_action` | 5 |  |
| `stock_barcode_client_action` | 3 |  |
| `stock_forecasted` | 2 |  |
| `account_import_guide` | 1 |  |
| `allocation_report` | 1 |  |
| `stock_barcode_main_menu` | 1 |  |
| `account_report_followup` | 1 |  |
| `action_spreadsheet_dashboard` | 1 |  |
| `mail.action_discuss` | 1 |  |
| `document_action_preference` | 1 |  |
| `stock_valuation_report` | 1 |  |
| `hr_attendance_greeting_message` | 1 |  |
| `mysubscription.dashboard` | 1 |  |
| `mail.discuss_notification_settings_action` | 1 |  |
| `reload` | 1 |  |
| `stock_report_generic` | 1 |  |
| `mail.discuss_call_settings_action` | 1 |  |
| `journal_create_wizard` | 1 |  |
