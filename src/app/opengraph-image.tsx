import { readFileSync } from "fs";
import { join } from "path";
import { ImageResponse } from "next/og";
import { siteConfig } from "@/config/site";

export const alt = "BudgetWise - All about delivering value.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  const logo = readFileSync(join(process.cwd(), "public", siteConfig.logo.src));
  const dataUri = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#f7f4fc",
          borderTop: "10px solid #7535df",
          color: "#221630",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={dataUri}
          alt=""
          width={siteConfig.logo.width}
          height={siteConfig.logo.height}
          style={{ objectFit: "contain" }}
        />
        <div style={{ display: "flex", marginTop: 40, fontSize: 36, color: "#675376" }}>
          {siteConfig.slogan}
        </div>
        <div style={{ display: "flex", marginTop: 22, fontSize: 24, color: "#675376" }}>
          {new URL(siteConfig.url).hostname}
        </div>
      </div>
    ),
    { ...size },
  );
}
