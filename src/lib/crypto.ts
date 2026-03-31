import CryptoJS from "crypto-js";

/**
 * Encrypt a plaintext string using AES with the server-side secret.
 * Returns a base64-encoded ciphertext.
 */
export function encrypt(plaintext: string): string {
  const secret = getSecret();
  return CryptoJS.AES.encrypt(plaintext, secret).toString();
}

/**
 * Decrypt an AES-encrypted string back to plaintext.
 * Returns the original string or throws if decryption fails.
 */
export function decrypt(ciphertext: string): string {
  const secret = getSecret();
  const bytes = CryptoJS.AES.decrypt(ciphertext, secret);
  const decrypted = bytes.toString(CryptoJS.enc.Utf8);
  if (!decrypted) {
    throw new Error("Decryption failed — invalid key or corrupted data");
  }
  return decrypted;
}

function getSecret(): string {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error(
      "ENCRYPTION_SECRET environment variable is required for API key storage"
    );
  }
  return secret;
}
