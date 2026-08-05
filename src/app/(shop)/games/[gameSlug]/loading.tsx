import { Skeleton } from "@/components/ui/skeleton";

export default function GameDetailLoading() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
      <Skeleton className="h-4 w-24" />

      <div className="mt-6 flex items-center gap-4">
        <Skeleton className="size-16 shrink-0 rounded-2xl" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-7 w-48" />
        </div>
      </div>

      <div className="mt-10 flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[76px] rounded-xl" />
        ))}
      </div>
    </div>
  );
}
