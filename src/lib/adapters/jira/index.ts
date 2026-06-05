import type { AdapterResult } from "../index";
import type { JiraData } from "./contract";
import { getMockJiraData } from "./mock";
import { resolveMode } from "../index";

export type { JiraData } from "./contract";

export interface JiraAdapter {
  fetch(accountId: string): Promise<AdapterResult<JiraData>>;
}

function createMockAdapter(): JiraAdapter {
  return {
    async fetch(accountId) {
      return {
        data: getMockJiraData(accountId),
        meta: { adapter: "jira", mode: "mock", fetchedAt: new Date().toISOString() },
      };
    },
  };
}

function createLiveAdapter(): JiraAdapter {
  // TODO: implement live Jira Cloud REST API calls
  // Requires: JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN
  console.warn("[jira] Live adapter not yet implemented — falling back to mock");
  return createMockAdapter();
}

export function getJiraAdapter(): JiraAdapter {
  const mode = resolveMode("JIRA");
  return mode === "live" ? createLiveAdapter() : createMockAdapter();
}
