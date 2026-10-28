import { Composition, Still } from "remotion";
import { Preview, type PreviewProps } from "./Preview";
import { Slide, type SlideProps } from "./Slide";

export const FPS = 30;

const sampleSlide: SlideProps = {
  width: 1320,
  height: 2868,
  title: "Your servers, in your pocket",
  subtitle: "Every host in one list, with live status",
  shots: [],
  kind: "phone",
  theme: "dark",
  accent: "#f59145",
  logo: true,
};

const samplePreview: PreviewProps = {
  width: 886,
  height: 1920,
  video: "raw/iphone/tour.mp4",
  videoWidth: 1320,
  videoHeight: 2868,
  startOffset: 0,
  duration: 25,
  captions: [],
  theme: "dark",
  accent: "#f59145",
  music: true,
};

export function Root() {
  return (
    <>
      <Still
        id="Slide"
        component={Slide}
        width={sampleSlide.width}
        height={sampleSlide.height}
        defaultProps={sampleSlide}
        calculateMetadata={({ props }) => ({
          width: props.width,
          height: props.height,
        })}
      />
      <Composition
        id="Preview"
        component={Preview}
        fps={FPS}
        width={samplePreview.width}
        height={samplePreview.height}
        durationInFrames={FPS * 25}
        defaultProps={samplePreview}
        calculateMetadata={({ props }) => ({
          width: props.width,
          height: props.height,
          durationInFrames: Math.round(props.duration * FPS),
        })}
      />
    </>
  );
}
