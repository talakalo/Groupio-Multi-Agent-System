import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="page-container">
      <Skeleton variant="text" className="h-8 w-48 mb-6" />
      <div className="flex items-center gap-4 mb-8">
        <Skeleton variant="avatar" className="h-16 w-16" />
        <div className="space-y-2 flex-1">
          <Skeleton variant="text" className="h-5 w-32" />
          <Skeleton variant="text" className="h-4 w-48" />
        </div>
      </div>
      <div className="space-y-3">
        <Skeleton variant="text" className="h-12 w-full" />
        <Skeleton variant="text" className="h-12 w-full" />
        <Skeleton variant="text" className="h-12 w-full" />
        <Skeleton variant="text" className="h-12 w-full" />
      </div>
    </div>
  );
}
