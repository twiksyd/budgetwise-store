import { Construction, Lock } from "lucide-react";
import { CheckoutClient } from "@/components/checkout/checkout-client";
import { EmptyState } from "@/components/shared/empty-state";
import { getCustomerUser, requireCustomer } from "@/lib/auth/customer";
import { siteConfig } from "@/config/site";
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

  // Messenger hand-off: no sign-in. The order continues on Messenger and the
  // order-slip page opens with the attempt's viewing token. Only the on-site
  // chat needs an account to come back to.
  const customer =
    siteConfig.orderHandoff.channel === "site"
      ? await requireCustomer("/checkout")
      : await getCustomerUser();

  return <CheckoutClient defaultName={customer?.name ?? ""} />;
}
