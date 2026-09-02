/**
 * Save System — content compatibility (FS-SAVE-001)
 *
 * Load/import refuse saves whose continuation is not loadable against the
 * CURRENT content catalog. Two verifiers:
 * - `checkContentVersion`: the version string equality gate (+ per-app
 *   compatibility map).
 * - `validateContinuationRefs`: continuation-critical referential integrity
 *   only — chapter/scene relationships, active dialogue node + pinned skill
 *   check, and persisted quest objective identity. Stale OBSERVABILITY history
 *   (dialogue/quest history ledgers) is allowed to reference removed content.
 */
import { fail, SaveError } from '../../domain/save';
import type { SavePayload } from '../../domain/save';
import type { EquipmentSlot, InventorySavedState, ItemStack } from '../../domain/inventory';
import type { ContentCatalog } from './ports';

/** Content version equality gate. Compatible version pairs may be supplied. */
export function checkContentVersion(
  contentVersion: string,
  catalog: ContentCatalog,
  compatMap: ReadonlyMap<string, readonly string[]> = new Map()
): void {
  if (contentVersion === catalog.contentVersion) return;
  const compatible = compatMap.get(contentVersion);
  if (compatible?.includes(catalog.contentVersion) === true) return;
  throw new SaveError(
    'content-incompatible',
    `save content version "${contentVersion}" is not compatible with current "${catalog.contentVersion}"`
  );
}

/** Return human-readable violations; empty array means the save is loadable. */
export function validateContinuationRefs(payload: SavePayload, catalog: ContentCatalog): string[] {
  const violations: string[] = [];
  const { activeChapterId, activeSceneId, domain } = payload;

  const chapter = catalog.chapters[activeChapterId];
  if (chapter === undefined) {
    violations.push(`unknown chapter "${activeChapterId}"`);
  }
  const scene = catalog.scenes[activeSceneId];
  if (scene === undefined) {
    violations.push(`unknown scene "${activeSceneId}"`);
  } else if (scene.chapterId !== activeChapterId) {
    violations.push(
      `scene "${activeSceneId}" belongs to "${scene.chapterId}", not "${activeChapterId}"`
    );
  }

  for (const [questId, state] of Object.entries(domain.quest.quests)) {
    const manifest = catalog.quests[questId];
    if (manifest === undefined) {
      violations.push(`unknown persisted quest "${questId}"`);
      continue;
    }
    for (const objectiveId of Object.keys(state.objectives)) {
      if (!manifest.objectiveIds.includes(objectiveId)) {
        violations.push(
          `persisted objective "${objectiveId}" of quest "${questId}" no longer exists in content`
        );
      }
    }
  }

  const active = domain.dialogue.active;
  if (active !== null) {
    const { dialogueId, mode, nodeId, pendingCheck } = active;
    if (pendingCheck !== null) {
      const nodeMap = catalog.nodes[dialogueId];
      const node = nodeMap === undefined ? undefined : nodeMap[pendingCheck.nodeId];
      if (node === undefined) {
        violations.push(
          `pinned skill-check node "${pendingCheck.nodeId}" missing in dialogue "${dialogueId}"`
        );
      } else {
        const choice = node.choices.find((c) => c.id === pendingCheck.choiceId);
        if (choice === undefined || choice.skillCheck === undefined) {
          violations.push(
            `pinned skill-check choice "${pendingCheck.choiceId}" no longer carries a skill check`
          );
        }
      }
    } else if (mode === 'onNode' && nodeId !== null) {
      const nodeMap = catalog.nodes[dialogueId];
      if (nodeMap?.[nodeId] === undefined) {
        violations.push(`active dialogue node "${nodeId}" missing in dialogue "${dialogueId}"`);
      }
    }
  }

  // Inventory continuation validity (FS-INV-001 AC-09/AC-10). There is NO
  // silent hydration drop: every owned item must exist in the catalog, every
  // equipped item must exist AND be owned, the stored slot must match the
  // authored slot, and persisted stackability must match the catalog.
  // Pre-v5 domains (unit fixtures) carry no inventory: treat as empty.
  const persisted = (domain as unknown as { inventory?: InventorySavedState }).inventory;
  const items: Record<string, ItemStack> = persisted?.items ?? {};
  const equipped: Partial<Record<EquipmentSlot, string>> = persisted?.equipped ?? {};
  for (const itemId of Object.keys(items)) {
    const item = catalog.items[itemId];
    if (item === undefined) {
      violations.push(`owned item "${itemId}" no longer exists in content`);
      continue;
    }
    const count = items[itemId]?.count ?? 0;
    if (!item.stackable && count > 1) {
      violations.push(`non-stackable item "${itemId}" persisted with count ${String(count)}`);
    }
  }
  for (const slot of Object.keys(equipped)) {
    const itemId = equipped[slot as keyof typeof equipped];
    if (itemId === undefined) continue;
    const item = catalog.items[itemId];
    if (item === undefined) {
      violations.push(`equipped item "${itemId}" no longer exists in content`);
      continue;
    }
    if (items[itemId] === undefined) {
      violations.push(`equipped item "${itemId}" is not currently owned`);
    }
    if (item.slot !== undefined && item.slot !== slot) {
      violations.push(`equipped item "${itemId}" authored for slot "${item.slot}", not "${slot}"`);
    }
  }

  return violations;
}

/** Throw a typed content-incompatible error listing all violations. */
export function assertContinuationRefs(payload: SavePayload, catalog: ContentCatalog): void {
  const violations = validateContinuationRefs(payload, catalog);
  if (violations.length > 0) {
    fail('content-incompatible', `save references unavailable content: ${violations.join('; ')}`);
  }
}
