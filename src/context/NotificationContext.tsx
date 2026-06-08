"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRole } from "@/context/RoleContext";
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

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { role, userId, hydrated } = useRole();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const refreshNotifications = useCallback(async () => {
    if (!hydrated || !userId) {
      setNotifications([]);
      return;
    }

    const response = await fetch("/api/notifications", {
      headers: notificationHeaders(role, userId),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Notifications could not be loaded");
    const nextNotifications = Array.isArray(payload.data?.notifications)
      ? payload.data.notifications.map((item: Record<string, unknown>) => normalizeNotification(item))
      : [];
    setNotifications(nextNotifications);
  }, [hydrated, role, userId]);

  useEffect(() => {
    if (!hydrated) return;
    void refreshNotifications().catch(() => {
      setNotifications([]);
    });
  }, [hydrated, refreshNotifications]);

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
    if (!hydrated || !userId) return;
    void fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...notificationHeaders(role, userId) },
      body: JSON.stringify({ action: "read", id: notificationId }),
    }).catch(() => {});
  }, [hydrated, role, userId]);

  const markAllRead = useCallback(() => {
    setNotifications((current) => current.map((item) => ({ ...item, read: true })));
    if (!hydrated || !userId) return;
    void fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...notificationHeaders(role, userId) },
      body: JSON.stringify({ action: "readAll" }),
    }).catch(() => {});
  }, [hydrated, role, userId]);

  const dismissNotification = useCallback((notificationId: string) => {
    setNotifications((current) => current.filter((item) => item.id !== notificationId));
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
