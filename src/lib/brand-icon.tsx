import { readFileSync } from "fs";
import { join } from "path";
import { ImageResponse } from "next/og";

// Shared by every generated icon (favicon sizes, apple-touch-icon, PWA
// manifest icons) — all built from the same official banner asset,
// contained (never cropped/stretched) on a background matched to its own
// dark backdrop so nothing needs to assume transparency support.
const dataUri = (() => {
  const file = readFileSync(
    join(process.cwd(), "public/icons/NOBGbanner.png"),
  );
  return `data:image/png;base64,${file.toString("base64")}`;
})();

export function renderBrandIcon(size: number, fillRatio = 0.82) {
  const inner = Math.round(size * fillRatio);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b0614",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={dataUri}
          alt=""
          width={inner}
          height={inner}
          style={{ objectFit: "contain" }}
        />
      </div>
    ),
    { width: size, height: size },
  );
}
