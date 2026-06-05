"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutGrid, BarChart3, BarChart2, Users, Settings, Home, ClipboardList, CheckSquare, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRole } from "@/context/RoleContext";
import { useState, useEffect } from "react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  color: string;
  iconColor: string;
}

const NAV_MAIN: NavItem[] = [
  { href: "/home",      label: "Home",           icon: Home,         color: "#0755E9", iconColor: "#fff" },
  { href: "/portfolio", label: "Portfolio",       icon: LayoutGrid,   color: "#2563EB", iconColor: "#fff" },
  { href: "/actions",   label: "Action Board",    icon: CheckSquare,  color: "#0891B2", iconColor: "#fff" },
];

const NAV_MANAGER: NavItem[] = [
  { href: "/manager",   label: "Command Centre",  icon: Users,        color: "#EA580C", iconColor: "#fff" },
];

const NAV_REPORTS: NavItem[] = [
  { href: "/analytics", label: "Analytics",       icon: BarChart2,    color: "#0891B2", iconColor: "#fff" },
  { href: "/qbr",       label: "QBR / DBR",       icon: BarChart3,    color: "#0755E9", iconColor: "#fff" },
];

const NAV_AUDIT: NavItem[] = [
  { href: "/audit",     label: "Audit Log",       icon: ClipboardList, color: "#6366F1", iconColor: "#fff" },
];

const NAV_BOTTOM: NavItem[] = [
  { href: "/settings",  label: "Settings",        icon: Settings,     color: "#6B7280", iconColor: "#fff" },
];

// ─── Tooltip wrapper (collapsed mode only) ────────────────────────────────────

function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative group/tip flex items-center justify-center">
      {children}
      <div
        className="pointer-events-none absolute left-full ml-2.5 z-50 whitespace-nowrap rounded-lg border border-[var(--glass-border)] bg-[var(--bg-surface-1)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-primary)] shadow-lg
          opacity-0 translate-x-[-4px] group-hover/tip:opacity-100 group-hover/tip:translate-x-0 transition-all duration-150"
      >
        {label}
      </div>
    </div>
  );
}

// ─── Nav row ─────────────────────────────────────────────────────────────────

function NavRow({ item, active, collapsed }: { item: NavItem; active: boolean; collapsed: boolean }) {
  const Icon = item.icon;

  const iconBadge = (
    <div
      className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-lg transition-all duration-150"
      style={{
        background: active ? item.color : `${item.color}22`,
        boxShadow: active ? `0 2px 8px ${item.color}55` : "none",
      }}
    >
      <Icon
        className="h-[15px] w-[15px] transition-colors"
        style={{ color: active ? item.iconColor : item.color }}
        strokeWidth={active ? 2.5 : 2}
      />
    </div>
  );

  if (collapsed) {
    return (
      <Tooltip label={item.label}>
        <Link
          href={item.href}
          className={cn(
            "flex items-center justify-center rounded-xl p-1.5 transition-all duration-150 w-full",
            active ? "bg-[var(--bg-surface-2)]" : "hover:bg-[var(--bg-surface-2)]"
          )}
        >
          {iconBadge}
        </Link>
      </Tooltip>
    );
  }

  return (
    <Link
      href={item.href}
      className={cn(
        "group flex items-center gap-3 rounded-xl px-2.5 py-2 transition-all duration-150",
        active ? "bg-[var(--bg-surface-2)]" : "hover:bg-[var(--bg-surface-2)]"
      )}
    >
      {iconBadge}
      <span
        className={cn(
          "text-[13px] font-medium transition-colors truncate",
          active ? "text-[var(--text-primary)] font-semibold" : "text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]"
        )}
      >
        {item.label}
      </span>
      {active && (
        <div className="ml-auto h-1.5 w-1.5 rounded-full shrink-0" style={{ background: item.color }} />
      )}
    </Link>
  );
}

function SectionLabel({ children, collapsed }: { children: React.ReactNode; collapsed: boolean }) {
  if (collapsed) return <div className="my-1.5 mx-auto h-px w-6 bg-[var(--border-subtle)]" />;
  return (
    <p className="px-2.5 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-disabled)] select-none">
      {children}
    </p>
  );
}

// ─── Main sidebar ─────────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname();
  const { role } = useRole();
  const showManager = role === "KAM" || role === "MANAGER" || role === "EXECUTIVE";

  const [collapsed, setCollapsed] = useState(false);

  // Persist collapse state across refreshes
  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    if (stored === "1") setCollapsed(true);
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      localStorage.setItem("sidebar-collapsed", prev ? "0" : "1");
      return !prev;
    });
  };

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href + "/"));

  const w = collapsed ? "w-[60px]" : "w-[220px]";

  return (
    <aside
      className={cn("flex shrink-0 flex-col overflow-y-auto overflow-x-hidden transition-[width] duration-200", w)}
      style={{
        background: "var(--glass-bg)",
        backdropFilter: "var(--glass-blur)",
        borderRight: "1px solid var(--border-subtle)",
      }}
    >
      {/* Logo */}
      <div
        className={cn("flex h-14 shrink-0 items-center gap-2.5 transition-all duration-200", collapsed ? "justify-center px-0" : "px-4")}
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <Image src="/tkxel-logo.svg" alt="Tkxel" width={32} height={32} className="rounded-lg shrink-0" />
        {!collapsed && (
          <div className="flex flex-col leading-none overflow-hidden">
            <span className="text-[13px] font-bold text-[var(--text-primary)] tracking-[-0.02em] truncate">KAM Intel</span>
            <span className="text-[10px] text-[var(--text-muted)] mt-[1px]">by Tkxel</span>
          </div>
        )}
      </div>

      {/* Main nav */}
      <nav className={cn("flex-1 py-3 space-y-0.5 transition-all duration-200", collapsed ? "px-1.5" : "px-2.5")}>
        {NAV_MAIN.map((item) => (
          <NavRow key={item.href} item={item} active={isActive(item.href)} collapsed={collapsed} />
        ))}

        {showManager && (
          <>
            <SectionLabel collapsed={collapsed}>Management</SectionLabel>
            {NAV_MANAGER.map((item) => (
              <NavRow key={item.href} item={item} active={isActive(item.href)} collapsed={collapsed} />
            ))}
          </>
        )}

        <SectionLabel collapsed={collapsed}>Reports</SectionLabel>
        {NAV_REPORTS.map((item) => (
          <NavRow key={item.href} item={item} active={isActive(item.href)} collapsed={collapsed} />
        ))}

        {showManager && (
          <>
            <SectionLabel collapsed={collapsed}>Compliance</SectionLabel>
            {NAV_AUDIT.map((item) => (
              <NavRow key={item.href} item={item} active={isActive(item.href)} collapsed={collapsed} />
            ))}
          </>
        )}
      </nav>

      {/* Bottom — Settings + collapse toggle */}
      <div
        className={cn("pb-3 pt-2 space-y-0.5 transition-all duration-200", collapsed ? "px-1.5" : "px-2.5")}
        style={{ borderTop: "1px solid var(--border-subtle)" }}
      >
        {NAV_BOTTOM.map((item) => (
          <NavRow key={item.href} item={item} active={isActive(item.href)} collapsed={collapsed} />
        ))}

        {/* Collapse toggle */}
        {collapsed ? (
          <Tooltip label="Expand sidebar">
            <button
              onClick={toggle}
              className="flex h-[32px] w-[32px] items-center justify-center rounded-xl hover:bg-[var(--bg-surface-2)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all mx-auto mt-1"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          </Tooltip>
        ) : (
          <button
            onClick={toggle}
            className="group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 hover:bg-[var(--bg-surface-2)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all mt-1"
          >
            <div className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-lg bg-[var(--bg-surface-2)] group-hover:bg-[var(--border-subtle)] transition-colors">
              <PanelLeftClose className="h-[15px] w-[15px]" />
            </div>
            <span className="text-[13px] font-medium">Collapse</span>
          </button>
        )}
      </div>
    </aside>
  );
}
