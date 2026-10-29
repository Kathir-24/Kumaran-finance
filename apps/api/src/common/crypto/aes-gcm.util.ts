import * as crypto from 'crypto';

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Generates a random 12-byte IV and an authentication tag.
 * Key is derived deterministically from the provided secret using SHA-256.
 * Format: ivHex:authTagHex:encryptedHex
 */
export function encryptAesGcm(plaintext: string, secretKey: string): string {
  const key = crypto.createHash('sha256').update(secretKey).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts an AES-256-GCM encrypted payload.
 * If the string does not match the iv:authTag:encrypted format,
 * gracefully returns the input as plaintext for backward compatibility.
 */
export function decryptAesGcm(data: string, secretKey: string): string {
  const parts = data.split(':');
  if (parts.length !== 3) {
    return data; // Backward compatibility with unencrypted legacy records
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  if (!ivHex || !authTagHex || !encryptedHex) {
    return data;
  }

  try {
    const key = crypto.createHash('sha256').update(secretKey).digest();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    return decipher.update(encryptedHex, 'hex', 'utf8') + decipher.final('utf8');
  } catch {
    return data;
  }
}
