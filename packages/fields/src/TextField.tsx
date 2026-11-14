/**
 * char and text (P2.13.1), and the `text`, `email`, `phone` and `url` widgets: typed text is sent
 * when the user leaves the field (or presses Enter in a one-line field), as Odoo's client does,
 * so an onchange runs once per edit, not per key. Links open the mail app, the phone or the page.
 */
import { Input, Textarea } from "@novi/ui";
import { useEffect, useState } from "react";

import type { FieldComponent, FieldProps } from "./contract.js";
import { FallbackField } from "./FallbackField.js";

type Kind = "plain" | "multiline" | "email" | "phone" | "url";

const HREF: Partial<Record<Kind, (v: string) => string>> = {
  email: (v) => `mailto:${v}`,
  phone: (v) => `tel:${v.replace(/\s+/g, "")}`,
  url: (v) => (/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`),
};
const INPUT_TYPE: Partial<Record<Kind, string>> = { email: "email", phone: "tel", url: "url" };

function Text({ kind, ...props }: FieldProps<string | false> & { kind: Kind }) {
  const { value, meta, mode, readonly, invalid, onChange, name } = props;
  const [draft, setDraft] = useState(value || "");
  useEffect(() => setDraft(value || ""), [value]);
  if (mode === "read" || readonly) {
    const href = value ? HREF[kind]?.(value) : undefined;
    return href ? (
      <a
        href={href}
        className="text-primary underline-offset-2 hover:underline"
        target={kind === "url" ? "_blank" : undefined}
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()} // a link in a list row opens the link, not the row
      >
        {value}
      </a>
    ) : (
      <FallbackField {...props} />
    );
  }
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
  return kind === "multiline" || (kind === "plain" && meta.type === "text") ? (
    <Textarea {...common} onChange={(e) => setDraft(e.target.value)} />
  ) : (
    <Input
      {...common}
      type={INPUT_TYPE[kind]}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && commit(e.currentTarget.value)}
    />
  );
}

const textKind =
  (kind: Kind): FieldComponent =>
  (props: FieldProps<string | false>) => <Text {...props} kind={kind} />;

export const TextField = textKind("plain");
export const MultilineField = textKind("multiline");
export const EmailField = textKind("email");
export const PhoneField = textKind("phone");
export const UrlField = textKind("url");
