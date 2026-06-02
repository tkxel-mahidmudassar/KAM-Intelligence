"use client";

import { useState, useEffect } from "react";
import { X, Zap } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { FloatingAssistant } from "@/components/assistant/FloatingAssistant";

function DemoBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Show banner unless dismissed this session
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
        &nbsp;·&nbsp;Live mock data · AI co-pilot via Gemini 2.5 Flash · Role switcher top-right
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
