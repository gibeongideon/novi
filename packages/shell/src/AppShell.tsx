import { menuPath, useMenus, useSession } from "@novi/engine";
import {
  Avatar,
  Breadcrumb,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  useT,
} from "@novi/ui";
import { LayoutGrid, LogOut, Menu as MenuIcon, Search } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { AppIcon } from "./AppIcon";
import { CommandPalette, isTypingTarget } from "./CommandPalette";
import { Sidebar } from "./Sidebar";
import { menuUrl } from "./urls";

/** Top bar + current app's sidebar + content. The active menu comes from `?menu=` (deep-linkable). */
export function AppShell({ children, productName = "NOVI" }: { children: ReactNode; productName?: string }) {
  const t = useT();
  const navigate = useNavigate();
  const { info, logout } = useSession();
  const menus = useMenus();
  const [params] = useSearchParams();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState({ open: false, query: "" });

  // Type anywhere to search; ⌘K / Ctrl+K also opens it (D-24)
  const openRef = useRef(false);
  openRef.current = search.open;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch({ open: true, query: "" });
        return;
      }
      const printable = e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey;
      if (!printable || isTypingTarget(e.target)) return;
      if (!openRef.current && e.key === " ") return;
      // Keys typed before the palette input has focus are appended, so nothing is lost
      e.preventDefault();
      openRef.current = true;
      setSearch((s) => ({ open: true, query: s.open ? s.query + e.key : e.key }));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const activeId = Number(params.get("menu")) || undefined;
  const path = menus.data && activeId ? menuPath(menus.data, activeId) : [];
  const app = path[0];
  const userName = String(info?.name ?? info?.username ?? "");

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="flex h-header items-center gap-2 border-b border-border bg-surface px-3">
        {app ? (
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={t("menu")}
            onClick={() => setSidebarOpen((o) => !o)}
          >
            <MenuIcon aria-hidden />
          </Button>
        ) : null}
        <Button variant="ghost" size="icon" aria-label={t("apps")} asChild>
          <Link to="/">
            <LayoutGrid aria-hidden />
          </Link>
        </Button>
        {app ? (
          <AppIcon app={app} size="sm" />
        ) : (
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span
              aria-hidden
              data-tone="1"
              className="novi-tile grid size-7 place-items-center rounded-lg text-sm"
            >
              {productName.slice(0, 1)}
            </span>
            {productName}
          </Link>
        )}
        <Breadcrumb
          className="flex-1"
          items={path.map((n, i) => {
            const url = i < path.length - 1 ? menuUrl(n) : undefined;
            return { label: n.name, onSelect: url ? () => navigate(url) : undefined };
          })}
        />
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("search")}
          aria-keyshortcuts="Control+K Meta+K"
          onClick={() => setSearch({ open: true, query: "" })}
        >
          <Search aria-hidden />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={userName}>
              <Avatar name={userName} size="sm" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{userName}</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => logout()}>
              <LogOut aria-hidden />
              {t("signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <div className="flex flex-1">
        {app ? (
          <aside
            className={
              sidebarOpen
                ? "fixed inset-y-header left-0 z-30 w-sidebar overflow-y-auto border-r border-border bg-surface md:static"
                : "hidden w-sidebar shrink-0 overflow-y-auto border-r border-border bg-surface md:block"
            }
          >
            <Sidebar app={app} activeId={activeId} />
          </aside>
        ) : null}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
      <CommandPalette
        open={search.open}
        onOpenChange={(open) => setSearch((s) => ({ ...s, open }))}
        query={search.query}
        onQueryChange={(query) => setSearch((s) => ({ ...s, query }))}
      />
    </div>
  );
}
