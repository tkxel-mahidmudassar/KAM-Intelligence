/**
 * Adapter contract + factory.
 *
 * Every adapter implements AdapterContract<T> and can run in two modes:
 *   - "mock"  → returns seeded fixture data (default for POC)
 *   - "live"  → calls the real third-party API
 *
 * Switch globally via ADAPTER_MODE env var, or per-adapter via
 * SALESFORCE_MODE, JIRA_MODE, WORKSPHERE_MODE, FINANCE_MODE.
 */

// ─── Shared types ─────────────────────────────────────────────────────────────

export type AdapterMode = "mock" | "live";

export interface AdapterMeta {
  adapter: string;
  mode: AdapterMode;
  fetchedAt: string; // ISO timestamp
}

export interface AdapterResult<T> {
  data: T;
  meta: AdapterMeta;
}

// ─── Per-adapter contracts ────────────────────────────────────────────────────

export type { SalesforceData }    from "./salesforce/contract";
export type { JiraData }          from "./jira/contract";
export type { WorksphereData }    from "./worksphere/contract";
export type { FinanceData }       from "./finance/contract";

// ─── Adapter factory ──────────────────────────────────────────────────────────

export { getSalesforceAdapter }   from "./salesforce";
export { getJiraAdapter }         from "./jira";
export { getWorksphereAdapter }   from "./worksphere";
export { getFinanceAdapter }      from "./finance";

// ─── Helper: resolve mode for a given adapter ────────────────────────────────

export function resolveMode(
  adapterKey: "SALESFORCE" | "JIRA" | "WORKSPHERE" | "FINANCE"
): AdapterMode {
  const specific = process.env[`${adapterKey}_MODE`] as AdapterMode | undefined;
  const global   = process.env.ADAPTER_MODE as AdapterMode | undefined;
  const mode     = specific ?? global ?? "mock";
  return mode === "live" ? "live" : "mock";
}
