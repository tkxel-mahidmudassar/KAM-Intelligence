"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRole } from "@/context/RoleContext";
import { portfolioAccounts } from "@/lib/v2/portfolioData";
import type { Role } from "@/types";

export type NotificationSeverity = "info" | "warning" | "success";

export interface AppNotification {
  id: string;
  title: string;
  detail: string;
  href: string;
  source: string;
  severity: NotificationSeverity;
  createdAt: string;
  createdAtIso?: string;
  read: boolean;
  dismissed?: boolean;
  accountId?: string | null;
}

type NotificationInput = Omit<AppNotification, "id" | "severity" | "createdAt" | "read"> & {
  id?: string;
  severity?: NotificationSeverity;
  createdAt?: string;
  createdAtIso?: string;
  targetRole?: Role;
  targetUserId?: string;
};

interface NotificationContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  fireNotification: (notification: NotificationInput) => void;
  markRead: (notificationId: string) => void;
  markAllRead: () => void;
  dismissNotification: (notificationId: string) => void;
  refreshNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);
const LOCAL_READ_KEY = "kamazing:v2-derived-notifications-read";
const LOCAL_DISMISSED_KEY = "kamazing:v2-derived-notifications-dismissed";
const ACCOUNT_CREATION_REQUESTS_KEY = "kam_v2_account_creation_requests";

function notificationHeaders(role: Role, userId: string | null) {
  return {
    "x-role": role,
    ...(userId ? { "x-user-id": userId } : {}),
  };
}

function normalizeNotification(raw: Record<string, unknown>): AppNotification {
  const createdAtIso = String(raw.createdAtIso ?? raw.createdAt ?? new Date().toISOString());
  const severity = String(raw.severity ?? "info");
  return {
    id: String(raw.id),
    title: String(raw.title ?? "Notification"),
    detail: String(raw.detail ?? ""),
    href: String(raw.href ?? "/portfolio"),
    source: String(raw.source ?? "system"),
    severity: severity === "warning" || severity === "success" ? severity : "info",
    createdAt: String(raw.createdAt ?? createdAtIso),
    createdAtIso,
    read: Boolean(raw.read),
    dismissed: Boolean(raw.dismissed),
    accountId: raw.accountId ? String(raw.accountId) : null,
  };
}

function readLocalSet(key: string) {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "[]");
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set<string>();
  }
}

function writeLocalSet(key: string, values: Set<string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(Array.from(values)));
}

function accountFocusFor(accountId: string) {
  return `/portfolio?account=${accountId}&tab=overview`;
}

function isDerivedNotificationId(id: string) {
  return id.startsWith("kamazing-live-alert-") || id.startsWith("kamazing-live-v2-alert-") || id.startsWith("kamazing-alert-");
}

function buildDerivedPortfolioNotifications(role: Role): AppNotification[] {
  if (typeof window === "undefined") return [];

  const readIds = readLocalSet(LOCAL_READ_KEY);
  const dismissedIds = readLocalSet(LOCAL_DISMISSED_KEY);
  const now = new Date();
  const criticalAccounts = portfolioAccounts.filter((account) => account.health === "CRITICAL").slice(0, 4);
  const atRiskAccounts = portfolioAccounts.filter((account) => account.health === "AT_RISK").slice(0, 6);
  const renewalAccounts = portfolioAccounts
    .filter((account) => account.renewalDays > 0 && account.renewalDays < 90)
    .sort((a, b) => a.renewalDays - b.renewalDays)
    .slice(0, 5);

  const derived: AppNotification[] = [];

  criticalAccounts.forEach((account, index) => {
    const id = `kamazing-live-v2-alert-critical-${account.id}`;
    derived.push({
      id,
      title: `${account.name} is critical`,
      detail: `Score is ${account.healthScore}/100. Review the account workspace and proposed recovery steps.`,
      href: accountFocusFor(account.id),
      source: "portfolio-health",
      severity: "warning",
      createdAt: new Date(now.getTime() - (index + 1) * 8 * 60 * 1000).toISOString(),
      createdAtIso: new Date(now.getTime() - (index + 1) * 8 * 60 * 1000).toISOString(),
      read: readIds.has(id),
      dismissed: dismissedIds.has(id),
      accountId: account.id,
    });
  });

  atRiskAccounts.forEach((account, index) => {
    const weakestScore = Object.entries(account.scoreDimensions ?? {})
      .filter(([, value]) => typeof value === "number")
      .sort((a, b) => Number(a[1]) - Number(b[1]))[0]?.[0];
    const focus = weakestScore ? `&focus=${weakestScore.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}` : "";
    const id = `kamazing-live-v2-alert-risk-${account.id}`;
    derived.push({
      id,
      title: `${account.name} needs attention`,
      detail: `Score is ${account.healthScore}/100${weakestScore ? ` with ${weakestScore.replace(/([A-Z])/g, " $1").toLowerCase()} under pressure` : ""}.`,
      href: `${accountFocusFor(account.id)}${focus}`,
      source: "portfolio-health",
      severity: "warning",
      createdAt: new Date(now.getTime() - (index + 1) * 17 * 60 * 1000).toISOString(),
      createdAtIso: new Date(now.getTime() - (index + 1) * 17 * 60 * 1000).toISOString(),
      read: readIds.has(id),
      dismissed: dismissedIds.has(id),
      accountId: account.id,
    });
  });

  renewalAccounts.forEach((account, index) => {
    const id = `kamazing-live-v2-alert-renewal-${account.id}`;
    derived.push({
      id,
      title: `${account.name} renewal is inside 90 days`,
      detail: `${account.renewalDays} days remaining. Confirm owner, renewal path, and next client touchpoint.`,
      href: accountFocusFor(account.id),
      source: "renewal-watch",
      severity: account.health === "HEALTHY" ? "info" : "warning",
      createdAt: new Date(now.getTime() - (index + 1) * 23 * 60 * 1000).toISOString(),
      createdAtIso: new Date(now.getTime() - (index + 1) * 23 * 60 * 1000).toISOString(),
      read: readIds.has(id),
      dismissed: dismissedIds.has(id),
      accountId: account.id,
    });
  });

  if (role !== "ASSOCIATE") {
    try {
      const requests = JSON.parse(window.localStorage.getItem(ACCOUNT_CREATION_REQUESTS_KEY) || "[]");
      if (Array.isArray(requests)) {
        requests
          .filter((request) => request?.status === "Submitted to KAM")
          .forEach((request, index) => {
            const id = `kamazing-live-v2-alert-account-draft-${String(request.id ?? index)}`;
            derived.unshift({
              id,
              title: `${request?.draft?.name ?? "New account"} draft needs review`,
              detail: `${request?.submittedBy ?? "An associate"} submitted an account creation package.`,
              href: "/portfolio?focus=pending-account-draft",
              source: "account-creation",
              severity: "info",
              createdAt: new Date(now.getTime() - index * 5 * 60 * 1000).toISOString(),
              createdAtIso: new Date(now.getTime() - index * 5 * 60 * 1000).toISOString(),
              read: readIds.has(id),
              dismissed: dismissedIds.has(id),
              accountId: null,
            });
          });
      }
    } catch {
      // Ignore malformed local draft state.
    }
  }

  return derived.filter((item) => !item.dismissed);
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { role, userId, hydrated } = useRole();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [localVersion, setLocalVersion] = useState(0);

  const refreshNotifications = useCallback(async () => {
    if (!hydrated) {
      return;
    }

    const derivedNotifications = buildDerivedPortfolioNotifications(role);
    setNotifications(derivedNotifications);
    if (!userId) {
      return;
    }

    const response = await fetch("/api/notifications", {
      headers: notificationHeaders(role, userId),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Notifications could not be loaded");
    const persistedNotifications: AppNotification[] = Array.isArray(payload.data?.notifications)
      ? payload.data.notifications.map((item: Record<string, unknown>) => normalizeNotification(item))
      : [];
    const nextNotifications = [
      ...persistedNotifications,
      ...derivedNotifications.filter((derived) => !persistedNotifications.some((item) => item.id === derived.id)),
    ].sort((a, b) => new Date(b.createdAtIso ?? b.createdAt).getTime() - new Date(a.createdAtIso ?? a.createdAt).getTime());
    setNotifications(nextNotifications);
  }, [hydrated, role, userId]);

  useEffect(() => {
    if (!hydrated) return;
    void refreshNotifications().catch(() => {
      setNotifications(buildDerivedPortfolioNotifications(role));
    });
  }, [hydrated, localVersion, refreshNotifications, role]);

  const fireNotification = useCallback((notification: NotificationInput) => {
    const id = notification.id ?? `notification-${Date.now()}`;
    const createdAtIso = notification.createdAtIso ?? new Date().toISOString();
    const nextNotification: AppNotification = {
      id,
      title: notification.title,
      detail: notification.detail,
      href: notification.href,
      source: notification.source,
      severity: notification.severity ?? "info",
      createdAt: notification.createdAt ?? createdAtIso,
      createdAtIso,
      read: false,
      dismissed: false,
      accountId: notification.accountId ?? null,
    };

    const isVisibleToCurrentUser = !notification.targetRole || notification.targetRole === role;
    if (isVisibleToCurrentUser) {
      setNotifications((current) => [nextNotification, ...current.filter((item) => item.id !== id)]);
    }

    if (!hydrated || !userId) return;
    void fetch("/api/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...notificationHeaders(role, userId),
      },
      body: JSON.stringify({
        id,
        title: notification.title,
        detail: notification.detail,
        href: notification.href,
        source: notification.source,
        severity: notification.severity ?? "info",
        targetRole: notification.targetRole,
        targetUserId: notification.targetUserId,
        accountId: notification.accountId,
      }),
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.data) return;
        const savedNotification = normalizeNotification(payload.data as Record<string, unknown>);
        if (!notification.targetRole || notification.targetRole === role) {
          setNotifications((current) => [savedNotification, ...current.filter((item) => item.id !== id)]);
        }
      })
      .catch(() => {
        // Keep the optimistic notification visible; the next refresh will reconcile with the DB.
      });
  }, [hydrated, role, userId]);

  const markRead = useCallback((notificationId: string) => {
    setNotifications((current) => current.map((item) => (item.id === notificationId ? { ...item, read: true } : item)));
    if (isDerivedNotificationId(notificationId)) {
      const readIds = readLocalSet(LOCAL_READ_KEY);
      readIds.add(notificationId);
      writeLocalSet(LOCAL_READ_KEY, readIds);
      setLocalVersion((version) => version + 1);
    }
    if (!hydrated || !userId) return;
    void fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...notificationHeaders(role, userId) },
      body: JSON.stringify({ action: "read", id: notificationId }),
    }).catch(() => {});
  }, [hydrated, role, userId]);

  const markAllRead = useCallback(() => {
    setNotifications((current) => current.map((item) => ({ ...item, read: true })));
    const readIds = readLocalSet(LOCAL_READ_KEY);
    notifications.forEach((item) => {
      if (isDerivedNotificationId(item.id)) readIds.add(item.id);
    });
    writeLocalSet(LOCAL_READ_KEY, readIds);
    setLocalVersion((version) => version + 1);
    if (!hydrated || !userId) return;
    void fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...notificationHeaders(role, userId) },
      body: JSON.stringify({ action: "readAll" }),
    }).catch(() => {});
  }, [hydrated, notifications, role, userId]);

  const dismissNotification = useCallback((notificationId: string) => {
    setNotifications((current) => current.filter((item) => item.id !== notificationId));
    if (isDerivedNotificationId(notificationId)) {
      const dismissedIds = readLocalSet(LOCAL_DISMISSED_KEY);
      dismissedIds.add(notificationId);
      writeLocalSet(LOCAL_DISMISSED_KEY, dismissedIds);
      setLocalVersion((version) => version + 1);
    }
    if (!hydrated || !userId) return;
    void fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...notificationHeaders(role, userId) },
      body: JSON.stringify({ action: "dismiss", id: notificationId }),
    }).catch(() => {});
  }, [hydrated, role, userId]);

  const activeNotifications = useMemo(() => notifications.filter((item) => !item.dismissed), [notifications]);

  const value = useMemo<NotificationContextValue>(() => ({
    notifications: activeNotifications,
    unreadCount: activeNotifications.filter((item) => !item.read).length,
    fireNotification,
    markRead,
    markAllRead,
    dismissNotification,
    refreshNotifications,
  }), [activeNotifications, dismissNotification, fireNotification, markAllRead, markRead, refreshNotifications]);

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return context;
}
