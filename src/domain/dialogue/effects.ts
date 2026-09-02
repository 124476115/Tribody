/**
 * Dialogue Runtime — effect request translation (FS-DIALOGUE-001)
 *
 * Exact-once is defined over *emissions*, not executions: the runtime emits
 * `EffectRequest[]` ordered and bound to one committed transition. Engines
 * executing these requests are a separate concern (WO-002 dedup is a second
 * fence). The canon permission boundary is re-checked here as a
 * defense-in-depth layer on top of content validation.
 */
import { isCanonProtectedFlag, type Effect as ContentEffect } from '../content';
import { DialogueDomainError, type EffectRequest } from './types';

/** Bind each effect to a committed transition with a stable instance id. */
export function translateEffects(
  effects: readonly ContentEffect[],
  transitionId: string
): EffectRequest[] {
  return effects.map((effect, index) => {
    assertEffectPermitted(effect);
    return { ...effect, instanceId: `${transitionId}:${String(index)}` };
  });
}

function assertEffectPermitted(effect: ContentEffect): void {
  if (effect.kind === 'set_flag' && isCanonProtectedFlag(effect.flag)) {
    throw new DialogueDomainError(
      'canon-protected-effect',
      `cannot emit set_flag for canon-protected flag "${effect.flag}"`
    );
  }
}
