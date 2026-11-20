import { useEffect, useRef } from "react";
import { View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Button, Sheet, SheetBody, Text } from "@/ui";
import { t } from "@/i18n";

/** Scans one QR code and hands its text back. */
export function ScanSheet({
  visible,
  onClose,
  onScanned,
}: {
  visible: boolean;
  onClose: () => void;
  onScanned: (text: string) => void;
}) {
  const [permission, request] = useCameraPermissions();
  const done = useRef(false);
  useEffect(() => {
    if (visible) done.current = false;
  }, [visible]);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t("hostTransfer.scanSheet.scanAHostCode")}
      description={t("hostTransfer.scanSheet.pointTheCameraAtA")}
    >
      <SheetBody>
        {!permission ? null : !permission.granted ? (
          <View className="gap-3">
            <Text className="text-meta text-muted-foreground">
              {t("hostTransfer.scanSheet.termixNeedsTheCameraTo")}
            </Text>
            <Button onPress={() => void request()}>
              {t("hostTransfer.scanSheet.allowTheCamera")}
            </Button>
          </View>
        ) : (
          <View className="aspect-square w-full overflow-hidden border border-border">
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={({ data }) => {
                if (done.current || !data) return;
                done.current = true;
                onScanned(data);
              }}
            />
          </View>
        )}
      </SheetBody>
    </Sheet>
  );
}
