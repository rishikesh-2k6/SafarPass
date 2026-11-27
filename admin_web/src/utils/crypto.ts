/**
 * Cryptographic & sanitization helpers for Admin Web.
 * Never falls back to Math.random() for keys or credentials.
 */

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Hashes a numeric PIN with a per-user 16-byte random salt using SHA-256:
 * format `v1$<saltHex>$<digestHex>`, matching the transit-gateway Lambda verifier.
 */
export async function hashPin(pin: string): Promise<string> {
  const saltBytes = new Uint8Array(16);
  window.crypto.getRandomValues(saltBytes);
  const salt = bytesToHex(saltBytes);

  const encoded = new TextEncoder().encode(`${salt}:${pin.trim()}`);
  const digestBuffer = await window.crypto.subtle.digest('SHA-256', encoded);
  const hashHex = bytesToHex(new Uint8Array(digestBuffer));
  return `v1$${salt}$${hashHex}`;
}

/** Generates a 4-digit PIN using Web Crypto CSPRNG. */
export function generateSecurePin(): string {
  const buf = new Uint32Array(1);
  window.crypto.getRandomValues(buf);
  return String(1000 + (buf[0] % 9000));
}

/** Generates a cryptographically random HMAC-SHA256 bus QR secret. */
export function generateSecureQrSecret(busId: string): string {
  const id = busId.trim().toUpperCase() || 'BUS_XX';
  const randBytes = new Uint8Array(16);
  window.crypto.getRandomValues(randBytes);
  return `SECRET_${id}_${bytesToHex(randBytes).toUpperCase()}`;
}

/** Generates a unique record identifier. */
export function generateSecureId(prefix: string): string {
  if (typeof window.crypto.randomUUID === 'function') {
    return `${prefix}_${window.crypto.randomUUID()}`;
  }
  const bytes = new Uint8Array(12);
  window.crypto.getRandomValues(bytes);
  return `${prefix}_${bytesToHex(bytes)}`;
}

/** Escapes CSV values per RFC 4180 and neutralizes spreadsheet formula injection. */
export function sanitizeCsvCell(value: unknown): string {
  const raw = value == null ? '' : String(value);
  const trimmedStart = raw.replace(/^[\s\u00A0]+/, '');
  const formulaSafe =
    trimmedStart.length > 0 && /^[=+\-@\t\r]/.test(trimmedStart)
      ? `'${raw}`
      : raw;
  return `"${formulaSafe.replace(/"/g, '""')}"`;
}
