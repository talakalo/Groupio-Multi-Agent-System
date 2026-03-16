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
  Shield,
  Star,
  Phone,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { EscrowBadge } from "@/components/features/payments/EscrowBadge";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiClient, ApiError } from "@/lib/api/client";
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

// ---- Status config ----

type BadgeVariant = "warning" | "info" | "primary" | "success" | "error" | "accent";

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: BadgeVariant; icon: React.ElementType; tab: OrderTab }
> = {
  pending: { label: "ממתין", variant: "warning", icon: Clock, tab: "active" },
  processing: { label: "בעיבוד", variant: "info", icon: RefreshCw, tab: "active" },
  succeeded: { label: "פעיל", variant: "primary", icon: Shield, tab: "active" },
  released: { label: "הושלם", variant: "success", icon: CheckCircle2, tab: "completed" },
  failed: { label: "נכשל", variant: "error", icon: XCircle, tab: "all" },
  refunded: { label: "הוחזר", variant: "accent", icon: RefreshCw, tab: "completed" },
};

function getOrderTab(status: string): OrderTab {
  return STATUS_CONFIG[status]?.tab ?? "all";
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
          done ? "bg-green-500" : active ? "bg-indigo-500" : "bg-gray-200"
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
  const steps = [
    { key: "joined", label: "הצטרפות להצעה" },
    { key: "paid", label: "תשלום נשמר בנאמנות" },
    { key: "scheduled", label: "עבודה תוזמנה" },
    { key: "done", label: "עבודה הושלמה" },
    { key: "released", label: "תשלום שוחרר לקבלן" },
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
  const config = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending;
  const StatusIcon = config.icon;
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
          <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
            <Package className="w-5 h-5 text-indigo-600" aria-hidden="true" />
          </div>
          <div className="text-right">
            <p className="font-semibold text-gray-900 text-sm">
              {order.offerTitle || `הצעה #${order.offerId.slice(0, 8)}`}
            </p>
            {order.contractorName && (
              <p className="text-xs text-gray-500">{order.contractorName}</p>
            )}
            <p className="text-xs text-gray-400 mt-0.5">{formatDate(order.createdAt)}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <Badge variant={config.variant} size="sm">
            <StatusIcon className="w-3 h-3 me-1" aria-hidden="true" />
            {config.label}
          </Badge>
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
          {/* Timeline */}
          <OrderTimeline status={order.status} />

          {/* Escrow explanation for active escrow */}
          {order.status === "succeeded" && (
            <div className="mt-4">
              <EscrowBadge variant="block" />
            </div>
          )}

          {/* Contact contractor */}
          {order.contractorPhone && (
            <a
              href={`tel:${order.contractorPhone}`}
              className="mt-3 flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
            >
              <Phone className="w-4 h-4" aria-hidden="true" />
              {order.contractorPhone}
            </a>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 mt-4">
            {order.status === "succeeded" && (
              <a
                href="mailto:support@groupio.co.il?subject=בעיה בהזמנה"
                className="btn-secondary text-xs py-1.5 px-3"
              >
                דיווח על בעיה
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
              חשבוניות
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
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) { setError("נא לבחור דירוג"); return; }
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.addContractorReview(contractorId, { offer_id: offerId, rating, comment: comment || undefined });
      setSubmitted(true);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "שגיאה בשליחת הביקורת";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <span className="flex items-center gap-1 text-xs text-green-700 font-medium">
        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
        ביקורת נשלחה!
      </span>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1">
        <Star className="w-3.5 h-3.5" aria-hidden="true" />
        כתוב ביקורת
      </button>
    );
  }

  return (
    <div className="w-full mt-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">
        דירוג {contractorName ?? "הקבלן"}
      </h3>
      <form onSubmit={handleSubmit} className="space-y-3" noValidate>
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
        {/* Star rating */}
        <div className="flex gap-1" role="group" aria-label="דירוג">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              onMouseEnter={() => setHoverRating(n)}
              onMouseLeave={() => setHoverRating(0)}
              aria-label={`${n} כוכבים`}
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
          placeholder="ספרו על החוויה שלכם (אופציונלי)..."
          className="input-field text-sm resize-none"
          rows={3}
          maxLength={500}
          aria-label="תוכן הביקורת"
        />
        <div className="flex gap-2">
          <button type="submit" disabled={submitting} className="btn-primary text-sm flex items-center gap-1">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : null}
            שלח ביקורת
          </button>
          <button type="button" onClick={() => setOpen(false)} className="btn-secondary text-sm">
            ביטול
          </button>
        </div>
      </form>
    </div>
  );
}

// ---- Main page ----

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<OrderTab>("active");

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payments = await apiClient.getMyPayments() as unknown as Order[];
      setOrders(Array.isArray(payments) ? payments : []);
    } catch {
      setError("לא ניתן לטעון את ההזמנות. נסו שוב.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const tabs: { key: OrderTab; label: string }[] = [
    { key: "active", label: "פעילות" },
    { key: "completed", label: "הושלמו" },
    { key: "all", label: "הכל" },
  ];

  const displayed = orders.filter((o) => {
    if (tab === "all") return true;
    if (tab === "active") return ["pending", "processing", "succeeded"].includes(o.status);
    if (tab === "completed") return ["released", "refunded", "failed"].includes(o.status);
    return true;
  });

  return (
    <div className="max-w-3xl mx-auto space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ההזמנות שלי</h1>
          <p className="text-sm text-gray-500 mt-1">מעקב אחר הזמנות, תשלומים ועבודות</p>
        </div>
        <button
          onClick={fetchOrders}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          aria-label="רענן הזמנות"
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          רענן
        </button>
      </div>

      {/* Escrow explainer */}
      <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl border border-indigo-100 p-4 flex items-start gap-3">
        <Shield className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-sm text-indigo-700">
          <span className="font-semibold">התשלומים שלך מוגנים בנאמנות.</span>{" "}
          Groupio מחזיקה את הכסף עד להשלמת העבודה. הכסף משוחרר לקבלן רק לאחר אישור מנהל המערכת.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
              tab === t.key
                ? "bg-indigo-600 text-white"
                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Order list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1">
                  <Skeleton variant="avatar" className="w-10 h-10 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton variant="text" className="h-4 w-32" />
                    <Skeleton variant="text" className="h-3 w-24" />
                    <Skeleton variant="text" className="h-3 w-20" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Skeleton variant="text" className="h-5 w-16 rounded-full" />
                  <Skeleton variant="text" className="h-4 w-20" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center py-12 text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mb-3" aria-hidden="true" />
          <p className="text-gray-600">{error}</p>
          <button onClick={fetchOrders} className="mt-3 text-indigo-600 text-sm font-medium hover:underline">
            נסה שוב
          </button>
        </div>
      ) : displayed.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center bg-white rounded-xl border border-gray-200">
          <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mb-4">
            <Package className="w-8 h-8 text-gray-300" aria-hidden="true" />
          </div>
          <p className="text-gray-700 font-semibold text-lg">
            {tab === "active" ? "אין הזמנות פעילות" : tab === "completed" ? "אין הזמנות שהושלמו" : "אין הזמנות עדיין"}
          </p>
          <p className="text-sm text-gray-400 mt-2 max-w-xs">
            הזמנות יופיעו כאן לאחר שתצטרפו להצעה ותבצעו תשלום
          </p>
          <Link
            href="/offers"
            className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 bg-primary-500 text-white text-sm font-medium rounded-lg hover:bg-primary-600 transition-colors"
          >
            גלו הצעות
            <ChevronRight className="w-4 h-4 rtl:rotate-180" aria-hidden="true" />
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
