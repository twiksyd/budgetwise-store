import { Skeleton } from "@/components/ui/skeleton";
import { OrderingProgress } from "@/components/ordering/ordering-progress";

// Shown the moment checkout hands off, while the slip is read: the same
// layout as the page, so nothing jumps when it arrives.
export default function OrderSlipLoading() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-5 sm:py-12">
      <OrderingProgress currentStep={4} compact />

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="surface-premium flex flex-col gap-4 rounded-xl p-6 sm:p-7">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-64 max-w-full" />
          <Skeleton className="h-4 w-full max-w-md" />
          <Skeleton className="mt-2 h-12 w-full rounded-xl" />
        </div>
        <div className="surface-premium flex flex-col gap-3 rounded-xl p-6">
          <Skeleton className="h-4 w-24" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 rounded-lg" />
          ))}
          <Skeleton className="mt-2 h-6 w-28 self-end" />
        </div>
      </div>
    </div>
  );
}
