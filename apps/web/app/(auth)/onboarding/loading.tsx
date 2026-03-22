import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="page-container">
      <Skeleton variant="text" className="h-8 w-48 mb-6" />
      <div className="max-w-2xl space-y-6">
        <Skeleton variant="card" className="h-48" />
        <Skeleton variant="card" className="h-32" />
      </div>
    </div>
  );
}
