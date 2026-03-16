import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="page-container">
      <Skeleton variant="text" className="h-8 w-48 mb-6" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Skeleton variant="stat" className="h-24" />
        <Skeleton variant="stat" className="h-24" />
        <Skeleton variant="stat" className="h-24" />
        <Skeleton variant="stat" className="h-24" />
      </div>
      <Skeleton variant="text" className="h-6 w-32 mb-4" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton variant="card" className="h-40" />
        <Skeleton variant="card" className="h-40" />
      </div>
    </div>
  );
}
