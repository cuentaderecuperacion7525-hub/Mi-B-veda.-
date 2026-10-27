import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  Download,
  Trash2,
  RotateCcw,
  Copy,
  Info,
  Calendar,
  HardDrive,
  Folder,
  FolderPlus,
  ArrowRight,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Smartphone,
  Box,
  FileCode,
  PackageCheck,
  Film,
  Music,
  Check,
  Edit2,
} from 'lucide-react';
import { EncryptedVaultItem } from '../db/vaultDb';
import { registerBackHandler } from '../services/backButtonService';
import { exportVaultItemToDevice } from '../services/nativeVaultBridge';
import { BarraAccionesInferior } from './BarraAccionesInferior';
import { ModalEliminar } from './ModalEliminar';
import { formatSize as formatBytes } from '../utils/formatUtils';

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
  onRenameItem?: (id: string, newName: string) => Promise<void>;
  onMoveItem?: (id: string, targetFolder: string) => Promise<void>;
  onCopyItemToFolder?: (id: string, targetFolder: string) => Promise<void>;
  onUpdateItemBlob?: (id: string, newBlob: Blob) => Promise<string | void>;
  availableFolders?: string[];
  onCreateFolder?: (folderName: string) => void;
  showToast: (msg: string, type?: 'info' | 'success' | 'alert' | 'error') => void;
}

export const PhotoViewerModal: React.FC<VaultItemViewerModalProps> = ({
  currentItem,
  allItems,
  onClose,
  onDelete,
  onToggleFavorite,
  onRenameItem,
  onMoveItem,
  onCopyItemToFolder,
  onUpdateItemBlob,
  availableFolders = ['General'],
  onCreateFolder,
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

  // Nuevos estados para el menú "Más (⋮)" y modales funcionales
  const [showMoreMenu, setShowMoreMenu] = useState<boolean>(false);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState<boolean>(false);
  const [renameValue, setRenameValue] = useState<string>('');
  const [renameError, setRenameError] = useState<string>('');
  const [isMoveModalOpen, setIsMoveModalOpen] = useState<boolean>(false);
  const [isCopyModalOpen, setIsCopyModalOpen] = useState<boolean>(false);
  const [newFolderInputOpen, setNewFolderInputOpen] = useState<boolean>(false);
  const [newFolderName, setNewFolderName] = useState<string>('');
  const [isRotatingSave, setIsRotatingSave] = useState<boolean>(false);

  // Video playback controls
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [videoProgress, setVideoProgress] = useState<number>(0);
  const [videoDuration, setVideoDuration] = useState<number>(0);

  // Back button handlers for sub-modals and menus inside the viewer

  useEffect(() => {
    if (isRenameModalOpen || isMoveModalOpen || isCopyModalOpen) {
      return registerBackHandler('viewer_submodal', () => {
        setIsRenameModalOpen(false);
        setIsMoveModalOpen(false);
        setIsCopyModalOpen(false);
        setNewFolderInputOpen(false);
        return true;
      }, 98);
    }
  }, [isRenameModalOpen, isMoveModalOpen, isCopyModalOpen]);

  useEffect(() => {
    if (showMoreMenu) {
      return registerBackHandler('viewer_more_menu', () => {
        setShowMoreMenu(false);
        return true;
      }, 97);
    }
  }, [showMoreMenu]);

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

  const activeItemIdRef = useRef<string | null>(null);
  const prevInitialItemIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!currentItem) {
      onClose();
      return;
    }

    const isNewOpen = prevInitialItemIdRef.current !== currentItem.id;
    prevInitialItemIdRef.current = currentItem.id;

    if (isNewOpen) {
      const idx = allItems.findIndex((p) => p.id === currentItem.id);
      if (idx === -1 && allItems.length > 0) {
        onClose();
        return;
      }
      activeItemIdRef.current = currentItem.id;
      setCurrentIndex(idx);
      setScale(1);
      setPosition({ x: 0, y: 0 });
      setRotation(0);
      setIsPlaying(false);
      setVideoProgress(0);
      setIsImmersive(false);
      setShowMoreMenu(false);
      return;
    }

    // Si cambió la lista (p. ej. al mover, copiar o eliminar mientras se navega en el visor)
    if (allItems.length === 0) {
      onClose();
      return;
    }

    const trackedId = activeItemIdRef.current || currentItem.id;
    const existingIdx = allItems.findIndex((p) => p.id === trackedId);
    if (existingIdx !== -1) {
      setCurrentIndex(existingIdx);
    } else {
      // El elemento actual salió de la carpeta actual (ej. se movió a otra carpeta): avanzar al contiguo
      const clampedIdx = Math.min(Math.max(0, currentIndex), allItems.length - 1);
      setCurrentIndex(clampedIdx);
      activeItemIdRef.current = allItems[clampedIdx]?.id || null;
      setScale(1);
      setPosition({ x: 0, y: 0 });
      setRotation(0);
      setIsPlaying(false);
      setShowMoreMenu(false);
    }
  }, [currentItem?.id, allItems.length]);

  const activeItem = currentIndex >= 0 && allItems[currentIndex] ? allItems[currentIndex] : currentItem;
  if (activeItem) {
    activeItemIdRef.current = activeItem.id;
  }

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      const nextIdx = currentIndex - 1;
      activeItemIdRef.current = allItems[nextIdx]?.id || null;
      setCurrentIndex(nextIdx);
      setScale(1);
      setPosition({ x: 0, y: 0 });
      setRotation(0);
      setIsPlaying(false);
      setIsImmersive(false);
      setShowMoreMenu(false);
    }
  }, [currentIndex, allItems]);

  const handleNext = useCallback(() => {
    if (currentIndex < allItems.length - 1) {
      const nextIdx = currentIndex + 1;
      activeItemIdRef.current = allItems[nextIdx]?.id || null;
      setCurrentIndex(nextIdx);
      setScale(1);
      setPosition({ x: 0, y: 0 });
      setRotation(0);
      setIsPlaying(false);
      setIsImmersive(false);
      setShowMoreMenu(false);
    }
  }, [currentIndex, allItems]);

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

    const w0 = img.clientWidth || img.offsetWidth || img.naturalWidth || vw;
    const h0 = img.clientHeight || img.offsetHeight || img.naturalHeight || vh;

    const isRotated90 = Math.abs(rotation % 180) !== 0;
    const baseW = isRotated90 ? h0 : w0;
    const baseH = isRotated90 ? w0 : h0;

    const displayW = baseW * curScale;
    const displayH = baseH * curScale;

    const maxX = Math.max(0, (displayW - vw) / 2);
    const maxY = Math.max(0, (displayH - vh) / 2);

    return { maxX, maxY };
  }, [rotation]);

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

  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  const isDraggingMouseRef = useRef<boolean>(false);
  const mouseStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (showMoreMenu) {
      setShowMoreMenu(false);
    }
    hasMovedRef.current = false;

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
    if (e.touches.length === 2 && isPinchingRef.current) {
      hasMovedRef.current = true;
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);

      if (pinchStartDistRef.current > 0) {
        const factor = dist / pinchStartDistRef.current;
        const targetScale = Math.min(Math.max(pinchStartScaleRef.current * factor, 0.75), 8);
        setScale(targetScale);

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

    if (touchStartXRef.current !== null && touchStartYRef.current !== null && e.changedTouches && e.changedTouches.length > 0) {
      const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
      const deltaY = e.changedTouches[0].clientY - touchStartYRef.current;
      touchStartXRef.current = null;
      touchStartYRef.current = null;

      if (scaleRef.current <= 1.05) {
        if (Math.abs(deltaX) > 55 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
          hasMovedRef.current = true;
          if (deltaX < 0) {
            handleNext();
          } else {
            handlePrev();
          }
        } else if (Math.abs(deltaY) > 80 && Math.abs(deltaY) > Math.abs(deltaX) * 1.3) {
          hasMovedRef.current = true;
          onClose();
        }
      }
    }
  };

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

  const singleTapTimeoutRef = useRef<any>(null);
  const lastTapRef = useRef<number>(0);

  const handlePhotoTap = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    if (showMoreMenu) {
      setShowMoreMenu(false);
      return;
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
            setShowMoreMenu(false);
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
      if (showDeleteConfirm || isRenameModalOpen || isMoveModalOpen || isCopyModalOpen) return;
      if (e.key === 'Escape') {
        if (showMoreMenu) {
          setShowMoreMenu(false);
        } else {
          onClose();
        }
      } else if (e.key === 'ArrowLeft') handlePrev();
      else if (e.key === 'ArrowRight') handleNext();
      else if (e.key === ' ' && activeItem?.record.category === 'video') {
        e.preventDefault();
        togglePlayVideo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    onClose,
    handlePrev,
    handleNext,
    showDeleteConfirm,
    isRenameModalOpen,
    isMoveModalOpen,
    isCopyModalOpen,
    showMoreMenu,
    activeItem,
  ]);

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

  // 1. COMPARTIR (Usa el menú nativo de compartir del sistema o descarga segura si no está soportado)
  const handleShare = async () => {
    if (!activeItem) return;
    setShowMoreMenu(false);
    try {
      const response = await fetch(activeItem.blobUrl);
      const blob = await response.blob();
      const mimeType = activeItem.record.mimeType || blob.type || 'image/jpeg';
      const file = new File([blob], activeItem.record.name || 'archivo.jpg', { type: mimeType });

      if (typeof navigator !== 'undefined' && navigator.share) {
        if (!navigator.canShare || navigator.canShare({ files: [file] })) {
          (window as any).__isPickingFile = true;
          (window as any).__filePickingStartTime = Date.now();
          try {
            await navigator.share({
              files: [file],
              title: activeItem.record.name,
            });
          } finally {
            setTimeout(() => {
              (window as any).__isPickingFile = false;
            }, 3000);
          }
          return;
        }
      }

      // Fallback de descarga directa si el navegador/WebView no soporta Web Share API con archivos
      const a = document.createElement('a');
      a.href = activeItem.blobUrl;
      a.download = activeItem.record.name || 'archivo';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('Archivo preparado para compartir / guardar', 'success');
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      showToast('No se pudo abrir el menú de compartir en este dispositivo', 'alert');
    }
  };

  // 2. GIRAR (Gira 90° a la derecha y guarda permanentemente en la bóveda cifrada)
  const handleRotate90AndPersist = async () => {
    if (!activeItem) return;
    setShowMoreMenu(false);

    if (!isPhoto) {
      setRotation((prev) => (prev + 90) % 360);
      return;
    }

    if (!onUpdateItemBlob || isRotatingSave) {
      setRotation((prev) => (prev + 90) % 360);
      showToast('Imagen girada 90°', 'info');
      return;
    }

    setIsRotatingSave(true);
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('No se pudo cargar la imagen'));
        img.src = activeItem.blobUrl;
      });

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalHeight || img.height;
      canvas.height = img.naturalWidth || img.width;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Error de lienzo');

      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((90 * Math.PI) / 180);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

      const outMime = activeItem.record.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
      const rotatedBlob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), outMime, 0.94)
      );

      if (rotatedBlob) {
        await onUpdateItemBlob(activeItem.id, rotatedBlob);
        setRotation(0);
        setScale(1);
        setPosition({ x: 0, y: 0 });
        showToast('Imagen girada y guardada', 'success');
      }
    } catch (err) {
      console.error('Error al girar y guardar imagen:', err);
      setRotation((prev) => (prev + 90) % 360);
      showToast('Imagen girada', 'info');
    } finally {
      setIsRotatingSave(false);
    }
  };

  // 3. ABRIR MODAL CAMBIAR NOMBRE
  const handleOpenRenameModal = () => {
    if (!activeItem) return;
    setShowMoreMenu(false);
    setRenameValue(activeItem.record.name || '');
    setRenameError('');
    setIsRenameModalOpen(true);
  };

  const handleConfirmRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeItem) return;
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenameError('El nombre no puede estar vacío');
      return;
    }

    // Conservar extensión original si el usuario no escribió ninguna extensión
    const oldName = activeItem.record.name || '';
    const dotIdx = oldName.lastIndexOf('.');
    const oldExt = dotIdx > 0 ? oldName.substring(dotIdx) : '';
    const finalName =
      oldExt && !trimmed.includes('.') ? `${trimmed}${oldExt}` : trimmed;

    try {
      if (onRenameItem) {
        await onRenameItem(activeItem.id, finalName);
      }
      setIsRenameModalOpen(false);
    } catch {
      setRenameError('Error al cambiar el nombre');
    }
  };

  // 5. COPIAR AL PORTAPAPELES
  const handleCopyToClipboard = async () => {
    try {
      const response = await fetch(activeItem.blobUrl);
      const blob = await response.blob();
      const item = new ClipboardItem({ [blob.type || 'image/png']: blob });
      await navigator.clipboard.write([item]);
      showToast('Imagen copiada al portapapeles', 'success');
      setIsCopyModalOpen(false);
    } catch {
      showToast('No se puede copiar directamente al portapapeles este archivo', 'alert');
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
      {/* Top Bar solo para videos, audios y documentos */}
      {!isPhoto && (
        <header
          className={`absolute top-0 left-0 right-0 px-4 safe-top-sticky pb-3 bg-gradient-to-b from-black/90 via-black/60 to-transparent flex items-center justify-between text-slate-200 z-30 transition-all duration-300 ease-in-out ${
            isImmersive ? '-translate-y-full opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'
          }`}
        >
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
            className="vault-viewer-floating-btn absolute top-20 right-4 z-30 px-3 py-1 rounded-full bg-black/75 backdrop-blur-md border border-white/20 text-xs font-mono text-zinc-200 hover:text-white transition-all shadow-xl active:scale-95 flex items-center gap-1.5 cursor-pointer"
            title="Toca para volver a tamaño normal (1x)"
          >
            <span>{scale.toFixed(1)}x</span>
            <span className="text-[10px] text-zinc-400">· 1x</span>
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
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-4xl w-full max-h-full flex flex-col items-center justify-center relative rounded-2xl overflow-hidden bg-black/60 border border-slate-800"
          >
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

            <div className="w-full bg-slate-900/90 backdrop-blur-md p-3 border-t border-slate-800 flex flex-col gap-2">
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
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[#131c2e] border border-amber-500/30 rounded-3xl p-6 sm:p-8 text-center shadow-2xl"
          >
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
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[#131c2e] border border-slate-800 rounded-3xl p-6 sm:p-8 text-center shadow-2xl"
          >
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
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute right-4 top-16 z-40 w-72 bg-slate-900/95 border border-slate-800 rounded-2xl p-4 shadow-2xl backdrop-blur-md text-xs space-y-3"
          >
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

      {/* Menú Flotante "Más (⋮)" adaptado a los temas de la aplicación (Cian Neón y Tema Claro) */}
      {showMoreMenu && !isImmersive && (
        <>
          <div
            className="fixed inset-0 z-40 bg-transparent"
            onClick={() => setShowMoreMenu(false)}
          />
          <div
            onClick={(e) => e.stopPropagation()}
            className="vault-more-menu-panel fixed bottom-[76px] left-5 right-5 sm:left-auto sm:right-6 sm:w-80 z-50 bg-[#0e1626]/95 backdrop-blur-2xl rounded-[28px] shadow-[0_16px_48px_rgba(0,0,0,0.85)] border border-slate-800/90 overflow-hidden animate-in fade-in slide-in-from-bottom-3 duration-200"
          >
            <div className="vault-more-menu-list flex flex-col divide-y divide-slate-800/80">
              {/* 1. Girar (solo para imágenes) */}
              {isPhoto && (
                <button
                  type="button"
                  onClick={handleRotate90AndPersist}
                  disabled={isRotatingSave}
                  className="vault-more-menu-item w-full px-6 py-4 text-left text-[15px] font-medium text-slate-100 hover:text-[#00e5ff] active:opacity-75 transition-colors cursor-pointer"
                >
                  Girar
                </button>
              )}

              {/* 2. Mover */}
              <button
                type="button"
                onClick={() => {
                  setShowMoreMenu(false);
                  setNewFolderInputOpen(false);
                  setIsMoveModalOpen(true);
                }}
                className="vault-more-menu-item w-full px-6 py-4 text-left text-[15px] font-medium text-slate-100 hover:text-[#00e5ff] active:opacity-75 transition-colors cursor-pointer"
              >
                Mover
              </button>

              {/* 3. Agregar a Favoritos / Quitar de Favoritos */}
              <button
                type="button"
                onClick={async () => {
                  setShowMoreMenu(false);
                  const nextFav = !activeItem.record.isFavorite;
                  await onToggleFavorite(activeItem.id, nextFav);
                  showToast(
                    nextFav ? 'Agregado a Favoritos' : 'Quitado de Favoritos',
                    'success'
                  );
                }}
                className="vault-more-menu-item w-full px-6 py-4 text-left text-[15px] font-medium text-slate-100 hover:text-[#00e5ff] active:opacity-75 transition-colors cursor-pointer"
              >
                {activeItem.record.isFavorite ? 'Quitar de Favoritos' : 'Agregar a Favoritos'}
              </button>

              {/* 4. Cambiar nombre */}
              <button
                type="button"
                onClick={handleOpenRenameModal}
                className="vault-more-menu-item w-full px-6 py-4 text-left text-[15px] font-medium text-slate-100 hover:text-[#00e5ff] active:opacity-75 transition-colors cursor-pointer"
              >
                Cambiar nombre
              </button>
            </div>
          </div>
        </>
      )}

      {/* Barra de Acciones Inferior - 4 botones (Compartir, Copiar, Eliminar, Más) */}
      <BarraAccionesInferior
        onCompartir={handleShare}
        onCopiar={() => {
          setShowMoreMenu(false);
          setNewFolderInputOpen(false);
          setIsCopyModalOpen(true);
        }}
        onEliminar={() => {
          setShowMoreMenu(false);
          setShowDeleteConfirm(true);
        }}
        onMas={() => setShowMoreMenu((prev) => !prev)}
        menuMasAbierto={showMoreMenu}
        esInmersivo={isImmersive}
      />

      {/* Modal: Cambiar nombre */}
      {isRenameModalOpen && (
        <div
          onClick={() => setIsRenameModalOpen(false)}
          className="fixed inset-0 z-[65] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-[#00e5ff]">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">Cambiar nombre</h3>
                  <p className="text-[11px] text-zinc-400 truncate max-w-[200px]">
                    {activeItem.record.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRenameModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmRename} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Nuevo nombre del archivo
                </label>
                <input
                  type="text"
                  autoFocus
                  value={renameValue}
                  onChange={(e) => {
                    setRenameValue(e.target.value);
                    setRenameError('');
                  }}
                  maxLength={80}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/60 transition-colors"
                />
                {renameError && (
                  <p className="text-[11px] text-rose-400 mt-1">{renameError}</p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsRenameModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!renameValue.trim()}
                  className="px-5 py-2 rounded-xl bg-zinc-100 hover:bg-white disabled:opacity-40 text-zinc-950 text-xs font-bold shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Guardar</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Mover a carpeta */}
      {isMoveModalOpen && (
        <div
          onClick={() => setIsMoveModalOpen(false)}
          className="fixed inset-0 z-[65] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <Folder className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">Mover a carpeta</h3>
                  <p className="text-[11px] text-zinc-400 truncate max-w-[200px]">
                    Carpeta actual: {activeItem.record.album || 'General'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMoveModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 no-scrollbar">
              {availableFolders.map((folder) => {
                const isCurrent = (activeItem.record.album || 'General') === folder;
                return (
                  <button
                    key={folder}
                    type="button"
                    onClick={async () => {
                      if (onMoveItem) {
                        await onMoveItem(activeItem.id, folder);
                      }
                      setIsMoveModalOpen(false);
                    }}
                    className={`w-full flex items-center justify-between p-3 rounded-2xl border transition-all text-left cursor-pointer ${
                      isCurrent
                        ? 'bg-zinc-800 border-zinc-700 text-zinc-100 font-semibold'
                        : 'bg-zinc-950/60 hover:bg-zinc-800/60 border-zinc-800 text-zinc-300 hover:text-zinc-100'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Folder className={`w-4 h-4 shrink-0 ${isCurrent ? 'text-amber-400' : 'text-zinc-500'}`} />
                      <span className="text-xs truncate">{folder}</span>
                    </div>
                    {isCurrent ? (
                      <span className="text-[10px] text-amber-400 font-mono bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 shrink-0">
                        Actual
                      </span>
                    ) : (
                      <ArrowRight className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {newFolderInputOpen ? (
              <div className="pt-2 border-t border-zinc-800 space-y-2">
                <input
                  type="text"
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Nombre de la nueva carpeta..."
                  maxLength={40}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/60"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setNewFolderInputOpen(false);
                      setNewFolderName('');
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={!newFolderName.trim()}
                    onClick={async () => {
                      const trimmed = newFolderName.trim();
                      if (!trimmed) return;
                      onCreateFolder?.(trimmed);
                      if (onMoveItem) {
                        await onMoveItem(activeItem.id, trimmed);
                      }
                      setNewFolderName('');
                      setNewFolderInputOpen(false);
                      setIsMoveModalOpen(false);
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black text-xs font-bold cursor-pointer"
                  >
                    Crear y Mover
                  </button>
                </div>
              </div>
            ) : (
              <div className="pt-2 border-t border-zinc-800 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setNewFolderInputOpen(true)}
                  className="text-xs text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1.5 transition-colors p-1 cursor-pointer"
                >
                  <FolderPlus className="w-4 h-4" />
                  <span>+ Crear nueva carpeta</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsMoveModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Copiar elemento */}
      {isCopyModalOpen && (
        <div
          onClick={() => setIsCopyModalOpen(false)}
          className="fixed inset-0 z-[65] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-[#00e5ff]">
                  <Copy className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">Copiar archivo</h3>
                  <p className="text-[11px] text-zinc-400">
                    Elige dónde guardar la copia en tu bóveda
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCopyModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1 no-scrollbar">
              {availableFolders.map((folder) => {
                const isCurrent = (activeItem.record.album || 'General') === folder;
                return (
                  <button
                    key={folder}
                    type="button"
                    onClick={async () => {
                      if (onCopyItemToFolder) {
                        await onCopyItemToFolder(activeItem.id, folder);
                      }
                      setIsCopyModalOpen(false);
                    }}
                    className="w-full flex items-center justify-between p-3 rounded-2xl border bg-zinc-950/60 hover:bg-zinc-800/60 border-zinc-800 text-zinc-200 hover:text-white transition-all text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Folder className="w-4 h-4 shrink-0 text-[#00e5ff]" />
                      <span className="text-xs truncate">
                        {folder} {isCurrent ? '(Duplicar aquí)' : ''}
                      </span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  </button>
                );
              })}
            </div>

            {isPhoto && (
              <button
                type="button"
                onClick={handleCopyToClipboard}
                className="w-full py-2.5 px-3 rounded-2xl bg-zinc-800/80 hover:bg-zinc-800 text-zinc-200 text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5 text-[#00e5ff]" />
                <span>Copiar imagen al portapapeles</span>
              </button>
            )}

            <div className="pt-2 border-t border-zinc-800 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setIsCopyModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

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

