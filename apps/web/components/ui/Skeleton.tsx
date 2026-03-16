import clsx from "clsx";

type SkeletonVariant = "text" | "card" | "avatar" | "stat" | "table-row";

interface SkeletonProps {
  variant?: SkeletonVariant;
  className?: string;
  count?: number;
}

const variantStyles: Record<SkeletonVariant, string> = {
  text: "h-4 w-full rounded",
  card: "h-48 w-full rounded-lg",
  avatar: "h-10 w-10 rounded-full",
  stat: "h-24 w-full rounded-lg",
  "table-row": "h-12 w-full rounded",
};

function SkeletonItem({ variant = "text", className }: Omit<SkeletonProps, "count">) {
  return (
    <div
      className={clsx(
        "animate-pulse bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%] animate-shimmer",
        variantStyles[variant],
        className
      )}
      role="status"
      aria-label="Loading"
    />
  );
}

export function Skeleton({ variant = "text", className, count = 1 }: SkeletonProps) {
  if (count === 1) return <SkeletonItem variant={variant} className={className} />;

  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonItem key={i} variant={variant} className={className} />
      ))}
    </div>
  );
}
