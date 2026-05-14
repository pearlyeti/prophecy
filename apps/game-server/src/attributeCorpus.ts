import { attributeCatalogSchema, type AttributeCatalog } from '@prophecy/protocol';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readAttributesFromStorage, writeAttributesToStorage } from './storage.js';

const here = dirname(fileURLToPath(import.meta.url));
const seedDir = resolve(here, '..', '..', '..', 'packages', 'db', 'seed');
const attributesPath = resolve(seedDir, 'attributes.json');

function loadFromDisk(): AttributeCatalog {
  const raw = JSON.parse(readFileSync(attributesPath, 'utf8'));
  const parsed = attributeCatalogSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`attributes.json failed validation: ${parsed.error.message}`);
  return parsed.data;
}

let cached: AttributeCatalog | null = null;

export async function initializeAttributes(): Promise<void> {
  const json = await readAttributesFromStorage();
  if (json) {
    const parsed = attributeCatalogSchema.safeParse(JSON.parse(json));
    if (parsed.success) {
      cached = parsed.data;
      return;
    }
  }
  cached = loadFromDisk();
  writeAttributesToStorage(JSON.stringify(cached, null, 2) + '\n').catch((e) =>
    console.warn('[attributeCorpus] could not seed attributes to storage:', (e as Error).message),
  );
}

export function getAttributes(): AttributeCatalog {
  if (!cached) cached = loadFromDisk();
  return cached;
}

export function writeAttributes(attrs: AttributeCatalog): void {
  const parsed = attributeCatalogSchema.parse(attrs);
  writeFileSync(attributesPath, JSON.stringify(parsed, null, 2) + '\n');
  cached = parsed;
  writeAttributesToStorage(JSON.stringify(parsed, null, 2) + '\n').catch((e) =>
    console.warn('[attributeCorpus] storage write failed:', (e as Error).message),
  );
}
