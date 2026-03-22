import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="page-container max-w-lg mx-auto">
      <Skeleton variant="text" className="h-8 w-48 mb-6" />
      <Skeleton variant="text" className="h-4 w-full mb-4" />
      <Skeleton variant="card" className="h-12 mb-6" />
      <Skeleton variant="card" className="h-12" />
    </div>
  );
}
