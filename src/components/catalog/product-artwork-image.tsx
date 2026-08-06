"use client";

import { useState } from "react";
import { Gamepad2 } from "lucide-react";

export function ProductArtworkImage({
  src,
  alt = "",
}: {
  src?: string | null;
  alt?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <Gamepad2 className="text-muted-foreground absolute inset-0 m-auto size-7 opacity-70" />
    );
  }

  return (
    // Product artwork can come from Roblox CDN, Store-owned storage, or a
    // validated admin URL, so use a normal image with an explicit fallback.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="absolute inset-0 h-full w-full object-contain"
    />
  );
}
