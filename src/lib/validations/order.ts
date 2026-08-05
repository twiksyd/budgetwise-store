import { z } from "zod";

export const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        gamepassId: z.string().uuid(),
        quantity: z.number().int().positive().max(50),
      }),
    )
    .min(1)
    .max(20),
  contact: z.object({
    name: z.string().trim().min(1).max(100),
    robloxUsername: z.string().trim().min(1).max(50),
  }),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
