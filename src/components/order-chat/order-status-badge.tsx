import { Badge } from "@/components/ui/badge";

const STATUS_LABELS: Record<string, string> = {
  pending: "Under review",
  processing: "Processing",
  paid: "Paid",
  delivered: "Delivered",
  completed: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export function formatOrderStatus(status: string) {
  return (
    STATUS_LABELS[status.toLowerCase()] ??
    status.charAt(0).toUpperCase() + status.slice(1)
  );
}

export function OrderStatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const variant =
    normalized === "delivered" || normalized === "completed"
      ? "default"
      : normalized === "cancelled" || normalized === "refunded"
        ? "destructive"
        : "secondary";

  return <Badge variant={variant}>{formatOrderStatus(status)}</Badge>;
}
