import { NextResponse } from "next/server";
import {
  createOrderSchema,
  MAX_DISTINCT_ORDER_ITEMS,
  MAX_QUANTITY_PER_PRODUCT,
} from "@/lib/validations/order";
import { createOrder, OrderCreationError } from "@/lib/queries/orders";

// A legitimate checkout payload is small: 20 UUID line items plus contact
// details is roughly 1.5-2 KB. 16 KB leaves room for normal JSON formatting
// without allowing arbitrary request bodies to be buffered in memory.
export const ORDER_REQUEST_BODY_LIMIT_BYTES = 16 * 1024;

type PublicOrderErrorCode =
  | "UNSUPPORTED_CONTENT_TYPE"
  | "REQUEST_TOO_LARGE"
  | "MALFORMED_JSON"
  | "INVALID_ORDER"
  | "STORE_UNAVAILABLE"
  | "UNAVAILABLE_ITEMS"
  | "IDEMPOTENCY_CONFLICT"
  | "ORDER_CREATE_FAILED";

class RequestBodyTooLargeError extends Error {}

function isJsonContentType(value: string | null) {
  if (!value) return false;
  const [mediaType] = value.split(";", 1);
  return mediaType.trim().toLowerCase() === "application/json";
}

async function readBoundedRequestBody(request: Request) {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const parsedLength = Number(contentLength);
    if (
      Number.isFinite(parsedLength) &&
      parsedLength > ORDER_REQUEST_BODY_LIMIT_BYTES
    ) {
      throw new RequestBodyTooLargeError();
    }
  }

  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    receivedBytes += value.byteLength;
    if (receivedBytes > ORDER_REQUEST_BODY_LIMIT_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new RequestBodyTooLargeError();
    }

    chunks.push(value);
  }

  const bytes = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(bytes);
}

function orderError(
  code: PublicOrderErrorCode,
  message: string,
  status: number,
  requestId: string,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json(
    {
      code,
      error: message,
      requestId,
      ...extra,
    },
    {
      status,
      headers: { "X-Request-Id": requestId },
    },
  );
}

function validationMessage(
  issues: Array<{ code: string; path: unknown[]; message: string }>,
) {
  const firstIssue = issues[0];
  const firstPath = firstIssue?.path.map(String).join(".") ?? "";

  if (firstIssue?.code === "unrecognized_keys") {
    return "This order request includes unsupported fields. Please refresh and try again.";
  }

  if (firstPath.startsWith("contact.robloxUsername")) {
    return firstIssue.message;
  }

  if (firstPath.startsWith("contact.name")) {
    return "Enter the Facebook name you will use to message us.";
  }

  if (firstPath.startsWith("viaPlus")) {
    return firstIssue.message;
  }

  // Missing or malformed checkout credentials mean the page predates this
  // build (a tab left open across a deploy), not anything the customer got
  // wrong — a reload hands them a working checkout.
  if (
    firstPath.startsWith("idempotencyKey") ||
    firstPath.startsWith("viewToken")
  ) {
    return "Please refresh the page and try again.";
  }

  if (firstPath.startsWith("items")) {
    if (firstIssue?.code === "invalid_type") {
      return "Please review your cart and try again.";
    }

    // A single cart line already over the per-product cap (e.g. a cart
    // persisted from before this limit existed, or before it was lowered)
    // fails the schema's own per-item constraint before the friendlier
    // grouped-quantity check further down ever runs. That raw Zod message
    // ("Too big: expected number to be <=50") is not customer-facing text.
    if (firstPath.endsWith(".quantity")) {
      return `One or more items in your cart exceed the maximum of ${MAX_QUANTITY_PER_PRODUCT} per product. Please reduce the quantity in your cart before continuing.`;
    }

    // Same idea for a cart holding more distinct products than currently
    // allowed — the array's own min/max constraint also produces a raw
    // Zod message ahead of any custom check.
    if (
      firstPath === "items" &&
      (firstIssue?.code === "too_big" || firstIssue?.code === "too_small")
    ) {
      return `Your cart has too many different products. Please remove some — the maximum is ${MAX_DISTINCT_ORDER_ITEMS} per order.`;
    }

    return firstIssue?.message || "Please review your cart and try again.";
  }

  return "Please review your order details and try again.";
}

function logUnexpectedOrderError(requestId: string, error: unknown) {
  const details =
    error instanceof Error
      ? {
          name: error.name,
          message: error.message,
          cause: error.cause,
        }
      : error && typeof error === "object"
        ? {
            ...("code" in error ? { code: error.code } : {}),
            ...("message" in error ? { message: error.message } : {}),
            ...("details" in error ? { details: error.details } : {}),
            ...("hint" in error ? { hint: error.hint } : {}),
          }
        : { message: String(error) };

  console.error("Failed to create order", { requestId, error: details });
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  if (!isJsonContentType(request.headers.get("content-type"))) {
    return orderError(
      "UNSUPPORTED_CONTENT_TYPE",
      "Order requests must be sent as JSON. Please refresh and try again.",
      415,
      requestId,
    );
  }

  let json: unknown;
  try {
    const rawBody = await readBoundedRequestBody(request);
    json = JSON.parse(rawBody);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return orderError(
        "REQUEST_TOO_LARGE",
        "This order request is too large. Please reduce the number of items and try again.",
        413,
        requestId,
      );
    }

    return orderError(
      "MALFORMED_JSON",
      "This order request could not be read. Please refresh and try again.",
      400,
      requestId,
    );
  }

  const parsed = createOrderSchema.safeParse(json);

  if (!parsed.success) {
    // The customer only ever sees validationMessage()'s friendly text; the
    // raw schema issues (e.g. "Too big: expected number to be <=50") are
    // kept here for debugging.
    console.warn("Order request failed validation", {
      requestId,
      issues: parsed.error.issues,
    });
    return orderError(
      "INVALID_ORDER",
      validationMessage(parsed.error.issues),
      400,
      requestId,
    );
  }

  try {
    const { orderNumber } = await createOrder(parsed.data);
    return NextResponse.json(
      { orderNumber, requestId },
      { status: 201, headers: { "X-Request-Id": requestId } },
    );
  } catch (error) {
    if (error instanceof OrderCreationError) {
      if (error.reason === "invalid_order") {
        return orderError(
          "INVALID_ORDER",
          error.message,
          400,
          requestId,
          { reason: error.reason },
        );
      }

      // Same idempotency key, different order contents: returning the
      // earlier order would show the customer someone else's cart.
      if (error.reason === "idempotency_conflict") {
        return orderError(
          "IDEMPOTENCY_CONFLICT",
          error.message,
          409,
          requestId,
          { reason: error.reason },
        );
      }

      return orderError(
        error.reason === "store_unavailable"
          ? "STORE_UNAVAILABLE"
          : "UNAVAILABLE_ITEMS",
        error.message,
        error.reason === "store_unavailable" ? 403 : 409,
        requestId,
        {
          reason: error.reason,
          unavailableGamepassIds: error.unavailableGamepassIds,
        },
      );
    }

    logUnexpectedOrderError(requestId, error);
    return orderError(
      "ORDER_CREATE_FAILED",
      "Something went wrong creating your order. Please try again.",
      500,
      requestId,
    );
  }
}
