"use client";

import {
  ArrowRight,
  CheckCircle2,
  Clock,
  AlertCircle,
  Shield,
  Loader2,
  FileText,
  Phone,
  Mail,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { apiClient } from "@/lib/api/client";
import { useAuthStore } from "@/lib/stores/authStore";

interface OrderDetail {
  id: string;
  offerId: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  transactionId?: string;
  paymentMethod?: string;
  offer?: {
    title: string;
    category?: string;
    contractor?: {
      businessName: string;
      phone?: string;
      email?: string;
    };
  };
  escrowStatus?: string;
  invoiceId?: string;
}

const STATUS_MAP: Record<
  string,
  { label: string; color: string; icon: React.ElementType }
> = {
  pending: { label: "ממתין לתשלום", color: "bg-amber-100 text-amber-800", icon: Clock },
  processing: { label: "בעיבוד", color: "bg-blue-100 text-blue-800", icon: Loader2 },
  succeeded: { label: "שולם", color: "bg-green-100 text-green-800", icon: CheckCircle2 },
  failed: { label: "נכשל", color: "bg-red-100 text-red-800", icon: XCircle },
  refunded: { label: "הוחזר", color: "bg-purple-100 text-purple-800", icon: ArrowRight },
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

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const token = useAuthStore((s) => s.accessToken);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);

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

  const handleApproveWork = async () => {
    if (!order) return;
    setApproving(true);
    try {
      await apiClient.request(`/api/v1/payments/${order.id}/approve-work`, {
        method: "POST",
      });
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
      <div className="flex items-center justify-center min-h-[60vh]" dir="rtl">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
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

  return (
    <main className="max-w-2xl mx-auto space-y-6 p-4 md:p-6" dir="rtl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/payments" className="hover:text-primary-600">
          תשלומים
        </Link>
        <ArrowRight className="w-4 h-4 rtl-flip" />
        <span className="text-gray-900">פרטי הזמנה</span>
      </nav>

      {/* Status Banner */}
      <div className={`rounded-xl p-4 flex items-center gap-3 ${statusConfig.color}`}>
        <StatusIcon className="w-6 h-6" />
        <div>
          <p className="font-semibold">{statusConfig.label}</p>
          <p className="text-sm opacity-80">{formatDate(order.createdAt)}</p>
        </div>
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
        <div className={`rounded-xl p-4 ${escrowConfig.color}`}>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            <span className="font-medium">{escrowConfig.label}</span>
          </div>
          {order.escrowStatus === "held" && (
            <p className="text-sm mt-2 opacity-80">
              הכסף מוחזק בנאמנות עד שתאשרו שהעבודה הושלמה לשביעות רצונכם.
            </p>
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

      {/* Invoice Link */}
      {order.invoiceId && (
        <div className="text-center">
          <Link
            href={`/api/v1/payments/invoices/${order.invoiceId}/pdf`}
            className="text-primary-600 hover:underline text-sm"
            target="_blank"
          >
            הורד חשבונית PDF
          </Link>
        </div>
      )}

      {/* Back */}
      <div className="text-center pt-4">
        <Link href="/payments" className="text-gray-500 hover:text-gray-700 text-sm">
          ← חזרה לתשלומים
        </Link>
      </div>
    </main>
  );
}
