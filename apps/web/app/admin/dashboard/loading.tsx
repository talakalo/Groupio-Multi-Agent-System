export default function AdminDashboardLoading() {
  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-pulse">
      <div>
        <div className="h-8 w-64 bg-gray-200 rounded-lg" />
        <div className="h-4 w-96 mt-2 bg-gray-100 rounded" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-6 h-40 bg-gray-50" />
        <div className="card p-6 h-40 bg-gray-50" />
      </div>
    </div>
  );
}
