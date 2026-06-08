const LS_API_ACCOUNTS_CACHE = "kam_v2_api_accounts_cache_v3";

export type CachedApiAccount = Record<string, unknown>;

type AccountCacheByRole = Record<string, {
  savedAt: string;
  accounts: CachedApiAccount[];
}>;

function readCache(): AccountCacheByRole {
  if (typeof window === "undefined") return {};
  try {
    const stored = window.sessionStorage.getItem(LS_API_ACCOUNTS_CACHE);
    if (!stored) return {};
    const parsed = JSON.parse(stored) as AccountCacheByRole;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeCache(cache: AccountCacheByRole) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(LS_API_ACCOUNTS_CACHE, JSON.stringify(cache));
  } catch {
    // Local storage may be blocked or full; account loading should still work from the API.
  }
}

export function readCachedApiAccounts(role: string): CachedApiAccount[] | null {
  const entry = readCache()[role];
  return Array.isArray(entry?.accounts) ? entry.accounts : null;
}

export function writeCachedApiAccounts(role: string, accounts: CachedApiAccount[]) {
  writeCache({
    ...readCache(),
    [role]: {
      savedAt: new Date().toISOString(),
      accounts,
    },
  });
}

export function upsertCachedApiAccount(role: string, account: CachedApiAccount) {
  const current = readCachedApiAccounts(role) ?? [];
  const accountId = String(account.id ?? "");
  const nextAccounts = accountId
    ? [account, ...current.filter((item) => String(item.id ?? "") !== accountId)]
    : [account, ...current];
  writeCachedApiAccounts(role, nextAccounts);
}

export function accountCacheKey(role: string, userId?: string | null) {
  return userId ? `${role}:${userId}` : role;
}
