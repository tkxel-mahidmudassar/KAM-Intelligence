"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F3F1EC] px-5 py-8 text-[#1F2722]">
      <section className="w-full max-w-lg rounded-[34px] border border-[#E1D3C2] bg-[#FFF9EF] p-6 shadow-[0_28px_90px_-58px_rgba(31,39,34,0.72)]">
        <h1 className="text-4xl font-black tracking-[-0.06em] text-[#25352E]">Reset password</h1>
        {submitted ? (
          <div className="mt-6 rounded-3xl border border-[#CFE2D3] bg-[#F3FAF1] p-4">
            <p className="text-[15px] font-bold leading-relaxed text-[#245D3A]">
              If that email belongs to an active user, a reset link will be sent.
            </p>
          </div>
        ) : (
          <form
            className="mt-6"
            onSubmit={(event) => {
              event.preventDefault();
              setSubmitted(true);
            }}
          >
            <label className="block">
              <span className="text-[13px] font-black text-[#6F6254]">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-2 h-12 w-full rounded-2xl border border-[#D9C8B4] bg-[#FFFCF6] px-4 text-[15px] font-bold outline-none focus:border-[#25352E]"
              />
            </label>
            <button type="submit" className="mt-5 h-12 w-full rounded-full bg-[#25352E] text-[14px] font-black text-[#FFF9EF]">
              Send reset link
            </button>
          </form>
        )}
        <Link href="/login" className="mt-5 inline-flex text-[13px] font-black text-[#25352E] underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </section>
    </main>
  );
}
