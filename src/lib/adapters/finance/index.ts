import type { AdapterResult } from "../index";
import type { FinanceData } from "./contract";
import { getMockFinanceData } from "./mock";
import { resolveMode } from "../index";

export type { FinanceData } from "./contract";

export interface FinanceAdapter {
  fetch(accountId: string): Promise<AdapterResult<FinanceData>>;
}

function createMockAdapter(): FinanceAdapter {
  return {
    async fetch(accountId) {
      return {
        data: getMockFinanceData(accountId),
        meta: { adapter: "finance", mode: "mock", fetchedAt: new Date().toISOString() },
      };
    },
  };
}

function createLiveAdapter(): FinanceAdapter {
  // TODO: implement live Finance system API calls
  // Requires: FINANCE_API_URL, FINANCE_API_KEY
  console.warn("[finance] Live adapter not yet implemented — falling back to mock");
  return createMockAdapter();
}

export function getFinanceAdapter(): FinanceAdapter {
  const mode = resolveMode("FINANCE");
  return mode === "live" ? createLiveAdapter() : createMockAdapter();
}
