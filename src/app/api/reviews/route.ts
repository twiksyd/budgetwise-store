import { NextResponse } from "next/server";
import { reviews } from "@/config/reviews";

export const revalidate = 3600;

export function GET() {
  return NextResponse.json(
    { reviews },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
