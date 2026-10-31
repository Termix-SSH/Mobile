import { AbsoluteFill } from "remotion";
import { Accented, Device, deviceHeight, Logo, type Shot } from "./Slide";
import { fontFamily, palette } from "./theme";

export type BannerProps = {
  width: number;
  height: number;
  /** Words between stars show in the accent color. */
  title: string;
  subtitle: string;
  tablet: Shot;
  phone: Shot;
  theme: string;
  accent: string;
};

/**
 * App Store art: a tablet with a phone in front. Very wide sizes put the text
 * on the left, taller ones put it on top.
 */
export function Banner(props: BannerProps) {
  const { width, height, tablet, phone } = props;
  const colors = palette(props.theme, props.accent);
  const stacked = width / height < 2;
  const pad = height * (stacked ? 0.08 : 0.1);
  const size = Math.min(width * 0.034, height * 0.075);
  const textW = stacked ? width - pad * 2 : width * 0.36;
  const textH = stacked ? size * 3.6 : height;

  const areaL = stacked ? pad : width * 0.44;
  const areaW = width - areaL - pad;
  const areaTop = stacked ? pad + textH + size : pad;
  const areaH = height - areaTop - pad;
  // Phone a bit taller than the tablet, overlapping its left edge.
  const tall = 1.08;
  const tabletRatio = deviceHeight(tablet, "tablet", 1000) / 1000;
  const phoneRatio = deviceHeight(phone, "phone", 1000) / 1000;
  const tabletW = Math.min(
    areaW / (1 + (0.55 * tall * tabletRatio) / phoneRatio),
    areaH / (tall * tabletRatio),
  );
  const tabletH = tabletW * tabletRatio;
  const phoneH = tabletH * tall;
  const phoneW = phoneH / phoneRatio;
  const overlap = phoneW * 0.55;
  const groupL = areaL + (areaW - overlap - tabletW) / 2;
  const phoneTop = areaTop + (areaH - phoneH) / 2;
  const tabletTop = phoneTop + phoneH - tabletH - tabletH * 0.06;
  const rim = colors.dark ? colors.border : "#1c1c1e";

  return (
    <AbsoluteFill style={{ background: colors.background, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: stacked ? pad : pad * 1.4,
          top: stacked ? pad : 0,
          height: textH,
          width: textW,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: stacked ? "center" : "flex-start",
          textAlign: stacked ? "center" : "left",
          gap: size * 0.4,
        }}
      >
        {stacked ? null : (
          <div style={{ marginBottom: size * 0.35 }}>
            <Logo size={size * 1.05} colors={colors} />
          </div>
        )}
        <div
          style={{
            fontFamily,
            fontWeight: 800,
            fontSize: size,
            lineHeight: 1.12,
            letterSpacing: -size * 0.035,
            color: colors.foreground,
          }}
        >
          <Accented text={props.title} accent={colors.accent} />
        </div>
        <div
          style={{
            fontFamily,
            fontWeight: 400,
            fontSize: size * 0.46,
            lineHeight: 1.4,
            color: colors.muted,
          }}
        >
          {props.subtitle}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: groupL + overlap,
          top: tabletTop,
        }}
      >
        <Device shots={[tablet]} kind="tablet" width={tabletW} rim={rim} />
      </div>
      <div
        style={{
          position: "absolute",
          left: groupL,
          top: phoneTop,
          filter: `drop-shadow(0 0 ${phoneW * 0.08}px rgba(0, 0, 0, 0.7))`,
        }}
      >
        <Device shots={[phone]} kind="phone" width={phoneW} rim={rim} />
      </div>
    </AbsoluteFill>
  );
}
