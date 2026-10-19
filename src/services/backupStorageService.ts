import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { NativeVaultMedia } from './nativeVaultBridge';

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
 * Creates an object URL with application/json MIME type for direct anchor downloads.
 */
export function createBackupDownloadUrl(blob: Blob): string {
  const jsonBlob = blob.type === 'application/json'
    ? blob
    : new Blob([blob], { type: 'application/json;charset=utf-8' });
  return URL.createObjectURL(jsonBlob);
}

/**
 * Triggers a direct download to the user's device.
 * Priority order:
 * 1. Capacitor Native Filesystem (if wrapped in Android/iOS native app)
 * 2. Modern File System Access API (Desktop Chrome / Edge)
 * 3. Standard Blob URL anchor download (Android Chrome, Brave, Samsung Internet, PWA, Safari)
 */
export async function downloadBackupToDevice(
  blob: Blob,
  fileName: string
): Promise<{ success: boolean; method: string; path?: string }> {
  // Method 1: Capacitor Native Platform (Android / iOS native app)
  // Guarda el archivo DIRECTAMENTE en la carpeta pública "Descargas" (Downloads) del teléfono
  // para que el usuario pueda verlo desde "Mis Archivos", "Files de Google" o cualquier explorador.
  if (Capacitor.isNativePlatform()) {
    try {
      const base64Data = await blobToBase64(blob);

      // 1a. Intentar guardar en la carpeta pública DESCARGAS usando NativeVaultMedia (MediaStore.Downloads)
      try {
        const nativeRes = await NativeVaultMedia.saveBackupToDownloads({
          base64Data,
          filename: fileName,
          mimeType: 'application/json',
        });
        if (nativeRes && nativeRes.success) {
          return {
            success: true,
            method: 'native_downloads',
            path: nativeRes.path || 'Descargas',
          };
        }
      } catch (nativeErr) {
        console.warn('NativeVaultMedia.saveBackupToDownloads failed, trying exportMediaToDevice:', nativeErr);
      }

      // 1b. Intentar con exportMediaToDevice (MediaStore Downloads)
      try {
        const nativeRes2 = await NativeVaultMedia.exportMediaToDevice({
          base64Data,
          filename: fileName,
          mimeType: 'application/json',
          category: 'backup',
        });
        if (nativeRes2 && nativeRes2.success) {
          return {
            success: true,
            method: 'native_export_media',
            path: nativeRes2.path || nativeRes2.uri || 'Descargas',
          };
        }
      } catch (mediaErr) {
        console.warn('Native exportMediaToDevice failed:', mediaErr);
      }

      // 1c. Si falla MediaStore, intentar Filesystem
      try {
        await Filesystem.writeFile({
          path: fileName,
          data: base64Data,
          directory: Directory.Documents,
          recursive: true,
        });
        return { success: true, method: 'capacitor_filesystem' };
      } catch (fsErr) {
        console.warn('Filesystem.writeFile failed:', fsErr);
      }
    } catch (capErr) {
      console.warn('Capacitor filesystem write failed, falling back to browser download:', capErr);
    }
  }

  // Method 2: Modern File System Access API (Desktop Chrome / Edge user dialog)
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
        // User deliberately cancelled the picker dialog
        return { success: false, method: 'cancelled' };
      }
      console.warn('showSaveFilePicker failed or was rejected, falling back:', pickerErr);
    }
  }

  // Method 3: Standard Object URL anchor download
  // NEVER use data: URIs on Android/Chromium because Chromium security blocks anchor downloads from data: URLs!
  try {
    const jsonBlob = blob.type === 'application/json'
      ? blob
      : new Blob([blob], { type: 'application/json;charset=utf-8' });
    const blobUrl = URL.createObjectURL(jsonBlob);

    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileName;
    a.rel = 'noopener noreferrer';
    a.style.position = 'fixed';
    a.style.top = '-9999px';
    a.style.left = '-9999px';
    a.style.opacity = '0';
    document.body.appendChild(a);

    // Trigger click on anchor
    a.click();

    // Clean up DOM node quickly, but leave blobUrl alive for 3 minutes so
    // Android DownloadManager or browser background process finishes writing to disk
    setTimeout(() => {
      try {
        if (a.parentNode) {
          document.body.removeChild(a);
        }
      } catch {}
    }, 1500);

    setTimeout(() => {
      try {
        URL.revokeObjectURL(blobUrl);
      } catch {}
    }, 180000); // 3 minutes

    return { success: true, method: 'blob_download' };
  } catch (domErr) {
    console.error('All download methods failed:', domErr);
    return { success: false, method: 'failed' };
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
