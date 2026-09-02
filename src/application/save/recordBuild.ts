/**
 * Save System — record building & checksum (FS-SAVE-001)
 *
 * `finalizeRecord` computes the checksum over the FROZEN body
 * {schemaVersion, contentVersion, gameVersion, createdAt, payload} using the
 * canonical serializer, so equivalent bodies always hash identically.
 */
import { stringifyCanonical, extractChecksumBody } from '../../domain/save';
import type { ChecksumBody, SavePayload, SaveRecord } from '../../domain/save';
import type { Checksummer } from './ports';

export interface RawRecordBody {
  schemaVersion: number;
  contentVersion: string;
  gameVersion: string;
  createdAt: number;
  payload: SavePayload;
}

export function checksumBodyText(body: ChecksumBody): string {
  return stringifyCanonical(body);
}

export function recordBodyText(body: RawRecordBody): string {
  return stringifyCanonical({
    schemaVersion: body.schemaVersion,
    contentVersion: body.contentVersion,
    gameVersion: body.gameVersion,
    createdAt: body.createdAt,
    payload: body.payload,
  });
}

/** Hash a completed (checksum-bearing) record the same way its checksum was made. */
export function recordChecksumText(record: SaveRecord): string {
  return checksumBodyText(extractChecksumBody(record));
}

/** Finalize one record: fill in the checksum for the frozen body. */
export async function finalizeRecord(
  checksummer: Checksummer,
  body: RawRecordBody
): Promise<SaveRecord> {
  const checksum = await checksummer.checksum(recordBodyText(body));
  return {
    schemaVersion: body.schemaVersion,
    contentVersion: body.contentVersion,
    gameVersion: body.gameVersion,
    createdAt: body.createdAt,
    checksum,
    payload: body.payload,
  };
}
