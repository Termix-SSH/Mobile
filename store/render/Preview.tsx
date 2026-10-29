import {
  AbsoluteFill,
  Audio,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  Device,
  deviceHeight,
  Heading,
  type DeviceKind,
  type Shot,
} from "./Slide";
import { palette } from "./theme";

export type PreviewProps = {
  width: number;
  height: number;
  /** Path under public/. */
  video: string;
  videoWidth: number;
  videoHeight: number;
  /** Status bar and home bar in the recording, cut off like the stills. */
  crop: Shot["crop"];
  kind: DeviceKind;
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
 * The App Preview: the recorded tour in the same device frame as the
 * screenshots, with a caption that changes at each mark.
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
  const shot: Shot = {
    src: props.video,
    width: props.videoWidth,
    height: props.videoHeight,
    crop: props.crop,
    video: {
      startFrom: Math.round(props.startOffset * fps),
      fill: colors.background,
    },
  };
  const perPx = deviceHeight(shot, props.kind, 1000) / 1000;
  const deviceW = Math.min(boxW, boxH / perPx);
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
      <Device
        shots={[shot]}
        kind={props.kind}
        width={deviceW}
        rim={colors.dark ? colors.border : "#1c1c1e"}
      />
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
