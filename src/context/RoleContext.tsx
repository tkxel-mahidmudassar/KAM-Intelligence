"use client";

import { createContext, useContext, useState, useEffect } from "react";
import type { Role } from "@/types";

interface RoleContextValue {
  role: Role;
  setRole: (role: Role) => void;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  setUser: (id: string, name: string, email: string, role: Role) => void;
  clearUser: () => void;
  hydrated: boolean;
}

const RoleContext = createContext<RoleContextValue>({
  role: "KAM",
  setRole: () => {},
  userId: null,
  userName: null,
  userEmail: null,
  setUser: () => {},
  clearUser: () => {},
  hydrated: false,
});

const LS_ROLE  = "kam_role";
const LS_UID   = "kam_user_id";
const LS_UNAME = "kam_user_name";
const LS_EMAIL = "kam_user_email";

function readCookie(name: string) {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : null;
}

function writeCookie(name: string, value: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
}

function clearCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
}

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role,      setRoleState] = useState<Role>("KAM");
  const [userId,    setUserId]    = useState<string | null>(null);
  const [userName,  setUserName]  = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [hydrated,  setHydrated]  = useState(false);

  // Hydrate from localStorage on mount (client only)
  useEffect(() => {
    try {
      const storedRole  = localStorage.getItem(LS_ROLE)  as Role | null;
      const storedUid   = localStorage.getItem(LS_UID);
      const storedName  = localStorage.getItem(LS_UNAME);
      const storedEmail = localStorage.getItem(LS_EMAIL);
      const cookieRole  = readCookie(LS_ROLE) as Role | null;
      const cookieUid   = readCookie(LS_UID);
      const cookieName  = readCookie(LS_UNAME);
      const cookieEmail = readCookie(LS_EMAIL);
      const nextRole = cookieRole || storedRole;
      if (nextRole && ["ASSOCIATE", "KAM", "MANAGER", "EXECUTIVE", "ADMIN"].includes(nextRole)) {
        setRoleState(nextRole);
      }
      if (cookieUid || storedUid)     setUserId(cookieUid || storedUid);
      if (cookieName || storedName)   setUserName(cookieName || storedName);
      if (cookieEmail || storedEmail) setUserEmail(cookieEmail || storedEmail);
    } catch { /* localStorage unavailable */ }
    setHydrated(true);
  }, []);

  const setRole = (r: Role) => {
    setRoleState(r);
    try {
      localStorage.setItem(LS_ROLE, r);
      writeCookie(LS_ROLE, r);
    } catch { /* noop */ }
  };

  const setUser = (id: string, name: string, email: string, r: Role) => {
    setUserId(id);
    setUserName(name);
    setUserEmail(email);
    setRoleState(r);
    try {
      localStorage.setItem(LS_UID,   id);
      localStorage.setItem(LS_UNAME, name);
      localStorage.setItem(LS_EMAIL, email);
      localStorage.setItem(LS_ROLE,  r);
      writeCookie(LS_UID, id);
      writeCookie(LS_UNAME, name);
      writeCookie(LS_EMAIL, email);
      writeCookie(LS_ROLE, r);
    } catch { /* noop */ }
  };

  const clearUser = () => {
    setUserId(null);
    setUserName(null);
    setUserEmail(null);
    setRoleState("KAM");
    try {
      localStorage.removeItem(LS_UID);
      localStorage.removeItem(LS_UNAME);
      localStorage.removeItem(LS_EMAIL);
      localStorage.removeItem(LS_ROLE);
      clearCookie(LS_UID);
      clearCookie(LS_UNAME);
      clearCookie(LS_EMAIL);
      clearCookie(LS_ROLE);
    } catch { /* noop */ }
  };

  return (
    <RoleContext.Provider value={{ role, setRole, userId, userName, userEmail, setUser, clearUser, hydrated }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  return useContext(RoleContext);
}
