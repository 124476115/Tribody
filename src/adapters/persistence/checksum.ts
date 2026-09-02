/**
 * Save System — SHA-256 checksum (FS-SAVE-001)
 *
 * Adapter over WebCrypto (browser & Node >= 20 via globalThis.crypto). Hex
 * output, 64 chars. Domain neutrality: this module may use platform APIs; the
 * domain/canonical layer may not.
 */

function textEncoder(): TextEncoder {
  return new TextEncoder();
}

export async function sha256Hex(text: string): Promise<string> {
  const bytes = textEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hex;
}
