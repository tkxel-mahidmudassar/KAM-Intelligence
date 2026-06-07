"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, BriefcaseBusiness, Home, LogOut, Settings, UserRound } from "lucide-react";
import { RoleBar } from "@/components/layout/RoleBar";
import { useNotifications } from "@/context/NotificationContext";
import { useRole } from "@/context/RoleContext";

const navItems = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/portfolio", label: "Portfolio", icon: BriefcaseBusiness },
];

function isAuthRoute(pathname: string) {
  return pathname === "/login" || pathname === "/forgot-password";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { userId, userName, userEmail, clearUser, hydrated } = useRole();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  useEffect(() => {
    if (!hydrated || isAuthRoute(pathname) || userId) return;
    router.replace("/login");
  }, [hydrated, pathname, router, userId]);

  if (isAuthRoute(pathname)) return <>{children}</>;
  if (!hydrated || !userId) return null;

  function logout() {
    clearUser();
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-[#F3F1EC] text-[#1F2722]">
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-[86px] border-r border-[#E2D8CC] bg-[#FFF9EF]/88 px-3 py-4 shadow-[12px_0_40px_-36px_rgba(31,39,34,0.45)] [backdrop-filter:blur(18px)] md:block">
        <Link href="/home" className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0755E9] shadow-[0_18px_32px_-24px_rgba(7,85,233,0.9)]">
          <img src="/tkxel-logo.svg" alt="Tkxel" className="h-12 w-12 rounded-2xl object-contain" />
        </Link>
        <nav className="mt-8 flex flex-col gap-2">
          {navItems.map((item) => {
            const active = pathname === item.href || (item.href !== "/home" && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex h-14 flex-col items-center justify-center rounded-2xl text-[11px] font-black transition-all ${
                  active ? "bg-[#25352E] text-[#FFF9EF]" : "text-[#7D6E5F] hover:bg-[#F0E7DA] hover:text-[#25352E]"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="mt-1">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="absolute inset-x-3 bottom-4">
          <Link
            href="/settings"
            className={`group flex h-14 flex-col items-center justify-center rounded-2xl text-[11px] font-black transition-all ${
              pathname === "/settings" || pathname.startsWith("/settings/")
                ? "bg-[#25352E] text-[#FFF9EF]"
                : "text-[#7D6E5F] hover:bg-[#F0E7DA] hover:text-[#25352E]"
            }`}
          >
            <Settings className="h-4 w-4" />
            <span className="mt-1">Settings</span>
          </Link>
        </div>
      </aside>

      <div className="md:pl-[86px]">
        <header className="sticky top-0 z-40 border-b border-[#E8E1D7] bg-[rgba(250,247,241,0.86)] px-4 py-2 shadow-[0_10px_28px_-26px_rgba(46,36,23,0.42)] [backdrop-filter:blur(18px)]">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <RoleBar compact />
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setProfileMenuOpen(false);
                    setNotificationsOpen((open) => !open);
                  }}
                  className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#E2D8CC] bg-[#FFF9EF]/74 text-[#25352E]"
                  aria-label="Open notifications"
                >
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 ? <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[#D66A4B]" /> : null}
                </button>
                {notificationsOpen ? (
                  <div className="absolute right-0 top-11 z-50 w-[340px] rounded-3xl border border-[#E2D8CC] bg-[#FFF9EF] p-3 shadow-[0_24px_70px_-38px_rgba(31,39,34,0.75)]">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[14px] font-black text-[#25352E]">Notifications</p>
                      <div className="flex items-center gap-2">
                        {notifications.length > 0 ? (
                          <button type="button" onClick={markAllRead} className="text-[11px] font-black text-[#75685A] hover:text-[#25352E]">
                            Mark read
                          </button>
                        ) : null}
                        <span className="rounded-full border border-[#DFD4C7] px-2 py-0.5 text-[11px] font-bold text-[#766859]">
                          {unreadCount > 0 ? `${unreadCount} new` : "All read"}
                        </span>
                      </div>
                    </div>
                    {notifications.length > 0 ? <div className="space-y-2">
                      {notifications.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setNotificationsOpen(false);
                            markRead(item.id);
                            window.dispatchEvent(new CustomEvent("kam:notification-selected", { detail: item }));
                            router.push(item.href);
                          }}
                          className={`block w-full rounded-2xl border p-3 text-left transition hover:border-[#BBAA96] hover:bg-[#F6EFE4] ${
                            item.read ? "border-[#E8DDCF] bg-[#FFFCF6]/62" : "border-[#D4B88F] bg-[#FFF8ED]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-[13px] font-black text-[#25352E]">{item.title}</p>
                            <span className="shrink-0 text-[10px] font-black text-[#9A8A79]">{item.createdAt}</span>
                          </div>
                          <p className="mt-1 text-[12px] font-semibold leading-snug text-[#75685A]">{item.detail}</p>
                        </button>
                      ))}
                    </div> : (
                      <div className="rounded-2xl border border-[#E8DDCF] bg-[#FFFCF6] p-3 text-[12px] font-bold text-[#75685A]">
                        No alerts have fired yet.
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setNotificationsOpen(false);
                    setProfileMenuOpen((open) => !open);
                  }}
                  className="inline-flex h-9 items-center gap-2 rounded-full border border-[#E2D8CC] bg-[#FFF9EF]/74 pl-2 pr-3 text-[#25352E]"
                  aria-expanded={profileMenuOpen}
                  aria-haspopup="menu"
                >
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#25352E] text-[11px] font-black text-[#FFF9EF]">
                    {(userName || "Sarah Chen").split(" ").map((part) => part[0]).join("").slice(0, 2)}
                  </span>
                  <span className="hidden text-[12px] font-black sm:inline">{userName || "Sarah Chen"}</span>
                </button>
                {profileMenuOpen ? <div className="absolute right-0 top-11 w-56 rounded-2xl border border-[#E2D8CC] bg-[#FFF9EF] p-2 opacity-100 shadow-[0_22px_60px_-34px_rgba(31,39,34,0.72)] transition-all" role="menu">
                  <div className="rounded-xl bg-[#F7F1E7] px-3 py-2">
                    <p className="text-[13px] font-black text-[#25352E]">{userName || "Sarah Chen"}</p>
                    <p className="truncate text-[11px] font-bold text-[#7D6E5F]">{userEmail || "sarah.chen@tkxel.com"}</p>
                  </div>
                  <Link href="/settings" onClick={() => setProfileMenuOpen(false)} className="mt-2 flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-bold text-[#25352E] hover:bg-[#F0E7DA]" role="menuitem">
                    <UserRound className="h-4 w-4" />
                    My profile
                  </Link>
                  <button type="button" onClick={logout} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] font-bold text-[#B33D32] hover:bg-[#FFF0ED]" role="menuitem">
                    <LogOut className="h-4 w-4" />
                    Log out
                  </button>
                </div> : null}
              </div>
            </div>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
