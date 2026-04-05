"use client";

import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  FileText,
  Phone,
  Mail,
  XCircle,
  Star,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { OrderTimeline } from "@/components/features/orders/OrderTimeline";
import { EscrowBadge } from "@/components/features/payments/EscrowBadge";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { ApiError, apiClient } from "@/lib/api/client";
import { useUser } from "@/lib/stores/authStore";
import { useUnwrapPageParams, PageParamsProps } from "@/lib/utils/unwrapPageParams";

interface OrderDetail {
  id: string;
  offerId: string;
  contractorId?: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  transactionId?: string;
  paymentMethod?: string;
  offer?: {
    title: string;
    category?: string;
    contractorId?: string;
    contractor?: {
      id?: string;
      businessName: string;
      phone?: string;
      email?: string;
    };
  };
  escrowStatus?: string;
  invoiceId?: string;
}

type BadgeVariant = "warning" | "info" | "success" | "error" | "accent" | "primary";

const STATUS_MAP: Record<
  string,
  { label: string; variant: BadgeVariant; icon: React.ElementType }
> = {
  pending: { label: "ממתין לתשלום", variant: "warning", icon: Clock },
  processing: { label: "בעיבוד", variant: "info", icon: Loader2 },
  succeeded: { label: "שולם", variant: "success", icon: CheckCircle2 },
  failed: { label: "נכשל", variant: "error", icon: XCircle },
  refunded: { label: "הוחזר", variant: "accent", icon: Clock },
};

const ESCROW_MAP: Record<string, { label: string; color: string }> = {
  held: { label: "הכסף מוחזק בנאמנות", color: "text-blue-700 bg-blue-50" },
  released: { label: "הכסף שוחרר לקבלן", color: "text-green-700 bg-green-50" },
  refunded: { label: "הכסף הוחזר אליך", color: "text-purple-700 bg-purple-50" },
  pending: { label: "ממתין", color: "text-amber-700 bg-amber-50" },
};

function formatCurrency(amount: number, currency = "ILS") {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("he-IL", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function OrderDetailPage(props: PageParamsProps) {
  useUnwrapPageParams(props);
  const { id } = useParams<{ id: string }>();
  const currentUser = useUser();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const [invoiceErr, setInvoiceErr] = useState<string | null>(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const handleInvoiceDownload = useCallback(async () => {
    if (!order?.invoiceId) return;
    setInvoiceErr(null);
    setInvoiceBusy(true);
    try {
      const blob = await apiClient.downloadInvoiceHtml(order.invoiceId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-${order.invoiceId.slice(0, 8)}.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setInvoiceErr(e instanceof ApiError ? e.message : "לא ניתן להוריד את החשבונית");
    } finally {
      setInvoiceBusy(false);
    }
  }, [order?.invoiceId]);

  const fetchOrder = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await apiClient.getPayment(id);
      setOrder(data as unknown as OrderDetail);
    } catch {
      setError("לא ניתן לטעון את פרטי ההזמנה");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  // Check whether the current user has already reviewed this contractor,
  // so the review form is not shown again after a page refresh.
  useEffect(() => {
    if (!order || !currentUser?.id) return;
    const contractorId =
      order.contractorId ??
      order.offer?.contractorId ??
      order.offer?.contractor?.id;
    if (!contractorId) return;

    apiClient
      .getContractorReviews(contractorId)
      .then((res) => {
        const alreadyReviewed = res.items.some((r) => r.user_id === currentUser.id);
        if (alreadyReviewed) setReviewSubmitted(true);
      })
      .catch(() => {
        // Silently ignore — review form will be shown; backend will reject duplicates
      });
  }, [order, currentUser?.id]);

  const handleApproveWork = async () => {
    if (!order) return;
    setApproving(true);
    try {
      await apiClient.approveWork(order.id);
      setApproved(true);
      await fetchOrder();
    } catch {
      setError("שגיאה באישור העבודה. נסו שוב.");
    } finally {
      setApproving(false);
    }
  };

  if (loading) {
    return (
      <main className="max-w-2xl mx-auto space-y-6 p-4 md:p-6" dir="rtl">
        <Skeleton variant="text" className="h-4 w-40" />
        <Skeleton variant="card" className="h-20" />
        <Skeleton variant="card" className="h-48" />
        <Skeleton variant="card" className="h-32" />
        <Skeleton variant="card" className="h-40" />
      </main>
    );
  }

  if (error && !order) {
    return (
      <div className="max-w-2xl mx-auto p-6" dir="rtl">
        <div className="bg-red-50 rounded-xl p-6 text-center">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <p className="text-red-700 font-medium">{error}</p>
          <Link href="/payments" className="text-primary-600 hover:underline mt-3 inline-block">
            חזרה לתשלומים
          </Link>
        </div>
      </div>
    );
  }

  if (!order) return null;

  const statusConfig = STATUS_MAP[order.status] || STATUS_MAP.pending;
  const StatusIcon = statusConfig.icon;
  const escrowConfig = order.escrowStatus
    ? ESCROW_MAP[order.escrowStatus] || ESCROW_MAP.pending
    : null;
  const canApproveWork =
    order.status === "succeeded" &&
    order.escrowStatus === "held" &&
    !approved;

  const effectiveContractorId =
    order.contractorId ??
    order.offer?.contractorId ??
    order.offer?.contractor?.id;
  const canLeaveReview =
    order.status === "succeeded" && !!effectiveContractorId && !reviewSubmitted;

  const handleSubmitReview = async () => {
    if (!effectiveContractorId || reviewRating === 0) return;
    setReviewSubmitting(true);
    setReviewError(null);
    try {
      await apiClient.submitReview(effectiveContractorId, order.offerId, {
        rating: reviewRating,
        comment: reviewComment.trim() || undefined,
      });
      setReviewSubmitted(true);
    } catch {
      setReviewError("לא ניתן לשמור את הביקורת. נסו שוב.");
    } finally {
      setReviewSubmitting(false);
    }
  };

  const orderTitle = order.offer?.title || "הזמנה";

  return (
    <main className="max-w-2xl mx-auto space-y-6 p-4 md:p-6" dir="rtl">
      {/* Breadcrumb */}
      <Breadcrumb
        items={[
          { label: "ראשי", href: "/dashboard" },
          { label: "הזמנות", href: "/orders" },
          { label: orderTitle },
        ]}
      />

      {/* Status Banner */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <StatusIcon className="w-6 h-6 text-gray-500" />
          <div>
            <Badge variant={statusConfig.variant} size="md">
              {statusConfig.label}
            </Badge>
            <p className="text-xs text-gray-500 mt-1">{formatDate(order.createdAt)}</p>
          </div>
        </div>
      </div>

      {/* Order Timeline */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">מצב ההזמנה</h2>
        <OrderTimeline status={order.status} />
      </div>

      {/* Order Info Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">
            {order.offer?.title || "הזמנה"}
          </h1>
          <span className="text-2xl font-bold text-primary-700">
            {formatCurrency(order.amount, order.currency)}
          </span>
        </div>

        {order.offer?.category && (
          <p className="text-sm text-gray-500">קטגוריה: {order.offer.category}</p>
        )}

        {order.transactionId && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <FileText className="w-4 h-4" />
            <span>מזהה עסקה: {order.transactionId}</span>
          </div>
        )}
      </div>

      {/* Escrow Status */}
      {escrowConfig && (
        <div className="space-y-2">
          <EscrowBadge variant={order.escrowStatus === "held" ? "block" : "inline"} />
          {order.escrowStatus !== "held" && (
            <p className="text-sm text-gray-500 px-1">{escrowConfig.label}</p>
          )}
        </div>
      )}

      {/* Contractor Info */}
      {order.offer?.contractor && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
          <h2 className="font-semibold text-gray-900">פרטי הקבלן</h2>
          <p className="font-medium">{order.offer.contractor.businessName}</p>
          {order.offer.contractor.phone && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Phone className="w-4 h-4" />
              <a
                href={`tel:${order.offer.contractor.phone}`}
                className="hover:text-primary-600"
              >
                {order.offer.contractor.phone}
              </a>
            </div>
          )}
          {order.offer.contractor.email && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Mail className="w-4 h-4" />
              <a
                href={`mailto:${order.offer.contractor.email}`}
                className="hover:text-primary-600"
              >
                {order.offer.contractor.email}
              </a>
            </div>
          )}
        </div>
      )}

      {/* Work Approval */}
      {canApproveWork && (
        <div className="bg-green-50 rounded-xl border border-green-200 p-6 space-y-4">
          <h2 className="font-semibold text-green-900 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            אישור השלמת עבודה
          </h2>
          <p className="text-sm text-green-800">
            לאחר שתאשרו שהעבודה הושלמה, הכסף ישוחרר מהנאמנות לקבלן. פעולה זו
            אינה ניתנת לביטול.
          </p>
          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
          <button
            onClick={handleApproveWork}
            disabled={approving}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {approving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-5 h-5" />
            )}
            {approving ? "מאשר..." : "אישור השלמת עבודה ושחרור תשלום"}
          </button>
        </div>
      )}

      {/* Approved Banner */}
      {approved && (
        <div className="bg-green-100 rounded-xl p-4 text-center text-green-800" role="alert">
          <CheckCircle2 className="w-8 h-8 mx-auto mb-2" />
          <p className="font-semibold">העבודה אושרה! הכסף ישוחרר לקבלן.</p>
        </div>
      )}

      {/* Review Card */}
      {canLeaveReview && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-400" />
            דרגו את הקבלן
          </h2>
          <div className="flex items-center gap-1" dir="ltr">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setReviewRating(star)}
                className="focus:outline-none"
                aria-label={`${star} כוכבים`}
              >
                <Star
                  className={`w-8 h-8 transition-colors ${
                    star <= reviewRating ? "text-yellow-400 fill-yellow-400" : "text-gray-300"
                  }`}
                />
              </button>
            ))}
          </div>
          <textarea
            value={reviewComment}
            onChange={(e) => setReviewComment(e.target.value)}
            placeholder="הוסיפו הערה (אופציונלי)"
            rows={3}
            className="w-full rounded-xl border border-gray-200 p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-300"
          />
          {reviewError && (
            <p className="text-sm text-red-600" role="alert">{reviewError}</p>
          )}
          <button
            type="button"
            onClick={() => void handleSubmitReview()}
            disabled={reviewSubmitting || reviewRating === 0}
            className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {reviewSubmitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Star className="w-5 h-5" />
            )}
            {reviewSubmitting ? "שומר..." : "שליחת ביקורת"}
          </button>
        </div>
      )}

      {/* Review Submitted Banner */}
      {reviewSubmitted && (
        <div className="bg-yellow-50 rounded-xl p-4 text-center text-yellow-800" role="alert">
          <Star className="w-8 h-8 mx-auto mb-2 text-yellow-400 fill-yellow-400" />
          <p className="font-semibold">תודה על הביקורת!</p>
        </div>
      )}

      {/* Invoice Link */}
      {order.invoiceId && (
        <div className="text-center space-y-2">
          <button
            type="button"
            onClick={() => void handleInvoiceDownload()}
            disabled={invoiceBusy}
            className="text-primary-600 hover:underline text-sm disabled:opacity-50"
          >
            {invoiceBusy ? "מוריד…" : "הורד חשבונית (HTML להדפסה ל-PDF)"}
          </button>
          {invoiceErr && (
            <p className="text-sm text-red-600" role="alert">
              {invoiceErr}
            </p>
          )}
        </div>
      )}

      {/* Back */}
      <div className="text-center pt-4">
        <Link href="/orders" className="text-gray-500 hover:text-gray-700 text-sm">
          ← חזרה להזמנות
        </Link>
      </div>
    </main>
  );
}
