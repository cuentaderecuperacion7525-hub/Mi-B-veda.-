import { Capacitor, registerPlugin } from '@capacitor/core';

export interface NativeMediaItemIdentifier {
  filename: string;
  size?: number;
  lastModified?: number;
  mimeType?: string;
  uri?: string;
}

export interface NativeVaultMediaPlugin {
  /**
   * Elimina un archivo multimedia de la galería pública usando MediaStore en Android
   */
  deleteFromGallery(options: {
    uri?: string;
    filename?: string;
    size?: number;
    lastModified?: number;
  }): Promise<{ success: boolean; message?: string }>;

  /**
   * Elimina por lotes un conjunto de archivos multimedia de la galería pública usando un único
   * diálogo del sistema en Android 11+ (MediaStore.createDeleteRequest).
   */
  deleteBatchFromGallery(options: {
    items: NativeMediaItemIdentifier[];
  }): Promise<{
    success: boolean;
    requested?: boolean;
    confirmedByUser?: boolean;
    matchedCount?: number;
    deletedCount?: number;
    message?: string;
    error?: string;
  }>;

  /**
   * Abre la aplicación nativa de Galería del dispositivo
   */
  openGalleryApp(): Promise<{ success: boolean; error?: string }>;
}

// Registro del plugin nativo de Capacitor (se enlaza en Android con VaultMediaPlugin.java)
export const NativeVaultMedia = registerPlugin<NativeVaultMediaPlugin>('VaultMedia');

/**
 * Retorna true si la app se está ejecutando como un APK nativo en Android o iOS
 */
export const isNativeApp = (): boolean => {
  return Capacitor.isNativePlatform();
};

/**
 * Abre la app nativa de galería de fotos de Android o iOS de manera directa
 */
export const openNativeGallery = async (): Promise<boolean> => {
  if (isNativeApp()) {
    try {
      const res = await NativeVaultMedia.openGalleryApp();
      if (res && res.success) return true;
    } catch (e) {
      console.warn('Could not launch gallery via native plugin:', e);
    }
  }

  try {
    const isAndroid = /Android/i.test(navigator.userAgent);
    if (isAndroid) {
      // Intent standard de Android para ver la Galería multimedia
      window.location.href = 'intent:#Intent;action=android.intent.action.VIEW;type=image/*;end';
    } else {
      window.open('photos-redirect://', '_blank');
    }
  } catch {}
  return true;
};

/**
 * Abre el explorador de archivos / gestor de descargas en Android
 */
export const openNativeFileManager = async (): Promise<boolean> => {
  try {
    const isAndroid = /Android/i.test(navigator.userAgent);
    if (isAndroid) {
      // Abre el gestor de archivos / descargas de Android
      window.location.href = 'intent:#Intent;action=android.intent.action.GET_CONTENT;type=*/*;category=android.intent.category.OPENABLE;end';
    } else {
      window.open('shareddocuments://', '_blank');
    }
  } catch {}
  return true;
};

/**
 * Función unificada para borrar un archivo individual de la galería pública.
 */
export const requestNativeGalleryDeletion = async (
  filename: string,
  uri?: string,
  size?: number,
  lastModified?: number
): Promise<{ handledNatively: boolean; success: boolean }> => {
  if (!isNativeApp()) {
    return { handledNatively: false, success: false };
  }

  try {
    (window as any).__isPickingFile = true;
    (window as any).__filePickingStartTime = Date.now();
    const result = await NativeVaultMedia.deleteFromGallery({ uri, filename, size, lastModified });
    return { handledNatively: true, success: result.success };
  } catch (error) {
    console.warn('Native deletion not handled or rejected by user:', error);
    return { handledNatively: true, success: false };
  }
};

/**
 * Función por lotes para borrar múltiples archivos originales con un solo diálogo nativo.
 */
export const requestNativeBatchGalleryDeletion = async (
  items: NativeMediaItemIdentifier[]
): Promise<{ handledNatively: boolean; success: boolean; requested?: boolean }> => {
  if (!isNativeApp() || !items || items.length === 0) {
    return { handledNatively: false, success: false };
  }

  try {
    (window as any).__isPickingFile = true;
    (window as any).__filePickingStartTime = Date.now();
    const result = await NativeVaultMedia.deleteBatchFromGallery({ items });
    return {
      handledNatively: true,
      success: result.success,
      requested: result.requested,
    };
  } catch (error) {
    console.warn('Native batch deletion error:', error);
    return { handledNatively: true, success: false };
  }
};
