"use client";

import { useState, useCallback, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { NotificationDrawer } from "@/components/layout/NotificationDrawer";
import { useRole } from "@/context/RoleContext";
import { cn } from "@/lib/utils";
import type { Role } from "@/types";

const ROLES: { value: Role; label: string }[] = [
  { value: "KAM",       label: "KAM" },
  { value: "MANAGER",   label: "Manager" },
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

export function Topbar() {
  const pathname = usePathname();
  const { role, setRole } = useRole();
  const title = getPageTitle(pathname);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [unread, setUnread] = useState(0);

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
            (data.signals?.filter((s: { isRead: boolean }) => !s.isRead).length ?? 0) +
            (data.insights?.filter((i: { isRead: boolean }) => !i.isRead).length ?? 0);
          setUnread(count);
        })
        .catch(() => {});
    };

    fetchCount();
    const interval = setInterval(fetchCount, 60_000);
    return () => clearInterval(interval);
  }, [role]);

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

          <div
            className="w-px h-5 shrink-0"
            style={{ background: "var(--border-subtle)" }}
          />

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

          {/* Avatar */}
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0755E9] text-[11px] font-bold text-white select-none">
            M
          </div>
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
