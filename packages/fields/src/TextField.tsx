/**
 * char and text (P2.13.1): typed text is sent when the user leaves the field (or presses Enter
 * in a one-line field), as Odoo's client does, so an onchange runs once per edit, not per key.
 */
import { Input, Textarea } from "@novi/ui";
import { useEffect, useState } from "react";

import type { FieldProps } from "./contract.js";
import { FallbackField } from "./FallbackField.js";

export function TextField(props: FieldProps<string | false>) {
  const { value, meta, mode, readonly, invalid, onChange, name } = props;
  const [draft, setDraft] = useState(value || "");
  useEffect(() => setDraft(value || ""), [value]);
  if (mode === "read" || readonly) return <FallbackField {...props} />;
  // the element's own value: a blur can come before React has rendered the last keystroke
  const commit = (text: string) => {
    if (text !== (value || "")) onChange(text || false);
  };
  const common = {
    id: name,
    "aria-label": props.label,
    value: draft,
    invalid,
    placeholder: props.placeholder,
    "aria-required": props.required || undefined,
    onBlur: (e: { currentTarget: { value: string } }) => commit(e.currentTarget.value),
  };
  return meta.type === "text" ? (
    <Textarea {...common} onChange={(e) => setDraft(e.target.value)} />
  ) : (
    <Input
      {...common}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && commit(e.currentTarget.value)}
    />
  );
}
