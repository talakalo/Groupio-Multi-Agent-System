import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="page-container">
      <Skeleton variant="text" className="h-8 w-48 mb-6" />
      <div className="grid lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <Skeleton variant="card" className="h-48" />
          <Skeleton variant="card" className="h-32" />
        </div>
        <div>
          <Skeleton variant="card" className="h-64" />
        </div>
      </div>
    </div>
  );
}
