import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 1,
          borderRadius: 8,
          background: "linear-gradient(155deg, #7A3FE0, #3D1E82)",
          fontFamily: "sans-serif",
          fontSize: 17,
          fontWeight: 800,
        }}
      >
        <span style={{ color: "#F1EEFB" }}>B</span>
        <span style={{ color: "#E3B559" }}>W</span>
      </div>
    ),
    { ...size },
  );
}
