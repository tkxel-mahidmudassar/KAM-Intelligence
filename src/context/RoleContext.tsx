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
      if (storedRole && ["ASSOCIATE", "KAM", "MANAGER", "EXECUTIVE", "ADMIN"].includes(storedRole)) {
        setRoleState(storedRole);
      }
      if (storedUid)   setUserId(storedUid);
      if (storedName)  setUserName(storedName);
      if (storedEmail) setUserEmail(storedEmail);
    } catch { /* localStorage unavailable */ }
    setHydrated(true);
  }, []);

  const setRole = (r: Role) => {
    setRoleState(r);
    try { localStorage.setItem(LS_ROLE, r); } catch { /* noop */ }
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
