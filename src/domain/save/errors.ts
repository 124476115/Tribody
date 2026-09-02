/**
 * Save System — typed error (FS-SAVE-001)
 *
 * Pure TypeScript. `SaveError` carries a stable `code` from the documented
 * taxonomy; the UI and import/load pipelines branch on the code, never on
 * message text. `unsupported-schema` and `missing-migration` are version
 * verdicts and are deliberately NOT classified as corruption.
 */
import type { SaveErrorCode } from './types';

export class SaveError extends Error {
  readonly code: SaveErrorCode;

  constructor(code: SaveErrorCode, message: string) {
    super(message);
    this.name = 'SaveError';
    this.code = code;
  }
}

/** Helper to fail with a typed SaveError from a guard/pipeline. */
export function fail(code: SaveErrorCode, message: string): never {
  throw new SaveError(code, message);
}
