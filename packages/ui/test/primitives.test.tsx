import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  Avatar,
  Badge,
  Breadcrumb,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
  I18nProvider,
  initials,
  Input,
  ThemeProvider,
} from "../src/index.js";

describe("Button", () => {
  it("is disabled and busy while loading", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn).toHaveProperty("disabled", true);
    expect(btn.getAttribute("aria-busy")).toBe("true");
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });
  it("renders the child element with asChild", () => {
    render(
      <Button asChild>
        <a href="/x">Open</a>
      </Button>,
    );
    expect(screen.getByRole("link", { name: "Open" }).className).toContain("rounded-md");
  });
});

describe("Input", () => {
  it("exposes Odoo validation errors to assistive tech", () => {
    render(<Input aria-label="Customer" invalid="Required" />);
    expect(screen.getByLabelText("Customer").getAttribute("aria-invalid")).toBe("true");
  });
});

describe("Avatar + Badge", () => {
  it("computes initials", () => {
    expect(initials("Wanjiru Kamau")).toBe("WK");
    expect(initials("Acme")).toBe("A");
    expect(initials("  ")).toBe("?");
  });
  it("badge carries text, not colour alone", () => {
    render(
      <>
        <Badge tone="danger">Overdue</Badge>
        <Avatar name="Tom Twofactor" />
      </>,
    );
    expect(screen.getByText("Overdue")).toBeTruthy();
    expect(screen.getByText("TT")).toBeTruthy();
  });
});

describe("Breadcrumb", () => {
  it("marks the last item as the current page and makes earlier ones clickable", async () => {
    const back = vi.fn();
    render(<Breadcrumb items={[{ label: "Quotations", onSelect: back }, { label: "S00042" }]} />);
    expect(screen.getByText("S00042").getAttribute("aria-current")).toBe("page");
    await userEvent.click(screen.getByRole("button", { name: "Quotations" }));
    expect(back).toHaveBeenCalled();
  });
});

describe("Dialog + i18n", () => {
  it("opens, has an accessible title and a translated close button", async () => {
    render(
      <I18nProvider messages={{ close: "Schließen" }}>
        <Dialog>
          <DialogTrigger>Open</DialogTrigger>
          <DialogContent aria-describedby={undefined}>
            <DialogTitle>Register payment</DialogTitle>
          </DialogContent>
        </Dialog>
      </I18nProvider>,
    );
    await userEvent.click(screen.getByText("Open"));
    expect(screen.getByRole("dialog", { name: "Register payment" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Schließen" })).toBeTruthy();
  });
});

describe("ThemeProvider", () => {
  it("injects token variables and applies tenant colours that pass contrast", () => {
    const { container } = render(
      <ThemeProvider theme={{ light: { primary: "#0a5c36" } }} mode="dark">
        <span>x</span>
      </ThemeProvider>,
    );
    const css = container.querySelector("style[data-novi-theme]")?.textContent ?? "";
    expect(css).toContain("--novi-color-primary:#0a5c36");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
  it("rejects unreadable tenant colours", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { container } = render(
      <ThemeProvider theme={{ light: { primary: "#fff3b0" } }}>
        <span>x</span>
      </ThemeProvider>,
    );
    expect(container.querySelector("style[data-novi-theme]")?.textContent).not.toContain("#fff3b0");
    expect(warn).toHaveBeenCalled();
  });
});
