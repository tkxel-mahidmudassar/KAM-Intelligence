"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, LogOut, ChevronDown, Settings } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { NotificationDrawer } from "@/components/layout/NotificationDrawer";
import { useRole } from "@/context/RoleContext";
import { cn } from "@/lib/utils";
import type { Role } from "@/types";

const ROLES: { value: Role; label: string }[] = [
  { value: "KAM",       label: "Associate" },
  { value: "MANAGER",   label: "KAM" },
  { value: "EXECUTIVE", label: "Exec" },
];

const ROUTE_LABELS: Record<string, string> = {
  "/home":       "Home",
  "/portfolio":  "Portfolio",
  "/ai-pulse":   "AI Pulse",
  "/manager":    "Command Centre",
  "/analytics":  "Analytics",
  "/qbr":        "QBR / DBR",
  "/actions":    "Action Board",
  "/settings":   "Settings",
};

function getPageTitle(pathname: string): string {
  if (pathname.startsWith("/accounts/")) return "Account Workspace";
  return ROUTE_LABELS[pathname] ?? "KAM Intelligence";
}

function avatarInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

// ─── User Menu ────────────────────────────────────────────────────────────────

function UserMenu({ userName, onLogout }: { userName: string; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((x) => !x)}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[var(--text-muted)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)] transition-colors"
      >
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0755E9] text-[10px] font-bold text-white select-none">
          {avatarInitials(userName)}
        </div>
        <span className="hidden sm:block text-[12px] font-medium text-[var(--text-primary)] max-w-[100px] truncate">
          {userName.split(" ")[0]}
        </span>
        <ChevronDown className="h-3 w-3 shrink-0" />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 w-48 rounded-xl border border-[var(--glass-border)] bg-[var(--bg-surface-1)] shadow-lg z-50 py-1"
        >
          <div className="px-3 py-2 border-b border-[var(--border-subtle)]">
            <p className="text-[12px] font-semibold text-[var(--text-primary)] truncate">{userName}</p>
          </div>
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-2)] transition-colors"
          >
            <Settings className="h-3.5 w-3.5" /> Settings
          </Link>
          <button
            onClick={() => { setOpen(false); onLogout(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-[#EF4444] hover:bg-[#EF4444]/8 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" /> Log out
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Topbar ───────────────────────────────────────────────────────────────────

export function Topbar() {
  const pathname = usePathname();
  const router   = useRouter();
  const { role, setRole, userName, clearUser } = useRole();
  const title = getPageTitle(pathname);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [unread,     setUnread]     = useState(0);

  const handleUnreadChange = useCallback((count: number) => {
    setUnread(count);
  }, []);

  // Fetch unread count on mount / role change, then poll every 60 s
  useEffect(() => {
    const fetchCount = () => {
      fetch("/api/notifications", { headers: { "x-role": role } })
        .then((r) => r.json())
        .then((json) => {
          const data = json.data;
          if (!data) return;
          const count =
            (data.pendingSignals?.length   ?? 0) +
            (data.pendingOpps?.length      ?? 0) +
            (data.pendingOverrides?.length ?? 0) +
            (data.unreadInsights?.filter((i: { isRead: boolean }) => !i.isRead).length ?? 0);
          setUnread(count);
        })
        .catch(() => {});
    };

    fetchCount();
    const interval = setInterval(fetchCount, 60_000);
    return () => clearInterval(interval);
  }, [role]);

  const handleLogout = () => {
    clearUser();
    router.push("/login");
  };

  return (
    <>
      <header
        className="flex h-14 shrink-0 items-center justify-between px-5 gap-4"
        style={{
          background: "var(--glass-bg)",
          backdropFilter: "var(--glass-blur)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        {/* Page title */}
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-[14px] font-semibold tracking-[-0.02em] text-[var(--text-primary)] truncate">
            {title}
          </h1>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Role switcher */}
          <div
            className="flex items-center rounded-lg p-0.5 gap-0.5"
            style={{ background: "var(--bg-surface-3)" }}
          >
            {ROLES.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setRole(value)}
                className={cn(
                  "rounded-md px-3 py-1 text-[12px] font-semibold transition-all duration-150",
                  role === value
                    ? "bg-[#0755E9] text-white shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="w-px h-5 shrink-0" style={{ background: "var(--border-subtle)" }} />

          {/* Notification Bell */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="relative flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)] transition-colors"
            title="Notifications"
          >
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold text-white bg-[#EF4444]">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>

          <ThemeToggle />

          {/* User menu */}
          {userName ? (
            <UserMenu userName={userName} onLogout={handleLogout} />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0755E9] text-[11px] font-bold text-white select-none">
              ?
            </div>
          )}
        </div>
      </header>

      <NotificationDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onUnreadChange={handleUnreadChange}
      />
    </>
  );
}
