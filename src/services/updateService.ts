/**
 * Servicio de detección, notificación y aplicación de actualizaciones para la aplicación.
 */

import { CURRENT_APP_VERSION, CURRENT_BUILD_NUMBER, CURRENT_RELEASE_DATE, CURRENT_CHANGELOG, VersionInfo } from '../version';

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseDate?: string;
  changelog?: string[];
  mandatory?: boolean;
  isServiceWorkerReady?: boolean;
  downloadUrl?: string;
  error?: string;
}

type UpdateListener = (result: UpdateCheckResult) => void;

class UpdateService {
  private listeners: Set<UpdateListener> = new Set();
  private lastCheckResult: UpdateCheckResult | null = null;
  private isChecking: boolean = false;

  constructor() {
    this.initServiceWorkerListener();
  }

  /**
   * Escucha si el service worker detecta un nuevo bundle listo en segundo plano.
   */
  private initServiceWorkerListener() {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // El nuevo worker ha tomado control
      console.log('[UpdateService] Controller cambiado, nuevo SW activo');
    });
  }

  /**
   * Compara dos versiones semver (ej. "1.2.0" y "1.2.1").
   * Retorna 1 si v1 > v2, -1 si v1 < v2, y 0 si son iguales.
   */
  public compareVersions(v1: string, v2: string): number {
    const clean1 = v1.replace(/^v/, '').split('.').map(Number);
    const clean2 = v2.replace(/^v/, '').split('.').map(Number);

    for (let i = 0; i < Math.max(clean1.length, clean2.length); i++) {
      const num1 = clean1[i] || 0;
      const num2 = clean2[i] || 0;
      if (num1 > num2) return 1;
      if (num1 < num2) return -1;
    }
    return 0;
  }

  /**
   * Comprueba si hay una actualización disponible consultando version.json y el Service Worker.
   */
  public async checkForUpdates(force: boolean = false): Promise<UpdateCheckResult> {
    if (this.isChecking) {
      return this.lastCheckResult || {
        hasUpdate: false,
        currentVersion: CURRENT_APP_VERSION,
        latestVersion: CURRENT_APP_VERSION,
      };
    }

    this.isChecking = true;

    try {
      // 1. Verificar si hay un Service Worker esperando (update pendiente de PWA)
      let swHasUpdate = false;
      if ('serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg) {
            await reg.update();
            if (reg.waiting) {
              swHasUpdate = true;
            }
          }
        } catch (swErr) {
          console.warn('[UpdateService] No se pudo verificar ServiceWorker:', swErr);
        }
      }

      // 2. Determinar la fuente de comprobación (Local / Servidor web o Remoto de GitHub)
      const cacheBuster = `_t=${Date.now()}`;
      const githubRepo = this.getGitHubRepo();
      let remoteData: VersionInfo | null = null;
      let downloadUrl = '';

      // Si hay un repositorio de GitHub configurado, consultamos la versión más reciente en GitHub
      if (githubRepo) {
        try {
          const ghUrl = `https://raw.githubusercontent.com/${githubRepo}/main/public/version.json?${cacheBuster}`;
          const ghRes = await fetch(ghUrl, { cache: 'no-store' });
          if (ghRes.ok) {
            remoteData = await ghRes.json();
            downloadUrl = `https://github.com/${githubRepo}/actions`;
          }
        } catch (ghErr) {
          console.warn('[UpdateService] No se pudo consultar GitHub remoto, probando ruta local:', ghErr);
        }
      }

      // Si no se obtuvo de GitHub, consultamos la ruta local/web /version.json
      if (!remoteData) {
        const response = await fetch(`/version.json?${cacheBuster}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
          },
        });

        if (response.ok) {
          remoteData = await response.json();
        }
      }

      if (!remoteData) {
        throw new Error('No se pudo obtener información de versión del servidor ni de GitHub');
      }

      const versionDiff = this.compareVersions(remoteData.version, CURRENT_APP_VERSION);
      const buildDiff = (remoteData.buildNumber || 0) > CURRENT_BUILD_NUMBER;

      const hasRemoteUpdate = versionDiff > 0 || buildDiff;
      const hasUpdate = hasRemoteUpdate || swHasUpdate;

      const result: UpdateCheckResult = {
        hasUpdate,
        currentVersion: CURRENT_APP_VERSION,
        latestVersion: hasRemoteUpdate ? remoteData.version : (swHasUpdate ? CURRENT_APP_VERSION : CURRENT_APP_VERSION),
        releaseDate: remoteData.releaseDate || CURRENT_RELEASE_DATE,
        changelog: remoteData.changelog || CURRENT_CHANGELOG,
        mandatory: remoteData.mandatory || false,
        isServiceWorkerReady: swHasUpdate,
        downloadUrl: downloadUrl || (githubRepo ? `https://github.com/${githubRepo}/actions` : undefined),
      };

      this.lastCheckResult = result;
      localStorage.setItem('vault_last_update_check', Date.now().toString());

      if (hasUpdate) {
        this.notifyListeners(result);
      }

      return result;
    } catch (err: any) {
      console.warn('[UpdateService] Error al verificar actualizaciones:', err);
      const fallbackResult: UpdateCheckResult = {
        hasUpdate: false,
        currentVersion: CURRENT_APP_VERSION,
        latestVersion: CURRENT_APP_VERSION,
        error: err?.message || 'No se pudo conectar al servidor de actualizaciones',
      };
      this.lastCheckResult = fallbackResult;
      return fallbackResult;
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Aplica la actualización recargando la aplicación y liberando cachés de forma limpia.
   */
  public async applyUpdate(): Promise<void> {
    try {
      sessionStorage.setItem('vault_just_updated', 'true');
      sessionStorage.setItem('vault_updated_version', CURRENT_APP_VERSION);

      // 1. Enviar SKIP_WAITING a los Service Workers en espera
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg?.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      }

      // 2. Limpiar caches del navegador para garantizar assets frescos
      if ('caches' in window) {
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        } catch (cErr) {
          console.warn('[UpdateService] Error al limpiar caches:', cErr);
        }
      }

      // 3. Breve pausa para asegurar propagación y recargar
      setTimeout(() => {
        window.location.reload();
      }, 250);
    } catch (e) {
      console.error('[UpdateService] Error al aplicar actualización:', e);
      window.location.reload();
    }
  }

  /**
   * Suscribirse a avisos de actualización
   */
  public subscribe(listener: UpdateListener): () => void {
    this.listeners.add(listener);
    if (this.lastCheckResult && this.lastCheckResult.hasUpdate) {
      listener(this.lastCheckResult);
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(result: UpdateCheckResult) {
    this.listeners.forEach((listener) => {
      try {
        listener(result);
      } catch (err) {
        console.error('[UpdateService] Error en listener:', err);
      }
    });
  }

  /**
   * Verifica si el usuario activó la comprobación automática al entrar
   */
  public isAutoCheckEnabled(): boolean {
    const saved = localStorage.getItem('vault_auto_check_updates');
    return saved !== null ? saved === 'true' : true;
  }

  public setAutoCheckEnabled(enabled: boolean): void {
    localStorage.setItem('vault_auto_check_updates', enabled ? 'true' : 'false');
  }

  /**
   * Gestión de versión pospuesta / descartada para no molestar continuamente
   */
  public isUpdateDismissed(version: string): boolean {
    const dismissed = localStorage.getItem('vault_dismissed_update_version');
    return dismissed === version;
  }

  public dismissUpdate(version: string): void {
    localStorage.setItem('vault_dismissed_update_version', version);
  }

  public clearDismissedUpdate(): void {
    localStorage.removeItem('vault_dismissed_update_version');
  }

  public getLastCheckTime(): number | null {
    const t = localStorage.getItem('vault_last_update_check');
    return t ? Number(t) : null;
  }

  public getLastCheckResult(): UpdateCheckResult | null {
    return this.lastCheckResult;
  }

  public getGitHubRepo(): string {
    return localStorage.getItem('vault_github_repo') || '';
  }

  public setGitHubRepo(repo: string): void {
    const cleaned = repo.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');
    if (cleaned) {
      localStorage.setItem('vault_github_repo', cleaned);
    } else {
      localStorage.removeItem('vault_github_repo');
    }
  }
}

export const updateService = new UpdateService();
