import { AbsoluteFill, Img, staticFile } from "remotion";
import { fontFamily, palette, type Palette } from "./theme";

export interface Shot {
  /** Path under public/. */
  src: string;
  width: number;
  height: number;
}

export type SlideProps = {
  width: number;
  height: number;
  title: string;
  subtitle: string;
  shots: Shot[];
  theme: string;
  accent: string;
  /** The first slide carries the logo. */
  logo: boolean;
};

export function Logo({ size, colors }: { size: number; colors: Palette }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.32 }}>
      <Img
        src={staticFile("brand/logo.svg")}
        style={{ width: size, height: size }}
      />
      <span
        style={{
          fontFamily,
          fontWeight: 800,
          fontSize: size * 0.62,
          color: colors.foreground,
          letterSpacing: -1,
        }}
      >
        Termix
      </span>
    </div>
  );
}

/** Title block: accent bar, headline, gray line under it. */
export function Heading({
  title,
  subtitle,
  unit,
  colors,
  logo,
  align = "center",
}: {
  title: string;
  subtitle: string;
  unit: number;
  colors: Palette;
  logo: boolean;
  align?: "center" | "left";
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: align === "center" ? "center" : "flex-start",
        textAlign: align,
        gap: unit * 0.9,
      }}
    >
      {logo ? (
        <div style={{ marginBottom: unit * 0.8 }}>
          <Logo size={unit * 3.4} colors={colors} />
        </div>
      ) : null}
      <div
        style={{
          width: unit * 3.2,
          height: unit * 0.45,
          background: colors.accent,
        }}
      />
      <div
        style={{
          fontFamily,
          fontWeight: 700,
          fontSize: unit * 3.6,
          lineHeight: 1.15,
          letterSpacing: -unit * 0.06,
          color: colors.foreground,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontFamily,
          fontWeight: 400,
          fontSize: unit * 1.9,
          lineHeight: 1.35,
          color: colors.muted,
        }}
      >
        {subtitle}
      </div>
    </div>
  );
}

/** A screenshot in a thin frame, scaled to fit the box. */
export function Framed({
  shot,
  maxWidth,
  maxHeight,
  colors,
  border,
}: {
  shot: Shot;
  maxWidth: number;
  maxHeight: number;
  colors: Palette;
  border: number;
}) {
  const scale = Math.min(maxWidth / shot.width, maxHeight / shot.height);
  const w = Math.round(shot.width * scale);
  const h = Math.round(shot.height * scale);
  return (
    <div
      style={{
        width: w,
        height: h,
        border: `${border}px solid ${colors.dark ? "rgba(255,255,255,0.16)" : colors.border}`,
        boxShadow: colors.dark
          ? "0 24px 80px rgba(0,0,0,0.55)"
          : "0 24px 80px rgba(0,0,0,0.12)",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <Img
        src={staticFile(shot.src)}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}

/** Lines a monospace text wraps to in `width` at `size` px. */
export function wrapLines(text: string, width: number, size: number): number {
  const perLine = Math.max(1, Math.floor(width / (size * 0.6)));
  let lines = 1;
  let used = 0;
  for (const word of text.split(" ")) {
    const need = used ? used + 1 + word.length : word.length;
    if (need > perLine && used) {
      lines++;
      used = word.length;
    } else used = need;
  }
  return lines;
}

export function Slide(props: SlideProps) {
  const { width, height, shots } = props;
  const colors = palette(props.theme, props.accent);
  const landscape = width > height;
  // One unit is about 2.1% of the short side; everything scales with it.
  const unit = Math.min(width, height) * 0.021;
  const pad = Math.min(width, height) * 0.07;
  const border = Math.max(2, Math.round(unit * 0.12));
  const heading = (
    <Heading
      title={props.title}
      subtitle={props.subtitle}
      unit={unit}
      colors={colors}
      logo={props.logo}
      align={landscape ? "left" : "center"}
    />
  );

  const shotsRow = (boxW: number, boxH: number) => {
    if (shots.length === 1) {
      return (
        <Framed
          shot={shots[0]}
          maxWidth={boxW}
          maxHeight={boxH}
          colors={colors}
          border={border}
        />
      );
    }
    // Several shots fan out: the middle one in front, the others behind it.
    const middle = Math.floor(shots.length / 2);
    const each = Math.min(
      boxW * 0.58,
      boxH * 0.92 * (shots[0].width / shots[0].height),
    );
    const step = (boxW - each) / Math.max(1, shots.length - 1);
    return (
      <div style={{ position: "relative", width: boxW, height: boxH }}>
        {shots.map((shot, i) => {
          const side = i !== middle;
          return (
            <div
              key={shot.src}
              style={{
                position: "absolute",
                left: step * i,
                top: 0,
                bottom: 0,
                display: "flex",
                alignItems: "center",
                zIndex: side ? 1 : 2,
                transform: side ? "scale(0.9)" : undefined,
              }}
            >
              <Framed
                shot={shot}
                maxWidth={each}
                maxHeight={boxH}
                colors={colors}
                border={border}
              />
            </div>
          );
        })}
      </div>
    );
  };

  if (landscape) {
    const textW = width * 0.34;
    return (
      <AbsoluteFill
        style={{
          background: colors.background,
          flexDirection: "row",
          alignItems: "center",
          padding: pad,
          gap: pad,
        }}
      >
        <div style={{ width: textW, flexShrink: 0 }}>{heading}</div>
        {shotsRow(width - textW - pad * 3, height - pad * 2)}
      </AbsoluteFill>
    );
  }

  const textW = width - pad * 2;
  const headingH =
    (props.logo ? unit * 4.2 : 0) +
    unit * 0.45 +
    unit * 0.9 * 2 +
    wrapLines(props.title, textW, unit * 3.6) * unit * 3.6 * 1.15 +
    wrapLines(props.subtitle, textW, unit * 1.9) * unit * 1.9 * 1.35 +
    unit * 2;
  return (
    <AbsoluteFill
      style={{
        background: colors.background,
        alignItems: "center",
        padding: pad,
        paddingTop: pad * 1.15,
      }}
    >
      <div
        style={{ height: headingH, display: "flex", alignItems: "flex-start" }}
      >
        {heading}
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {shotsRow(width - pad * 2, height - headingH - pad * 2.6)}
      </div>
    </AbsoluteFill>
  );
}
