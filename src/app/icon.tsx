import { readFileSync } from "fs";
import { join } from "path";
import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  const logo = readFileSync(join(process.cwd(), "public/icons/bw-logo.png"));
  const dataUri = `data:image/png;base64,${logo.toString("base64")}`;

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
          width={size.width}
          height={Math.round((size.width * 350) / 541)}
          style={{ objectFit: "contain" }}
        />
      </div>
    ),
    { ...size },
  );
}
