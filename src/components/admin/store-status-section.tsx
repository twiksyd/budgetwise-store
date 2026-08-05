"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { StatusSelect } from "@/components/admin/status-select";
import { updateStoreStatusAction } from "@/app/admin/(protected)/store-operations/actions";
import { STORE_STATUS_LABELS, type StoreStatus } from "@/types/store-operations";

const STORE_STATUSES: StoreStatus[] = ["open", "maintenance", "closed"];

const STATUS_HINTS: Record<StoreStatus, string> = {
  open: "Customers can browse, add to cart, checkout, and create orders.",
  maintenance:
    "Customers can browse normally. Add to Cart, checkout, and order creation are disabled sitewide.",
  closed:
    "Customers can still browse games and prices. Cart, checkout, and order creation are disabled sitewide.",
};

export function StoreStatusSection({
  initialStatus,
  initialNotice,
}: {
  initialStatus: StoreStatus;
  initialNotice: string | null;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [notice, setNotice] = useState(initialNotice ?? "");
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const result = await updateStoreStatusAction(status, notice);
      if (result.success) {
        toast.success("Store status updated.");
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Store Status</CardTitle>
        <CardDescription>
          Controls ordering across the entire storefront.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label>Status</Label>
          <StatusSelect
            value={status}
            options={STORE_STATUSES}
            labels={STORE_STATUS_LABELS}
            onChange={setStatus}
            disabled={isPending}
          />
          <p className="text-muted-foreground text-xs leading-relaxed">
            {STATUS_HINTS[status]}
          </p>
        </div>

        {status !== "open" && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="notice-message">
              Customer notice (shown sitewide while not Open)
            </Label>
            <Textarea
              id="notice-message"
              value={notice}
              onChange={(e) => setNotice(e.target.value)}
              placeholder="e.g. Supplier is currently restocking. Orders will reopen tonight at 8:00 PM."
              rows={3}
            />
            <p className="text-muted-foreground text-xs">
              Leave blank to show the default message for this status.
            </p>
          </div>
        )}

        <div>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving..." : "Save status"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
