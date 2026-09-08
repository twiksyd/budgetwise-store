import Image from "next/image";
import { cn } from "@/lib/utils";
import { siteConfig } from "@/config/site";

// Full supplied wordmark; the image now carries the accessible brand name.
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex h-12 shrink-0",
        className,
      )}
      style={{ aspectRatio: `${siteConfig.logo.width} / ${siteConfig.logo.height}` }}
    >
      <Image
        src={siteConfig.logo.src}
        alt={siteConfig.name}
        fill
        sizes="(min-width: 640px) 160px, 140px"
        quality={90}
        className="object-contain"
        priority
      />
    </span>
  );
}
