/**
 * FS-INV-001 AC-11/AC-12/AC-13 — integration: the application effect executor
 * applies `add_item`/`remove_item` `EffectRequest`s to the inventory domain,
 * glued to the real WO-011 dialogue runtime seam (`instanceId` =
 * `${transitionId}:${index}`) with no cross-domain leakage into
 * Dialogue/Quest state.
 *
 * Proves: occurrence-granular exact-once across transitions and reloads; no
 * success facts on failed or deduplicated requests; the executor never owns
 * canonical state; equipment survives a scripted grant + explicit equip as pure
 * deterministic application-layer behavior.
 */
import { describe, it, expect } from 'vitest';
import {
  createDialogueDomain,
  dialogueStart,
  dialogueSelect,
  type DialogueSavedState,
  type EffectRequest,
} from '../../src/domain/dialogue';
import type { DialogueManifest } from '../../src/domain/content';
import {
  applyItemEffects,
  type ItemResolution,
  type ResolveItem,
} from '../../src/application/effects';
import {
  createInventoryState,
  equipItem,
  hasItem,
  toInventoryView,
} from '../../src/domain/inventory';
import { fixtureCatalog } from '../helpers/save-fixtures';
import { snapshot } from '../helpers/dialogue-fixtures';

const RELAY = 'item_tool_relay_scanner';
const NOTCH = 'item_consumable_notch';

function resolveFromCatalog(items: Record<string, ItemResolution>): ResolveItem {
  return (itemId: string) => items[itemId];
}

/** Minimal fixture catalog resolver, frozen to the WO-022 item contract. */
const resolver: ResolveItem = resolveFromCatalog({
  [RELAY]: {
    itemId: RELAY,
    stackable: false,
    questProtected: false,
    slot: 'tool',
  },
  [NOTCH]: { itemId: NOTCH, stackable: true, questProtected: false },
});

function addRelay() {
  return { kind: 'add_item', itemId: RELAY } as const;
}

/**
 * A dialogue whose entry node grants the scanner and whose first choice pays
 * two notches then the next node consumes one notch — all real `Effect`s
 * flowing through translateEffects.
 */
function inventoryDialogue(): DialogueManifest {
  return {
    id: 'dlg_inventory_probe',
    entryNode: 'n01',
    nodes: {
      n01: {
        speaker: 'npc_ye',
        textKey: 'dlg_inventory_probe.n01',
        tags: [],
        onEnterEffects: [addRelay()],
        choices: [
          {
            id: 'c_trade',
            textKey: 'dlg_inventory_probe.n01.c_trade',
            conditions: [],
            effects: [{ kind: 'add_item', itemId: NOTCH, count: 2 }],
            next: 'n02',
          },
          {
            id: 'c_leave',
            textKey: 'dlg_inventory_probe.n01.c_leave',
            conditions: [],
            effects: [],
            next: 'n02',
          },
        ],
      },
      n02: {
        speaker: 'npc_ye',
        textKey: 'dlg_inventory_probe.n02',
        tags: [],
        onEnterEffects: [{ kind: 'remove_item', itemId: NOTCH }],
        choices: [],
      },
    },
  };
}

function collectEffects(...transitions: { effects: EffectRequest[] }[]): EffectRequest[] {
  return transitions.flatMap((t) => t.effects);
}

describe('FS-INV-001 application effect executor (AC-11)', () => {
  it('AC-11: distinct grants accumulate and emit one fact per applied request', () => {
    const effects: EffectRequest[] = [
      { kind: 'add_item', itemId: NOTCH, count: 2, instanceId: 't1:0' },
      { kind: 'add_item', itemId: NOTCH, count: 1, instanceId: 't2:0' },
      { kind: 'add_item', itemId: RELAY, instanceId: 't3:0' },
    ];
    const { state, facts, applied } = applyItemEffects({
      inventory: createInventoryState(),
      effects,
      resolveItem: resolver,
    });
    expect(state.items[NOTCH]?.count).toBe(3);
    expect(state.items[RELAY]?.count).toBe(1);
    expect(applied.map((a) => a.outcome)).toEqual(['applied', 'applied', 'applied']);
    expect(facts).toEqual([
      { kind: 'item.acquired', itemId: NOTCH, count: 2, occurrenceId: 't1:0' },
      { kind: 'item.acquired', itemId: NOTCH, count: 1, occurrenceId: 't2:0' },
      { kind: 'item.acquired', itemId: RELAY, count: 1, occurrenceId: 't3:0' },
    ]);
  });

  it('AC-11: replaying the same request list produces zero facts and no double-count', () => {
    const effects: EffectRequest[] = [
      { kind: 'add_item', itemId: NOTCH, count: 2, instanceId: 't1:0' },
      { kind: 'add_item', itemId: RELAY, instanceId: 't2:0' },
    ];
    const first = applyItemEffects({
      inventory: createInventoryState(),
      effects,
      resolveItem: resolver,
    });
    const replay = applyItemEffects({ inventory: first.state, effects, resolveItem: resolver });
    expect(replay.applied.map((a) => a.outcome)).toEqual(['duplicate', 'duplicate']);
    expect(replay.facts).toEqual([]);
    expect(replay.state).toEqual(first.state);
  });

  it('AC-11: grant-then-remove across two committed transitions nets to zero and facts carry occurrenceId', () => {
    const effects: EffectRequest[] = [
      { kind: 'add_item', itemId: NOTCH, count: 2, instanceId: 't1:0' },
      { kind: 'remove_item', itemId: NOTCH, count: 2, instanceId: 't2:0' },
    ];
    const { state, facts } = applyItemEffects({
      inventory: createInventoryState(),
      effects,
      resolveItem: resolver,
    });
    expect(hasItem(state, NOTCH)).toBe(false);
    expect(state.ledger).toEqual([`grant:t1:0:${NOTCH}`, `remove:t2:0:${NOTCH}`]);
    expect(facts).toEqual([
      { kind: 'item.acquired', itemId: NOTCH, count: 2, occurrenceId: 't1:0' },
      { kind: 'item.removed', itemId: NOTCH, count: 2, occurrenceId: 't2:0' },
    ]);
  });

  it('AC-11: failed mutations emit no success fact and leave the inventory unchanged (atomic)', () => {
    const items: Record<string, ItemResolution> = {
      [RELAY]: {
        itemId: RELAY,
        stackable: false,
        questProtected: false,
        slot: 'tool',
      },
      item_document_keystone: {
        itemId: 'item_document_keystone',
        stackable: false,
        questProtected: true,
      },
      [NOTCH]: { itemId: NOTCH, stackable: true, questProtected: false },
    };
    const effects = [
      { kind: 'add_item', itemId: NOTCH, count: 1, instanceId: 't0:0' },
      { kind: 'add_item', itemId: 'item_document_keystone', instanceId: 't1:0' },
      { kind: 'remove_item', itemId: NOTCH, count: 2, instanceId: 't2:0' },
      { kind: 'add_item', itemId: 'item_document_keystone', instanceId: 't1:0' },
      { kind: 'remove_item', itemId: 'item_document_keystone', instanceId: 't3:0' },
    ] as EffectRequest[];
    const { state, facts, applied } = applyItemEffects({
      inventory: createInventoryState(),
      effects,
      resolveItem: resolveFromCatalog(items),
    });
    expect(applied).toMatchObject([
      { itemId: NOTCH, outcome: 'applied' },
      { itemId: 'item_document_keystone', outcome: 'applied' },
      { itemId: NOTCH, outcome: 'skipped', skipReason: 'insufficient-stack' },
      { itemId: 'item_document_keystone', outcome: 'duplicate' },
      { itemId: 'item_document_keystone', outcome: 'skipped', skipReason: 'quest-protected' },
    ]);
    // Only the two successful grants mutated the inventory.
    expect(facts.length).toBe(2);
    expect(state.items[NOTCH]).toEqual({ itemId: NOTCH, count: 1 });
    expect(state.items['item_document_keystone']).toEqual({
      itemId: 'item_document_keystone',
      count: 1,
    });
  });

  it('AC-11: an unknown item skips with a typed reason and no fact', () => {
    const { state, facts, applied } = applyItemEffects({
      inventory: createInventoryState(),
      effects: [{ kind: 'add_item', itemId: 'item_ghost', instanceId: 't1:0' }],
      resolveItem: () => undefined,
    });
    expect(applied).toEqual([
      {
        itemId: 'item_ghost',
        occurrenceId: 't1:0',
        outcome: 'skipped',
        skipReason: 'unknown-item',
      },
    ]);
    expect(facts).toEqual([]);
    expect(state).toEqual(createInventoryState());
  });
});

describe('FS-INV-001 executor + dialogue seam (AC-12/AC-13)', () => {
  function runFlow() {
    const manifest = inventoryDialogue();
    let dialogue: DialogueSavedState = createDialogueDomain();
    const start = dialogueStart(dialogue, manifest, {
      requestId: 'ReqInventoryStart',
      dialogueId: manifest.id,
    });
    if (start.status !== 'committed') throw new Error('start');
    dialogue = start.state;
    const sel = dialogueSelect(
      dialogue,
      manifest,
      {
        requestId: 'ReqInventoryTrade',
        choiceId: 'c_trade',
      },
      snapshot()
    );
    if (sel.status !== 'committed') throw new Error('select c_trade');
    dialogue = sel.state;
    return { manifest, dialogue, transitions: [start.transition, sel.transition] };
  }

  it('AC-12: dialogue-emitted effects drive the inventory; occurrenceId is the stable instanceId', () => {
    const { dialogue, transitions } = runFlow();
    const applied = applyItemEffects({
      inventory: createInventoryState(),
      effects: collectEffects(...transitions),
      resolveItem: resolver,
    });
    // n01 onEnter granted the unique scanner; choice paid 2 notches; n02 onEnter
    // consumed 1 notch → 1 remains.
    expect(hasItem(applied.state, RELAY)).toBe(true);
    expect(applied.state.items[NOTCH]).toEqual({ itemId: NOTCH, count: 1 });
    expect(applied.facts.map((f) => f.occurrenceId)).toEqual([
      'dialog:dlg_inventory_probe#1#1:0',
      'dialog:dlg_inventory_probe#1#2:0',
      'dialog:dlg_inventory_probe#1#2:1',
    ]);
    expect(applied.facts.filter((f) => f.kind === 'item.removed')).toEqual([
      {
        kind: 'item.removed',
        itemId: NOTCH,
        count: 1,
        occurrenceId: 'dialog:dlg_inventory_probe#1#2:1',
      },
    ]);
    void dialogue;
  });

  it('AC-12: replaying the same transition effects on a fresh save is byte-identical (reload determinism)', () => {
    const { transitions } = runFlow();
    const effects = collectEffects(...transitions);
    const a = applyItemEffects({
      inventory: createInventoryState(),
      effects,
      resolveItem: resolver,
    });
    const b = applyItemEffects({
      inventory: createInventoryState(),
      effects,
      resolveItem: resolver,
    });
    expect(a.state).toEqual(b.state);
    expect(a.facts).toEqual(b.facts);
  });

  it('AC-13: the executor never touches Dialogue/Quest state and equip stays application-side', () => {
    const { dialogue, transitions } = runFlow();
    const applied = applyItemEffects({
      inventory: createInventoryState(),
      effects: collectEffects(...transitions),
      resolveItem: resolver,
    });
    // Executor took only inventory: the dialogue snapshot is untouched.
    expect(dialogue.active?.dialogueId).toBe('dlg_inventory_probe');
    expect(dialogue.active?.history.map((h) => h.transitionId)).toEqual([
      'dialog:dlg_inventory_probe#1#1',
      'dialog:dlg_inventory_probe#1#2',
    ]);

    // Equipment is a deterministic application-layer step on top of granted
    // state — never injected by the dialogue runtime.
    const equipped = equipItem(applied.state, { itemId: RELAY, slot: 'tool' });
    expect(equipped.outcome).toBe('equipped');
    expect(equipped.state.equipped['tool']).toBe(RELAY);
    const view = toInventoryView(equipped.state);
    expect(view.equipped).toEqual({ tool: RELAY });
    // Dialogue still has zero inventory knowledge even after equipment exists.
    expect(Object.keys(dialogue.active ?? {})).not.toContain('inventory');
  });

  it('AC-11/12: removal of the equipped final unit via the executor is refused at the domain, no fact', () => {
    let state = createInventoryState();
    state = applyItemEffects({
      inventory: state,
      effects: [{ kind: 'add_item', itemId: RELAY, instanceId: 't1:0' }],
      resolveItem: resolver,
    }).state;
    state = equipItem(state, { itemId: RELAY, slot: 'tool' }).state;
    const removal = applyItemEffects({
      inventory: state,
      effects: [{ kind: 'remove_item', itemId: RELAY, instanceId: 't2:0' }],
      resolveItem: resolver,
    });
    expect(removal.applied[0]).toEqual({
      itemId: RELAY,
      occurrenceId: 't2:0',
      outcome: 'skipped',
      skipReason: 'item-equipped',
    });
    expect(removal.facts).toEqual([]);
    expect(removal.state.equipped['tool']).toBe(RELAY);
    expect(hasItem(removal.state, RELAY)).toBe(true);
  });
});

describe('FS-INV-001 executor + save content gate (AC-11)', () => {
  it('returns applied/facts deterministically for a catalog-derived resolver', () => {
    const catalog = fixtureCatalog();
    const items: Record<string, ItemResolution> = {};
    for (const [id, it] of Object.entries(catalog.items)) {
      items[id] = {
        itemId: id,
        stackable: it.stackable,
        questProtected: it.questProtected,
        ...(it.slot !== undefined ? { slot: it.slot as ItemResolution['slot'] } : {}),
      } as ItemResolution;
    }
    const r = resolveFromCatalog(items);
    const { state } = applyItemEffects({
      inventory: createInventoryState(),
      effects: [
        { kind: 'add_item', itemId: 'item_tool_relay_scanner', instanceId: 'x0' },
        { kind: 'add_item', itemId: 'item_consumable_notch', count: 3, instanceId: 'x1' },
      ],
      resolveItem: r,
    });
    expect(state.items['item_tool_relay_scanner']).toEqual({
      itemId: 'item_tool_relay_scanner',
      count: 1,
    });
    expect(state.items['item_consumable_notch']).toEqual({
      itemId: 'item_consumable_notch',
      count: 3,
    });
  });
});
