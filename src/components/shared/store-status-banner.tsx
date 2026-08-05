import { Construction, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  STORE_STATUS_DEFAULT_MESSAGES,
  type StoreStatus,
} from "@/types/store-operations";

const config: Record<
  Exclude<StoreStatus, "open">,
  {
    icon: typeof Construction;
    title: string;
    className: string;
    iconClassName: string;
  }
> = {
  maintenance: {
    icon: Construction,
    title: "Ordering paused for maintenance",
    className: "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    iconClassName: "text-amber-600 dark:text-amber-400",
  },
  closed: {
    icon: Lock,
    title: "BudgetWise is temporarily closed",
    className: "border-destructive/25 bg-destructive/10 text-destructive",
    iconClassName: "text-destructive",
  },
};

export function StoreStatusBanner({
  status,
  noticeMessage,
}: {
  status: StoreStatus;
  noticeMessage: string | null;
}) {
  if (status === "open") return null;

  const { icon: Icon, title, className, iconClassName } = config[status];
  const message = noticeMessage?.trim() || STORE_STATUS_DEFAULT_MESSAGES[status];

  return (
    <div className={cn("border-b px-6 py-3", className)}>
      <div className="mx-auto flex max-w-6xl items-start gap-2.5 text-sm">
        <Icon className={cn("mt-0.5 size-4 shrink-0", iconClassName)} />
        <p className="leading-snug">
          <span className="font-semibold">{title}.</span>{" "}
          <span className="opacity-90">{message}</span>
        </p>
      </div>
    </div>
  );
}
