/** Normalised shape returned by the Finance adapter */
export interface FinanceInvoice {
  id: string;
  amount: number;
  currency: string;
  status: "paid" | "pending" | "overdue";
  issuedDate: string;
  dueDate: string;
  paidDate: string | null;
  daysOverdue: number;
}

export interface FinanceRevenueMonth {
  month: string;             // "2025-01"
  recognised: number;
  contracted: number;
  utilizationPct: number;
}

export interface FinanceData {
  accountId: string;
  arr: number;
  mrr: number;
  currency: string;
  paymentTermsDays: number;
  outstandingBalance: number;
  overdueAmount: number;
  revenueUtilizationPct: number;
  revenueHistory: FinanceRevenueMonth[];   // last 6 months
  invoices: FinanceInvoice[];
  lastSyncedAt: string;
}
