import { Composition, Still } from "remotion";
import { Banner, type BannerProps } from "./Banner";
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

const sampleBanner: BannerProps = {
  width: 3840,
  height: 2560,
  title: "Your servers, in your *pocket*",
  subtitle: "SSH, files, Docker and remote desktop",
  tablet: {
    src: "raw/android-tablet/split.png",
    width: 2560,
    height: 1600,
    crop: { top: 48, bottom: 64 },
  },
  phone: {
    src: "raw/android-phone/home.png",
    width: 1080,
    height: 1920,
    crop: { top: 136, bottom: 63 },
  },
  theme: "dark",
  accent: "#f59145",
};

const samplePreview: PreviewProps = {
  width: 886,
  height: 1920,
  video: "raw/iphone/tour.mp4",
  videoWidth: 1320,
  videoHeight: 2868,
  crop: { top: 186, bottom: 102 },
  kind: "phone",
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
      <Still
        id="Banner"
        component={Banner}
        width={3840}
        height={2560}
        defaultProps={sampleBanner}
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
