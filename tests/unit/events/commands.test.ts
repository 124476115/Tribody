/**
 * FS-EVENTS-001 — command vs event boundary (AC-10)
 *
 * AC-10: a command-shaped value is not a DomainEvent: rejected at runtime by
 *        validateEvent, and structurally unassignable at the type level in
 *        both directions.
 */

import { describe, it, expect } from 'vitest';
import { asEventId, asSequence, createEventTypeRegistry, validateEvent } from '@domain/events';
import { DomainEventContractError } from '@domain/events';
import type { DomainEvent, GameCommand } from '@domain/events';

const REG = createEventTypeRegistry(['dialogue.select']);

describe('FS-EVENTS-001 commands', () => {
  it('AC-10: givenCommandShapedValue_thenRejectedAsInvalidEventShape', () => {
    const command: GameCommand = { type: 'scene/exit', exitId: 'east' };

    expect(() => validateEvent(command, REG)).toThrow(DomainEventContractError);
    expect(() => validateEvent(command, REG)).toThrowError(
      expect.objectContaining({ code: 'invalid-event-shape' })
    );
  });

  it('AC-10: givenEventAndCommand_thenTheyAreNotMutuallyAssignable', () => {
    const event: DomainEvent = {
      id: asEventId('occ_x'),
      type: 'dialogue.select',
      payload: { dialogueId: 'dlg_1', choiceId: 'c_1' },
      sequence: asSequence(1),
    };
    const command: GameCommand = { type: 'dialogue/select', dialogueId: 'dlg_1', choiceId: 'c_1' };

    // @ts-expect-error an occurred event is not a GameCommand (commands are intents, not facts)
    const notACommand: GameCommand = event;
    // @ts-expect-error a GameCommand is not a DomainEvent (it never yields occurrence facts)
    const notAnEvent: DomainEvent = command;

    void notACommand;
    void notAnEvent;
  });
});
