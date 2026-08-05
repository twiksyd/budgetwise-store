import { NextResponse } from "next/server";
import { createOrderSchema } from "@/lib/validations/order";
import { createOrder, OrderCreationError } from "@/lib/queries/orders";

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = createOrderSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid order payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const { orderNumber } = await createOrder(parsed.data);
    return NextResponse.json({ orderNumber }, { status: 201 });
  } catch (error) {
    if (error instanceof OrderCreationError) {
      return NextResponse.json(
        {
          error: error.message,
          unavailableGamepassIds: error.unavailableGamepassIds,
        },
        { status: 409 },
      );
    }

    console.error("Failed to create order", error);
    return NextResponse.json(
      { error: "Something went wrong creating your order." },
      { status: 500 },
    );
  }
}
