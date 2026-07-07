import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isValidTenantId, sniffImageMime } from './security';

const DATA_DIR = process.env.CITAS_DATA_DIR || path.join(process.cwd(), 'data');
const IMAGE_DIR = path.join(DATA_DIR, 'service-images');
const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp']);

function imagePath(tenantId: string, serviceId: string) {
  if (!isValidTenantId(tenantId)) throw new Error('invalid_tenant');
  const safeId = serviceId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeId) throw new Error('invalid_service');
  const resolved = path.resolve(IMAGE_DIR, tenantId, `${safeId}.bin`);
  if (!resolved.startsWith(path.resolve(IMAGE_DIR, tenantId) + path.sep)) throw new Error('invalid_path');
  return resolved;
}

function metaPath(tenantId: string, serviceId: string) {
  if (!isValidTenantId(tenantId)) throw new Error('invalid_tenant');
  const safeId = serviceId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeId) throw new Error('invalid_service');
  const resolved = path.resolve(IMAGE_DIR, tenantId, `${safeId}.json`);
  if (!resolved.startsWith(path.resolve(IMAGE_DIR, tenantId) + path.sep)) throw new Error('invalid_path');
  return resolved;
}

export function serviceImageUrl(tenantId: string, serviceId: string) {
  return `/api/services/image/${tenantId}/${serviceId}`;
}

export async function saveServiceImage(tenantId: string, serviceId: string, bytes: Buffer, mime: string) {
  if (!isValidTenantId(tenantId)) throw new Error('invalid_tenant');
  const sniffed = sniffImageMime(bytes);
  if (!sniffed || !ALLOWED.has(sniffed)) throw new Error('invalid_type');
  if (bytes.length > MAX_BYTES) throw new Error('too_large');
  const dir = path.join(IMAGE_DIR, tenantId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(imagePath(tenantId, serviceId), bytes);
  await fs.writeFile(
    metaPath(tenantId, serviceId),
    JSON.stringify({ mime: sniffed, updatedAt: new Date().toISOString() }),
  );
  return serviceImageUrl(tenantId, serviceId);
}

export async function readServiceImage(tenantId: string, serviceId: string) {
  if (!isValidTenantId(tenantId)) return null;
  try {
    const meta = JSON.parse(await fs.readFile(metaPath(tenantId, serviceId), 'utf8')) as { mime: string };
    const bytes = await fs.readFile(imagePath(tenantId, serviceId));
    const mime = ALLOWED.has(meta.mime) ? meta.mime : sniffImageMime(bytes);
    if (!mime) return null;
    return { bytes, mime };
  } catch {
    return null;
  }
}

export async function deleteServiceImage(tenantId: string, serviceId: string) {
  if (!isValidTenantId(tenantId)) return;
  try {
    await fs.unlink(imagePath(tenantId, serviceId));
    await fs.unlink(metaPath(tenantId, serviceId));
  } catch {
    /* ok */
  }
}
