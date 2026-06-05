/** Normalised shape returned by the Worksphere adapter */
export interface WorksphereMeeting {
  id: string;
  title: string;
  date: string;
  attendees: string[];
  durationMinutes: number;
  hasRecording: boolean;
  sentiment: "positive" | "neutral" | "negative" | null;
}

export interface WorksphereEngagement {
  loginFrequency: number;        // logins per week (avg)
  featureAdoptionPct: number;    // % of licensed features actively used
  lastLoginDate: string;
  powerUsers: number;            // users who log in 5+ days/week
  inactiveUsers: number;         // users with no login in 30+ days
}

export interface WorksphereData {
  accountId: string;
  activeUsers: number;
  totalLicenses: number;
  utilizationPct: number;         // activeUsers / totalLicenses * 100
  engagement: WorksphereEngagement;
  recentMeetings: WorksphereMeeting[];
  npsScore: number | null;
  npsSampleSize: number;
  lastSyncedAt: string;
}
