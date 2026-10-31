import { Platform, Pressable, View } from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { WebView } from "react-native-webview";
import { ExternalLink, Share2 } from "lucide-react-native";
import { InlineView } from "@/ui";
import { useUiColors } from "@/contexts/ThemeContext";
import { toUserMessage } from "@/core/errors";
import { toast } from "@/utils/toast";
import { openWith, shareFile } from "./transfers/device";
import { isImageFile, isPdfFile, isVideoFile } from "./utils/fileUtils";

export type PreviewKind = "image" | "video" | "pdf";

/** What the phone can show itself. Android has no PDF view, so PDFs go to another app there. */
export function previewKind(name: string): PreviewKind | null {
  if (isImageFile(name)) return "image";
  if (isVideoFile(name)) return "video";
  if (isPdfFile(name) && Platform.OS === "ios") return "pdf";
  return null;
}

const fileUri = (path: string) =>
  path.startsWith("file://") ? path : `file://${encodeURI(path)}`;

function Video({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
  });
  return (
    <VideoView
      player={player}
      style={{ flex: 1 }}
      contentFit="contain"
      nativeControls
      allowsPictureInPicture={false}
    />
  );
}

/** A downloaded file shown in the app, with share and open with. */
export function PreviewView({
  open,
  name,
  localPath,
  kind,
  onClose,
}: {
  open: boolean;
  name: string;
  localPath: string;
  kind: PreviewKind;
  onClose: () => void;
}) {
  const colors = useUiColors();
  const uri = fileUri(localPath);
  const run = (fn: () => Promise<void>) => () =>
    void fn().catch((e) => toast.error(toUserMessage(e, "Could not open it")));

  return (
    <InlineView
      open={open}
      onClose={onClose}
      title={name}
      bare
      scroll={false}
      actions={
        <>
          <Pressable
            onPress={run(() => openWith(localPath, name))}
            accessibilityRole="button"
            accessibilityLabel="Open with"
            className="h-10 w-10 items-center justify-center active:bg-muted"
          >
            <ExternalLink size={17} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={run(() => shareFile(localPath, name))}
            accessibilityRole="button"
            accessibilityLabel="Share"
            className="h-10 w-10 items-center justify-center active:bg-muted"
          >
            <Share2 size={17} color={colors.text} />
          </Pressable>
        </>
      }
    >
      <View className="flex-1 bg-black">
        {kind === "image" ? (
          <Image
            source={{ uri }}
            style={{ flex: 1 }}
            contentFit="contain"
            accessibilityLabel={name}
          />
        ) : kind === "video" ? (
          <Video uri={uri} />
        ) : (
          <WebView
            source={{ uri }}
            originWhitelist={["file://*"]}
            allowFileAccess
            allowingReadAccessToURL={uri.slice(0, uri.lastIndexOf("/") + 1)}
            style={{ flex: 1, backgroundColor: colors.background }}
          />
        )}
      </View>
    </InlineView>
  );
}
