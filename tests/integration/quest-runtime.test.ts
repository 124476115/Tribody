/**
 * WO-012 — integration: the full triage line (mirrors
 * `content_examples/quest_ch04_sample.yaml`: collect camera evidence ×2 →
 * raw-data compare request → talk to the colleague → resolved_success →
 * archive). No production prose is copied; fixtures use abstract keys.
 */
import { describe, it, expect } from 'vitest';
import {
  createQuestDomain,
  getJournalView,
  questApplyEvent,
  questArchive,
  questInit,
  questStart,
  type QuestApplyResult,
  type QuestSavedState,
} from '../../src/domain/quest';
import type { QuestManifest } from '../../src/domain/content';
import { domainEvent, sampleQuest } from '../helpers/quest-fixtures';
import { required } from '../helpers/content-fixtures';

const MANIFEST = sampleQuest();

class Runner {
  manifests: Record<string, QuestManifest> = { [MANIFEST.id]: MANIFEST };
  domain: QuestSavedState = createQuestDomain();
  transitionKinds: string[] = [];

  constructor() {
    const init = questInit(this.domain, this.manifests);
    if (init.status !== 'committed') throw new Error('init failed');
    this.domain = init.state;
  }

  start(): void {
    const r = questStart(this.domain, this.manifests, { questId: MANIFEST.id });
    if (r.status !== 'committed') throw new Error('start failed');
    this.domain = r.state;
    this.transitionKinds.push(r.transitions[0]?.kind ?? '');
  }

  apply(eventId: string, type: string, payload: Record<string, string>): QuestApplyResult {
    const r = questApplyEvent(this.domain, this.manifests, domainEvent(eventId, type, payload));
    if (r.status === 'committed') {
      this.domain = r.state;
      for (const t of r.transitions) {
        this.transitionKinds.push(`${t.kind}(${t.objectiveIds.join(',')})`);
      }
    }
    return r;
  }
}

describe('WO-012 integration — sample triage quest', () => {
  it('completes evidence → compare → talk, resolves exactly once, and archives', () => {
    const run = new Runner();
    expect(Object.keys(run.domain.quests)).toEqual([MANIFEST.id]);
    run.start();
    expect(run.domain.quests[MANIFEST.id]?.status).toBe('active');

    const firstEvidence = run.apply('evt-1', 'evidence.collected', {
      evidenceId: 'ev_camera_original',
    });
    expect(firstEvidence.status).toBe('committed');
    let questState = run.domain.quests[MANIFEST.id];
    if (questState === undefined) throw new Error('missing quest');
    expect(questState.status).toBe('active');
    expect(questState.objectives['obj_camera']?.complete).toBe(false);
    expect(questState.objectives['obj_camera']?.matchedKeys).toEqual(['ev_camera_original']);

    const compare = run.apply('evt-2', 'ch04.raw_data_compare_requested', {});
    expect(compare.status).toBe('committed');
    questState = run.domain.quests[MANIFEST.id];
    expect(questState?.objectives['obj_compare']?.complete).toBe(true);

    // A semantic (not structured) event advances the listen-only objective.
    const redeliveredDataRequest = run.apply('evt-2', 'ch04.raw_data_compare_requested', {});
    expect(redeliveredDataRequest.status).toBe('irrelevant');

    const secondEvidence = run.apply('evt-3', 'evidence.collected', {
      evidenceId: 'ev_camera_control',
    });
    if (secondEvidence.status !== 'committed') throw new Error('evidence2 must commit');
    questState = run.domain.quests[MANIFEST.id];
    expect(questState?.objectives['obj_camera']?.complete).toBe(true);
    expect(questState?.status).toBe('active'); // obj_talk still pending

    const talk = run.apply('evt-4', 'npc.talked', { npcId: 'npc_lab_colleague' });
    expect(talk.status).toBe('committed');
    if (talk.status !== 'committed') throw new Error('talk must commit');
    expect(talk.transitions).toHaveLength(1);
    const resolve = talk.transitions[0];
    if (resolve === undefined) throw new Error('no transition');
    expect(resolve.kind).toBe('quest_resolved');
    expect(resolve.resolution).toEqual({ onAllRequiredComplete: 'resolved_success' });

    questState = run.domain.quests[MANIFEST.id];
    expect(questState?.status).toBe('resolved_success');

    const journal = getJournalView(required(questState, 'quest state'), MANIFEST);
    expect(journal.status).toBe('resolved_success');
    expect(journal.resolution).toEqual({ onAllRequiredComplete: 'resolved_success' });
    expect(journal.objectives).toEqual([
      { id: 'obj_camera', type: 'collect_evidence', required: true, complete: true },
      { id: 'obj_compare', type: 'analyze', required: true, complete: true },
      { id: 'obj_talk', type: 'talk', required: true, complete: true },
    ]);

    // After resolution, a stray event must not re-run or regress anything.
    const stray = run.apply('evt-5', 'npc.talked', { npcId: 'npc_lab_colleague' });
    expect(stray.status).toBe('irrelevant');
    expect(run.domain.quests[MANIFEST.id]?.status).toBe('resolved_success');
    expect(run.domain.quests[MANIFEST.id]?.processedEventIds).toEqual([
      'evt-1',
      'evt-2',
      'evt-3',
      'evt-4',
    ]);

    const archive = questArchive(run.domain, run.manifests, { questId: MANIFEST.id });
    expect(archive.status).toBe('committed');
    if (archive.status !== 'committed') throw new Error('archive failed');
    run.transitionKinds.push(archive.transitions[0]?.kind ?? '');
    expect(archive.state.quests[MANIFEST.id]?.status).toBe('archived');
    expect(run.transitionKinds).toEqual([
      'quest_started',
      'objective_progressed(obj_camera)',
      'objective_completed(obj_compare)',
      'objective_completed(obj_camera)',
      'quest_resolved(obj_talk)',
      'quest_archived',
    ]);
  });
});
