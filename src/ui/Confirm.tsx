import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { View } from "react-native";
import { Sheet } from "./Sheet";
import { Button } from "./Button";

export interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button. Defaults to true, since most confirms delete. */
  destructive?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/** Hosts the one confirm sheet the app shows at a time. */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const settle = useCallback((ok: boolean) => {
    resolveRef.current?.(ok);
    resolveRef.current = null;
    setPending(null);
  }, []);

  const confirm = useCallback<ConfirmFn>((options) => {
    // A new confirm replaces one still open, which counts as cancelled.
    resolveRef.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setPending(options);
    });
  }, []);

  const destructive = pending?.destructive ?? true;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Sheet
        visible={pending !== null}
        onClose={() => settle(false)}
        title={pending?.title}
        description={pending?.description}
        tone={destructive ? "destructive" : "default"}
        footer={
          <View className="flex-row gap-2">
            <Button
              variant="muted"
              className="flex-1"
              onPress={() => settle(false)}
            >
              {pending?.cancelLabel ?? "Cancel"}
            </Button>
            <Button
              variant={destructive ? "destructive" : "default"}
              className="flex-1"
              onPress={() => settle(true)}
            >
              {pending?.confirmLabel ?? (destructive ? "Delete" : "Confirm")}
            </Button>
          </View>
        }
      />
    </ConfirmContext.Provider>
  );
}

/** Asks a yes or no question in a sheet. Resolves false when dismissed. */
export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm)
    throw new Error("useConfirm must be used within ConfirmProvider");
  return confirm;
}
