"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-4">
      <h2 className="text-xl font-semibold">שגיאה בלתי צפויה</h2>
      <p className="text-muted-foreground max-w-md">
        {error.message || "משהו השתבש. נסה שוב."}
      </p>
      <button
        onClick={reset}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
      >
        נסה שוב
      </button>
    </div>
  );
}
