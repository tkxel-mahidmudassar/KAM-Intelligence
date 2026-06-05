"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, Zap } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { FloatingAssistant } from "@/components/assistant/FloatingAssistant";
import { useRole } from "@/context/RoleContext";

function DemoBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = sessionStorage.getItem("demo-banner-dismissed");
    if (!dismissed) setVisible(true);
  }, []);

  const dismiss = () => {
    sessionStorage.setItem("demo-banner-dismissed", "1");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="flex shrink-0 items-center justify-center gap-2 px-4 py-1.5 text-[11px] font-medium"
      style={{
        background: "linear-gradient(90deg, #0755E9 0%, #6D28D9 100%)",
        color: "#fff",
      }}
    >
      <Zap className="h-3 w-3 shrink-0 opacity-80" />
      <span className="opacity-90">
        <strong className="font-semibold opacity-100">KAM Intelligence POC</strong>
        &nbsp;&middot;&nbsp;Live mock data &middot; AI co-pilot via Gemini 2.0 Flash &middot; Role switcher top-right
      </span>
      <button
        onClick={dismiss}
        className="ml-2 flex h-4 w-4 shrink-0 items-center justify-center rounded opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Dismiss"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { userId, hydrated } = useRole();

  // Redirect to login if not authenticated (after hydration)
  useEffect(() => {
    if (hydrated && !userId) {
      router.replace("/login");
    }
  }, [hydrated, userId, router]);

  // Render a blank screen while hydrating (avoids flash before redirect)
  if (!hydrated || !userId) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: "var(--bg-base)" }}>
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-xl bg-[#0755E9] animate-pulse" />
          <p className="text-[12px] text-[var(--text-muted)]">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <DemoBanner />
      <div className="flex flex-1 overflow-hidden min-h-0">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          <Topbar />
          <main className="flex-1 overflow-y-auto p-6">
            {children}
          </main>
        </div>
      </div>
      <FloatingAssistant />
    </div>
  );
}
