import React, { useState } from 'react';
import { 
  Sparkles, 
  RefreshCw, 
  ArrowUpCircle, 
  CheckCircle2, 
  X, 
  ChevronRight, 
  ShieldCheck, 
  Calendar,
  Layers
} from 'lucide-react';
import { updateService, UpdateCheckResult } from '../services/updateService';
import { CURRENT_APP_VERSION, CURRENT_RELEASE_DATE, CURRENT_CHANGELOG } from '../version';

interface UpdateNotificationModalProps {
  // Cuando se detecta una nueva actualización
  updateInfo: UpdateCheckResult | null;
  isOpen: boolean;
  onClose: () => void;
  // Si se abre solo para consultar las novedades de la versión actual
  viewNotesOnly?: boolean;
}

export const UpdateNotificationModal: React.FC<UpdateNotificationModalProps> = ({
  updateInfo,
  isOpen,
  onClose,
  viewNotesOnly = false,
}) => {
  const [isApplying, setIsApplying] = useState(false);
  const [showFullChangelog, setShowFullChangelog] = useState(!viewNotesOnly);

  if (!isOpen) return null;

  const targetVersion = viewNotesOnly 
    ? CURRENT_APP_VERSION 
    : (updateInfo?.latestVersion || CURRENT_APP_VERSION);

  const releaseDate = viewNotesOnly 
    ? CURRENT_RELEASE_DATE 
    : (updateInfo?.releaseDate || CURRENT_RELEASE_DATE);

  const changelog = (viewNotesOnly ? CURRENT_CHANGELOG : updateInfo?.changelog) || CURRENT_CHANGELOG;

  const handleApplyUpdate = async () => {
    setIsApplying(true);
    try {
      if (updateInfo?.downloadUrl) {
        window.open(updateInfo.downloadUrl, '_blank');
        setIsApplying(false);
        onClose();
        return;
      }
      await updateService.applyUpdate();
    } catch {
      window.location.reload();
    }
  };

  const handleDismiss = () => {
    if (!viewNotesOnly && updateInfo?.latestVersion) {
      updateService.dismissUpdate(updateInfo.latestVersion);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[10000] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div 
        className="w-full max-w-md bg-[#0a121d] border border-cyan-500/40 rounded-3xl p-5 sm:p-6 shadow-[0_0_50px_rgba(0,229,255,0.18)] relative flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
      >
        {/* Botón cerrar */}
        <button
          type="button"
          onClick={handleDismiss}
          disabled={isApplying}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-900 border border-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          title="Cerrar"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Encabezado del aviso */}
        <div className="flex items-center gap-3.5 mb-4 pr-8">
          <div className="w-12 h-12 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 text-[#00e5ff] flex items-center justify-center shrink-0 shadow-lg shadow-cyan-500/10">
            {viewNotesOnly ? (
              <ShieldCheck className="w-6 h-6 stroke-[2]" />
            ) : (
              <Sparkles className="w-6 h-6 stroke-[2] animate-pulse" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/20 text-[#00e5ff] border border-cyan-500/30">
                {viewNotesOnly ? 'Versión Instalada' : 'Nueva Actualización'}
              </span>
              <span className="font-mono text-xs font-bold text-white">
                v{targetVersion}
              </span>
            </div>
            <h3 className="text-base font-bold text-white mt-1">
              {viewNotesOnly 
                ? 'Novedades y Mejoras' 
                : '¡Nueva Versión Lista!'}
            </h3>
          </div>
        </div>

        {/* Resumen o mensaje */}
        <p className="text-xs text-slate-300 leading-relaxed mb-4">
          {viewNotesOnly
            ? 'Tu bóveda cuenta con las optimizaciones más recientes para navegación, seguridad y visualización multimedia.'
            : 'Se han implementado mejoras importantes en el desplazamiento, zoom táctil y rendimiento general. Tus fotos y configuraciones permanecen 100% protegidas e intactas.'}
        </p>

        {/* Lista de cambios (Changelog) con scroll */}
        <div className="flex-1 overflow-y-auto space-y-2.5 bg-slate-900/80 border border-slate-800/90 rounded-2xl p-3.5 mb-5 max-h-[42vh] custom-scrollbar">
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium pb-2 border-b border-slate-800">
            <span className="flex items-center gap-1.5 text-slate-300 font-semibold">
              <Layers className="w-3.5 h-3.5 text-[#00e5ff]" />
              Cambios incluidos:
            </span>
            <span className="flex items-center gap-1 text-[10px] text-slate-500">
              <Calendar className="w-3 h-3" />
              {releaseDate}
            </span>
          </div>

          <ul className="space-y-2.5 pt-1">
            {changelog.map((item, index) => (
              <li key={index} className="flex items-start gap-2.5 text-xs text-slate-200 leading-snug">
                <div className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5 border border-emerald-500/30">
                  <CheckCircle2 className="w-3 h-3 stroke-[2.5]" />
                </div>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Botones de acción */}
        <div className="flex items-center gap-2.5 pt-1">
          {viewNotesOnly ? (
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors flex items-center justify-center gap-2"
            >
              <span>Entendido</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleDismiss}
                disabled={isApplying}
                className="flex-1 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-semibold text-xs transition-colors"
              >
                Más tarde
              </button>
              <button
                type="button"
                onClick={handleApplyUpdate}
                disabled={isApplying}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs transition-all shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                {isApplying ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                    <span>Actualizando...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 text-white" />
                    <span>Actualizar Ahora</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>

        <p className="text-[10px] text-slate-500 text-center mt-3">
          {viewNotesOnly
            ? 'Cifrado permanente AES-GCM 256 bits activo.'
            : 'La actualización se aplica al instante sin cerrar tu sesión.'}
        </p>
      </div>
    </div>
  );
};

/**
 * Banner superior discreto que aparece al abrir la app si hay actualización lista
 */
interface UpdateBannerProps {
  updateInfo: UpdateCheckResult;
  onOpenDetails: () => void;
  onApplyUpdate: () => void;
  onDismiss: () => void;
}

export const UpdateNotificationBanner: React.FC<UpdateBannerProps> = ({
  updateInfo,
  onOpenDetails,
  onApplyUpdate,
  onDismiss,
}) => {
  const [isApplying, setIsApplying] = useState(false);

  const handleUpdate = async () => {
    setIsApplying(true);
    try {
      if (updateInfo.downloadUrl) {
        window.open(updateInfo.downloadUrl, '_blank');
        setIsApplying(false);
        onDismiss();
        return;
      }
      await updateService.applyUpdate();
    } catch {
      window.location.reload();
    }
  };

  return (
    <aside 
      aria-label="Aviso de actualización disponible"
      className="fixed top-3 inset-x-3 sm:inset-x-auto sm:right-4 sm:max-w-md z-[9999] bg-[#0a121d]/95 backdrop-blur-xl border border-cyan-500/50 rounded-2xl p-3 shadow-2xl shadow-cyan-500/20 animate-in slide-in-from-top-4 duration-300 flex items-center justify-between gap-3 text-white"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-[#00e5ff] flex items-center justify-center shrink-0 shadow-sm animate-pulse">
          <Sparkles className="w-4.5 h-4.5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#00e5ff]">
              Actualización lista
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              v{updateInfo.latestVersion}
            </span>
          </div>
          <p className="text-xs font-semibold text-slate-200 truncate mt-0.5">
            Nuevas mejoras de navegación y zoom
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={handleUpdate}
          disabled={isApplying}
          className="px-3 py-1.5 rounded-xl bg-[#00e5ff] hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/30 flex items-center gap-1.5 transition-all active:scale-95"
        >
          {isApplying ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          <span>Actualizar</span>
        </button>

        <button
          type="button"
          onClick={onOpenDetails}
          className="p-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors"
          title="Ver novedades"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onDismiss}
          className="p-1.5 rounded-xl text-slate-500 hover:text-slate-300 transition-colors"
          title="Posponer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
};
