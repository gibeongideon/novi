/**
 * image / binary with `widget="image"` (P2.13.9, showing first): the picture Odoo serves for the
 * record (`/web/image`), refreshed when the record is saved. Uploading comes with P2.13.9's edit
 * part.
 */
import type { FieldProps } from "./contract.js";

export function ImageField({ name, value, owner, label, meta, options }: FieldProps) {
  if (!value || !owner?.id) return null;
  const size = typeof options.preview_image === "string" ? options.preview_image : name;
  const src = `/web/image/${owner.model}/${owner.id}/${size}?unique=${encodeURIComponent(owner.stamp ?? "")}`;
  return (
    <img
      src={src}
      alt={label ?? meta.string ?? ""}
      className="max-h-32 max-w-full rounded-md object-contain"
    />
  );
}
