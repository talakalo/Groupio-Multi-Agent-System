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
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { OrderTimeline } from "@/components/features/orders/OrderTimeline";
import { EscrowBadge } from "@/components/features/payments/EscrowBadge";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { ApiError, apiClient } from "@/lib/api/client";
import { useApiData } from "@/lib/hooks/useApiData";
import { useUnwrapPageParams, PageParamsProps } from "@/lib/utils/unwrapPageParams";

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

type BadgeVariant = "warning" | "info" | "success" | "error" | "accent" | "primary";

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  pending: "warning",
  processing: "info",
  succeeded: "success",
  failed: "error",
  refunded: "accent",
};

const STATUS_ICON: Record<string, React.ElementType> = {
  pending: Clock,
  processing: Loader2,
  succeeded: CheckCircle2,
  failed: XCircle,
  refunded: Clock,
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
  const t = useTranslations("orders");
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [approveErr, setApproveErr] = useState<string | null>(null);
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const [invoiceErr, setInvoiceErr] = useState<string | null>(null);

  const {
    data: order = null,
    isLoading: loading,
    error: loadErr,
    refetch: fetchOrder,
  } = useApiData<OrderDetail | null>(
    ["orders", id],
    async () => {
      const data = await apiClient.getPayment(id);
      return data as unknown as OrderDetail;
    },
    { enabled: !!id },
  );

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!order) throw new Error("Order not loaded");
      return apiClient.approveWork(order.id);
    },
    onSuccess: () => {
      setApproveErr(null);
      queryClient.invalidateQueries({ queryKey: ["orders", id] });
      queryClient.invalidateQueries({ queryKey: ["orders", "my"] });
      queryClient.invalidateQueries({ queryKey: ["payments", "my"] });
    },
    onError: () => {
      setApproveErr(t("detail.approveError"));
    },
  });
  const approving = approveMutation.isPending;
  const approved = approveMutation.isSuccess;
  const error = approveErr ?? (loadErr ? t("detail.loadError") : null);

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
      setInvoiceErr(e instanceof ApiError ? e.message : t("detail.invoiceError"));
    } finally {
      setInvoiceBusy(false);
    }
  }, [order?.invoiceId, t]);

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
            {t("detail.backToPayments")}
          </Link>
        </div>
      </div>
    );
  }

  if (!order) return null;

  const statusKey = STATUS_ICON[order.status] ? order.status : "pending";
  const StatusIcon = STATUS_ICON[statusKey]!;
  const ESCROW_KEYS = ["held", "released", "refunded", "pending"] as const;
  type EscrowKey = (typeof ESCROW_KEYS)[number];
  const escrowLabel = order.escrowStatus
    ? ESCROW_KEYS.includes(order.escrowStatus as EscrowKey)
      ? t(`detail.escrow.${order.escrowStatus as EscrowKey}`)
      : t("detail.escrow.pending")
    : null;
  const canApproveWork =
    order.status === "succeeded" &&
    order.escrowStatus === "held" &&
    !approved;

  const orderTitle = order.offer?.title ?? t("detail.defaultTitle");

  return (
    <main className="max-w-2xl mx-auto space-y-6 p-4 md:p-6" dir="rtl">
      <Breadcrumb
        items={[
          { label: t("detail.breadcrumbHome"), href: "/dashboard" },
          { label: t("detail.breadcrumbOrders"), href: "/orders" },
          { label: orderTitle },
        ]}
      />

      {/* Status Banner */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <StatusIcon className="w-6 h-6 text-gray-500" />
          <div>
            <Badge variant={STATUS_VARIANT[statusKey] ?? "warning"} size="md">
              {t(`status.${statusKey}` as Parameters<typeof t>[0])}
            </Badge>
            <p className="text-xs text-gray-500 mt-1">{formatDate(order.createdAt)}</p>
          </div>
        </div>
      </div>

      {/* Order Timeline */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">{t("detail.orderStatus")}</h2>
        <OrderTimeline status={order.status} />
      </div>

      {/* Order Info Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">{orderTitle}</h1>
          <span className="text-2xl font-bold text-primary-700">
            {formatCurrency(order.amount, order.currency)}
          </span>
        </div>

        {order.offer?.category && (
          <p className="text-sm text-gray-500">
            {t("detail.category", { value: order.offer.category })}
          </p>
        )}

        {order.transactionId && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <FileText className="w-4 h-4" />
            <span>{t("detail.transactionId", { id: order.transactionId })}</span>
          </div>
        )}
      </div>

      {/* Escrow Status */}
      {order.escrowStatus && escrowLabel && (
        <div className="space-y-2">
          <EscrowBadge variant={order.escrowStatus === "held" ? "block" : "inline"} />
          {order.escrowStatus !== "held" && (
            <p className="text-sm text-gray-500 px-1">{escrowLabel}</p>
          )}
        </div>
      )}

      {/* Contractor Info */}
      {order.offer?.contractor && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
          <h2 className="font-semibold text-gray-900">{t("detail.contractorDetails")}</h2>
          <p className="font-medium">{order.offer.contractor.businessName}</p>
          {order.offer.contractor.phone && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Phone className="w-4 h-4" />
              <a href={`tel:${order.offer.contractor.phone}`} className="hover:text-primary-600">
                {order.offer.contractor.phone}
              </a>
            </div>
          )}
          {order.offer.contractor.email && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Mail className="w-4 h-4" />
              <a href={`mailto:${order.offer.contractor.email}`} className="hover:text-primary-600">
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
            {t("detail.approveTitle")}
          </h2>
          <p className="text-sm text-green-800">{t("detail.approveDescription")}</p>
          {approveErr && (
            <p className="text-sm text-red-600" role="alert">{approveErr}</p>
          )}
          <button
            onClick={() => approveMutation.mutate()}
            disabled={approving}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {approving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-5 h-5" />
            )}
            {approving ? t("detail.approving") : t("detail.approveButton")}
          </button>
        </div>
      )}

      {/* Approved Banner */}
      {approved && (
        <div className="bg-green-100 rounded-xl p-4 text-center text-green-800" role="alert">
          <CheckCircle2 className="w-8 h-8 mx-auto mb-2" />
          <p className="font-semibold">{t("detail.approvedBanner")}</p>
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
            {invoiceBusy ? t("detail.invoiceDownloading") : t("detail.invoiceDownload")}
          </button>
          {invoiceErr && (
            <p className="text-sm text-red-600" role="alert">{invoiceErr}</p>
          )}
        </div>
      )}

      {/* Back */}
      <div className="text-center pt-4">
        <Link href="/orders" className="text-gray-500 hover:text-gray-700 text-sm">
          {t("detail.backToOrders")}
        </Link>
      </div>
    </main>
  );
}
