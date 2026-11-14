import { type ReactNode, useEffect, useId, useState } from "react";

import { cn } from "../../lib/cn";
import { useT } from "../../lib/i18n";
import { Input } from "../Input";

export interface ComboboxOption {
  id: number | string;
  label: string;
}

export interface ComboboxProps {
  /** The chosen option's label ("" when empty). */
  value: string;
  /** Options for the text typed so far (the caller searches). */
  options: readonly ComboboxOption[];
  loading?: boolean;
  /** The user typed: search again. */
  onSearch(text: string): void;
  /** An option was picked, or the text was cleared (`null`). */
  onSelect(option: ComboboxOption | null): void;
  /** Extra rows under the options (e.g. "Search more…"). */
  footer?: ReactNode;
  invalid?: string;
  placeholder?: string;
  disabled?: boolean;
  "aria-label"?: string;
  id?: string;
}

/**
 * A text input with a list of matches (WAI-ARIA combobox): arrows move, Enter picks, Escape
 * closes; leaving it puts the chosen label back, or clears the value when the text was emptied.
 */
export function Combobox({
  value,
  options,
  loading,
  onSearch,
  onSelect,
  footer,
  invalid,
  placeholder,
  disabled,
  id,
  ...aria
}: ComboboxProps) {
  const t = useT();
  const listId = useId();
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  useEffect(() => setText(value), [value]);

  const pick = (o: ComboboxOption | null) => {
    setOpen(false);
    setText(o?.label ?? "");
    onSelect(o);
  };

  return (
    <div className="relative">
      <Input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined}
        aria-label={aria["aria-label"]}
        autoComplete="off"
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        invalid={invalid}
        onFocus={() => {
          onSearch("");
          setActive(0);
          setOpen(true);
        }}
        onChange={(e) => {
          setText(e.target.value);
          onSearch(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setActive((i) => Math.min(i + 1, options.length - 1));
          else if (e.key === "ArrowUp") setActive((i) => Math.max(i - 1, 0));
          else if (e.key === "Enter" && open && options[active]) pick(options[active]!);
          else if (e.key === "Escape") {
            setOpen(false);
            setText(value);
          } else return;
          e.preventDefault();
        }}
        onBlur={() => {
          setOpen(false);
          if (!text.trim() && value) pick(null);
          else setText(value);
        }}
      />
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full min-w-48 overflow-auto rounded-md border border-border bg-surface py-1 shadow-lg"
        >
          {options.map((o, i) => (
            <li
              key={o.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={cn("cursor-pointer px-3 py-1.5 text-sm", i === active && "bg-surface-sunken")}
              // mousedown, not click: picking must happen before the input's blur
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
              onMouseEnter={() => setActive(i)}
            >
              {o.label}
            </li>
          ))}
          {!options.length ? (
            <li className="px-3 py-1.5 text-sm text-text-muted">{loading ? t("loading") : t("noMatches")}</li>
          ) : null}
          {footer}
        </ul>
      ) : null}
    </div>
  );
}
