import { Skeleton } from "@/components/ui/skeleton";

// Mirrors the real page: slim step strip, heading, search + chips, grid.
export default function GamesLoading() {
  return (
    <div className="mx-auto max-w-6xl px-6 pt-4 pb-12 sm:pt-10 sm:pb-16">
      <Skeleton className="h-3 w-40" />
      <Skeleton className="mt-2 h-1 w-full rounded-full sm:max-w-sm" />
      <Skeleton className="mt-4 h-8 w-44 sm:mt-6 sm:h-10" />

      <div className="mt-4 flex flex-col gap-2.5 sm:mt-5 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-11 w-full rounded-lg sm:max-w-xs" />
        <div className="flex gap-1.5">
          <Skeleton className="h-9 w-14 rounded-lg" />
          <Skeleton className="h-9 w-20 rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-16 rounded-lg" />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:mt-8 sm:grid-cols-3 sm:gap-5 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="aspect-square rounded-xl" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
