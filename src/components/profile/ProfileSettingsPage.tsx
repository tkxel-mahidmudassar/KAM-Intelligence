"use client";

import { useEffect, useState } from "react";
import { Check, LockKeyhole, Mail, UserRound } from "lucide-react";
import { useRole } from "@/context/RoleContext";

export function ProfileSettingsPage() {
  const { role, userId, userName, userEmail, setUser } = useRole();
  const [name, setName] = useState(userName || "Sarah Chen");
  const [email, setEmail] = useState(userEmail || "sarah.chen@tkxel.com");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    setName(userName || "Sarah Chen");
    setEmail(userEmail || "sarah.chen@tkxel.com");
  }, [userEmail, userName]);

  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const canSaveProfile = name.trim().length > 1 && email.includes("@");
  const canChangePassword = currentPassword.trim().length > 0 && newPassword.length >= 8 && newPassword === confirmPassword;

  function saveProfile() {
    if (!canSaveProfile || !userId) return;
    setUser(userId, name.trim(), email.trim(), role);
    setStatus("Profile details saved.");
  }

  function changePassword() {
    if (!canChangePassword) return;
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setStatus("Password change saved for this demo session.");
  }

  return (
    <main className="min-h-screen px-5 py-5">
      <section className="mx-auto max-w-[1120px] space-y-5">
        <div className="rounded-[34px] border border-[#E4D5C4] bg-[#FFF8ED] p-5 shadow-[0_24px_70px_-56px_rgba(32,38,32,0.6)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-[clamp(42px,6vw,78px)] font-black leading-none tracking-[-0.06em] text-[#1F2722]">My profile</h1>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-[#D9C8B4] bg-[#FFFCF6] px-4 py-3">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#25352E] text-[16px] font-black text-[#FFF9EF]">
                {initials}
              </span>
              <div>
                <p className="text-[15px] font-black text-[#25352E]">{name}</p>
                <p className="text-[12px] font-bold text-[#75685A]">{role}</p>
              </div>
            </div>
          </div>
          {status ? (
            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-[#CFE2D3] bg-[#F3FAF1] px-4 py-3 text-[13px] font-black text-[#245D3A]">
              <Check className="h-4 w-4" />
              {status}
            </div>
          ) : null}
        </div>

        <section className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
          <div className="rounded-3xl border border-[#E1D3C2] bg-[#FFFCF6] p-4">
            <div className="flex items-center gap-2">
              <UserRound className="h-5 w-5 text-[#25352E]" />
              <h2 className="text-xl font-black text-[#25352E]">Account details</h2>
            </div>
            <div className="mt-4 grid gap-3">
              <label className="rounded-2xl border border-[#E1D3C2] bg-[#FFF8ED] p-3">
                <span className="text-[12px] font-black text-[#75685A]">Name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-2 h-11 w-full rounded-xl border border-[#D9C8B4] bg-[#FFFCF6] px-3 text-[14px] font-black text-[#25352E] outline-none focus:border-[#25352E]/45"
                />
              </label>
              <label className="rounded-2xl border border-[#E1D3C2] bg-[#FFF8ED] p-3">
                <span className="text-[12px] font-black text-[#75685A]">Email</span>
                <div className="mt-2 flex items-center gap-2 rounded-xl border border-[#D9C8B4] bg-[#FFFCF6] px-3">
                  <Mail className="h-4 w-4 text-[#75685A]" />
                  <input
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="h-11 flex-1 bg-transparent text-[14px] font-black text-[#25352E] outline-none"
                  />
                </div>
              </label>
              <div className="rounded-2xl border border-[#E1D3C2] bg-[#FFF8ED] p-3">
                <span className="text-[12px] font-black text-[#75685A]">Role</span>
                <p className="mt-2 rounded-xl border border-[#D9C8B4] bg-[#FFFCF6] px-3 py-3 text-[14px] font-black text-[#25352E]">{role}</p>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                disabled={!canSaveProfile}
                onClick={saveProfile}
                className="rounded-full bg-[#25352E] px-5 py-3 text-[13px] font-black text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#AFA79C]"
              >
                Save profile
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-[#E1D3C2] bg-[#FFFCF6] p-4">
            <div className="flex items-center gap-2">
              <LockKeyhole className="h-5 w-5 text-[#25352E]" />
              <h2 className="text-xl font-black text-[#25352E]">Password</h2>
            </div>
            <div className="mt-4 grid gap-3">
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                placeholder="Current password"
                className="h-12 rounded-2xl border border-[#E1D3C2] bg-[#FFF8ED] px-4 text-[14px] font-bold text-[#25352E] outline-none placeholder:text-[#9C8D7D] focus:border-[#25352E]/45"
              />
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="New password"
                className="h-12 rounded-2xl border border-[#E1D3C2] bg-[#FFF8ED] px-4 text-[14px] font-bold text-[#25352E] outline-none placeholder:text-[#9C8D7D] focus:border-[#25352E]/45"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Confirm new password"
                className="h-12 rounded-2xl border border-[#E1D3C2] bg-[#FFF8ED] px-4 text-[14px] font-bold text-[#25352E] outline-none placeholder:text-[#9C8D7D] focus:border-[#25352E]/45"
              />
              <div className="rounded-2xl border border-[#E1D3C2] bg-[#FFF8ED] px-3 py-2 text-[12px] font-bold text-[#75685A]">
                Password must be at least 8 characters and both new password fields must match.
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                disabled={!canChangePassword}
                onClick={changePassword}
                className="rounded-full bg-[#25352E] px-5 py-3 text-[13px] font-black text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#AFA79C]"
              >
                Change password
              </button>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
