/**
 * Save System — file import/export (FS-SAVE-001)
 *
 * Browser-only adapter: downloads a serialized record and reads one back
 * through a file picker. Called by the UI after SaveService.exportSave /
 * before importSave; the size/type gates live in SaveService.
 */
import type { SaveRecord } from '../../domain/save';

export function exportSaveFile(record: SaveRecord, suggestedName: string): void {
  const text = JSON.stringify({ ...record, checksum: record.checksum });
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = suggestedName.endsWith('.json') ? suggestedName : `${suggestedName}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function importSaveFile(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file === undefined) {
        reject(new Error('no file selected'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const text = typeof reader.result === 'string' ? reader.result : '';
        resolve(text);
      };
      reader.onerror = () => {
        reject(reader.error ?? new Error('file read failed'));
      };
      reader.readAsText(file);
    };
    input.click();
  });
}
