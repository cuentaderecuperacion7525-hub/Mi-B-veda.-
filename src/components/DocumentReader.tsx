import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  FileText,
  Download,
  AlertCircle,
  Loader2,
  FileSpreadsheet,
  FileCode,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Copy,
  Check,
  Package,
  Layers,
  ArrowLeft,
  Info,
} from 'lucide-react';
import { DecryptedVaultItem } from './PhotoViewerModal';
import { formatSize as formatBytes } from '../utils/formatUtils';
import * as pdfjsLib from 'pdfjs-dist';

// Use embedded bundled worker via relative/inline path or data/blob or workerSrc
// pdfjs-dist 3.x ships with pdf.worker.min.js
// Configure workerSrc to use the local bundled pdfjs worker without external CDN
try {
  // @ts-ignore
  if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
    // @ts-ignore
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.js',
      import.meta.url
    ).toString();
  }
} catch {
  // Fallback will run synchronously if worker fails
}

interface DocumentReaderProps {
  activeItem: DecryptedVaultItem;
  allItems?: DecryptedVaultItem[];
  currentIndex?: number;
  onClose?: () => void;
  onExport: () => void;
  isExporting: boolean;
  showToast: (msg: string, type?: 'info' | 'success' | 'alert' | 'error') => void;
  onShowDetails?: () => void;
}

export const DocumentReader: React.FC<DocumentReaderProps> = ({
  activeItem,
  allItems = [],
  currentIndex = 0,
  onClose,
  onExport,
  isExporting,
  showToast,
  onShowDetails,
}) => {
  const filename = activeItem.record.name || 'documento';
  const lowerName = filename.toLowerCase();
  const mimeType = (activeItem.record.mimeType || '').toLowerCase();

  // Detect format
  const isPdf = lowerName.endsWith('.pdf') || mimeType.includes('pdf');
  const isWord =
    lowerName.endsWith('.docx') ||
    lowerName.endsWith('.doc') ||
    mimeType.includes('word') ||
    mimeType.includes('msword') ||
    mimeType.includes('officedocument.wordprocessingml');
  const isTxt =
    lowerName.endsWith('.txt') ||
    lowerName.endsWith('.md') ||
    lowerName.endsWith('.log') ||
    lowerName.endsWith('.csv') ||
    lowerName.endsWith('.json') ||
    lowerName.endsWith('.xml') ||
    mimeType.startsWith('text/');

  // State
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMessage, setLoadingMessage] = useState<string>('Abriendo documento…');
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // PDF specific states
  const [pdfDoc, setPdfDoc] = useState<any | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pdfScale, setPdfScale] = useState<number>(1);
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set([1, 2]));

  // TXT specific states
  const [textContent, setTextContent] = useState<string>('');
  const [txtFontSize, setTxtFontSize] = useState<number>(15);
  const [textEncoding, setTextEncoding] = useState<'utf-8' | 'latin1'>('utf-8');
  const [isCopied, setIsCopied] = useState<boolean>(false);

  // Word specific states
  const [wordHtml, setWordHtml] = useState<string>('');

  // Refs for cleanup and lazy loading
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const renderTasksRef = useRef<Map<number, any>>(new Map());
  const pdfDocRef = useRef<any | null>(null);
  const arrayBufferRef = useRef<ArrayBuffer | null>(null);

  // Double tap detection for zoom reset to width
  const lastTapRef = useRef<number>(0);

  // Clean memory thoroughly on unmount or item switch (REQ 13)
  const cleanupDocument = useCallback(() => {
    // Cancel any ongoing render tasks
    renderTasksRef.current.forEach((task) => {
      try {
        task.cancel();
      } catch {}
    });
    renderTasksRef.current.clear();

    // Clear all canvases to immediately free GPU and RAM memory
    canvasRefs.current.forEach((canvas) => {
      try {
        canvas.width = 0;
        canvas.height = 0;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, 0, 0);
      } catch {}
    });
    canvasRefs.current.clear();
    pageRefs.current.clear();

    // Destroy pdf.js document
    if (pdfDocRef.current) {
      try {
        pdfDocRef.current.destroy();
      } catch {}
      pdfDocRef.current = null;
    }
    setPdfDoc(null);
    arrayBufferRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      cleanupDocument();
    };
  }, [cleanupDocument, activeItem.id]);

  // Load and decrypt file content based on type
  useEffect(() => {
    let isCancelled = false;
    cleanupDocument();
    setLoading(true);
    setLoadingMessage('Abriendo documento…');
    setLoadingProgress(0);
    setErrorMessage(null);
    setTextContent('');
    setWordHtml('');
    setNumPages(0);
    setCurrentPage(1);

    async function loadItem() {
      try {
        const response = await fetch(activeItem.blobUrl);
        if (!response.ok) throw new Error('No se pudo acceder al archivo cifrado.');
        const buffer = await response.arrayBuffer();
        if (isCancelled) return;
        arrayBufferRef.current = buffer;

        if (isPdf) {
          setLoadingMessage('Descifrando y preparando PDF…');
          // Load document with local pdf.js
          const loadingTask = pdfjsLib.getDocument({
            data: new Uint8Array(buffer),
            cMapUrl: undefined,
            cMapPacked: true,
          });

          loadingTask.onProgress = (progressData: { loaded: number; total: number }) => {
            if (progressData.total > 0) {
              const pct = Math.round((progressData.loaded / progressData.total) * 100);
              setLoadingProgress(pct);
              setLoadingMessage(`Abriendo documento… ${pct}%`);
            }
          };

          const doc = await loadingTask.promise;
          if (isCancelled) {
            doc.destroy();
            return;
          }
          pdfDocRef.current = doc;
          setPdfDoc(doc);
          setNumPages(doc.numPages);
          setVisiblePages(new Set([1, 2]));
          setLoading(false);
        } else if (isWord) {
          setLoadingMessage('Procesando documento Word…');
          if (lowerName.endsWith('.docx') || mimeType.includes('openxmlformats')) {
            try {
              // Dynamic import of mammoth.js included locally in node_modules
              // @ts-ignore
              const mammothModule = await import('mammoth');
              const mammoth = (mammothModule as any).default || mammothModule;
              const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
              if (!isCancelled) {
                if (result.value && result.value.trim().length > 0) {
                  setWordHtml(result.value);
                } else {
                  setWordHtml('<p class="italic text-slate-400">El documento no contiene texto visible.</p>');
                }
                setLoading(false);
              }
            } catch (err) {
              console.warn('Mammoth conversion error:', err);
              // Fallback to text decoder
              const decoder = new TextDecoder('utf-8');
              const text = decoder.decode(buffer);
              const printable = text.replace(/[\x00-\x08\x0E-\x1F\x7F-\x9F]/g, ' ').slice(0, 15000);
              if (!isCancelled) {
                setTextContent(printable);
                setLoading(false);
              }
            }
          } else {
            // Older binary .doc format
            const decoder = new TextDecoder('latin1');
            const text = decoder.decode(buffer);
            const printable = text.replace(/[\x00-\x08\x0E-\x1F\x7F-\x9F]/g, ' ').slice(0, 15000);
            if (!isCancelled) {
              setTextContent(printable);
              setLoading(false);
            }
          }
        } else if (isTxt) {
          setLoadingMessage('Leyendo texto…');
          // Auto-detect encoding or decode with selected encoding (UTF-8 or Latin-1) (REQ 7)
          try {
            const decoder = new TextDecoder(textEncoding, { fatal: true });
            const text = decoder.decode(buffer);
            if (!isCancelled) {
              setTextContent(text);
              setLoading(false);
            }
          } catch {
            // If UTF-8 failed due to invalid bytes, fallback to Latin-1
            const fallbackDecoder = new TextDecoder('latin1');
            const text = fallbackDecoder.decode(buffer);
            if (!isCancelled) {
              setTextContent(text);
              setTextEncoding('latin1');
              setLoading(false);
            }
          }
        } else {
          // Other generic formats (REQ 9)
          setLoading(false);
        }
      } catch (err: any) {
        console.error('DocumentReader loading error:', err);
        if (!isCancelled) {
          setErrorMessage('No se pudo mostrar este documento');
          setLoading(false);
        }
      }
    }

    loadItem();

    return () => {
      isCancelled = true;
    };
  }, [activeItem.id, isPdf, isWord, isTxt, lowerName, mimeType, textEncoding, cleanupDocument]);

  // Page tracking & Lazy Rendering via IntersectionObserver (REQ 3)
  useEffect(() => {
    if (!isPdf || !pdfDoc || numPages === 0 || !containerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleSet = new Set<number>();
        entries.forEach((entry) => {
          const pageNum = Number(entry.target.getAttribute('data-page-number'));
          if (entry.isIntersecting && pageNum > 0) {
            visibleSet.add(pageNum);
            // Pre-load immediate neighbors (current, prev, next)
            if (pageNum > 1) visibleSet.add(pageNum - 1);
            if (pageNum < numPages) visibleSet.add(pageNum + 1);
          }
        });

        if (visibleSet.size > 0) {
          // Find earliest visible page for top counter
          const sorted = Array.from(visibleSet).sort((a, b) => a - b);
          setCurrentPage(sorted[0]);
          setVisiblePages((prev) => {
            const next = new Set(prev);
            sorted.forEach((p) => next.add(p));
            // Evict pages that are too far away (> 4 pages away) to prevent memory leak on 30MB+ PDFs
            next.forEach((p) => {
              if (Math.abs(p - sorted[0]) > 4) {
                next.delete(p);
                // Wipe canvas of far page
                const canvas = canvasRefs.current.get(p);
                if (canvas) {
                  canvas.width = 0;
                  canvas.height = 0;
                }
              }
            });
            return next;
          });
        }
      },
      {
        root: containerRef.current,
        rootMargin: '250px 0px 250px 0px',
        threshold: 0.1,
      }
    );

    pageRefs.current.forEach((div) => {
      if (div) observer.observe(div);
    });

    return () => {
      observer.disconnect();
    };
  }, [isPdf, pdfDoc, numPages]);

  // Render individual visible page in its canvas (REQ 2 & 3)
  const renderPage = useCallback(
    async (pageNumber: number) => {
      if (!pdfDoc) return;
      const canvas = canvasRefs.current.get(pageNumber);
      const containerDiv = pageRefs.current.get(pageNumber);
      if (!canvas || !containerDiv) return;

      // Cancel previous render on this page if running
      if (renderTasksRef.current.has(pageNumber)) {
        try {
          renderTasksRef.current.get(pageNumber).cancel();
        } catch {}
        renderTasksRef.current.delete(pageNumber);
      }

      try {
        const page = await pdfDoc.getPage(pageNumber);
        const containerWidth =
          containerRef.current?.clientWidth || window.innerWidth || 390;
        // Compute scale to fit container width cleanly
        const unscaledViewport = page.getViewport({ scale: 1 });
        const scaleToFit = Math.min(
          3.5,
          Math.max(0.4, (containerWidth - 28) / unscaledViewport.width)
        );
        const finalScale = scaleToFit * pdfScale;
        const viewport = page.getViewport({ scale: finalScale });

        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const renderContext = {
          canvasContext: ctx,
          viewport: viewport,
        };

        const renderTask = page.render(renderContext);
        renderTasksRef.current.set(pageNumber, renderTask);
        await renderTask.promise;
        renderTasksRef.current.delete(pageNumber);
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.warn(`Error rendering PDF page ${pageNumber}:`, err);
        }
      }
    },
    [pdfDoc, pdfScale]
  );

  // Trigger render when visiblePages or pdfScale changes
  useEffect(() => {
    if (!isPdf || !pdfDoc) return;
    visiblePages.forEach((pageNum) => {
      renderPage(pageNum);
    });
  }, [isPdf, pdfDoc, visiblePages, pdfScale, renderPage]);

  // Double tap to reset zoom or toggle width fit (REQ 4)
  const handleDoubleTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 320) {
      setPdfScale((prev) => (prev > 1.05 ? 1 : 1.75));
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  };

  const handleCopyTxt = () => {
    if (textContent && navigator.clipboard) {
      navigator.clipboard.writeText(textContent);
      setIsCopied(true);
      showToast('Texto copiado al portapapeles', 'success');
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  // 1. ERROR STATE (REQ 10)
  if (errorMessage) {
    return (
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full h-full flex flex-col items-center justify-center p-6 bg-[#121214] text-white select-none text-center"
      >
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mb-4 shadow-lg shadow-rose-950/40">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h3 className="text-base font-bold text-white mb-2">{errorMessage}</h3>
        <p className="text-xs text-slate-400 max-w-sm mb-6 leading-relaxed">
          El archivo está cifrado de forma segura en tu bóveda. Puedes exportarlo directamente a tu teléfono para abrirlo con una aplicación compatible.
        </p>
        <button
          type="button"
          onClick={onExport}
          disabled={isExporting}
          className="px-6 py-3 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg transition-all flex items-center gap-2 active:scale-95 cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>{isExporting ? 'Sacando a tu dispositivo…' : 'Sacar a mi dispositivo'}</span>
        </button>
      </div>
    );
  }

  // 2. LOADING INDICATOR (REQ 6)
  if (loading) {
    return (
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full h-full flex flex-col items-center justify-center p-6 bg-[#121214] text-white select-none text-center"
      >
        <div className="w-14 h-14 rounded-2xl bg-sky-500/10 border border-sky-500/30 text-sky-400 flex items-center justify-center mb-4 shadow-lg">
          <Loader2 className="w-7 h-7 animate-spin" />
        </div>
        <h4 className="text-sm font-bold text-white mb-1.5">{loadingMessage}</h4>
        <p className="text-xs text-slate-400 truncate max-w-[260px] font-mono">
          {filename}
        </p>
        {loadingProgress > 0 && (
          <div className="w-48 bg-slate-800 rounded-full h-1.5 mt-4 overflow-hidden">
            <div
              className="bg-sky-400 h-full rounded-full transition-all duration-150"
              style={{ width: `${loadingProgress}%` }}
            />
          </div>
        )}
      </div>
    );
  }

  // 3. GENERIC / UNSUPPORTED FORMAT DETAILS VIEW (REQ 9)
  if (!isPdf && !isWord && !isTxt) {
    const isSpreadsheet = lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || mimeType.includes('spreadsheet');
    const isPresentation = lowerName.endsWith('.pptx') || lowerName.endsWith('.ppt') || mimeType.includes('presentation');
    const isArchive = lowerName.endsWith('.zip') || lowerName.endsWith('.rar') || lowerName.endsWith('.7z');

    return (
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full h-full flex flex-col justify-between bg-[#121214] text-white select-none p-4 sm:p-6"
      >
        {/* Compact Header (REQ 11 & 12) */}
        <div className="w-full flex items-center justify-between py-2 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-2 -ml-2 text-white hover:text-sky-400 transition-colors cursor-pointer"
                aria-label="Volver"
              >
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
            )}
            <div className="text-left min-w-0">
              <h4 className="text-sm font-bold text-white truncate max-w-[220px] sm:max-w-md">
                {filename}
              </h4>
              <p className="text-[11px] text-slate-400 truncate">
                {new Date(activeItem.record.timestamp).toLocaleDateString()} · {formatBytes(activeItem.record.size)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onExport}
            disabled={isExporting}
            className="px-4 py-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Sacar</span>
          </button>
        </div>

        {/* Big Icon & Metadata card (REQ 9) */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center my-auto">
          <div className="w-24 h-24 rounded-3xl bg-sky-500/10 border border-sky-500/25 text-sky-400 flex items-center justify-center mb-5 shadow-2xl">
            {isSpreadsheet ? (
              <FileSpreadsheet className="w-12 h-12" />
            ) : isPresentation ? (
              <Layers className="w-12 h-12" />
            ) : isArchive ? (
              <Package className="w-12 h-12" />
            ) : (
              <FileCode className="w-12 h-12" />
            )}
          </div>

          <h3 className="text-lg font-bold text-white mb-1.5 break-all max-w-md">
            {filename}
          </h3>
          <p className="text-xs text-slate-400 mb-6">
            Archivo cifrado con AES-256 en tu caja fuerte
          </p>

          <div className="w-full max-w-sm bg-white/5 border border-white/10 rounded-2xl p-4 text-left text-xs space-y-2.5 mb-6">
            <div className="flex justify-between">
              <span className="text-slate-400">Tipo de archivo:</span>
              <span className="font-semibold text-white uppercase">
                {filename.split('.').pop() || 'Archivo'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Tamaño del archivo:</span>
              <span className="font-semibold text-white">
                {formatBytes(activeItem.record.size)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Carpeta:</span>
              <span className="font-semibold text-slate-300">
                {activeItem.record.album || 'General'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onExport}
            disabled={isExporting}
            className="w-full max-w-sm py-3.5 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white font-bold rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer"
          >
            <Download className="w-5 h-5" />
            <span>{isExporting ? 'Sacando a tu dispositivo…' : 'Sacar a mi dispositivo'}</span>
          </button>
        </div>
      </div>
    );
  }

  // 4. MAIN VIEWER (PDF, WORD, TXT)
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={`fixed inset-0 z-50 flex flex-col bg-[#18181b] text-white select-none overflow-hidden transition-all ${
        isFullScreen ? 'p-0' : 'p-0'
      }`}
    >
      {/* HEADER COMPACTO UNIFICADO (REQ 11 & 12) */}
      <header className="w-full px-4 safe-top-sticky py-3 bg-[#0f1115]/95 border-b border-white/10 flex items-center justify-between text-white shrink-0 backdrop-blur-md z-30">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 -ml-1 text-white hover:text-sky-400 active:scale-95 transition-all cursor-pointer shrink-0"
              aria-label="Volver"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
          )}

          {/* Nombre en blanco en una sola línea (REQ 11) y metadatos en gris claro */}
          <div className="min-w-0 flex-1 text-left">
            <h4 className="text-[15px] font-semibold text-white truncate leading-tight">
              {filename}
            </h4>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-300 font-normal leading-tight pt-0.5 truncate">
              <span>{new Date(activeItem.record.timestamp).toLocaleDateString()}</span>
              <span>·</span>
              <span>{activeItem.record.album || 'General'}</span>
              {isPdf && numPages > 0 && (
                <>
                  <span>·</span>
                  <span className="font-semibold text-sky-400">
                    {currentPage} / {numPages}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Acciones del encabezado: Sacar en azul (REQ 12), Zoom y Pantalla completa */}
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {isPdf && (
            <>
              <button
                type="button"
                onClick={() => setPdfScale((prev) => Math.max(0.6, prev - 0.2))}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                title="Alejar (Zoom -)"
              >
                <ZoomOut className="w-4 h-4 text-white" />
              </button>
              <button
                type="button"
                onClick={() => setPdfScale((prev) => Math.min(3, prev + 0.2))}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                title="Acercar (Zoom +)"
              >
                <ZoomIn className="w-4 h-4 text-white" />
              </button>
            </>
          )}

          {isTxt && (
            <>
              <button
                type="button"
                onClick={() => setTxtFontSize((prev) => Math.max(11, prev - 2))}
                className="px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors cursor-pointer"
                title="Reducir letra"
              >
                A-
              </button>
              <button
                type="button"
                onClick={() => setTxtFontSize((prev) => Math.min(26, prev + 2))}
                className="px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors cursor-pointer"
                title="Aumentar letra"
              >
                A+
              </button>
              <button
                type="button"
                onClick={handleCopyTxt}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                title="Copiar texto"
              >
                {isCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-white" />}
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setIsFullScreen(!isFullScreen)}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            title={isFullScreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
          >
            {isFullScreen ? <Minimize2 className="w-4 h-4 text-white" /> : <Maximize2 className="w-4 h-4 text-white" />}
          </button>

          {/* Botón Sacar en AZUL puro (REQ 12) */}
          <button
            type="button"
            onClick={onExport}
            disabled={isExporting}
            className="px-3.5 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 active:bg-sky-600 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-md cursor-pointer ml-1"
          >
            <Download className="w-3.5 h-3.5 text-white" />
            <span>Sacar</span>
          </button>
        </div>
      </header>

      {/* CONTENIDO PRINCIPAL */}
      <div
        ref={containerRef}
        onClick={handleDoubleTap}
        className="flex-1 w-full h-full overflow-y-auto overflow-x-auto bg-[#1c1d21] relative custom-scrollbar select-text"
      >
        {/* 1. PDF CANVAS RENDERER (REQ 1, 2, 3, 4, 5) */}
        {isPdf && numPages > 0 && (
          <div className="flex flex-col items-center gap-4 py-4 px-2 min-h-full">
            {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
              <div
                key={pageNum}
                data-page-number={pageNum}
                ref={(el) => {
                  if (el) pageRefs.current.set(pageNum, el);
                  else pageRefs.current.delete(pageNum);
                }}
                className="relative bg-white rounded-lg shadow-xl overflow-hidden flex items-center justify-center transition-transform"
                style={{
                  minHeight: '280px',
                  boxShadow: '0 8px 30px -4px rgba(0, 0, 0, 0.45)',
                }}
              >
                <canvas
                  ref={(el) => {
                    if (el) canvasRefs.current.set(pageNum, el);
                    else canvasRefs.current.delete(pageNum);
                  }}
                  className="block bg-white"
                />
                {!visiblePages.has(pageNum) && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-100 text-slate-400 text-xs font-mono">
                    Página {pageNum}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 2. WORD (.docx) HTML CONVERSION (REQ 8) */}
        {isWord && (
          <div className="max-w-3xl mx-auto p-4 sm:p-8">
            <div className="mb-4 p-3 bg-sky-500/10 border border-sky-500/20 rounded-xl text-xs text-sky-300">
              Vista simplificada. Para ver el formato original, usa <b>Sacar a mi dispositivo</b>.
            </div>

            <div className="bg-white text-slate-900 rounded-2xl p-6 sm:p-10 shadow-xl leading-relaxed text-sm space-y-4">
              {wordHtml ? (
                <div
                  className="prose max-w-none text-slate-900"
                  dangerouslySetInnerHTML={{ __html: wordHtml }}
                />
              ) : textContent ? (
                <pre className="whitespace-pre-wrap font-sans text-slate-800 leading-relaxed">
                  {textContent}
                </pre>
              ) : (
                <p className="italic text-slate-400">Sin contenido que mostrar.</p>
              )}
            </div>
          </div>
        )}

        {/* 3. TXT VIEWER (REQ 7) */}
        {isTxt && (
          <div className="max-w-4xl mx-auto p-4 sm:p-8">
            <div className="flex items-center justify-between mb-3 text-xs text-slate-400">
              <span>Codificación: {textEncoding.toUpperCase()}</span>
              <button
                type="button"
                onClick={() =>
                  setTextEncoding((prev) => (prev === 'utf-8' ? 'latin1' : 'utf-8'))
                }
                className="underline hover:text-white cursor-pointer"
              >
                Cambiar a {textEncoding === 'utf-8' ? 'Latin-1 (ANSI)' : 'UTF-8'}
              </button>
            </div>

            <div className="bg-[#121316] border border-white/10 rounded-2xl p-5 sm:p-8 shadow-xl">
              <pre
                style={{
                  fontSize: `${txtFontSize}px`,
                  lineHeight: '1.65',
                }}
                className="whitespace-pre-wrap break-words font-mono text-slate-200 select-text"
              >
                {textContent}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
