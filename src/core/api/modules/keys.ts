import type { AccountClient } from "../AccountClient";

export function createKeysApi(c: AccountClient) {
  async function detectKeyType(
    privateKey: string,
    keyPassword?: string,
  ): Promise<any> {
    try {
      const response = await c.http.auth.post("/credentials/detect-key-type", {
        privateKey,
        keyPassword,
      });
      return response.data;
    } catch (error) {
      c.fail(error, "detect key type");
      throw error;
    }
  }

  async function detectPublicKeyType(publicKey: string): Promise<any> {
    try {
      const response = await c.http.auth.post(
        "/credentials/detect-public-key-type",
        {
          publicKey,
        },
      );
      return response.data;
    } catch (error) {
      c.fail(error, "detect public key type");
      throw error;
    }
  }

  async function validateKeyPair(
    privateKey: string,
    publicKey: string,
    keyPassword?: string,
  ): Promise<any> {
    try {
      const response = await c.http.auth.post(
        "/credentials/validate-key-pair",
        {
          privateKey,
          publicKey,
          keyPassword,
        },
      );
      return response.data;
    } catch (error) {
      c.fail(error, "validate key pair");
      throw error;
    }
  }

  async function generatePublicKeyFromPrivate(
    privateKey: string,
    keyPassword?: string,
  ): Promise<any> {
    try {
      const response = await c.http.auth.post(
        "/credentials/generate-public-key",
        {
          privateKey,
          keyPassword,
        },
      );
      return response.data;
    } catch (error) {
      c.fail(error, "generate public key from private key");
      throw error;
    }
  }

  async function generateKeyPair(
    keyType: "ssh-ed25519" | "ssh-rsa" | "ecdsa-sha2-nistp256",
    keySize?: number,
    passphrase?: string,
  ): Promise<any> {
    try {
      const response = await c.http.auth.post(
        "/credentials/generate-key-pair",
        {
          keyType,
          keySize,
          passphrase,
        },
      );
      return response.data;
    } catch (error) {
      c.fail(error, "generate SSH key pair");
      throw error;
    }
  }

  async function deployCredentialToHost(
    credentialId: number,
    targetHostId: number,
  ): Promise<any> {
    try {
      const response = await c.http.auth.post(
        `/credentials/${credentialId}/deploy-to-host`,
        { targetHostId },
      );
      return response.data;
    } catch (error) {
      c.fail(error, "deploy credential to host");
      throw error;
    }
  }

  return {
    detectKeyType,
    detectPublicKeyType,
    validateKeyPair,
    generatePublicKeyFromPrivate,
    generateKeyPair,
    deployCredentialToHost,
  };
}

export type KeysApi = ReturnType<typeof createKeysApi>;
