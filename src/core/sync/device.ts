import * as Device from "expo-device";
import { randomUUID } from "expo-crypto";
import { Platform } from "react-native";
import { secureStore, type JsonKV } from "@/core/storage/kv";
import { isDeviceId } from "./protocol";

const DEVICE_ID_KEY = "device.id";

/** One id per install, so the server lists this phone once. */
export async function deviceId(kv: JsonKV = secureStore): Promise<string> {
  const saved = await kv.get(DEVICE_ID_KEY);
  if (isDeviceId(saved)) return saved;
  const id = `mobile-${randomUUID()}`;
  await kv.set(DEVICE_ID_KEY, id);
  return id;
}

/** The name the server shows for this phone in its sessions list. */
export function deviceName(): string {
  const model = Device.modelName?.trim();
  if (model) return `Termix Mobile on ${model}`;
  return Platform.OS === "ios" ? "Termix Mobile on iPhone" : "Termix Mobile";
}
