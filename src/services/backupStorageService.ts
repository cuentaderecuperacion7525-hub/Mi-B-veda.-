import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

export interface StoredBackupMetadata {
  id: string;
  timestamp: number;
  fileName: string;
  itemCount: number;
  sizeBytes: number;
}

const BACKUP_DB_NAME = 'VaultLocalBackupsDB';
const BACKUP_STORE_NAME = 'local_backups';
const BACKUP_DB_VERSION = 1;

function openBackupDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(BACKUP_DB_NAME, BACKUP_DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(BACKUP_STORE_NAME)) {
        const store = db.createObjectStore(BACKUP_STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

/**
 * Saves a backup blob into internal IndexedDB storage so it is immediately
 * available for 1-tap restore on this device, even without downloading to filesystem.
 */
export async function saveInternalBackup(
  blob: Blob,
  fileName: string,
  itemCount: number
): Promise<StoredBackupMetadata> {
  const db = await openBackupDatabase();
  const id = `backup_${Date.now()}`;
  const meta: StoredBackupMetadata = {
    id,
    timestamp: Date.now(),
    fileName,
    itemCount,
    sizeBytes: blob.size,
  };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([BACKUP_STORE_NAME], 'readwrite');
    const store = tx.objectStore(BACKUP_STORE_NAME);
    const req = store.put({
      ...meta,
      blob,
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(new Error('Transacción abortada'));
  });

  // Prune older backups, keeping only the 5 most recent
  try {
    const all = await getStoredLocalBackups();
    if (all.length > 5) {
      const toDelete = all.slice(5);
      for (const item of toDelete) {
        await deleteStoredLocalBackup(item.id);
      }
    }
  } catch (err) {
    console.warn('Error pruning old backups:', err);
  }

  return meta;
}

/**
 * Lists all internal backups sorted from newest to oldest.
 */
export async function getStoredLocalBackups(): Promise<StoredBackupMetadata[]> {
  try {
    const db = await openBackupDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction([BACKUP_STORE_NAME], 'readonly');
      const store = tx.objectStore(BACKUP_STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        const records = (req.result || []) as Array<StoredBackupMetadata & { blob: Blob }>;
        const metas: StoredBackupMetadata[] = records.map((r) => ({
          id: r.id,
          timestamp: r.timestamp,
          fileName: r.fileName,
          itemCount: r.itemCount,
          sizeBytes: r.sizeBytes,
        }));
        metas.sort((a, b) => b.timestamp - a.timestamp);
        resolve(metas);
      };

      req.onerror = () => resolve([]);
    });
  } catch (err) {
    console.warn('Could not open backup database:', err);
    return [];
  }
}

/**
 * Retrieves the raw backup Blob by its internal ID.
 */
export async function getStoredLocalBackupBlob(id: string): Promise<Blob | null> {
  try {
    const db = await openBackupDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction([BACKUP_STORE_NAME], 'readonly');
      const store = tx.objectStore(BACKUP_STORE_NAME);
      const req = store.get(id);

      req.onsuccess = () => {
        if (req.result?.blob) {
          resolve(req.result.blob);
        } else {
          resolve(null);
        }
      };

      req.onerror = () => resolve(null);
    });
  } catch (err) {
    console.error('Error fetching stored backup blob:', err);
    return null;
  }
}

/**
 * Deletes an internal backup record by ID.
 */
export async function deleteStoredLocalBackup(id: string): Promise<void> {
  try {
    const db = await openBackupDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([BACKUP_STORE_NAME], 'readwrite');
      const store = tx.objectStore(BACKUP_STORE_NAME);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('Error deleting stored backup:', err);
  }
}

/**
 * Converts a Blob to a base64 string
 */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = reader.result as string;
      const base64 = res.includes(',') ? res.split(',')[1] : res;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Triggers a direct download to the user's device.
 * Tries modern File System Access API first, then Capacitor native filesystem if available,
 * and falls back to standard DOM download.
 */
export async function downloadBackupToDevice(
  blob: Blob,
  fileName: string
): Promise<{ success: boolean; method: string }> {
  // Method 1: Capacitor Native Platform (Android / iOS app)
  if (Capacitor.isNativePlatform()) {
    try {
      const base64Data = await blobToBase64(blob);
      await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Documents,
        recursive: true,
      });
      return { success: true, method: 'capacitor_filesystem' };
    } catch (capErr) {
      console.warn('Capacitor filesystem write failed, falling back:', capErr);
    }
  }

  // Method 2: Modern File System Access API (User chooses folder/file in Android Chrome / Edge)
  if (typeof (window as any).showSaveFilePicker === 'function') {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            description: 'Copia de Seguridad Bóveda Segura (.json)',
            accept: { 'application/json': ['.json'] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { success: true, method: 'save_file_picker' };
    } catch (pickerErr: any) {
      if (pickerErr?.name === 'AbortError') {
        // User cancelled the picker
        return { success: false, method: 'cancelled' };
      }
      console.warn('showSaveFilePicker failed or unpermitted, falling back:', pickerErr);
    }
  }

  // Method 3: Base64 Data URI download for Android PWA / Mobile (bypasses blob URL restrictions in Android DownloadManager)
  try {
    const base64Data = await blobToBase64(blob);
    const dataUri = `data:application/octet-stream;charset=utf-8;base64,${base64Data}`;
    const a = document.createElement('a');
    a.href = dataUri;
    a.download = fileName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        document.body.removeChild(a);
      } catch {}
    }, 1500);

    return { success: true, method: 'data_uri_download' };
  } catch (dataErr) {
    console.warn('Data URI download failed, trying standard blob download:', dataErr);
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
      }, 120000);

      return { success: true, method: 'anchor_download' };
    } catch (domErr) {
      console.error('All download methods failed:', domErr);
      return { success: false, method: 'failed' };
    }
  }
}

/**
 * Shares the backup file through the OS Share Sheet (Google Drive, WhatsApp, Gmail, etc.)
 */
export async function shareBackupFile(
  blob: Blob,
  fileName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const file = new File([blob], fileName, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: fileName,
        text: 'Copia de seguridad cifrada de Mi Bóveda',
      });
      return { success: true };
    } else {
      return { success: false, error: 'Compartir archivos no está soportado en este navegador.' };
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { success: false, error: 'Compartir cancelado' };
    }
    return { success: false, error: err?.message || 'Error al compartir' };
  }
}
