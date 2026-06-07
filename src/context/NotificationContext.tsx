"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { portfolioAccounts } from "@/lib/v2/portfolioData";
import { workspaceActionItems } from "@/lib/v2/workspaceData";

export type NotificationSeverity = "info" | "warning" | "success";

export interface AppNotification {
  id: string;
  title: string;
  detail: string;
  href: string;
  source: string;
  severity: NotificationSeverity;
  createdAt: string;
  read: boolean;
}

type NotificationInput = Omit<AppNotification, "id" | "severity" | "createdAt" | "read"> & {
  id?: string;
  severity?: NotificationSeverity;
  createdAt?: string;
};

interface NotificationContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  fireNotification: (notification: NotificationInput) => void;
  markRead: (notificationId: string) => void;
  markAllRead: () => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);
const LS_NOTIFICATIONS = "kam_v2_notifications";

function portfolioHrefForAccountName(accountName: string, tab: "overview" | "profile" | "documents" = "overview", focus?: string) {
  const account = portfolioAccounts.find((item) => item.name.toLowerCase() === accountName.toLowerCase());
  const params = new URLSearchParams();
  if (account) params.set("account", account.id);
  params.set("tab", tab);
  if (focus) params.set("focus", focus);
  return account ? `/portfolio?${params.toString()}` : "/portfolio";
}

function baselineNotifications(): AppNotification[] {
  const criticalAccounts = portfolioAccounts
    .filter((account) => account.health === "CRITICAL")
    .sort((a, b) => a.healthScore - b.healthScore)
    .slice(0, 3);
  const atRiskRenewals = portfolioAccounts
    .filter((account) => account.health === "AT_RISK" && account.renewalDays <= 120)
    .sort((a, b) => a.renewalDays - b.renewalDays)
    .slice(0, 4);
  const dueActions = workspaceActionItems
    .filter((item) => item.status === "pending")
    .slice(0, 4);

  const notifications: AppNotification[] = [
    {
      id: "account-draft-pending-novagrid",
      title: "NovaGrid account draft needs review",
      detail: "Aisha submitted a new account creation package.",
      href: "/portfolio?focus=pending-account-draft",
      source: "account-creation-approval",
      severity: "warning",
      createdAt: "Today",
      read: false,
    },
    {
      id: "playbook-project-health-parsed",
      title: "Project Health playbook parsed",
      detail: "The new playbook is ready for score task suggestions.",
      href: "/settings?section=playbooks",
      source: "playbook-upload",
      severity: "info",
      createdAt: "Today",
      read: false,
    },
  ];

  criticalAccounts.forEach((account) => {
    notifications.push({
      id: `critical-account-${account.id}`,
      title: `${account.name} is critical`,
      detail: `Score ${account.healthScore}/100. Review the weakest KPI and recovery task.`,
      href: `/portfolio?account=${account.id}&tab=overview`,
      source: "score-monitor",
      severity: "warning",
      createdAt: "Today",
      read: false,
    });
  });

  atRiskRenewals.forEach((account) => {
    notifications.push({
      id: `renewal-risk-${account.id}`,
      title: `${account.name} renewal risk needs attention`,
      detail: `${account.renewalDays} days to renewal with score ${account.healthScore}/100.`,
      href: `/portfolio?account=${account.id}&tab=overview`,
      source: "renewal-monitor",
      severity: "warning",
      createdAt: "Today",
      read: false,
    });
  });

  dueActions.forEach((item) => {
    notifications.push({
      id: `due-action-${item.id}`,
      title: `${item.accountName}: ${item.title}`,
      detail: `${item.type} due ${item.date}.`,
      href: portfolioHrefForAccountName(item.accountName, "profile"),
      source: "account-journey",
      severity: "info",
      createdAt: "Today",
      read: false,
    });
  });

  return notifications;
}

function mergeNotifications(stored: AppNotification[], baseline: AppNotification[]) {
  const byId = new Map<string, AppNotification>();
  baseline.forEach((item) => byId.set(item.id, item));
  stored.forEach((item) => {
    const defaultItem = byId.get(item.id);
    byId.set(item.id, defaultItem ? { ...defaultItem, read: item.read, createdAt: item.createdAt || defaultItem.createdAt } : item);
  });
  return Array.from(byId.values());
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_NOTIFICATIONS);
      const parsed = stored ? JSON.parse(stored) as AppNotification[] : [];
      setNotifications(mergeNotifications(Array.isArray(parsed) ? parsed : [], baselineNotifications()));
    } catch {
      setNotifications(baselineNotifications());
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LS_NOTIFICATIONS, JSON.stringify(notifications));
    } catch {
      // No-op for restricted browser storage.
    }
  }, [notifications]);

  const fireNotification = useCallback((notification: NotificationInput) => {
    const id = notification.id ?? `notification-${Date.now()}`;
    setNotifications((current) => {
      const existing = current.find((item) => item.id === id);
      const nextNotification: AppNotification = {
        id,
        title: notification.title,
        detail: notification.detail,
        href: notification.href,
        source: notification.source,
        severity: notification.severity ?? "info",
        createdAt: notification.createdAt ?? existing?.createdAt ?? "Now",
        read: existing?.read ?? false,
      };
      return [nextNotification, ...current.filter((item) => item.id !== id)];
    });
  }, []);

  const markRead = useCallback((notificationId: string) => {
    setNotifications((current) => current.map((item) => (item.id === notificationId ? { ...item, read: true } : item)));
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((current) => current.map((item) => ({ ...item, read: true })));
  }, []);

  const value = useMemo<NotificationContextValue>(() => ({
    notifications,
    unreadCount: notifications.filter((item) => !item.read).length,
    fireNotification,
    markRead,
    markAllRead,
  }), [fireNotification, markAllRead, markRead, notifications]);

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return context;
}
