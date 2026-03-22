import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="page-container">
      <Skeleton variant="text" className="h-4 w-48 mb-4" />
      <div className="flex flex-col lg:flex-row gap-8">
        <div className="flex-1">
          <Skeleton variant="text" className="h-8 w-3/4 mb-4" />
          <Skeleton variant="text" className="h-4 w-full mb-2" />
          <Skeleton variant="text" className="h-4 w-2/3 mb-8" />
          <Skeleton variant="card" className="h-64" />
        </div>
        <div className="lg:w-80">
          <Skeleton variant="card" className="h-48 mb-4" />
          <Skeleton variant="card" className="h-32" />
        </div>
      </div>
    </div>
  );
}
