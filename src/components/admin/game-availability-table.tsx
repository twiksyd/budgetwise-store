"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusSelect } from "@/components/admin/status-select";
import { updateGameAvailabilityAction } from "@/app/admin/(protected)/store-operations/actions";
import { GAME_AVAILABILITY_LABELS } from "@/types/store-operations";
import type { AdminGame } from "@/lib/queries/admin-catalog";
import type { GameAvailabilityStatus } from "@/types/store-operations";

const GAME_STATUSES: GameAvailabilityStatus[] = [
  "available",
  "temporarily_unavailable",
  "coming_soon",
  "hidden",
];

export function GameAvailabilityTable({ games }: { games: AdminGame[] }) {
  const [statuses, setStatuses] = useState(
    () => new Map(games.map((g) => [g.id, g.availabilityStatus])),
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleChange(gameId: string, status: GameAvailabilityStatus) {
    const previous = statuses.get(gameId)!;
    setStatuses((prev) => new Map(prev).set(gameId, status));
    setPendingId(gameId);

    startTransition(async () => {
      const result = await updateGameAvailabilityAction(gameId, status);
      setPendingId(null);
      if (result.success) {
        toast.success("Game availability updated.");
      } else {
        setStatuses((prev) => new Map(prev).set(gameId, previous));
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Game</TableHead>
          <TableHead>Category</TableHead>
          <TableHead className="text-right">Availability</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {games.map((game) => (
          <TableRow key={game.id}>
            <TableCell className="font-medium">{game.name}</TableCell>
            <TableCell className="text-muted-foreground">
              {game.category ?? "—"}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end">
                <StatusSelect
                  value={statuses.get(game.id)!}
                  options={GAME_STATUSES}
                  labels={GAME_AVAILABILITY_LABELS}
                  onChange={(status) => handleChange(game.id, status)}
                  disabled={pendingId === game.id}
                />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
