import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Shield,
  ShieldCheck,
  Lock,
  Settings,
  ImagePlus,
  Camera,
  Search,
  Heart,
  Trash2,
  Download,
  CheckSquare,
  Cpu,
  UploadCloud,
  LayoutGrid,
  Grid3X3,
  Film,
  Smartphone,
  Image as ImageIcon,
  FolderArchive,
  Layers,
  Play,
  Package,
  X,
  Folder,
  FolderPlus,
  ChevronRight,
  Plus,
  ArrowLeft,
  Edit2,
  Edit3,
  Music,
  FileText,
  Check,
  Clock,
  Home,
  Video,
  AlertTriangle,
  ShieldAlert,
  Maximize2,
} from 'lucide-react';
import {
  EncryptedVaultItem,
  getAllEncryptedItems,
  saveEncryptedItem,
  saveEncryptedItems,
  deleteEncryptedItem,
  deleteMultipleEncryptedItems,
  updateItemMetadata,
  batchUpdateAlbum,
  batchRenameAlbum,
  detectCategory,
  VaultItemCategory,
} from '../db/vaultDb';
import { encryptBuffer, decryptBuffer, checkIsUnencryptedMedia } from '../crypto/vaultCrypto';
import { PhotoViewerModal, DecryptedVaultItem } from './PhotoViewerModal';
import { CameraCaptureModal } from './CameraCaptureModal';
import { DeleteGalleryReminderModal } from './DeleteGalleryReminderModal';
import { CreateFolderModal, MoveToFolderModal, RenameFolderModal } from './FolderModals';
import { isNativeApp, requestNativeBatchGalleryDeletion, exportVaultItemToDevice } from '../services/nativeVaultBridge';
import { ImportVaultView } from './ImportVaultView';
import { SecurityVaultView } from './SecurityVaultView';
import { SettingsVaultView } from './SettingsVaultView';
import { registerBackHandler, triggerBackAction } from '../services/backButtonService';

interface MainVaultViewProps {
  masterKey: CryptoKey;
  sessionPin?: string | null;
  onLock: () => void;
  onOpenSettings: () => void;
  showToast: (msg: string, type?: 'info' | 'success' | 'alert' | 'error') => void;
  refreshTrigger?: number;
  autoLockMinutes?: number;
  onAutoLockChange?: (mins: number) => void;
  lockOnTabSwitch?: boolean;
  onLockOnTabSwitchChange?: (enabled: boolean) => void;
  onMasterKeyUpdated?: (newKey: CryptoKey) => void;
  onResetVault?: () => void;
}

export const MainVaultView: React.FC<MainVaultViewProps> = ({
  masterKey,
  sessionPin,
  onLock,
  onOpenSettings,
  showToast,
  refreshTrigger = 0,
  autoLockMinutes = 5,
  onAutoLockChange,
  lockOnTabSwitch = true,
  onLockOnTabSwitchChange,
  onMasterKeyUpdated,
  onResetVault,
}) => {
  const [items, setItems] = useState<DecryptedVaultItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'all' | 'photo' | 'video' | 'audio' | 'app' | 'favorites'>('all');
  const [activeNavTab, setActiveNavTab] = useState<'vault' | 'import' | 'security' | 'settings'>('vault');
  const [activeCategory, setActiveCategory] = useState<'photo' | 'video' | 'audio' | 'app' | null>(null);
  const [lastAccessTime] = useState<string>(() => {
    return localStorage.getItem('nullvault_last_access') || '21:14';
  });
  const [gridColumns, setGridColumns] = useState<2 | 3 | 4>(3);
  const [aspectMode, setAspectMode] = useState<'real' | 'square'>(() => {
    return (localStorage.getItem('vault_aspect_mode') as 'real' | 'square') || 'real';
  });

  const toggleAspectMode = () => {
    const next = aspectMode === 'real' ? 'square' : 'real';
    setAspectMode(next);
    localStorage.setItem('vault_aspect_mode', next);
    showToast(next === 'real' ? 'Visualización: Tamaño y proporción real (sin recorte)' : 'Visualización: Cuadrícula cuadrada 1:1', 'info');
  };

  // Recordatorio de copia de seguridad (> 7 días)
  const [backupReminder, setBackupReminder] = useState<{
    show: boolean;
    days: number;
    hasNeverBackedUp: boolean;
  }>(() => {
    const lastBackupTime = Number(
      localStorage.getItem('nullvault_last_backup_timestamp') ||
      localStorage.getItem('vault_last_backup_timestamp') ||
      '0'
    );
    const dismissedUntil = Number(
      localStorage.getItem('nullvault_backup_reminder_dismissed_until') ||
      localStorage.getItem('vault_backup_reminder_dismissed_until') ||
      '0'
    );
    if (Date.now() < dismissedUntil) {
      return { show: false, days: 0, hasNeverBackedUp: false };
    }
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    if (lastBackupTime > 0) {
      const diffMs = Date.now() - lastBackupTime;
      if (diffMs > ONE_WEEK_MS) {
        const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
        return { show: true, days, hasNeverBackedUp: false };
      }
    } else {
      return { show: true, days: 7, hasNeverBackedUp: true };
    }
    return { show: false, days: 0, hasNeverBackedUp: false };
  });

  useEffect(() => {
    const handleBackupUpdated = () => {
      setBackupReminder({ show: false, days: 0, hasNeverBackedUp: false });
    };
    window.addEventListener('vault_backup_updated', handleBackupUpdated);
    window.addEventListener('nullvault_backup_updated', handleBackupUpdated);
    return () => {
      window.removeEventListener('vault_backup_updated', handleBackupUpdated);
      window.removeEventListener('nullvault_backup_updated', handleBackupUpdated);
    };
  }, []);

  const dismissBackupReminder = () => {
    const nextDismiss = (Date.now() + 3 * 24 * 60 * 60 * 1000).toString();
    localStorage.setItem('vault_backup_reminder_dismissed_until', nextDismiss);
    localStorage.setItem('nullvault_backup_reminder_dismissed_until', nextDismiss);
    setBackupReminder({ show: false, days: 0, hasNeverBackedUp: false });
  };

  // Selection mode
  const [isSelectMode, setIsSelectMode] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBatchExportModal, setShowBatchExportModal] = useState<boolean>(false);
  const [isExportingBatch, setIsExportingBatch] = useState<boolean>(false);

  // Subfolders / Custom independent folders per category
  const [customFolders, setCustomFolders] = useState<{
    photo: string[];
    video: string[];
    audio: string[];
    app: string[];
  }>(() => {
    const load = (cat: 'photo' | 'video' | 'audio' | 'app') => {
      try {
        const saved = localStorage.getItem(`vault_subfolders_${cat}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch (e) {
        console.error(e);
      }
      return ['General'];
    };
    return {
      photo: load('photo'),
      video: load('video'),
      audio: load('audio'),
      app: load('app'),
    };
  });

  const [activeSubfolder, setActiveSubfolder] = useState<string | null>(null);
  const [folderToRename, setFolderToRename] = useState<string | null>(null);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState<boolean>(false);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState<boolean>(false);

  // Modals
  const [activeViewerItem, setActiveViewerItem] = useState<DecryptedVaultItem | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState<boolean>(false);
  const [cameraInitialMode, setCameraInitialMode] = useState<'photo' | 'video'>('photo');
  const [isWhatsAppFabOpen, setIsWhatsAppFabOpen] = useState<boolean>(false);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [isAddSheetOpen, setIsAddSheetOpen] = useState<boolean>(false);
  const [importedCountForReminder, setImportedCountForReminder] = useState<number>(0);
  const [recentImportedItems, setRecentImportedItems] = useState<{ name: string; size: number }[]>([]);
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState<boolean>(false);
  const [isDeletingBatch, setIsDeletingBatch] = useState<boolean>(false);
  const longPressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressTriggered = useRef<boolean>(false);
  const [encryptingProgress, setEncryptingProgress] = useState<{
    current: number;
    total: number;
    name: string;
  } | null>(null);

  // Hidden file inputs
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const appInputRef = useRef<HTMLInputElement | null>(null);
  const blobUrlsRef = useRef<string[]>([]);

  // Trigger file picker safely preventing premature auto-lock
  const triggerPicker = (inputRef: React.RefObject<HTMLInputElement | null>) => {
    (window as any).__isPickingFile = true;
    (window as any).__filePickingStartTime = Date.now();
    inputRef.current?.click();
  };

  // Load and decrypt items into memory
  const loadVaultItems = async () => {
    setIsLoading(true);
    try {
      const records = await getAllEncryptedItems();
      records.sort((a, b) => b.timestamp - a.timestamp);

      // Clean up previous blob URLs to prevent memory leaks
      blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      blobUrlsRef.current = [];

      const decryptedItems: DecryptedVaultItem[] = [];

      for (let i = 0; i < records.length; i++) {
        const rec = records[i];
        try {
          let decryptedData: ArrayBuffer;
          const isProbablyUnencrypted = !rec.iv || rec.iv.length === 0 || checkIsUnencryptedMedia(rec.data);

          if (isProbablyUnencrypted) {
            decryptedData = rec.data;
          } else {
            try {
              decryptedData = await decryptBuffer(rec.data, rec.iv, masterKey);
            } catch (decErr) {
              if (checkIsUnencryptedMedia(rec.data)) {
                decryptedData = rec.data;
              } else {
                throw decErr;
              }
            }
          }

          const blob = new Blob([decryptedData], { type: rec.mimeType || 'application/octet-stream' });
          const blobUrl = URL.createObjectURL(blob);
          blobUrlsRef.current.push(blobUrl);

          decryptedItems.push({
            id: rec.id,
            blobUrl,
            record: rec,
          });
        } catch (decryptErr) {
          console.error(`Error decrypting item ${rec.id}:`, decryptErr);
        }

        if (i > 0 && i % 10 === 0) {
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      setItems(decryptedItems);
    } catch (err) {
      console.error('Error loading vault items:', err);
      showToast('Error al leer datos de la bóveda', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadVaultItems();

    // Reload folders in case a backup brought new custom folders
    const loadFolder = (cat: 'photo' | 'video' | 'audio' | 'app') => {
      try {
        const saved = localStorage.getItem(`vault_subfolders_${cat}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch (e) {
        console.error(e);
      }
      return ['General'];
    };
    setCustomFolders({
      photo: loadFolder('photo'),
      video: loadFolder('video'),
      audio: loadFolder('audio'),
      app: loadFolder('app'),
    });

    return () => {
      // Memory cleanup when component unmounts / locks
      blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      blobUrlsRef.current = [];
    };
  }, [masterKey, refreshTrigger]);

  // Android Back Button / Gesture Navigation Support
  const activeViewerItemRef = useRef(activeViewerItem);
  activeViewerItemRef.current = activeViewerItem;
  const wasViewerOpenRef = useRef(false);

  const isCameraOpenRef = useRef(isCameraOpen);
  isCameraOpenRef.current = isCameraOpen;
  const wasCameraOpenRef = useRef(false);

  const showBatchDeleteModalRef = useRef(showBatchDeleteModal);
  showBatchDeleteModalRef.current = showBatchDeleteModal;
  const wasDeleteModalOpenRef = useRef(false);

  const importedCountRef = useRef(importedCountForReminder);
  importedCountRef.current = importedCountForReminder;
  const wasReminderOpenRef = useRef(false);

  const isSelectModeRef = useRef(isSelectMode);
  isSelectModeRef.current = isSelectMode;
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const wasSelectingRef = useRef(false);

  const isCreateFolderOpenRef = useRef(isCreateFolderOpen);
  isCreateFolderOpenRef.current = isCreateFolderOpen;
  const wasCreateFolderOpenRef = useRef(false);

  const isMoveModalOpenRef = useRef(isMoveModalOpen);
  isMoveModalOpenRef.current = isMoveModalOpen;
  const wasMoveModalOpenRef = useRef(false);

  // Sync modal refs
  useEffect(() => {
    wasCreateFolderOpenRef.current = isCreateFolderOpen;
  }, [isCreateFolderOpen]);

  useEffect(() => {
    wasMoveModalOpenRef.current = isMoveModalOpen;
  }, [isMoveModalOpen]);

  // Reset activeSubfolder when changing activeTab
  useEffect(() => {
    setActiveSubfolder(null);
  }, [activeTab]);

  const activeSubfolderRef = useRef(activeSubfolder);
  activeSubfolderRef.current = activeSubfolder;
  const wasSubfolderOpenRef = useRef(false);

  const folderToRenameRef = useRef(folderToRename);
  folderToRenameRef.current = folderToRename;

  // Sync open subfolder ref
  useEffect(() => {
    wasSubfolderOpenRef.current = activeSubfolder !== null;
  }, [activeSubfolder]);

  // Dynamic list of all folders for active category
  const activeCategoryFolders = useMemo(() => {
    const targetCat =
      activeTab === 'favorites' || activeTab === 'all'
        ? activeCategory || 'photo'
        : activeTab;
    const list = customFolders[targetCat] || ['General'];
    const set = new Set<string>(list);
    items.forEach((it) => {
      if (
        (activeTab === 'favorites' ? it.record.isFavorite : it.record.category === targetCat) &&
        it.record.album
      ) {
        set.add(it.record.album);
      }
    });
    return Array.from(set);
  }, [activeTab, activeCategory, customFolders, items]);

  // Robust Native Android Back Button & Gesture Navigation Stack
  useEffect(() => {
    if (activeViewerItem) {
      return registerBackHandler('main_viewer_item', () => {
        setActiveViewerItem(null);
        return true;
      }, 95);
    }
  }, [activeViewerItem]);

  useEffect(() => {
    if (isCameraOpen) {
      return registerBackHandler('main_camera_open', () => {
        setIsCameraOpen(false);
        return true;
      }, 90);
    }
  }, [isCameraOpen]);

  useEffect(() => {
    if (isAddSheetOpen) {
      return registerBackHandler('main_add_sheet', () => {
        setIsAddSheetOpen(false);
        return true;
      }, 85);
    }
  }, [isAddSheetOpen]);

  useEffect(() => {
    if (isCreateFolderOpen) {
      return registerBackHandler('main_create_folder', () => {
        setIsCreateFolderOpen(false);
        return true;
      }, 80);
    }
  }, [isCreateFolderOpen]);

  useEffect(() => {
    if (isMoveModalOpen) {
      return registerBackHandler('main_move_modal', () => {
        setIsMoveModalOpen(false);
        return true;
      }, 80);
    }
  }, [isMoveModalOpen]);

  useEffect(() => {
    if (folderToRename) {
      return registerBackHandler('main_rename_folder', () => {
        setFolderToRename(null);
        return true;
      }, 80);
    }
  }, [folderToRename]);

  useEffect(() => {
    if (showBatchDeleteModal) {
      return registerBackHandler('main_batch_delete', () => {
        setShowBatchDeleteModal(false);
        return true;
      }, 80);
    }
  }, [showBatchDeleteModal]);

  useEffect(() => {
    if (isWhatsAppFabOpen) {
      return registerBackHandler('main_whatsapp_fab', () => {
        setIsWhatsAppFabOpen(false);
        return true;
      }, 90);
    }
  }, [isWhatsAppFabOpen]);

  useEffect(() => {
    setIsWhatsAppFabOpen(false);
  }, [activeCategory, activeSubfolder, activeNavTab]);

  useEffect(() => {
    if (importedCountForReminder > 0) {
      return registerBackHandler('main_import_reminder', () => {
        setImportedCountForReminder(0);
        return true;
      }, 80);
    }
  }, [importedCountForReminder]);

  useEffect(() => {
    if (isSelectMode) {
      return registerBackHandler('main_select_mode', () => {
        setIsSelectMode(false);
        setSelectedIds(new Set());
        return true;
      }, 50);
    }
  }, [isSelectMode]);

  useEffect(() => {
    if (activeSubfolder !== null) {
      return registerBackHandler('main_subfolder_nav', () => {
        setActiveSubfolder(null);
        return true;
      }, 40);
    }
  }, [activeSubfolder]);

  useEffect(() => {
    if (activeCategory !== null) {
      return registerBackHandler('main_category_nav', () => {
        setActiveCategory(null);
        setActiveSubfolder(null);
        setIsSelectMode(false);
        setSelectedIds(new Set());
        return true;
      }, 30);
    }
  }, [activeCategory]);

  useEffect(() => {
    if (activeNavTab !== 'vault') {
      return registerBackHandler('main_tab_nav', () => {
        setActiveNavTab('vault');
        setActiveCategory(null);
        return true;
      }, 20);
    }
  }, [activeNavTab]);

  const handleCreateFolder = (name: string) => {
    const cat = (activeCategory || (activeTab !== 'all' && activeTab !== 'favorites' ? activeTab : 'photo')) as VaultItemCategory;
    const currentList = customFolders[cat] || ['General'];
    if (!currentList.includes(name)) {
      const updated = [...currentList, name];
      setCustomFolders((prev) => ({ ...prev, [cat]: updated }));
      localStorage.setItem(`vault_subfolders_${cat}`, JSON.stringify(updated));
      showToast(`Carpeta "${name}" creada con éxito`, 'success');
      setActiveSubfolder(name);
      if (activeCategory === null) {
        openCategory(cat);
      }
    }
  };

  const handleRenameFolder = async (oldName: string, newName: string) => {
    if (activeTab === 'all' || activeTab === 'favorites') return;
    if (oldName === 'General') return;
    const cat = activeTab;

    await batchRenameAlbum(cat, oldName, newName);

    // Update in memory items
    setItems((prev) =>
      prev.map((it) => {
        const itemCat = it.record.category;
        const itemAlbum = it.record.album || 'General';
        if (itemCat === cat && itemAlbum === oldName) {
          return { ...it, record: { ...it.record, album: newName } };
        }
        return it;
      })
    );

    // Update custom folders
    const currentList = customFolders[cat] || ['General'];
    const updated = currentList.map((f) => (f === oldName ? newName : f));
    setCustomFolders((prev) => ({ ...prev, [cat]: updated }));
    localStorage.setItem(`vault_subfolders_${cat}`, JSON.stringify(updated));

    if (activeSubfolder === oldName) {
      setActiveSubfolder(newName);
    }

    setFolderToRename(null);
    showToast(`Carpeta renombrada a "${newName}"`, 'success');
  };

  const handleDeleteFolder = async (folderNameToDelete: string) => {
    if (folderNameToDelete === 'General' || activeTab === 'all' || activeTab === 'favorites') return;
    const cat = activeTab;

    // Move any items in this folder back to 'General' in DB and memory
    const itemsInFolder = items.filter(
      (it) => it.record.category === cat && it.record.album === folderNameToDelete
    );

    if (itemsInFolder.length > 0) {
      const ids = itemsInFolder.map((it) => it.id);
      await batchUpdateAlbum(ids, 'General');
      setItems((prev) =>
        prev.map((it) =>
          ids.includes(it.id)
            ? { ...it, record: { ...it.record, album: 'General' } }
            : it
        )
      );
    }

    const currentList = customFolders[cat] || ['General'];
    const updated = currentList.filter((f) => f !== folderNameToDelete);
    setCustomFolders((prev) => ({ ...prev, [cat]: updated.length > 0 ? updated : ['General'] }));
    localStorage.setItem(`vault_subfolders_${cat}`, JSON.stringify(updated.length > 0 ? updated : ['General']));

    if (activeSubfolder === folderNameToDelete) {
      setActiveSubfolder(null);
    }
    showToast(`Carpeta "${folderNameToDelete}" eliminada (sus archivos se pasaron a General)`, 'info');
  };

  const handleMoveSelected = async (targetFolder: string) => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    await batchUpdateAlbum(ids, targetFolder);

    // Update in memory state
    setItems((prev) =>
      prev.map((it) =>
        ids.includes(it.id)
          ? { ...it, record: { ...it.record, album: targetFolder } }
          : it
      )
    );

    showToast(`${ids.length} elemento(s) movidos a "${targetFolder}"`, 'success');
    setSelectedIds(new Set());
    setIsSelectMode(false);
    setIsMoveModalOpen(false);
  };

  // Navigation tab and category state references
  const activeNavTabRef = useRef(activeNavTab);
  activeNavTabRef.current = activeNavTab;
  const activeCategoryRef = useRef(activeCategory);
  activeCategoryRef.current = activeCategory;

  const navigateToTab = (tab: 'vault' | 'import' | 'security' | 'settings') => {
    if (tab !== activeNavTab) {
      window.history.pushState({ vaultNav: tab }, '');
      setActiveNavTab(tab);
    }
  };

  const openCategory = (cat: 'photo' | 'video' | 'audio' | 'app') => {
    window.history.pushState({ vaultCat: cat }, '');
    setActiveCategory(cat);
    setActiveTab(cat);
  };

  // Swipe Gesture Handling - retroceso en pantalla únicamente dentro de vistas hijas
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;

    // Deslizar de izquierda a derecha (swipe horizontal para atrás: deltaX > 65 y dominante)
    if (deltaX > 65 && Math.abs(deltaX) > Math.abs(deltaY) * 1.4) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      triggerBackAction();
    }
  };

  // Total storage calculated from real user files
  const totalStorageBytes = useMemo(() => {
    return items.reduce((acc, it) => acc + (it.record.size || 0), 0);
  }, [items]);

  const storagePercent = useMemo(() => {
    if (items.length === 0) return 0;
    // Percentage calculated on a standard 500MB secure quota partition
    const baseQuota = 500 * 1024 * 1024;
    return Math.min(100, Math.max(1, Math.round((totalStorageBytes / baseQuota) * 100)));
  }, [items.length, totalStorageBytes]);

  // Recent files list matching real user saved files - exactly last 5 records
  const recentList = useMemo(() => {
    return items.slice(0, 5).map((it) => {
      const d = new Date(it.record.timestamp);
      const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      const nameWithoutExt = it.record.name.replace(/\.[^/.]+$/, '');
      const encName = it.record.name.endsWith('.enc') ? it.record.name : `${nameWithoutExt}.enc`;
      const sizeMb = (it.record.size / (1024 * 1024)).toFixed(1).replace('.', ',') + ' MB';
      return {
        id: it.id,
        name: encName,
        size: sizeMb,
        time: `Hoy ${timeStr}`,
        previewUrl: it.record.category === 'photo' || it.record.category === 'video' ? it.blobUrl : null,
        category: it.record.category,
        realItem: it,
      };
    });
  }, [items]);

  // Track last back press timestamp for Double-Back-To-Exit on root
  const lastBackPressTimeRef = useRef<number>(0);

  // Sync refs for state
  useEffect(() => {
    wasSelectingRef.current = isSelectMode || selectedIds.size > 0;
  }, [isSelectMode, selectedIds.size]);

  useEffect(() => {
    wasViewerOpenRef.current = !!activeViewerItem;
  }, [activeViewerItem]);

  useEffect(() => {
    wasCameraOpenRef.current = isCameraOpen;
  }, [isCameraOpen]);

  useEffect(() => {
    wasDeleteModalOpenRef.current = showBatchDeleteModal;
  }, [showBatchDeleteModal]);

  useEffect(() => {
    wasReminderOpenRef.current = importedCountForReminder > 0;
  }, [importedCountForReminder]);

  // History Pushing Effect 1: Subfolder
  const prevSubfolderRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeSubfolder !== null && prevSubfolderRef.current === null) {
      try {
        window.history.pushState({ vaultSubfolder: activeSubfolder }, '');
      } catch {}
    }
    prevSubfolderRef.current = activeSubfolder;
  }, [activeSubfolder]);

  // History Pushing Effect 2: Category
  const prevCategoryRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeCategory !== null && prevCategoryRef.current === null) {
      try {
        window.history.pushState({ vaultCat: activeCategory }, '');
      } catch {}
    }
    prevCategoryRef.current = activeCategory;
  }, [activeCategory]);

  // History Pushing Effect 3: NavTab
  const prevNavTabRef = useRef<string>('vault');
  useEffect(() => {
    if (activeNavTab !== 'vault' && prevNavTabRef.current === 'vault') {
      try {
        window.history.pushState({ vaultNav: activeNavTab }, '');
      } catch {}
    }
    prevNavTabRef.current = activeNavTab;
  }, [activeNavTab]);

  // History Pushing Effect 4: Viewer
  const prevViewerOpenRef = useRef<boolean>(false);
  useEffect(() => {
    if (activeViewerItem !== null && !prevViewerOpenRef.current) {
      try {
        window.history.pushState({ vaultViewer: true }, '');
      } catch {}
    }
    prevViewerOpenRef.current = !!activeViewerItem;
  }, [activeViewerItem]);

  // History Pushing Effect 5: Selection Mode
  const prevSelectingRef = useRef<boolean>(false);
  const isSelectingNow = isSelectMode || selectedIds.size > 0;
  useEffect(() => {
    if (isSelectingNow && !prevSelectingRef.current) {
      try {
        window.history.pushState({ vaultSelecting: true }, '');
      } catch {}
    }
    prevSelectingRef.current = isSelectingNow;
  }, [isSelectingNow]);

  // Initial Root History State
  useEffect(() => {
    try {
      window.history.pushState({ vaultRoot: true }, '');
    } catch {}
  }, []);

  // Process and encrypt incoming files (Photos, Videos, Apps)
  const processFilesForVault = async (files: File[]) => {
    if (!files || files.length === 0) return;

    // Filtrar archivos que ya existan en la bóveda por nombre y tamaño
    const uniqueFiles = files.filter((f) => {
      const alreadyExists = items.some(
        (it) => it.record.name === f.name && it.record.size === f.size
      );
      return !alreadyExists;
    });

    const duplicatesSkipped = files.length - uniqueFiles.length;
    if (duplicatesSkipped > 0) {
      showToast(`${duplicatesSkipped} archivo(s) ya existían en la bóveda y fueron omitidos`, 'alert');
    }

    if (uniqueFiles.length === 0) return;

    const total = uniqueFiles.length;
    showToast(`Iniciando cifrado de ${total} elemento(s)...`, 'info');

    const newRecords: EncryptedVaultItem[] = [];
    const baseTime = Date.now();

    for (let i = 0; i < total; i++) {
      const file = uniqueFiles[i];
      setEncryptingProgress({
        current: i + 1,
        total,
        name: file.name,
      });

      try {
        const buffer = await file.arrayBuffer();
        const encrypted = await encryptBuffer(buffer, masterKey);
        const category = detectCategory(file.name, file.type);

        newRecords.push({
          id: `item_${baseTime}_${i}_${Math.random().toString(36).substring(2, 8)}`,
          timestamp: baseTime + i, // preserve selection order
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          iv: encrypted.iv,
          data: encrypted.data,
          album: activeSubfolder !== null ? activeSubfolder : 'General',
          isFavorite: false,
          category,
          lastModified: file.lastModified || undefined,
        });
      } catch (err) {
        console.error(`Error encrypting file ${file.name}:`, err);
      }
    }

    setEncryptingProgress(null);

    if (newRecords.length > 0) {
      // Save all encrypted items in a single, fast IndexedDB transaction
      await saveEncryptedItems(newRecords);
      await loadVaultItems();

      let photoCount = 0;
      let videoCount = 0;
      let audioCount = 0;
      let appCount = 0;
      newRecords.forEach((r) => {
        if (r.category === 'photo') photoCount++;
        else if (r.category === 'video') videoCount++;
        else if (r.category === 'audio') audioCount++;
        else appCount++;
      });

      const destList: string[] = [];
      if (photoCount > 0) destList.push(`${photoCount} a Fotos`);
      if (videoCount > 0) destList.push(`${videoCount} a Videos`);
      if (audioCount > 0) destList.push(`${audioCount} a Audio`);
      if (appCount > 0) destList.push(`${appCount} a Aplicaciones`);

      showToast(`Guardados en sus carpetas: ${destList.join(', ')}`, 'success');

      // Navigate to destination folder so user immediately sees their files if not already inside a category
      if (activeCategory === null) {
        if (photoCount > 0 && videoCount === 0 && audioCount === 0 && appCount === 0) {
          openCategory('photo');
        } else if (videoCount > 0 && photoCount === 0 && audioCount === 0 && appCount === 0) {
          openCategory('video');
        } else if (audioCount > 0 && photoCount === 0 && videoCount === 0 && appCount === 0) {
          openCategory('audio');
        } else if (appCount > 0 && photoCount === 0 && videoCount === 0 && audioCount === 0) {
          openCategory('app');
        }
      }

      const mediaRecords = newRecords.filter((r) => r.category === 'photo' || r.category === 'video' || r.category === 'audio');
      if (mediaRecords.length > 0) {
        setRecentImportedItems(mediaRecords.map((r) => ({ name: r.name, size: r.size })));

        let handledNatively = false;
        if (isNativeApp()) {
          const itemsToDelete = mediaRecords.map((r) => ({
            filename: r.name,
            size: r.size,
            lastModified: r.lastModified,
            mimeType: r.mimeType,
          }));
          const res = await requestNativeBatchGalleryDeletion(itemsToDelete);
          if (res && res.requested) {
            handledNatively = true;
          }
        }

        if (!handledNatively) {
          setImportedCountForReminder(mediaRecords.length);
        }
      }
    } else {
      showToast('No se pudieron procesar los archivos seleccionados', 'alert');
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      // CRITICAL: Convert FileList to a concrete JavaScript array BEFORE clearing input.value!
      // In Chromium / Android Chrome, setting input.value = '' empties e.target.files in place.
      const filesArray = Array.from(e.target.files);
      e.target.value = '';
      processFilesForVault(filesArray);
    }
  };

  // Drag and Drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArray = Array.from(e.dataTransfer.files);
      processFilesForVault(filesArray);
    }
  };

  // Delete & Favorite
  const handleDeleteItem = async (id: string) => {
    await deleteEncryptedItem(id);
    setItems((prev) => prev.filter((p) => p.id !== id));
    setActiveViewerItem(null);
  };

  const handleToggleFavorite = async (id: string, isFav: boolean) => {
    await updateItemMetadata(id, { isFavorite: isFav });
    setItems((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, record: { ...p.record, isFavorite: isFav } } : p
      )
    );
  };

  // Batch actions
  const toggleSelectItem = (id: string, e?: React.MouseEvent | React.TouchEvent) => {
    if (e && typeof e.stopPropagation === 'function') {
      e.stopPropagation();
    }
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

  const handleSelectAll = () => {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map((p) => p.id)));
    }
  };

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;
    setShowBatchDeleteModal(true);
  };

  const confirmBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsDeletingBatch(true);
    try {
      const idsToDelete = Array.from(selectedIds);
      await deleteMultipleEncryptedItems(idsToDelete);
      showToast(`${idsToDelete.length} elemento(s) eliminado(s) de la bóveda`, 'success');
      setItems((prev) => prev.filter((p) => !selectedIds.has(p.id)));
      setSelectedIds(new Set());
      setIsSelectMode(false);
      setShowBatchDeleteModal(false);
    } catch (err) {
      console.error('Error deleting items:', err);
      showToast('Error al eliminar elementos', 'error');
    } finally {
      setIsDeletingBatch(false);
    }
  };

  const handleCardPointerDown = (id: string) => {
    isLongPressTriggered.current = false;
    longPressTimeoutRef.current = setTimeout(() => {
      isLongPressTriggered.current = true;
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(40);
        } catch {}
      }
      setIsSelectMode(true);
      setSelectedIds((prev) => new Set(prev).add(id));
    }, 400);
  };

  const handleCardPointerUp = () => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  };

  const handleBatchExport = () => {
    if (selectedIds.size === 0) return;
    setShowBatchExportModal(true);
  };

  const confirmBatchExport = async () => {
    if (selectedIds.size === 0 || isExportingBatch) return;
    setIsExportingBatch(true);
    const selected = items.filter((p) => selectedIds.has(p.id));
    const exportedIds: string[] = [];

    try {
      for (const item of selected) {
        const res = await exportVaultItemToDevice({
          blobUrl: item.blobUrl,
          filename: item.record.name || `archivo_${item.id}`,
          mimeType: item.record.mimeType,
          category: item.record.category,
        });
        if (res.success) {
          exportedIds.push(item.id);
        }
      }

      if (exportedIds.length > 0) {
        await deleteMultipleEncryptedItems(exportedIds);
        setItems((prev) => prev.filter((p) => !exportedIds.includes(p.id)));
        showToast(
          `${exportedIds.length} elemento(s) sacado(s) exitosamente a tu galería`,
          'success'
        );
      } else {
        showToast('No se pudieron exportar los elementos al dispositivo', 'error');
      }
      setSelectedIds(new Set());
      setIsSelectMode(false);
      setShowBatchExportModal(false);
    } catch (err) {
      console.error('Error al sacar elementos:', err);
      showToast('Error al procesar la exportación a la galería', 'error');
    } finally {
      setIsExportingBatch(false);
    }
  };

  // Counts by category
  const counts = useMemo(() => {
    let photos = 0;
    let videos = 0;
    let audios = 0;
    let apps = 0;
    let favs = 0;
    let totalBytes = 0;

    items.forEach((item) => {
      totalBytes += item.record.size || 0;
      if (item.record.category === 'photo') photos++;
      else if (item.record.category === 'video') videos++;
      else if (item.record.category === 'audio') audios++;
      else apps++;

      if (item.record.isFavorite) favs++;
    });

    return {
      photos,
      videos,
      audios,
      apps,
      favs,
      totalBytes,
      totalMB: (totalBytes / (1024 * 1024)).toFixed(1),
    };
  }, [items]);

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (activeTab === 'favorites') {
        if (!item.record.isFavorite) return false;
      } else if (activeTab !== 'all') {
        if (item.record.category !== activeTab) return false;

        // Subfolder filter
        if (activeSubfolder !== null) {
          const itemAlbum = item.record.album || 'General';
          if (itemAlbum !== activeSubfolder) return false;
        }
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = (item.record.name || '').toLowerCase().includes(q);
        const matchesDate = new Date(item.record.timestamp).toLocaleDateString().includes(q);
        const matchesAlbum = (item.record.album || '').toLowerCase().includes(q);
        return matchesName || matchesDate || matchesAlbum;
      }

      return true;
    });
  }, [items, activeTab, activeSubfolder, searchQuery]);

  const formatSize = (bytes: number) => {
    if (!bytes) return '0 KB';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col relative select-none pb-28 w-full max-w-full"
    >
      {/* Drag & Drop Visual Overlay */}
      {isDraggingOver && (
        <div className="fixed inset-0 z-50 bg-[#0a121d]/90 backdrop-blur-md border-4 border-dashed border-[#00e5ff] flex flex-col items-center justify-center pointer-events-none transition-all">
          <UploadCloud className="w-16 h-16 text-[#00e5ff] animate-bounce mb-3" />
          <h3 className="text-xl font-bold text-white">Suelta fotos, videos o aplicaciones aquí</h3>
          <p className="text-sm text-cyan-200">Se cifrarán con AES-GCM de 256 bits inmediatamente</p>
        </div>
      )}

      {/* Screen 2: Importar Tab */}
      {activeNavTab === 'import' ? (
        <ImportVaultView
          masterKey={masterKey}
          onImportComplete={async (imported, shouldShowReminder) => {
            await loadVaultItems();
            setActiveNavTab('vault');
            if (imported && imported.length > 0) {
              const photoCount = imported.filter((i) => i.category === 'photo').length;
              const videoCount = imported.filter((i) => i.category === 'video').length;
              const appCount = imported.filter((i) => i.category === 'app').length;
              const audioCount = imported.filter((i) => i.category === 'audio').length;

              const media = imported.filter((i) => i.category === 'photo' || i.category === 'video' || i.category === 'audio');
              if (media.length > 0) {
                setRecentImportedItems(media.map((m) => ({ name: m.name, size: m.size })));
                if (shouldShowReminder) {
                  setImportedCountForReminder(media.length);
                }
              }

              // Redirigir a la carpeta correspondiente para que el usuario vea sus fotos recién guardadas
              if (photoCount > 0 && videoCount === 0 && appCount === 0 && audioCount === 0) {
                setActiveCategory('photo');
                setActiveTab('photo');
              } else if (videoCount > 0 && photoCount === 0 && appCount === 0 && audioCount === 0) {
                setActiveCategory('video');
                setActiveTab('video');
              } else if (audioCount > 0 && photoCount === 0 && videoCount === 0 && appCount === 0) {
                setActiveCategory('audio');
                setActiveTab('audio');
              } else if (appCount > 0 && photoCount === 0 && videoCount === 0 && audioCount === 0) {
                setActiveCategory('app');
                setActiveTab('app');
              } else {
                setActiveCategory(null);
                setActiveTab('all');
              }
              setActiveSubfolder('General');
            }
          }}
          showToast={showToast}
        />
      ) : activeNavTab === 'security' ? (
        /* Screen 3: Seguridad Tab */
        <SecurityVaultView
          onOpenSettings={() => navigateToTab('settings')}
          showToast={showToast}
          sessionPin={sessionPin}
          onLock={onLock}
        />
      ) : activeNavTab === 'settings' ? (
        /* Screen 4: Configuración Tab */
        <SettingsVaultView
          masterKey={masterKey}
          sessionPin={sessionPin}
          onMasterKeyUpdated={onMasterKeyUpdated || (() => {})}
          autoLockMinutes={autoLockMinutes}
          onAutoLockChange={onAutoLockChange || (() => {})}
          lockOnTabSwitch={lockOnTabSwitch}
          onLockOnTabSwitchChange={onLockOnTabSwitchChange || (() => {})}
          onPhotosUpdated={loadVaultItems}
          onResetVault={onResetVault || (() => {})}
          showToast={showToast}
        />
      ) : activeCategory === null ? (
        /* Screen 1: Bóveda Tab Home (Exact Image 1) */
        <div className="max-w-md mx-auto w-full px-4 pb-28 flex-1 flex flex-col animate-in fade-in duration-200">
          {/* Fixed Pinned Header */}
          <header className="fixed top-0 left-0 right-0 z-30 bg-[#090d16]/95 backdrop-blur-xl border-b border-slate-800/80 safe-top-sticky pb-3 px-4 shadow-md shadow-black/40 transition-all">
            <div className="max-w-md mx-auto w-full flex items-center justify-between">
              <div>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white mb-0.5">
                  Mi <span className="text-[#00e5ff]">Bóveda</span>
                </h1>
                <p className="text-[10px] font-semibold text-slate-400 tracking-[0.2em] uppercase">
                  TUS ARCHIVOS, SIEMPRE PROTEGIDOS
                </p>
              </div>
            </div>
          </header>

          {/* Spacer so content starts right below fixed header */}
          <div className="safe-top-header-spacer shrink-0 w-full mb-3" />

          {/* Card: BÓVEDA SELLADA (Real Data) - Compact sleek card */}
          <div className="bg-[#0a121d] border border-slate-800/90 rounded-2xl p-2.5 sm:p-3 mb-2.5 shadow-xl flex items-center justify-between">
            {/* Circular Progress Gauge */}
            <div className="relative w-11 h-11 shrink-0 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-slate-800"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-[#00e5ff] transition-all duration-500"
                  strokeDasharray={`${storagePercent}, 100`}
                  strokeLinecap="round"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <span className="absolute text-[11px] font-bold text-white font-mono">
                {storagePercent}%
              </span>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 px-2.5">
              <p className="text-[9px] font-bold text-[#00e5ff] tracking-widest uppercase">
                BÓVEDA SELLADA
              </p>
              <h3 className="text-xs sm:text-sm font-bold text-white truncate">
                {items.length} {items.length === 1 ? 'archivo cifrado' : 'archivos cifrados'}
              </h3>
              <p className="text-[10px] text-slate-400 truncate">
                {items.length > 0
                  ? `${formatSize(totalStorageBytes)} usados · Hoy ${lastAccessTime}`
                  : `Último acceso: hoy ${lastAccessTime}`}
              </p>
            </div>

            {/* Shield with lock icon */}
            <div className="w-8 h-8 rounded-xl bg-[#00e5ff]/10 border border-[#00e5ff]/30 text-[#00e5ff] flex items-center justify-center shrink-0 shadow-md shadow-cyan-500/10">
              <Shield className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* 4 Category Cards in 2x2 Grid (Compact & Sleek) */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            {/* Fotos */}
            <button
              type="button"
              onClick={() => openCategory('photo')}
              className="bg-[#0a121d] border border-slate-800/80 hover:border-[#00e5ff]/40 rounded-xl p-2.5 flex flex-col justify-between text-left transition-all active:scale-[0.98] group shadow-md cursor-pointer"
            >
              <div className="flex items-center justify-between mb-1.5">
                <ImageIcon className="w-5 h-5 text-[#00e5ff]" />
                <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-[#00e5ff] transition-colors" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-medium">Fotos</p>
                <h4 className="text-lg font-bold text-white mt-0.5 leading-tight">
                  {counts.photos}
                </h4>
              </div>
            </button>

            {/* Videos */}
            <button
              type="button"
              onClick={() => openCategory('video')}
              className="bg-[#0a121d] border border-slate-800/80 hover:border-[#00e5ff]/40 rounded-xl p-2.5 flex flex-col justify-between text-left transition-all active:scale-[0.98] group shadow-md cursor-pointer"
            >
              <div className="flex items-center justify-between mb-1.5">
                <Video className="w-5 h-5 text-[#00e5ff]" />
                <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-[#00e5ff] transition-colors" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-medium">Videos</p>
                <h4 className="text-lg font-bold text-white mt-0.5 leading-tight">
                  {counts.videos}
                </h4>
              </div>
            </button>

            {/* Audio */}
            <button
              type="button"
              onClick={() => openCategory('audio')}
              className="bg-[#0a121d] border border-slate-800/80 hover:border-[#00e5ff]/40 rounded-xl p-2.5 flex flex-col justify-between text-left transition-all active:scale-[0.98] group shadow-md cursor-pointer"
            >
              <div className="flex items-center justify-between mb-1.5">
                <Music className="w-5 h-5 text-[#00e5ff]" />
                <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-[#00e5ff] transition-colors" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-medium">Audio</p>
                <h4 className="text-lg font-bold text-white mt-0.5 leading-tight">
                  {counts.audios}
                </h4>
              </div>
            </button>

            {/* Apps */}
            <button
              type="button"
              onClick={() => openCategory('app')}
              className="bg-[#0a121d] border border-slate-800/80 hover:border-[#00e5ff]/40 rounded-xl p-2.5 flex flex-col justify-between text-left transition-all active:scale-[0.98] group shadow-md cursor-pointer"
            >
              <div className="flex items-center justify-between mb-1.5">
                <LayoutGrid className="w-5 h-5 text-[#00e5ff]" />
                <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-[#00e5ff] transition-colors" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-medium">Apps</p>
                <h4 className="text-lg font-bold text-white mt-0.5 leading-tight">
                  {counts.apps}
                </h4>
              </div>
            </button>
          </div>

          {/* Section: ARCHIVOS RECIENTES (Real User Files) */}
          <div className="mb-4">
            <div className="flex items-center justify-between px-1 mb-2">
              <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase">
                ARCHIVOS RECIENTES
              </h3>
              {recentList.length > 0 && (
                <button
                  type="button"
                  onClick={() => openCategory('photo')}
                  className="text-xs font-bold text-[#00e5ff] hover:underline cursor-pointer"
                >
                  VER TODO
                </button>
              )}
            </div>

            {recentList.length > 0 ? (
              <div className="space-y-1.5">
                {recentList.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (item.realItem) {
                        setActiveViewerItem(item.realItem);
                      }
                    }}
                    className="flex items-center justify-between p-2 rounded-xl bg-[#0a121d]/70 hover:bg-[#0a121d] border border-slate-800/70 hover:border-slate-700 cursor-pointer transition-all active:scale-[0.99] group shadow-sm"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-10 h-10 rounded-lg overflow-hidden relative bg-slate-900 border border-slate-800 shrink-0">
                        {item.previewUrl ? (
                          <img
                            src={item.previewUrl}
                            alt={item.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-slate-800 text-[#00e5ff]">
                            {item.category === 'audio' ? (
                              <Music className="w-4 h-4" />
                            ) : item.category === 'app' ? (
                              <LayoutGrid className="w-4 h-4" />
                            ) : (
                              <FileText className="w-4 h-4" />
                            )}
                          </div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                          <Lock className="w-3 h-3 text-white drop-shadow" />
                        </div>
                      </div>

                      <div className="min-w-0">
                        <h4 className="text-xs font-semibold text-white truncate group-hover:text-[#00e5ff] transition-colors">
                          {item.name}
                        </h4>
                        <p className="text-[10px] text-slate-400">
                          {item.size}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <span className="text-[10px] text-slate-400 font-mono">
                        {item.time}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition-colors" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 px-4 rounded-2xl bg-[#0a121d]/60 border border-dashed border-slate-800 text-center flex flex-col items-center justify-center">
                <div className="w-10 h-10 rounded-xl bg-slate-800/80 text-slate-400 flex items-center justify-center mb-2">
                  <Clock className="w-4 h-4 text-[#00e5ff]" />
                </div>
                <h4 className="text-xs font-bold text-white">No hay archivos recientes</h4>
                <p className="text-[11px] text-slate-400 max-w-xs mt-0.5">
                  Guarda fotos, videos, audios o documentos para verlos cifrados aquí.
                </p>
                <button
                  type="button"
                  onClick={() => navigateToTab('import')}
                  className="mt-3 px-3.5 py-1.5 rounded-full bg-[#00e5ff] hover:bg-[#00cce6] text-black text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow-md shadow-cyan-500/20 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[3]" />
                  <span>Importar a Bóveda</span>
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Detailed Category View */
        <div className="max-w-4xl w-full mx-auto p-4 flex-1 flex flex-col animate-in fade-in duration-200">
          {/* Sticky Header & Filter Controls Container */}
          <header className="sticky top-0 z-30 bg-[#090d16]/95 backdrop-blur-xl border-b border-slate-800/80 px-2 safe-top-sticky pb-2 mb-3 shadow-xl -mx-4 sm:mx-0 sm:px-2">
            <div className="flex items-center justify-between gap-3 mb-2.5">
              <button
                type="button"
                onClick={() => {
                  if (activeSubfolder !== null) {
                    setActiveSubfolder(null);
                  } else {
                    setActiveCategory(null);
                  }
                }}
                className="p-1 -ml-1 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors flex items-center gap-2 active:scale-95 cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5 text-[#00e5ff]" />
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <h1 className="font-bold text-base sm:text-lg text-white">
                      {activeCategory === 'photo'
                        ? 'Fotos'
                        : activeCategory === 'video'
                        ? 'Videos'
                        : activeCategory === 'audio'
                        ? 'Audio'
                        : 'Apps'}
                      {activeSubfolder !== null && (
                        <span className="text-[#00e5ff] font-extrabold ml-1.5">
                          / {activeSubfolder}
                        </span>
                      )}
                    </h1>
                    <span className="text-xs text-slate-400 font-mono">
                      (
                      {activeSubfolder !== null
                        ? filteredItems.length
                        : activeCategory === 'photo'
                        ? counts.photos
                        : activeCategory === 'video'
                        ? counts.videos
                        : activeCategory === 'audio'
                        ? counts.audios
                        : counts.apps}
                      )
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    {activeSubfolder !== null ? 'Volver a Carpetas' : 'Volver a Bóveda'}
                  </p>
                </div>
              </button>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => navigateToTab('settings')}
                  className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-700/80 text-slate-300 hover:text-white transition-colors cursor-pointer"
                  title="Ajustes"
                >
                  <Settings className="w-4 h-4" />
                </button>
                <button
                  onClick={onLock}
                  className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-colors cursor-pointer"
                  title="Bloquear"
                >
                  <Lock className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Search & Layout Bar */}
            <div className="flex items-center gap-2 mb-2.5">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar archivos..."
                  className="w-full bg-[#0a121d] border border-slate-800 rounded-2xl pl-10 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-[#00e5ff] transition-colors"
                />
              </div>

              <div className="flex items-center gap-1 bg-[#0a121d] border border-slate-800 rounded-2xl p-0.5">
                <button
                  type="button"
                  onClick={toggleAspectMode}
                  className={`px-2 py-1.5 rounded-xl transition-all flex items-center gap-1 cursor-pointer text-[10px] font-semibold ${
                    aspectMode === 'real'
                      ? 'bg-[#00e5ff] text-black shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title={aspectMode === 'real' ? 'Proporción y tamaño real (sin recorte)' : 'Cuadrícula cuadrada 1:1 (recortada)'}
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{aspectMode === 'real' ? 'Tamaño real' : '1:1'}</span>
                </button>
                <div className="w-[1px] h-3.5 bg-slate-800 mx-0.5" />
                <button
                  onClick={() => setGridColumns(2)}
                  className={`p-1.5 rounded-xl transition-colors cursor-pointer ${
                    gridColumns === 2 ? 'bg-[#00e5ff] text-black font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                  title="2 Columnas"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setGridColumns(3)}
                  className={`p-1.5 rounded-xl transition-colors cursor-pointer ${
                    gridColumns === 3 ? 'bg-[#00e5ff] text-black font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                  title="3 Columnas"
                >
                  <Grid3X3 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Content Type Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 mb-1.5 no-scrollbar text-xs w-full max-w-full">
              <button
                type="button"
                onClick={() => {
                  setActiveCategory('photo');
                  setActiveTab('photo');
                  setActiveSubfolder(null);
                }}
                className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer ${
                  (activeCategory === 'photo' || activeTab === 'photo') && activeTab !== 'favorites'
                    ? 'bg-[#00e5ff] text-black font-bold shadow-md shadow-cyan-500/25'
                    : 'bg-[#131c2e] text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Fotos ({counts.photos})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveCategory('video');
                  setActiveTab('video');
                  setActiveSubfolder(null);
                }}
                className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer ${
                  activeCategory === 'video' || activeTab === 'video'
                    ? 'bg-[#00e5ff] text-black font-bold shadow-md shadow-cyan-500/25'
                    : 'bg-[#131c2e] text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                <Film className="w-3.5 h-3.5" />
                <span>Videos ({counts.videos})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveCategory('audio');
                  setActiveTab('audio');
                  setActiveSubfolder(null);
                }}
                className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer ${
                  activeCategory === 'audio' || activeTab === 'audio'
                    ? 'bg-[#00e5ff] text-black font-bold shadow-md shadow-cyan-500/25'
                    : 'bg-[#131c2e] text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                <Music className="w-3.5 h-3.5" />
                <span>Audio ({counts.audios})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveCategory('app');
                  setActiveTab('app');
                  setActiveSubfolder(null);
                }}
                className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer ${
                  activeCategory === 'app' || activeTab === 'app'
                    ? 'bg-[#00e5ff] text-black font-bold shadow-md shadow-cyan-500/25'
                    : 'bg-[#131c2e] text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                <Folder className="w-3.5 h-3.5" />
                <span>Apps ({counts.apps})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('favorites');
                  setActiveSubfolder(null);
                }}
                className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer ${
                  activeTab === 'favorites'
                    ? 'bg-rose-600 text-white font-bold shadow-md shadow-rose-600/25'
                    : 'bg-[#131c2e] text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                <Heart className="w-3.5 h-3.5" />
                <span>Favoritos ({counts.favs})</span>
              </button>
            </div>
          </header>

        {/* Items Grid & Carpetas View */}
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-500">
            <Cpu className="w-8 h-8 animate-spin text-blue-500 mb-3" />
            <p className="text-xs">Descifrando datos protegidos de Caja fuerte...</p>
          </div>
        ) : (
          /* VISTA DE CONTENIDO DE LA SECCIÓN */
          <div className="space-y-4">
            {/* Carpetas horizontales tipo chips/pills para acceso inmediato */}
            {!searchQuery && (
              <div className="mb-2">
                <div className="flex items-center justify-between mb-1.5 px-1">
                  <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase flex items-center gap-1.5">
                    <Folder className="w-3.5 h-3.5 text-[#00e5ff]" />
                    <span>Carpetas de {activeTab === 'photo' ? 'Fotos' : activeTab === 'video' ? 'Videos' : activeTab === 'audio' ? 'Audio' : activeTab === 'app' ? 'Apps' : 'Favoritos'}</span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsCreateFolderOpen(true)}
                    className="text-xs font-bold text-[#00e5ff] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    <span>+ Nueva Carpeta</span>
                  </button>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-1.5 no-scrollbar text-xs">
                  <button
                    type="button"
                    onClick={() => setActiveSubfolder(null)}
                    className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer ${
                      activeSubfolder === null
                        ? 'bg-[#00e5ff] text-black font-bold shadow-md shadow-cyan-500/25'
                        : 'bg-[#131c2e] text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Todas</span>
                  </button>

                  {activeCategoryFolders.map((fName) => {
                    const folderItems = items.filter((it) => {
                      const matchesCat =
                        activeTab === 'favorites'
                          ? it.record.isFavorite
                          : activeTab === 'all'
                          ? true
                          : it.record.category === activeTab;
                      const itemAlbum = it.record.album || 'General';
                      return matchesCat && itemAlbum === fName;
                    });
                    const count = folderItems.length;
                    const isSelected = activeSubfolder === fName;

                    return (
                      <div
                        key={fName}
                        className={`flex items-center rounded-xl overflow-hidden shrink-0 border transition-all ${
                          isSelected
                            ? 'bg-[#00e5ff] text-black border-[#00e5ff] font-bold shadow-md shadow-cyan-500/25'
                            : 'bg-[#131c2e] text-slate-300 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setActiveSubfolder(fName)}
                          className="px-3 py-1.5 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                        >
                          <Folder className="w-3.5 h-3.5" />
                          <span>{fName} ({count})</span>
                        </button>
                        {fName !== 'General' && (
                          <div className="flex items-center pr-1 gap-0.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setFolderToRename(fName);
                              }}
                              className="p-1 hover:opacity-80 rounded"
                              title="Renombrar"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteFolder(fName);
                              }}
                              className="p-1 hover:text-rose-600 rounded"
                              title="Eliminar"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Grid de Archivos Cifrados - SIEMPRE VISIBLE */}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1 mb-1">
                <span className="text-xs font-semibold text-slate-400">
                  {activeSubfolder ? `Carpeta: ${activeSubfolder}` : 'Todos los archivos'}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {filteredItems.length} {filteredItems.length === 1 ? 'archivo' : 'archivos'}
                </span>
              </div>

                {filteredItems.length === 0 ? (
          <div className="text-center py-16 px-4 bg-[#131c2e]/40 border border-dashed border-slate-800 rounded-3xl">
            <div className="w-16 h-16 bg-slate-800/60 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-500">
              {activeTab === 'photo' ? (
                <ImageIcon className="w-8 h-8 text-blue-400" />
              ) : activeTab === 'audio' ? (
                <Music className="w-8 h-8 text-amber-400" />
              ) : activeTab === 'video' ? (
                <Film className="w-8 h-8 text-purple-400" />
              ) : activeTab === 'app' ? (
                <Folder className="w-8 h-8 text-emerald-400" />
              ) : (
                <FolderArchive className="w-8 h-8 text-blue-400" />
              )}
            </div>
            <h3 className="text-base font-semibold text-slate-200 mb-1">
              {searchQuery
                ? 'No se encontraron resultados'
                : activeTab === 'photo'
                ? 'No hay imágenes en Caja fuerte'
                : activeTab === 'audio'
                ? 'No hay audios en Caja fuerte'
                : activeTab === 'video'
                ? 'No hay videos en Caja fuerte'
                : activeTab === 'app'
                ? 'No hay archivos en Caja fuerte'
                : 'Sin favoritos aún'}
            </h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mb-6">
              {activeTab === 'photo'
                ? 'Añade fotos para mantenerlas cifradas de forma privada en tu teléfono.'
                : activeTab === 'audio'
                ? 'Añade audios o notas de voz para protegerlos en tu Caja fuerte.'
                : activeTab === 'video'
                ? 'Guarda tus videos privados para reproducirlos de forma segura en tu teléfono.'
                : activeTab === 'app'
                ? 'Guarda aplicaciones (.apk) o documentos cifrados localmente.'
                : 'Toca el corazón en cualquier elemento para destacarlo aquí.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              {(activeTab === 'photo' || activeTab === 'all') && (
                <button
                  type="button"
                  onClick={() => mediaInputRef.current?.click()}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-blue-600/30 transition-all flex items-center gap-2 active:scale-95"
                >
                  <ImagePlus className="w-4 h-4" />
                  <span>Añadir Fotos</span>
                </button>
              )}
              {activeTab === 'audio' && (
                <button
                  type="button"
                  onClick={() => audioInputRef.current?.click()}
                  className="px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-amber-600/30 transition-all flex items-center gap-2 active:scale-95"
                >
                  <Music className="w-4 h-4" />
                  <span>Añadir Audio</span>
                </button>
              )}
              {activeTab === 'video' && (
                <button
                  type="button"
                  onClick={() => mediaInputRef.current?.click()}
                  className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-purple-600/30 transition-all flex items-center gap-2 active:scale-95"
                >
                  <Film className="w-4 h-4" />
                  <span>Añadir Videos</span>
                </button>
              )}
              {activeTab === 'app' && (
                <button
                  type="button"
                  onClick={() => appInputRef.current?.click()}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-emerald-600/30 transition-all flex items-center gap-2 active:scale-95"
                >
                  <Folder className="w-4 h-4" />
                  <span>Añadir Archivo (.apk)</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsCameraOpen(true)}
                className="px-4 py-2.5 bg-[#131c2e] hover:bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 transition-all flex items-center gap-2 active:scale-95"
              >
                <Camera className="w-4 h-4 text-blue-400" />
                <span>Usar Cámara</span>
              </button>
            </div>
          </div>
        ) : (
          <div
            className={`grid gap-2.5 sm:gap-3 ${
              gridColumns === 2
                ? 'grid-cols-2'
                : gridColumns === 3
                ? 'grid-cols-3'
                : 'grid-cols-4'
            }`}
          >
            {filteredItems.map((item) => {
              const isSelected = selectedIds.has(item.id);
              const isPhoto = item.record.category === 'photo';
              const isVideo = item.record.category === 'video';
              const isAudio = item.record.category === 'audio';
              const isApp = item.record.category === 'app';

              return (
                <div
                  key={item.id}
                  onPointerDown={() => handleCardPointerDown(item.id)}
                  onPointerUp={handleCardPointerUp}
                  onPointerCancel={handleCardPointerUp}
                  onClick={() => {
                    if (isLongPressTriggered.current) {
                      isLongPressTriggered.current = false;
                      return;
                    }
                    if (isSelectMode) {
                      toggleSelectItem(item.id, {} as React.MouseEvent);
                    } else {
                      setActiveViewerItem(item);
                    }
                  }}
                  className={`group relative aspect-square rounded-2xl overflow-hidden bg-slate-900 border cursor-pointer transition-all duration-200 select-none ${
                    isSelected
                      ? 'border-blue-500 ring-2 ring-blue-500/50 scale-[0.98]'
                      : 'border-slate-800/80 hover:border-slate-700 active:scale-95'
                  }`}
                >
                  {/* Photo Display */}
                  {isPhoto && (
                    <img
                      src={item.blobUrl}
                      alt={item.record.name}
                      className={`w-full h-full ${
                        aspectMode === 'real' ? 'object-contain p-0.5' : 'object-cover'
                      } transition-transform duration-300 group-hover:scale-105 pointer-events-none`}
                      loading="lazy"
                    />
                  )}

                  {/* Video Thumbnail Display */}
                  {isVideo && (
                    <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center relative pointer-events-none">
                      <video
                        src={item.blobUrl}
                        preload="metadata"
                        className={`w-full h-full ${
                          aspectMode === 'real' ? 'object-contain p-0.5' : 'object-cover'
                        } opacity-75 group-hover:opacity-95 transition-opacity`}
                      />
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center text-white group-hover:scale-110 transition-transform">
                          <Play className="w-4 h-4 fill-white ml-0.5" />
                        </div>
                      </div>
                      <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-md text-[10px] font-mono text-purple-300 flex items-center gap-1">
                        <Film className="w-3 h-3" />
                        <span>VIDEO</span>
                      </div>
                    </div>
                  )}

                  {/* Audio Card Display */}
                  {isAudio && (
                    <div className="w-full h-full bg-gradient-to-br from-[#1d170e] to-slate-950 p-3.5 flex flex-col justify-between items-center text-center pointer-events-none">
                      <div className="w-full flex items-center justify-between text-[10px] text-amber-400">
                        <span className="font-mono font-bold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                          {item.record.name.split('.').pop()?.toUpperCase() || 'AUDIO'}
                        </span>
                        <span className="text-slate-400">{formatSize(item.record.size)}</span>
                      </div>

                      <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform shadow-md shadow-amber-500/10">
                        <Music className="w-6 h-6 text-amber-400" />
                      </div>

                      <div className="w-full text-center">
                        <p className="text-xs font-semibold text-slate-200 truncate w-full">
                          {item.record.name}
                        </p>
                        <p className="text-[10px] text-amber-400/80">Audio seguro</p>
                      </div>
                    </div>
                  )}

                  {/* App / File Card Display */}
                  {isApp && (
                    <div className="w-full h-full bg-gradient-to-br from-[#131c2e] to-slate-950 p-3.5 flex flex-col justify-between items-center text-center pointer-events-none">
                      <div className="w-full flex items-center justify-between text-[10px] text-emerald-400">
                        <span className="font-mono font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                          {item.record.name.split('.').pop()?.toUpperCase() || 'FILE'}
                        </span>
                        <span className="text-slate-400">{formatSize(item.record.size)}</span>
                      </div>

                      <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                        {item.record.name.endsWith('.apk') ? (
                          <Smartphone className="w-6 h-6" />
                        ) : (
                          <Folder className="w-6 h-6" />
                        )}
                      </div>

                      <div className="w-full text-center">
                        <p className="text-xs font-semibold text-slate-200 truncate w-full">
                          {item.record.name}
                        </p>
                        <p className="text-[10px] text-slate-500">Cifrado local</p>
                      </div>
                    </div>
                  )}

                  {/* Gradient overlay for photos/videos */}
                  {(isPhoto || isVideo) && (
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                  )}

                  {/* Top-right Favorite indicator */}
                  {item.record.isFavorite && (
                    <div className="absolute top-2 right-2 p-1 bg-black/60 backdrop-blur-md rounded-lg text-rose-500 z-10 pointer-events-none">
                      <Heart className="w-3.5 h-3.5 fill-rose-500" />
                    </div>
                  )}

                  {/* Selection indicator - circular cyan checkmark */}
                  {isSelectMode && (
                    <div className="absolute top-2 left-2 z-20 pointer-events-none">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                          isSelected
                            ? 'bg-[#00e5ff] text-black shadow-md border-2 border-white'
                            : 'bg-black/60 border border-white/60 text-transparent'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </div>
                    </div>
                  )}

                  {/* Bottom quick metadata */}
                  {(isPhoto || isVideo) && (
                    <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[10px] text-white/90 opacity-0 group-hover:opacity-100 transition-opacity drop-shadow z-10 pointer-events-none">
                      <span className="truncate max-w-[120px]">{item.record.name}</span>
                      <span>{formatSize(item.record.size)}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Floating Bottom Navigation Bar for Selection Mode */}
      {isSelectMode || selectedIds.size > 0 ? (
        <div className="fixed bottom-3 sm:bottom-4 left-0 right-0 z-50 px-2 sm:px-4 flex justify-center pointer-events-none">
          <nav className="pointer-events-auto w-full max-w-lg bg-[#0a121d]/95 backdrop-blur-2xl border border-slate-700/80 rounded-2xl sm:rounded-full p-1.5 sm:p-2 flex items-center justify-between shadow-2xl shadow-black/80 gap-1 sm:gap-1.5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden touch-pan-x">
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsSelectMode(false);
                  setSelectedIds(new Set());
                }}
                className="px-2.5 py-1.5 rounded-xl bg-[#162032] border border-slate-700 text-slate-100 hover:bg-slate-700 text-xs font-semibold flex items-center gap-1 transition-all active:scale-95 cursor-pointer shrink-0"
                title="Listo / Salir de selección"
              >
                <X className="w-3.5 h-3.5 text-slate-300" />
                <span>Listo</span>
              </button>
              <button
                type="button"
                onClick={handleSelectAll}
                className="px-1.5 py-1 text-xs text-[#00e5ff] hover:underline font-bold transition-all cursor-pointer shrink-0"
              >
                {selectedIds.size === filteredItems.length ? 'Ninguno' : 'Todos'}
              </button>
            </div>

            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              {activeTab !== 'all' && activeTab !== 'favorites' && (
                <button
                  type="button"
                  onClick={() => setIsMoveModalOpen(true)}
                  disabled={selectedIds.size === 0}
                  className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-[#1e293b] border border-slate-700 hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shrink-0"
                  title="Mover seleccionados a otra carpeta"
                >
                  <Folder className="w-3.5 h-3.5 text-[#00e5ff]" />
                  <span>Mover a...</span>
                  <span className="text-[11px] font-mono font-bold text-cyan-300">({selectedIds.size})</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleBatchExport}
                disabled={selectedIds.size === 0}
                className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-[#00e5ff] hover:bg-[#00cce6] disabled:opacity-40 disabled:pointer-events-none text-black text-xs font-bold shadow-md shadow-cyan-500/30 flex items-center gap-1 transition-all active:scale-95 cursor-pointer shrink-0"
                title="Sacar de la bóveda y restaurar a tu celular"
              >
                <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Sacar ({selectedIds.size})</span>
              </button>

              <button
                type="button"
                onClick={handleBatchDelete}
                disabled={selectedIds.size === 0}
                className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white disabled:bg-rose-950/60 disabled:border disabled:border-rose-800/40 disabled:text-rose-400/50 disabled:opacity-40 disabled:pointer-events-none text-xs font-bold shadow-md shadow-rose-600/30 flex items-center gap-1 transition-all active:scale-95 cursor-pointer shrink-0"
                title="Eliminar de la bóveda"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Eliminar ({selectedIds.size})</span>
              </button>
            </div>
          </nav>
        </div>
      ) : (
        <nav className="fixed safe-bottom-nav left-2 right-2 z-40 max-w-[390px] mx-auto bg-[#0a121d]/90 backdrop-blur-2xl border border-slate-800/90 rounded-full py-2 px-3 sm:px-4 flex items-center justify-between shadow-2xl shadow-black/80 select-none">
          <button
            type="button"
            onClick={() => {
              setActiveCategory(null);
              navigateToTab('vault');
            }}
            className={`flex flex-col items-center gap-1 transition-all cursor-pointer ${
              activeNavTab === 'vault' ? 'text-[#00e5ff]' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[10px] sm:text-[11px] font-medium">Mi Bóveda</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveCategory(null);
              navigateToTab('import');
            }}
            className={`flex flex-col items-center gap-1 transition-all cursor-pointer ${
              activeNavTab === 'import' ? 'text-[#00e5ff]' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Plus className="w-5 h-5 stroke-[2.5]" />
            <span className="text-[10px] sm:text-[11px] font-medium">Importar</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveCategory(null);
              navigateToTab('security');
            }}
            className={`flex flex-col items-center gap-1 transition-all cursor-pointer ${
              activeNavTab === 'security' ? 'text-[#00e5ff]' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shield className="w-5 h-5" />
            <span className="text-[10px] sm:text-[11px] font-medium">Seguridad</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveCategory(null);
              navigateToTab('settings');
            }}
            className={`flex flex-col items-center gap-1 transition-all cursor-pointer ${
              activeNavTab === 'settings' ? 'text-[#00e5ff]' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Settings className="w-5 h-5" />
            <span className="text-[10px] sm:text-[11px] font-medium">Configuración</span>
          </button>
        </nav>
      )}

        {/* Hidden File Inputs */}
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onClick={() => {
            (window as any).__isPickingFile = true;
            (window as any).__filePickingStartTime = Date.now();
          }}
          onChange={handleFileInputChange}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          multiple
          className="hidden"
          onClick={() => {
            (window as any).__isPickingFile = true;
            (window as any).__filePickingStartTime = Date.now();
          }}
          onChange={handleFileInputChange}
        />
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
          onChange={handleFileInputChange}
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
          onChange={handleFileInputChange}
        />
        <input
          ref={appInputRef}
          type="file"
          accept=".apk,.zip,.rar,.exe,.dmg,.pkg,.ipa,.bin,.tar,.gz,*/*"
          multiple
          className="hidden"
          onClick={() => {
            (window as any).__isPickingFile = true;
            (window as any).__filePickingStartTime = Date.now();
          }}
          onChange={handleFileInputChange}
        />

      {/* Botón flotante (+) estilo WhatsApp exclusivo dentro de cada carpeta */}
      {activeNavTab === 'vault' && activeCategory !== null && !isSelectMode && selectedIds.size === 0 && (
        <>
          {/* Telón oscuro al desplegar opciones */}
          {isWhatsAppFabOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-200"
              onClick={() => setIsWhatsAppFabOpen(false)}
            />
          )}

          {/* Opciones desplegadas sobre el botón según la carpeta actual */}
          {isWhatsAppFabOpen && (
            <div className="fixed safe-bottom-fab-menu right-5 sm:right-6 z-50 flex flex-col items-end gap-3 select-none animate-in slide-in-from-bottom-4 fade-in duration-200">
              {/* Opción 1: Nueva Carpeta */}
              <button
                type="button"
                onClick={() => {
                  setIsWhatsAppFabOpen(false);
                  setIsCreateFolderOpen(true);
                }}
                className="flex items-center gap-3 group cursor-pointer active:scale-95 transition-transform"
              >
                <span className="px-3.5 py-1.5 rounded-full bg-[#090d16]/95 text-white text-xs font-semibold shadow-lg shadow-black/60 border border-cyan-500/30 whitespace-nowrap backdrop-blur-md">
                  Nueva carpeta
                </span>
                <div className="w-12 h-12 rounded-full bg-[#00e5ff] hover:bg-[#00cce6] text-black flex items-center justify-center shadow-lg shadow-cyan-500/40 border border-cyan-200/50 transition-all">
                  <FolderPlus className="w-5 h-5 stroke-[2.4]" />
                </div>
              </button>

              {/* Opción 2: Abrir Cámara / Grabar según la carpeta */}
              <button
                type="button"
                onClick={() => {
                  setIsWhatsAppFabOpen(false);
                  setCameraInitialMode(activeCategory === 'video' ? 'video' : 'photo');
                  setIsCameraOpen(true);
                }}
                className="flex items-center gap-3 group cursor-pointer active:scale-95 transition-transform"
              >
                <span className="px-3.5 py-1.5 rounded-full bg-[#090d16]/95 text-white text-xs font-semibold shadow-lg shadow-black/60 border border-cyan-500/30 whitespace-nowrap backdrop-blur-md">
                  {activeCategory === 'video' ? 'Grabar video' : 'Abrir cámara'}
                </span>
                <div className="w-12 h-12 rounded-full bg-[#0a1424] hover:bg-[#00e5ff] text-[#00e5ff] hover:text-black flex items-center justify-center shadow-lg shadow-cyan-500/20 border border-cyan-400/50 transition-all">
                  <Camera className="w-5 h-5 stroke-[2.4]" />
                </div>
              </button>

              {/* Opción contextual según la categoría de la carpeta */}
              {activeCategory === 'photo' && (
                <button
                  type="button"
                  onClick={() => {
                    setIsWhatsAppFabOpen(false);
                    triggerPicker(photoInputRef);
                  }}
                  className="flex items-center gap-3 group cursor-pointer active:scale-95 transition-transform"
                >
                  <span className="px-3.5 py-1.5 rounded-full bg-[#090d16]/95 text-white text-xs font-semibold shadow-lg shadow-black/60 border border-cyan-500/30 whitespace-nowrap backdrop-blur-md">
                    Añadir fotos
                  </span>
                  <div className="w-12 h-12 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/30 border border-blue-400/40 transition-all">
                    <ImageIcon className="w-5 h-5 stroke-[2.4]" />
                  </div>
                </button>
              )}

              {activeCategory === 'video' && (
                <button
                  type="button"
                  onClick={() => {
                    setIsWhatsAppFabOpen(false);
                    triggerPicker(videoInputRef);
                  }}
                  className="flex items-center gap-3 group cursor-pointer active:scale-95 transition-transform"
                >
                  <span className="px-3.5 py-1.5 rounded-full bg-[#090d16]/95 text-white text-xs font-semibold shadow-lg shadow-black/60 border border-cyan-500/30 whitespace-nowrap backdrop-blur-md">
                    Añadir videos
                  </span>
                  <div className="w-12 h-12 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-lg shadow-indigo-500/30 border border-indigo-400/40 transition-all">
                    <Film className="w-5 h-5 stroke-[2.4]" />
                  </div>
                </button>
              )}

              {activeCategory === 'audio' && (
                <button
                  type="button"
                  onClick={() => {
                    setIsWhatsAppFabOpen(false);
                    triggerPicker(audioInputRef);
                  }}
                  className="flex items-center gap-3 group cursor-pointer active:scale-95 transition-transform"
                >
                  <span className="px-3.5 py-1.5 rounded-full bg-[#090d16]/95 text-white text-xs font-semibold shadow-lg border border-cyan-500/30 whitespace-nowrap backdrop-blur-md">
                    Añadir música
                  </span>
                  <div className="w-12 h-12 rounded-full bg-amber-500 hover:bg-amber-400 text-black flex items-center justify-center shadow-lg shadow-amber-500/30 border border-amber-300/40 transition-all">
                    <Music className="w-5 h-5 stroke-[2.4]" />
                  </div>
                </button>
              )}

              {activeCategory === 'app' && (
                <button
                  type="button"
                  onClick={() => {
                    setIsWhatsAppFabOpen(false);
                    triggerPicker(appInputRef);
                  }}
                  className="flex items-center gap-3 group cursor-pointer active:scale-95 transition-transform"
                >
                  <span className="px-3.5 py-1.5 rounded-full bg-[#090d16]/95 text-white text-xs font-semibold shadow-lg border border-cyan-500/30 whitespace-nowrap backdrop-blur-md">
                    Añadir aplicación / archivos
                  </span>
                  <div className="w-12 h-12 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black flex items-center justify-center shadow-lg shadow-emerald-500/30 border border-emerald-300/40 transition-all">
                    <Package className="w-5 h-5 stroke-[2.4]" />
                  </div>
                </button>
              )}

              {/* Botón para añadir archivos de cualquier tipo a la carpeta */}
              <button
                type="button"
                onClick={() => {
                  setIsWhatsAppFabOpen(false);
                  triggerPicker(appInputRef);
                }}
                className="flex items-center gap-3 group cursor-pointer active:scale-95 transition-transform"
              >
                <span className="px-3.5 py-1.5 rounded-full bg-[#090d16]/95 text-white text-xs font-semibold shadow-lg border border-cyan-500/30 whitespace-nowrap backdrop-blur-md">
                  {activeCategory === 'app' ? 'Otros documentos' : 'Añadir archivos'}
                </span>
                <div className="w-12 h-12 rounded-full bg-slate-800 hover:bg-slate-700 text-[#00e5ff] flex items-center justify-center shadow-lg shadow-black/40 border border-slate-700 transition-all">
                  <FileText className="w-5 h-5 stroke-[2.2]" />
                </div>
              </button>
            </div>
          )}

          {/* Botón flotante circular con los colores de la aplicación (cyan #00e5ff) */}
          <div className="fixed safe-bottom-fab right-5 sm:right-6 z-40 select-none">
            <button
              type="button"
              onClick={() => setIsWhatsAppFabOpen((prev) => !prev)}
              className="w-14 h-14 rounded-full bg-[#00e5ff] hover:bg-[#00cce6] active:scale-90 text-black flex items-center justify-center shadow-2xl shadow-cyan-500/50 border-2 border-cyan-200/60 transition-all duration-300 cursor-pointer group"
              title={isWhatsAppFabOpen ? 'Cerrar opciones' : 'Añadir a esta carpeta'}
              aria-label="Añadir a esta carpeta"
            >
              <Plus
                className={`w-7 h-7 text-black stroke-[3] transition-transform duration-300 ease-out ${
                  isWhatsAppFabOpen ? 'rotate-45' : 'rotate-0 group-hover:rotate-90'
                }`}
              />
            </button>
          </div>
        </>
      )}

      {/* Lightbox / Video / App Detail Modal */}
      {activeViewerItem && (
        <PhotoViewerModal
          currentItem={activeViewerItem}
          allItems={filteredItems}
          onClose={() => setActiveViewerItem(null)}
          onDelete={handleDeleteItem}
          onToggleFavorite={handleToggleFavorite}
          showToast={showToast}
        />
      )}

      {/* Camera & Video Recorder Modal */}
      <CameraCaptureModal
        isOpen={isCameraOpen}
        initialMode={cameraInitialMode}
        onClose={() => setIsCameraOpen(false)}
        onMediaCaptured={async (buffer, mimeType, filename) => {
          const encrypted = await encryptBuffer(buffer, masterKey);
          const category = detectCategory(filename, mimeType);
          const newRecord: EncryptedVaultItem = {
            id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            timestamp: Date.now(),
            name: filename,
            mimeType,
            size: buffer.byteLength,
            iv: encrypted.iv,
            data: encrypted.data,
            album: activeSubfolder !== null ? activeSubfolder : 'General',
            isFavorite: false,
            category,
          };
          await saveEncryptedItem(newRecord);
          await loadVaultItems();
          showToast(`Guardado en la carpeta ${category === 'photo' ? 'Fotos' : 'Videos'}`, 'success');
          setActiveTab(category === 'photo' ? 'photo' : 'video');
        }}
        showToast={showToast}
      />

      {/* Delete from phone gallery reminder modal */}
      <DeleteGalleryReminderModal
        isOpen={importedCountForReminder > 0}
        count={importedCountForReminder}
        recentItems={recentImportedItems}
        onOpenVaultCamera={() => setIsCameraOpen(true)}
        onClose={() => setImportedCountForReminder(0)}
      />

      {/* Batch Encryption Progress Overlay */}
      {encryptingProgress && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none">
          <div className="w-full max-w-sm bg-[#131c2e] border border-indigo-500/30 rounded-3xl p-6 shadow-2xl text-center space-y-4 animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-indigo-600/20 border border-indigo-500/40 text-indigo-400 flex items-center justify-center animate-pulse">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">
                Cifrando con AES-256 ({encryptingProgress.current} de {encryptingProgress.total})
              </h4>
              <p className="text-xs text-slate-400 truncate max-w-[260px] mx-auto mt-1 font-mono">
                {encryptingProgress.name}
              </p>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700/50">
              <div
                className="bg-gradient-to-r from-indigo-500 to-emerald-400 h-full transition-all duration-200"
                style={{
                  width: `${Math.round((encryptingProgress.current / encryptingProgress.total) * 100)}%`,
                }}
              />
            </div>
            <p className="text-[11px] text-slate-400">
              Cifrando y guardando localmente en tu teléfono...
            </p>
          </div>
        </div>
      )}

      {/* Batch Export / Sacar Confirmation Modal */}
      {showBatchExportModal && (
        <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 select-none">
          <div className="w-full max-w-xs bg-[#131c2e] border border-cyan-500/30 rounded-3xl p-6 shadow-2xl text-center space-y-4 animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 bg-cyan-500/10 border border-cyan-500/20 rounded-2xl flex items-center justify-center mx-auto text-[#00e5ff]">
              <Download className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <h4 className="text-base font-bold text-white mb-1">
                ¿Sacar {selectedIds.size} elemento{selectedIds.size > 1 ? 's' : ''} a tu galería?
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Los archivos se restaurarán a la galería y almacenamiento de tu teléfono, y se retirarán de la bóveda privada.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowBatchExportModal(false)}
                disabled={isExportingBatch}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmBatchExport}
                disabled={isExportingBatch}
                className="flex-1 py-2.5 bg-[#00e5ff] hover:bg-[#00cce6] text-black text-xs font-bold rounded-xl shadow-lg shadow-cyan-500/30 transition-colors flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer disabled:opacity-50"
              >
                <Download className={`w-4 h-4 stroke-[2.5] ${isExportingBatch ? 'animate-bounce' : ''}`} />
                <span>{isExportingBatch ? 'Sacando...' : `Sacar (${selectedIds.size})`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Delete Confirmation Modal */}
      {showBatchDeleteModal && (
        <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 select-none">
          <div className="w-full max-w-xs bg-[#131c2e] border border-rose-500/30 rounded-3xl p-6 shadow-2xl text-center space-y-4 animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center justify-center mx-auto text-rose-400">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-base font-bold text-white mb-1">
                ¿Eliminar {selectedIds.size} elemento{selectedIds.size > 1 ? 's' : ''}?
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Esta acción es irreversible y eliminará permanentemente los archivos seleccionados de tu bóveda cifrada.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowBatchDeleteModal(false)}
                disabled={isDeletingBatch}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmBatchDelete}
                disabled={isDeletingBatch}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-rose-600/30 transition-colors flex items-center justify-center gap-1.5 active:scale-95"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeletingBatch ? 'Eliminando...' : `Eliminar (${selectedIds.size})`}</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Create Subfolder Modal */}
      <CreateFolderModal
        isOpen={isCreateFolderOpen}
        onClose={() => setIsCreateFolderOpen(false)}
        category={activeTab === 'all' || activeTab === 'favorites' ? 'photo' : activeTab}
        existingFolders={activeCategoryFolders}
        onCreate={handleCreateFolder}
      />

      {/* Move Selected Items to Folder Modal */}
      <MoveToFolderModal
        isOpen={isMoveModalOpen}
        onClose={() => setIsMoveModalOpen(false)}
        selectedCount={selectedIds.size}
        category={activeTab === 'all' || activeTab === 'favorites' ? 'photo' : activeTab}
        currentFolder={activeSubfolder !== null ? activeSubfolder : 'General'}
        folders={activeCategoryFolders}
        onMove={handleMoveSelected}
        onOpenCreateFolder={() => setIsCreateFolderOpen(true)}
      />

      {/* Rename Subfolder Modal */}
      {folderToRename && (
        <RenameFolderModal
          isOpen={!!folderToRename}
          onClose={() => setFolderToRename(null)}
          category={activeTab === 'all' || activeTab === 'favorites' ? 'photo' : activeTab}
          currentFolderName={folderToRename}
          existingFolders={activeCategoryFolders}
          onRename={handleRenameFolder}
        />
      )}
    </div>
  );
};
