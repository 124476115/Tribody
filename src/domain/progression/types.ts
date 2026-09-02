/**
 * Progression Domain — core types (FS-PROG-001)
 *
 * Pure TypeScript value contracts for the deterministic character progression
 * runtime. No Phaser, React, Zod, or Node.js built-ins.
 *
 * Design invariants (WO-020 plan review):
 * - `PcProgression` and `ArchiveMetaProgression` are structurally distinct
 *   types and are NEVER merged.
 * - Per-PC progression is keyed by a stable `pcId` (persisted identity, never
 *   display/localization text).
 * - The attribute set is a FIXED curated domain set (canonical persisted keys),
 *   consumed by WO-021; content may tune values but not redefine identities
 *   without a future schema decision.
 */

/** Fixed, curated attribute identities (canonical persisted keys). */
export const SAVE_ATTRIBUTE_IDS = ['intellect', 'perception', 'will'] as const;

export type AttributeId = (typeof SAVE_ATTRIBUTE_IDS)[number];

/** Canonical initial attribute values — the deterministic PC default. */
export const DEFAULT_ATTRIBUTE_VALUES: Record<AttributeId, number> = {
  intellect: 1,
  perception: 1,
  will: 1,
};

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 20;

/**
 * XP required to *reach* `level` from level 1. Deterministic closed-form
 * quadratic curve: 100, 300, 600, ... (100 * (n-1) * n / 2). Returns 0 at and
 * below MIN_LEVEL.
 */
export function xpRequiredToReach(level: number): number {
  if (level <= MIN_LEVEL) return 0;
  return (100 * (level - 1) * level) / 2;
}

/** XP cap: the level-20 reach threshold. At cap XP no longer grows (clamped). */
export const MAX_XP = xpRequiredToReach(MAX_LEVEL);

/**
 * Highest level whose reach threshold is <= `xp`, clamped to MAX_LEVEL.
 * Deterministic and monotonic in `xp`.
 */
export function levelForXp(xp: number): number {
  let level = MIN_LEVEL;
  for (let l = MIN_LEVEL; l <= MAX_LEVEL; l += 1) {
    if (xpRequiredToReach(l) <= xp) level = l;
  }
  return level;
}

/** Per-PC, persisted canonical progression state. */
export interface PcProgression {
  /** Stable persistent identity; never display/localization text. */
  pcId: string;
  /** MIN_LEVEL..MAX_LEVEL inclusive. */
  level: number;
  /** Non-negative integer; capped at MAX_XP at the level cap. */
  xp: number;
  /** Canonical value state for the fixed curated attribute set. */
  attributes: Record<AttributeId, number>;
  /** Persisted per-occurrence dedup ledger; survives reload (AC-01/AC-06). */
  creditedOccurrences: string[];
}

/**
 * Archive meta-progression. Intentionally a DIFFERENT type from PcProgression;
 * never merged into per-PC XP/level reducers (AC-05). Spoiler-agnostic lifetime
 * counters; medal/codex-owned data lives in WO-023.
 */
export interface ArchiveMetaProgression {
  discoverableCount: number;
  lifetime: Record<string, number>;
}

/** The persisted progression envelope joined into SavePayload.domain (schema v3). */
export interface ProgressionSavedState {
  /** Keyed by stable pcId; empty until a PC is activated (no fabricated PCs). */
  pcs: Record<string, PcProgression>;
  archive: ArchiveMetaProgression;
}

/**
 * The XP-award input contract. `occurrenceId` is a STABLE occurrence identity
 * OWNED BY THE PRODUCER (e.g. a quest+objective completion bucket). Dedup is by
 * `occurrenceId` per PC ledger — never by event type or XP amount (AC-06).
 */
export interface XpSourceFact {
  /** Which PC is being credited. */
  pcId: string;
  /** Stable occurrence identity owned by the producer. */
  occurrenceId: string;
  /** Positive integer amount of XP. */
  xp: number;
}

/** One discrete level gained by a single XP application (step +1). */
export interface LevelUpResult {
  pcId: string;
  /** The level BEFORE this discrete step. */
  from: number;
  /** from + 1. */
  to: number;
}

/** Result of one applyXp call. `levelUps` is a deterministic per-step sequence. */
export interface ApplyXpResult {
  /** Next immutable state. */
  state: ProgressionSavedState;
  /** Deterministic ascending per-step level-up sequence; empty if none. */
  levelUps: LevelUpResult[];
  /** False iff the occurrence was already credited (dedup). */
  credited: boolean;
  /** XP granted by this occurrence; 0 iff dedup. */
  grantedXp: number;
}

/** The domain-event type WO-020 produces for each discrete level gained. */
export const PROGRESSION_LEVEL_UP_EVENT_TYPE = 'progression.level-up';

/**
 * The produced level-up event payload. Registration in the generic WO-002
 * kernel registry is a Gate-2 extension; quest-side consumption is deferred.
 * `id` is an `EventId` so the emission can flow straight into the kernel.
 */
export interface LevelUpEmission {
  id: import('../events').EventId;
  type: typeof PROGRESSION_LEVEL_UP_EVENT_TYPE;
  payload: { pcId: string; from: number; to: number };
}

export type ProgressionErrorCode = 'pc-not-activated' | 'non-positive-xp';

/** Typed, deterministic progression failure. Consumers branch on `.code`. */
export class ProgressionError extends Error {
  readonly code: ProgressionErrorCode;

  constructor(code: ProgressionErrorCode, message: string) {
    super(message);
    this.name = 'ProgressionError';
    this.code = code;
  }
}
