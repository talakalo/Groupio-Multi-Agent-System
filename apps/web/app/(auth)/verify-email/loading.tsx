import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <Skeleton variant="text" className="h-10 w-56 mx-auto" />
        <Skeleton variant="text" className="h-4 w-full" />
        <Skeleton variant="card" className="h-12" />
      </div>
    </div>
  );
}
