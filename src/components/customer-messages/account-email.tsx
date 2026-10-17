"use client";

import { useCustomerMessages } from "@/components/customer-messages/customer-messages-provider";

/** " · you@example.com" once the signed-in account is known (My Orders subtitle). */
export function AccountEmail() {
  const email = useCustomerMessages()?.email;
  return email ? <> · {email}</> : null;
}
