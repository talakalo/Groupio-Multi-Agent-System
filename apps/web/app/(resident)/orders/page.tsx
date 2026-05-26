"use client";

/**
 * My Orders page — shows resident's active and past orders derived from payments.
 *
 * Each "order" = one payment linked to an offer.
 * Status timeline reflects the escrow lifecycle:
 *   pending → processing → succeeded (in escrow) → released (work done, paid out)
 */

import {
  Package,
  CheckCircle2,
  Clock,
  XCircle,
  RefreshCw,
  ChevronRight,
  AlertCircle,
  Loader2,
  Shield,
  Star,
  Phone,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { apiClient, ApiError } from "@/lib/api/client";
import { useApiData } from "@/lib/hooks/useApiData";
import { cn } from "@/lib/utils/cn";

// ---- Types ----

interface Order {
  id: string;
  offerId: string;
  offerTitle?: string;
  contractorId?: string;
  contractorName?: string;
  contractorPhone?: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  transactionId?: string;
}

type OrderTab = "active" | "completed" | "all";

type StatusKey = "pending" | "processing" | "succeeded" | "released" | "failed" | "refunded";

const STATUS_ICON: Record<StatusKey, React.ElementType> = {
  pending: Clock,
  processing: RefreshCw,
  succeeded: Shield,
  released: CheckCircle2,
  failed: XCircle,
  refunded: RefreshCw,
};

const STATUS_COLOR: Record<StatusKey, string> = {
  pending: "bg-amber-100 text-amber-800",
  processing: "bg-blue-100 text-blue-800",
  succeeded: "bg-primary-50 text-primary-600",
  released: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  refunded: "bg-surface-100 text-surface-600",
};

const STATUS_TAB: Record<StatusKey, OrderTab> = {
  pending: "active",
  processing: "active",
  succeeded: "active",
  released: "completed",
  failed: "all",
  refunded: "completed",
};

function getStatusKey(status: string): StatusKey {
  return (STATUS_ICON[status as StatusKey] ? status : "pending") as StatusKey;
}

function formatCurrency(amount: number, currency = "ILS") {
  return new Intl.NumberFormat("he-IL", { style: "currency", currency, minimumFractionDigits: 0 }).format(amount);
}

function formatDate(s: string) {
  return new Date(s).toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric" });
}

// ---- Timeline step ----

function TimelineStep({ label, done, active }: { label: string; done: boolean; active: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <div
        className={cn(
          "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0",
          done ? "bg-green-500" : active ? "bg-primary-500" : "bg-gray-200"
        )}
        aria-hidden="true"
      >
        {done && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
        {active && !done && <div className="w-2 h-2 rounded-full bg-white" />}
      </div>
      <span className={cn("text-xs", done || active ? "text-gray-900 font-medium" : "text-gray-400")}>{label}</span>
    </div>
  );
}

function OrderTimeline({ status }: { status: string }) {
  const t = useTranslations("orders");

  const steps = [
    { key: "joined", label: t("timeline.joined") },
    { key: "paid", label: t("timeline.paid") },
    { key: "scheduled", label: t("timeline.scheduled") },
    { key: "done", label: t("timeline.done") },
    { key: "released", label: t("timeline.released") },
  ];

  const doneUpTo: Record<string, number> = {
    pending: 0,
    processing: 1,
    succeeded: 1,
    released: 4,
    refunded: 2,
    failed: 0,
  };

  const activeAt: Record<string, number> = {
    pending: 0,
    processing: 1,
    succeeded: 2,
    released: 4,
    refunded: -1,
    failed: -1,
  };

  const done = doneUpTo[status] ?? 0;
  const active = activeAt[status] ?? -1;

  return (
    <div className="space-y-2 mt-3">
      {steps.map((step, i) => (
        <TimelineStep key={step.key} label={step.label} done={i <= done - 1} active={i === active} />
      ))}
    </div>
  );
}

// ---- Order card ----

function OrderCard({ order }: { order: Order }) {
  const t = useTranslations("orders");
  const statusKey = getStatusKey(order.status);
  const StatusIcon = STATUS_ICON[statusKey];
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        type="button"
        className="w-full text-right p-4 flex items-start justify-between gap-3 hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
            <Package className="w-5 h-5 text-primary-600" aria-hidden="true" />
          </div>
          <div className="text-right">
            <p className="font-semibold text-gray-900 text-sm">
              {order.offerTitle || t("offerFallback", { id: order.offerId.slice(0, 8) })}
            </p>
            {order.contractorName && (
              <p className="text-xs text-gray-500">{order.contractorName}</p>
            )}
            <p className="text-xs text-gray-400 mt-0.5">{formatDate(order.createdAt)}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", STATUS_COLOR[statusKey])}>
            <StatusIcon className="w-3 h-3" aria-hidden="true" />
            {t(`status.${statusKey}`)}
          </span>
          <span className="text-sm font-bold text-gray-900" dir="ltr">
            {formatCurrency(order.amount, order.currency)}
          </span>
          <ChevronRight
            className={cn("w-4 h-4 text-gray-400 transition-transform", expanded && "rotate-90")}
            aria-hidden="true"
          />
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100">
          <OrderTimeline status={order.status} />

          {order.status === "succeeded" && (
            <div className="mt-4 bg-primary-50 rounded-xl p-3 text-xs text-primary-600 flex items-start gap-2">
              <Shield className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                {t("escrowActive")}{" "}
                <a href="mailto:support@groupio.co.il" className="underline">
                  {t("escrowSupport")}
                </a>
                .
              </span>
            </div>
          )}

          {order.contractorPhone && (
            <a
              href={`tel:${order.contractorPhone}`}
              className="mt-3 flex items-center gap-2 text-sm text-primary-600 hover:text-primary-600 font-medium"
            >
              <Phone className="w-4 h-4" aria-hidden="true" />
              {order.contractorPhone}
            </a>
          )}

          <div className="flex flex-wrap gap-2 mt-4">
            {order.status === "succeeded" && (
              <a
                href="mailto:support@groupio.co.il?subject=בעיה בהזמנה"
                className="btn-secondary text-xs py-1.5 px-3"
              >
                {t("reportProblem")}
              </a>
            )}
            {(order.status === "released" || order.status === "refunded") && order.contractorId && (
              <ReviewButton
                offerId={order.offerId}
                contractorId={order.contractorId}
                contractorName={order.contractorName}
              />
            )}
            <Link href="/payments" className="btn-secondary text-xs py-1.5 px-3">
              {t("invoices")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Review button / inline form ----

function ReviewButton({
  offerId,
  contractorId,
  contractorName,
}: {
  offerId: string;
  contractorId: string;
  contractorName?: string;
}) {
  const t = useTranslations("orders");
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) { setError(t("reviewSelectRating")); return; }
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.addContractorReview(contractorId, { offer_id: offerId, rating, comment: comment || undefined });
      setSubmitted(true);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : t("reviewError");
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <span className="flex items-center gap-1 text-xs text-green-700 font-medium">
        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
        {t("reviewSent")}
      </span>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1">
        <Star className="w-3.5 h-3.5" aria-hidden="true" />
        {t("writeReview")}
      </button>
    );
  }

  return (
    <div className="w-full mt-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">
        {t("reviewTitle", { name: contractorName ?? "" })}
      </h3>
      <form onSubmit={handleSubmit} className="space-y-3" noValidate>
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-1" role="group" aria-label={t("ratingAriaLabel")}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              onMouseEnter={() => setHoverRating(n)}
              onMouseLeave={() => setHoverRating(0)}
              aria-label={t("starAriaLabel", { n })}
              aria-pressed={rating === n}
            >
              <Star
                className={cn(
                  "w-7 h-7 transition-colors",
                  (hoverRating || rating) >= n ? "text-amber-400 fill-amber-400" : "text-gray-300"
                )}
                aria-hidden="true"
              />
            </button>
          ))}
        </div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={t("reviewPlaceholder")}
          className="input-field text-sm resize-none"
          rows={3}
          maxLength={500}
          aria-label={t("reviewTitle", { name: contractorName ?? "" })}
        />
        <div className="flex gap-2">
          <button type="submit" disabled={submitting} className="btn-primary text-sm flex items-center gap-1">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : null}
            {t("reviewSubmit")}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="btn-secondary text-sm">
            {t("reviewCancel")}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---- Main page ----

export default function OrdersPage() {
  const t = useTranslations("orders");
  const [tab, setTab] = useState<OrderTab>("active");

  const {
    data: orders = [],
    isLoading: loading,
    error,
    refetch,
  } = useApiData<Order[]>(
    ["orders", "my", { page: 1, limit: 50 }],
    async () => {
      const raw = await apiClient.getMyPayments({ page: 1, limit: 50 });
      const list = (Array.isArray(raw) ? raw : (raw?.payments ?? [])) as unknown as Record<string, unknown>[];
      return list.map((p) => ({
        id: p.id as string,
        offerId: (p.offerId ?? p.offer_id ?? '') as string,
        offerTitle: p.offerTitle as string | undefined,
        contractorId: p.contractorId as string | undefined,
        contractorName: p.contractorName as string | undefined,
        contractorPhone: p.contractorPhone as string | undefined,
        amount: (p.amount ?? 0) as number,
        currency: (p.currency ?? 'ILS') as string,
        status: (p.status ?? 'pending') as string,
        createdAt: (p.createdAt ?? p.created_at ?? '') as string,
        transactionId: p.transactionId as string | undefined,
      }));
    },
  );
  const fetchOrders = () => { void refetch(); };

  const tabs: { key: OrderTab; label: string }[] = [
    { key: "active", label: t("tabActive") },
    { key: "completed", label: t("tabCompleted") },
    { key: "all", label: t("tabAll") },
  ];

  const displayed = orders.filter((o) => {
    if (tab === "all") return true;
    const sk = getStatusKey(o.status);
    return STATUS_TAB[sk] === tab;
  });

  return (
    <div className="max-w-3xl mx-auto space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
          <p className="text-sm text-gray-500 mt-1">{t("subtitle")}</p>
        </div>
        <button
          onClick={fetchOrders}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          aria-label={t("refreshAriaLabel")}
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          {t("refresh")}
        </button>
      </div>

      {/* Escrow explainer */}
      <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl border border-primary-100 p-4 flex items-start gap-3">
        <Shield className="w-5 h-5 text-primary-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-sm text-primary-600">
          <span className="font-semibold">{t("escrowBadge")}</span>{" "}
          {t("escrowExplainer")}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2" role="tablist">
        {tabs.map((tab_item) => (
          <button
            key={tab_item.key}
            role="tab"
            aria-selected={tab === tab_item.key}
            onClick={() => setTab(tab_item.key)}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
              tab === tab_item.key
                ? "bg-primary-600 text-white"
                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            )}
          >
            {tab_item.label}
          </button>
        ))}
      </div>

      {/* Order list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary-600" aria-hidden="true" />
          <span className="mr-3 text-gray-500">{t("loading")}</span>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center py-12 text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mb-3" aria-hidden="true" />
          <p className="text-gray-600">{t("loadError")}</p>
          <button onClick={fetchOrders} className="mt-3 text-primary-600 text-sm font-medium hover:underline">
            {t("retry")}
          </button>
        </div>
      ) : displayed.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <Package className="w-10 h-10 text-gray-300 mb-3" aria-hidden="true" />
          <p className="text-gray-500 font-medium">
            {tab === "active" ? t("emptyActive") : tab === "completed" ? t("emptyCompleted") : t("emptyAll")}
          </p>
          <p className="text-sm text-gray-400 mt-1">{t("emptyHint")}</p>
          <Link href="/offers" className="btn-primary mt-4 text-sm">
            {t("discoverOffers")}
          </Link>
        </div>
      ) : (
        <div className="space-y-3" role="list">
          {displayed.map((order) => (
            <div key={order.id} role="listitem">
              <OrderCard order={order} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
