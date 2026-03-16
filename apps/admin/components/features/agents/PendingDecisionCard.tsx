"use client";

import { clsx } from "clsx";
import { Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";

export type DecisionType = "vetting" | "outreach" | "credit" | "payment" | "matching";

export interface PendingDecision {
  id: string;
  agentName: string;
  type: DecisionType;
  summary: string;
  reasoning: string;
  createdAt: string;
}

interface PendingDecisionCardProps {
  decision: PendingDecision;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  loading?: boolean;
}

const TYPE_STYLES: Record<DecisionType, { border: string; bg: string; text: string }> = {
  vetting: { border: "border-l-primary-500", bg: "bg-primary-50", text: "text-primary-700" },
  outreach: { border: "border-l-info-500", bg: "bg-info-50", text: "text-info-700" },
  credit: { border: "border-l-warning-500", bg: "bg-warning-50", text: "text-warning-700" },
  payment: { border: "border-l-success-500", bg: "bg-success-50", text: "text-success-700" },
  matching: { border: "border-l-accent-500", bg: "bg-accent-50", text: "text-accent-700" },
};

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function PendingDecisionCard({
  decision,
  onApprove,
  onReject,
  loading = false,
}: PendingDecisionCardProps) {
  const style = TYPE_STYLES[decision.type];

  return (
    <div
      className={clsx(
        "card p-4 border-s-4 space-y-3",
        style.border,
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-surface-900">
              {decision.agentName}
            </span>
            <span
              className={clsx(
                "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide",
                style.bg,
                style.text,
              )}
            >
              {decision.type}
            </span>
          </div>
          <p className="text-sm text-surface-700 mt-1">{decision.summary}</p>
        </div>
        <span className="flex items-center gap-1 text-xs text-surface-400 whitespace-nowrap flex-shrink-0">
          <Clock className="w-3 h-3" />
          {formatRelativeTime(decision.createdAt)}
        </span>
      </div>

      {/* Reasoning */}
      <p className="text-xs text-surface-500 bg-surface-50 rounded-lg p-2.5 leading-relaxed">
        {decision.reasoning}
      </p>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => onApprove(decision.id)}
          disabled={loading}
          className="btn-sm inline-flex items-center gap-1.5 rounded-lg bg-success-50 text-success-700 hover:bg-success-100 font-medium transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
          Approve
        </button>
        <button
          onClick={() => onReject(decision.id)}
          disabled={loading}
          className="btn-sm inline-flex items-center gap-1.5 rounded-lg bg-danger-50 text-danger-700 hover:bg-danger-100 font-medium transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
          Reject
        </button>
      </div>
    </div>
  );
}
