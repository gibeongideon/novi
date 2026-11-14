/**
 * many2many_tags (P2.13.7): the linked records as tags; in edit mode, remove one with its ×,
 * add one by searching (`web_name_search` in the field's domain, minus the tags already there).
 * The view turns the new list into the x2many's commands.
 */
import { useNameSearch } from "@novi/engine";
import { Badge, Combobox, useT } from "@novi/ui";
import { X } from "lucide-react";
import { useState } from "react";

import type { FieldProps } from "./contract.js";

type Tag = { id: number; display_name?: string };

export function TagsField(props: FieldProps<Tag[]>) {
  const t = useT();
  const { name, meta, mode, readonly, onChange, domain } = props;
  const tags = (Array.isArray(props.value) ? props.value : []).filter((v) => v && typeof v.id === "number");
  const editing = mode === "edit" && !readonly;
  const [text, setText] = useState<string | null>(null);
  const search = useNameSearch(
    meta.relation as string | undefined,
    text ?? "",
    [...(domain ?? []), ...(tags.length ? [["id", "not in", tags.map((x) => x.id)]] : [])],
    editing && text !== null,
  );
  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map((tag) => (
        <Badge key={tag.id} className="gap-1">
          {tag.display_name}
          {editing ? (
            <button
              type="button"
              aria-label={t("removeTag", { name: String(tag.display_name ?? "") })}
              className="text-text-muted hover:text-text"
              onClick={() => onChange(tags.filter((x) => x.id !== tag.id))}
            >
              <X aria-hidden className="size-3" />
            </button>
          ) : null}
        </Badge>
      ))}
      {editing ? (
        <div className="min-w-40 flex-1">
          <Combobox
            id={name}
            aria-label={props.label}
            value=""
            placeholder={props.placeholder}
            options={(search.data ?? []).map((r) => ({ id: r.id, label: r.display_name }))}
            loading={search.isFetching}
            onSearch={setText}
            onSelect={(o) => o && onChange([...tags, { id: Number(o.id), display_name: o.label }])}
          />
        </div>
      ) : null}
    </div>
  );
}
