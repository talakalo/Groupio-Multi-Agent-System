import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="page-container">
      <Skeleton variant="text" className="h-8 w-48 mb-6" />
      <div className="flex gap-4 mb-8">
        <Skeleton variant="avatar" className="h-20 w-20" />
        <div className="flex-1 space-y-2">
          <Skeleton variant="text" className="h-6 w-48" />
          <Skeleton variant="text" className="h-4 w-64" />
        </div>
      </div>
      <div className="space-y-4">
        <Skeleton variant="card" className="h-32" />
        <Skeleton variant="card" className="h-32" />
      </div>
    </div>
  );
}
