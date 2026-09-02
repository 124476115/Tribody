/**
 * Progression Domain — runtime (FS-PROG-001)
 *
 * Pure, non-mutating XP/level/activation reducers over `ProgressionSavedState`.
 * No Phaser, React, Zod, or Node.js built-ins.
 *
 * Invariants:
 * - Deterministic + idempotent one-shot occurrence guard (AC-01/AC-06): dedup
 *   by `occurrenceId` per PC ledger; replay yields zero XP.
 * - Monotonic non-decreasing XP and level (AC-03).
 * - Clamped at MAX_LEVEL: incoming XP beyond MAX_XP is not stored; no level-up
 *   past the cap, but the occurrence is still credited (AC-09).
 * - Multi-level: a single award crossing multiple thresholds returns one
 *   LevelUpResult per discrete level, ascending (AC-10); the application maps
 *   each to a `progression.level-up` event (AC-02/AC-08).
 * - Archive meta-progression is never written here (AC-05).
 * - `applyXp` to an unknown PC is a typed `pc-not-activated` error; never a
 *   silent fabricate.
 */
import {
  DEFAULT_ATTRIBUTE_VALUES,
  MAX_XP,
  ProgressionError,
  levelForXp,
  type ApplyXpResult,
  type ProgressionSavedState,
  type XpSourceFact,
} from './types';

/** Canonical empty progression state: no PCs, canonical archive. */
export function createProgressionState(): ProgressionSavedState {
  return {
    pcs: {},
    archive: { discoverableCount: 0, lifetime: {} },
  };
}

/**
 * Deterministically introduce/activate a PC with canonical initial state
 * (level 1, 0 XP, default attributes, empty ledger). Idempotent: if the pcId
 * is already present the state is returned unchanged. Never derives state from
 * any other domain.
 */
export function activatePc(state: ProgressionSavedState, pcId: string): ProgressionSavedState {
  if (state.pcs[pcId] !== undefined) return state;
  const pc = {
    pcId,
    level: 1,
    xp: 0,
    attributes: { ...DEFAULT_ATTRIBUTE_VALUES },
    creditedOccurrences: [],
  };
  return { ...state, pcs: { ...state.pcs, [pcId]: pc } };
}

function assertValidXp(xp: number): void {
  if (!Number.isInteger(xp) || xp <= 0) {
    throw new ProgressionError(
      'non-positive-xp',
      `xp must be a positive integer, got ${String(xp)}`
    );
  }
}

/**
 * Credit XP for a single, stable occurrence. Returns the next immutable state
 * and the deterministic level-up sequence. Replaying an already-credited
 * occurrence returns zero XP, no state change, and no level-ups.
 */
export function applyXp(state: ProgressionSavedState, fact: XpSourceFact): ApplyXpResult {
  assertValidXp(fact.xp);
  const pc = state.pcs[fact.pcId];
  if (pc === undefined) {
    throw new ProgressionError(
      'pc-not-activated',
      `pc "${fact.pcId}" is not activated; call activatePc first`
    );
  }
  if (pc.creditedOccurrences.includes(fact.occurrenceId)) {
    return { state, levelUps: [], credited: false, grantedXp: 0 };
  }

  const cappedXp = Math.min(pc.xp + fact.xp, MAX_XP);
  const newLevel = levelForXp(cappedXp);

  const nextPc = {
    ...pc,
    xp: cappedXp,
    level: newLevel,
    creditedOccurrences: [...pc.creditedOccurrences, fact.occurrenceId],
  };

  const levelUps = [];
  for (let l = pc.level + 1; l <= newLevel; l += 1) {
    levelUps.push({ pcId: pc.pcId, from: l - 1, to: l });
  }

  const nextState: ProgressionSavedState = {
    ...state,
    pcs: { ...state.pcs, [fact.pcId]: nextPc },
  };

  return { state: nextState, levelUps, credited: true, grantedXp: fact.xp };
}
