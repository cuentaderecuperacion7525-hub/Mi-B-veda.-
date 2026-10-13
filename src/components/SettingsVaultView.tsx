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
  ArrowLeft,
  Code2,
  Smartphone,
  RefreshCw,
  Sparkles,
  Bell,
  GitBranch,
} from 'lucide-react';
import { updateService, UpdateCheckResult } from '../services/updateService';
import { CURRENT_APP_VERSION, CURRENT_RELEASE_DATE } from '../version';
import { UpdateNotificationModal } from './UpdateNotificationModal';
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

const formatFileSize = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

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
  const [activeSubMenu, setActiveSubMenu] = useState<'security' | 'backup' | 'danger' | 'updates' | null>(() => {
    if (sessionStorage.getItem('open_backup_tab_on_settings') === 'true') {
      sessionStorage.removeItem('open_backup_tab_on_settings');
      return 'backup';
    }
    return null;
  });

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
    touchStartXRef.current = null;
    touchStartYRef.current = null;

    // Deslizar de izquierda a derecha (swipe horizontal > 60px con baja desviación vertical)
    if (deltaX > 60 && Math.abs(deltaY) < 70) {
      if (activeSubMenu !== null) {
        setActiveSubMenu(null);
      } else {
        triggerBackAction();
      }
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
    window.addEventListener('nullvault_switch_settings_backup', handleCheckBackupTab);
    return () => window.removeEventListener('nullvault_switch_settings_backup', handleCheckBackupTab);
  }, []);

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

  // GitHub repository link for APK updates
  const [githubRepoInput, setGithubRepoInput] = useState<string>(() => updateService.getGitHubRepo());

  const handleSaveGitHubRepo = (e: React.FormEvent) => {
    e.preventDefault();
    updateService.setGitHubRepo(githubRepoInput);
    showToast(githubRepoInput ? 'Repositorio de GitHub configurado correctamente' : 'Configuración de repositorio restablecida', 'success');
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

  const handleExportBackup = async () => {
    if (!masterKey) return;
    setIsExporting(true);
    setExportProgress({ current: 0, total: 1 });
    try {
      const backupBlob = await exportEncryptedBackupBlob((current, total) => {
        setExportProgress({ current, total });
      });

      const dateStr = new Date().toISOString().split('T')[0];
      const fileName = `Boveda_Respaldo_${dateStr}.json`;

      let sharedSuccessfully = false;
      try {
        const backupFile = new File([backupBlob], fileName, { type: 'application/json' });
        if (navigator.canShare && navigator.canShare({ files: [backupFile] })) {
          await navigator.share({
            files: [backupFile],
            title: fileName,
            text: 'Copia de seguridad cifrada de Mi Bóveda',
          });
          sharedSuccessfully = true;
        }
      } catch (shareErr) {
        console.log('Mobile share dismissed or unavailable:', shareErr);
      }

      if (!sharedSuccessfully) {
        const url = URL.createObjectURL(backupBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Retener URL activa durante 3 minutos para que Android Download Manager no falle
        setTimeout(() => {
          try {
            URL.revokeObjectURL(url);
          } catch {}
        }, 180000);
      }

      const now = Date.now();
      localStorage.setItem('nullvault_last_backup_timestamp', now.toString());
      localStorage.setItem('vault_last_backup_timestamp', now.toString());
      localStorage.setItem('nullvault_last_backup_date', new Date().toISOString());
      setLastBackupTimestamp(now);
      window.dispatchEvent(new Event('nullvault_backup_updated'));
      window.dispatchEvent(new Event('vault_backup_updated'));

      showToast('Copia de seguridad descargada con éxito', 'success');
    } catch (err) {
      console.error('Export error:', err);
      showToast('Error al exportar copia de seguridad', 'error');
    } finally {
      setIsExporting(false);
      setExportProgress(null);
    }
  };

  const handleFileRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setSelectedBackupInfo({
        name: file.name,
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
      e.target.value = '';
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
    <div className="w-full max-w-md mx-auto px-4 pb-28 animate-in fade-in duration-200 select-none box-border">
      {/* Fixed Pinned Header */}
      <header className="fixed top-0 left-0 right-0 z-30 bg-[#090d16]/95 backdrop-blur-xl border-b border-slate-800/80 safe-top-sticky pb-3 px-4 shadow-md shadow-black/40 transition-all">
        <div className="max-w-md mx-auto w-full">
          {activeSubMenu === null ? (
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-0.5">
                Configu<span className="text-[#00e5ff]">ración</span>
              </h1>
              <p className="text-[10px] font-semibold text-slate-400 tracking-[0.2em] uppercase">
                AJUSTES Y PREFERENCIAS DE BÓVEDA
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setActiveSubMenu(null)}
                className="p-2 -ml-2 rounded-2xl bg-slate-800/60 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer flex items-center justify-center shrink-0 active:scale-95"
                title="Volver a Configuración"
                aria-label="Volver"
              >
                <ArrowLeft className="w-5 h-5 text-[#00e5ff]" />
              </button>
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-bold tracking-tight text-white truncate mb-0.5">
                  {activeSubMenu === 'security'
                    ? 'Seguridad y PIN'
                    : activeSubMenu === 'backup'
                    ? 'Copia de Seguridad'
                    : activeSubMenu === 'updates'
                    ? 'Actualizaciones del Sistema'
                    : 'Restablecer Bóveda'}
                </h1>
                <p className="text-[10px] font-semibold text-slate-400 tracking-wider uppercase truncate">
                  {activeSubMenu === 'security'
                    ? 'Políticas de acceso y credenciales'
                    : activeSubMenu === 'backup'
                    ? 'Respaldo y restauración cifrada'
                    : activeSubMenu === 'updates'
                    ? 'Búsqueda de novedades y versión actual'
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
          {/* Tarjeta 1: Seguridad y PIN */}
          <div
            onClick={() => setActiveSubMenu('security')}
            className="bg-[#0a121d] border border-slate-800/90 hover:border-cyan-500/40 rounded-2xl p-3 sm:p-3.5 shadow-lg flex items-center justify-between gap-3 cursor-pointer group active:scale-[0.99] transition-all"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#00e5ff]/10 border border-[#00e5ff]/20 flex items-center justify-center text-[#00e5ff] shrink-0 group-hover:scale-105 transition-transform">
                <KeyRound className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-white group-hover:text-[#00e5ff] transition-colors truncate">
                  Seguridad y PIN
                </h3>
                <p className="text-[11px] text-slate-400 truncate mt-0.5">
                  Cambiar PIN maestro, auto-bloqueo y timeout
                </p>
              </div>
            </div>
            <div className="shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-slate-900 border border-slate-800 text-slate-500 group-hover:text-[#00e5ff] group-hover:border-[#00e5ff]/40 transition-colors">
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>

          {/* Tarjeta 2: Copia de Seguridad */}
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
                  Exportar respaldo cifrado y restaurar datos
                </p>
              </div>
            </div>
            <div className="shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-slate-900 border border-slate-800 text-slate-500 group-hover:text-emerald-400 group-hover:border-emerald-500/40 transition-colors">
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>

          {/* Tarjeta 3: Actualizaciones del Sistema */}
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
                    <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/20 text-[#00e5ff] border border-cyan-500/40 animate-pulse">
                      Nueva versión
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 truncate mt-0.5">
                  Buscar actualizaciones, versión v{CURRENT_APP_VERSION} y novedades
                </p>
              </div>
            </div>
            <div className="shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-slate-900 border border-slate-800 text-slate-500 group-hover:text-[#00e5ff] group-hover:border-[#00e5ff]/40 transition-colors">
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>

          {/* Tarjeta 4: Restablecer Bóveda (Zona de Peligro) */}
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
          {activeSubMenu === 'security' && (
          <div className="space-y-6">
            {/* Auto-lock Settings */}
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Políticas de Bloqueo
              </h4>
              <div className="space-y-3 bg-[#0a121d] p-4 rounded-3xl border border-slate-800/90 shadow-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Clock className="w-4 h-4 text-[#00e5ff]" />
                    <div>
                      <p className="text-xs font-semibold text-slate-200">Auto-bloqueo por inactividad</p>
                      <p className="text-[11px] text-slate-400">Bloquea la bóveda si no hay interacción</p>
                    </div>
                  </div>
                  <select
                    value={autoLockMinutes}
                    onChange={(e) => onAutoLockChange(Number(e.target.value))}
                    className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-[#00e5ff]"
                  >
                    <option value={0.5}>30 segundos</option>
                    <option value={1}>1 minuto</option>
                    <option value={2}>2 minutos</option>
                    <option value={5}>5 minutos</option>
                    <option value={10}>10 minutos</option>
                    <option value={0}>Desactivado</option>
                  </select>
                </div>

                <div className="border-t border-slate-800/80 pt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <EyeOff className="w-4 h-4 text-[#00e5ff]" />
                    <div>
                      <p className="text-xs font-semibold text-slate-200">Bloquear al cambiar de pestaña</p>
                      <p className="text-[11px] text-slate-400">Protege tu pantalla si sales del navegador</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={lockOnTabSwitch}
                      onChange={(e) => onLockOnTabSwitchChange(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#00e5ff]"></div>
                  </label>
                </div>
              </div>
            </div>

            {/* Change Master PIN Form */}
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Cambiar PIN Maestro
              </h4>
              <form onSubmit={handleChangePin} className="space-y-3 bg-[#0a121d] p-4 rounded-3xl border border-slate-800/90 shadow-xl">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">PIN Actual</label>
                  <div className="relative flex items-center">
                    <input
                      type={showCurrentPin ? 'text' : 'password'}
                      inputMode="numeric"
                      value={currentPin}
                      onChange={(e) => setCurrentPin(e.target.value)}
                      placeholder="••••"
                      required
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 pr-10 text-sm text-slate-100 focus:outline-none focus:border-[#00e5ff] font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPin(!showCurrentPin)}
                      className="absolute right-2.5 text-slate-400 hover:text-slate-200 transition-colors p-1"
                      title={showCurrentPin ? 'Ocultar PIN' : 'Ver PIN'}
                    >
                      {showCurrentPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Nuevo PIN</label>
                    <div className="relative flex items-center">
                      <input
                        type={showNewPin ? 'text' : 'password'}
                        inputMode="numeric"
                        value={newPin}
                        onChange={(e) => setNewPin(e.target.value)}
                        placeholder="••••"
                        required
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 pr-10 text-sm text-slate-100 focus:outline-none focus:border-[#00e5ff] font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPin(!showNewPin)}
                        className="absolute right-2.5 text-slate-400 hover:text-slate-200 transition-colors p-1"
                        title={showNewPin ? 'Ocultar PIN' : 'Ver PIN'}
                      >
                        {showNewPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Confirmar Nuevo</label>
                    <div className="relative flex items-center">
                      <input
                        type={showConfirmNewPin ? 'text' : 'password'}
                        inputMode="numeric"
                        value={confirmNewPin}
                        onChange={(e) => setConfirmNewPin(e.target.value)}
                        placeholder="••••"
                        required
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 pr-10 text-sm text-slate-100 focus:outline-none focus:border-[#00e5ff] font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmNewPin(!showConfirmNewPin)}
                        className="absolute right-2.5 text-slate-400 hover:text-slate-200 transition-colors p-1"
                        title={showConfirmNewPin ? 'Ocultar PIN' : 'Ver PIN'}
                      >
                        {showConfirmNewPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {pinChangeError && (
                  <div className="text-rose-400 text-xs bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20">
                    {pinChangeError}
                  </div>
                )}

                {pinChangeSuccess && (
                  <div className="text-emerald-400 text-xs bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/20 flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" />
                    <span>PIN actualizado con éxito.</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isChangingPin || !currentPin || !newPin || !confirmNewPin}
                  className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-40 text-slate-950 font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>{isChangingPin ? 'Re-cifrando bóveda...' : 'Actualizar PIN'}</span>
                </button>
              </form>
            </div>
          </div>
        )}

        {activeSubMenu === 'backup' && (
          <div className="space-y-4">
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
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2 border border-slate-700"
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

              <label className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-600/20">
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

              {/* Pegar texto directo */}
              <div className="border-t border-slate-800/80 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">¿Problemas al abrir el archivo?</span>
                  <button
                    type="button"
                    onClick={() => setShowPasteInput(!showPasteInput)}
                    className="text-xs text-[#00e5ff] hover:underline font-medium"
                  >
                    {showPasteInput ? 'Ocultar' : 'Pegar texto directo'}
                  </button>
                </div>

                {showPasteInput && (
                  <div className="mt-2.5 space-y-2 animate-in fade-in">
                    <textarea
                      rows={3}
                      value={pastedBackupText}
                      onChange={(e) => setPastedBackupText(e.target.value)}
                      placeholder="Pega aquí el contenido JSON del archivo..."
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-[#00e5ff] resize-none"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={!pastedBackupText.trim() || isImporting}
                        onClick={handlePasteRestore}
                        className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl text-xs font-semibold"
                      >
                        Restaurar desde texto
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Tarjeta de Descarga del Código Fuente (.txt) */}
            <div className="bg-[#0a121d] p-4 rounded-3xl border border-slate-800/90 shadow-xl space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-cyan-500/10 text-[#00e5ff] rounded-2xl border border-cyan-500/20">
                  <Code2 className="w-5 h-5" />
                </div>
                <div>
                  <h5 className="text-xs font-semibold text-white">Código Fuente Completo (.txt)</h5>
                  <p className="text-[11px] text-slate-400">
                    Descarga todo el código fuente de la aplicación en un solo archivo de texto para analizarlo o corregirlo.
                  </p>
                </div>
              </div>

              <a
                href="/codigo_completo.txt"
                download="codigo_completo_boveda.txt"
                className="w-full py-2.5 bg-slate-800/90 hover:bg-slate-700 active:scale-98 text-slate-200 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 border border-slate-700/80 cursor-pointer"
              >
                <Download className="w-4 h-4 text-[#00e5ff]" />
                <span>Descargar Código Fuente (.txt)</span>
              </a>
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
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Tarjeta de estado de versión actual y búsqueda */}
            <div className="bg-[#0a121d] p-4.5 rounded-3xl border border-cyan-500/30 shadow-xl space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-[#00e5ff] shrink-0 shadow-lg shadow-cyan-500/10">
                    <RefreshCw className={`w-5 h-5 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-white truncate">Versión del Sistema</h4>
                      <span className="font-mono text-xs font-bold text-[#00e5ff] bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/25">
                        v{CURRENT_APP_VERSION}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 font-medium truncate mt-0.5">
                      Lanzamiento: {CURRENT_RELEASE_DATE}
                    </p>
                  </div>
                </div>

                {/* Badge de estado */}
                {updateCheckResult?.hasUpdate ? (
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-cyan-500/20 text-[#00e5ff] border border-cyan-500/40 animate-pulse">
                    Nueva versión
                  </span>
                ) : (
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 stroke-[2.5]" />
                    Al día
                  </span>
                )}
              </div>

              {/* Si hay actualización disponible: Banner destacado con botón directo */}
              {updateCheckResult?.hasUpdate && (
                <div className="bg-gradient-to-r from-cyan-950/40 via-blue-950/40 to-slate-900 border border-cyan-500/40 rounded-2xl p-3.5 space-y-3 animate-in zoom-in-95 duration-200">
                  <div className="flex items-start gap-2.5">
                    <Sparkles className="w-4 h-4 text-[#00e5ff] shrink-0 mt-0.5 animate-pulse" />
                    <div>
                      <p className="text-xs font-bold text-white">
                        ¡Nueva versión v{updateCheckResult.latestVersion} disponible!
                      </p>
                      <p className="text-[11px] text-slate-300 leading-snug mt-0.5">
                        Mejoras listas para instalar. Tus fotos y claves permanecen 100% protegidas.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowChangelogModal(true)}
                      className="flex-1 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-200 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5"
                    >
                      <span>Ver Novedades</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateService.applyUpdate()}
                      className="flex-1 py-2 rounded-xl bg-[#00e5ff] hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/30 transition-all flex items-center justify-center gap-1.5 active:scale-95"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Actualizar Ahora</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Botón principal: Buscar Actualizaciones */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleCheckForUpdates}
                  disabled={isCheckingUpdate}
                  className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-60 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
                  <span>{isCheckingUpdate ? 'Buscando actualizaciones...' : 'Buscar Actualizaciones'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowChangelogModal(true)}
                  className="py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-[#00e5ff]" />
                  <span>Novedades de esta Versión</span>
                </button>
              </div>

              {/* Información de estado de firmas y caché */}
              <div className="bg-slate-900/80 p-3 rounded-2xl border border-slate-800/90 text-xs text-slate-300 space-y-1.5">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-400">Estado de la instalación:</span>
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <Check className="w-3 h-3 stroke-[3]" />
                    Optimizado sin pérdida de datos
                  </span>
                </div>
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-400">Comprobación:</span>
                  <span className="font-mono text-slate-400">En tiempo real vía red</span>
                </div>
              </div>
            </div>

            {/* Configuración de Notificaciones Automáticas */}
            <div className="bg-[#0a121d] p-4.5 rounded-3xl border border-slate-800 shadow-xl">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-[#00e5ff] shrink-0">
                    <Bell className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-white">Aviso automático al entrar</h5>
                    <p className="text-[11px] text-slate-400">Muestra un mensaje si hay una nueva versión lista</p>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={autoCheckUpdates}
                    onChange={(e) => handleToggleAutoCheck(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#00e5ff]"></div>
                </label>
              </div>
            </div>

            {/* Vinculación con GitHub para APKs de Android */}
            <div className="bg-[#0a121d] p-4.5 rounded-3xl border border-slate-800 shadow-xl space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
                  <GitBranch className="w-4 h-4" />
                </div>
                <div>
                  <h5 className="text-xs font-bold text-white">Vincular Repositorio de GitHub</h5>
                  <p className="text-[11px] text-slate-400">Para detectar nuevas versiones directamente en tu APK</p>
                </div>
              </div>

              <p className="text-[11px] text-slate-300 leading-relaxed">
                Si compilas tu APK desde GitHub Actions, puedes escribir tu usuario y repositorio (ejemplo: <code className="text-[#00e5ff] font-mono">tu-usuario/tu-repo</code>). Al entrar, la aplicación consultará GitHub por internet y te avisará si subiste una nueva versión.
              </p>

              <form onSubmit={handleSaveGitHubRepo} className="flex gap-2">
                <input
                  type="text"
                  value={githubRepoInput}
                  onChange={(e) => setGithubRepoInput(e.target.value)}
                  placeholder="usuario/repositorio"
                  className="flex-1 bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-[#00e5ff] font-mono"
                />
                <button
                  type="submit"
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-xl border border-slate-700 transition-colors shrink-0"
                >
                  Guardar
                </button>
              </form>
            </div>

            {/* Solución al error "El paquete no es válido" (Guía APK) */}
            <div className="bg-[#0a121d] p-4.5 rounded-3xl border border-slate-800 shadow-xl space-y-3">
              <div className="flex items-center gap-2 text-amber-400">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <h5 className="text-xs font-bold uppercase tracking-wider">
                  ¿Instalaste la App por APK en Android?
                </h5>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                Si descargas la actualización en Android desde GitHub empaquetada en un archivo <b className="text-amber-300">.zip</b>, recuerda descomprimirlo primero antes de tocar el instalador para evitar el aviso de paquete inválido.
              </p>

              <div className="bg-slate-900/90 p-3.5 rounded-2xl border border-slate-800 space-y-2.5 text-xs">
                <p className="font-bold text-white text-[11px] uppercase tracking-wider">
                  Pasos para actualizar tu APK en 3 simples pasos:
                </p>

                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-[#00e5ff] flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5 border border-cyan-500/30">
                    1
                  </span>
                  <p className="text-slate-300 leading-snug">
                    Abre <strong className="text-white">"Archivos"</strong> o <strong className="text-white">"Mis Archivos"</strong> de tu celular y entra a <strong className="text-white">Descargas</strong>.
                  </p>
                </div>

                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-[#00e5ff] flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5 border border-cyan-500/30">
                    2
                  </span>
                  <p className="text-slate-300 leading-snug">
                    Toca el archivo <strong className="text-amber-300">.zip</strong> descargado y pulsa <strong className="text-emerald-400">"Extraer"</strong>.
                  </p>
                </div>

                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-[#00e5ff] flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5 border border-cyan-500/30">
                    3
                  </span>
                  <p className="text-slate-300 leading-snug">
                    Toca el archivo <strong className="text-[#00e5ff]">.apk</strong> extraído y pulsa <strong className="text-white">"Actualizar"</strong>. Se conservarán todas tus fotos y contraseñas.
                  </p>
                </div>
              </div>
            </div>

            {/* Consejo de seguridad */}
            <div className="bg-emerald-950/20 p-4 rounded-3xl border border-emerald-500/30 text-xs space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 font-bold">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Consejo de seguridad permanente</span>
              </div>
              <p className="text-slate-300 leading-relaxed text-[11px]">
                Antes de cualquier actualización mayor del sistema operativo de tu teléfono, siempre puedes exportar un respaldo desde la pestaña <button type="button" onClick={() => setActiveSubMenu('backup')} className="text-emerald-300 underline font-bold cursor-pointer">Copia de Seguridad</button>.
              </p>
            </div>
          </div>
        )}
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
                <span>🔄 Reiniciar Aplicación Ahora</span>
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
    </div>
  );
};
