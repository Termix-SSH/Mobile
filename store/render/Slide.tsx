import { AbsoluteFill, Img, staticFile } from "remotion";
import { fontFamily, palette, type Palette } from "./theme";

export interface Shot {
  /** Path under public/. */
  src: string;
  width: number;
  height: number;
  /** Pixels cut off the top and bottom (status bar and home bar). */
  crop: { top: number; bottom: number };
}

export type DeviceKind = "phone" | "tablet";

export type SlideProps = {
  width: number;
  height: number;
  /** Words between stars show in the accent color. */
  title: string;
  subtitle: string;
  shots: Shot[];
  kind: DeviceKind;
  theme: string;
  accent: string;
  /** The first slide carries the logo. */
  logo: boolean;
};

export function Logo({ size, colors }: { size: number; colors: Palette }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.3 }}>
      <Img
        src={staticFile("brand/logo.svg")}
        style={{ width: size, height: size }}
      />
      <span
        style={{
          fontFamily,
          fontWeight: 800,
          fontSize: size * 0.6,
          color: colors.foreground,
          letterSpacing: -size * 0.02,
        }}
      >
        Termix
      </span>
    </div>
  );
}

/** "Your servers, in your *pocket*" with the starred words in the accent. */
function Accented({ text, accent }: { text: string; accent: string }) {
  return (
    <>
      {text.split(/(\*[^*]+\*)/).map((part, i) =>
        part.startsWith("*") ? (
          <span key={i} style={{ color: accent }}>
            {part.slice(1, -1)}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/** Headline and gray line under it. `size` is the headline font size. */
export function Heading({
  title,
  subtitle,
  size,
  colors,
  logo,
}: {
  title: string;
  subtitle: string;
  size: number;
  colors: Palette;
  logo: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: size * 0.32,
      }}
    >
      {logo ? (
        <div style={{ marginBottom: size * 0.25 }}>
          <Logo size={size * 0.95} colors={colors} />
        </div>
      ) : null}
      <div
        style={{
          fontFamily,
          fontWeight: 800,
          fontSize: size,
          lineHeight: 1.12,
          letterSpacing: -size * 0.035,
          color: colors.foreground,
          textWrap: "balance",
        }}
      >
        <Accented text={title} accent={colors.accent} />
      </div>
      {subtitle ? (
        <div
          style={{
            fontFamily,
            fontWeight: 400,
            fontSize: size * 0.46,
            lineHeight: 1.35,
            color: colors.muted,
            textWrap: "balance",
          }}
        >
          {subtitle}
        </div>
      ) : null}
    </div>
  );
}

const BEZEL = { phone: 0.032, tablet: 0.022 };
const RADIUS = { phone: 0.1, tablet: 0.04 };

/**
 * Source pixels added above and below a cropped screenshot, so the app does
 * not run into the rounded screen corners.
 */
function margin(shot: Shot) {
  return shot.crop.top || shot.crop.bottom ? Math.round(shot.width * 0.035) : 0;
}

function screenHeight(shot: Shot) {
  return shot.height - shot.crop.top - shot.crop.bottom + margin(shot) * 2;
}

/** One row of the screenshot stretched to fill a margin strip. */
function Strip({
  shot,
  row,
  width,
  height,
  scale,
}: {
  shot: Shot;
  row: number;
  width: number;
  height: number;
  scale: number;
}) {
  const stretch = height / scale;
  return (
    <div
      style={{
        width,
        height,
        backgroundImage: `url(${staticFile(shot.src)})`,
        backgroundSize: `${width}px ${shot.height * scale * stretch}px`,
        backgroundPosition: `0 ${-(row + 0.5) * scale * stretch + height / 2}px`,
        backgroundRepeat: "no-repeat",
      }}
    />
  );
}

/** Device height for a device `width` px wide. */
function deviceHeight(shot: Shot, kind: DeviceKind, width: number) {
  const bezel = width * BEZEL[kind];
  return ((width - bezel * 2) * screenHeight(shot)) / shot.width + bezel * 2;
}

/** The widest device that fits in the box. */
function fitWidth(shot: Shot, kind: DeviceKind, maxW: number, maxH: number) {
  return Math.min(maxW, maxH / (deviceHeight(shot, kind, 1000) / 1000));
}

/** One screenshot filling the screen, with its margin strips. */
function Screen({
  shot,
  width,
  scale,
}: {
  shot: Shot;
  width: number;
  scale: number;
}) {
  const m = margin(shot);
  return (
    <>
      <Img
        src={staticFile(shot.src)}
        style={{
          position: "absolute",
          left: 0,
          top: (m - shot.crop.top) * scale,
          width,
          height: shot.height * scale,
        }}
      />
      {m ? (
        <>
          <div style={{ position: "absolute", top: 0, left: 0 }}>
            <Strip
              shot={shot}
              row={shot.crop.top + 1}
              width={width}
              height={m * scale}
              scale={scale}
            />
          </div>
          <div style={{ position: "absolute", bottom: 0, left: 0 }}>
            <Strip
              shot={shot}
              row={shot.height - shot.crop.bottom - 2}
              width={width}
              height={m * scale}
              scale={scale}
            />
          </div>
        </>
      ) : null}
    </>
  );
}

/** Slanted band i of n down a w x h screen, top to bottom. */
function band(i: number, n: number, w: number, h: number) {
  const skew = Math.min(w, h) * 0.08;
  const y = (k: number, d: number) =>
    k <= 0 ? 0 : k >= n ? h : (k / n) * h + d;
  return `polygon(0 ${y(i, skew)}px, ${w}px ${y(i, -skew)}px, ${w}px ${y(i + 1, -skew)}px, 0 ${y(i + 1, skew)}px)`;
}

/**
 * Screenshots inside a plain dark device body. More than one splits the
 * screen into slanted bands, one per shot.
 */
export function Device({
  shots,
  kind,
  width,
  dark,
}: {
  shots: Shot[];
  kind: DeviceKind;
  width: number;
  dark: boolean;
}) {
  const shot = shots[0];
  const bezel = width * BEZEL[kind];
  const height = deviceHeight(shot, kind, width);
  const screenH = height - bezel * 2;
  const radius = Math.min(width, height) * RADIUS[kind];
  const screenW = width - bezel * 2;
  const scale = screenW / shot.width;
  const edge = Math.max(2, width * 0.004);
  const button = (side: "left" | "right", top: number, length: number) => (
    <div
      style={{
        position: "absolute",
        [side]: -edge * 2.2,
        top: height * top,
        width: edge * 2.6,
        height: height * length,
        borderRadius: edge * 2,
        background: "#2b2c31",
      }}
    />
  );
  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        padding: bezel,
        borderRadius: radius,
        background:
          "linear-gradient(160deg, #34353a 0%, #121315 45%, #0b0b0c 100%)",
        boxShadow: [
          `0 0 0 ${edge}px #3d3e44`,
          `inset 0 0 0 ${edge}px rgba(255,255,255,0.06)`,
          `0 ${width * 0.05}px ${width * 0.14}px rgba(0,0,0,${dark ? 0.55 : 0.28})`,
        ].join(", "),
        flexShrink: 0,
      }}
    >
      {kind === "phone" ? (
        <>
          {button("left", 0.17, 0.045)}
          {button("left", 0.24, 0.08)}
          {button("left", 0.335, 0.08)}
          {button("right", 0.26, 0.12)}
        </>
      ) : null}
      <div
        style={{
          position: "relative",
          width: screenW,
          height: screenH,
          borderRadius: radius - bezel,
          overflow: "hidden",
          background: "#000",
        }}
      >
        {shots.length === 1 ? (
          <Screen shot={shot} width={screenW} scale={scale} />
        ) : (
          shots.map((one, i) => (
            <div
              key={one.src}
              style={{
                position: "absolute",
                inset: 0,
                clipPath: band(i, shots.length, screenW, screenH),
              }}
            >
              <Screen shot={one} width={screenW} scale={scale} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** Lines a monospace text wraps to in `width` at `size` px. */
export function wrapLines(text: string, width: number, size: number): number {
  const perLine = Math.max(1, Math.floor(width / (size * 0.6)));
  let lines = 1;
  let used = 0;
  for (const word of text.replace(/\*/g, "").split(" ")) {
    const need = used ? used + 1 + word.length : word.length;
    if (need > perLine && used) {
      lines++;
      used = word.length;
    } else used = need;
  }
  return lines;
}

export function Slide(props: SlideProps) {
  const { width, height, shots, kind } = props;
  const colors = palette(props.theme, props.accent);
  const landscape = width > height;
  const short = Math.min(width, height);
  const pad = short * 0.07;
  const size = short * (landscape ? 0.052 : 0.07);
  const textW = Math.min(width - pad * 2, landscape ? width * 0.7 : width);

  const headingH =
    (props.logo ? size * 1.2 : 0) +
    wrapLines(props.title, textW, size) * size * 1.12 +
    (props.subtitle
      ? size * 0.32 +
        wrapLines(props.subtitle, textW, size * 0.46) * size * 0.62
      : 0);
  const top = pad * 1.1;
  const gap = short * 0.06;
  const boxTop = top + headingH + gap;
  const boxW = width - pad * 2;
  const boxH = height - boxTop - pad * 0.9;

  const deviceW = fitWidth(shots[0], kind, boxW, boxH);
  const devices = (
    <Device shots={shots} kind={kind} width={deviceW} dark={colors.dark} />
  );

  return (
    <AbsoluteFill style={{ background: colors.background, overflow: "hidden" }}>
      {/* Soft accent light behind the device. */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse ${width * 0.75}px ${height * 0.5}px at 50% ${landscape ? 70 : 64}%, ${colors.accent}${colors.dark ? "2e" : "24"} 0%, transparent 70%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          top,
          left: (width - textW) / 2,
          width: textW,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <Heading
          title={props.title}
          subtitle={props.subtitle}
          size={size}
          colors={colors}
          logo={props.logo}
        />
      </div>
      <div
        style={{
          position: "absolute",
          top: boxTop,
          left: pad,
          width: boxW,
          height: boxH,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {devices}
      </div>
    </AbsoluteFill>
  );
}
