import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isValidTenantId, sniffImageMime } from './security';

const DATA_DIR = process.env.CITAS_DATA_DIR || path.join(process.cwd(), 'data');
const LOGO_DIR = path.join(DATA_DIR, 'logos');
const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp']);

export function logoPath(tenantId: string) {
  if (!isValidTenantId(tenantId)) throw new Error('invalid_tenant');
  const resolved = path.resolve(LOGO_DIR, `${tenantId}.bin`);
  if (!resolved.startsWith(path.resolve(LOGO_DIR) + path.sep)) throw new Error('invalid_path');
  return resolved;
}

export function logoMetaPath(tenantId: string) {
  if (!isValidTenantId(tenantId)) throw new Error('invalid_tenant');
  const resolved = path.resolve(LOGO_DIR, `${tenantId}.json`);
  if (!resolved.startsWith(path.resolve(LOGO_DIR) + path.sep)) throw new Error('invalid_path');
  return resolved;
}

export async function saveLogo(tenantId: string, bytes: Buffer, mime: string) {
  if (!isValidTenantId(tenantId)) throw new Error('invalid_tenant');
  const sniffed = sniffImageMime(bytes);
  if (!sniffed || !ALLOWED.has(sniffed)) throw new Error('invalid_type');
  if (mime && ALLOWED.has(mime) && mime !== sniffed) {
    // trust bytes over client Content-Type
  }
  if (bytes.length > MAX_BYTES) throw new Error('too_large');
  await fs.mkdir(LOGO_DIR, { recursive: true });
  await fs.writeFile(logoPath(tenantId), bytes);
  const v = Date.now();
  await fs.writeFile(
    logoMetaPath(tenantId),
    JSON.stringify({ mime: sniffed, updatedAt: new Date().toISOString(), v }),
  );
  return `/api/logo/${tenantId}?v=${v}`;
}

export async function readLogo(tenantId: string) {
  if (!isValidTenantId(tenantId)) return null;
  try {
    const meta = JSON.parse(await fs.readFile(logoMetaPath(tenantId), 'utf8')) as { mime: string };
    const bytes = await fs.readFile(logoPath(tenantId));
    const mime = ALLOWED.has(meta.mime) ? meta.mime : sniffImageMime(bytes);
    if (!mime) return null;
    return { bytes, mime };
  } catch {
    return null;
  }
}

export async function deleteLogo(tenantId: string) {
  if (!isValidTenantId(tenantId)) return;
  try {
    await fs.unlink(logoPath(tenantId));
    await fs.unlink(logoMetaPath(tenantId));
  } catch {
    /* ok */
  }
}
