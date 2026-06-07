"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRole } from "@/context/RoleContext";
import type { Role } from "@/types";

const demoAccounts: Array<{ label: string; email: string; password: string; role: Role }> = [
  { label: "Associate", email: "aisha.khan@tkxel.com", password: "aisha", role: "ASSOCIATE" },
  { label: "KAM", email: "sarah.chen@tkxel.com", password: "sarah", role: "KAM" },
  { label: "C-Level", email: "daniel.west@tkxel.com", password: "daniel", role: "EXECUTIVE" },
];

type LoginUser = { id: string; name: string; email: string; role: Role };

export default function LoginPage() {
  const router = useRouter();
  const { setUser } = useRole();
  const [email, setEmail] = useState("sarah.chen@tkxel.com");
  const [password, setPassword] = useState("");
  const [selectedDemoRole, setSelectedDemoRole] = useState<Role | null>(null);
  const [demoSigningIn, setDemoSigningIn] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  async function authenticate(nextEmail: string, nextPassword: string) {
    setLoginError("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: nextEmail, password: nextPassword }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Sign in failed");
    }
    const user = payload.data?.user as LoginUser | undefined;
    if (!user?.id || !user.email || !user.role) {
      throw new Error("Sign in failed because the user record was incomplete.");
    }
    setUser(user.id, user.name, user.email, user.role);
    router.push("/home");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSigningIn(true);
    try {
      await authenticate(email, password);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Sign in failed");
    } finally {
      setSigningIn(false);
    }
  }

  async function signInDemo(account: (typeof demoAccounts)[number]) {
    setSelectedDemoRole(account.role);
    setEmail(account.email);
    setPassword(account.password);
    setDemoSigningIn(true);
    try {
      await authenticate(account.email, account.password);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Sign in failed");
      setDemoSigningIn(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F3F1EC] px-5 py-8 text-[#1F2722]">
      <section className="grid w-full max-w-5xl overflow-hidden rounded-[36px] border border-[#E1D3C2] bg-[#FFF9EF] shadow-[0_28px_90px_-56px_rgba(31,39,34,0.72)] lg:grid-cols-[1fr_0.85fr]">
        <div className="bg-[radial-gradient(circle_at_20%_20%,rgba(236,194,128,0.28),transparent_32%),radial-gradient(circle_at_90%_10%,rgba(165,197,177,0.35),transparent_34%),#FFF3E0] p-8">
          <img src="/tkxel-logo.svg" alt="Tkxel" className="h-12 w-12 rounded-2xl object-contain shadow-[0_18px_36px_-24px_rgba(7,85,233,0.86)]" />
          <h1 className="mt-8 text-[clamp(54px,8vw,96px)] font-black leading-none tracking-[-0.08em]">DotKAM</h1>
        </div>
        <form onSubmit={submit} className="p-6 sm:p-8">
          <h2 className="text-3xl font-black tracking-[-0.04em] text-[#25352E]">Sign in</h2>
          {demoSigningIn ? (
            <div className="mt-5 rounded-2xl border border-[#CFE2D3] bg-[#F3FAF1] px-4 py-3 text-[13px] font-black text-[#245D3A]">
              Signing in...
            </div>
          ) : null}
          {loginError ? (
            <div className="mt-5 rounded-2xl border border-[#EAB3A9] bg-[#FFF1EE] px-4 py-3 text-[13px] font-black text-[#A63F33]">
              {loginError}
            </div>
          ) : null}
          <label className="mt-6 block">
            <span className="text-[13px] font-black text-[#6F6254]">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 h-12 w-full rounded-2xl border border-[#D9C8B4] bg-[#FFFCF6] px-4 text-[15px] font-bold outline-none focus:border-[#25352E]"
            />
          </label>
          <label className="mt-4 block">
            <span className="text-[13px] font-black text-[#6F6254]">Password</span>
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 h-12 w-full rounded-2xl border border-[#D9C8B4] bg-[#FFFCF6] px-4 text-[15px] font-bold outline-none focus:border-[#25352E]"
            />
          </label>
          <div className="mt-4 text-right">
            <Link href="/forgot-password" className="text-[13px] font-black text-[#25352E] underline-offset-4 hover:underline">
              Forgot password?
            </Link>
          </div>
          <button type="submit" disabled={signingIn || demoSigningIn} className="mt-6 h-12 w-full rounded-full bg-[#25352E] text-[14px] font-black text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#AFA79C]">
            {signingIn ? "Signing in..." : "Sign in"}
          </button>
          <div className="mt-6">
            <p className="text-[13px] font-black text-[#6F6254]">Demo account types</p>
            <div className="mt-3 grid gap-2">
              {demoAccounts.map((account) => (
                <button
                  key={account.role}
                  onClick={() => signInDemo(account)}
                  type="button"
                  disabled={demoSigningIn || signingIn}
                  className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                    selectedDemoRole === account.role
                      ? "border-[#25352E] bg-[#25352E] text-[#FFF9EF]"
                      : "border-[#D9C8B4] bg-[#FFFCF6] hover:border-[#25352E] hover:bg-[#F6EFE4]"
                  }`}
                >
                  <span className={`text-[14px] font-black ${selectedDemoRole === account.role ? "text-[#FFF9EF]" : "text-[#25352E]"}`}>{account.label}</span>
                  <span className={`text-[12px] font-bold ${selectedDemoRole === account.role ? "text-[#F5EBDD]" : "text-[#75685A]"}`}>{account.email}</span>
                </button>
              ))}
            </div>
          </div>
        </form>
      </section>
    </main>
  );
}
