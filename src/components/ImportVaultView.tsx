import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Image as ImageIcon,
  Video,
  Music,
  LayoutGrid,
  Lock,
  Check,
  Plus,
  Loader2,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { encryptBuffer } from '../crypto/vaultCrypto';
import {
  saveEncryptedItems,
  getAllEncryptedItems,
  detectCategory,
  VaultItemCategory,
  EncryptedVaultItem,
} from '../db/vaultDb';
import { requestNativeBatchGalleryDeletion, isNativeApp } from '../services/nativeVaultBridge';
import { registerBackHandler } from '../services/backButtonService';

interface ImportVaultViewProps {
  masterKey: CryptoKey;
  onImportComplete: (
    importedItems?: { name: string; size: number; category: VaultItemCategory }[],
    shouldShowReminder?: boolean
  ) => void;
  showToast: (msg: string, type?: 'info' | 'success' | 'alert' | 'error') => void;
}

interface MediaCandidate {
  id: string;
  name: string;
  category: VaultItemCategory;
  url: string;
  size: number;
  mimeType: string;
  isCustomFile?: boolean;
  file?: File;
  lastModified?: number;
}

export const ImportVaultView: React.FC<ImportVaultViewProps> = ({
  masterKey,
  onImportComplete,
  showToast,
}) => {
  const [activeCategory, setActiveCategory] = useState<'all' | 'photo' | 'video' | 'audio' | 'app'>('all');
  const [candidates, setCandidates] = useState<MediaCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isEncrypting, setIsEncrypting] = useState<boolean>(false);
  const [encryptProgress, setEncryptProgress] = useState<number>(0);
  const [encryptingName, setEncryptingName] = useState<string>('');
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  useEffect(() => {
    if (selectedIds.size > 0) {
      return registerBackHandler(
        'import_selection',
        () => {
          setSelectedIds(new Set());
          return true;
        },
        70
      );
    }
  }, [selectedIds.size]);

  // Safely trigger native or web file picker without triggering premature auto-lock
  const triggerPicker = (inputRef: React.RefObject<HTMLInputElement | null>, cat?: 'photo' | 'audio' | 'app') => {
    (window as any).__isPickingFile = true;
    (window as any).__filePickingStartTime = Date.now();
    if (cat) {
      if (cat === 'photo') setActiveCategory('all');
      else setActiveCategory(cat);
    }
    inputRef.current?.click();
  };

  const handleFilesAdded = async (files: File[]) => {
    if (!files || files.length === 0) return;

    let existingInVault: { name: string; size: number }[] = [];
    try {
      const allVault = await getAllEncryptedItems();
      existingInVault = allVault.map((item) => ({ name: item.name, size: item.size }));
    } catch {}

    const newCandidates: MediaCandidate[] = [];
    const newSelected = new Set(selectedIds);
    let duplicatesCount = 0;
    let lastDetectedCat: VaultItemCategory = 'photo';

    files.forEach((file, index) => {
      // Verificar si ya existe en la bóveda o en los candidatos actuales
      const alreadyInVault = existingInVault.some(
        (v) => v.name === file.name && v.size === file.size
      );
      const alreadyInCandidates = candidates.some(
        (c) => c.name === file.name && c.size === file.size
      );

      if (alreadyInVault || alreadyInCandidates) {
        duplicatesCount++;
        return;
      }

      const id = `cand_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 6)}`;
      const url = URL.createObjectURL(file);
      const cat = detectCategory(file.name, file.type);
      lastDetectedCat = cat;

      newCandidates.push({
        id,
        name: file.name,
        category: cat,
        url,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        isCustomFile: true,
        file,
        lastModified: file.lastModified || undefined,
      });

      newSelected.add(id);
    });

    if (duplicatesCount > 0) {
      showToast(`${duplicatesCount} archivo(s) ya existen en la bóveda y fueron omitidos`, 'alert');
    }

    if (newCandidates.length > 0) {
      setCandidates((prev) => [...prev, ...newCandidates]);
      setSelectedIds(newSelected);
      // Ensure the category view shows the newly picked items
      if (activeCategory !== 'all' && activeCategory !== lastDetectedCat) {
        setActiveCategory('all');
      }
      showToast(`${newCandidates.length} archivo(s) listo(s). Toca 'Cifrar e importar' para guardarlos.`, 'success');
    }
  };

  const handleCustomFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      // CRITICAL: Convert FileList to a concrete Array BEFORE resetting input.value!
      // In Android Chrome / WebAPK, resetting input.value = '' empties e.target.files in place.
      const filesArray = Array.from(e.target.files);
      e.target.value = '';
      handleFilesAdded(filesArray);
    }
  };

  const filteredCandidates = useMemo(() => {
    if (activeCategory === 'all') return candidates;
    return candidates.filter((c) => c.category === activeCategory);
  }, [candidates, activeCategory]);

  const candidateCounts = useMemo(() => {
    let photos = 0;
    let videos = 0;
    let audio = 0;
    let app = 0;
    candidates.forEach((c) => {
      if (c.category === 'photo') photos++;
      else if (c.category === 'video') videos++;
      else if (c.category === 'audio') audio++;
      else app++;
    });
    return { photos, videos, audio, app, total: candidates.length };
  }, [candidates]);

  const handleSelectAll = () => {
    if (selectedIds.size === filteredCandidates.length && filteredCandidates.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(candidates.map((c) => c.id)));
    }
  };

  const handleClearCandidates = () => {
    candidates.forEach((c) => {
      try {
        URL.revokeObjectURL(c.url);
      } catch {}
    });
    setCandidates([]);
    setSelectedIds(new Set());
  };

  const handleEncryptAndImport = async () => {
    if (candidates.length === 0 || selectedIds.size === 0) {
      triggerPicker(mediaInputRef, 'photo');
      return;
    }

    setIsEncrypting(true);
    setEncryptProgress(5);

    const itemsToProcess = candidates.filter((c) => selectedIds.has(c.id));
    const total = itemsToProcess.length;
    let completed = 0;
    const newRecords: EncryptedVaultItem[] = [];

    try {
      for (const item of itemsToProcess) {
        setEncryptingName(item.name);
        let buffer: ArrayBuffer;
        if (item.file) {
          buffer = await item.file.arrayBuffer();
        } else {
          try {
            const resp = await fetch(item.url);
            buffer = await resp.arrayBuffer();
          } catch {
            const encoder = new TextEncoder();
            buffer = encoder.encode(`Secure encrypted asset data for ${item.name}`).buffer;
          }
        }

        const encrypted = await encryptBuffer(buffer, masterKey);
        const recordId = `item_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

        newRecords.push({
          id: recordId,
          timestamp: Date.now() + completed,
          name: item.name,
          mimeType: item.mimeType,
          size: item.size,
          iv: encrypted.iv,
          data: encrypted.data,
          album: 'General',
          isFavorite: false,
          category: item.category,
          lastModified: item.lastModified,
        });

        completed++;
        setEncryptProgress(Math.round((completed / total) * 100));
      }

      // Guardar todos los registros en IndexedDB de forma atómica y segura
      if (newRecords.length > 0) {
        await saveEncryptedItems(newRecords);
      }

      // Prompt gallery deletion for photos/videos natively via unified batch call on Android
      const mediaItemsToDelete = itemsToProcess
        .filter((it) => it.category === 'photo' || it.category === 'video' || it.category === 'audio')
        .map((it) => ({
          filename: it.name,
          size: it.size,
          lastModified: it.lastModified,
          mimeType: it.mimeType,
        }));

      let handledByNativeDialog = false;
      if (isNativeApp() && mediaItemsToDelete.length > 0) {
        try {
          const res = await requestNativeBatchGalleryDeletion(mediaItemsToDelete);
          if (res && res.requested) {
            handledByNativeDialog = true;
          }
        } catch (e) {
          console.warn('Native deletion request failed:', e);
        }
      }

      showToast(`¡${total} archivo(s) cifrados con éxito en tu Bóveda!`, 'success');

      // Revoke URLs of processed items
      itemsToProcess.forEach((it) => {
        try {
          URL.revokeObjectURL(it.url);
        } catch {}
      });

      setSelectedIds(new Set());
      setCandidates((prev) => prev.filter((c) => !itemsToProcess.some((p) => p.id === c.id)));
      setIsEncrypting(false);

      onImportComplete(
        itemsToProcess.map((it) => ({ name: it.name, size: it.size, category: it.category })),
        !handledByNativeDialog
      );
    } catch (err) {
      console.error('Error importing items:', err);
      showToast('Error al cifrar archivos', 'error');
      setIsEncrypting(false);
    }
  };

  const selectedCount = selectedIds.size;

  return (
    <div className="w-full max-w-md mx-auto px-4 pb-28 animate-in fade-in duration-200 box-border">
      {/* Fixed Pinned Header */}
      <header className="fixed top-0 left-0 right-0 z-30 bg-[#090d16]/95 backdrop-blur-xl border-b border-slate-800/80 safe-top-sticky pb-3 px-4 shadow-md shadow-black/40 transition-all">
        <div className="max-w-md mx-auto w-full flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-0.5">
              Impor<span className="text-[#00e5ff]">tar</span>
            </h1>
            <p className="text-[10px] font-semibold text-slate-400 tracking-[0.2em] uppercase">
              SELECCIONA ARCHIVOS PARA CIFRAR
            </p>
          </div>
          {candidates.length > 0 && (
            <button
              type="button"
              onClick={handleClearCandidates}
              className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
              title="Limpiar selección"
            >
              <Trash2 className="w-4 h-4" />
              <span>Limpiar</span>
            </button>
          )}
        </div>
      </header>

      {/* Spacer so content starts right below fixed header */}
      <div className="safe-top-header-spacer shrink-0 w-full mb-3" />

      {/* Sub-header and selection actions */}
      <div className="flex items-center justify-between mb-3 px-1">
        <span className="text-xs font-semibold text-slate-400">
          {candidates.length > 0
            ? `${selectedCount} de ${candidates.length} seleccionados`
            : 'Elige archivos de tu dispositivo'}
        </span>
        {candidates.length > 0 && (
          <button
            type="button"
            onClick={handleSelectAll}
            className="text-xs font-bold text-[#00e5ff] hover:underline cursor-pointer"
          >
            {selectedIds.size === filteredCandidates.length && filteredCandidates.length > 0
              ? 'Deseleccionar'
              : 'Seleccionar todos'}
          </button>
        )}
      </div>

      {/* Category filter tabs when candidates exist */}
      {candidates.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-3 no-scrollbar text-xs">
          <button
            type="button"
            onClick={() => setActiveCategory('all')}
            className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activeCategory === 'all'
                ? 'bg-[#00e5ff] text-black font-bold shadow-md shadow-cyan-500/25'
                : 'bg-[#131c2e] text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <span>Todas ({candidateCounts.total})</span>
          </button>
          {candidateCounts.photos > 0 && (
            <button
              type="button"
              onClick={() => setActiveCategory('photo')}
              className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer ${
                activeCategory === 'photo'
                  ? 'bg-[#00e5ff] text-black font-bold shadow-md shadow-cyan-500/25'
                  : 'bg-[#131c2e] text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Fotos ({candidateCounts.photos})</span>
            </button>
          )}
          {candidateCounts.videos > 0 && (
            <button
              type="button"
              onClick={() => setActiveCategory('video')}
              className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer ${
                activeCategory === 'video'
                  ? 'bg-[#00e5ff] text-black font-bold shadow-md shadow-cyan-500/25'
                  : 'bg-[#131c2e] text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              <span>Videos ({candidateCounts.videos})</span>
            </button>
          )}
          {candidateCounts.audio > 0 && (
            <button
              type="button"
              onClick={() => setActiveCategory('audio')}
              className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer ${
                activeCategory === 'audio'
                  ? 'bg-[#00e5ff] text-black font-bold shadow-md shadow-cyan-500/25'
                  : 'bg-[#131c2e] text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <Music className="w-3.5 h-3.5" />
              <span>Audio ({candidateCounts.audio})</span>
            </button>
          )}
          {candidateCounts.app > 0 && (
            <button
              type="button"
              onClick={() => setActiveCategory('app')}
              className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer ${
                activeCategory === 'app'
                  ? 'bg-[#00e5ff] text-black font-bold shadow-md shadow-cyan-500/25'
                  : 'bg-[#131c2e] text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Apps ({candidateCounts.app})</span>
            </button>
          )}
        </div>
      )}

      {/* 3x3 Media Selection Grid or Empty Dropzone */}
      {candidates.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 sm:gap-2.5 mb-4">
          {filteredCandidates.map((item) => {
            const isSelected = selectedIds.has(item.id);

            return (
              <div
                key={item.id}
                onClick={() => toggleSelect(item.id)}
                className={`group relative aspect-square rounded-2xl overflow-hidden bg-slate-900 border transition-all active:scale-95 shadow-md cursor-pointer select-none ${
                  isSelected
                    ? 'border-[#00e5ff] ring-2 ring-[#00e5ff]/40 shadow-cyan-500/20'
                    : 'border-slate-800/80 hover:border-slate-600'
                }`}
              >
                {item.category === 'photo' || item.category === 'video' ? (
                  <img
                    src={item.url}
                    alt={item.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-2 bg-gradient-to-br from-[#101728] to-slate-950 text-slate-400">
                    {item.category === 'audio' ? (
                      <Music className="w-8 h-8 text-amber-400 mb-1" />
                    ) : (
                      <LayoutGrid className="w-8 h-8 text-[#00e5ff] mb-1" />
                    )}
                    <span className="text-[10px] text-center font-medium line-clamp-2 px-1 text-slate-300">
                      {item.name}
                    </span>
                  </div>
                )}

                {/* Video tag indicator */}
                {item.category === 'video' && (
                  <div className="absolute top-2 left-2 z-10 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-[9px] font-bold text-white flex items-center gap-1">
                    <Video className="w-2.5 h-2.5 text-purple-400" />
                    <span>VID</span>
                  </div>
                )}

                {/* Circular Checkbox (Top Right) */}
                <div className="absolute top-2 right-2 z-10">
                  {isSelected ? (
                    <div className="w-6 h-6 rounded-full bg-[#00e5ff] text-black flex items-center justify-center shadow-lg shadow-cyan-500/40">
                      <Check className="w-3.5 h-3.5 stroke-[3.5]" />
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-full border-2 border-white/80 bg-black/40 backdrop-blur-sm" />
                  )}
                </div>

                {/* Bottom shade with name */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-1.5 pt-3 text-[10px] text-white/90 truncate pointer-events-none">
                  {item.name}
                </div>
              </div>
            );
          })}

          {/* Plus tile to pick local files */}
          <div
            onClick={() => {
              if (activeCategory === 'audio') triggerPicker(audioInputRef, 'audio');
              else if (activeCategory === 'app') triggerPicker(docInputRef, 'app');
              else triggerPicker(mediaInputRef, 'photo');
            }}
            className="aspect-square rounded-2xl border-2 border-dashed border-slate-800 hover:border-[#00e5ff]/50 bg-[#0a121d]/60 hover:bg-[#0a121d] flex flex-col items-center justify-center p-2 text-center cursor-pointer transition-all active:scale-95 group"
          >
            <div className="w-8 h-8 rounded-full bg-[#00e5ff]/10 text-[#00e5ff] flex items-center justify-center mb-1 group-hover:scale-110 transition-transform">
              <Plus className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-semibold text-slate-300 group-hover:text-[#00e5ff] transition-colors">
              + Añadir más
            </span>
          </div>
        </div>
      ) : (
        <div className="mb-5 bg-[#0a121d] border border-slate-800/90 rounded-3xl p-5 text-center shadow-xl">
          <div
            onClick={() => triggerPicker(mediaInputRef, 'photo')}
            className="w-14 h-14 rounded-2xl bg-[#00e5ff]/10 border border-[#00e5ff]/30 text-[#00e5ff] flex items-center justify-center mx-auto mb-3 shadow-md shadow-cyan-500/10 cursor-pointer active:scale-95 transition-transform"
          >
            <Plus className="w-7 h-7 stroke-[2.5]" />
          </div>
          <h3 className="text-base font-bold text-white mb-1">
            Selecciona archivos para tu Bóveda
          </h3>
          <p className="text-xs text-slate-400 mb-5 max-w-xs mx-auto">
            Elige fotos, videos, grabaciones o aplicaciones desde el almacenamiento de tu celular.
          </p>

          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => triggerPicker(mediaInputRef, 'photo')}
              className="w-full py-3 px-4 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-[#00e5ff]/40 text-left flex items-center justify-between transition-all active:scale-98 cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center">
                  <ImageIcon className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white group-hover:text-blue-300">
                    Fotos y Videos
                  </h4>
                  <p className="text-[11px] text-slate-500">Galería, cámara y descargas</p>
                </div>
              </div>
              <Plus className="w-4 h-4 text-slate-500 group-hover:text-[#00e5ff]" />
            </button>

            <button
              type="button"
              onClick={() => triggerPicker(audioInputRef, 'audio')}
              className="w-full py-3 px-4 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/40 text-left flex items-center justify-between transition-all active:scale-98 cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
                  <Music className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white group-hover:text-amber-300">
                    Audio y Grabaciones
                  </h4>
                  <p className="text-[11px] text-slate-500">Música, audios de voz y grabadora</p>
                </div>
              </div>
              <Plus className="w-4 h-4 text-slate-500 group-hover:text-amber-400" />
            </button>

            <button
              type="button"
              onClick={() => triggerPicker(docInputRef, 'app')}
              className="w-full py-3 px-4 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/40 text-left flex items-center justify-between transition-all active:scale-98 cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                  <LayoutGrid className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white group-hover:text-emerald-300">
                    Archivos y Aplicaciones (.apk)
                  </h4>
                  <p className="text-[11px] text-slate-500">Documentos privados, paquetes y zips</p>
                </div>
              </div>
              <Plus className="w-4 h-4 text-slate-500 group-hover:text-emerald-400" />
            </button>
          </div>
        </div>
      )}

      {/* Encryption Status Card */}
      <div className="bg-[#0a121d] border border-slate-800/90 rounded-2xl p-4 mb-4 shadow-xl">
        <div className="flex items-center gap-3.5 mb-3">
          <div className="w-11 h-11 rounded-xl bg-[#00e5ff]/15 border border-[#00e5ff]/30 text-[#00e5ff] flex items-center justify-center shrink-0 shadow-md shadow-cyan-500/10">
            {isEncrypting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : selectedCount > 0 ? (
              <Sparkles className="w-5 h-5" />
            ) : (
              <Lock className="w-5 h-5" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-white truncate">
              {isEncrypting
                ? `Cifrando: ${encryptingName || 'archivo'}`
                : selectedCount > 0
                ? `${selectedCount} archivo(s) listos para cifrar`
                : 'Cifrado local AES-256 en reposo'}
            </h3>
            <p className="text-xs text-slate-400">
              {isEncrypting
                ? 'Generando IV criptográfico único y guardando en tu dispositivo'
                : selectedCount > 0
                ? 'Toca el botón abajo para cifrarlos y guardarlos en Mi Bóveda'
                : 'Cifrado blindado en Bóveda • Conservas control para eliminar originales'}
            </p>
          </div>
        </div>

        {/* Cyan Progress Bar */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 bg-slate-800/90 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#00e5ff] transition-all duration-300 rounded-full shadow-sm shadow-cyan-500/50"
              style={{ width: `${selectedCount > 0 ? (isEncrypting ? encryptProgress : 100) : 0}%` }}
            />
          </div>
          <span className="text-xs font-mono font-bold text-slate-300 shrink-0">
            {isEncrypting ? `${encryptProgress}%` : selectedCount > 0 ? 'Listo' : '0%'}
          </span>
        </div>
      </div>

      {/* Sleek Action Button */}
      <button
        type="button"
        onClick={handleEncryptAndImport}
        disabled={isEncrypting}
        className="w-full py-3 sm:py-3.5 px-5 rounded-2xl bg-gradient-to-r from-cyan-400 via-[#00e5ff] to-cyan-400 hover:brightness-105 active:scale-[0.98] disabled:opacity-40 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/25 transition-all cursor-pointer"
      >
        {isEncrypting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin text-slate-950 shrink-0" />
            <span>Cifrando y guardando con AES-256...</span>
          </>
        ) : selectedCount > 0 ? (
          <>
            <Lock className="w-4 h-4 stroke-[2.4] text-slate-950 shrink-0" />
            <span>Cifrar e importar ({selectedCount})</span>
          </>
        ) : (
          <>
            <Plus className="w-4 h-4 stroke-[2.4] text-slate-950 shrink-0" />
            <span>Seleccionar archivos para importar</span>
          </>
        )}
      </button>

      {/* Hidden file inputs for media, audio and documents */}
      <input
        ref={mediaInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onClick={() => {
          (window as any).__isPickingFile = true;
          (window as any).__filePickingStartTime = Date.now();
        }}
        onChange={handleCustomFileSelect}
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        multiple
        className="hidden"
        onClick={() => {
          (window as any).__isPickingFile = true;
          (window as any).__filePickingStartTime = Date.now();
        }}
        onChange={handleCustomFileSelect}
      />
      <input
        ref={docInputRef}
        type="file"
        accept=".apk,.zip,.pdf,.doc,.docx,.txt,.rar,application/*,*/*"
        multiple
        className="hidden"
        onClick={() => {
          (window as any).__isPickingFile = true;
          (window as any).__filePickingStartTime = Date.now();
        }}
        onChange={handleCustomFileSelect}
      />
    </div>
  );
};
