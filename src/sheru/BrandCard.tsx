import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { clamp01, easeInOutCubic, easeOutCubic } from "./camera";
import { H, W } from "./data";

export const CARD_BG = "#211c19";

type Region = { box: [number, number, number, number]; t0: number; t1: number; kind: "rise" | "wipe" | "corner"; dx?: number; dy?: number };

/**
 * Frame 19 is the exact still. It is revealed band by band (each band is a crop of the
 * same pixels), so the final card is pixel-identical to the delivered frame.
 */
const REGIONS: Region[] = [
  { box: [40, 40, 170, 170], t0: 0.3, t1: 1.1, kind: "corner", dx: -16, dy: -16 },
  { box: [910, 40, 1040, 170], t0: 0.4, t1: 1.2, kind: "corner", dx: 16, dy: -16 },
  { box: [40, 1750, 170, 1880], t0: 0.5, t1: 1.3, kind: "corner", dx: -16, dy: 16 },
  { box: [910, 1750, 1040, 1880], t0: 0.6, t1: 1.4, kind: "corner", dx: 16, dy: 16 },
  { box: [100, 480, 980, 720], t0: 0.7, t1: 1.9, kind: "rise" },
  { box: [400, 750, 680, 782], t0: 1.8, t1: 2.5, kind: "wipe" },
  { box: [170, 830, 910, 902], t0: 2.4, t1: 3.2, kind: "rise" },
  { box: [190, 905, 890, 1058], t0: 3.0, t1: 3.9, kind: "rise" },
  { box: [200, 1125, 880, 1215], t0: 4.0, t1: 4.8, kind: "rise" },
  { box: [180, 1355, 900, 1505], t0: 5.2, t1: 6.4, kind: "rise" },
];

export const BrandCard: React.FC<{ t: number; opacity: number }> = ({ t, opacity }) => {
  const slow = 1 + 0.025 * clamp01(t / 8);
  return (
    <AbsoluteFill style={{ background: CARD_BG, opacity }}>
      <div style={{ position: "absolute", inset: 0, transform: `scale(${slow})`, transformOrigin: "50% 46%" }}>
        {REGIONS.map((r, i) => {
          const k = easeOutCubic(clamp01((t - r.t0) / (r.t1 - r.t0)));
          if (k <= 0) return null;
          const [x0, y0, x1, y1] = r.box;
          const style: React.CSSProperties = { position: "absolute", left: x0, top: y0, width: x1 - x0, height: y1 - y0, overflow: "hidden", opacity: r.kind === "wipe" ? 1 : k };
          if (r.kind === "rise") {
            style.transform = `translateY(${(1 - k) * 22}px)`;
            style.filter = k < 0.97 ? `blur(${(1 - k) * 6}px)` : undefined;
          } else if (r.kind === "corner") {
            style.transform = `translate(${(1 - k) * (r.dx ?? 0)}px, ${(1 - k) * (r.dy ?? 0)}px)`;
          } else {
            const inset = (1 - easeInOutCubic(clamp01((t - r.t0) / (r.t1 - r.t0)))) * 50;
            style.clipPath = `inset(0 ${inset}% 0 ${inset}%)`;
          }
          return (
            <div key={i} style={style}>
              <Img src={staticFile("sheru/frames/frame-19.png")} style={{ position: "absolute", left: -x0, top: -y0, width: W, height: H }} />
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
