import { unzipSync, strFromU8 } from 'fflate';
import { AppError } from '../../platform/errors.js';
import { ARCHIVE_MAX_ENTRIES, ARCHIVE_MAX_ENTRY_BYTES, ARCHIVE_MAX_TOTAL_BYTES } from './constants.js';

/**
 * Unzip an uploaded archive into memory only — nothing is ever written to disk
 * and nothing is executed. Bounded against a decompression bomb (per-entry and
 * total uncompressed size caps) and an oversized entry count, both enforced
 * BEFORE the returned map is handed to extraction.
 */
export function unzipArchive(buf: Uint8Array): Record<string, Uint8Array> {
  const entries = unzipSync(buf);
  const paths = Object.keys(entries);
  if (paths.length > ARCHIVE_MAX_ENTRIES) {
    throw new AppError(
      'archive_too_many_entries',
      `Archive has ${paths.length} entries, max is ${ARCHIVE_MAX_ENTRIES}`,
      400,
    );
  }
  let total = 0;
  for (const path of paths) {
    const bytes = entries[path]!.length;
    if (bytes > ARCHIVE_MAX_ENTRY_BYTES) {
      throw new AppError(
        'archive_too_large',
        `Entry "${path}" is ${bytes} bytes, max per entry is ${ARCHIVE_MAX_ENTRY_BYTES}`,
        400,
      );
    }
    total += bytes;
    if (total > ARCHIVE_MAX_TOTAL_BYTES) {
      throw new AppError(
        'archive_too_large',
        `Archive exceeds the total uncompressed cap of ${ARCHIVE_MAX_TOTAL_BYTES} bytes`,
        400,
      );
    }
  }
  return entries;
}

/** Decode a zip entry's bytes as UTF-8 text (used by callers reading a chosen entry). */
export function decodeEntry(bytes: Uint8Array): string {
  return strFromU8(bytes);
}
