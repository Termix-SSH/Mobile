import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { TerminalConfig } from "@/types";
import { MOBILE_DEFAULT_TERMINAL_CONFIG } from "@/constants/terminal-config";

const STORAGE_KEY = "terminalConfig";

const getDefaultConfig = (): Partial<TerminalConfig> => {
  return MOBILE_DEFAULT_TERMINAL_CONFIG;
};

interface TerminalCustomizationContextType {
  config: Partial<TerminalConfig>;
  isLoading: boolean;
  updateConfig: (config: Partial<TerminalConfig>) => Promise<void>;
  resetConfig: () => Promise<void>;

  updateFontSize: (fontSize: number) => Promise<void>;
  resetToDefault: () => Promise<void>;
}

const TerminalCustomizationContext = createContext<
  TerminalCustomizationContextType | undefined
>(undefined);

export const TerminalCustomizationProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [config, setConfig] =
    useState<Partial<TerminalConfig>>(getDefaultConfig());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as Partial<TerminalConfig>;
          setConfig(parsed);
        }
      } catch (error) {
        console.error("Failed to load terminal configuration:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadConfig();
  }, []);

  const saveConfig = useCallback(async (newConfig: Partial<TerminalConfig>) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
      setConfig(newConfig);
    } catch (error) {
      console.error("Failed to save terminal configuration:", error);
    }
  }, []);

  const updateConfig = useCallback(
    async (updates: Partial<TerminalConfig>) => {
      const newConfig = {
        ...config,
        ...updates,
      };
      await saveConfig(newConfig);
    },
    [config, saveConfig],
  );

  const resetConfig = useCallback(async () => {
    await saveConfig(getDefaultConfig());
  }, [saveConfig]);

  const updateFontSize = useCallback(
    async (fontSize: number) => {
      await updateConfig({ fontSize });
    },
    [updateConfig],
  );

  const resetToDefault = useCallback(async () => {
    await resetConfig();
  }, [resetConfig]);

  const value: TerminalCustomizationContextType = {
    config,
    isLoading,
    updateConfig,
    resetConfig,
    updateFontSize,
    resetToDefault,
  };

  return (
    <TerminalCustomizationContext.Provider value={value}>
      {children}
    </TerminalCustomizationContext.Provider>
  );
};

export const useTerminalCustomization = () => {
  const context = useContext(TerminalCustomizationContext);
  if (!context) {
    throw new Error(
      "useTerminalCustomization must be used within a TerminalCustomizationProvider",
    );
  }
  return context;
};
