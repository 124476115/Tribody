/**
 * FS-SAVE-001 AC-05 — content compatibility & continuation-critical referential
 * validation. Content mismatch and stale observability history behave per spec.
 */
import { describe, it, expect } from 'vitest';
import {
  checkContentVersion,
  validateContinuationRefs,
  assertContinuationRefs,
  type ContentCatalog,
} from '../../../src/application/save';
import { SaveError } from '../../../src/domain/save';
import { basePayload, combinedRuntime, fixtureCatalog } from '../../helpers/save-fixtures';
import {
  addItem,
  createInventoryState,
  type InventorySavedState,
} from '../../../src/domain/inventory';

function fullPayload() {
  const rt = combinedRuntime();
  return {
    ...basePayload(),
    domain: {
      dialogue: rt.dialogue,
      quest: rt.quest,
      exploration: rt.exploration,
      progression: rt.progression,
      skills: rt.skills,
      inventory: createInventoryState(),
    },
  };
}

function withInventory(payload: ReturnType<typeof fullPayload>, inventory: InventorySavedState) {
  return { ...payload, domain: { ...payload.domain, inventory } };
}

describe('WO-013 content compatibility', () => {
  it('equal contentVersion passes; unlisted mismatch fails typed and never silently loads', () => {
    const catalog = fixtureCatalog();
    expect(() => checkContentVersion('0.1.0', catalog)).not.toThrow();
    const mismatch = () => checkContentVersion('0.2.0', catalog);
    expect(mismatch).toThrowError(SaveError);
    expect(() =>
      checkContentVersion('0.1.0', catalog, new Map([['0.2.0', ['0.1.0']]]))
    ).not.toThrow();
  });

  it('chapter/scene relationship is validated', () => {
    const catalog = fixtureCatalog();
    const ok = fullPayload();
    expect(validateContinuationRefs(ok, catalog)).toEqual([]);

    const wrongScene = { ...ok, activeSceneId: 'sc_ch04_observatory' };
    expect(() => assertContinuationRefs(wrongScene, catalog)).toThrowError(SaveError);

    const unknownChapter = { ...ok, activeChapterId: 'ch_unknown' };
    expect(() => assertContinuationRefs(unknownChapter, catalog)).toThrowError(SaveError);
  });

  it('every persisted quest objective id present in the manifest objective set is required', () => {
    const catalog = fixtureCatalog();
    const ok = fullPayload();
    const cleared = { ...ok, domain: { ...ok.domain, quest: { quests: {} } } };
    // empty persisted quest map still validates? quest state empty is valid (v1)
    expect(validateContinuationRefs(cleared, catalog)).toEqual([]);

    const missing = JSON.parse(JSON.stringify(ok)) as typeof ok;
    const quests = missing.domain.quest.quests;
    const ramp = quests['q_ramp'];
    if (!ramp) throw new Error('fixture');
    ramp.objectives['obj_ghost'] = {
      objectiveId: 'obj_ghost',
      complete: true,
      matchedKeys: [],
    };
    expect(() => assertContinuationRefs(missing, catalog)).toThrowError(SaveError);
  });

  it('an unknown persisted quest id is content-incompatible', () => {
    const catalog = fixtureCatalog();
    const ok = fullPayload();
    const extra = JSON.parse(JSON.stringify(ok)) as typeof ok;
    extra.domain.quest.quests['q_never_authored'] = {
      questId: 'q_never_authored',
      status: 'available',
      objectives: {},
      processedEventIds: [],
      nextTransitionOrdinal: 1,
      history: [],
    };
    expect(() => assertContinuationRefs(extra, catalog)).toThrowError(SaveError);
  });

  it('active dialogue node and pinned skill-check choice are validated', () => {
    const catalog = fixtureCatalog();
    const rt = combinedRuntime();
    const payload = {
      ...basePayload(),
      domain: {
        dialogue: rt.dialogue,
        quest: rt.quest,
        exploration: rt.exploration,
        progression: rt.progression,
        skills: rt.skills,
        inventory: createInventoryState(),
      },
    };
    expect(validateContinuationRefs(payload, catalog)).toEqual([]);

    const activeSession = rt.dialogue.active;
    if (!activeSession) throw new Error('fixture');
    const brokenNode = {
      ...payload,
      domain: {
        dialogue: {
          ...rt.dialogue,
          active: { ...activeSession, pendingCheck: { nodeId: 'n99', choiceId: 'c_skill' } },
        },
        quest: rt.quest,
        exploration: rt.exploration,
        progression: rt.progression,
        skills: rt.skills,
        inventory: createInventoryState(),
      },
    };
    expect(() => assertContinuationRefs(brokenNode, catalog)).toThrowError(SaveError);

    const unskilled = JSON.parse(JSON.stringify(rt)) as typeof rt;
    const active = unskilled.dialogue.active;
    if (!active) throw new Error('fixture');
    active.pendingCheck = { nodeId: 'n01', choiceId: 'c_a' }; // node n01 c_a has no skillCheck
    const payload2 = {
      ...basePayload(),
      domain: {
        dialogue: unskilled.dialogue,
        quest: rt.quest,
        exploration: rt.exploration,
        progression: rt.progression,
        skills: rt.skills,
        inventory: createInventoryState(),
      },
    };
    expect(() => assertContinuationRefs(payload2, catalog)).toThrowError(SaveError);

    const onNodeNoCheck = JSON.parse(JSON.stringify(rt)) as typeof rt;
    if (!onNodeNoCheck.dialogue.active) throw new Error('fixture');
    onNodeNoCheck.dialogue.active.mode = 'onNode';
    onNodeNoCheck.dialogue.active.pendingCheck = null;
    const payload3 = {
      ...basePayload(),
      domain: {
        dialogue: onNodeNoCheck.dialogue,
        quest: onNodeNoCheck.quest,
        exploration: onNodeNoCheck.exploration,
        progression: onNodeNoCheck.progression,
        skills: onNodeNoCheck.skills,
        inventory: createInventoryState(),
      },
    };
    expect(validateContinuationRefs(payload3, catalog)).toEqual([]);
  });

  it('observability-only history may reference stale content', () => {
    const catalog = fixtureCatalog();
    const rt = combinedRuntime();
    const staleHistory = JSON.parse(JSON.stringify(rt)) as typeof rt;
    if (staleHistory.quest.quests['q_ramp']) {
      staleHistory.quest.quests['q_ramp'].history.push({
        kind: 'quest_started',
        questId: 'q_ramp',
        transitionId: 'quest:q_ramp#0',
        seq: 1,
      });
    }
    const payload = {
      ...basePayload(),
      domain: {
        dialogue: rt.dialogue,
        quest: staleHistory.quest,
        exploration: rt.exploration,
        progression: rt.progression,
        skills: rt.skills,
        inventory: createInventoryState(),
      },
    };
    expect(validateContinuationRefs(payload, catalog)).toEqual([]);
  });

  it('validateContinuationRefs returns violations; assertContinuationRefs throws typed', () => {
    const catalog: ContentCatalog = { ...fixtureCatalog(), quests: {} };
    const s = (p: ReturnType<typeof fullPayload>) => validateContinuationRefs(p, catalog);
    const ok = { ...fullPayload(), domain: { ...fullPayload().domain, quest: { quests: {} } } };
    expect(s(ok)).toEqual([]);
    const bad = { ...ok, activeChapterId: 'ch_unknown' };
    const violations = s(bad);
    expect(violations.length).toBeGreaterThan(0);
    expect(() => assertContinuationRefs(bad, catalog)).toThrowError(SaveError);
  });
});

describe('FS-INV-001 inventory content compatibility', () => {
  function inv() {
    let s: InventorySavedState = {
      items: {},
      equipped: {},
      ledger: [],
    };
    s = addItem(s, {
      itemId: 'item_tool_relay_scanner',
      occurrenceId: 'occ-g1',
      stackable: false,
    }).state;
    return s;
  }

  it('valid inventory passes; validation failures are typed violations', () => {
    const catalog = fixtureCatalog();
    const ok = withInventory(fullPayload(), inv());
    expect(validateContinuationRefs(ok, catalog)).toEqual([]);
  });

  it('owned item ids referencing catalog-missing items never silently pass', () => {
    const catalog = fixtureCatalog();
    const owned = inv();
    owned.items = { item_ghost: { itemId: 'item_ghost', count: 1 } };
    const payload = withInventory(fullPayload(), owned);
    const violations = validateContinuationRefs(payload, catalog);
    expect(violations.length).toBeGreaterThan(0);
    expect(() => assertContinuationRefs(payload, catalog)).toThrowError(SaveError);
  });

  it('equipped item must exist in the catalog AND be owned', () => {
    const catalog = fixtureCatalog();
    // equipped value may not be owned — invalid.
    const notOwned = inv();
    notOwned.equipped = {
      tool: 'item_consumable_notch',
    } as InventorySavedState['equipped'];
    const p1 = withInventory(fullPayload(), notOwned);
    const v1 = validateContinuationRefs(p1, catalog);
    expect(v1.length).toBeGreaterThan(0);
    expect(() => assertContinuationRefs(p1, catalog)).toThrowError(SaveError);

    // owned but the stored slot is not the authored slot.
    const wrongSlot = inv();
    wrongSlot.equipped = { device: 'item_tool_relay_scanner' } as InventorySavedState['equipped'];
    const p2 = withInventory(fullPayload(), wrongSlot);
    const v2 = validateContinuationRefs(p2, catalog);
    expect(v2.length).toBeGreaterThan(0);
    expect(() => assertContinuationRefs(p2, catalog)).toThrowError(SaveError);
  });

  it('a non-stackable item persisted with count > 1 is a content violation', () => {
    const catalog = fixtureCatalog();
    const bad = inv();
    bad.items['item_tool_relay_scanner'] = { itemId: 'item_tool_relay_scanner', count: 2 };
    const payload = withInventory(fullPayload(), bad);
    expect(() => assertContinuationRefs(payload, catalog)).toThrowError(SaveError);
  });

  it('equipping to a slot the catalog does not grant the item is a content violation', () => {
    const catalog = fixtureCatalog();
    const ghostEquip = inv();
    ghostEquip.equipped = {
      keepsake: 'item_tool_relay_scanner',
    } as InventorySavedState['equipped'];
    const payload = withInventory(fullPayload(), ghostEquip);
    expect(() => assertContinuationRefs(payload, catalog)).toThrowError(SaveError);
    const violations = validateContinuationRefs(payload, catalog);
    expect(violations.length).toBeGreaterThan(0);
  });
});
