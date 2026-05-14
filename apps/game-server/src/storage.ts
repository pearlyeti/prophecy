// Object storage adapter — S3-compatible, works with both MinIO (local dev)
// and Cloudflare R2 (production). Activate by setting the five S3_* env vars.
// When they're absent the game-server falls back to local disk (dev only).

import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

let _client: S3Client | null | undefined; // undefined = not yet initialised

function client(): S3Client | null {
  if (_client !== undefined) return _client;
  const { S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, S3_REGION } = process.env;
  if (!S3_ENDPOINT || !S3_ACCESS_KEY || !S3_SECRET_KEY) {
    _client = null;
    return null;
  }
  _client = new S3Client({
    endpoint: S3_ENDPOINT,
    region: S3_REGION ?? 'auto',
    credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY },
    // Path-style URLs are required for MinIO; R2 supports both.
    forcePathStyle: true,
  });
  return _client;
}

/** True when all five storage env vars are present. */
export function isStorageConfigured(): boolean {
  return !!(
    process.env.S3_ENDPOINT &&
    process.env.S3_ACCESS_KEY &&
    process.env.S3_SECRET_KEY &&
    process.env.S3_BUCKET &&
    process.env.S3_PUBLIC_URL
  );
}

const CATALOG_KEY = 'catalog/cards.json';

/** Read the card catalog JSON from storage. Returns null if absent or storage not configured. */
export async function readCatalogFromStorage(): Promise<string | null> {
  const c = client();
  if (!c) return null;
  try {
    const result = await c.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: CATALOG_KEY }));
    return (await result.Body?.transformToString()) ?? null;
  } catch {
    return null;
  }
}

/** Persist the card catalog JSON to storage. No-op if storage not configured. */
export async function writeCatalogToStorage(json: string): Promise<void> {
  const c = client();
  if (!c) return;
  await c.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: CATALOG_KEY, Body: json, ContentType: 'application/json' }));
}

/**
 * Upload a file and return its public URL.
 * The key is the full object path within the bucket (e.g. "card-art/CHAR_001.jpg").
 */
export async function uploadFile(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  const c = client();
  if (!c) throw new Error('Object storage is not configured (S3_* env vars missing)');
  await c.send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET!,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );
  const base = process.env.S3_PUBLIC_URL!.replace(/\/$/, '');
  return `${base}/${key}`;
}
