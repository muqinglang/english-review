// Instant skeleton while the capture page loads its knowledge-space list.
export default function CaptureLoading() {
  return (
    <main className="min-h-[100dvh] bg-canvas px-4 py-4 text-ink sm:px-8 sm:py-6">
      <div className="mx-auto max-w-4xl animate-pulse">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div className="h-8 w-32 rounded-control bg-line" />
          <div className="h-8 w-28 rounded-control bg-line" />
        </div>
        <div className="mt-10 sm:mt-12">
          <div className="h-3 w-24 rounded bg-line" />
          <div className="mt-3 h-12 w-64 rounded-control bg-line" />
        </div>
        <div className="mt-8 h-96 rounded-card border border-line bg-surface" />
      </div>
    </main>
  );
}
