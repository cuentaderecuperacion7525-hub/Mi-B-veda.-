import React, { useState, useEffect } from 'react';
import { Folder, FolderPlus, X, Check, ArrowRight, Trash2, Edit2 } from 'lucide-react';

interface CreateFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  category: 'photo' | 'video' | 'audio' | 'app';
  existingFolders: string[];
  onCreate: (folderName: string) => void;
}

export function CreateFolderModal({
  isOpen,
  onClose,
  category,
  existingFolders,
  onCreate,
}: CreateFolderModalProps) {
  const [folderName, setFolderName] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const categoryLabel =
    category === 'photo'
      ? 'Imágenes'
      : category === 'video'
      ? 'Videos'
      : category === 'audio'
      ? 'Audio'
      : 'Archivos';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = folderName.trim();
    if (!trimmed) {
      setError('El nombre de la carpeta no puede estar vacío');
      return;
    }
    if (existingFolders.some((f) => f.toLowerCase() === trimmed.toLowerCase())) {
      setError('Ya existe una carpeta con este nombre');
      return;
    }

    onCreate(trimmed);
    setFolderName('');
    setError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-sm bg-[#131c2e] border border-indigo-500/30 rounded-3xl p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Nueva Carpeta</h3>
              <p className="text-[11px] text-slate-400">En la sección {categoryLabel}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Nombre de la carpeta
            </label>
            <input
              type="text"
              autoFocus
              value={folderName}
              onChange={(e) => {
                setFolderName(e.target.value);
                setError('');
              }}
              placeholder="Ej: Personal, Viajes, Trabajo..."
              maxLength={40}
              className="w-full bg-[#0a0f1d] border border-slate-700 rounded-2xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
            {error && <p className="text-[11px] text-rose-400 mt-1">{error}</p>}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!folderName.trim()}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold shadow-md shadow-indigo-600/30 transition-all flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Crear</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface RenameFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  category: 'photo' | 'video' | 'audio' | 'app';
  currentFolderName: string;
  existingFolders: string[];
  onRename: (oldName: string, newName: string) => void;
}

export function RenameFolderModal({
  isOpen,
  onClose,
  category,
  currentFolderName,
  existingFolders,
  onRename,
}: RenameFolderModalProps) {
  const [folderName, setFolderName] = useState(currentFolderName);
  const [error, setError] = useState('');

  useEffect(() => {
    setFolderName(currentFolderName);
    setError('');
  }, [currentFolderName, isOpen]);

  if (!isOpen) return null;

  const categoryLabel =
    category === 'photo'
      ? 'Imágenes'
      : category === 'video'
      ? 'Videos'
      : category === 'audio'
      ? 'Audio'
      : 'Archivos';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = folderName.trim();
    if (!trimmed) {
      setError('El nombre no puede estar vacío');
      return;
    }
    if (
      trimmed.toLowerCase() !== currentFolderName.toLowerCase() &&
      existingFolders.some((f) => f.toLowerCase() === trimmed.toLowerCase())
    ) {
      setError('Ya existe otra carpeta con este nombre');
      return;
    }

    onRename(currentFolderName, trimmed);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-sm bg-[#131c2e] border border-indigo-500/30 rounded-3xl p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Edit2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Renombrar Carpeta</h3>
              <p className="text-[11px] text-slate-400">En la sección {categoryLabel}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Nuevo nombre
            </label>
            <input
              type="text"
              autoFocus
              value={folderName}
              onChange={(e) => {
                setFolderName(e.target.value);
                setError('');
              }}
              maxLength={40}
              className="w-full bg-[#0a0f1d] border border-slate-700 rounded-2xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
            {error && <p className="text-[11px] text-rose-400 mt-1">{error}</p>}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!folderName.trim() || folderName.trim() === currentFolderName}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold shadow-md shadow-indigo-600/30 transition-all flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Guardar</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface MoveToFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCount: number;
  category: 'photo' | 'video' | 'audio' | 'app';
  currentFolder?: string | null;
  folders: string[];
  onMove: (targetFolder: string) => void;
  onOpenCreateFolder: () => void;
}

export function MoveToFolderModal({
  isOpen,
  onClose,
  selectedCount,
  category,
  currentFolder,
  folders,
  onMove,
  onOpenCreateFolder,
}: MoveToFolderModalProps) {
  if (!isOpen) return null;

  const categoryLabel =
    category === 'photo'
      ? 'imágenes'
      : category === 'video'
      ? 'videos'
      : category === 'audio'
      ? 'audios'
      : 'archivos';

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-sm bg-[#131c2e] border border-slate-700/80 rounded-3xl p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Folder className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Mover a Carpeta</h3>
              <p className="text-[11px] text-slate-400">
                {selectedCount} {categoryLabel} seleccionada(s)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Folder List */}
        <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 no-scrollbar">
          {folders.map((folder) => {
            const isCurrent = currentFolder === folder;
            return (
              <button
                key={folder}
                type="button"
                onClick={() => {
                  onMove(folder);
                  onClose();
                }}
                className={`w-full flex items-center justify-between p-3 rounded-2xl border transition-all text-left ${
                  isCurrent
                    ? 'bg-indigo-600/15 border-indigo-500/40 text-indigo-200'
                    : 'bg-[#0a0f1d] hover:bg-[#101728] border-slate-800 text-slate-200 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <Folder className={`w-4 h-4 shrink-0 ${isCurrent ? 'text-indigo-400' : 'text-slate-400'}`} />
                  <span className="text-xs font-semibold truncate">{folder}</span>
                </div>
                {isCurrent ? (
                  <span className="text-[10px] text-indigo-400 font-mono bg-indigo-500/20 px-1.5 py-0.5 rounded shrink-0">
                    Actual
                  </span>
                ) : (
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        {/* Action to create new folder directly */}
        <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenCreateFolder();
            }}
            className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1.5 transition-colors p-1"
          >
            <FolderPlus className="w-4 h-4" />
            <span>+ Crear nueva carpeta</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
