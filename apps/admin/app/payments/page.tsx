"use client";

import { useState, useEffect, useCallback } from "react";
import {
  DollarSign,
  ArrowDownToLine,
  ArrowUpFromLine,
  Shield,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Search,
  Filter,
  ChevronDown,
  Loader2,
  Eye,
  CreditCard,
  Banknote,
  TrendingUp,
  Building2,
  Users,
  FileText,
} from "lucide-react";

// ---- Types ----

type EscrowStatus =
  | "collecting"
  | "held"
  | "released"
  | "partially_released"
  | "disputed"
  | "refunded";

type PayoutStatus =
  | "pending"
  | "approved"
  | "processing"
  | "completed"
  | "failed"
  | "on_hold";

interface PaymentSummary {
  totalCollected: number;
  totalInEscrow: number;
  totalReleasedToContractors: number;
  totalPlatformFees: number;
  totalRefunded: number;
  pendingPayouts: number;
  currency: string;
}

interface EscrowAccount {
  offerId: string;
  offerTitle?: string;
  contractorId?: string;
  contractorName?: string;
  totalCollected: number;
  totalExpected: number;
  platformFee: number;
  netPayoutAmount: number;
  currency: string;
  escrowStatus: EscrowStatus;
  participantsPaid: number;
  participantsTotal: number;
  createdAt: string;
}

interface ContractorPayout {
  id: string;
  contractorId: string;
  contractorName: string;
  offerId: string;
  offerTitle?: string;
  grossAmount: number;
  platformFee: number;
  netAmount: number;
  currency: string;
  status: PayoutStatus;
  approvedBy?: string;
  approvedAt?: string;
  paidAt?: string;
  createdAt: string;
}

// ---- Helpers ----

function formatCurrency(amount: number, currency = "ILS"): string {
  return new Intl.NumberFormat("en-IL", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const ESCROW_STATUS_CONFIG: Record<
  EscrowStatus,
  { label: string; color: string; icon: React.ElementType }
> = {
  collecting: { label: "Collecting", color: "bg-amber-100 text-amber-800", icon: ArrowDownToLine },
  held: { label: "Held in Escrow", color: "bg-blue-100 text-blue-800", icon: Shield },
  released: { label: "Released", color: "bg-green-100 text-green-800", icon: CheckCircle2 },
  partially_released: { label: "Partial Release", color: "bg-cyan-100 text-cyan-800", icon: ArrowUpFromLine },
  disputed: { label: "Disputed", color: "bg-red-100 text-red-800", icon: AlertTriangle },
  refunded: { label: "Refunded", color: "bg-purple-100 text-purple-800", icon: RefreshCw },
};

const PAYOUT_STATUS_CONFIG: Record<
  PayoutStatus,
  { label: string; color: string; icon: React.ElementType }
> = {
  pending: { label: "Pending", color: "bg-amber-100 text-amber-800", icon: Clock },
  approved: { label: "Approved", color: "bg-blue-100 text-blue-800", icon: CheckCircle2 },
  processing: { label: "Processing", color: "bg-cyan-100 text-cyan-800", icon: RefreshCw },
  completed: { label: "Completed", color: "bg-green-100 text-green-800", icon: CheckCircle2 },
  failed: { label: "Failed", color: "bg-red-100 text-red-800", icon: XCircle },
  on_hold: { label: "On Hold", color: "bg-orange-100 text-orange-800", icon: AlertTriangle },
};

// ---- Mock data for development ----

const MOCK_SUMMARY: PaymentSummary = {
  totalCollected: 245000,
  totalInEscrow: 87500,
  totalReleasedToContractors: 142500,
  totalPlatformFees: 15000,
  totalRefunded: 0,
  pendingPayouts: 3,
  currency: "ILS",
};

const MOCK_ESCROWS: EscrowAccount[] = [
  {
    offerId: "offer-001",
    offerTitle: "AC Installation - Building A",
    contractorId: "ctr-001",
    contractorName: "Cool Air Ltd.",
    totalCollected: 35000,
    totalExpected: 45000,
    platformFee: 2250,
    netPayoutAmount: 42750,
    currency: "ILS",
    escrowStatus: "collecting",
    participantsPaid: 7,
    participantsTotal: 9,
    createdAt: "2026-01-15T10:00:00Z",
  },
  {
    offerId: "offer-002",
    offerTitle: "Kitchen Renovation - Building B",
    contractorId: "ctr-002",
    contractorName: "Master Kitchen Ltd.",
    totalCollected: 87500,
    totalExpected: 87500,
    platformFee: 4375,
    netPayoutAmount: 83125,
    currency: "ILS",
    escrowStatus: "held",
    participantsPaid: 12,
    participantsTotal: 12,
    createdAt: "2026-01-20T10:00:00Z",
  },
  {
    offerId: "offer-003",
    offerTitle: "Plumbing Upgrade - Building C",
    contractorId: "ctr-003",
    contractorName: "AquaFix Pro",
    totalCollected: 52500,
    totalExpected: 52500,
    platformFee: 2625,
    netPayoutAmount: 49875,
    currency: "ILS",
    escrowStatus: "released",
    participantsPaid: 15,
    participantsTotal: 15,
    createdAt: "2025-12-10T10:00:00Z",
  },
  {
    offerId: "offer-004",
    offerTitle: "Electrical Panel - Building D",
    contractorId: "ctr-004",
    contractorName: "ElectraPro",
    totalCollected: 70000,
    totalExpected: 70000,
    platformFee: 3500,
    netPayoutAmount: 66500,
    currency: "ILS",
    escrowStatus: "disputed",
    participantsPaid: 10,
    participantsTotal: 10,
    createdAt: "2026-02-01T10:00:00Z",
  },
];

const MOCK_PAYOUTS: ContractorPayout[] = [
  {
    id: "payout-001",
    contractorId: "ctr-002",
    contractorName: "Master Kitchen Ltd.",
    offerId: "offer-002",
    offerTitle: "Kitchen Renovation - Building B",
    grossAmount: 87500,
    platformFee: 4375,
    netAmount: 83125,
    currency: "ILS",
    status: "pending",
    createdAt: "2026-02-10T10:00:00Z",
  },
  {
    id: "payout-002",
    contractorId: "ctr-003",
    contractorName: "AquaFix Pro",
    offerId: "offer-003",
    offerTitle: "Plumbing Upgrade - Building C",
    grossAmount: 52500,
    platformFee: 2625,
    netAmount: 49875,
    currency: "ILS",
    status: "completed",
    approvedBy: "admin@groupio.co.il",
    approvedAt: "2026-01-25T14:00:00Z",
    paidAt: "2026-01-26T09:00:00Z",
    createdAt: "2026-01-24T10:00:00Z",
  },
  {
    id: "payout-003",
    contractorId: "ctr-004",
    contractorName: "ElectraPro",
    offerId: "offer-004",
    offerTitle: "Electrical Panel - Building D",
    grossAmount: 70000,
    platformFee: 3500,
    netAmount: 66500,
    currency: "ILS",
    status: "on_hold",
    createdAt: "2026-02-05T10:00:00Z",
  },
];

// ---- Components ----

function SummaryCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-surface-500">{title}</p>
          <p className="text-2xl font-bold text-surface-900 mt-1">{value}</p>
          {subtitle && (
            <p className="text-xs text-surface-400 mt-1">{subtitle}</p>
          )}
        </div>
        <div
          className={`flex items-center justify-center w-10 h-10 rounded-lg ${color}`}
        >
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

function EscrowFlowDiagram() {
  return (
    <div className="bg-gradient-to-r from-indigo-50 via-blue-50 to-green-50 rounded-xl border border-indigo-100 p-6">
      <h3 className="text-sm font-semibold text-surface-700 mb-4">
        Payment Flow: Residents → Escrow → Contractor
      </h3>
      <div className="flex items-center justify-between gap-2">
        {/* Step 1 */}
        <div className="flex-1 text-center">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 mx-auto mb-2">
            <Users className="w-6 h-6 text-amber-600" />
          </div>
          <p className="text-xs font-medium text-surface-700">Residents Pay</p>
          <p className="text-[10px] text-surface-400">Per-unit split</p>
        </div>
        <ArrowUpFromLine className="w-5 h-5 text-surface-300 rotate-90 flex-shrink-0" />
        {/* Step 2 */}
        <div className="flex-1 text-center">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 mx-auto mb-2">
            <Shield className="w-6 h-6 text-blue-600" />
          </div>
          <p className="text-xs font-medium text-surface-700">
            Groupio Escrow
          </p>
          <p className="text-[10px] text-surface-400">Funds held securely</p>
        </div>
        <ArrowUpFromLine className="w-5 h-5 text-surface-300 rotate-90 flex-shrink-0" />
        {/* Step 3 */}
        <div className="flex-1 text-center">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-indigo-100 mx-auto mb-2">
            <CheckCircle2 className="w-6 h-6 text-indigo-600" />
          </div>
          <p className="text-xs font-medium text-surface-700">
            Work Verified
          </p>
          <p className="text-[10px] text-surface-400">Admin confirms</p>
        </div>
        <ArrowUpFromLine className="w-5 h-5 text-surface-300 rotate-90 flex-shrink-0" />
        {/* Step 4 */}
        <div className="flex-1 text-center">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mx-auto mb-2">
            <Banknote className="w-6 h-6 text-green-600" />
          </div>
          <p className="text-xs font-medium text-surface-700">
            Contractor Paid
          </p>
          <p className="text-[10px] text-surface-400">Minus platform fee</p>
        </div>
      </div>
    </div>
  );
}

function EscrowTable({
  escrows,
  onRelease,
}: {
  escrows: EscrowAccount[];
  onRelease: (offerId: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-200">
            <th className="text-left py-3 px-4 font-medium text-surface-500">
              Offer
            </th>
            <th className="text-left py-3 px-4 font-medium text-surface-500">
              Contractor
            </th>
            <th className="text-center py-3 px-4 font-medium text-surface-500">
              Participants
            </th>
            <th className="text-right py-3 px-4 font-medium text-surface-500">
              Collected / Expected
            </th>
            <th className="text-right py-3 px-4 font-medium text-surface-500">
              Platform Fee
            </th>
            <th className="text-center py-3 px-4 font-medium text-surface-500">
              Status
            </th>
            <th className="text-center py-3 px-4 font-medium text-surface-500">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {escrows.map((escrow) => {
            const config = ESCROW_STATUS_CONFIG[escrow.escrowStatus];
            const StatusIcon = config.icon;
            const progressPct = Math.round(
              (escrow.totalCollected / escrow.totalExpected) * 100
            );

            return (
              <tr
                key={escrow.offerId}
                className="border-b border-surface-100 hover:bg-surface-50 transition-colors"
              >
                <td className="py-3 px-4">
                  <p className="font-medium text-surface-800">
                    {escrow.offerTitle || escrow.offerId.slice(0, 12)}
                  </p>
                  <p className="text-xs text-surface-400">
                    {formatDate(escrow.createdAt)}
                  </p>
                </td>
                <td className="py-3 px-4 text-surface-700">
                  {escrow.contractorName || "—"}
                </td>
                <td className="py-3 px-4 text-center">
                  <span className="font-medium">
                    {escrow.participantsPaid}
                  </span>
                  <span className="text-surface-400">
                    /{escrow.participantsTotal}
                  </span>
                </td>
                <td className="py-3 px-4 text-right">
                  <div>
                    <span className="font-medium">
                      {formatCurrency(escrow.totalCollected)}
                    </span>
                    <span className="text-surface-400">
                      {" / "}
                      {formatCurrency(escrow.totalExpected)}
                    </span>
                  </div>
                  <div className="w-full bg-surface-100 rounded-full h-1.5 mt-1">
                    <div
                      className="bg-primary-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${Math.min(progressPct, 100)}%` }}
                    />
                  </div>
                </td>
                <td className="py-3 px-4 text-right text-surface-600">
                  {formatCurrency(escrow.platformFee)}
                  <span className="text-xs text-surface-400 block">
                    (5%)
                  </span>
                </td>
                <td className="py-3 px-4 text-center">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${config.color}`}
                  >
                    <StatusIcon className="w-3.5 h-3.5" />
                    {config.label}
                  </span>
                </td>
                <td className="py-3 px-4 text-center">
                  {escrow.escrowStatus === "held" && (
                    <button
                      onClick={() => onRelease(escrow.offerId)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <ArrowUpFromLine className="w-3.5 h-3.5" />
                      Release
                    </button>
                  )}
                  {escrow.escrowStatus === "disputed" && (
                    <button className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700 transition-colors">
                      <Eye className="w-3.5 h-3.5" />
                      Review
                    </button>
                  )}
                  {escrow.escrowStatus === "collecting" && (
                    <span className="text-xs text-surface-400">Waiting</span>
                  )}
                  {escrow.escrowStatus === "released" && (
                    <span className="text-xs text-green-600">Done</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PayoutsTable({
  payouts,
  onApprove,
}: {
  payouts: ContractorPayout[];
  onApprove: (payoutId: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-200">
            <th className="text-left py-3 px-4 font-medium text-surface-500">
              Contractor
            </th>
            <th className="text-left py-3 px-4 font-medium text-surface-500">
              Offer
            </th>
            <th className="text-right py-3 px-4 font-medium text-surface-500">
              Gross
            </th>
            <th className="text-right py-3 px-4 font-medium text-surface-500">
              Fee (5%)
            </th>
            <th className="text-right py-3 px-4 font-medium text-surface-500">
              Net Payout
            </th>
            <th className="text-center py-3 px-4 font-medium text-surface-500">
              Status
            </th>
            <th className="text-center py-3 px-4 font-medium text-surface-500">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {payouts.map((payout) => {
            const config = PAYOUT_STATUS_CONFIG[payout.status];
            const StatusIcon = config.icon;

            return (
              <tr
                key={payout.id}
                className="border-b border-surface-100 hover:bg-surface-50 transition-colors"
              >
                <td className="py-3 px-4">
                  <p className="font-medium text-surface-800">
                    {payout.contractorName}
                  </p>
                  <p className="text-xs text-surface-400">
                    {formatDate(payout.createdAt)}
                  </p>
                </td>
                <td className="py-3 px-4 text-surface-700">
                  {payout.offerTitle || payout.offerId.slice(0, 12)}
                </td>
                <td className="py-3 px-4 text-right font-medium">
                  {formatCurrency(payout.grossAmount)}
                </td>
                <td className="py-3 px-4 text-right text-danger-600">
                  -{formatCurrency(payout.platformFee)}
                </td>
                <td className="py-3 px-4 text-right font-semibold text-green-700">
                  {formatCurrency(payout.netAmount)}
                </td>
                <td className="py-3 px-4 text-center">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${config.color}`}
                  >
                    <StatusIcon className="w-3.5 h-3.5" />
                    {config.label}
                  </span>
                </td>
                <td className="py-3 px-4 text-center">
                  {payout.status === "pending" && (
                    <button
                      onClick={() => onApprove(payout.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary-600 text-white text-xs font-medium rounded-lg hover:bg-primary-700 transition-colors"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Approve
                    </button>
                  )}
                  {payout.status === "on_hold" && (
                    <button className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700 transition-colors">
                      <Eye className="w-3.5 h-3.5" />
                      Review
                    </button>
                  )}
                  {payout.status === "completed" && (
                    <span className="text-xs text-green-600">
                      Paid {payout.paidAt ? formatDate(payout.paidAt) : ""}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---- Main Page ----

type TabKey = "escrow" | "payouts";

export default function AdminPaymentsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("escrow");
  const [summary, setSummary] = useState<PaymentSummary>(MOCK_SUMMARY);
  const [escrows, setEscrows] = useState<EscrowAccount[]>(MOCK_ESCROWS);
  const [payouts, setPayouts] = useState<ContractorPayout[]>(MOCK_PAYOUTS);
  const [loading, setLoading] = useState(false);
  const [escrowFilter, setEscrowFilter] = useState<"all" | EscrowStatus>(
    "all"
  );

  // In production, these would call the real API
  const handleRelease = useCallback(async (offerId: string) => {
    if (
      !window.confirm(
        "Release escrow funds to contractor? This action cannot be undone."
      )
    ) {
      return;
    }
    // TODO: call apiClient.releaseEscrow(offerId)
    setEscrows((prev) =>
      prev.map((e) =>
        e.offerId === offerId ? { ...e, escrowStatus: "released" as EscrowStatus } : e
      )
    );
  }, []);

  const handleApprovePayout = useCallback(async (payoutId: string) => {
    if (
      !window.confirm("Approve this payout to the contractor?")
    ) {
      return;
    }
    // TODO: call apiClient.approveContractorPayout(payoutId)
    setPayouts((prev) =>
      prev.map((p) =>
        p.id === payoutId
          ? {
              ...p,
              status: "approved" as PayoutStatus,
              approvedAt: new Date().toISOString(),
            }
          : p
      )
    );
  }, []);

  const filteredEscrows =
    escrowFilter === "all"
      ? escrows
      : escrows.filter((e) => e.escrowStatus === escrowFilter);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">
            Payments & Escrow
          </h1>
          <p className="text-sm text-surface-500 mt-1">
            Manage resident payments, escrow accounts, and contractor payouts
          </p>
        </div>
        <button
          onClick={() => setLoading(true)}
          className="flex items-center gap-2 px-4 py-2 bg-surface-100 text-surface-700 text-sm font-medium rounded-lg hover:bg-surface-200 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Flow diagram */}
      <EscrowFlowDiagram />

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        <SummaryCard
          title="Total Collected"
          value={formatCurrency(summary.totalCollected)}
          subtitle="From residents"
          icon={ArrowDownToLine}
          color="bg-blue-100 text-blue-600"
        />
        <SummaryCard
          title="In Escrow"
          value={formatCurrency(summary.totalInEscrow)}
          subtitle="Held by Groupio"
          icon={Shield}
          color="bg-indigo-100 text-indigo-600"
        />
        <SummaryCard
          title="Released"
          value={formatCurrency(summary.totalReleasedToContractors)}
          subtitle="To contractors"
          icon={ArrowUpFromLine}
          color="bg-green-100 text-green-600"
        />
        <SummaryCard
          title="Platform Fees"
          value={formatCurrency(summary.totalPlatformFees)}
          subtitle="Groupio revenue"
          icon={TrendingUp}
          color="bg-purple-100 text-purple-600"
        />
        <SummaryCard
          title="Refunded"
          value={formatCurrency(summary.totalRefunded)}
          subtitle="Back to residents"
          icon={RefreshCw}
          color="bg-amber-100 text-amber-600"
        />
        <SummaryCard
          title="Pending Payouts"
          value={String(summary.pendingPayouts)}
          subtitle="Awaiting approval"
          icon={Clock}
          color="bg-orange-100 text-orange-600"
        />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-surface-200">
        <button
          onClick={() => setActiveTab("escrow")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "escrow"
              ? "border-primary-600 text-primary-700"
              : "border-transparent text-surface-500 hover:text-surface-700"
          }`}
        >
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Escrow Accounts
          </div>
        </button>
        <button
          onClick={() => setActiveTab("payouts")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "payouts"
              ? "border-primary-600 text-primary-700"
              : "border-transparent text-surface-500 hover:text-surface-700"
          }`}
        >
          <div className="flex items-center gap-2">
            <Banknote className="w-4 h-4" />
            Contractor Payouts
            {summary.pendingPayouts > 0 && (
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-danger-500 text-white text-[10px] font-bold">
                {summary.pendingPayouts}
              </span>
            )}
          </div>
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "escrow" && (
        <div className="space-y-4">
          {/* Escrow filters */}
          <div className="flex items-center gap-2">
            {(
              [
                { key: "all" as const, label: "All" },
                { key: "collecting" as const, label: "Collecting" },
                { key: "held" as const, label: "Held" },
                { key: "released" as const, label: "Released" },
                { key: "disputed" as const, label: "Disputed" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setEscrowFilter(tab.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  escrowFilter === tab.key
                    ? "bg-primary-600 text-white"
                    : "bg-surface-100 text-surface-600 hover:bg-surface-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Escrow table */}
          <div className="bg-white rounded-xl border border-surface-200">
            {filteredEscrows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Shield className="w-10 h-10 text-surface-300 mb-3" />
                <p className="text-surface-500">No escrow accounts found</p>
              </div>
            ) : (
              <EscrowTable escrows={filteredEscrows} onRelease={handleRelease} />
            )}
          </div>
        </div>
      )}

      {activeTab === "payouts" && (
        <div className="bg-white rounded-xl border border-surface-200">
          {payouts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Banknote className="w-10 h-10 text-surface-300 mb-3" />
              <p className="text-surface-500">No contractor payouts yet</p>
            </div>
          ) : (
            <PayoutsTable payouts={payouts} onApprove={handleApprovePayout} />
          )}
        </div>
      )}
    </div>
  );
}
