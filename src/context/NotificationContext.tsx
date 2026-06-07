"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

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

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_NOTIFICATIONS);
      if (!stored) return;
      const parsed = JSON.parse(stored) as AppNotification[];
      if (Array.isArray(parsed)) {
        setNotifications(parsed);
      }
    } catch {
      // Keep notifications ephemeral if localStorage is unavailable or stale.
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
