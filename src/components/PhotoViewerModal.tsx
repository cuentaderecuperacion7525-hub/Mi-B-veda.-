import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  Download,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Heart,
  Copy,
  Info,
  Calendar,
  HardDrive,
  Folder,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  RotateCcw,
  Smartphone,
  Box,
  FileCode,
  PackageCheck,
  Film,
  Image as ImageIcon,
  Music,
} from 'lucide-react';
import { EncryptedVaultItem } from '../db/vaultDb';
import { registerBackHandler } from '../services/backButtonService';
import { exportVaultItemToDevice } from '../services/nativeVaultBridge';

export interface DecryptedVaultItem {
  id: string;
  blobUrl: string;
  record: EncryptedVaultItem;
}

interface VaultItemViewerModalProps {
  currentItem: DecryptedVaultItem | null;
  allItems: DecryptedVaultItem[];
  onClose: () => void;
  onDelete: (id: string) => Promise<void>;
  onToggleFavorite: (id: string, isFav: boolean) => Promise<void>;
  showToast: (msg: string, type?: 'info' | 'success' | 'alert' | 'error') => void;
}

export const PhotoViewerModal: React.FC<VaultItemViewerModalProps> = ({
  currentItem,
  allItems,
  onClose,
  onDelete,
  onToggleFavorite,
  showToast,
}) => {
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [scale, setScale] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const [isImmersive, setIsImmersive] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);

  // Video playback controls
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [videoProgress, setVideoProgress] = useState<number>(0);
  const [videoDuration, setVideoDuration] = useState<number>(0);

  // Back button in immersive mode exits immersive mode first
  useEffect(() => {
    if (isImmersive) {
      return registerBackHandler('viewer_immersive', () => {
        setIsImmersive(false);
        setScale(1);
        return true;
      }, 96);
    }
  }, [isImmersive]);

  useEffect(() => {
    if (!currentItem) {
      onClose();
      return;
    }
    const idx = allItems.findIndex((p) => p.id === currentItem.id);
    if (idx === -1 && allItems.length > 0) {
      onClose();
      return;
    }
    setCurrentIndex(idx);
    setScale(1);
    setRotation(0);
    setIsPlaying(false);
    setVideoProgress(0);
    setIsImmersive(false);
  }, [currentItem, allItems, onClose]);

  const activeItem = currentIndex >= 0 ? allItems[currentIndex] : currentItem;

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setScale(1);
      setRotation(0);
      setIsPlaying(false);
      setIsImmersive(false);
    }
  }, [currentIndex]);

  const handleNext = useCallback(() => {
    if (currentIndex < allItems.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setScale(1);
      setRotation(0);
      setIsPlaying(false);
      setIsImmersive(false);
    }
  }, [currentIndex, allItems.length]);

  // Swipe to change photo or video when not zoomed in
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (scale !== 1 || isImmersive) return;
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
    const deltaY = e.changedTouches[0].clientY - touchStartYRef.current;
    touchStartXRef.current = null;
    touchStartYRef.current = null;

    if (!isImmersive && scale === 1 && Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY) * 1.4) {
      if (deltaX < 0) {
        handleNext();
      } else {
        handlePrev();
      }
    }
  };

  // Al tocar la foto: toma su tamaño real (escala 1, sin zoom artificial) y oculta elementos de arriba y abajo; al tocar de nuevo reaparecen
  const handlePhotoTap = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    // Asegurar escala normal 1 (tamaño real, sin magnificar)
    setScale(1);
    setIsImmersive((prev) => {
      const next = !prev;
      if (next) {
        setShowDetails(false);
      }
      return next;
    });
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showDeleteConfirm) return;
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') handlePrev();
      else if (e.key === 'ArrowRight') handleNext();
      else if (e.key === ' ' && activeItem?.record.category === 'video') {
        e.preventDefault();
        togglePlayVideo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, handlePrev, handleNext, showDeleteConfirm, activeItem]);

  if (!activeItem) return null;

  const isVideo = activeItem.record.category === 'video';
  const isApp = activeItem.record.category === 'app';
  const isPhoto = activeItem.record.category === 'photo';
  const isAudio = activeItem.record.category === 'audio' || activeItem.record.mimeType?.startsWith('audio/');

  const handleExport = async () => {
    if (!activeItem || isExporting) return;
    setIsExporting(true);
    try {
      const res = await exportVaultItemToDevice({
        blobUrl: activeItem.blobUrl,
        filename: activeItem.record.name || `archivo_caja_fuerte_${activeItem.id}`,
        mimeType: activeItem.record.mimeType,
        category: activeItem.record.category,
      });

      if (!res.success) {
        showToast(res.error || 'No se pudo guardar el archivo en el dispositivo', 'error');
        return;
      }

      // El archivo ya se restauró en la galería/almacenamiento del teléfono.
      // Ahora lo retiramos de la bóveda para completar la acción de "sacar".
      await onDelete(activeItem.id);
      showToast(
        isApp
          ? 'Aplicación / Archivo sacado de la caja fuerte a tu dispositivo'
          : isAudio
          ? 'Audio sacado de la caja fuerte a tu dispositivo'
          : isVideo
          ? 'Video sacado de la caja fuerte a tu galería'
          : 'Foto sacada de la caja fuerte a tu galería',
        'success'
      );
      onClose();
    } catch (err: any) {
      console.error('Error al sacar elemento:', err);
      showToast('Error al sacar el elemento de la bóveda', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyToClipboard = async () => {
    try {
      const response = await fetch(activeItem.blobUrl);
      const blob = await response.blob();
      const item = new ClipboardItem({ [blob.type || 'image/png']: blob });
      await navigator.clipboard.write([item]);
      showToast('Imagen copiada al portapapeles', 'success');
    } catch {
      showToast('No se puede copiar directamente al portapapeles este tipo de archivo', 'alert');
    }
  };

  const handleConfirmDelete = async () => {
    if (!activeItem) return;
    setIsDeleting(true);
    try {
      setShowDeleteConfirm(false);
      await onDelete(activeItem.id);
      showToast('Elemento eliminado permanentemente de la bóveda', 'success');
      onClose();
    } catch {
      showToast('Error al eliminar el elemento', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes) return 'Desconocido';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = Math.floor(secs % 60);
    return `${mins}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  const togglePlayVideo = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col justify-between select-none overflow-hidden">
      {/* Top Bar */}
      <header className={`absolute top-0 left-0 right-0 px-4 safe-top-sticky pb-3 bg-gradient-to-b from-black/90 via-black/60 to-transparent flex items-center justify-between text-slate-200 z-30 transition-all duration-300 ease-in-out ${
        isImmersive ? '-translate-y-full opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'
      }`}>
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
            title="Cerrar (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="text-left">
            <div className="flex items-center gap-1.5">
              {isVideo && <Film className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
              {isApp && <Smartphone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
              {isPhoto && <ImageIcon className="w-3.5 h-3.5 text-sky-400 shrink-0" />}
              <h4 className="text-xs sm:text-sm font-semibold text-slate-100 max-w-[200px] sm:max-w-xs truncate">
                {activeItem.record.name}
              </h4>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span>{new Date(activeItem.record.timestamp).toLocaleDateString()}</span>
              <span>·</span>
              <span className="capitalize">{activeItem.record.category}</span>
              <span>·</span>
              <span>
                {currentIndex + 1} de {allItems.length}
              </span>
            </div>
          </div>
        </div>

        {/* Top Controls */}
        <div className="flex items-center gap-1.5">
          {isPhoto && (
            <>
              <button
                onClick={() => {
                  setScale(1);
                  setIsImmersive((prev) => !prev);
                }}
                className={`p-2 rounded-xl transition-colors ${
                  isImmersive ? 'text-[#00e5ff] bg-[#00e5ff]/20 font-bold' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                }`}
                title={isImmersive ? 'Mostrar controles' : 'Ocultar barras y ver tamaño real'}
              >
                {isImmersive ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 transition-colors"
                title="Alejar"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                onClick={() => setScale((s) => Math.min(3, s + 0.25))}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 transition-colors"
                title="Acercar"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 transition-colors"
                title="Rotar 90°"
              >
                <RotateCw className="w-4 h-4" />
              </button>
            </>
          )}

          <button
            onClick={() => setShowDetails(!showDetails)}
            className={`p-2 rounded-xl transition-colors ${
              showDetails ? 'text-indigo-400 bg-indigo-500/20' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
            }`}
            title="Detalles"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content Stage */}
      <div 
        onClick={handlePhotoTap}
        className={`relative flex-1 w-full h-full flex items-center justify-center overflow-hidden cursor-pointer transition-all duration-300 ${
          isImmersive ? 'p-0' : 'p-2 sm:p-6'
        }`}
      >
        {/* Previous Button */}
        {currentIndex > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handlePrev();
            }}
            className={`absolute left-3 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-black/60 hover:bg-black/90 text-white/80 hover:text-white backdrop-blur-md transition-all duration-300 active:scale-95 ${
              isImmersive ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}
            title="Elemento anterior"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* Next Button */}
        {currentIndex < allItems.length - 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
            }}
            className={`absolute right-3 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-black/60 hover:bg-black/90 text-white/80 hover:text-white backdrop-blur-md transition-all duration-300 active:scale-95 ${
              isImmersive ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}
            title="Siguiente elemento"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}

        {/* PHOTO VIEW */}
        {isPhoto && (
          <div className="w-full h-full max-w-full max-h-full flex items-center justify-center transition-all duration-300">
            <img
              src={activeItem.blobUrl}
              alt={activeItem.record.name}
              onClick={handlePhotoTap}
              style={{
                transform: `scale(${scale}) rotate(${rotation}deg)`,
                maxHeight: isImmersive ? '100vh' : 'calc(100vh - 160px)',
                maxWidth: isImmersive ? '100vw' : '100%',
              }}
              className="object-contain rounded-xl shadow-2xl transition-all duration-300 select-none pointer-events-auto cursor-pointer"
              draggable={false}
              title="Toca para tamaño real y ocultar barras (toca de nuevo para mostrar)"
            />
          </div>
        )}

        {/* VIDEO VIEW */}
        {isVideo && (
          <div className="max-w-4xl w-full max-h-full flex flex-col items-center justify-center relative rounded-2xl overflow-hidden bg-black/60 border border-slate-800">
            <video
              ref={videoRef}
              src={activeItem.blobUrl}
              playsInline
              onClick={togglePlayVideo}
              onTimeUpdate={() => {
                if (videoRef.current) {
                  setVideoProgress(videoRef.current.currentTime);
                  setVideoDuration(videoRef.current.duration || 0);
                }
              }}
              onEnded={() => setIsPlaying(false)}
              className="max-h-[calc(100vh-220px)] w-full object-contain cursor-pointer"
            />

            {/* Video Controls Bar */}
            <div className="w-full bg-slate-900/90 backdrop-blur-md p-3 border-t border-slate-800 flex flex-col gap-2">
              {/* Progress bar */}
              <input
                type="range"
                min={0}
                max={videoDuration || 100}
                value={videoProgress}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (videoRef.current) {
                    videoRef.current.currentTime = val;
                    setVideoProgress(val);
                  }
                }}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />

              <div className="flex items-center justify-between text-xs text-slate-300">
                <div className="flex items-center gap-3">
                  <button
                    onClick={togglePlayVideo}
                    className="p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-white" />}
                  </button>
                  <button onClick={toggleMute} className="text-slate-400 hover:text-white transition-colors">
                    {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                  <span className="font-mono text-[11px] text-slate-400">
                    {formatTime(videoProgress)} / {formatTime(videoDuration)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (videoRef.current) {
                        videoRef.current.currentTime = 0;
                        videoRef.current.play();
                        setIsPlaying(true);
                      }
                    }}
                    className="p-1 text-slate-400 hover:text-white"
                    title="Reiniciar video"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      if (videoRef.current?.requestFullscreen) {
                        videoRef.current.requestFullscreen();
                      }
                    }}
                    className="p-1 text-slate-400 hover:text-white"
                    title="Pantalla completa"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* AUDIO VIEW */}
        {isAudio && (
          <div className="w-full max-w-md bg-[#131c2e] border border-amber-500/30 rounded-3xl p-6 sm:p-8 text-center shadow-2xl">
            <div className="w-20 h-20 bg-amber-500/10 border border-amber-500/30 rounded-3xl flex items-center justify-center mx-auto mb-4 text-amber-400 shadow-lg shadow-amber-500/10">
              <Music className="w-10 h-10" />
            </div>

            <h3 className="text-lg font-bold text-white mb-1 break-all">
              {activeItem.record.name}
            </h3>
            <p className="text-xs text-amber-400/80 mb-6">
              Grabación / Audio cifrado en Caja Fuerte
            </p>

            <audio
              src={activeItem.blobUrl}
              controls
              className="w-full mb-6 accent-amber-500 rounded-xl"
            />

            <div className="bg-slate-900/80 rounded-2xl p-4 border border-slate-800 text-left text-xs space-y-2 mb-6">
              <div className="flex justify-between text-slate-400">
                <span>Formato:</span>
                <span className="font-semibold text-slate-200">
                  {activeItem.record.name.split('.').pop()?.toUpperCase() || 'AUDIO'}
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Tamaño:</span>
                <span className="font-semibold text-slate-200">
                  {formatBytes(activeItem.record.size)}
                </span>
              </div>
            </div>

            <button
              onClick={handleExport}
              disabled={isExporting}
              className="w-full py-3.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold rounded-2xl shadow-lg shadow-amber-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download className={`w-5 h-5 ${isExporting ? 'animate-bounce' : ''}`} />
              <span>{isExporting ? 'Sacando a tu dispositivo...' : 'Sacar a mi dispositivo'}</span>
            </button>
          </div>
        )}

        {/* APPLICATION / PACKAGE VIEW */}
        {isApp && (
          <div className="w-full max-w-md bg-[#131c2e] border border-slate-800 rounded-3xl p-6 sm:p-8 text-center shadow-2xl">
            <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/30 rounded-3xl flex items-center justify-center mx-auto mb-4 text-emerald-400 shadow-lg shadow-emerald-500/10">
              {activeItem.record.name.endsWith('.apk') ? (
                <Smartphone className="w-10 h-10" />
              ) : activeItem.record.name.endsWith('.zip') || activeItem.record.name.endsWith('.rar') ? (
                <Box className="w-10 h-10" />
              ) : (
                <FileCode className="w-10 h-10" />
              )}
            </div>

            <h3 className="text-lg font-bold text-white mb-1 break-all">
              {activeItem.record.name}
            </h3>
            <p className="text-xs text-slate-400 mb-6">
              Aplicación / Paquete protegido con AES-GCM 256 bits
            </p>

            <div className="bg-slate-900/80 rounded-2xl p-4 border border-slate-800 text-left text-xs space-y-2 mb-6">
              <div className="flex justify-between text-slate-400">
                <span>Tipo de paquete:</span>
                <span className="font-semibold text-slate-200">
                  {activeItem.record.name.split('.').pop()?.toUpperCase() || 'BINARIO'}
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Tamaño:</span>
                <span className="font-semibold text-slate-200">
                  {formatBytes(activeItem.record.size)}
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Cifrado en reposo:</span>
                <span className="text-emerald-400 font-mono text-[11px]">Activo (Local)</span>
              </div>
            </div>

            <button
              onClick={handleExport}
              disabled={isExporting}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-2xl shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <PackageCheck className={`w-5 h-5 ${isExporting ? 'animate-bounce' : ''}`} />
              <span>{isExporting ? 'Sacando paquete...' : 'Descargar e Instalar / Ejecutar'}</span>
            </button>
            <p className="text-[11px] text-slate-500 mt-2">
              El archivo se descifrará en tu navegador para que puedas guardarlo o abrirlo en tu dispositivo.
            </p>
          </div>
        )}

        {/* Details Flyout */}
        {showDetails && !isImmersive && (
          <div className="absolute right-4 top-16 z-40 w-72 bg-slate-900/95 border border-slate-800 rounded-2xl p-4 shadow-2xl backdrop-blur-md text-xs space-y-3">
            <h5 className="font-semibold text-slate-200 border-b border-slate-800 pb-2">Información del archivo</h5>
            <div className="flex items-center gap-2 text-slate-400">
              <Calendar className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>{new Date(activeItem.record.timestamp).toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <HardDrive className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>Tamaño cifrado: {formatBytes(activeItem.record.size)}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <Folder className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>Álbum: {activeItem.record.album || 'General'}</span>
            </div>
            <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-800/80">
              Cifrado: AES-GCM 256 bits · Almacenado localmente en IndexedDB.
            </div>
          </div>
        )}
      </div>

      {/* Bottom Actions Bar - Horizontally Scrollable & Exact Pill Style */}
      <footer className={`absolute bottom-0 left-0 right-0 px-3 sm:px-4 py-3 bg-gradient-to-t from-black via-black/90 to-transparent w-full z-30 transition-all duration-300 ease-in-out ${
        isImmersive ? 'translate-y-full opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'
      }`}>
        <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar py-1 px-1 justify-start sm:justify-center max-w-lg mx-auto touch-pan-x">
          <button
            onClick={() => onToggleFavorite(activeItem.id, !activeItem.record.isFavorite)}
            className={`flex items-center gap-2.5 px-5 py-2.5 rounded-full text-sm font-medium shrink-0 transition-colors active:scale-95 ${
              activeItem.record.isFavorite
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                : 'bg-[#0f172a] text-slate-100 border border-slate-800 hover:bg-slate-800'
            }`}
            title="Favorito"
          >
            <Heart className={`w-4 h-4 ${activeItem.record.isFavorite ? 'fill-rose-500 text-rose-500' : 'text-slate-100'}`} />
            <span>Favorito</span>
          </button>

          {isPhoto && (
            <button
              onClick={handleCopyToClipboard}
              className="flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-[#0f172a] border border-slate-800 text-slate-100 hover:bg-slate-800 text-sm font-medium shrink-0 transition-colors active:scale-95"
              title="Copiar imagen"
            >
              <Copy className="w-4 h-4 text-slate-100" />
              <span>Copiar</span>
            </button>
          )}

          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-[#00e5ff] hover:bg-[#00cce6] disabled:opacity-50 text-black text-sm font-bold shrink-0 shadow-lg shadow-cyan-500/30 transition-colors active:scale-95 cursor-pointer"
            title="Sacar archivo fuera de la caja fuerte a tu galería"
          >
            <Download className={`w-4 h-4 text-black stroke-[2.5] ${isExporting ? 'animate-bounce' : ''}`} />
            <span>{isExporting ? 'Sacando...' : 'Sacar'}</span>
          </button>

          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-[#270e17] border border-rose-900/60 hover:bg-[#34131f] text-rose-400 text-sm font-medium shrink-0 transition-colors active:scale-95"
            title="Eliminar permanentemente"
          >
            <Trash2 className="w-4 h-4 text-rose-400" />
            <span>Eliminar</span>
          </button>
        </div>
      </footer>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xs bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-center">
            <div className="w-12 h-12 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3 text-rose-400">
              <Trash2 className="w-6 h-6" />
            </div>
            <h4 className="text-base font-bold text-white mb-1.5">¿Eliminar este elemento privado?</h4>
            <p className="text-xs text-slate-400 mb-5">
              Esta acción es irreversible y eliminará el registro cifrado de tu bóveda de forma permanente.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-rose-600/30 transition-colors"
              >
                {isDeleting ? 'Borrando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
