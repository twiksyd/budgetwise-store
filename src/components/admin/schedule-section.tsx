"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusSelect } from "@/components/admin/status-select";
import { scheduleStoreChangeAction } from "@/app/admin/(protected)/store-operations/actions";
import { STORE_STATUS_LABELS, type StoreStatus } from "@/types/store-operations";

const SCHEDULABLE_STATUSES: StoreStatus[] = ["maintenance", "closed"];

// <input type="datetime-local"> works in local time with no timezone
// suffix — Date -> that format, and back, both need to go through the
// browser's own local-time interpretation rather than toISOString (which
// is UTC and would silently shift the displayed time).
function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInputValue(value: string): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

export function ScheduleSection({
  initialScheduledStatus,
  initialScheduledAt,
  initialScheduledReopenAt,
}: {
  initialScheduledStatus: StoreStatus | null;
  initialScheduledAt: string | null;
  initialScheduledReopenAt: string | null;
}) {
  const [scheduledStatus, setScheduledStatus] = useState<StoreStatus>(
    initialScheduledStatus ?? "closed",
  );
  const [scheduledAt, setScheduledAt] = useState(
    toLocalInputValue(initialScheduledAt),
  );
  const [scheduledReopenAt, setScheduledReopenAt] = useState(
    toLocalInputValue(initialScheduledReopenAt),
  );
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const result = await scheduleStoreChangeAction({
        scheduledStatus: scheduledAt ? scheduledStatus : null,
        scheduledAt: fromLocalInputValue(scheduledAt),
        scheduledReopenAt: fromLocalInputValue(scheduledReopenAt),
      });
      if (result.success) {
        toast.success("Schedule saved.");
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  function handleClear() {
    setScheduledAt("");
    setScheduledReopenAt("");
    startTransition(async () => {
      const result = await scheduleStoreChangeAction({
        scheduledStatus: null,
        scheduledAt: null,
        scheduledReopenAt: null,
      });
      if (result.success) {
        toast.success("Schedule cleared.");
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Automatic Scheduling</CardTitle>
        <CardDescription>
          Applied automatically the next time the site is visited on or
          after the scheduled time — no manual step needed.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label>Switch store to</Label>
            <StatusSelect
              value={scheduledStatus}
              options={SCHEDULABLE_STATUSES}
              labels={STORE_STATUS_LABELS}
              onChange={setScheduledStatus}
              disabled={isPending}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="scheduled-at">At</Label>
            <Input
              id="scheduled-at"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              disabled={isPending}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="scheduled-reopen-at">
            Reopen automatically at (optional)
          </Label>
          <Input
            id="scheduled-reopen-at"
            type="datetime-local"
            value={scheduledReopenAt}
            onChange={(e) => setScheduledReopenAt(e.target.value)}
            disabled={isPending}
            className="sm:w-64"
          />
        </div>

        <div className="flex gap-3">
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving..." : "Save schedule"}
          </Button>
          <Button
            variant="outline"
            onClick={handleClear}
            disabled={isPending}
          >
            Clear schedule
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
