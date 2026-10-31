import { requireOptionalNativeModule } from "expo-modules-core";

interface FileProtectionModule {
  protectDirectory(path: string): void;
}

const FileProtection =
  requireOptionalNativeModule<FileProtectionModule>("FileProtection");

/**
 * iOS: keeps a folder out of iCloud and device backups and encrypts it while
 * the phone is locked after a restart. Does nothing elsewhere.
 */
export function protectDirectory(path: string): void {
  try {
    FileProtection?.protectDirectory(path.replace(/^file:\/\//, ""));
  } catch {}
}
