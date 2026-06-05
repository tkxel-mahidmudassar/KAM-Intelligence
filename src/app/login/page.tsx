"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useRole } from "@/context/RoleContext";

// Demo credentials shown below the form for easy reference
const DEMO_CREDENTIALS = [
  { email: "sarah.chen@tkxel.com",   password: "sarah",   name: "Sarah Chen",     role: "KAM",       color: "#0755E9" },
  { email: "marcus.okafor@tkxel.com", password: "marcus",  name: "Marcus Okafor",  role: "KAM",       color: "#0755E9" },
  { email: "priya.nair@tkxel.com",   password: "priya",   name: "Priya Nair",     role: "Manager",   color: "#7C3AED" },
  { email: "daniel.west@tkxel.com",  password: "daniel",  name: "Daniel West",    role: "Executive", color: "#0EA5E9" },
];

const ROLE_COLOR: Record<string, string> = {
  KAM:       "#0755E9",
  Manager:   "#7C3AED",
  Executive: "#0EA5E9",
};

function avatarInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export default function LoginPage() {
  const router = useRouter();
  const { setUser, userId, hydrated } = useRole();

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  // Already logged in — bounce to home
  useEffect(() => {
    if (hydrated && userId) router.replace("/home");
  }, [hydrated, userId, router]);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res  = await fetch("/api/auth/login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: email.trim(), password: password.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Invalid email or password.");
        setLoading(false);
        return;
      }
      const user = json.data?.user;
      if (!user) {
        setError("Unexpected server response. Please try again.");
        setLoading(false);
        return;
      }
      setUser(user.id, user.name, user.email, user.role);
      router.push("/home");
    } catch {
      setError("Network error. Please check your connection and try again.");
      setLoading(false);
    }
  };

  const fillCredentials = (cred: (typeof DEMO_CREDENTIALS)[0]) => {
    setEmail(cred.email);
    setPassword(cred.password);
    setError(null);
    emailRef.current?.focus();
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: "var(--bg-base)" }}
    >
      {/* Logo / wordmark */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center gap-2.5 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0755E9] shadow-lg">
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-white" stroke="currentColor" strokeWidth={2}>
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="text-[20px] font-bold tracking-[-0.04em] text-[var(--text-primary)]">KAM Intelligence</p>
        </div>
        <p className="text-[12px] text-[var(--text-muted)]">Sign in to your account</p>
      </div>

      {/* Login card */}
      <div
        className="w-full max-w-sm rounded-2xl border border-[var(--glass-border)] shadow-xl p-8"
        style={{ background: "var(--bg-surface-1)" }}
      >
        <form onSubmit={handleSubmit} noValidate>
          <h1 className="text-[17px] font-semibold text-[var(--text-primary)] mb-6">Welcome back</h1>

          {/* Email */}
          <div className="mb-4">
            <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5" htmlFor="email">
              Email address
            </label>
            <input
              ref={emailRef}
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null); }}
              placeholder="you@tkxel.com"
              className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3.5 py-2.5 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[#0755E9] focus:ring-2 focus:ring-[#0755E9]/20 transition-all"
            />
          </div>

          {/* Password */}
          <div className="mb-5">
            <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              placeholder="Enter your password"
              className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3.5 py-2.5 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[#0755E9] focus:ring-2 focus:ring-[#0755E9]/20 transition-all"
            />
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-4 rounded-lg border border-[#EF4444]/30 bg-[#EF444410] px-3.5 py-2.5 text-[12px] text-[#EF4444]">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[#0755E9] py-2.5 text-[13px] font-semibold text-white shadow-md hover:bg-[#0644C4] active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Signing in...
              </span>
            ) : (
              "Sign in"
            )}
          </button>
        </form>
      </div>

      {/* Demo credentials */}
      <div className="w-full max-w-sm mt-6">
        <div className="rounded-2xl border border-[var(--glass-border)] overflow-hidden" style={{ background: "var(--bg-surface-1)" }}>
          {/* Header */}
          <div className="px-5 py-3 border-b border-[var(--glass-border)] flex items-center gap-2">
            <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5 text-[var(--text-muted)]" stroke="currentColor" strokeWidth={1.5}>
              <path d="M8 1a3 3 0 100 6 3 3 0 000-6zM2 13a6 6 0 0112 0" strokeLinecap="round" />
            </svg>
            <span className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider">Demo Credentials</span>
            <span className="ml-auto text-[10px] text-[var(--text-disabled)]">Click to auto-fill</span>
          </div>

          {/* Credential rows */}
          <div className="divide-y divide-[var(--glass-border)]">
            {DEMO_CREDENTIALS.map((cred) => (
              <button
                key={cred.email}
                type="button"
                onClick={() => fillCredentials(cred)}
                className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-[var(--bg-surface-2)] transition-colors group"
              >
                {/* Avatar */}
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                  style={{ background: cred.color }}
                >
                  {avatarInitials(cred.name)}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-medium text-[var(--text-primary)]">{cred.name}</span>
                    <span
                      className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ color: cred.color, background: cred.color + "18" }}
                    >
                      {cred.role}
                    </span>
                  </div>
                  <span className="text-[11px] text-[var(--text-muted)] font-mono">{cred.email}</span>
                </div>

                {/* Password chip */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] text-[var(--text-disabled)] group-hover:text-[var(--text-muted)] transition-colors">
                    pw:
                  </span>
                  <code className="text-[11px] font-mono bg-[var(--bg-surface-2)] group-hover:bg-[var(--bg-surface-3,var(--bg-base))] border border-[var(--border-default)] rounded px-1.5 py-0.5 text-[var(--text-secondary)] transition-colors">
                    {cred.password}
                  </code>
                </div>
              </button>
            ))}
          </div>
        </div>

        <p className="text-center text-[10px] text-[var(--text-disabled)] mt-4">
          POC environment &middot; Tkxel KAM Intelligence
        </p>
      </div>
    </div>
  );
}
