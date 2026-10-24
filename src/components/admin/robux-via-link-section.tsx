"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { updateRobuxViaLinkEnabledAction } from "@/app/admin/(protected)/store-operations/actions";

// "Robux (Via Link)" isn't a `games` row (see config/robux-via-link.ts), so
// it has no entry in Game Availability below — this is its on/off switch.
export function RobuxViaLinkSection({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, startTransition] = useTransition();

  function handleChange(next: boolean) {
    setEnabled(next);
    startTransition(async () => {
      const result = await updateRobuxViaLinkEnabledAction(next);
      if (result.success) {
        toast.success(next ? "Robux Via Link is back on." : "Robux Via Link is turned off.");
      } else {
        setEnabled(!next);
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Robux Via Link</CardTitle>
        <CardDescription>
          The merged Covered Tax / Tax Not Covered Robux option.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="robux-via-link-enabled">Show on storefront</Label>
          <p className="text-muted-foreground text-xs leading-relaxed">
            {enabled
              ? "Customers can see and order Robux Via Link."
              : "Hidden from the catalog, its page redirects to the catalog, and checkout rejects Via Link items already in carts. Robux Via Plus is unaffected."}
          </p>
        </div>
        <Switch
          id="robux-via-link-enabled"
          checked={enabled}
          onCheckedChange={handleChange}
          disabled={isPending}
        />
      </CardContent>
    </Card>
  );
}
