"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { accountCacheKey, readCachedApiAccounts, upsertCachedApiAccount, writeCachedApiAccounts, type CachedApiAccount } from "@/lib/v2/accountCache";
import { useRole } from "@/context/RoleContext";

interface AccountCacheContextValue {
  accounts: CachedApiAccount[];
  loading: boolean;
  error: string;
  refreshAccounts: () => Promise<void>;
  replaceAccounts: (accounts: CachedApiAccount[]) => void;
  upsertAccount: (account: CachedApiAccount) => void;
}

const AccountCacheContext = createContext<AccountCacheContextValue | null>(null);

export function AccountCacheProvider({ children }: { children: React.ReactNode }) {
  const { role, userId, hydrated } = useRole();
  const cacheKey = accountCacheKey(role, userId);
  const [accounts, setAccounts] = useState<CachedApiAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const replaceAccounts = useCallback((nextAccounts: CachedApiAccount[]) => {
    setAccounts(nextAccounts);
    writeCachedApiAccounts(cacheKey, nextAccounts);
  }, [cacheKey]);

  const upsertAccount = useCallback((account: CachedApiAccount) => {
    setAccounts((current) => {
      const accountId = String(account.id ?? "");
      const nextAccounts = accountId
        ? [account, ...current.filter((item) => String(item.id ?? "") !== accountId)]
        : [account, ...current];
      writeCachedApiAccounts(cacheKey, nextAccounts);
      return nextAccounts;
    });
    upsertCachedApiAccount(cacheKey, account);
  }, [cacheKey]);

  const refreshAccounts = useCallback(async () => {
    if (!hydrated || !userId) return;
    setError("");
    const cached = readCachedApiAccounts(cacheKey);
    if (cached) {
      setAccounts(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      const headers: Record<string, string> = { "x-role": role };
      if (userId) headers["x-user-id"] = userId;
      const response = await fetch("/api/accounts", { headers });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Accounts failed to load");
      const nextAccounts = Array.isArray(payload.data) ? payload.data as CachedApiAccount[] : [];
      writeCachedApiAccounts(cacheKey, nextAccounts);
      setAccounts(nextAccounts);
    } catch (fetchError) {
      if (!cached) setAccounts([]);
      setError(fetchError instanceof Error ? fetchError.message : "Accounts failed to load");
    } finally {
      setLoading(false);
    }
  }, [cacheKey, hydrated, role, userId]);

  useEffect(() => {
    if (!hydrated) return;
    const cached = readCachedApiAccounts(cacheKey);
    if (cached) {
      setAccounts(cached);
      setLoading(false);
    } else {
      setAccounts([]);
      setLoading(Boolean(userId));
    }
    void refreshAccounts();
  }, [cacheKey, hydrated, refreshAccounts, userId]);

  const value = useMemo<AccountCacheContextValue>(() => ({
    accounts,
    loading,
    error,
    refreshAccounts,
    replaceAccounts,
    upsertAccount,
  }), [accounts, error, loading, refreshAccounts, replaceAccounts, upsertAccount]);

  return <AccountCacheContext.Provider value={value}>{children}</AccountCacheContext.Provider>;
}

export function useAccountCache() {
  const value = useContext(AccountCacheContext);
  if (!value) throw new Error("useAccountCache must be used within AccountCacheProvider");
  return value;
}
