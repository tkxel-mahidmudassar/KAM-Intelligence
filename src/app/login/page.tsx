"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRole } from "@/context/RoleContext";
import type { Role } from "@/types";

function inferRole(email: string): Role {
  const normalized = email.toLowerCase();
  if (normalized.includes("associate")) return "ASSOCIATE";
  if (normalized.includes("exec") || normalized.includes("ceo") || normalized.includes("cxo")) return "EXECUTIVE";
  return "KAM";
}

export default function LoginPage() {
  const router = useRouter();
  const { setUser } = useRole();
  const [email, setEmail] = useState("sarah.chen@tkxel.com");
  const [password, setPassword] = useState("");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const role = inferRole(email);
    const name = email
      .split("@")[0]
      .replace(/[._-]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
    setUser(`demo-${role.toLowerCase()}`, name || "Sarah Chen", email, role);
    router.push("/home");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F3F1EC] px-5 py-8 text-[#1F2722]">
      <section className="grid w-full max-w-5xl overflow-hidden rounded-[36px] border border-[#E1D3C2] bg-[#FFF9EF] shadow-[0_28px_90px_-56px_rgba(31,39,34,0.72)] lg:grid-cols-[1fr_0.85fr]">
        <div className="bg-[radial-gradient(circle_at_20%_20%,rgba(236,194,128,0.28),transparent_32%),radial-gradient(circle_at_90%_10%,rgba(165,197,177,0.35),transparent_34%),#FFF3E0] p-8">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#25352E] text-[15px] font-black text-[#FFF9EF]">K</div>
          <h1 className="mt-8 text-[clamp(44px,7vw,82px)] font-black leading-none tracking-[-0.07em]">KAM Intelligence</h1>
        </div>
        <form onSubmit={submit} className="p-6 sm:p-8">
          <h2 className="text-3xl font-black tracking-[-0.04em] text-[#25352E]">Sign in</h2>
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
          <button type="submit" className="mt-6 h-12 w-full rounded-full bg-[#25352E] text-[14px] font-black text-[#FFF9EF]">
            Sign in
          </button>
        </form>
      </section>
    </main>
  );
}
