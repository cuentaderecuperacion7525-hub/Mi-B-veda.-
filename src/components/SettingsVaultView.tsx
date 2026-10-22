import React, { useState, useEffect, useRef } from 'react';
import {
  KeyRound,
  Download,
  Upload,
  Clock,
  Eye,
  EyeOff,
  Trash2,
  Check,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Shield,
  Fingerprint,
  ShieldAlert,
  X,
  ChevronRight,
  ChevronLeft,
  ArrowLeft,
  Smartphone,
  RefreshCw,
  Sparkles,
  Bell,
  Palette,
  RotateCcw,
  Undo2,
  ShieldCheck,
  FolderDown,
  Copy,
  Loader2,
} from 'lucide-react';
import { updateService, UpdateCheckResult } from '../services/updateService';
import { APP_VERSION, CURRENT_APP_VERSION, CURRENT_RELEASE_DATE } from '../version';
import { UpdateNotificationModal } from './UpdateNotificationModal';
import { BovedaUpdater } from './BovedaUpdater';
import { NeonSwitch } from './NeonSwitch';
import { themeService, VaultTheme, VAULT_THEMES } from '../services/themeService';
import { flipToLockService } from '../services/flipToLockService';
import {
  isRecoveryKeyConfigured,
  generateRecoveryKey,
  backupMasterKeyWithRecoveryKey,
  downloadRecoveryKeyFile,
  formatRecoveryKeyDisplay,
  disableRecoveryKey,
} from '../services/recoveryKeyService';
import {
  saveInternalBackup,
  downloadBackupToDevice,
  getStoredLocalBackups,
  getStoredLocalBackupBlob,
  deleteStoredLocalBackup,
  StoredBackupMetadata,
  createBackupDownloadUrl,
} from '../services/backupStorageService';
import {
  exportEncryptedBackupBlob,
  importEncryptedBackupBlobStream,
  BackupHeaderInfo,
  readBackupHeaderFromBlob,
  parseWithAutoRepair,
  clearVaultDatabase,
  getAllEncryptedItems,
  saveEncryptedItems,
  EncryptedVaultItem,
  getTrashItems,
  getTrashStats,
  emptyTrash,
  restoreFromTrash,
  batchRestoreFromTrash,
  deleteEncryptedItem,
  deleteMultipleEncryptedItems,
} from '../db/vaultDb';
import {
  deriveKeyFromPin,
  verifyKey,
  hexToBuf,
  bufToHex,
  generateSalt,
  createVerificationPayload,
  decryptBuffer,
  encryptBuffer,
  checkIsUnencryptedMedia,
} from '../crypto/vaultCrypto';
import {
  isBiometricsEnrolled,
  authenticateWithBiometrics,
} from '../services/biometricService';
import { registerBackHandler, triggerBackAction } from '../services/backButtonService';
import { formatFileSize } from '../utils/formatUtils';

interface SettingsVaultViewProps {
  masterKey: CryptoKey | null;
  sessionPin?: string | null;
  onMasterKeyUpdated: (newKey: CryptoKey) => void;
  autoLockMinutes: number;
  onAutoLockChange: (mins: number) => void;
  lockOnTabSwitch: boolean;
  onLockOnTabSwitchChange: (enabled: boolean) => void;
  onPhotosUpdated: () => void;
  onResetVault: () => void;
  showToast: (msg: string, type?: 'info' | 'success' | 'alert' | 'error') => void;
}

export const SettingsVaultView: React.FC<SettingsVaultViewProps> = ({
  masterKey,
  sessionPin,
  onMasterKeyUpdated,
  autoLockMinutes,
  onAutoLockChange,
  lockOnTabSwitch,
  onLockOnTabSwitchChange,
  onPhotosUpdated,
  onResetVault,
  showToast,
}) => {
  // Sub-menús de Configuración: null = menú principal vertical
  const [activeSubMenu, setActiveSubMenu] = useState<'security' | 'backup' | 'danger' | 'updates' | 'trash' | 'theme' | null>(() => {
    if (sessionStorage.getItem('open_updates_tab_on_settings') === 'true') {
      sessionStorage.removeItem('open_updates_tab_on_settings');
      return 'updates';
    }
    if (sessionStorage.getItem('open_backup_tab_on_settings') === 'true') {
      sessionStorage.removeItem('open_backup_tab_on_settings');
      return 'backup';
    }
    if (sessionStorage.getItem('open_trash_tab_on_settings') === 'true') {
      sessionStorage.removeItem('open_trash_tab_on_settings');
      return 'trash';
    }
    return null;
  });

  // Theme state
  const [currentTheme, setCurrentTheme] = useState<VaultTheme>(() => themeService.getTheme());
  useEffect(() => {
    return themeService.subscribe((t) => {
      setCurrentTheme(t);
    });
  }, []);

  const handleSelectTheme = (theme: VaultTheme) => {
    themeService.setTheme(theme);
    showToast(`Tema "${VAULT_THEMES[theme].name}" activado`, 'success');
  };

  // Recovery key states
  const [hasRecoveryKey, setHasRecoveryKey] = useState<boolean>(() => isRecoveryKeyConfigured());
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [newGeneratedKey, setNewGeneratedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [downloadedKey, setDownloadedKey] = useState(false);
  const [pinForNewKey, setPinForNewKey] = useState('');
  const [pinKeyError, setPinKeyError] = useState<string | null>(null);
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);

  const handleToggleRecoveryKey = () => {
    if (hasRecoveryKey) {
      disableRecoveryKey();
      setHasRecoveryKey(false);
      showToast('Clave de respaldo desactivada', 'info');
    } else {
      setNewGeneratedKey(null);
      setPinForNewKey('');
      setPinKeyError(null);
      setShowRecoveryModal(true);
    }
  };

  useEffect(() => {
    if (showRecoveryModal) {
      try { window.history.pushState({ secModal: 'recovery' }, ''); } catch {}
      return registerBackHandler('settings_recovery_modal', () => {
        setShowRecoveryModal(false);
        setPinForNewKey('');
        setPinKeyError(null);
        setNewGeneratedKey(null);
        return true;
      }, 85);
    }
  }, [showRecoveryModal]);

  // Flip to lock state
  const [flipToLockEnabled, setFlipToLockEnabled] = useState<boolean>(() => flipToLockService.isEnabled());

  const handleToggleFlipToLock = (enabled: boolean) => {
    setFlipToLockEnabled(enabled);
    flipToLockService.setEnabled(enabled);
    showToast(
      enabled
        ? 'Bloqueo al voltear boca abajo activado'
        : 'Bloqueo al voltear desactivado',
      'info'
    );
  };

  // Trash / Papelera de reciclaje state
  const [trashItems, setTrashItems] = useState<EncryptedVaultItem[]>([]);
  const [trashStats, setTrashStats] = useState<{ count: number; totalBytes: number }>({ count: 0, totalBytes: 0 });
  const [isLoadingTrash, setIsLoadingTrash] = useState(false);
  const [selectedTrashIds, setSelectedTrashIds] = useState<Set<string>>(new Set());
  const [showEmptyTrashModal, setShowEmptyTrashModal] = useState(false);
  const [isEmptyingTrash, setIsEmptyingTrash] = useState(false);
  const [itemToDeleteDefinitively, setItemToDeleteDefinitively] = useState<EncryptedVaultItem | null>(null);

  const loadTrash = async () => {
    setIsLoadingTrash(true);
    try {
      const items = await getTrashItems();
      setTrashItems(items);
      const stats = await getTrashStats();
      setTrashStats(stats);
    } catch (err) {
      console.error('Error loading trash items:', err);
    } finally {
      setIsLoadingTrash(false);
    }
  };

  useEffect(() => {
    loadTrash();
    const handleTrashUpdated = () => {
      loadTrash();
    };
    window.addEventListener('vault_trash_updated', handleTrashUpdated);
    return () => {
      window.removeEventListener('vault_trash_updated', handleTrashUpdated);
    };
  }, []);

  const handleRestoreItem = async (id: string) => {
    try {
      await restoreFromTrash(id);
      showToast('Elemento restaurado a la bóveda', 'success');
      await loadTrash();
      await onPhotosUpdated();
    } catch {
      showToast('Error al restaurar elemento', 'error');
    }
  };

  const handleBatchRestore = async () => {
    if (selectedTrashIds.size === 0) return;
    try {
      const ids = Array.from(selectedTrashIds);
      await batchRestoreFromTrash(ids);
      showToast(`${ids.length} elementos restaurados a la bóveda`, 'success');
      setSelectedTrashIds(new Set());
      await loadTrash();
      await onPhotosUpdated();
    } catch {
      showToast('Error al restaurar elementos', 'error');
    }
  };

  const handleConfirmEmptyTrash = async () => {
    setIsEmptyingTrash(true);
    try {
      const count = await emptyTrash();
      showToast(`Papelera vaciada (${count} elementos eliminados definitivamente)`, 'success');
      setShowEmptyTrashModal(false);
      setSelectedTrashIds(new Set());
      await loadTrash();
      await onPhotosUpdated();
    } catch {
      showToast('Error al vaciar la papelera', 'error');
    } finally {
      setIsEmptyingTrash(false);
    }
  };

  const handleConfirmSingleDeleteDefinitive = async () => {
    if (!itemToDeleteDefinitively) return;
    try {
      await deleteEncryptedItem(itemToDeleteDefinitively.id);
      showToast('Elemento eliminado definitivamente', 'success');
      setItemToDeleteDefinitively(null);
      await loadTrash();
      await onPhotosUpdated();
    } catch {
      showToast('Error al eliminar elemento', 'error');
    }
  };

  const handleBatchDeleteDefinitive = async () => {
    if (selectedTrashIds.size === 0) return;
    try {
      const ids = Array.from(selectedTrashIds);
      await deleteMultipleEncryptedItems(ids);
      showToast(`${ids.length} elementos eliminados definitivamente`, 'success');
      setSelectedTrashIds(new Set());
      await loadTrash();
      await onPhotosUpdated();
    } catch {
      showToast('Error al eliminar elementos', 'error');
    }
  };

  // Gesto táctil de deslizamiento (swipe right) para retroceder
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
    const deltaY = e.changedTouches[0].clientY - touchStartYRef.current;
    const startX = touchStartXRef.current;
    touchStartXRef.current = null;
    touchStartYRef.current = null;

    // Solo retroceder si está dentro de un sub-menú, comenzó estrictamente en el borde izquierdo (< 30px) y no en elementos desplazables
    if (activeSubMenu !== null && startX <= 30 && deltaX > 60 && Math.abs(deltaY) < 70) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA' || target.closest('[class*="overflow-"]'))) {
        return;
      }
      setActiveSubMenu(null);
    }
  };

  // Track backup timestamp
  const [lastBackupTimestamp, setLastBackupTimestamp] = useState<number | null>(() => {
    const ts = localStorage.getItem('nullvault_last_backup_timestamp');
    return ts ? Number(ts) : null;
  });


  // Data wiping states
  const [showWipeConfirmModal, setShowWipeConfirmModal] = useState(false);
  const [showWipePinModal, setShowWipePinModal] = useState(false);
  const [wipePinInput, setWipePinInput] = useState('');
  const [wipePinError, setWipePinError] = useState<string | null>(null);
  const [isVerifyingWipePin, setIsVerifyingWipePin] = useState(false);
  const [isWipingData, setIsWipingData] = useState(false);
  const [wipeProgress, setWipeProgress] = useState(0);
  const [wipeStepText, setWipeStepText] = useState('Iniciando...');

  useEffect(() => {
    const handleCheckBackupTab = () => {
      if (sessionStorage.getItem('open_backup_tab_on_settings') === 'true') {
        sessionStorage.removeItem('open_backup_tab_on_settings');
        setActiveSubMenu('backup');
      }
    };
    const handleCheckUpdatesTab = () => {
      sessionStorage.removeItem('open_updates_tab_on_settings');
      setActiveSubMenu('updates');
    };
    const handleSwitchSubmenu = (e: any) => {
      const sub = e.detail?.submenu;
      if (sub) {
        setActiveSubMenu(sub);
      }
    };

    window.addEventListener('nullvault_switch_settings_backup', handleCheckBackupTab);
    window.addEventListener('vault_open_updates_menu', handleCheckUpdatesTab);
    window.addEventListener('settings_switch_submenu', handleSwitchSubmenu);
    return () => {
      window.removeEventListener('nullvault_switch_settings_backup', handleCheckBackupTab);
      window.removeEventListener('vault_open_updates_menu', handleCheckUpdatesTab);
      window.removeEventListener('settings_switch_submenu', handleSwitchSubmenu);
    };
  }, []);

  // Notificar si el usuario se encuentra dentro del sub-menú de actualizaciones
  useEffect(() => {
    const isUpdatesOpen = activeSubMenu === 'updates';
    if (isUpdatesOpen) {
      sessionStorage.setItem('vault_updates_menu_active', 'true');
    } else {
      sessionStorage.removeItem('vault_updates_menu_active');
    }
    window.dispatchEvent(new CustomEvent('vault_updates_view_state', { detail: { isOpen: isUpdatesOpen } }));
    return () => {
      sessionStorage.removeItem('vault_updates_menu_active');
      window.dispatchEvent(new CustomEvent('vault_updates_view_state', { detail: { isOpen: false } }));
    };
  }, [activeSubMenu]);

  // Estado del sistema de actualizaciones
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateCheckResult, setUpdateCheckResult] = useState<UpdateCheckResult | null>(() => updateService.getLastCheckResult());
  const [showChangelogModal, setShowChangelogModal] = useState(false);
  const [autoCheckUpdates, setAutoCheckUpdates] = useState<boolean>(() => updateService.isAutoCheckEnabled());

  useEffect(() => {
    return updateService.subscribe((result) => {
      setUpdateCheckResult(result);
    });
  }, []);

  const handleCheckForUpdates = async () => {
    setIsCheckingUpdate(true);
    try {
      const res = await updateService.checkForUpdates(true);
      setUpdateCheckResult(res);
      if (res.hasUpdate) {
        showToast(`¡Nueva versión v${res.latestVersion} disponible!`, 'info');
      } else {
        showToast('Tu aplicación ya está actualizada con la versión más reciente.', 'success');
      }
    } catch {
      showToast('No se pudo verificar la actualización. Revisa tu conexión.', 'alert');
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleToggleAutoCheck = (enabled: boolean) => {
    setAutoCheckUpdates(enabled);
    updateService.setAutoCheckEnabled(enabled);
    showToast(enabled ? 'Avisos automáticos de actualización activados' : 'Avisos automáticos desactivados', 'info');
  };

  // Change PIN state
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [showCurrentPin, setShowCurrentPin] = useState(false);
  const [showNewPin, setShowNewPin] = useState(false);
  const [showConfirmNewPin, setShowConfirmNewPin] = useState(false);
  const [isChangingPin, setIsChangingPin] = useState(false);
  const [pinChangeError, setPinChangeError] = useState<string | null>(null);
  const [pinChangeSuccess, setPinChangeSuccess] = useState(false);

  // Backup / restore state
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [selectedBackupInfo, setSelectedBackupInfo] = useState<{
    name: string;
    size: number;
    status: 'reading' | 'analyzing' | 'restoring' | 'success' | 'error';
    statusText: string;
    percent: number;
  } | null>(null);
  const [pendingBackupBlob, setPendingBackupBlob] = useState<Blob | null>(null);
  const [pendingBackupHeader, setPendingBackupHeader] = useState<BackupHeaderInfo | null>(null);
  const [showBackupPinPrompt, setShowBackupPinPrompt] = useState(false);
  const [backupPinInput, setBackupPinInput] = useState('');
  const [backupPinError, setBackupPinError] = useState<string | null>(null);
  const [isVerifyingBackupPin, setIsVerifyingBackupPin] = useState(false);
  const [showPasteInput, setShowPasteInput] = useState(false);
  const [pastedBackupText, setPastedBackupText] = useState('');
  const [restartPromptInfo, setRestartPromptInfo] = useState<{
    show: boolean;
    importedCount: number;
  }>({ show: false, importedCount: 0 });

  // Local backups list & currently generated backup
  const [localBackups, setLocalBackups] = useState<StoredBackupMetadata[]>([]);
  const [isLoadingLocalBackups, setIsLoadingLocalBackups] = useState(false);
  const [generatedBackup, setGeneratedBackup] = useState<{
    blob?: Blob;
    blobUrl: string;
    fileName: string;
    sizeBytes: number;
    itemCount: number;
    savedPath?: string;
  } | null>(null);

  // Back button registrations para retroceder con teclas de navegación o botón físico
  useEffect(() => {
    if (showWipePinModal) {
      return registerBackHandler('settings_wipe_pin', () => {
        setShowWipePinModal(false);
        setWipePinInput('');
        setWipePinError(null);
        return true;
      }, 80);
    }
  }, [showWipePinModal]);

  useEffect(() => {
    if (showWipeConfirmModal) {
      return registerBackHandler('settings_wipe_confirm', () => {
        setShowWipeConfirmModal(false);
        return true;
      }, 75);
    }
  }, [showWipeConfirmModal]);

  useEffect(() => {
    if (showBackupPinPrompt) {
      return registerBackHandler('settings_backup_pin', () => {
        setShowBackupPinPrompt(false);
        setPendingBackupBlob(null);
        setPendingBackupHeader(null);
        return true;
      }, 75);
    }
  }, [showBackupPinPrompt]);

  useEffect(() => {
    if (showPasteInput) {
      return registerBackHandler('settings_paste_input', () => {
        setShowPasteInput(false);
        return true;
      }, 75);
    }
  }, [showPasteInput]);

  useEffect(() => {
    if (showEmptyTrashModal) {
      return registerBackHandler('settings_empty_trash', () => {
        setShowEmptyTrashModal(false);
        return true;
      }, 75);
    }
  }, [showEmptyTrashModal]);

  useEffect(() => {
    if (itemToDeleteDefinitively) {
      return registerBackHandler('settings_delete_trash_item', () => {
        setItemToDeleteDefinitively(null);
        return true;
      }, 75);
    }
  }, [itemToDeleteDefinitively]);

  // Si está en un submenú, al presionar atrás regresa a la lista vertical de configuración
  useEffect(() => {
    if (activeSubMenu !== null) {
      try {
        window.history.pushState({ settingsSubMenu: activeSubMenu }, '');
      } catch {}
      return registerBackHandler('settings_submenu', () => {
        setActiveSubMenu(null);
        return true;
      }, 70);
    }
  }, [activeSubMenu]);

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinChangeError(null);
    setPinChangeSuccess(false);

    if (newPin.length < 4) {
      setPinChangeError('El nuevo PIN debe tener al menos 4 dígitos');
      return;
    }

    if (newPin !== confirmNewPin) {
      setPinChangeError('Los nuevos PINs no coinciden');
      return;
    }

    setIsChangingPin(true);

    try {
      const saltHex = localStorage.getItem('vault_salt');
      const testIvHex = localStorage.getItem('vault_test_iv');
      const testCipherHex = localStorage.getItem('vault_test_cipher');

      if (!saltHex || !testIvHex || !testCipherHex) {
        throw new Error('Datos de verificación de bóveda no encontrados');
      }

      const salt = hexToBuf(saltHex);
      const testKey = await deriveKeyFromPin(currentPin, salt);
      const isValid = await verifyKey(testKey, testIvHex, testCipherHex);

      if (!isValid) {
        setPinChangeError('El PIN actual es incorrecto');
        setIsChangingPin(false);
        return;
      }

      const newSalt = generateSalt();
      const newDerivedKey = await deriveKeyFromPin(newPin, newSalt);
      const newVerification = await createVerificationPayload(newDerivedKey);

      // Re-encrypt all items in IndexedDB from testKey to newDerivedKey
      try {
        const allItems = await getAllEncryptedItems();
        const updatedItems: EncryptedVaultItem[] = [];
        for (const item of allItems) {
          try {
            const isUnencrypted = !item.iv || item.iv.length === 0 || checkIsUnencryptedMedia(item.data);
            const decrypted = isUnencrypted ? item.data : await decryptBuffer(item.data, item.iv, testKey);
            const reEncrypted = await encryptBuffer(decrypted, newDerivedKey);
            updatedItems.push({
              ...item,
              iv: reEncrypted.iv,
              data: reEncrypted.data,
            });
          } catch (itemErr) {
            console.warn(`Could not re-encrypt item ${item.id} during PIN change:`, itemErr);
            updatedItems.push(item);
          }
        }
        if (updatedItems.length > 0) {
          await saveEncryptedItems(updatedItems);
        }
      } catch (reErr) {
        console.warn('Error during batch item re-encryption on PIN change:', reErr);
      }

      localStorage.setItem('vault_salt', bufToHex(newSalt));
      localStorage.setItem('vault_test_iv', newVerification.ivHex);
      localStorage.setItem('vault_test_cipher', newVerification.cipherHex);
      localStorage.setItem('vault_pin_length', newPin.length.toString());

      try {
        sessionStorage.setItem('vault_session_pin', newPin);
      } catch {}

      onMasterKeyUpdated(newDerivedKey);

      setPinChangeSuccess(true);
      setCurrentPin('');
      setNewPin('');
      setConfirmNewPin('');
      showToast('PIN maestro actualizado con éxito', 'success');
    } catch (err: any) {
      console.error('Error changing PIN:', err);
      setPinChangeError(err?.message || 'Error al cambiar PIN');
    } finally {
      setIsChangingPin(false);
    }
  };

  // Cargar lista de copias locales guardadas en este dispositivo
  const loadLocalBackups = async () => {
    setIsLoadingLocalBackups(true);
    try {
      const list = await getStoredLocalBackups();
      setLocalBackups(list);
    } catch (err) {
      console.warn('Error loading stored local backups:', err);
    } finally {
      setIsLoadingLocalBackups(false);
    }
  };

  useEffect(() => {
    loadLocalBackups();
    const handleBackupUpdated = () => {
      loadLocalBackups();
    };
    window.addEventListener('vault_backup_updated', handleBackupUpdated);
    window.addEventListener('nullvault_backup_updated', handleBackupUpdated);
    return () => {
      window.removeEventListener('vault_backup_updated', handleBackupUpdated);
      window.removeEventListener('nullvault_backup_updated', handleBackupUpdated);
    };
  }, []);

  useEffect(() => {
    if (activeSubMenu === 'backup') {
      loadLocalBackups();
    }
  }, [activeSubMenu]);

  const handleExportBackup = async () => {
    if (!masterKey) return;
    setIsExporting(true);
    setExportProgress({ current: 0, total: 1 });
    try {
      let finalCount = 0;
      const backupBlob = await exportEncryptedBackupBlob((current, total) => {
        finalCount = total;
        setExportProgress({ current, total });
      });

      const dateStr = new Date().toISOString().split('T')[0];
      const timeStr = new Date().toTimeString().slice(0, 5).replace(':', '-');
      const fileName = `Boveda_Respaldo_${dateStr}_${timeStr}.json`;

      // 1. Guardar de forma garantizada en la memoria interna de la aplicación (IndexedDB aislado)
      await saveInternalBackup(backupBlob, fileName, finalCount);
      await loadLocalBackups();

      const now = Date.now();
      localStorage.setItem('nullvault_last_backup_timestamp', now.toString());
      localStorage.setItem('vault_last_backup_timestamp', now.toString());
      localStorage.setItem('nullvault_last_backup_date', new Date().toISOString());
      setLastBackupTimestamp(now);
      window.dispatchEvent(new Event('nullvault_backup_updated'));
      window.dispatchEvent(new Event('vault_backup_updated'));

      // 2. Preparar enlace de descarga directa en pantalla
      const blobUrl = createBackupDownloadUrl(backupBlob);

      // 3. Descargar al almacenamiento del dispositivo
      const dlResult = await downloadBackupToDevice(backupBlob, fileName);
      setGeneratedBackup({
        blob: backupBlob,
        blobUrl,
        fileName,
        sizeBytes: backupBlob.size,
        itemCount: finalCount,
        savedPath: dlResult.path || 'Descargas (Downloads)',
      });

      if (dlResult.success && dlResult.method !== 'cancelled') {
        showToast('Copia guardada con éxito en la carpeta Descargas de tu teléfono', 'success');
      } else {
        showToast('Copia lista. Pulsa el botón para guardarla en tu celular', 'info');
      }
    } catch (err) {
      console.error('Export error:', err);
      showToast('Error al exportar copia de seguridad', 'error');
    } finally {
      setIsExporting(false);
      setExportProgress(null);
    }
  };

  const handleDirectSaveBackup = async () => {
    if (!generatedBackup) return;
    try {
      if (generatedBackup.blob) {
        const res = await downloadBackupToDevice(generatedBackup.blob, generatedBackup.fileName);
        if (res.success) {
          showToast('Copia guardada en la carpeta Descargas de tu teléfono', 'success');
          return;
        }
      }
      const a = document.createElement('a');
      a.href = generatedBackup.blobUrl;
      a.download = generatedBackup.fileName;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try {
          document.body.removeChild(a);
        } catch {}
      }, 1000);
      showToast('Descargando archivo a tu dispositivo...', 'info');
    } catch (err: any) {
      showToast('Error al descargar: ' + (err?.message || 'Error desconocido'), 'error');
    }
  };

  const processBackupBlob = async (file: Blob, fileName?: string) => {
    try {
      setSelectedBackupInfo({
        name: fileName || 'copia_seguridad.json',
        size: file.size,
        status: 'reading',
        statusText: 'Analizando archivo de respaldo...',
        percent: 15,
      });

      const header = await readBackupHeaderFromBlob(file);

      if (header?.saltHex && header?.testIvHex && header?.testCipherHex) {
        const salt = hexToBuf(header.saltHex);
        const testKey = await deriveKeyFromPin(sessionPin || '', salt);
        const isValid = await verifyKey(testKey, header.testIvHex, header.testCipherHex);

        if (isValid) {
          setIsImporting(true);
          setSelectedBackupInfo((prev) =>
            prev ? { ...prev, status: 'restoring', statusText: 'Restaurando elementos...', percent: 45 } : null
          );
          const result = await importEncryptedBackupBlobStream(
            file,
            (curr, tot) => {
              const p = tot > 0 ? Math.round((curr / tot) * 50) + 45 : 50;
              setSelectedBackupInfo((prev) => (prev ? { ...prev, percent: p } : null));
            },
            true
          );

          onMasterKeyUpdated(testKey);
          await onPhotosUpdated();
          setSelectedBackupInfo((prev) =>
            prev ? { ...prev, status: 'success', statusText: `¡Se restauraron ${result.importedCount} archivos!`, percent: 100 } : null
          );
          showToast(`Se restauraron ${result.importedCount} elementos a la bóveda`, 'success');
          setIsImporting(false);

          setRestartPromptInfo({
            show: true,
            importedCount: result.importedCount,
          });
          return;
        }

        setPendingBackupBlob(file);
        setPendingBackupHeader(header);
        setShowBackupPinPrompt(true);
        setBackupPinInput('');
        setBackupPinError(null);
        return;
      }

      // Legacy direct import
      setIsImporting(true);
      const result = await importEncryptedBackupBlobStream(file, undefined, true);
      await onPhotosUpdated();
      setSelectedBackupInfo((prev) =>
        prev ? { ...prev, status: 'success', statusText: `¡Se restauraron ${result.importedCount} archivos!`, percent: 100 } : null
      );
      showToast(`Se restauraron ${result.importedCount} elementos a la bóveda`, 'success');
      setRestartPromptInfo({
        show: true,
        importedCount: result.importedCount,
      });
    } catch (err: any) {
      setSelectedBackupInfo((prev) =>
        prev ? { ...prev, status: 'error', statusText: err?.message || 'Archivo dañado', percent: 100 } : null
      );
      showToast('Error al restaurar respaldo', 'error');
    } finally {
      setIsImporting(false);
    }
  };

  const handleFileRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await processBackupBlob(file, file.name);
    } finally {
      e.target.value = '';
    }
  };

  const handleRestoreInternalBackup = async (id: string, fileName: string) => {
    try {
      setIsImporting(true);
      const blob = await getStoredLocalBackupBlob(id);
      if (!blob) {
        showToast('No se encontró el archivo de copia local', 'error');
        return;
      }
      await processBackupBlob(blob, fileName);
    } catch (err: any) {
      showToast(`Error al restaurar: ${err?.message || 'Error desconocido'}`, 'error');
    } finally {
      setIsImporting(false);
    }
  };

  const handleDownloadStoredBackup = async (id: string, fileName: string) => {
    try {
      const blob = await getStoredLocalBackupBlob(id);
      if (!blob) {
        showToast('No se encontró el archivo de copia', 'error');
        return;
      }
      const res = await downloadBackupToDevice(blob, fileName);
      if (res.success && res.method !== 'cancelled') {
        showToast('Copia guardada en Descargas', 'success');
      } else {
        const url = createBackupDownloadUrl(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          try {
            document.body.removeChild(a);
          } catch {}
        }, 1000);
      }
    } catch (err) {
      showToast('Error al descargar copia', 'error');
    }
  };

  const handleDeleteStoredBackup = async (id: string) => {
    try {
      await deleteStoredLocalBackup(id);
      await loadLocalBackups();
      showToast('Copia eliminada del dispositivo', 'info');
    } catch {
      showToast('Error al eliminar copia', 'error');
    }
  };

  const handleConfirmBackupPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !pendingBackupBlob ||
      !pendingBackupHeader?.saltHex ||
      !pendingBackupHeader?.testIvHex ||
      !pendingBackupHeader?.testCipherHex
    )
      return;
    setIsVerifyingBackupPin(true);
    setBackupPinError(null);

    try {
      const salt = hexToBuf(pendingBackupHeader.saltHex);
      const testKey = await deriveKeyFromPin(backupPinInput, salt);
      const isValid = await verifyKey(testKey, pendingBackupHeader.testIvHex, pendingBackupHeader.testCipherHex);

      if (!isValid) {
        setBackupPinError('PIN de la copia de seguridad incorrecto');
        setIsVerifyingBackupPin(false);
        return;
      }

      setShowBackupPinPrompt(false);
      setIsImporting(true);

      const result = await importEncryptedBackupBlobStream(pendingBackupBlob, undefined, true);
      onMasterKeyUpdated(testKey);
      try {
        sessionStorage.setItem('vault_session_pin', backupPinInput);
        localStorage.setItem('vault_pin_length', backupPinInput.length.toString());
      } catch {}

      await onPhotosUpdated();

      showToast(`Se restauraron ${result.importedCount} elementos a la bóveda`, 'success');
      setPendingBackupBlob(null);
      setPendingBackupHeader(null);
      setSelectedBackupInfo((prev) =>
        prev ? { ...prev, status: 'success', statusText: `¡Se restauraron ${result.importedCount} archivos!`, percent: 100 } : null
      );

      setRestartPromptInfo({
        show: true,
        importedCount: result.importedCount,
      });
    } catch (err: any) {
      setBackupPinError(err?.message || 'Error al restaurar');
    } finally {
      setIsVerifyingBackupPin(false);
      setIsImporting(false);
    }
  };

  const handlePasteRestore = async () => {
    if (!pastedBackupText.trim()) return;
    try {
      const parsed = parseWithAutoRepair(pastedBackupText);
      const blob = new Blob([JSON.stringify(parsed)], { type: 'application/json' });
      const header = await readBackupHeaderFromBlob(blob);

      if (header?.saltHex && header?.testIvHex && header?.testCipherHex) {
        const salt = hexToBuf(header.saltHex);
        const testKey = await deriveKeyFromPin(sessionPin || '', salt);
        const isValid = await verifyKey(testKey, header.testIvHex, header.testCipherHex);

        if (isValid) {
          setIsImporting(true);
          const result = await importEncryptedBackupBlobStream(blob, undefined, true);
          onMasterKeyUpdated(testKey);
          await onPhotosUpdated();
          showToast(`Se restauraron ${result.importedCount} elementos`, 'success');
          setPastedBackupText('');
          setShowPasteInput(false);
          setIsImporting(false);
          setRestartPromptInfo({
            show: true,
            importedCount: result.importedCount,
          });
          return;
        }

        setPendingBackupBlob(blob);
        setPendingBackupHeader(header);
        setShowBackupPinPrompt(true);
        setBackupPinInput('');
        setBackupPinError(null);
      } else {
        setIsImporting(true);
        const result = await importEncryptedBackupBlobStream(blob, undefined, true);
        await onPhotosUpdated();
        showToast(`Se restauraron ${result.importedCount} elementos`, 'success');
        setPastedBackupText('');
        setShowPasteInput(false);
        setIsImporting(false);
        setRestartPromptInfo({
          show: true,
          importedCount: result.importedCount,
        });
      }
    } catch (err: any) {
      showToast(`Error: ${err?.message || 'Texto inválido'}`, 'error');
    }
  };

  const startWipeExecutionWithProgress = () => {
    setShowWipeConfirmModal(false);
    setShowWipePinModal(false);
    setIsWipingData(true);
    setWipeProgress(5);
    setWipeStepText('Iniciando protocolo de borrado seguro...');

    const steps = [
      { progress: 20, text: 'Destruyendo claves maestras y derivaciones AES-256...' },
      { progress: 45, text: 'Eliminando fotos, videos y notas cifradas...' },
      { progress: 70, text: 'Vaciando base de datos IndexedDB y miniaturas...' },
      { progress: 90, text: 'Limpiando credenciales biométricas, registros y logs...' },
      { progress: 100, text: '¡100% de borrado completado con éxito!' },
    ];

    let currentStep = 0;
    const interval = setInterval(async () => {
      if (currentStep < steps.length) {
        setWipeProgress(steps[currentStep].progress);
        setWipeStepText(steps[currentStep].text);
        currentStep++;
      } else {
        clearInterval(interval);
        try {
          await clearVaultDatabase();
          try {
            sessionStorage.removeItem('vault_session_pin');
            sessionStorage.clear();
          } catch {}
          localStorage.removeItem('vault_salt');
          localStorage.removeItem('vault_test_iv');
          localStorage.removeItem('vault_test_cipher');
          localStorage.removeItem('vault_initialized');
          localStorage.removeItem('vault_pin_length');
          localStorage.removeItem('nullvault_access_logs');
          localStorage.removeItem('nullvault_intruder_photo');
          localStorage.removeItem('nullvault_failed_streak');
          localStorage.removeItem('nullvault_alert_streak_count');
          localStorage.removeItem('nullvault_last_failed_time');
          localStorage.removeItem('nullvault_has_unviewed_intruder');
          localStorage.removeItem('nullvault_last_backup_timestamp');
          localStorage.removeItem('nullvault_last_backup_date');
          localStorage.removeItem('vault_bio_credential_id');
          localStorage.removeItem('vault_bio_session_token');
        } catch (err) {
          console.error('Error during wipe:', err);
        }
        setTimeout(() => {
          setIsWipingData(false);
          onResetVault();
        }, 650);
      }
    }, 450);
  };

  const handleConfirmWipeRequest = async () => {
    setShowWipeConfirmModal(false);

    // Inmediatamente debe pedir autenticación:
    // Lanzar inmediatamente sensor de huellas si está configurado
    if (isBiometricsEnrolled()) {
      showToast('Toca el sensor de huella para autorizar el borrado', 'info');
      try {
        const bioSuccess = await authenticateWithBiometrics();
        if (bioSuccess) {
          startWipeExecutionWithProgress();
          return;
        }
      } catch (err) {
        console.warn('Biometrics prompt cancelled or failed, falling back to PIN:', err);
      }
    }

    // Si el celular no tiene sensor de huella o falló/canceló la huella: pedir PIN
    setWipePinInput('');
    setWipePinError(null);
    setShowWipePinModal(true);
  };

  const handleWipePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (wipePinInput.length < 4) {
      setWipePinError('Introduce tu PIN completo');
      return;
    }

    setIsVerifyingWipePin(true);
    setWipePinError(null);

    try {
      const saltHex = localStorage.getItem('vault_salt');
      const testIvHex = localStorage.getItem('vault_test_iv');
      const testCipherHex = localStorage.getItem('vault_test_cipher');

      if (saltHex && testIvHex && testCipherHex) {
        const salt = hexToBuf(saltHex);
        const derivedKey = await deriveKeyFromPin(wipePinInput, salt);
        const isValid = await verifyKey(derivedKey, testIvHex, testCipherHex);
        if (!isValid) {
          setWipePinError('PIN incorrecto. Inténtalo de nuevo.');
          setIsVerifyingWipePin(false);
          return;
        }
      } else if (sessionPin && wipePinInput !== sessionPin) {
        setWipePinError('PIN incorrecto. Inténtalo de nuevo.');
        setIsVerifyingWipePin(false);
        return;
      }

      setIsVerifyingWipePin(false);
      setShowWipePinModal(false);
      startWipeExecutionWithProgress();
    } catch (err) {
      console.error('Error verifying PIN for wipe:', err);
      setWipePinError('Error al validar el PIN');
      setIsVerifyingWipePin(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto px-4 pb-[max(calc(env(safe-area-inset-bottom,0px)+4.75rem),5rem)] animate-in fade-in duration-200 select-none box-border">
      {/* Fixed Pinned Header */}
      <header
        className="fixed top-0 left-0 right-0 z-30 [backdrop-filter:blur(24px)] backdrop-blur-xl border-b safe-top-sticky pb-3 px-4 shadow-md transition-all"
        style={{
          backgroundColor: 'var(--theme-bg-header, rgba(6, 11, 20, 0.94))',
          borderColor: 'var(--theme-border, rgba(51, 65, 85, 0.8))',
          WebkitBackdropFilter: 'blur(24px)',
        }}
      >
        <div className="max-w-md mx-auto w-full">
          {activeSubMenu === null ? (
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-0.5" style={{ color: 'var(--theme-text-main, #ffffff)' }}>
                Configu<span style={{ color: 'var(--theme-primary, #00e5ff)' }}>ración</span>
              </h1>
              <p className="text-[10px] font-semibold tracking-[0.2em] uppercase" style={{ color: 'var(--theme-text-muted, #94a3b8)' }}>
                PREFERENCIAS DE LA BÓVEDA
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setActiveSubMenu(null)}
                className={`transition-colors cursor-pointer flex items-center justify-center shrink-0 active:scale-95 ${
                  activeSubMenu === 'updates'
                    ? 'w-11 h-11 rounded-2xl bg-[#0e172a]/80 hover:bg-[#1e293b] border border-slate-800 text-blue-400 hover:text-white'
                    : 'p-2 -ml-2 rounded-2xl bg-slate-800/60 hover:bg-slate-700 text-slate-300 hover:text-white'
                }`}
                title="Volver a Configuración"
                aria-label="Volver"
              >
                {activeSubMenu === 'updates' ? (
                  <ChevronLeft className="w-5 h-5 text-blue-400" />
                ) : (
                  <ArrowLeft className="w-5 h-5" style={{ color: 'var(--theme-primary, #00e5ff)' }} />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate mb-0.5" style={{ color: 'var(--theme-text-main, #ffffff)' }}>
                  {activeSubMenu === 'backup'
                    ? 'Copia de Seguridad'
                    : activeSubMenu === 'updates'
                    ? 'Actualizaciones'
                    : activeSubMenu === 'trash'
                    ? 'Papelera de Reciclaje'
                    : activeSubMenu === 'theme'
                    ? 'Temas y Apariencia'
                    : 'Restablecer Bóveda'}
                </h1>
                <p className={`text-xs text-slate-400 truncate ${activeSubMenu === 'updates' ? 'normal-case' : 'text-[10px] font-semibold tracking-wider uppercase'}`}>
                  {activeSubMenu === 'backup'
                    ? 'Respaldo y restauración cifrada'
                    : activeSubMenu === 'updates'
                    ? 'Versión actual y novedades'
                    : activeSubMenu === 'trash'
                    ? 'Auto-vaciado a 30 días y borrado definitivo'
                    : activeSubMenu === 'theme'
                    ? 'Cian Neón y Modo Claro'
                    : 'Zona de peligro'}
                </p>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Spacer so content starts right below fixed header */}
      <div className="safe-top-header-spacer shrink-0 w-full mb-3" />

      {/* Menú Principal Vertical (Cuando activeSubMenu es null) */}
      {activeSubMenu === null && (
        <div className="space-y-2.5 animate-in fade-in duration-200">
          {/* Tarjeta 1: Copia de Seguridad */}
          <div
            onClick={() => setActiveSubMenu('backup')}
            className="bg-[#0a121d] border border-slate-800/90 hover:border-emerald-500/40 rounded-2xl p-3 sm:p-3.5 shadow-lg flex items-center justify-between gap-3 cursor-pointer group active:scale-[0.99] transition-all"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0 group-hover:scale-105 transition-transform">
                <Download className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-white group-hover:text-emerald-400 transition-colors truncate">
                  Copia de Seguridad
                </h3>
                <p className="text-[11px] text-slate-400 truncate mt-0.5">
                  Exportar y restaurar respaldo cifrado
                </p>
              </div>
            </div>
            <div className="shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-slate-900 border border-slate-800 text-slate-500 group-hover:text-emerald-400 group-hover:border-emerald-500/40 transition-colors">
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>

          {/* Tarjeta 3: Papelera de Reciclaje Cifrada (30 días) */}
          <div
            onClick={() => setActiveSubMenu('trash')}
            className="bg-[#0a121d] border border-slate-800/90 hover:border-amber-500/40 rounded-2xl p-3 sm:p-3.5 shadow-lg flex items-center justify-between gap-3 cursor-pointer group active:scale-[0.99] transition-all"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0 group-hover:scale-105 transition-transform">
                <Trash2 className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-white group-hover:text-amber-400 transition-colors truncate">
                  Papelera de Reciclaje Cifrada
                </h3>
                <p className="text-[11px] text-slate-400 truncate mt-0.5">
                  Auto-vaciado a 30 días
                </p>
              </div>
            </div>
            <div className="shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-slate-900 border border-slate-800 text-slate-500 group-hover:text-amber-400 group-hover:border-amber-500/40 transition-colors">
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>

          {/* Tarjeta 4: Temas y Apariencia Visual */}
          <div
            onClick={() => setActiveSubMenu('theme')}
            className="bg-[#0a121d] border border-slate-800/90 hover:border-purple-500/40 rounded-2xl p-3 sm:p-3.5 shadow-lg flex items-center justify-between gap-3 cursor-pointer group active:scale-[0.99] transition-all"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0 group-hover:scale-105 transition-transform">
                <Palette className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-white group-hover:text-purple-400 transition-colors truncate">
                  Temas y Apariencia Visual
                </h3>
                <p className="text-[11px] text-slate-400 truncate mt-0.5">
                  Cian Neón (original) y Modo Claro
                </p>
              </div>
            </div>
            <div className="shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-slate-900 border border-slate-800 text-slate-500 group-hover:text-purple-400 group-hover:border-purple-500/40 transition-colors">
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>

          {/* Tarjeta 5: Actualizaciones del Sistema */}
          <div
            onClick={() => setActiveSubMenu('updates')}
            className="bg-[#0a121d] border border-slate-800/90 hover:border-cyan-500/40 rounded-2xl p-3 sm:p-3.5 shadow-lg flex items-center justify-between gap-3 cursor-pointer group active:scale-[0.99] transition-all"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-[#00e5ff] shrink-0 group-hover:scale-105 transition-transform">
                <RefreshCw className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white group-hover:text-[#00e5ff] transition-colors truncate">
                    Actualizaciones del Sistema
                  </h3>
                  {updateCheckResult?.hasUpdate && (
                    <span className="w-2 h-2 rounded-full bg-[#00e5ff] animate-pulse shrink-0" title="Nueva versión disponible" />
                  )}
                </div>
                <p className="text-[11px] text-slate-400 truncate mt-0.5">
                  Buscar actualizaciones y ver versión
                </p>
              </div>
            </div>
            <div className="shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-slate-900 border border-slate-800 text-slate-500 group-hover:text-[#00e5ff] group-hover:border-[#00e5ff]/40 transition-colors">
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>

          {/* Tarjeta 6: Restablecer Bóveda (Zona de Peligro) */}
          <div
            onClick={() => setActiveSubMenu('danger')}
            className="bg-[#0a121d] border border-rose-950/60 hover:border-rose-500/50 rounded-2xl p-3 sm:p-3.5 shadow-lg flex items-center justify-between gap-3 cursor-pointer group active:scale-[0.99] transition-all"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0 group-hover:scale-105 transition-transform">
                <ShieldAlert className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-white group-hover:text-rose-400 transition-colors truncate">
                  Restablecer Bóveda
                </h3>
                <p className="text-[11px] text-rose-300/80 truncate mt-0.5">
                  Zona de peligro: borrado seguro de datos
                </p>
              </div>
            </div>
            <div className="shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-slate-900 border border-slate-800 text-slate-500 group-hover:text-rose-400 group-hover:border-rose-500/40 transition-colors">
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>
        </div>
      )}

      {/* Contenido de Sub-menús con soporte táctil de deslizar para volver */}
      {activeSubMenu !== null && (
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="space-y-4 text-slate-300 text-sm animate-in fade-in slide-in-from-right-3 duration-200"
        >
        {activeSubMenu === 'backup' && (
          <div className="space-y-4">
            {/* Clave de Respaldo Maestra */}
            <div className="bg-[#0a121d] border border-slate-800/90 rounded-3xl p-4 sm:p-5 shadow-xl">
              <div className="flex items-center justify-between">
                <div
                  className="flex items-center gap-3.5 flex-1 cursor-pointer group"
                  onClick={() => {
                    if (!hasRecoveryKey) {
                      handleToggleRecoveryKey();
                    } else {
                      setNewGeneratedKey(null);
                      setPinForNewKey('');
                      setPinKeyError(null);
                      setShowRecoveryModal(true);
                    }
                  }}
                >
                  <div className="w-10 h-10 rounded-xl bg-[#00e5ff]/10 border border-[#00e5ff]/20 flex items-center justify-center text-[#00e5ff] shrink-0 group-hover:scale-105 transition-transform">
                    <KeyRound className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 pr-2">
                    <h4 className="text-sm font-bold text-white group-hover:text-[#00e5ff] transition-colors">
                      Clave de respaldo
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {hasRecoveryKey
                        ? 'Activa · Toca para ver o renovar código'
                        : 'Inactiva · Toca para generar código'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleToggleRecoveryKey}
                  aria-label="Toggle Clave de respaldo"
                  className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                    hasRecoveryKey ? 'bg-[#00e5ff]' : 'bg-slate-800 border border-slate-700'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white shadow-md transition-transform transform absolute top-0.5 ${
                      hasRecoveryKey ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Estado y Recordatorio de Copia de Seguridad */}
            {lastBackupTimestamp ? (
              (() => {
                const daysAgo = Math.floor((Date.now() - lastBackupTimestamp) / (24 * 60 * 60 * 1000));
                const isOverWeek = daysAgo >= 7;
                return (
                  <div
                    className={`p-3.5 rounded-3xl border flex items-center justify-between gap-3 shadow-md ${
                      isOverWeek
                        ? 'bg-amber-500/10 border-amber-500/30'
                        : 'bg-emerald-500/10 border-emerald-500/30'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 ${
                          isOverWeek ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'
                        }`}
                      >
                        {isOverWeek ? (
                          <AlertTriangle className="w-5 h-5" />
                        ) : (
                          <CheckCircle2 className="w-5 h-5" />
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white">
                          {isOverWeek ? 'Recordatorio de Respaldo' : 'Copia de Seguridad al Día'}
                        </p>
                        <p className="text-[11px] text-slate-300">
                          {isOverWeek
                            ? `Llevas ${daysAgo} días sin realizar una copia de seguridad.`
                            : `Último respaldo realizado hace ${daysAgo === 0 ? 'unas horas' : `${daysAgo} día(s)`}.`}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                        isOverWeek ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'
                      }`}
                    >
                      {daysAgo}d
                    </span>
                  </div>
                );
              })()
            ) : (
              <div className="p-3.5 rounded-3xl border bg-amber-500/10 border-amber-500/30 flex items-center gap-3 shadow-md">
                <div className="w-9 h-9 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-white">Sin Copia de Seguridad Registrada</p>
                  <p className="text-[11px] text-slate-300">
                    Aún no has descargado un respaldo. Realiza una copia para proteger tus archivos ante cualquier imprevisto.
                  </p>
                </div>
              </div>
            )}

            <div className="bg-[#0a121d] p-4 rounded-3xl border border-slate-800/90 shadow-xl space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-[#00e5ff]/10 text-[#00e5ff] rounded-2xl border border-[#00e5ff]/20">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h5 className="text-xs font-semibold text-slate-200">Exportar Copia Cifrada</h5>
                  <p className="text-[11px] text-slate-400">
                    Descarga un archivo .json con todas tus fotos, videos y notas protegidas con cifrado AES-GCM.
                  </p>
                </div>
              </div>

              {isExporting && exportProgress && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-[11px] text-[#00e5ff] font-semibold">
                    <span>Procesando y cifrando elementos...</span>
                    <span>{exportProgress.current} / {exportProgress.total}</span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#00e5ff] transition-all duration-200"
                      style={{
                        width: `${exportProgress.total > 0 ? Math.min(100, Math.round((exportProgress.current / exportProgress.total) * 100)) : 0}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleExportBackup}
                disabled={isExporting}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2 border border-slate-700 active:scale-98"
              >
                <Download className="w-4 h-4 text-[#00e5ff]" />
                <span>{isExporting ? 'Generando copia...' : 'Descargar Copia de Seguridad (.json)'}</span>
              </button>
            </div>

            <div className="bg-[#0a121d] p-4 rounded-3xl border border-slate-800/90 shadow-xl space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-2xl border border-emerald-500/20">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h5 className="text-xs font-semibold text-slate-200">Restaurar Copia</h5>
                  <p className="text-[11px] text-slate-400">
                    Importa un archivo .json generado previamente para restaurar archivos a tu bóveda.
                  </p>
                </div>
              </div>

              {selectedBackupInfo && (
                <div className="bg-[#101b2d] border border-slate-700/80 rounded-2xl p-4 space-y-3 shadow-lg animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`p-2 rounded-xl ${
                        selectedBackupInfo.status === 'success' ? 'bg-emerald-500/20 text-emerald-400' :
                        selectedBackupInfo.status === 'error' ? 'bg-rose-500/20 text-rose-400' :
                        'bg-cyan-500/20 text-cyan-400'
                      }`}>
                        {selectedBackupInfo.status === 'success' ? (
                          <CheckCircle2 className="w-5 h-5" />
                        ) : selectedBackupInfo.status === 'error' ? (
                          <AlertTriangle className="w-5 h-5" />
                        ) : (
                          <FileText className="w-5 h-5 animate-pulse" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate max-w-[190px] sm:max-w-xs">
                          {selectedBackupInfo.name}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {formatFileSize(selectedBackupInfo.size)}
                        </p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                      selectedBackupInfo.status === 'success' ? 'bg-emerald-500/20 text-emerald-300' :
                      selectedBackupInfo.status === 'error' ? 'bg-rose-500/20 text-rose-300' :
                      'bg-cyan-500/20 text-cyan-300'
                    }`}>
                      {selectedBackupInfo.status === 'success' ? 'Listo' :
                       selectedBackupInfo.status === 'error' ? 'Error' :
                       'Procesando'}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 font-medium">
                    {selectedBackupInfo.statusText}
                  </p>
                </div>
              )}

              <label className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-600/20 active:scale-98">
                <Upload className="w-4 h-4" />
                <span>{isImporting ? 'Restaurando archivo...' : 'Seleccionar Archivo de Respaldo (.json)'}</span>
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  disabled={isImporting}
                  onChange={handleFileRestore}
                />
              </label>
            </div>
          </div>
        )}

        {activeSubMenu === 'danger' && (
          <div className="space-y-4">
            <div className="bg-[#0a121d] p-4 rounded-3xl border border-rose-500/30 shadow-xl space-y-3">
              <h5 className="text-xs font-semibold text-rose-300">Borrar Datos y Restablecer Bóveda</h5>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Borra de forma irreversible tu PIN maestro, claves criptográficas, fotos, videos y notas de este dispositivo. La aplicación volverá a la pantalla inicial de configuración.
              </p>
              <button
                type="button"
                onClick={() => setShowWipeConfirmModal(true)}
                className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-rose-600/30 transition-colors flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
              >
                <Trash2 className="w-4 h-4" />
                <span>Borrar todos los datos y restablecer</span>
              </button>
            </div>
          </div>
        )}

        {activeSubMenu === 'updates' && (
          <div className="animate-in fade-in duration-200">
            <BovedaUpdater
              onOpenChangelog={() => setShowChangelogModal(true)}
              onNavigateToBackup={() => setActiveSubMenu('backup')}
            />
          </div>
        )}

        {/* Submenú: Papelera de Reciclaje Cifrada (30 días) */}
        {activeSubMenu === 'trash' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Tarjeta explicativa */}
            <div className="bg-[#0a121d] p-4 rounded-3xl border border-slate-800/90 shadow-xl space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400 shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div>
                    <h3 className="text-sm font-bold text-white">Papelera Cifrada</h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Los archivos permanecen cifrados con tu clave <strong className="text-slate-300">AES-256-GCM</strong>.
                    Se auto-destruyen tras <strong className="text-amber-400 font-semibold">30 días</strong>, o puedes restaurarlos o eliminarlos definitivamente cuando desees.
                  </p>
                </div>
              </div>

              {/* Barra de estado y acción de vaciado */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-800/80">
                <div className="text-xs text-slate-400">
                  Total en papelera: <strong className="text-white font-bold">{trashStats.count}</strong> elemento(s)
                  {trashStats.totalBytes > 0 && ` • ${formatFileSize(trashStats.totalBytes)}`}
                </div>
                {trashItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowEmptyTrashModal(true)}
                    className="self-start sm:self-auto px-3.5 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 text-xs font-bold flex items-center gap-2 transition-all active:scale-95 cursor-pointer shadow-sm shadow-rose-900/30"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Vaciar Papelera Ahora
                  </button>
                )}
              </div>
            </div>

            {/* Barra de acciones para elementos seleccionados */}
            {selectedTrashIds.size > 0 && (
              <div className="bg-[#0f172a] border border-[#00e5ff]/30 p-3 rounded-2xl flex items-center justify-between shadow-xl animate-in fade-in duration-150">
                <span className="text-xs font-semibold text-slate-200">
                  {selectedTrashIds.size} elemento(s) seleccionado(s)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleBatchRestore}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-white border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    Restaurar
                  </button>
                  <button
                    type="button"
                    onClick={handleBatchDeleteDefinitive}
                    className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-md shadow-rose-600/30"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Eliminar
                  </button>
                </div>
              </div>
            )}

            {/* Lista de archivos en la papelera */}
            {trashItems.length === 0 ? (
              <div className="bg-[#0a121d] border border-slate-800/80 rounded-3xl p-8 text-center space-y-3">
                <div className="w-14 h-14 rounded-3xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-center text-slate-500 mx-auto">
                  <Trash2 className="w-7 h-7" />
                </div>
                <h4 className="text-sm font-bold text-white">La papelera está vacía</h4>
                <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
                  Cuando borres fotos, videos o archivos de tu bóveda, se enviarán aquí con resguardo cifrado de 30 días antes de su destrucción definitiva.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1 text-xs text-slate-400">
                  <span>Archivos en espera ({trashItems.length})</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedTrashIds.size === trashItems.length) {
                        setSelectedTrashIds(new Set());
                      } else {
                        setSelectedTrashIds(new Set(trashItems.map((t) => t.id)));
                      }
                    }}
                    className="text-[#00e5ff] hover:underline font-semibold cursor-pointer"
                  >
                    {selectedTrashIds.size === trashItems.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
                  </button>
                </div>

                {trashItems.map((item) => {
                  const daysPassed = item.deletedAt ? Math.floor((Date.now() - item.deletedAt) / (1000 * 60 * 60 * 24)) : 0;
                  const daysRemaining = Math.max(0, 30 - daysPassed);
                  const isSelected = selectedTrashIds.has(item.id);

                  return (
                    <div
                      key={item.id}
                      className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-slate-800/70 border-[#00e5ff]/60 shadow-md shadow-[#00e5ff]/5'
                          : 'bg-[#0a121d] border-slate-800/90 hover:border-slate-700'
                      }`}
                    >
                      <div
                        className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer select-none"
                        onClick={() => {
                          setSelectedTrashIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(item.id)) next.delete(item.id);
                            else next.add(item.id);
                            return next;
                          });
                        }}
                      >
                        <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0">
                          {item.category === 'photo' ? (
                            <FileText className="w-5 h-5 text-amber-400" />
                          ) : item.category === 'video' ? (
                            <FileText className="w-5 h-5 text-sky-400" />
                          ) : item.category === 'audio' ? (
                            <FileText className="w-5 h-5 text-purple-400" />
                          ) : (
                            <FileText className="w-5 h-5 text-emerald-400" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-semibold text-white truncate">{item.name}</h4>
                          <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                            <span>{formatFileSize(item.size)}</span>
                            <span>•</span>
                            <span className={`font-semibold ${daysRemaining <= 5 ? 'text-rose-400' : 'text-amber-400'}`}>
                              Auto-vaciado en {daysRemaining} {daysRemaining === 1 ? 'día' : 'días'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          title="Restaurar a la bóveda"
                          onClick={() => handleRestoreItem(item.id)}
                          className="p-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-400 hover:text-emerald-300 border border-emerald-500/20 active:scale-95 transition-all cursor-pointer"
                        >
                          <Undo2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          title="Eliminar definitivamente ahora"
                          onClick={() => setItemToDeleteDefinitively(item)}
                          className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/25 text-rose-400 hover:text-rose-300 border border-rose-500/20 active:scale-95 transition-all cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Submenú: Temas y Apariencia Visual */}
        {activeSubMenu === 'theme' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Encabezado */}
            <div
              className="p-4 rounded-3xl border shadow-xl space-y-2 transition-colors"
              style={{
                backgroundColor: 'var(--theme-bg-card, #0a121d)',
                borderColor: 'var(--theme-border, rgba(51, 65, 85, 0.9))',
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--theme-primary, #00e5ff) 14%, var(--theme-bg-secondary, #0f172a))',
                    borderColor: 'color-mix(in srgb, var(--theme-primary, #00e5ff) 30%, transparent)',
                    color: 'var(--theme-primary, #00e5ff)',
                  }}
                >
                  <Palette className="w-5 h-5" />
                </div>
                <div>
                  <h3
                    className="text-sm font-bold"
                    style={{ color: 'var(--theme-text-main, #ffffff)' }}
                  >
                    Temas de la Bóveda
                  </h3>
                  <p
                    className="text-xs mt-0.5"
                    style={{ color: 'var(--theme-text-muted, #94a3b8)' }}
                  >
                    Alterna entre el tema tecnológico original Cian Neón o el Tema Claro.
                  </p>
                </div>
              </div>
            </div>

            {/* Listado de temas */}
            <div className="space-y-2.5">
              {Object.values(VAULT_THEMES).map((themeDef) => {
                const isSelected = currentTheme === themeDef.id;

                return (
                  <div
                    key={themeDef.id}
                    onClick={() => handleSelectTheme(themeDef.id)}
                    className="p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 active:scale-[0.99] shadow-sm"
                    style={{
                      backgroundColor: 'var(--theme-bg-card, #0a121d)',
                      borderColor: isSelected ? themeDef.primaryColor : 'var(--theme-border, rgba(51, 65, 85, 0.75))',
                      boxShadow: isSelected ? `0 0 16px ${themeDef.glowColor}` : undefined,
                      borderWidth: isSelected ? '2px' : '1px',
                    }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Paleta de círculos cromáticos de vista previa */}
                      <div className="flex items-center -space-x-2 shrink-0">
                        <span
                          className="w-6 h-6 rounded-full border border-slate-900 shadow-md shrink-0"
                          style={{ backgroundColor: themeDef.primaryColor }}
                        />
                        <span
                          className="w-6 h-6 rounded-full border border-slate-900 shadow-md shrink-0"
                          style={{ backgroundColor: themeDef.bgCard }}
                        />
                        <span
                          className="w-6 h-6 rounded-full border border-slate-900 shadow-md shrink-0"
                          style={{ backgroundColor: themeDef.bgMain }}
                        />
                      </div>

                      <div className="min-w-0">
                        <h4
                          className="text-sm font-bold truncate"
                          style={{ color: 'var(--theme-text-main, #ffffff)' }}
                        >
                          {themeDef.name}
                        </h4>
                        <p
                          className="text-[11px] truncate mt-0.5"
                          style={{ color: 'var(--theme-text-muted, #94a3b8)' }}
                        >
                          {themeDef.tagline}
                        </p>
                      </div>
                    </div>

                    {/* Radio/Check button indicator */}
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all border"
                      style={{
                        backgroundColor: isSelected ? themeDef.primaryColor : 'var(--theme-bg-secondary, #0f172a)',
                        borderColor: isSelected ? themeDef.primaryColor : 'var(--theme-border, rgba(51, 65, 85, 0.75))',
                        color: '#ffffff',
                      }}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[3] text-white" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      )}

      {/* Modal: Confirmación de Vaciar Papelera Definitivamente */}
      {showEmptyTrashModal && (
        <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#0e1626] border-2 border-rose-500/60 rounded-3xl p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/15 text-rose-400 flex items-center justify-center mb-3">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white mb-1.5">
              ¿Vaciar la papelera definitivamente?
            </h3>
            <p className="text-xs text-slate-300 mb-5 leading-relaxed">
              Esta acción eliminará de forma irreversible <strong>{trashStats.count} elemento(s)</strong> ({formatFileSize(trashStats.totalBytes)}) de tu dispositivo. No podrás recuperarlos.
            </p>
            <div className="flex gap-2.5">
              <button
                type="button"
                disabled={isEmptyingTrash}
                onClick={() => setShowEmptyTrashModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isEmptyingTrash}
                onClick={handleConfirmEmptyTrash}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-all shadow-lg shadow-rose-600/30 active:scale-[0.98] cursor-pointer"
              >
                {isEmptyingTrash ? 'Vaciando...' : 'Sí, Vaciar Todo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmación de Eliminar Un Solo Elemento Definitivamente */}
      {itemToDeleteDefinitively && (
        <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#0e1626] border-2 border-rose-500/60 rounded-3xl p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/15 text-rose-400 flex items-center justify-center mb-3">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white mb-1.5">
              ¿Eliminar definitivamente este archivo?
            </h3>
            <p className="text-xs text-slate-300 mb-5 leading-relaxed">
              El archivo <strong className="text-white truncate block my-1">"{itemToDeleteDefinitively.name}"</strong> ({formatFileSize(itemToDeleteDefinitively.size)}) será destruido permanentemente de tu dispositivo.
            </p>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setItemToDeleteDefinitively(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmSingleDeleteDefinitive}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-all shadow-lg shadow-rose-600/30 active:scale-[0.98] cursor-pointer"
              >
                Eliminar Definitivamente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 1: Confirmación Inicial (OK) para Borrar Datos */}
      {showWipeConfirmModal && (
        <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#0e1626] border-2 border-rose-500/60 rounded-3xl p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/15 text-rose-400 flex items-center justify-center mb-3">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white mb-1.5">
              ¿Borrar todos los datos de la bóveda?
            </h3>
            <p className="text-xs text-slate-300 mb-5 leading-relaxed">
              Esta acción es <strong>definitiva e irreversible</strong>. Se destruirán permanentemente todas las fotos, videos, documentos, registros y configuraciones guardados en este dispositivo.
            </p>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setShowWipeConfirmModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmWipeRequest}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-all shadow-lg shadow-rose-600/30 active:scale-[0.98]"
              >
                Confirmar (OK)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Autenticación por PIN para Borrar Datos */}
      {showWipePinModal && (
        <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#0e1626] border-2 border-rose-500/60 rounded-3xl p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <button
              onClick={() => {
                setShowWipePinModal(false);
                setWipePinInput('');
                setWipePinError(null);
              }}
              className="absolute top-4 right-4 p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="w-12 h-12 rounded-2xl bg-rose-500/15 text-rose-400 flex items-center justify-center mb-3">
              <KeyRound className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white mb-1">
              Autenticación Requerida
            </h3>
            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              Introduce tu <strong>PIN maestro de usuario</strong> para autorizar la destrucción total de los datos.
            </p>
            <form onSubmit={handleWipePinSubmit} className="space-y-4">
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                value={wipePinInput}
                onChange={(e) => {
                  setWipePinInput(e.target.value);
                  setWipePinError(null);
                }}
                placeholder="••••"
                className="w-full bg-[#162238] border border-slate-700 focus:border-rose-500 rounded-xl px-4 py-2.5 text-center text-xl font-bold text-white tracking-widest focus:outline-none font-mono"
                autoFocus
              />
              {wipePinError && (
                <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400 text-center font-medium">
                  {wipePinError}
                </div>
              )}
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setShowWipePinModal(false);
                    setWipePinInput('');
                    setWipePinError(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={wipePinInput.length < 4 || isVerifyingWipePin}
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs transition-all shadow-lg shadow-rose-600/30"
                >
                  {isVerifyingWipePin ? 'Verificando...' : 'Autorizar y Borrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Barra de Progreso de Borrado hasta 100% */}
      {isWipingData && (
        <div className="fixed inset-0 z-[70] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#0a121d] border-2 border-rose-500/80 rounded-3xl p-6 shadow-2xl space-y-4 text-center animate-in zoom-in-95 duration-200">
            <div className="w-14 h-14 rounded-3xl bg-rose-500/20 border-2 border-rose-500/50 text-rose-400 flex items-center justify-center mx-auto shadow-lg shadow-rose-500/20 animate-pulse">
              <Trash2 className="w-7 h-7 stroke-[2.5]" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-bold text-white">
                Borrando Datos de la Bóveda...
              </h3>
              <p className="text-xs text-slate-400">
                {wipeStepText}
              </p>
            </div>

            {/* Barra de Progreso */}
            <div className="space-y-2 pt-2">
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-slate-400">Progreso de borrado:</span>
                <span className="text-rose-400 font-bold text-sm">{wipeProgress}%</span>
              </div>
              <div className="w-full h-3.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700/80 p-0.5">
                <div
                  className="h-full bg-gradient-to-r from-rose-600 via-pink-500 to-rose-400 rounded-full transition-all duration-300 ease-out shadow-md shadow-rose-500/40"
                  style={{ width: `${wipeProgress}%` }}
                />
              </div>
            </div>

            <p className="text-[10px] text-slate-500 font-medium">
              Por favor espera, no cierres la aplicación hasta completar el 100%.
            </p>
          </div>
        </div>
      )}

      {/* Backup PIN Verification Dialog */}
      {showBackupPinPrompt && (
        <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-lg flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#0e1626] border border-slate-800 rounded-3xl shadow-2xl overflow-hidden p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                <Shield className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-white">Desbloquear Copia de Seguridad</h4>
              <p className="text-[11px] text-slate-400 max-w-xs">
                Esta copia fue creada con un PIN diferente al de tu sesión actual. Ingresa el PIN original para descifrarla.
              </p>
            </div>

            <form onSubmit={handleConfirmBackupPin} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                  PIN de la Copia de Seguridad
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={backupPinInput}
                  onChange={(e) => setBackupPinInput(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder="••••"
                  className="w-full bg-[#162238] border border-slate-800 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-center text-lg font-bold text-white tracking-widest focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                  disabled={isVerifyingBackupPin}
                  autoFocus
                />
              </div>

              {backupPinError && (
                <p className="text-[11px] text-rose-400 font-medium text-center bg-rose-500/10 py-2 px-3 rounded-xl border border-rose-500/20">
                  {backupPinError}
                </p>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowBackupPinPrompt(false);
                    setPendingBackupBlob(null);
                    setPendingBackupHeader(null);
                  }}
                  className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
                  disabled={isVerifyingBackupPin}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={backupPinInput.length < 4 || isVerifyingBackupPin}
                  className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                >
                  <span>{isVerifyingBackupPin ? 'Verificando...' : 'Restaurar'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal de Reinicio Requerido tras Restaurar Copia */}
      {restartPromptInfo.show && (
        <div className="fixed inset-0 z-[70] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-sm bg-[#0a121d] border-2 border-emerald-500/60 rounded-3xl p-6 shadow-2xl space-y-5 text-center animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-3xl bg-emerald-500/20 border-2 border-emerald-500/50 text-emerald-400 flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/20">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-black text-white tracking-tight">
                ¡Copia de Seguridad Restaurada!
              </h3>
              <p className="text-xs text-emerald-300 font-semibold bg-emerald-500/10 py-1.5 px-3 rounded-full inline-block border border-emerald-500/30">
                Se restauraron {restartPromptInfo.importedCount} archivos con éxito
              </p>
              <p className="text-xs text-slate-300 pt-1 leading-relaxed">
                Para aplicar todos los cambios de forma segura, sincronizar las claves criptográficas y recargar todas tus fotos y videos en la bóveda, <strong className="text-white">es necesario reiniciar la aplicación</strong>.
              </p>
            </div>

            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  window.location.reload();
                }}
                className="w-full py-3.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-black rounded-2xl text-sm transition-all shadow-xl shadow-emerald-500/25 flex items-center justify-center gap-2 cursor-pointer active:scale-98"
              >
                <RotateCcw className="w-4 h-4 text-slate-950" />
                <span>Reiniciar aplicación ahora</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  setRestartPromptInfo({ show: false, importedCount: 0 });
                  await onPhotosUpdated();
                }}
                className="w-full py-2.5 text-slate-400 hover:text-white text-xs font-semibold rounded-xl hover:bg-slate-800/50 transition-colors cursor-pointer"
              >
                Cerrar y continuar sin reiniciar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Novedades y Actualizaciones */}
      <UpdateNotificationModal
        isOpen={showChangelogModal}
        onClose={() => setShowChangelogModal(false)}
        updateInfo={updateCheckResult}
        viewNotesOnly={!updateCheckResult?.hasUpdate}
      />

      {/* Modal Clave de Respaldo Maestra */}
      {showRecoveryModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className="w-full max-w-sm rounded-3xl p-6 shadow-2xl transition-all border"
            style={{
              backgroundColor: 'var(--theme-bg-card)',
              borderColor: 'var(--theme-border)',
              color: 'var(--theme-text-main)',
            }}
          >
            <div className="flex justify-between items-center mb-3">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center transition-colors"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--theme-primary) 14%, transparent)',
                  borderColor: 'color-mix(in srgb, var(--theme-primary) 30%, transparent)',
                  borderWidth: 1,
                  color: 'var(--theme-primary)',
                }}
              >
                <KeyRound className="w-6 h-6" />
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowRecoveryModal(false);
                  setNewGeneratedKey(null);
                  setPinForNewKey('');
                  setPinKeyError(null);
                }}
                className="p-1.5 rounded-lg cursor-pointer transition-colors hover:opacity-80"
                style={{ color: 'var(--theme-text-muted)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <h3
              className="text-base font-bold mb-1"
              style={{ color: 'var(--theme-text-main)' }}
            >
              Clave de Respaldo Maestra
            </h3>
            <p
              className="text-xs mb-4 leading-relaxed"
              style={{ color: 'var(--theme-text-muted)' }}
            >
              Esta clave de 16 caracteres te permite recuperar tu bóveda y crear un nuevo PIN si alguna vez lo olvidas, <strong style={{ color: 'var(--theme-text-main)' }}>sin perder ningún archivo</strong>.
            </p>

            {newGeneratedKey ? (
              <div className="space-y-3.5 text-left">
                <div
                  className="rounded-2xl p-4 shadow-xl text-center border-2 transition-colors"
                  style={{
                    backgroundColor: 'var(--theme-bg-secondary)',
                    borderColor: 'var(--theme-primary)',
                  }}
                >
                  <p
                    className="text-[10px] uppercase font-bold tracking-widest mb-1.5"
                    style={{ color: 'var(--theme-primary)' }}
                  >
                    Tu Nueva Clave de Respaldo
                  </p>
                  <div
                    className="py-2.5 px-3 rounded-xl border select-all"
                    style={{
                      backgroundColor: 'var(--theme-bg-input)',
                      borderColor: 'var(--theme-border)',
                    }}
                  >
                    <span
                      className="text-lg font-black font-mono tracking-widest"
                      style={{ color: 'var(--theme-primary)' }}
                    >
                      {formatRecoveryKeyDisplay(newGeneratedKey)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          navigator.clipboard.writeText(newGeneratedKey);
                          setCopiedKey(true);
                          showToast('¡Clave copiada al portapapeles!', 'success');
                          setTimeout(() => setCopiedKey(false), 2500);
                        } catch {}
                      }}
                      className="flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-xl border transition-colors cursor-pointer"
                      style={{
                        backgroundColor: 'color-mix(in srgb, var(--theme-primary) 12%, transparent)',
                        borderColor: 'color-mix(in srgb, var(--theme-primary) 35%, transparent)',
                        color: 'var(--theme-primary)',
                      }}
                    >
                      {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey ? 'Copiada' : 'Copiar'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        try {
                          downloadRecoveryKeyFile(newGeneratedKey);
                          setDownloadedKey(true);
                          showToast('Archivo de respaldo descargado', 'success');
                        } catch {}
                      }}
                      className="flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-xl border transition-colors cursor-pointer"
                      style={{
                        backgroundColor: 'var(--theme-bg-card)',
                        borderColor: 'var(--theme-border)',
                        color: 'var(--theme-text-main)',
                      }}
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Descargar .txt</span>
                    </button>
                  </div>
                </div>

                <div
                  className="p-3 rounded-xl text-xs flex items-start gap-2 border"
                  style={{
                    backgroundColor: 'rgba(16, 185, 129, 0.08)',
                    borderColor: 'rgba(16, 185, 129, 0.25)',
                    color: 'var(--theme-text-main)',
                  }}
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500 mt-0.5" />
                  <span>Esta clave ya quedó activada y vinculada a tu bóveda. Guárdala en tus notas o lugar seguro.</span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowRecoveryModal(false);
                    setNewGeneratedKey(null);
                    setPinForNewKey('');
                  }}
                  className="w-full py-2.5 rounded-xl font-bold text-xs transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5"
                  style={{
                    background: 'linear-gradient(135deg, var(--theme-primary), #2563eb)',
                    color: '#ffffff',
                    boxShadow: '0 4px 14px -2px var(--theme-glow)',
                  }}
                >
                  <span className="text-white font-bold">Entendido y Guardado</span>
                </button>
              </div>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (pinForNewKey.length < 4) {
                    setPinKeyError('Ingresa tu PIN actual de al menos 4 dígitos.');
                    return;
                  }

                  setIsGeneratingKey(true);
                  setPinKeyError(null);

                  try {
                    const saltHex = localStorage.getItem('vault_salt');
                    const testIvHex = localStorage.getItem('vault_test_iv');
                    const testCipherHex = localStorage.getItem('vault_test_cipher');

                    if (!saltHex || !testIvHex || !testCipherHex) {
                      setPinKeyError('Datos de bóveda no encontrados.');
                      return;
                    }

                    const salt = hexToBuf(saltHex);
                    const currentMasterKey = await deriveKeyFromPin(pinForNewKey, salt);
                    const isValid = await verifyKey(currentMasterKey, testIvHex, testCipherHex);

                    if (!isValid) {
                      setPinKeyError('PIN incorrecto. Ingresa el PIN maestro de tu bóveda.');
                      return;
                    }

                    const freshKey = generateRecoveryKey();
                    await backupMasterKeyWithRecoveryKey(currentMasterKey, freshKey);
                    setNewGeneratedKey(freshKey);
                    setHasRecoveryKey(true);
                    showToast('¡Nueva clave de respaldo generada y activada!', 'success');
                  } catch (err: any) {
                    setPinKeyError(err?.message || 'Error al generar clave de respaldo.');
                  } finally {
                    setIsGeneratingKey(false);
                  }
                }}
                className="space-y-3.5 text-left"
              >
                <div
                  className="p-3 rounded-xl border text-xs space-y-1"
                  style={{
                    backgroundColor: 'var(--theme-bg-secondary)',
                    borderColor: 'var(--theme-border)',
                  }}
                >
                  <p className="font-semibold" style={{ color: 'var(--theme-text-main)' }}>¿Deseas generar una nueva clave?</p>
                  <p className="text-[11px]" style={{ color: 'var(--theme-text-muted)' }}>
                    Por seguridad, introduce tu PIN actual para generar y respaldar tu clave maestra:
                  </p>
                </div>

                <div>
                  <label
                    className="block text-xs font-semibold mb-1"
                    style={{ color: 'var(--theme-text-main)' }}
                  >
                    PIN Maestro Actual
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    value={pinForNewKey}
                    onChange={(e) => {
                      setPinForNewKey(e.target.value.replace(/\D/g, ''));
                      setPinKeyError(null);
                    }}
                    placeholder="••••"
                    required
                    autoFocus
                    disabled={isGeneratingKey}
                    className="w-full rounded-xl px-3.5 py-2.5 text-center text-lg font-mono tracking-widest border transition-colors outline-none focus:ring-2"
                    style={{
                      backgroundColor: 'var(--theme-bg-input)',
                      borderColor: 'var(--theme-border)',
                      color: 'var(--theme-text-main)',
                    }}
                  />
                </div>

                {pinKeyError && (
                  <div
                    className="text-xs p-2.5 rounded-xl border flex items-center gap-1.5"
                    style={{
                      backgroundColor: 'rgba(244, 63, 94, 0.1)',
                      borderColor: 'rgba(244, 63, 94, 0.3)',
                      color: '#e11d48',
                    }}
                  >
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>{pinKeyError}</span>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowRecoveryModal(false);
                      setPinForNewKey('');
                      setPinKeyError(null);
                    }}
                    className="flex-1 py-2.5 rounded-xl border font-semibold text-xs transition-colors cursor-pointer"
                    style={{
                      backgroundColor: 'var(--theme-bg-secondary)',
                      borderColor: 'var(--theme-border)',
                      color: 'var(--theme-text-main)',
                    }}
                  >
                    Cerrar
                  </button>
                  <button
                    type="submit"
                    disabled={isGeneratingKey || pinForNewKey.length < 4}
                    className="flex-1 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 shadow-md cursor-pointer disabled:opacity-40"
                    style={{
                      background: 'linear-gradient(135deg, var(--theme-primary), #2563eb)',
                      color: '#ffffff',
                      boxShadow: '0 4px 14px -2px var(--theme-glow)',
                    }}
                  >
                    {isGeneratingKey ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                        <span className="text-white font-bold">Generando...</span>
                      </>
                    ) : (
                      <>
                        <KeyRound className="w-3.5 h-3.5 text-white" />
                        <span className="text-white font-bold">Generar Clave</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
