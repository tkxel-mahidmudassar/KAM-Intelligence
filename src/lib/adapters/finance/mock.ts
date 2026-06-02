import type { FinanceData, FinanceRevenueMonth } from "./contract";

const now = new Date().toISOString();

function monthLabel(offset: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function daysAgo(n: number) {
  return new Date(Date.now() - n * 864e5).toISOString().split("T")[0];
}

function revenueHistory(arr: number, utilizationPattern: number[]): FinanceRevenueMonth[] {
  const mrr = arr / 12;
  return utilizationPattern.map((pct, i) => ({
    month: monthLabel(utilizationPattern.length - 1 - i),
    recognised: Math.round(mrr * (pct / 100)),
    contracted: Math.round(mrr),
    utilizationPct: pct,
  }));
}

const MOCK_DATA: Record<string, FinanceData> = {
  "acc-helix-001": {
    accountId: "acc-helix-001",
    arr: 1_750_000,
    mrr: 145_833,
    currency: "USD",
    paymentTermsDays: 30,
    outstandingBalance: 291_666,
    overdueAmount: 145_833,
    revenueUtilizationPct: 54,
    revenueHistory: revenueHistory(1_750_000, [82, 78, 74, 70, 62, 54]),
    invoices: [
      { id: "inv-h1", amount: 145_833, currency: "USD", status: "overdue", issuedDate: daysAgo(60), dueDate: daysAgo(30), paidDate: null, daysOverdue: 30 },
      { id: "inv-h2", amount: 145_833, currency: "USD", status: "pending", issuedDate: daysAgo(30), dueDate: daysAgo(0), paidDate: null, daysOverdue: 0 },
    ],
    lastSyncedAt: now,
  },

  "acc-clearbridge-002": {
    accountId: "acc-clearbridge-002",
    arr: 870_000,
    mrr: 72_500,
    currency: "CAD",
    paymentTermsDays: 30,
    outstandingBalance: 72_500,
    overdueAmount: 0,
    revenueUtilizationPct: 72,
    revenueHistory: revenueHistory(870_000, [84, 82, 80, 78, 75, 72]),
    invoices: [
      { id: "inv-c1", amount: 72_500, currency: "CAD", status: "pending", issuedDate: daysAgo(15), dueDate: daysAgo(-15), paidDate: null, daysOverdue: 0 },
    ],
    lastSyncedAt: now,
  },

  "acc-ironclad-003": {
    accountId: "acc-ironclad-003",
    arr: 720_000,
    mrr: 60_000,
    currency: "EUR",
    paymentTermsDays: 30,
    outstandingBalance: 60_000,
    overdueAmount: 0,
    revenueUtilizationPct: 96,
    revenueHistory: revenueHistory(720_000, [88, 90, 92, 93, 95, 96]),
    invoices: [
      { id: "inv-i1", amount: 60_000, currency: "EUR", status: "paid", issuedDate: daysAgo(45), dueDate: daysAgo(15), paidDate: daysAgo(12), daysOverdue: 0 },
      { id: "inv-i2", amount: 60_000, currency: "EUR", status: "pending", issuedDate: daysAgo(15), dueDate: daysAgo(-15), paidDate: null, daysOverdue: 0 },
    ],
    lastSyncedAt: now,
  },

  "acc-beacon-004": {
    accountId: "acc-beacon-004",
    arr: 510_000,
    mrr: 42_500,
    currency: "USD",
    paymentTermsDays: 30,
    outstandingBalance: 42_500,
    overdueAmount: 0,
    revenueUtilizationPct: 99,
    revenueHistory: revenueHistory(510_000, [88, 91, 93, 95, 97, 99]),
    invoices: [
      { id: "inv-b1", amount: 42_500, currency: "USD", status: "paid", issuedDate: daysAgo(45), dueDate: daysAgo(15), paidDate: daysAgo(14), daysOverdue: 0 },
      { id: "inv-b2", amount: 42_500, currency: "USD", status: "pending", issuedDate: daysAgo(15), dueDate: daysAgo(-15), paidDate: null, daysOverdue: 0 },
    ],
    lastSyncedAt: now,
  },

  "acc-crestline-005": {
    accountId: "acc-crestline-005",
    arr: 1_200_000,
    mrr: 100_000,
    currency: "GBP",
    paymentTermsDays: 30,
    outstandingBalance: 200_000,
    overdueAmount: 100_000,
    revenueUtilizationPct: 67,
    revenueHistory: revenueHistory(1_200_000, [88, 84, 80, 76, 71, 67]),
    invoices: [
      { id: "inv-cr1", amount: 100_000, currency: "GBP", status: "overdue", issuedDate: daysAgo(60), dueDate: daysAgo(30), paidDate: null, daysOverdue: 30 },
      { id: "inv-cr2", amount: 100_000, currency: "GBP", status: "pending", issuedDate: daysAgo(30), dueDate: daysAgo(0), paidDate: null, daysOverdue: 0 },
    ],
    lastSyncedAt: now,
  },
};

export function getMockFinanceData(accountId: string): FinanceData {
  return (
    MOCK_DATA[accountId] ?? {
      accountId,
      arr: 0,
      mrr: 0,
      currency: "USD",
      paymentTermsDays: 30,
      outstandingBalance: 0,
      overdueAmount: 0,
      revenueUtilizationPct: 0,
      revenueHistory: [],
      invoices: [],
      lastSyncedAt: now,
    }
  );
}
