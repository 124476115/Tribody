/**
 * Save System — application barrel (FS-SAVE-001)
 *
 * Use-cases / orchestration layer. Talks to domain/save, adapters/ports, and
 * the content domains; never to dedicated framework code.
 */
export * from './ports';
export * from './recordBuild';
export * from './contentCompatibility';
export * from './loadPipeline';
export * from './slotPolicy';
export * from './atomicWrite';
export * from './importExport';
export * from './save-service';
export type {
  MigrationRegistry,
  MigrationStep,
  SaveRecord,
  SaveSlotDoc,
  SaveError,
} from '../../domain/save';
