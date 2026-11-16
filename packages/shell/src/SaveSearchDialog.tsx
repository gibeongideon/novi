import type { FavoriteDraft } from "@novi/engine";
import { Button, Dialog, DialogContent, DialogFooter, DialogTitle, Input, useT } from "@novi/ui";
import { useState } from "react";

/** Saving the current search as a favourite (P2.12.5): its name, default, shared with everyone. */
export function SaveSearchDialog({
  onSave,
  onClose,
}: {
  onSave(draft: Pick<FavoriteDraft, "name" | "isDefault" | "shared">): void;
  onClose(): void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [isDefault, setDefault] = useState(false);
  const [shared, setShared] = useState(false);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="sm">
        <DialogTitle>{t("saveSearch")}</DialogTitle>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) onSave({ name: name.trim(), isDefault, shared });
          }}
        >
          <Input
            autoFocus
            aria-label={t("favoriteName")}
            placeholder={t("favoriteName")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={isDefault}
              onChange={(e) => setDefault(e.target.checked)}
            />
            {t("favoriteDefault")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={shared}
              onChange={(e) => setShared(e.target.checked)}
            />
            {t("favoriteShared")}
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant="primary" disabled={!name.trim()}>
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
