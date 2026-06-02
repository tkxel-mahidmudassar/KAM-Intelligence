import type { AdapterResult } from "../index";
import type { SalesforceData } from "./contract";
import { getMockSalesforceData } from "./mock";
import { resolveMode } from "../index";

export type { SalesforceData } from "./contract";

export interface SalesforceAdapter {
  fetch(accountId: string): Promise<AdapterResult<SalesforceData>>;
}

function createMockAdapter(): SalesforceAdapter {
  return {
    async fetch(accountId) {
      return {
        data: getMockSalesforceData(accountId),
        meta: { adapter: "salesforce", mode: "mock", fetchedAt: new Date().toISOString() },
      };
    },
  };
}

function createLiveAdapter(): SalesforceAdapter {
  // TODO: implement live Salesforce REST API calls
  // Requires: SALESFORCE_INSTANCE_URL, SALESFORCE_CLIENT_ID, SALESFORCE_CLIENT_SECRET
  console.warn("[salesforce] Live adapter not yet implemented — falling back to mock");
  return createMockAdapter();
}

export function getSalesforceAdapter(): SalesforceAdapter {
  const mode = resolveMode("SALESFORCE");
  return mode === "live" ? createLiveAdapter() : createMockAdapter();
}
