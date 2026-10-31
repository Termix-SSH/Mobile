/**
 * Makes SSH key pairs on the phone, so a login can get a new key with no
 * server. RSA is left to the server's Credential Tools plugin, since making
 * RSA primes in JavaScript is too slow on a phone.
 */
import { ed25519 } from "@noble/curves/ed25519.js";
import { p256 } from "@noble/curves/nist.js";
import { getRandomBytes } from "expo-crypto";
import { AppError } from "@/core/errors";
import {
  convertKeyToOpenssh,
  isSshEngineAvailable,
} from "@/modules/termix-ssh";
import { privateKeyText, publicLine, type OpenSshKey } from "./openssh";

export type PhoneKeyType = "ed25519" | "ecdsa";

export const PHONE_KEY_TYPES: { id: PhoneKeyType; label: string }[] = [
  { id: "ed25519", label: "Ed25519" },
  { id: "ecdsa", label: "ECDSA P-256" },
];

export interface GeneratedKey {
  privateKey: string;
  publicKey: string;
}

type Random = (n: number) => Uint8Array;

function makeKey(type: PhoneKeyType, random: Random): OpenSshKey {
  if (type === "ed25519") {
    const secret = random(32);
    return {
      type: "ssh-ed25519",
      secret,
      publicKey: ed25519.getPublicKey(secret),
    };
  }
  const secret = p256.utils.randomSecretKey(random(48));
  return {
    type: "ecdsa-sha2-nistp256",
    secret,
    publicKey: p256.getPublicKey(secret, false),
  };
}

/**
 * A new key pair as OpenSSH text. With a passphrase, the phone's SSH engine
 * locks the private key, the same way ssh-keygen does.
 */
export function generateKeyPair(
  type: PhoneKeyType,
  options: { passphrase?: string; comment?: string; random?: Random } = {},
): GeneratedKey {
  const random = options.random ?? getRandomBytes;
  const key = makeKey(type, random);
  const check = new DataView(random(4).buffer).getUint32(0);
  const comment = options.comment ?? "termix";
  let privateKey = privateKeyText(key, check, comment);
  if (options.passphrase) {
    if (!isSshEngineAvailable) {
      throw new AppError(
        "Locking a key with a passphrase needs the Termix app, not a web preview.",
        "NO_ENGINE",
      );
    }
    privateKey = convertKeyToOpenssh(privateKey, undefined, options.passphrase);
  }
  return { privateKey, publicKey: publicLine(key, comment) };
}
