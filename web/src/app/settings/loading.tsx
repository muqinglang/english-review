// Instant skeleton while the Settings server component loads its status queries.
export default function SettingsLoading() {
  return (
    <main className="min-h-screen bg-[#f4f6f3] px-4 py-5 text-[#172223] sm:px-10 sm:py-8">
      <div className="mx-auto max-w-4xl animate-pulse">
        <div className="flex items-center justify-between">
          <div className="h-5 w-28 rounded bg-[#e4e9e3]" />
          <div className="h-8 w-28 rounded-lg bg-[#e4e9e3]" />
        </div>
        <div className="mt-12">
          <div className="h-3 w-24 rounded bg-[#e4e9e3]" />
          <div className="mt-3 h-12 w-48 rounded-lg bg-[#e4e9e3]" />
        </div>
        <div className="mt-8 space-y-6">
          <div className="h-28 rounded-2xl border border-[#dce4dc] bg-white" />
          <div className="h-40 rounded-2xl border border-[#dce4dc] bg-white" />
          <div className="h-56 rounded-2xl border border-[#dce4dc] bg-white" />
        </div>
      </div>
    </main>
  );
}
