/**
 * many2one (P2.13.6, first slice): search as you type with Odoo's own `web_name_search`, in the
 * field's domain. "Create and edit" and opening the record come with the dialog form.
 */
import { useNameSearch } from "@novi/engine";
import { Avatar, Combobox } from "@novi/ui";
import { useState } from "react";

import type { FieldProps } from "./contract.js";
import { FallbackField } from "./FallbackField.js";

type M2O = { id: number; display_name?: string } | false;

export function Many2OneField(props: FieldProps<M2O>) {
  const { name, value, meta, mode, readonly, invalid, onChange, domain } = props;
  const [text, setText] = useState<string | null>(null);
  const search = useNameSearch(
    meta.relation as string | undefined,
    text ?? "",
    [...(domain ?? [])],
    text !== null,
  );
  if (mode === "read" || readonly) return <FallbackField {...props} />;
  // a name with more lines (`show_address` context): the name in the input, the rest under it
  const [first = "", ...more] = (value ? (value.display_name ?? "") : "").split("\n");
  return (
    <div className="grid gap-1">
      <Combobox
        id={name}
        aria-label={props.label}
        value={first}
        options={(search.data ?? []).map((r) => ({ id: r.id, label: r.display_name.split("\n")[0]! }))}
        loading={search.isFetching}
        invalid={invalid}
        placeholder={props.placeholder}
        onSearch={setText}
        onSelect={(o) => onChange(o ? { id: Number(o.id), display_name: o.label } : false)}
      />
      {more.some(Boolean) ? (
        <p className="whitespace-pre-line text-sm text-text-muted">{more.join("\n").trim()}</p>
      ) : null}
    </div>
  );
}

/** The record's picture, served by Odoo (`avatar_128`: initials when it has none). */
function RelatedAvatar({ model, value }: { model?: string; value: M2O }) {
  if (!value || !model) return null;
  return (
    <Avatar
      size="sm"
      name={String(value.display_name ?? "")}
      src={`/web/image/${model}/${value.id}/avatar_128`}
    />
  );
}

/** `many2one_avatar`, `…_user`, `…_employee`: the person's picture beside the name. */
export function Many2OneAvatarField(props: FieldProps<M2O>) {
  const model = props.meta.relation as string | undefined;
  const editing = props.mode === "edit" && !props.readonly;
  return (
    <span
      className={
        editing ? "flex items-start gap-2 [&>*:last-child]:flex-1" : "inline-flex items-center gap-2"
      }
    >
      <RelatedAvatar model={model} value={props.value} />
      {editing ? <Many2OneField {...props} /> : <FallbackField {...props} />}
    </span>
  );
}
