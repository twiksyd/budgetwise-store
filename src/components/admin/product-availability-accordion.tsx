"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusSelect } from "@/components/admin/status-select";
import { updateProductAvailabilityAction } from "@/app/admin/(protected)/store-operations/actions";
import { PRODUCT_AVAILABILITY_LABELS } from "@/types/store-operations";
import type { AdminGame, AdminGamepass } from "@/lib/queries/admin-catalog";
import type { ProductAvailabilityStatus } from "@/types/store-operations";

const PRODUCT_STATUSES: ProductAvailabilityStatus[] = [
  "available",
  "out_of_stock",
  "coming_soon",
  "hidden",
];

export function ProductAvailabilityAccordion({
  games,
  gamepasses,
}: {
  games: AdminGame[];
  gamepasses: AdminGamepass[];
}) {
  const [statuses, setStatuses] = useState(
    () => new Map(gamepasses.map((g) => [g.id, g.availabilityStatus])),
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleChange(
    gamepassId: string,
    status: ProductAvailabilityStatus,
  ) {
    const previous = statuses.get(gamepassId)!;
    setStatuses((prev) => new Map(prev).set(gamepassId, status));
    setPendingId(gamepassId);

    startTransition(async () => {
      const result = await updateProductAvailabilityAction(
        gamepassId,
        status,
      );
      setPendingId(null);
      if (result.success) {
        toast.success("Product availability updated.");
      } else {
        setStatuses((prev) => new Map(prev).set(gamepassId, previous));
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  const gamepassesByGame = new Map<string, AdminGamepass[]>();
  for (const gamepass of gamepasses) {
    const bucket = gamepassesByGame.get(gamepass.gameId);
    if (bucket) bucket.push(gamepass);
    else gamepassesByGame.set(gamepass.gameId, [gamepass]);
  }

  const gamesWithProducts = games.filter((game) =>
    gamepassesByGame.has(game.id),
  );

  return (
    <Accordion type="single" collapsible>
      {gamesWithProducts.map((game) => {
        const products = gamepassesByGame.get(game.id)!;
        return (
          <AccordionItem key={game.id} value={game.id}>
            <AccordionTrigger className="text-sm font-semibold">
              {game.name}
              <span className="text-muted-foreground ml-2 font-normal">
                {products.length} product{products.length === 1 ? "" : "s"}
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Availability</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((gamepass) => (
                    <TableRow key={gamepass.id}>
                      <TableCell className="font-medium">
                        {gamepass.name}
                        {gamepass.displayName && (
                          <span className="text-muted-foreground ml-2 text-xs font-normal">
                            Original: {gamepass.canonicalName}
                          </span>
                        )}
                        {!gamepass.isActive && (
                          <span className="text-muted-foreground ml-2 text-xs">
                            (inactive in Dashboard)
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end">
                          <StatusSelect
                            value={statuses.get(gamepass.id)!}
                            options={PRODUCT_STATUSES}
                            labels={PRODUCT_AVAILABILITY_LABELS}
                            onChange={(status) =>
                              handleChange(gamepass.id, status)
                            }
                            disabled={pendingId === gamepass.id}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
