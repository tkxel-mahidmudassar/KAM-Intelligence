"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutGrid, Zap, BarChart3, BarChart2, Users, Settings, Home, ClipboardList, CheckSquare, MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRole } from "@/context/RoleContext";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  color: string;      // badge background
  iconColor: string;  // icon stroke color
}

const NAV_MAIN: NavItem[] = [
  {
    href: "/home",
    label: "Home",
    icon: Home,
    color: "#0755E9",
    iconColor: "#fff",
  },
  {
    href: "/ai-pulse",
    label: "AI Pulse",
    icon: Zap,
    color: "#9333EA",
    iconColor: "#fff",
  },
  {
    href: "/assistant",
    label: "AI Assistant",
    icon: MessageSquare,
    color: "#0891B2",
    iconColor: "#fff",
  },
  {
    href: "/portfolio",
    label: "Portfolio",
    icon: LayoutGrid,
    color: "#2563EB",
    iconColor: "#fff",
  },
  {
    href: "/actions",
    label: "Action Board",
    icon: CheckSquare,
    color: "#0891B2",
    iconColor: "#fff",
  },
];

const NAV_MANAGER: NavItem[] = [
  {
    href: "/manager",
    label: "Command Centre",
    icon: Users,
    color: "#EA580C",
    iconColor: "#fff",
  },
];

const NAV_REPORTS: NavItem[] = [
  {
    href: "/analytics",
    label: "Analytics",
    icon: BarChart2,
    color: "#0891B2",
    iconColor: "#fff",
  },
  {
    href: "/qbr",
    label: "QBR / DBR",
    icon: BarChart3,
    color: "#0755E9",
    iconColor: "#fff",
  },
];

const NAV_AUDIT: NavItem[] = [
  {
    href: "/audit",
    label: "Audit Log",
    icon: ClipboardList,
    color: "#6366F1",
    iconColor: "#fff",
  },
];

const NAV_BOTTOM: NavItem[] = [
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    color: "#6B7280",
    iconColor: "#fff",
  },
];

function NavRow({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "group flex items-center gap-3 rounded-xl px-2.5 py-2 transition-all duration-150",
        active
          ? "bg-[var(--bg-surface-2)]"
          : "hover:bg-[var(--bg-surface-2)]"
      )}
    >
      {/* Colored icon badge */}
      <div
        className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg transition-all duration-150"
        style={{
          background: active ? item.color : `${item.color}22`,
          boxShadow: active ? `0 2px 8px ${item.color}55` : "none",
        }}
      >
        <Icon
          className="h-[14px] w-[14px] transition-colors"
          style={{ color: active ? item.iconColor : item.color }}
          strokeWidth={active ? 2.5 : 2}
        />
      </div>

      {/* Label */}
      <span
        className={cn(
          "text-[13px] font-medium transition-colors",
          active
            ? "text-[var(--text-primary)] font-semibold"
            : "text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]"
        )}
      >
        {item.label}
      </span>

      {/* Active dot */}
      {active && (
        <div
          className="ml-auto h-1.5 w-1.5 rounded-full shrink-0"
          style={{ background: item.color }}
        />
      )}
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2.5 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-disabled)] select-none">
      {children}
    </p>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { role } = useRole();
  const showManager = role === "MANAGER" || role === "EXECUTIVE";

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href + "/"));

  return (
    <aside
      className="flex w-[220px] shrink-0 flex-col overflow-y-auto overflow-x-hidden"
      style={{
        background: "var(--glass-bg)",
        backdropFilter: "var(--glass-blur)",
        borderRight: "1px solid var(--border-subtle)",
      }}
    >
      {/* Logo */}
      <div
        className="flex h-14 shrink-0 items-center gap-2.5 px-4"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <Image
          src="/tkxel-logo.svg"
          alt="Tkxel"
          width={36}
          height={36}
          className="rounded-lg shrink-0"
        />
        <div className="flex flex-col leading-none">
          <span className="text-[13px] font-bold text-[var(--text-primary)] tracking-[-0.02em]">
            KAM Intel
          </span>
          <span className="text-[10px] text-[var(--text-muted)] mt-[1px]">by Tkxel</span>
        </div>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-2.5 py-3 space-y-0.5">
        {NAV_MAIN.map((item) => (
          <NavRow key={item.href} item={item} active={isActive(item.href)} />
        ))}

        {showManager && (
          <>
            <SectionLabel>Management</SectionLabel>
            {NAV_MANAGER.map((item) => (
              <NavRow key={item.href} item={item} active={isActive(item.href)} />
            ))}
          </>
        )}

        <SectionLabel>Reports</SectionLabel>
        {NAV_REPORTS.map((item) => (
          <NavRow key={item.href} item={item} active={isActive(item.href)} />
        ))}

        {showManager && (
          <>
            <SectionLabel>Compliance</SectionLabel>
            {NAV_AUDIT.map((item) => (
              <NavRow key={item.href} item={item} active={isActive(item.href)} />
            ))}
          </>
        )}
      </nav>

      {/* Bottom */}
      <div
        className="px-2.5 pb-3 pt-2 space-y-0.5"
        style={{ borderTop: "1px solid var(--border-subtle)" }}
      >
        {NAV_BOTTOM.map((item) => (
          <NavRow key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </div>
    </aside>
  );
}
