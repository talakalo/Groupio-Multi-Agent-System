import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="page-container max-w-md mx-auto">
      <Skeleton variant="text" className="h-8 w-48 mb-6" />
      <div className="space-y-4">
        <Skeleton variant="text" className="h-4 w-full" />
        <Skeleton variant="card" className="h-12" />
        <Skeleton variant="text" className="h-4 w-full" />
        <Skeleton variant="card" className="h-12" />
        <Skeleton variant="card" className="h-12 mt-6" />
      </div>
    </div>
  );
}
