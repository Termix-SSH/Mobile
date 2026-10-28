import {
  AbsoluteFill,
  Audio,
  interpolate,
  OffthreadVideo,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Heading } from "./Slide";
import { palette } from "./theme";

export type PreviewProps = {
  width: number;
  height: number;
  /** Path under public/. */
  video: string;
  videoWidth: number;
  videoHeight: number;
  /** Seconds into the recording where the tour starts. */
  startOffset: number;
  duration: number;
  captions: { t: number; title: string }[];
  theme: string;
  accent: string;
  music: boolean;
};

const FADE = 0.35;

/**
 * The App Preview: the recorded tour in the same frame as the screenshots,
 * with a caption that changes at each mark.
 */
export function Preview(props: PreviewProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = frame / fps;
  const colors = palette(props.theme, props.accent);
  const unit = Math.min(props.width, props.height) * 0.021;
  const pad = Math.min(props.width, props.height) * 0.06;
  const caption =
    [...props.captions].reverse().find((c) => c.t <= t + 0.05) ??
    props.captions[0];
  const next = props.captions.find((c) => c.t > (caption?.t ?? 0));
  const shown = t - (caption?.t ?? 0);
  const left = (next?.t ?? Infinity) - t;
  const opacity = Math.min(1, shown / FADE, left / FADE);

  const headH = unit * 9;
  const boxW = props.width - pad * 2;
  const boxH = props.height - headH - pad * 2;
  const scale = Math.min(boxW / props.videoWidth, boxH / props.videoHeight);
  const end = durationInFrames / fps;

  return (
    <AbsoluteFill
      style={{
        background: colors.background,
        alignItems: "center",
        padding: pad,
      }}
    >
      <div
        style={{
          height: headH,
          display: "flex",
          alignItems: "center",
          opacity: Math.max(0, opacity),
        }}
      >
        <Heading
          title={caption?.title ?? ""}
          subtitle=""
          size={unit * 3.2}
          colors={colors}
          logo={false}
        />
      </div>
      <div
        style={{
          width: Math.round(props.videoWidth * scale),
          height: Math.round(props.videoHeight * scale),
          border: `2px solid ${colors.dark ? "rgba(255,255,255,0.16)" : colors.border}`,
          overflow: "hidden",
        }}
      >
        <OffthreadVideo
          src={staticFile(props.video)}
          startFrom={Math.round(props.startOffset * fps)}
          muted
          style={{ width: "100%", height: "100%" }}
        />
      </div>
      {props.music ? (
        <Audio
          src={staticFile("audio/music.mp3")}
          volume={(f) =>
            0.3 *
            interpolate(f / fps, [0, 1, end - 2, end], [0, 1, 1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })
          }
        />
      ) : null}
    </AbsoluteFill>
  );
}
