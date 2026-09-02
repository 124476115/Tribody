/**
 * Content Domain — grammar guards for story flags, semantic events, localization
 * keys, canon protection, and the documented soft references.
 *
 * Guard functions are pure string predicates shared by the authoring schemas
 * (validate/author time) and by run time.
 */

/** flag.<chapter>.<subject>.<state>  — e.g. flag.ch03.intro.completed */
export function isStoryFlag(value: string): boolean {
  return /^flag\.[a-z0-9]+(?:\.[a-z0-9_]+)+$/.test(value);
}

/** chapter-scoped semantic event — e.g. ch04.raw_data_compare_requested */
export function isSemanticEventName(value: string): boolean {
  return /^[a-z0-9]+(?:\.[a-z0-9_]+)+$/.test(value);
}

/** localization key, at least three dotted segments — e.g. chapter.ch04.title */
export function isLocalizationKey(value: string): boolean {
  return /^[a-z0-9]+(?:\.[a-z0-9_]+){2,}$/.test(value);
}

/**
 * Canon-protected flags are narrative anchors written by design, never by
 * player choice. `canon.*` and `era.transition.*` are reserved.
 */
export function isCanonProtectedFlag(value: string): boolean {
  return /^(?:canon|era\.transition)\./.test(value);
}

export function isPlayableCharacterRef(value: string): boolean {
  return /^pc_[a-z0-9_]+$/.test(value);
}

export function isAssetPackRef(value: string): boolean {
  return /^pack_[a-z0-9_]+$/.test(value);
}

export function isEvidenceRef(value: string): boolean {
  return /^ev_[a-z0-9_]+$/.test(value);
}

export function isAnchorRef(value: string): boolean {
  return /^anchor\.[a-z0-9_.]+$/.test(value);
}

export function isActRef(value: string): boolean {
  return /^act_[a-z0-9_]+$/.test(value);
}
