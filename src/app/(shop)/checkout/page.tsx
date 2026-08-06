import { Construction, Lock } from "lucide-react";
import { CheckoutClient } from "@/components/checkout/checkout-client";
import { EmptyState } from "@/components/shared/empty-state";
import { resolveStoreStatusSafe } from "@/lib/store-status";
import { STORE_STATUS_DEFAULT_MESSAGES } from "@/types/store-operations";

export default async function CheckoutPage() {
  const { status, noticeMessage } = await resolveStoreStatusSafe();

  if (status !== "open") {
    return (
      <div className="mx-auto max-w-lg px-6 py-20 sm:py-28">
        <EmptyState
          icon={status === "maintenance" ? Construction : Lock}
          title={
            status === "maintenance"
              ? "Paused po muna ang ordering"
              : "Temporarily closed po ang BudgetWise"
          }
          description={noticeMessage?.trim() || STORE_STATUS_DEFAULT_MESSAGES[status]}
          action={{ label: "Bumalik sa Cart", href: "/cart" }}
        />
      </div>
    );
  }

  return <CheckoutClient />;
}
