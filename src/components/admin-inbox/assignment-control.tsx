"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useInbox } from "@/components/admin-inbox/inbox-provider";
import { fetchJson, jsonInit, RequestError } from "@/lib/chat/client/fetch-json";
import { cn } from "@/lib/utils";

const UNASSIGNED = "__unassigned__";

/** Assign to any admin from the trusted directory; the server records who did it. */
export function AssignmentControl({
  orderNumber,
  assignedAdminId,
  className,
}: {
  orderNumber: string;
  assignedAdminId: string | null;
  className?: string;
}) {
  const { me, directoryList, dispatch, activeRef } = useInbox();
  const [saving, setSaving] = useState(false);

  async function assign(value: string) {
    const assigneeId = value === UNASSIGNED ? null : value;
    if (assigneeId === assignedAdminId) return;
    setSaving(true);
    try {
      const { assignment } = await fetchJson<{
        assignment: { order_number: string; assigned_admin_id: string | null; assigned_at: string | null };
      }>(`/api/admin/orders/${encodeURIComponent(orderNumber)}/assign`, jsonInit("POST", { assigneeId }));
      // Everyone else gets the realtime event; apply ours immediately.
      dispatch({
        type: "conversation_event",
        event: {
          conversation_id: "",
          order_number: assignment.order_number,
          assigned_admin_id: assignment.assigned_admin_id,
          assigned_by: me,
          assigned_at: assignment.assigned_at,
          customer_read_at: null,
          customer_read_message_id: null,
          admin_read_at: null,
          admin_read_message_id: null,
        },
        activeOrderNumber: activeRef.current.orderNumber,
      });
    } catch (error) {
      toast.error(error instanceof RequestError ? error.message : "Could not assign.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <label className={cn("flex items-center gap-2", className)}>
      <span className="sr-only">Assigned to</span>
      <select
        value={assignedAdminId ?? UNASSIGNED}
        disabled={saving}
        onChange={(event) => void assign(event.target.value)}
        className="border-input bg-background h-9 max-w-[11rem] rounded-lg border px-2 text-xs font-semibold"
      >
        <option value={UNASSIGNED}>Unassigned</option>
        {directoryList.map((admin) => (
          <option key={admin.userId} value={admin.userId}>
            {admin.userId === me ? `${admin.displayName} (me)` : admin.displayName}
          </option>
        ))}
      </select>
    </label>
  );
}
