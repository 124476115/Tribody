/**
 * Save System — core contracts (FS-SAVE-001)
 *
 * Pure TypeScript value contracts for the save layer (WO-013). Depends only on
 * the dialogue and quest domains (their persisted state shapes) — no Phaser,
 * React, Zod, or Node.js built-ins (verified by the WO-013 purity test).
 *
 * Design invariants (plan review Rev C):
 * - Records are immutable, create-only and addressed by unique `recordId`.
 *   A "save" writes a new record and repoints one slot doc.
 * - The checksum body is FROZEN: only {schemaVersion, contentVersion,
 *   gameVersion, createdAt, payload} participates. Unknown top-level fields are
 *   tolerated by the (forward-compatible) header stage, never by checksum.
 * - `unsupported-schema` is a version problem, never corruption; nowhere below
 *   conflates check sum failure with version/format failure.
 * - The production migration registry is EMPTY at v1; sequential migration
 *   (incl. spy-order/no-jump tests) uses an injected test registry.
 */

import type { DialogueSavedState } from '../dialogue';
import type { QuestSavedState } from '../quest';
import type { ExplorationSavedState } from '../exploration';
import type { ProgressionSavedState } from '../progression';
import type { SkillsSavedState } from '../skills';
import type { InventorySavedState } from '../inventory';

/**
 * Current persisted schema version.
 * - v1: dialogue + quest.
 * - v2 (WO-014): added `domain.exploration`.
 * - v3 (WO-020): added `domain.progression` (canonical character-progression
 *   continuation state).
 * - v4 (WO-021): added `domain.skills` (canonical learn-only skill state).
 * - v5 (WO-022): added `domain.inventory` (canonical inventory/equipment state
 *   including the generalized grant/remove mutation ledger).
 */
export const SAVE_SCHEMA_VERSION = 5;

/** Size cap shared by save construction, export, and import. */
export const MAX_SERIALIZED_SAVE_BYTES = 64 * 1024 * 1024;

/** Navigational depth cap for parsed save JSON (protects against deep recursion). */
export const MAX_NESTING_DEPTH = 64;

/** Identity (UI-stable) of a save slot. Never renamed without a migration. */
export const SAVE_SLOT_IDS = [
  'manual-1',
  'manual-2',
  'manual-3',
  'quick',
  'auto-1',
  'auto-2',
  'auto-3',
  'auto-4',
  'auto-5',
] as const;

export type SaveSlotId = (typeof SAVE_SLOT_IDS)[number];

export function isSaveSlotId(value: string): value is SaveSlotId {
  return (SAVE_SLOT_IDS as readonly string[]).includes(value);
}

export type SaveSlotKind = 'manual' | 'quick' | 'autosave';

export type SaveScope = 'chapter_enter' | 'autosave' | 'manual' | 'quick';

export interface SaveCheckpoint {
  chapterId: string;
  sceneId: string;
  scope: SaveScope;
}

/** The only persisted payload. Contains only stable IDs and JSON-safe values. */
export interface SavePayload {
  activeChapterId: string;
  activeSceneId: string;
  checkpoint: SaveCheckpoint | null;
  playtimeMinutes: number;
  domain: {
    dialogue: DialogueSavedState;
    quest: QuestSavedState;
    exploration: ExplorationSavedState;
    progression: ProgressionSavedState;
    skills: SkillsSavedState;
    inventory: InventorySavedState;
  };
}

/**
 * One immutable stored record. Every field except `payload` is a link-domain
 * field; `payload` is the snapshot body. `schemaVersion` must equal
 * `SAVE_SCHEMA_VERSION` for newly built records.
 */
export interface SaveRecord {
  schemaVersion: number;
  contentVersion: string;
  gameVersion: string;
  createdAt: number;
  checksum: string;
  payload: SavePayload;
}

/** The FROZEN checksum body. Equivalent bodies always hash identically. */
export interface ChecksumBody {
  schemaVersion: number;
  contentVersion: string;
  gameVersion: string;
  createdAt: number;
  payload: SavePayload;
}

/** Slot pointer doc. `loadIssue` generalizes the old `corrupt` marker. */
export interface SaveSlotDoc {
  slotId: SaveSlotId;
  kind: SaveSlotKind;
  recordId: string;
  updatedAt: number;
  loadIssue: { code: SaveErrorCode; message: string } | null;
  meta: Record<string, string>;
}

/** Typed, remotely-compatible error taxonomy. Never reduced to a raw throw. */
export type SaveErrorCode =
  | 'corrupt-json'
  | 'corrupt-shape'
  | 'corrupt-checksum'
  | 'unsupported-schema'
  | 'missing-migration'
  | 'content-incompatible'
  | 'save-oversize'
  | 'persistence-error'
  | 'persistence-quota'
  | 'persistence-collision'
  | 'slot-not-found'
  | 'import-oversize'
  | 'import-malformed';

/** Non-fatal, load-time diagnostics (never cause a failed status). */
export type SaveWarningCode = 'migration-record-not-persisted';
export interface SaveWarning {
  code: SaveWarningCode;
  message: string;
}

/** One sequential migration step: v -> v+1. Steps are pure. */
export type MigrationStep = (payload: SavePayload) => unknown;
export type MigrationRegistry = Partial<Record<number, MigrationStep>>;

export interface MigrationResult {
  payload: SavePayload;
  applied: number[];
}
