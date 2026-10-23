import { File } from "expo-file-system";

// Global fetch is expo/fetch since SDK 56, which is for network requests.
// Picked files and bundled assets are read through the file system instead.
function isLocal(uri: string): boolean {
  return uri.startsWith("file://") || uri.startsWith("/");
}

export async function readLocalText(uri: string): Promise<string> {
  if (isLocal(uri)) return new File(uri).text();
  return (await fetch(uri)).text();
}

export async function readLocalBase64(uri: string): Promise<string> {
  if (isLocal(uri)) return new File(uri).base64();
  const bytes = new Uint8Array(await (await fetch(uri)).arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
