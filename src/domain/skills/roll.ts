/**
 * Skills Domain — RollV1 (FS-SKILL-001 AC-07 / AC-08)
 *
 * Frozen deterministic roll. Hash of the identity seed + attempt counter via
 * FNV-1a 32-bit with rejection sampling, so the result lies in [0, die) and no
 * RNG state is ever persisted or derived from wall-clock.
 *
 * Algorithm (locked in Rev 3 — DO NOT change without a gold-vector migration):
 *   limit   = 2**32 - (2**32 mod die)
 *   accept  the LOWEST attempt whose h = fnv1a32("roll:v1:" + seed + "#" + attempt)
 *            satisfies h < limit; then roll = h mod die.
 * Attempts run 0, 1, 2, … (rejection sampling; mutex-free).
 *
 * Golden vectors pinned in tests/unit/skills/roll.test.ts, incl. a genuine
 * rejection/retry path with a crafted large die (limit 0x90000000).
 *
 * FNV-1a anchors: fnv1a32('') === 0x811c9dc5, fnv1a32('a') === 0xe40c292c.
 */
const FNV_OFFSET_32 = 0x811c9dc5;
const FNV_PRIME_32 = 0x01000193;

/** FNV-1a 32-bit hash of a string over its ASCII/UTF-8 code units. */
export function fnv1a32(text: string): number {
  let hash = FNV_OFFSET_32;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i); // charCode < 0x100 for the identity seeds used
    hash = Math.imul(hash, FNV_PRIME_32) >>> 0;
  }
  return hash >>> 0;
}

const ROLL_PREFIX = 'roll:v1:';

export interface RollResult {
  /** Integer in [0, die). */
  roll: number;
  /** Number of rejected attempts before acceptance (0 for normal checks). */
  attempts: number;
}

/**
 * Deterministic RollV1 over an identity seed. Same seed + die always produce
 * the same roll; distinct seeds are independent.
 */
export function rollV1(seed: string, die: number): RollResult {
  if (!Number.isInteger(die) || die <= 0) {
    throw new Error(`rollV1: die must be a positive integer, got ${String(die)}`);
  }
  const limit = 0x100000000 - (0x100000000 % die);
  const full = ROLL_PREFIX + seed;
  for (let attempt = 0; ; attempt += 1) {
    const h = fnv1a32(full + '#' + String(attempt));
    if (h < limit) {
      return { roll: h % die, attempts: attempt };
    }
  }
}

/** The frozen check roll identity: `dialogueId#instanceOrdinal#nodeId#choiceId#skillId`. */
export function skillCheckRollSeed(seed: {
  dialogueId: string;
  instanceOrdinal: number;
  nodeId: string;
  choiceId: string;
  skillId: string;
}): string {
  return `${seed.dialogueId}#${String(seed.instanceOrdinal)}#${seed.nodeId}#${seed.choiceId}#${seed.skillId}`;
}
