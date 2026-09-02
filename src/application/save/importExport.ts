/**
 * Save System — import/export serialization (FS-SAVE-001)
 *
 * Export serializes the immutable record with the canonical serializer so the
 * exported bytes are exactly re-importable. Import re-validates through the
 * full load pipeline against the DESTINATION catalog; the size gate is applied
 * to raw text length before parsing (hence `serializeForImport` documents its
 * position in that flow rather than transforming the text).
 */
import { stringifyCanonical, type SaveRecord } from '../../domain/save';

export function serializeForExport(record: SaveRecord): string {
  return stringifyCanonical(record);
}

/** Marker for the import flow: raw text passes through after the size gate. */
export function serializeForImport(text: string): string {
  return text;
}
