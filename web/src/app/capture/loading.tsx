// Instant skeleton while the capture page loads its knowledge-space list.
export default function CaptureLoading() {
  return (
    <main className="min-h-screen bg-[#f7f7f2] px-5 py-8 text-[#172223] sm:px-10">
      <div className="mx-auto max-w-4xl animate-pulse">
        <div className="flex items-center justify-between gap-4">
          <div className="h-5 w-28 rounded bg-[#e7e7e0]" />
          <div className="h-8 w-32 rounded-lg bg-[#e7e7e0]" />
        </div>
        <div className="mt-12">
          <div className="h-3 w-24 rounded bg-[#e7e7e0]" />
          <div className="mt-3 h-12 w-64 rounded-lg bg-[#e7e7e0]" />
        </div>
        <div className="mt-8 h-96 rounded-2xl border border-[#e2e2d8] bg-white" />
      </div>
    </main>
  );
}
