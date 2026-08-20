// Shown instantly on navigation into /review while the server component loads
// its data, so the click feels immediate instead of frozen on the old page.
export default function ReviewLoading() {
  return (
    <main className="min-h-[100dvh] bg-canvas px-4 py-4 text-ink sm:px-8 sm:py-6">
      <div className="mx-auto max-w-6xl animate-pulse">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div className="h-8 w-32 rounded-control bg-line" />
          <div className="flex gap-2">
            <div className="size-9 rounded-control bg-line" />
            <div className="size-9 rounded-control bg-line" />
          </div>
        </div>
        <div className="py-10 sm:py-14">
          <div className="h-3 w-28 rounded bg-line" />
          <div className="mt-4 h-10 w-3/4 rounded-control bg-line" />
        </div>
        <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="h-64 rounded-card border border-line bg-[#f8faf7]" />
          <div className="min-h-[420px] rounded-card border border-line bg-surface p-8">
            <div className="h-12 rounded-control bg-[#f0f3ef]" />
            <div className="mt-8 space-y-4">
              <div className="h-24 rounded-control bg-[#f2f5f1]" />
              <div className="h-24 rounded-control bg-[#f2f5f1]" />
              <div className="h-24 rounded-control bg-[#f2f5f1]" />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
