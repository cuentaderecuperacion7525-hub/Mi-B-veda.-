/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Shield } from 'lucide-react';
import { App as CapacitorApp } from '@capacitor/app';
import { SetupVaultView } from './components/SetupVaultView';
import { LockVaultView } from './components/LockVaultView';
import { MainVaultView } from './components/MainVaultView';
import { InitialRegisterView } from './components/InitialRegisterView';
import { SettingsModal } from './components/SettingsModal';
import { ToastContainer, ToastData } from './components/Toast';
import { openVaultDatabase, clearVaultDatabase, autoPurgeTrash } from './db/vaultDb';
import { initScreenshotBlocker, setScreenshotBlockToastCallback } from './services/screenshotBlockService';
import { initBackButtonListener } from './services/backButtonService';
import { updateService, UpdateCheckResult } from './services/updateService';
import { flipToLockService } from './services/flipToLockService';
import { themeService } from './services/themeService';
import { userProfileService } from './services/userProfileService';
import { testFirestoreConnection } from './services/firebase';
import { UpdateNotificationModal } from './components/UpdateNotificationModal';
import { CURRENT_APP_VERSION } from './version';
import { disableBiometrics } from './services/biometricService';
import { disableRecoveryKey } from './services/recoveryKeyService';
import { clearDuressPinHash } from './crypto/vaultCrypto';
import { clearAllStoredLocalBackups } from './services/backupStorageService';

export default function App() {
  const [vaultStatus, setVaultStatus] = useState<'checking' | 'register' | 'setup' | 'locked' | 'unlocked'>('checking');
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null);
  const [sessionPin, setSessionPin] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPrivacyBlurActive, setIsPrivacyBlurActive] = useState(false);

  // Settings
  const [autoLockMinutes, setAutoLockMinutes] = useState<number>(() => {
    const saved = localStorage.getItem('vault_autolock_mins');
    const val = Number(saved);
    return saved !== null && !isNaN(val) ? val : 5;
  });

  const [lockOnTabSwitch, setLockOnTabSwitch] = useState<boolean>(() => {
    const saved = localStorage.getItem('vault_lock_on_tab_switch');
    return saved !== null ? saved === 'true' : true;
  });

  const vaultStatusRef = useRef(vaultStatus);
  useEffect(() => {
    vaultStatusRef.current = vaultStatus;
  }, [vaultStatus]);

  const lockOnTabSwitchRef = useRef(lockOnTabSwitch);
  useEffect(() => {
    lockOnTabSwitchRef.current = lockOnTabSwitch;
  }, [lockOnTabSwitch]);

  const [vaultRefreshTrigger, setVaultRefreshTrigger] = useState<number>(0);

  // Sistema de Actualizaciones
  const [pendingUpdateInfo, setPendingUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [showUpdateBanner, setShowUpdateBanner] = useState<boolean>(false);
  const [showUpdateModal, setShowUpdateModal] = useState<boolean>(false);
  const [isViewingUpdates, setIsViewingUpdates] = useState<boolean>(() => {
    return typeof window !== 'undefined' && sessionStorage.getItem('vault_updates_menu_active') === 'true';
  });
  const isViewingUpdatesRef = useRef<boolean>(isViewingUpdates);

  useEffect(() => {
    isViewingUpdatesRef.current = isViewingUpdates;
  }, [isViewingUpdates]);

  useEffect(() => {
    const handleUpdateViewState = (e: any) => {
      const isOpen = !!e.detail?.isOpen;
      setIsViewingUpdates(isOpen);
      if (isOpen) {
        setShowUpdateBanner(false);
      }
    };

    window.addEventListener('vault_updates_view_state', handleUpdateViewState);
    return () => window.removeEventListener('vault_updates_view_state', handleUpdateViewState);
  }, []);

  const inactivityTimerRef = useRef<number | null>(null);

  // Toast Helper
  const showToast = useCallback((message: string, type: 'info' | 'success' | 'alert' | 'error' = 'info') => {
    const id = `${Date.now()}_${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  // Lock Vault Action
  const lockVault = useCallback(() => {
    // Strictly forbid locking while picking files, authenticating Google account, or running backup operations
    if (
      (window as any).__isPickingFile ||
      (window as any).__isProcessingBackup ||
      (window as any).__isAuthenticatingGoogle
    ) {
      return;
    }
    // CRITICAL: NEVER lock if the vault is not in 'unlocked' state!
    // During registration ('register') or setup ('setup'), the user has not finished onboarding;
    // locking would switch them to LockVaultView and corrupt the onboarding flow.
    if (vaultStatusRef.current !== 'unlocked') {
      return;
    }
    try {
      sessionStorage.removeItem('vault_session_pin');
      sessionStorage.removeItem('vault_is_duress_mode');
    } catch {}
    setMasterKey(null);
    setSessionPin(null);
    setVaultStatus('locked');
    setIsSettingsOpen(false);
  }, []);

  // Memoized unlock handler with extended post-unlock immunity grace period (20 seconds)
  const handleUnlock = useCallback((key: CryptoKey, pin?: string) => {
    const now = Date.now();
    (window as any).__lastUnlockTime = now;
    (window as any).__lastBiometricUnlockTime = now;
    setMasterKey(key);
    if (pin) {
      setSessionPin(pin);
      try {
        sessionStorage.setItem('vault_session_pin', pin);
      } catch {}
    }
    setVaultStatus('unlocked');
  }, []);

  // Android Back navigation for settings
  const isSettingsOpenRef = useRef(isSettingsOpen);
  isSettingsOpenRef.current = isSettingsOpen;
  const wasSettingsOpenRef = useRef(false);

  useEffect(() => {
    if (isSettingsOpen && !wasSettingsOpenRef.current) {
      window.history.pushState({ appOverlay: 'settings' }, '');
      wasSettingsOpenRef.current = true;
    } else if (!isSettingsOpen && wasSettingsOpenRef.current) {
      wasSettingsOpenRef.current = false;
      if (window.history.state?.appOverlay === 'settings') {
        window.history.back();
      }
    }
  }, [isSettingsOpen]);

  useEffect(() => {
    const handlePopState = () => {
      if (isSettingsOpenRef.current) {
        wasSettingsOpenRef.current = false;
        setIsSettingsOpen(false);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Check initial vault existence on mount
  useEffect(() => {
    const init = async () => {
      try {
        await openVaultDatabase();
        const isInit = localStorage.getItem('vault_initialized');
        const saltHex = localStorage.getItem('vault_salt');
        const testIvHex = localStorage.getItem('vault_test_iv');
        const testCipherHex = localStorage.getItem('vault_test_cipher');
        const isRegistered = userProfileService.isUserRegistered();

        if (isInit === 'true' && saltHex && testIvHex && testCipherHex) {
          // Ya existen datos y la bóveda está inicializada: salta directo a la pantalla de Autenticación
          setVaultStatus('locked');
        } else if (!isRegistered) {
          // Primera vez que se abre la app (no existen datos guardados): muestra Registro Inicial / Bienvenido
          setVaultStatus('register');
        } else {
          // Usuario registrado pero pendiente de configurar PIN o clave
          setVaultStatus('setup');
        }
        // Auto-limpieza en segundo plano de la papelera (elementos mayores a 30 días)
        autoPurgeTrash(30).catch(() => {});
        testFirestoreConnection().catch(() => {});
      } catch (err) {
        console.error('Initialization error:', err);
        setVaultStatus('setup');
      }
    };

    init();
    initScreenshotBlocker();
    setScreenshotBlockToastCallback(showToast);
    initBackButtonListener();
  }, [showToast]);

  // Bloqueo al Voltear el Teléfono Boca Abajo (Flip to Lock / Face-Down)
  useEffect(() => {
    if (vaultStatus !== 'unlocked') return;

    const unregister = flipToLockService.register(() => {
      showToast('Bóveda bloqueada al voltear el teléfono', 'alert');
      lockVault();
    });

    return () => {
      unregister();
    };
  }, [vaultStatus, lockVault, showToast]);

  // Root back button press notice
  useEffect(() => {
    const handleRootBack = () => {
      showToast('Presiona o desliza atrás de nuevo para salir', 'info');
    };
    const handleRootExit = () => {
      showToast('Saliendo de la bóveda...', 'info');
    };
    window.addEventListener('vault_root_back_press', handleRootBack);
    window.addEventListener('vault_root_exit_allowed', handleRootExit);
    return () => {
      window.removeEventListener('vault_root_back_press', handleRootBack);
      window.removeEventListener('vault_root_exit_allowed', handleRootExit);
    };
  }, [showToast]);

  // Detección automática de actualizaciones al entrar a la aplicación
  useEffect(() => {
    // Si la app acaba de actualizarse, mostrar saludo de confirmación
    if (sessionStorage.getItem('vault_just_updated') === 'true') {
      sessionStorage.removeItem('vault_just_updated');
      setTimeout(() => {
        showToast(`¡Bóveda actualizada con éxito a la versión v${CURRENT_APP_VERSION}!`, 'success');
      }, 700);
    }

    if (!updateService.isAutoCheckEnabled()) return;

    // Comprobar actualizaciones tras 1.5s para no competir con el arranque inicial
    const timer = setTimeout(async () => {
      try {
        const res = await updateService.checkForUpdates();
        if (res.hasUpdate) {
          setPendingUpdateInfo(res);
          if (!updateService.isUpdateDismissed(res.latestVersion)) {
            setShowUpdateBanner(true);
          }
        }
      } catch (e) {
        console.warn('Error al verificar actualizaciones al entrar:', e);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [showToast]);

  // Suscribirse a eventos de actualización
  useEffect(() => {
    return updateService.subscribe((res) => {
      if (res.hasUpdate) {
        setPendingUpdateInfo(res);
        if (
          !updateService.isUpdateDismissed(res.latestVersion) &&
          !isViewingUpdatesRef.current &&
          sessionStorage.getItem('vault_updates_menu_active') !== 'true'
        ) {
          setShowUpdateBanner(true);
        }
      }
    });
  }, []);

  // App privacy blur shield and immediate locking when minimizing or switching apps (ONLY when unlocked)
  useEffect(() => {
    let appStateHandle: any = null;

    const isUserPickingFiles = () => {
      if ((window as any).__isPickingFile || (window as any).__isAuthenticatingGoogle) return true;
      const startTime = (window as any).__filePickingStartTime || 0;
      if (startTime > 0 && Date.now() - startTime < 180000) return true; // 3 min grace window while picking files
      const googleAuthStart = (window as any).__googleAuthStartTime || 0;
      if (googleAuthStart > 0 && Date.now() - googleAuthStart < 180000) return true;
      return false;
    };

    const handleMinimizeOrBackground = () => {
      if (isUserPickingFiles() || (window as any).__isProcessingBackup || (window as any).__isAuthenticatingGoogle) {
        return;
      }
      // CRITICAL: NEVER lock if in 'register' or 'setup' mode!
      // The user is legitimately minimizing to retrieve their verification code from Gmail.
      if (vaultStatusRef.current !== 'unlocked') {
        return;
      }
      if (lockOnTabSwitchRef.current) {
        lockVault();
      }
    };

    if (CapacitorApp && typeof CapacitorApp.addListener === 'function') {
      try {
        CapacitorApp.addListener('appStateChange', (state) => {
          if (!isUserPickingFiles()) {
            setIsPrivacyBlurActive(!state.isActive && vaultStatusRef.current === 'unlocked');
          }
          if (!state.isActive) {
            handleMinimizeOrBackground();
          } else {
            setIsPrivacyBlurActive(false);
            window.dispatchEvent(new CustomEvent('vault_app_resumed'));
          }
        }).then((h) => {
          appStateHandle = h;
        }).catch(() => {});
      } catch {}
    }

    const handleDocVisibility = () => {
      const isHidden = document.visibilityState === 'hidden';
      if (!isUserPickingFiles()) {
        setIsPrivacyBlurActive(isHidden && vaultStatusRef.current === 'unlocked');
      }
      if (isHidden) {
        handleMinimizeOrBackground();
      } else {
        setIsPrivacyBlurActive(false);
        window.dispatchEvent(new CustomEvent('vault_app_resumed'));
      }
    };

    const handleWindowBlur = () => {
      if (!isUserPickingFiles() && vaultStatusRef.current === 'unlocked') {
        setIsPrivacyBlurActive(true);
      }
      handleMinimizeOrBackground();
    };

    const handleWindowFocus = () => {
      setIsPrivacyBlurActive(false);
      window.dispatchEvent(new CustomEvent('vault_app_resumed'));
    };

    const handlePageHide = () => {
      handleMinimizeOrBackground();
    };

    document.addEventListener('visibilitychange', handleDocVisibility);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      if (appStateHandle && typeof appStateHandle.remove === 'function') {
        appStateHandle.remove();
      }
      document.removeEventListener('visibilitychange', handleDocVisibility);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [lockVault]);

  // Inactivity auto-lock
  useEffect(() => {
    const mins = Number(autoLockMinutes);
    if (vaultStatus !== 'unlocked' || isNaN(mins) || mins <= 0) {
      if (inactivityTimerRef.current) {
        window.clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      return;
    }

    const resetTimer = () => {
      if (inactivityTimerRef.current) {
        window.clearTimeout(inactivityTimerRef.current);
      }
      if (
        (window as any).__isProcessingBackup ||
        (window as any).__isPickingFile ||
        (window as any).__isAuthenticatingGoogle
      ) {
        // Pause auto-lock completely during backup generation/restoration, Google auth, or file picking
        return;
      }
      inactivityTimerRef.current = window.setTimeout(() => {
        lockVault();
      }, mins * 60 * 1000);
    };

    resetTimer();

    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'pointerdown', 'click'];
    activityEvents.forEach((evt) => window.addEventListener(evt, resetTimer, { passive: true }));

    return () => {
      if (inactivityTimerRef.current) {
        window.clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      activityEvents.forEach((evt) => window.removeEventListener(evt, resetTimer));
    };
  }, [vaultStatus, autoLockMinutes, lockVault]);

  // Robust File Picker protection: keeps auto-lock completely paused while Android File Picker is active
  useEffect(() => {
    const handleFilePickerClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target) return;

      const isFileInput = target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'file';
      const isLabelForFile = target.closest('label') && target.closest('label')?.querySelector('input[type="file"]');

      if (isFileInput || isLabelForFile) {
        (window as any).__isPickingFile = true;
        (window as any).__filePickingStartTime = Date.now();
      }
    };

    // When the user finishes picking or cancels, reset the flag safely with a 4s grace window
    const handleFileChangeOrCancel = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target && target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'file') {
        setTimeout(() => {
          (window as any).__isPickingFile = false;
        }, 4000);
      }
    };

    window.addEventListener('click', handleFilePickerClick, true);
    window.addEventListener('change', handleFileChangeOrCancel, true);
    window.addEventListener('cancel', handleFileChangeOrCancel, true);

    return () => {
      window.removeEventListener('click', handleFilePickerClick, true);
      window.removeEventListener('change', handleFileChangeOrCancel, true);
      window.removeEventListener('cancel', handleFileChangeOrCancel, true);
    };
  }, []);


  // Panic key: Escape locks immediately
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && vaultStatus === 'unlocked' && !isSettingsOpen) {
        lockVault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [vaultStatus, isSettingsOpen, lockVault]);

  // Reset Vault Handler
  const handleResetVault = async () => {
    try {
      await clearVaultDatabase();
      await clearAllStoredLocalBackups();
      try {
        sessionStorage.removeItem('vault_session_pin');
        sessionStorage.removeItem('vault_is_duress_mode');
      } catch {}
      disableBiometrics();
      disableRecoveryKey();
      clearDuressPinHash();
      localStorage.removeItem('vault_salt');
      localStorage.removeItem('vault_test_iv');
      localStorage.removeItem('vault_test_cipher');
      localStorage.removeItem('vault_initialized');
      localStorage.removeItem('vault_pin_length');
      localStorage.removeItem('nullvault_lockout_until');
      localStorage.removeItem('nullvault_failed_streak');

      setMasterKey(null);
      setSessionPin(null);
      setIsSettingsOpen(false);
      if (!userProfileService.isUserRegistered()) {
        setVaultStatus('register');
      } else {
        setVaultStatus('setup');
      }
      showToast('Bóveda restablecida por completo', 'alert');
    } catch (err) {
      console.error('Error resetting vault:', err);
      showToast('Error al restablecer la bóveda', 'error');
    }
  };

  // Preference change listeners
  const handleAutoLockChange = (mins: number) => {
    setAutoLockMinutes(mins);
    localStorage.setItem('vault_autolock_mins', mins.toString());
  };

  const handleLockOnTabSwitchChange = (enabled: boolean) => {
    setLockOnTabSwitch(enabled);
    localStorage.setItem('vault_lock_on_tab_switch', enabled ? 'true' : 'false');
  };

  return (
    <div
      className="min-h-screen flex flex-col font-sans select-none w-full max-w-full overflow-x-hidden transition-colors duration-250"
      style={{
        backgroundColor: 'var(--theme-bg-main, #060b14)',
        color: 'var(--theme-text-main, #f8fafc)',
      }}
    >
      {/* Toast Notification Layer */}
      <ToastContainer toasts={toasts} />

      {/* Screen Routing */}
      {vaultStatus === 'checking' && (
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
        </div>
      )}

      {vaultStatus === 'register' && (
        <InitialRegisterView
          onComplete={() => setVaultStatus('setup')}
          showToast={showToast}
        />
      )}

      {vaultStatus === 'setup' && (
        <SetupVaultView
          onSetupComplete={(key, pin) => handleUnlock(key, pin)}
          showToast={showToast}
        />
      )}

      {vaultStatus === 'locked' && (
        <LockVaultView
          onUnlock={handleUnlock}
          onResetVaultRequest={handleResetVault}
          showToast={showToast}
        />
      )}

      {vaultStatus === 'unlocked' && masterKey && (
        <>
          <MainVaultView
            masterKey={masterKey}
            sessionPin={sessionPin}
            onLock={lockVault}
            onOpenSettings={() => setIsSettingsOpen(true)}
            showToast={showToast}
            refreshTrigger={vaultRefreshTrigger}
            autoLockMinutes={autoLockMinutes}
            onAutoLockChange={handleAutoLockChange}
            lockOnTabSwitch={lockOnTabSwitch}
            onLockOnTabSwitchChange={handleLockOnTabSwitchChange}
            onMasterKeyUpdated={(newKey, newPin) => {
              setMasterKey(newKey);
              if (newPin) {
                setSessionPin(newPin);
                try {
                  sessionStorage.setItem('vault_session_pin', newPin);
                } catch {}
              }
              setVaultRefreshTrigger((prev) => prev + 1);
            }}
            onResetVault={handleResetVault}
            hasUpdatePending={!!pendingUpdateInfo?.hasUpdate}
          />

          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            masterKey={masterKey}
            sessionPin={sessionPin}
            onMasterKeyUpdated={(newKey, newPin) => {
              setMasterKey(newKey);
              if (newPin) {
                setSessionPin(newPin);
                try {
                  sessionStorage.setItem('vault_session_pin', newPin);
                } catch {}
              }
              setVaultRefreshTrigger((prev) => prev + 1);
            }}
            autoLockMinutes={autoLockMinutes}
            onAutoLockChange={handleAutoLockChange}
            lockOnTabSwitch={lockOnTabSwitch}
            onLockOnTabSwitchChange={handleLockOnTabSwitchChange}
            onPhotosUpdated={() => {
              setVaultRefreshTrigger((prev) => prev + 1);
            }}
            onResetVault={handleResetVault}
            showToast={showToast}
          />
        </>
      )}

      {/* Modal interactivo con Novedades de la Versión */}
      <UpdateNotificationModal
        isOpen={showUpdateModal}
        onClose={() => setShowUpdateModal(false)}
        updateInfo={pendingUpdateInfo}
        viewNotesOnly={false}
      />

      {/* Privacy Blur Shield when minimizing app or switching tasks */}
      {isPrivacyBlurActive && (
        <div className="fixed inset-0 z-[99999] backdrop-blur-3xl bg-[#060b14]/90 flex flex-col items-center justify-center p-6 text-center select-none animate-in fade-in duration-100 pointer-events-none">
          <div className="w-20 h-20 rounded-3xl bg-[#00e5ff]/10 border border-[#00e5ff]/30 flex items-center justify-center text-[#00e5ff] mb-4 shadow-[0_0_50px_rgba(0,229,255,0.25)] animate-pulse">
            <Shield className="w-10 h-10 stroke-[2]" />
          </div>
          <h3 className="text-xl font-bold text-white tracking-tight mb-1">
            Mi Bóveda Protegida
          </h3>
          <p className="text-xs text-slate-400 font-medium">
            Contenido privado oculto por seguridad
          </p>
        </div>
      )}
    </div>
  );
}
