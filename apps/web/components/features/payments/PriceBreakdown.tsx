import clsx from "clsx";

interface PriceLineItem {
  label: string;
  amount: number;
  type?: "regular" | "discount" | "subtotal" | "tax" | "total";
}

interface PriceBreakdownProps {
  items: PriceLineItem[];
  currency?: string;
  className?: string;
}

function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function PriceBreakdown({ items, currency = "ILS", className }: PriceBreakdownProps) {
  return (
    <div className={clsx("space-y-2", className)}>
      {items.map((item, index) => {
        const isTotal = item.type === "total";
        const isDiscount = item.type === "discount";
        const isSubtotal = item.type === "subtotal";

        return (
          <div key={index}>
            {(isSubtotal || isTotal) && <div className="border-t border-gray-200 my-2" />}
            <div
              className={clsx(
                "flex items-center justify-between",
                isTotal && "font-bold text-lg",
                isDiscount && "text-emerald-600",
                !isTotal && !isDiscount && "text-gray-700 text-sm"
              )}
            >
              <span>{item.label}</span>
              <span dir="ltr" className="font-mono">
                {isDiscount && "-"}
                {formatPrice(Math.abs(item.amount), currency)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
