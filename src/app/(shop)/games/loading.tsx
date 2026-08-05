import { Skeleton } from "@/components/ui/skeleton";

export default function GamesLoading() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10 sm:py-16">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="mt-2 h-5 w-80" />

      <div className="mt-6 flex flex-wrap gap-4">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-24" />
      </div>

      <Skeleton className="mt-4 h-5 w-32" />
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Skeleton className="aspect-[4/3] rounded-2xl" />
        <Skeleton className="aspect-[4/3] rounded-2xl" />
      </div>

      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-11 w-full rounded-full sm:max-w-xs" />
        <div className="flex gap-2">
          <Skeleton className="h-11 w-14 rounded-full sm:h-8" />
          <Skeleton className="h-11 w-20 rounded-full sm:h-8" />
          <Skeleton className="h-11 w-16 rounded-full sm:h-8" />
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="aspect-square rounded-2xl" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
