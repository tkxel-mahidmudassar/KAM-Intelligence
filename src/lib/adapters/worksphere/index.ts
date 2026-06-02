import type { AdapterResult } from "../index";
import type { WorksphereData } from "./contract";
import { getMockWorksphereData } from "./mock";
import { resolveMode } from "../index";

export type { WorksphereData } from "./contract";

export interface WorksphereAdapter {
  fetch(accountId: string): Promise<AdapterResult<WorksphereData>>;
}

function createMockAdapter(): WorksphereAdapter {
  return {
    async fetch(accountId) {
      return {
        data: getMockWorksphereData(accountId),
        meta: { adapter: "worksphere", mode: "mock", fetchedAt: new Date().toISOString() },
      };
    },
  };
}

function createLiveAdapter(): WorksphereAdapter {
  // TODO: implement live Worksphere API calls
  // Requires: WORKSPHERE_API_URL, WORKSPHERE_API_KEY
  console.warn("[worksphere] Live adapter not yet implemented — falling back to mock");
  return createMockAdapter();
}

export function getWorksphereAdapter(): WorksphereAdapter {
  const mode = resolveMode("WORKSPHERE");
  return mode === "live" ? createLiveAdapter() : createMockAdapter();
}
