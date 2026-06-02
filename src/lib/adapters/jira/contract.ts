/** Normalised shape returned by the Jira adapter */
export interface JiraTicket {
  id: string;
  key: string;             // e.g. "KAM-142"
  summary: string;
  status: "Open" | "In Progress" | "Resolved" | "Closed";
  priority: "Blocker" | "Critical" | "Major" | "Minor" | "Trivial";
  type: "Bug" | "Story" | "Task" | "Incident";
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  assignee: string | null;
  labels: string[];
}

export interface JiraSprint {
  id: string;
  name: string;
  state: "active" | "closed" | "future";
  startDate: string;
  endDate: string;
  completedPoints: number;
  totalPoints: number;
  velocity: number;        // % of committed points completed
}

export interface JiraData {
  accountId: string;
  projectKey: string;
  openTickets: number;
  criticalTickets: number;
  avgResolutionDays: number;
  tickets: JiraTicket[];
  activeSprint: JiraSprint | null;
  lastSyncedAt: string;
}
