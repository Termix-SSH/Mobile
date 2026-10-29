import { AbsoluteFill, Img, OffthreadVideo, staticFile } from "remotion";
import { fontFamily, palette, type Palette } from "./theme";

export interface Shot {
  /** Path under public/. */
  src: string;
  width: number;
  height: number;
  /** Pixels cut off the top and bottom (status bar and home bar). */
  crop: { top: number; bottom: number; left?: number; right?: number };
  /** A recording instead of a still: frame to start from, and the color for margin strips. */
  video?: { startFrom: number; fill: string };
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
  /**
   * Height kept for the heading on every slide of a set, so the device sits
   * in the same spot on each one.
   */
  headingSpace?: number;
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

/** Black glass bezel inside a thin rim in the app's border color. */
const BEZEL = { phone: 0.022, tablet: 0.016 };
const RIM = { phone: 0.008, tablet: 0.006 };
const RADIUS = { phone: 0.12, tablet: 0.045 };

/**
 * Source pixels added above and below a cropped phone screenshot, so the app
 * does not run into the round screen corners. Tablet corners are small enough
 * to skip it, and stretching a busy edge row there smears the app.
 */
function margin(shot: Shot, kind: DeviceKind) {
  if (kind !== "phone" || !(shot.crop.top || shot.crop.bottom)) return 0;
  return Math.round(shot.width * 0.065);
}

function screenHeight(shot: Shot, kind: DeviceKind) {
  return (
    shot.height - shot.crop.top - shot.crop.bottom + margin(shot, kind) * 2
  );
}

/** Width of the screenshot left after the side insets are cut off. */
function visibleWidth(shot: Shot) {
  return shot.width - (shot.crop.left ?? 0) - (shot.crop.right ?? 0);
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
  if (shot.video) {
    return <div style={{ width, height, background: shot.video.fill }} />;
  }
  const stretch = height / scale;
  return (
    <div
      style={{
        width,
        height,
        backgroundImage: `url(${staticFile(shot.src)})`,
        backgroundSize: `${shot.width * scale}px ${shot.height * scale * stretch}px`,
        backgroundPosition: `${-(shot.crop.left ?? 0) * scale}px ${-(row + 0.5) * scale * stretch + height / 2}px`,
        backgroundRepeat: "no-repeat",
      }}
    />
  );
}

/** Device height for a device `width` px wide. */
export function deviceHeight(shot: Shot, kind: DeviceKind, width: number) {
  const frame = width * (BEZEL[kind] + RIM[kind]);
  return (
    ((width - frame * 2) * screenHeight(shot, kind)) / visibleWidth(shot) +
    frame * 2
  );
}

/** The widest device that fits in the box. */
function fitWidth(shot: Shot, kind: DeviceKind, maxW: number, maxH: number) {
  return Math.min(maxW, maxH / (deviceHeight(shot, kind, 1000) / 1000));
}

/** One screenshot filling the screen, with its margin strips. */
function Screen({
  shot,
  kind,
  width,
  scale,
}: {
  shot: Shot;
  kind: DeviceKind;
  width: number;
  scale: number;
}) {
  const m = margin(shot, kind);
  return (
    <>
      {shot.video ? (
        <OffthreadVideo
          src={staticFile(shot.src)}
          startFrom={shot.video.startFrom}
          muted
          style={{
            position: "absolute",
            left: -(shot.crop.left ?? 0) * scale,
            top: (m - shot.crop.top) * scale,
            width: shot.width * scale,
            height: shot.height * scale,
          }}
        />
      ) : (
        <Img
          src={staticFile(shot.src)}
          style={{
            position: "absolute",
            left: -(shot.crop.left ?? 0) * scale,
            top: (m - shot.crop.top) * scale,
            width: shot.width * scale,
            height: shot.height * scale,
          }}
        />
      )}
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

/** Side buttons as [side, top, length], fractions of the device height or width. */
const BUTTONS: Record<
  DeviceKind,
  ["left" | "right" | "top", number, number][]
> = {
  phone: [
    ["left", 0.18, 0.04],
    ["left", 0.25, 0.075],
    ["left", 0.345, 0.075],
    ["right", 0.27, 0.11],
  ],
  tablet: [
    ["top", 0.08, 0.06],
    ["right", 0.1, 0.07],
    ["right", 0.19, 0.07],
  ],
};

/**
 * Screenshots inside a device: a thin rim, a black bezel and side buttons.
 * More than one shot splits the screen into slanted bands.
 */
export function Device({
  shots,
  kind,
  width,
  rim,
}: {
  shots: Shot[];
  kind: DeviceKind;
  width: number;
  rim: string;
}) {
  const shot = shots[0];
  const rimW = width * RIM[kind];
  const bezel = width * BEZEL[kind];
  const frame = rimW + bezel;
  const height = deviceHeight(shot, kind, width);
  const screenW = width - frame * 2;
  const screenH = height - frame * 2;
  const radius = Math.min(width, height) * RADIUS[kind];
  const scale = screenW / visibleWidth(shot);
  const depth = rimW * 0.9;
  return (
    <div style={{ position: "relative", width, height, flexShrink: 0 }}>
      {BUTTONS[kind].map(([side, at, length], i) => {
        const along = side === "top" ? width : height;
        const vertical = side !== "top";
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              background: rim,
              borderRadius: depth,
              ...(vertical
                ? {
                    [side]: -depth,
                    top: along * at,
                    width: depth * 2,
                    height: along * length,
                  }
                : {
                    top: -depth,
                    right: along * at,
                    height: depth * 2,
                    width: along * length,
                  }),
            }}
          />
        );
      })}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: radius,
          background: rim,
          padding: rimW,
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            borderRadius: radius - rimW,
            background: "#000",
            padding: bezel,
          }}
        >
          <div
            style={{
              position: "relative",
              width: screenW,
              height: screenH,
              borderRadius: radius - frame,
              overflow: "hidden",
              background: "#000",
            }}
          >
            {shots.length === 1 ? (
              <Screen shot={shot} kind={kind} width={screenW} scale={scale} />
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
                  <Screen
                    shot={one}
                    kind={kind}
                    width={screenW}
                    scale={scale}
                  />
                </div>
              ))
            )}
          </div>
        </div>
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

type HeadingInput = Pick<
  SlideProps,
  "width" | "height" | "title" | "subtitle" | "logo"
>;

function headingLayout({ width, height }: { width: number; height: number }) {
  const landscape = width > height;
  const short = Math.min(width, height);
  const pad = short * 0.07;
  const size = short * (landscape ? 0.052 : 0.07);
  const textW = Math.min(width - pad * 2, landscape ? width * 0.7 : width);
  return { short, pad, size, textW };
}

/** Height the heading takes on a slide. */
export function headingHeight(p: HeadingInput) {
  const { size, textW } = headingLayout(p);
  return (
    (p.logo ? size * 1.2 : 0) +
    wrapLines(p.title, textW, size) * size * 1.12 +
    (p.subtitle
      ? size * 0.32 + wrapLines(p.subtitle, textW, size * 0.46) * size * 0.62
      : 0)
  );
}

export function Slide(props: SlideProps) {
  const { width, height, shots, kind } = props;
  const colors = palette(props.theme, props.accent);
  const { short, pad, size, textW } = headingLayout(props);
  const headingH = headingHeight(props);
  const space = Math.max(headingH, props.headingSpace ?? 0);
  const gap = short * 0.06;
  const boxW = width - pad * 2;
  const boxH = height - pad * 2 - space - gap;
  const deviceW = fitWidth(shots[0], kind, boxW, boxH);
  // Heading and device are centered as one block, so a device held back by
  // the width leaves no hole above it.
  const deviceH = deviceHeight(shots[0], kind, deviceW);
  const blockH = space + gap + deviceH;
  const top = (height - blockH) / 2;
  const boxTop = top + space + gap;
  const devices = (
    <Device
      shots={shots}
      kind={kind}
      width={deviceW}
      rim={colors.dark ? colors.border : "#1c1c1e"}
    />
  );

  return (
    <AbsoluteFill style={{ background: colors.background, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          top: top + (space - headingH) / 2,
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
          height: deviceH,
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
