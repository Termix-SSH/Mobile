import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  KeyboardCustomization,
  KeyConfig,
  KeyboardRow,
  PresetType,
  KeyboardSettings,
} from "@/types/keyboard";
import {
  PRESET_DEFINITIONS,
  getPresetById,
} from "@/app/tabs/sessions/terminal/keyboard/KeyDefinitions";

const STORAGE_KEY = "keyboardCustomization";
const DEFAULT_PRESET_ID: PresetType = "default";

const getDefaultConfig = (): KeyboardCustomization => {
  const defaultPreset = getPresetById(DEFAULT_PRESET_ID);
  if (!defaultPreset) {
    throw new Error("Default preset not found");
  }

  return {
    preset: DEFAULT_PRESET_ID,
    version: 1,
    topBar: {
      pinnedKeys: [],
      keys: [...defaultPreset.topBar.keys],
    },
    fullKeyboard: {
      rows: defaultPreset.fullKeyboard.rows.map((row) => ({
        ...row,
        keys: [...row.keys],
      })),
    },
    settings: {
      keySize: "medium",
      compactMode: false,
      hapticFeedback: false,
      showHints: true,
    },
  };
};

interface KeyboardCustomizationContextType {
  config: KeyboardCustomization;
  isLoading: boolean;

  setPreset: (presetId: PresetType) => Promise<void>;

  addPinnedKey: (key: KeyConfig) => Promise<void>;
  removePinnedKey: (keyId: string) => Promise<void>;
  reorderPinnedKeys: (keys: KeyConfig[]) => Promise<void>;
  addTopBarKey: (key: KeyConfig) => Promise<void>;
  removeTopBarKey: (keyId: string) => Promise<void>;
  reorderTopBarKeys: (keys: KeyConfig[]) => Promise<void>;

  addRow: (row: KeyboardRow) => Promise<void>;
  removeRow: (rowId: string) => Promise<void>;
  reorderRows: (rows: KeyboardRow[]) => Promise<void>;
  updateRow: (rowId: string, updates: Partial<KeyboardRow>) => Promise<void>;
  toggleRowVisibility: (rowId: string) => Promise<void>;
  addKeyToRow: (rowId: string, key: KeyConfig) => Promise<void>;
  removeKeyFromRow: (rowId: string, keyId: string) => Promise<void>;
  reorderKeysInRow: (rowId: string, keys: KeyConfig[]) => Promise<void>;

  updateSettings: (settings: Partial<KeyboardSettings>) => Promise<void>;

  resetToDefault: () => Promise<void>;
  resetTopBar: () => Promise<void>;
  resetFullKeyboard: () => Promise<void>;

  exportConfig: () => string;
  importConfig: (jsonString: string) => Promise<void>;
}

const KeyboardCustomizationContext = createContext<
  KeyboardCustomizationContextType | undefined
>(undefined);

export const KeyboardCustomizationProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [config, setConfig] =
    useState<KeyboardCustomization>(getDefaultConfig());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as KeyboardCustomization;
          setConfig(parsed);
        }
      } catch (error) {
        console.error("Failed to load keyboard configuration:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadConfig();
  }, []);

  const saveConfig = useCallback(async (newConfig: KeyboardCustomization) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
      setConfig(newConfig);
    } catch (error) {
      console.error("Failed to save keyboard configuration:", error);
    }
  }, []);

  const setPreset = useCallback(
    async (presetId: PresetType) => {
      const preset = getPresetById(presetId);
      if (!preset) {
        console.error(`Preset ${presetId} not found`);
        return;
      }

      const newConfig: KeyboardCustomization = {
        preset: presetId,
        version: 1,
        topBar: {
          pinnedKeys: [],
          keys: [...preset.topBar.keys],
        },
        fullKeyboard: {
          rows: preset.fullKeyboard.rows.map((row) => ({
            ...row,
            keys: [...row.keys],
          })),
        },
        settings: { ...config.settings },
      };

      await saveConfig(newConfig);
    },
    [config.settings, saveConfig],
  );

  const addPinnedKey = useCallback(
    async (key: KeyConfig) => {
      const newConfig = {
        ...config,
        preset: "custom" as PresetType,
        topBar: {
          ...config.topBar,
          pinnedKeys: [...config.topBar.pinnedKeys, key],
        },
      };
      await saveConfig(newConfig);
    },
    [config, saveConfig],
  );

  const removePinnedKey = useCallback(
    async (keyId: string) => {
      const newConfig = {
        ...config,
        preset: "custom" as PresetType,
        topBar: {
          ...config.topBar,
          pinnedKeys: config.topBar.pinnedKeys.filter((k) => k.id !== keyId),
        },
      };
      await saveConfig(newConfig);
    },
    [config, saveConfig],
  );

  const reorderPinnedKeys = useCallback(
    async (keys: KeyConfig[]) => {
      const newConfig = {
        ...config,
        preset: "custom" as PresetType,
        topBar: {
          ...config.topBar,
          pinnedKeys: keys,
        },
      };
      await saveConfig(newConfig);
    },
    [config, saveConfig],
  );

  const addTopBarKey = useCallback(
    async (key: KeyConfig) => {
      const newConfig = {
        ...config,
        preset: "custom" as PresetType,
        topBar: {
          ...config.topBar,
          keys: [...config.topBar.keys, key],
        },
      };
      await saveConfig(newConfig);
    },
    [config, saveConfig],
  );

  const removeTopBarKey = useCallback(
    async (keyId: string) => {
      const newConfig = {
        ...config,
        preset: "custom" as PresetType,
        topBar: {
          ...config.topBar,
          keys: config.topBar.keys.filter((k) => k.id !== keyId),
        },
      };
      await saveConfig(newConfig);
    },
    [config, saveConfig],
  );

  const reorderTopBarKeys = useCallback(
    async (keys: KeyConfig[]) => {
      const newConfig = {
        ...config,
        preset: "custom" as PresetType,
        topBar: {
          ...config.topBar,
          keys,
        },
      };
      await saveConfig(newConfig);
    },
    [config, saveConfig],
  );

  const addRow = useCallback(
    async (row: KeyboardRow) => {
      const newConfig = {
        ...config,
        preset: "custom" as PresetType,
        fullKeyboard: {
          rows: [...config.fullKeyboard.rows, row],
        },
      };
      await saveConfig(newConfig);
    },
    [config, saveConfig],
  );

  const removeRow = useCallback(
    async (rowId: string) => {
      const newConfig = {
        ...config,
        preset: "custom" as PresetType,
        fullKeyboard: {
          rows: config.fullKeyboard.rows.filter((r) => r.id !== rowId),
        },
      };
      await saveConfig(newConfig);
    },
    [config, saveConfig],
  );

  const reorderRows = useCallback(
    async (rows: KeyboardRow[]) => {
      const newConfig = {
        ...config,
        preset: "custom" as PresetType,
        fullKeyboard: {
          rows,
        },
      };
      await saveConfig(newConfig);
    },
    [config, saveConfig],
  );

  const updateRow = useCallback(
    async (rowId: string, updates: Partial<KeyboardRow>) => {
      const newConfig = {
        ...config,
        preset: "custom" as PresetType,
        fullKeyboard: {
          rows: config.fullKeyboard.rows.map((row) =>
            row.id === rowId ? { ...row, ...updates } : row,
          ),
        },
      };
      await saveConfig(newConfig);
    },
    [config, saveConfig],
  );

  const toggleRowVisibility = useCallback(
    async (rowId: string) => {
      const newConfig = {
        ...config,
        preset: "custom" as PresetType,
        fullKeyboard: {
          rows: config.fullKeyboard.rows.map((row) =>
            row.id === rowId ? { ...row, visible: !row.visible } : row,
          ),
        },
      };
      await saveConfig(newConfig);
    },
    [config, saveConfig],
  );

  const addKeyToRow = useCallback(
    async (rowId: string, key: KeyConfig) => {
      const newConfig = {
        ...config,
        preset: "custom" as PresetType,
        fullKeyboard: {
          rows: config.fullKeyboard.rows.map((row) =>
            row.id === rowId ? { ...row, keys: [...row.keys, key] } : row,
          ),
        },
      };
      await saveConfig(newConfig);
    },
    [config, saveConfig],
  );

  const removeKeyFromRow = useCallback(
    async (rowId: string, keyId: string) => {
      const newConfig = {
        ...config,
        preset: "custom" as PresetType,
        fullKeyboard: {
          rows: config.fullKeyboard.rows.map((row) =>
            row.id === rowId
              ? { ...row, keys: row.keys.filter((k) => k.id !== keyId) }
              : row,
          ),
        },
      };
      await saveConfig(newConfig);
    },
    [config, saveConfig],
  );

  const reorderKeysInRow = useCallback(
    async (rowId: string, keys: KeyConfig[]) => {
      const newConfig = {
        ...config,
        preset: "custom" as PresetType,
        fullKeyboard: {
          rows: config.fullKeyboard.rows.map((row) =>
            row.id === rowId ? { ...row, keys } : row,
          ),
        },
      };
      await saveConfig(newConfig);
    },
    [config, saveConfig],
  );

  const updateSettings = useCallback(
    async (settings: Partial<KeyboardSettings>) => {
      const newConfig = {
        ...config,
        settings: {
          ...config.settings,
          ...settings,
        },
      };
      await saveConfig(newConfig);
    },
    [config, saveConfig],
  );

  const resetToDefault = useCallback(async () => {
    await saveConfig(getDefaultConfig());
  }, [saveConfig]);

  const resetTopBar = useCallback(async () => {
    const defaultPreset = getPresetById(
      config.preset === "custom" ? DEFAULT_PRESET_ID : config.preset,
    );
    if (!defaultPreset) return;

    const newConfig = {
      ...config,
      topBar: {
        pinnedKeys: [],
        keys: [...defaultPreset.topBar.keys],
      },
    };
    await saveConfig(newConfig);
  }, [config, saveConfig]);

  const resetFullKeyboard = useCallback(async () => {
    const defaultPreset = getPresetById(
      config.preset === "custom" ? DEFAULT_PRESET_ID : config.preset,
    );
    if (!defaultPreset) return;

    const newConfig = {
      ...config,
      fullKeyboard: {
        rows: defaultPreset.fullKeyboard.rows.map((row) => ({
          ...row,
          keys: [...row.keys],
        })),
      },
    };
    await saveConfig(newConfig);
  }, [config, saveConfig]);

  const exportConfig = useCallback(() => {
    return JSON.stringify(config, null, 2);
  }, [config]);

  const importConfig = useCallback(
    async (jsonString: string) => {
      try {
        const imported = JSON.parse(jsonString) as KeyboardCustomization;

        if (!imported.topBar || !imported.fullKeyboard || !imported.settings) {
          throw new Error("Invalid configuration structure");
        }

        await saveConfig(imported);
      } catch (error) {
        console.error("Failed to import configuration:", error);
        throw error;
      }
    },
    [saveConfig],
  );

  const value: KeyboardCustomizationContextType = {
    config,
    isLoading,
    setPreset,
    addPinnedKey,
    removePinnedKey,
    reorderPinnedKeys,
    addTopBarKey,
    removeTopBarKey,
    reorderTopBarKeys,
    addRow,
    removeRow,
    reorderRows,
    updateRow,
    toggleRowVisibility,
    addKeyToRow,
    removeKeyFromRow,
    reorderKeysInRow,
    updateSettings,
    resetToDefault,
    resetTopBar,
    resetFullKeyboard,
    exportConfig,
    importConfig,
  };

  return (
    <KeyboardCustomizationContext.Provider value={value}>
      {children}
    </KeyboardCustomizationContext.Provider>
  );
};

export const useKeyboardCustomization = () => {
  const context = useContext(KeyboardCustomizationContext);
  if (!context) {
    throw new Error(
      "useKeyboardCustomization must be used within a KeyboardCustomizationProvider",
    );
  }
  return context;
};
