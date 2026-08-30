# FS-SAVE-001 — Save / Load

## Status
Approved

## Player value
Trust that a long narrative RPG will not lose progress.

## Requirements
- 3 manual
- 5 rotating auto
- 1 quick slot
- IndexedDB
- export/import
- checksum
- schema migration
- autosave checkpoint API

## Atomicity
Write new record first; update slot pointer only after successful validation.

## Acceptance
- AC-01 roundtrip exact domain invariants
- AC-02 migration chain sequential
- AC-03 corrupted current autosave can fall back
- AC-04 imported file validated before storage
- AC-05 old content IDs handled by explicit migration/compat map
