import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="page-container">
      <Skeleton variant="text" className="h-8 w-48 mb-6" />
      <Skeleton variant="card" className="h-[calc(100vh-12rem)] min-h-96" />
    </div>
  );
}
