import type { ToolbarItem } from "@novi/engine";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  useT,
} from "@novi/ui";
import { ChevronDown, Printer } from "lucide-react";
import { useState } from "react";

/**
 * The "Actions" and "Print" menus of selected records (list) or of one record (form): NOVI's
 * duplicate / archive / delete, then Odoo's own toolbar entries from `get_views`.
 */
export function ActionMenus({
  count,
  canArchive,
  toolbar,
  onDuplicate,
  onArchive,
  onDelete,
  onToolbar,
}: {
  /** How many records the actions apply to (delete confirmation). */
  count: number;
  canArchive: boolean;
  toolbar: { action: ToolbarItem[]; print: ToolbarItem[] };
  onDuplicate(): void;
  onArchive(archived: boolean): void;
  onDelete(): void;
  onToolbar(item: ToolbarItem): void;
}) {
  const t = useT();
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="sm">
            {t("actions")}
            <ChevronDown aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={onDuplicate}>{t("duplicate")}</DropdownMenuItem>
          {canArchive ? (
            <>
              <DropdownMenuItem onSelect={() => onArchive(true)}>{t("archive")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onArchive(false)}>{t("unarchive")}</DropdownMenuItem>
            </>
          ) : null}
          <DropdownMenuItem className="text-danger" onSelect={() => setConfirmDelete(true)}>
            {t("delete")}
          </DropdownMenuItem>
          {toolbar.action.length ? <DropdownMenuSeparator /> : null}
          {toolbar.action.map((item) => (
            <DropdownMenuItem key={item.id} onSelect={() => onToolbar(item)}>
              {item.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {toolbar.print.length ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="sm" aria-label={t("print")}>
              <Printer aria-hidden />
              <ChevronDown aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {toolbar.print.map((item) => (
              <DropdownMenuItem key={item.id} onSelect={() => onToolbar(item)}>
                {item.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent size="sm">
          <DialogTitle>{t("deleteConfirmTitle", { n: count })}</DialogTitle>
          <DialogDescription>{t("deleteConfirmBody")}</DialogDescription>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              {t("cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmDelete(false);
                onDelete();
              }}
            >
              {t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
