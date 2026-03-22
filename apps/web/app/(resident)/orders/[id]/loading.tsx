import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="page-container">
      <Skeleton variant="text" className="h-4 w-48 mb-4" />
      <Skeleton variant="text" className="h-8 w-64 mb-6" />
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Skeleton variant="card" className="h-32" />
          <Skeleton variant="table-row" count={4} />
        </div>
        <div>
          <Skeleton variant="card" className="h-48" />
        </div>
      </div>
    </div>
  );
}
