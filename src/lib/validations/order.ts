import { z } from "zod";

export const MAX_DISTINCT_ORDER_ITEMS = 20;
export const MAX_QUANTITY_PER_PRODUCT = 50;
export const MAX_TOTAL_ORDER_UNITS =
  MAX_DISTINCT_ORDER_ITEMS * MAX_QUANTITY_PER_PRODUCT;

const ROBLOX_USERNAME_RE = /^(?=.{3,20}$)[A-Za-z0-9]+(?:_[A-Za-z0-9]+)?$/;

const orderItemSchema = z
  .object({
    gamepassId: z.string().uuid(),
    quantity: z.number().int().positive().max(MAX_QUANTITY_PER_PRODUCT),
  })
  .strict();

const contactSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    robloxUsername: z.string().superRefine((value, context) => {
      if (value.length === 0) {
        context.addIssue({
          code: "custom",
          message: "Enter your Roblox username.",
        });
        return;
      }

      if (value !== value.trim()) {
        context.addIssue({
          code: "custom",
          message:
            "Roblox username cannot start or end with spaces.",
        });
        return;
      }

      if (!ROBLOX_USERNAME_RE.test(value)) {
        context.addIssue({
          code: "custom",
          message:
            "Roblox username must be 3-20 letters or numbers, with at most one underscore not at the start or end.",
        });
      }
    }),
  })
  .strict();

export const createOrderSchema = z.object({
  items: z
    .array(orderItemSchema)
    .min(1)
    .max(MAX_DISTINCT_ORDER_ITEMS),
  contact: contactSchema,
})
  .strict()
  .superRefine((value, context) => {
    const quantityByGamepassId = new Map<string, number>();

    for (const item of value.items) {
      quantityByGamepassId.set(
        item.gamepassId,
        (quantityByGamepassId.get(item.gamepassId) ?? 0) + item.quantity,
      );
    }

    let totalUnits = 0;
    for (const quantity of quantityByGamepassId.values()) {
      totalUnits += quantity;
      if (quantity > MAX_QUANTITY_PER_PRODUCT) {
        context.addIssue({
          code: "custom",
          path: ["items"],
          message: `Each product can have at most ${MAX_QUANTITY_PER_PRODUCT} units.`,
        });
      }
    }

    if (quantityByGamepassId.size > MAX_DISTINCT_ORDER_ITEMS) {
      context.addIssue({
        code: "custom",
        path: ["items"],
        message: `Orders can include at most ${MAX_DISTINCT_ORDER_ITEMS} different products.`,
      });
    }

    if (totalUnits > MAX_TOTAL_ORDER_UNITS) {
      context.addIssue({
        code: "custom",
        path: ["items"],
        message: `Orders can include at most ${MAX_TOTAL_ORDER_UNITS} total units.`,
      });
    }
  })
  .transform((value) => {
    const quantityByGamepassId = new Map<string, number>();

    for (const item of value.items) {
      quantityByGamepassId.set(
        item.gamepassId,
        (quantityByGamepassId.get(item.gamepassId) ?? 0) + item.quantity,
      );
    }

    return {
      contact: value.contact,
      items: [...quantityByGamepassId.entries()].map(
        ([gamepassId, quantity]) => ({
          gamepassId,
          quantity,
        }),
      ),
    };
  });

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
