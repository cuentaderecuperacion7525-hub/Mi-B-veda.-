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
  Check,
} from 'lucide-react';
import { EncryptedVaultItem } from '../db/vaultDb';
import { registerBackHandler } from '../services/backButtonService';
import { exportVaultItemToDevice } from '../services/nativeVaultBridge';
import { BarraAccionesInferior } from './BarraAccionesInferior';
import { ModalEliminar } from './ModalEliminar';

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
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isInteracting, setIsInteracting] = useState<boolean>(false);
  const [rotation, setRotation] = useState<number>(0);
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const [isImmersive, setIsImmersive] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [exportStage, setExportStage] = useState<string>('');
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
        setPosition({ x: 0, y: 0 });
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
    setPosition({ x: 0, y: 0 });
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
      setPosition({ x: 0, y: 0 });
      setRotation(0);
      setIsPlaying(false);
      setIsImmersive(false);
    }
  }, [currentIndex]);

  const handleNext = useCallback(() => {
    if (currentIndex < allItems.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setScale(1);
      setPosition({ x: 0, y: 0 });
      setRotation(0);
      setIsPlaying(false);
      setIsImmersive(false);
    }
  }, [currentIndex, allItems.length]);

  // Gestos táctiles: Pellizco (Pinch-to-zoom) y arrastre acotado a los bordes de la imagen
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const isPinchingRef = useRef<boolean>(false);
  const pinchStartDistRef = useRef<number>(0);
  const pinchStartScaleRef = useRef<number>(1);
  const pinchStartCenterRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pinchStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const panStartRef = useRef<{ x: number; y: number } | null>(null);
  const posStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const hasMovedRef = useRef<boolean>(false);

  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const positionRef = useRef(position);
  positionRef.current = position;

  // Calcula los límites máximos permitidos en X e Y para que los bordes de la imagen nunca dejen ver pantalla negra vacía
  const getBounds = useCallback((curScale: number) => {
    const container = containerRef.current;
    const img = imageRef.current;
    if (!container || !img) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const maxX = Math.max(0, (vw * curScale - vw) / 2);
      const maxY = Math.max(0, (vh * curScale - vh) / 2);
      return { maxX, maxY };
    }

    const vw = container.clientWidth;
    const vh = container.clientHeight;

    // Dimensiones de la imagen renderizada sin escalar
    const w0 = img.clientWidth || img.offsetWidth || img.naturalWidth || vw;
    const h0 = img.clientHeight || img.offsetHeight || img.naturalHeight || vh;

    const isRotated90 = Math.abs(rotation % 180) !== 0;
    const baseW = isRotated90 ? h0 : w0;
    const baseH = isRotated90 ? w0 : h0;

    const displayW = baseW * curScale;
    const displayH = baseH * curScale;

    // El desplazamiento máximo en X e Y para mantener la imagen llenando la vista sin mostrar vacío negro
    const maxX = Math.max(0, (displayW - vw) / 2);
    const maxY = Math.max(0, (displayH - vh) / 2);

    return { maxX, maxY };
  }, [rotation]);

  // Resistencia elástica ligera al arrastrar mientras el dedo está en pantalla
  const clampWithDamping = (val: number, max: number) => {
    if (max <= 0) {
      return val * 0.15;
    }
    if (val > max) {
      return max + (val - max) * 0.2;
    }
    if (val < -max) {
      return -max + (val + max) * 0.2;
    }
    return val;
  };

  // Ajuste estricto dentro de los bordes de la imagen al soltar el dedo
  const clampPosition = useCallback((pos: { x: number; y: number }, curScale: number) => {
    if (curScale <= 1.05) {
      return { x: 0, y: 0 };
    }
    const { maxX, maxY } = getBounds(curScale);
    return {
      x: maxX > 0 ? Math.min(Math.max(pos.x, -maxX), maxX) : 0,
      y: maxY > 0 ? Math.min(Math.max(pos.y, -maxY), maxY) : 0,
    };
  }, [getBounds]);

  // Deslizamiento lateral a 1x para cambiar de elemento
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  // Soporte de ratón para escritorio
  const isDraggingMouseRef = useRef<boolean>(false);
  const mouseStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    hasMovedRef.current = false;

    // Pellizco con 2 dedos (Zoom simultáneo y arrastre con pellizco)
    if (e.touches.length === 2) {
      isPinchingRef.current = true;
      setIsInteracting(true);
      hasMovedRef.current = true;
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      pinchStartDistRef.current = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      pinchStartScaleRef.current = scaleRef.current;
      pinchStartCenterRef.current = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2,
      };
      pinchStartPosRef.current = { ...positionRef.current };
      panStartRef.current = null;
      touchStartXRef.current = null;
      touchStartYRef.current = null;
      return;
    }

    // 1 dedo: Si tiene zoom (> 1.05), arrastra dentro de los límites de la imagen
    if (e.touches.length === 1) {
      isPinchingRef.current = false;
      const t = e.touches[0];

      if (scaleRef.current > 1.05) {
        setIsInteracting(true);
        panStartRef.current = { x: t.clientX, y: t.clientY };
        posStartRef.current = { ...positionRef.current };
        touchStartXRef.current = null;
        touchStartYRef.current = null;
      } else {
        panStartRef.current = null;
        touchStartXRef.current = t.clientX;
        touchStartYRef.current = t.clientY;
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    // Zoom y desplazamiento simultáneo mediante pellizco con 2 dedos
    if (e.touches.length === 2 && isPinchingRef.current) {
      hasMovedRef.current = true;
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);

      if (pinchStartDistRef.current > 0) {
        const factor = dist / pinchStartDistRef.current;
        const targetScale = Math.min(Math.max(pinchStartScaleRef.current * factor, 0.75), 8);
        setScale(targetScale);

        // Mueve la imagen siguiendo el desplazamiento del centro de ambos dedos
        const curCenter = {
          x: (t1.clientX + t2.clientX) / 2,
          y: (t1.clientY + t2.clientY) / 2,
        };
        const dx = curCenter.x - pinchStartCenterRef.current.x;
        const dy = curCenter.y - pinchStartCenterRef.current.y;
        const rawX = pinchStartPosRef.current.x + dx;
        const rawY = pinchStartPosRef.current.y + dy;

        const { maxX, maxY } = getBounds(targetScale);
        setPosition({
          x: clampWithDamping(rawX, maxX),
          y: clampWithDamping(rawY, maxY),
        });
      }
      return;
    }

    // Arrastre con 1 dedo acotado a los límites reales de la foto
    if (e.touches.length === 1 && scaleRef.current > 1.05 && panStartRef.current) {
      const t = e.touches[0];
      const dx = t.clientX - panStartRef.current.x;
      const dy = t.clientY - panStartRef.current.y;

      if (Math.hypot(dx, dy) > 3) {
        hasMovedRef.current = true;
      }

      const { maxX, maxY } = getBounds(scaleRef.current);
      const rawX = posStartRef.current.x + dx;
      const rawY = posStartRef.current.y + dy;

      setPosition({
        x: clampWithDamping(rawX, maxX),
        y: clampWithDamping(rawY, maxY),
      });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    setIsInteracting(false);

    // Si estaba pellizcando y ahora queda 1 dedo en pantalla con zoom, transicionar a arrastre sin saltos
    if (isPinchingRef.current) {
      if (e.touches && e.touches.length === 1 && scaleRef.current > 1.05) {
        isPinchingRef.current = false;
        const t = e.touches[0];
        panStartRef.current = { x: t.clientX, y: t.clientY };
        posStartRef.current = { ...positionRef.current };
        return;
      }
      isPinchingRef.current = false;
      if (scaleRef.current <= 1.05) {
        setScale(1);
        setPosition({ x: 0, y: 0 });
      } else {
        setPosition(clampPosition(positionRef.current, scaleRef.current));
      }
      return;
    }

    if (panStartRef.current) {
      panStartRef.current = null;
      if (scaleRef.current <= 1.05) {
        setScale(1);
        setPosition({ x: 0, y: 0 });
      } else {
        setPosition(clampPosition(positionRef.current, scaleRef.current));
      }
      return;
    }

    // Deslizar para cambiar de foto (solo cuando no hay zoom)
    if (touchStartXRef.current !== null && touchStartYRef.current !== null && e.changedTouches && e.changedTouches.length > 0) {
      const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
      const deltaY = e.changedTouches[0].clientY - touchStartYRef.current;
      touchStartXRef.current = null;
      touchStartYRef.current = null;

      if (!isImmersive && scaleRef.current <= 1.05 && Math.abs(deltaX) > 65 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3) {
        hasMovedRef.current = true;
        if (deltaX < 0) {
          handleNext();
        } else {
          handlePrev();
        }
      }
    }
  };

  // Zoom con rueda de ratón (escritorio)
  const handleWheel = (e: React.WheelEvent) => {
    if (!activeItem || activeItem.record.category !== 'photo') return;
    e.preventDefault();
    const delta = e.deltaY * -0.002;
    setScale((prev) => {
      const next = Math.min(Math.max(prev + delta, 1), 6);
      if (next <= 1.02) {
        setPosition({ x: 0, y: 0 });
        return 1;
      }
      setPosition((curPos) => clampPosition(curPos, next));
      return next;
    });
  };

  // Arrastre con ratón en escritorio con zoom
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1.05) {
      isDraggingMouseRef.current = true;
      setIsInteracting(true);
      mouseStartRef.current = { x: e.clientX, y: e.clientY };
      posStartRef.current = { ...position };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDraggingMouseRef.current && mouseStartRef.current && scaleRef.current > 1.05) {
      hasMovedRef.current = true;
      const dx = e.clientX - mouseStartRef.current.x;
      const dy = e.clientY - mouseStartRef.current.y;
      const { maxX, maxY } = getBounds(scaleRef.current);
      const rawX = posStartRef.current.x + dx;
      const rawY = posStartRef.current.y + dy;
      setPosition({
        x: clampWithDamping(rawX, maxX),
        y: clampWithDamping(rawY, maxY),
      });
    }
  };

  const handleMouseUp = () => {
    if (isDraggingMouseRef.current) {
      isDraggingMouseRef.current = false;
      setIsInteracting(false);
      mouseStartRef.current = null;
      setPosition(clampPosition(positionRef.current, scaleRef.current));
    }
  };

  // Doble toque: alterna entre 1x y 2.5x
  // Toque simple: alterna modo inmersivo
  const singleTapTimeoutRef = useRef<any>(null);
  const lastTapRef = useRef<number>(0);

  const handlePhotoTap = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    if (hasMovedRef.current) {
      hasMovedRef.current = false;
      return;
    }

    const ahora = Date.now();
    const DOUBLE_TAP_DELAY = 300;

    if (ahora - lastTapRef.current < DOUBLE_TAP_DELAY) {
      if (singleTapTimeoutRef.current) {
        clearTimeout(singleTapTimeoutRef.current);
        singleTapTimeoutRef.current = null;
      }
      // Alterna instantáneamente el zoom
      if (scale > 1.05) {
        setScale(1);
        setPosition({ x: 0, y: 0 });
      } else {
        setScale(2.5);
        setPosition({ x: 0, y: 0 });
      }
    } else {
      if (singleTapTimeoutRef.current) {
        clearTimeout(singleTapTimeoutRef.current);
      }
      singleTapTimeoutRef.current = setTimeout(() => {
        setIsImmersive((prev) => {
          const next = !prev;
          if (next) {
            setShowDetails(false);
          }
          return next;
        });
        singleTapTimeoutRef.current = null;
      }, DOUBLE_TAP_DELAY);
    }
    lastTapRef.current = ahora;
  };

  useEffect(() => {
    return () => {
      if (singleTapTimeoutRef.current) {
        clearTimeout(singleTapTimeoutRef.current);
      }
    };
  }, []);

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
    setExportProgress(15);
    setExportStage('Preparando archivo...');
    try {
      await new Promise((r) => setTimeout(r, 120));
      setExportProgress(45);
      setExportStage('Guardando en la galería de tu dispositivo...');

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

      setExportProgress(85);
      setExportStage('Retirando de la bóveda privada...');
      await onDelete(activeItem.id);

      setExportProgress(100);
      setExportStage('¡Listo! Guardado en tu galería');
      await new Promise((r) => setTimeout(r, 400));

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
      setExportProgress(0);
      setExportStage('');
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
      showToast('Elemento movido a la Papelera de Reciclaje (30 días)', 'info');
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
      {/* Botón flotante limpio para cerrar imágenes (sin encabezado invasivo) */}
      {isPhoto && (
        <button
          onClick={onClose}
          className={`absolute top-3 left-3 sm:top-5 sm:left-5 z-40 p-2.5 sm:p-3 rounded-full bg-black/60 hover:bg-black/90 text-white/90 hover:text-white backdrop-blur-md transition-all duration-300 active:scale-95 border border-white/10 shadow-2xl ${
            isImmersive ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
          title="Cerrar (Esc)"
        >
          <X className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>
      )}

      {/* Top Bar solo para videos, audios y documentos */}
      {!isPhoto && (
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
      )}

      {/* Main Content Stage */}
      <div 
        ref={containerRef}
        onClick={handlePhotoTap}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ touchAction: scale > 1.05 ? 'none' : 'pan-y' }}
        className={`relative flex-1 w-full h-full flex items-center justify-center overflow-hidden cursor-pointer select-none ${
          isImmersive ? 'p-0' : 'p-2 sm:p-6'
        }`}
      >
        {/* Floating Zoom Indicator & Reset when zoomed in */}
        {scale > 1.05 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setScale(1);
              setPosition({ x: 0, y: 0 });
            }}
            className="absolute top-20 right-4 z-30 px-3 py-1 rounded-full bg-black/75 backdrop-blur-md border border-white/20 text-xs font-mono text-zinc-200 hover:text-white transition-all shadow-xl active:scale-95 flex items-center gap-1.5 cursor-pointer"
            title="Toca para volver a tamaño normal (1x)"
          >
            <span>{scale.toFixed(1)}x</span>
            <span className="text-[10px] text-zinc-400">· 1x</span>
          </button>
        )}

        {/* Previous Button */}
        {currentIndex > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handlePrev();
            }}
            className={`absolute left-3 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-black/60 hover:bg-black/90 text-white/80 hover:text-white backdrop-blur-md transition-all duration-300 active:scale-95 ${
              isImmersive || scale > 1.05 ? 'opacity-0 pointer-events-none' : 'opacity-100'
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
              isImmersive || scale > 1.05 ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}
            title="Siguiente elemento"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}

        {/* PHOTO VIEW */}
        {isPhoto && (
          <div className="w-full h-full max-w-full max-h-full flex items-center justify-center">
            <img
              ref={imageRef}
              src={activeItem.blobUrl}
              alt={activeItem.record.name}
              onClick={handlePhotoTap}
              style={{
                transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale}) rotate(${rotation}deg)`,
                transition: isInteracting ? 'none' : 'transform 0.25s cubic-bezier(0.2, 0, 0, 1)',
                maxHeight: isImmersive ? '100vh' : 'calc(100vh - 160px)',
                maxWidth: isImmersive ? '100vw' : '100%',
                imageRendering: 'auto',
                touchAction: 'none',
                willChange: 'transform',
              }}
              className="object-contain rounded-xl shadow-2xl select-none pointer-events-auto cursor-grab active:cursor-grabbing"
              draggable={false}
              title="Pellizca con 2 dedos para zoom y arrastra por la pantalla"
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
              controlsList="nodownload"
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
              controlsList="nodownload"
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

      {/* Barra de Acciones Inferior - Íconos limpios con trazo fino outline perfectamente distribuidos */}
      <BarraAccionesInferior
        esFavorito={!!activeItem.record.isFavorite}
        onAlternarFavorito={() => onToggleFavorite(activeItem.id, !activeItem.record.isFavorite)}
        onCopiar={handleCopyToClipboard}
        onSacarDeBoveda={handleExport}
        onEliminar={() => setShowDeleteConfirm(true)}
        mostrarCopiar={isPhoto}
        estaSacando={isExporting}
        esInmersivo={isImmersive}
      />

      {/* Modal de Confirmación de Eliminación */}
      <ModalEliminar
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirmar={handleConfirmDelete}
        isDeleting={isDeleting}
      />

      {/* Export Progress Modal */}
      {isExporting && (
        <div className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 select-none">
          <div className="w-full max-w-xs bg-[#131c2e] border border-cyan-500/30 rounded-3xl p-6 shadow-2xl text-center space-y-4 animate-in fade-in zoom-in-95">
            <div className="w-14 h-14 bg-cyan-500/10 border border-cyan-500/30 rounded-2xl flex items-center justify-center mx-auto text-[#00e5ff] relative">
              {exportProgress === 100 ? (
                <Check className="w-7 h-7 text-emerald-400 animate-in zoom-in-75 duration-200" />
              ) : (
                <Download className="w-7 h-7 animate-bounce text-[#00e5ff]" />
              )}
            </div>

            <div>
              <h4 className="text-base font-bold text-white mb-1">
                {exportProgress === 100 ? '¡Foto sacada con éxito!' : 'Sacando a tu galería...'}
              </h4>
              <p className="text-xs text-slate-400">
                {exportStage || 'Guardando archivo en tu dispositivo'}
              </p>
            </div>

            {/* Barra de progreso */}
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between text-xs font-semibold px-1">
                <span className="text-slate-400">Progreso</span>
                <span className="text-[#00e5ff] font-mono font-bold">{exportProgress}%</span>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-3 overflow-hidden border border-slate-700/60 p-0.5">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 via-[#00e5ff] to-emerald-400 rounded-full transition-all duration-300 ease-out shadow-[0_0_12px_rgba(0,229,255,0.7)]"
                  style={{ width: `${Math.min(100, Math.max(exportProgress, 5))}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
