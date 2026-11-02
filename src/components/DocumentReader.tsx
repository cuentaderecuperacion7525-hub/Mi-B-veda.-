import React, { useState, useEffect } from 'react';
import {
  FileText,
  Download,
  BookOpen,
  Type,
  Maximize2,
  Minimize2,
  Copy,
  Check,
  AlertCircle,
  Loader2,
  FileSpreadsheet,
  FileCode,
  Layers,
} from 'lucide-react';
import { DecryptedVaultItem } from './PhotoViewerModal';
import { formatSize as formatBytes } from '../utils/formatUtils';

interface DocumentReaderProps {
  activeItem: DecryptedVaultItem;
  onExport: () => void;
  isExporting: boolean;
  showToast: (msg: string, type?: 'info' | 'success' | 'alert' | 'error') => void;
}

export const DocumentReader: React.FC<DocumentReaderProps> = ({
  activeItem,
  onExport,
  isExporting,
  showToast,
}) => {
  const [docType, setDocType] = useState<'pdf' | 'word' | 'text' | 'spreadsheet' | 'presentation' | 'generic'>('generic');
  const [docHtml, setDocHtml] = useState<string>('');
  const [docText, setDocText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState<number>(15);
  const [readerTheme, setReaderTheme] = useState<'light' | 'sepia' | 'dark'>('light');
  const [copied, setCopied] = useState<boolean>(false);
  const [isFullScreenDoc, setIsFullScreenDoc] = useState<boolean>(false);

  const filename = activeItem.record.name || 'documento';
  const lowerName = filename.toLowerCase();
  const mimeType = (activeItem.record.mimeType || '').toLowerCase();

  // Detect exact document format
  useEffect(() => {
    if (lowerName.endsWith('.pdf') || mimeType.includes('pdf')) {
      setDocType('pdf');
    } else if (
      lowerName.endsWith('.docx') ||
      lowerName.endsWith('.doc') ||
      mimeType.includes('word') ||
      mimeType.includes('msword') ||
      mimeType.includes('officedocument.wordprocessingml')
    ) {
      setDocType('word');
    } else if (
      lowerName.endsWith('.xlsx') ||
      lowerName.endsWith('.xls') ||
      mimeType.includes('spreadsheet') ||
      mimeType.includes('excel')
    ) {
      setDocType('spreadsheet');
    } else if (
      lowerName.endsWith('.pptx') ||
      lowerName.endsWith('.ppt') ||
      mimeType.includes('presentation') ||
      mimeType.includes('powerpoint')
    ) {
      setDocType('presentation');
    } else if (
      lowerName.endsWith('.txt') ||
      lowerName.endsWith('.md') ||
      lowerName.endsWith('.rtf') ||
      lowerName.endsWith('.csv') ||
      lowerName.endsWith('.json') ||
      lowerName.endsWith('.log') ||
      mimeType.startsWith('text/')
    ) {
      setDocType('text');
    } else {
      setDocType('generic');
    }
  }, [filename, mimeType]);

  // Load document content for Word or Text files
  useEffect(() => {
    let isCancelled = false;

    async function loadContent() {
      setLoading(true);
      setError(null);
      setDocHtml('');
      setDocText('');

      try {
        if (docType === 'word') {
          const resp = await fetch(activeItem.blobUrl);
          const buffer = await resp.arrayBuffer();

          if (lowerName.endsWith('.docx') || mimeType.includes('openxmlformats')) {
            try {
              // Dynamic import of mammoth for browser-side docx conversion
              // @ts-ignore
              const mammothModule = await import('mammoth');
              const mammoth = (mammothModule as any).default || mammothModule;
              const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
              if (!isCancelled) {
                if (result.value && result.value.trim().length > 0) {
                  setDocHtml(result.value);
                } else {
                  setDocHtml('<p class="italic text-slate-400">El documento no contiene texto legible directamente.</p>');
                }
              }
            } catch (err: any) {
              console.warn('Error rendering docx with mammoth:', err);
              // Fallback to text parsing
              const textResp = await fetch(activeItem.blobUrl);
              const text = await textResp.text();
              if (!isCancelled) {
                // Filter out non-printable binary characters
                const printable = text.replace(/[\x00-\x08\x0E-\x1F\x7F-\x9F]/g, ' ').slice(0, 10000);
                setDocText(printable);
              }
            }
          } else {
            // Older .doc binary format
            const textResp = await fetch(activeItem.blobUrl);
            const text = await textResp.text();
            if (!isCancelled) {
              const printable = text.replace(/[\x00-\x08\x0E-\x1F\x7F-\x9F]/g, ' ').slice(0, 10000);
              setDocText(printable);
            }
          }
        } else if (docType === 'text') {
          const resp = await fetch(activeItem.blobUrl);
          const text = await resp.text();
          if (!isCancelled) {
            setDocText(text);
          }
        }
      } catch (e: any) {
        if (!isCancelled) {
          setError('No se pudo procesar el contenido del archivo.');
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    if (docType === 'word' || docType === 'text') {
      loadContent();
    } else {
      setLoading(false);
    }

    return () => {
      isCancelled = true;
    };
  }, [docType, activeItem.blobUrl, lowerName, mimeType]);

  const handleCopyText = () => {
    let textToCopy = docText;
    if (docHtml) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = docHtml;
      textToCopy = tempDiv.innerText || tempDiv.textContent || '';
    }

    if (textToCopy && navigator.clipboard) {
      navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      showToast('Texto del documento copiado al portapapeles', 'success');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // 1. PDF READER
  if (docType === 'pdf') {
    return (
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full flex flex-col bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl transition-all ${
          isFullScreenDoc
            ? 'fixed inset-2 z-50 max-w-none max-h-none h-[calc(100vh-16px)]'
            : 'max-w-4xl h-[calc(100vh-210px)] max-h-[850px]'
        }`}
      >
        {/* PDF Reader Header Bar */}
        <div className="px-4 py-3 bg-[#0d1522] border-b border-slate-800 flex items-center justify-between text-slate-200 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-bold text-white truncate max-w-[200px] sm:max-w-md">
                {filename}
              </h4>
              <p className="text-[10px] text-slate-400">
                Lector PDF integrado · {formatBytes(activeItem.record.size)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsFullScreenDoc(!isFullScreenDoc)}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title={isFullScreenDoc ? 'Salir de pantalla completa' : 'Pantalla completa'}
            >
              {isFullScreenDoc ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onExport}
              disabled={isExporting}
              className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-md cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Exportar</span>
            </button>
          </div>
        </div>

        {/* Embedded PDF iframe */}
        <div className="flex-1 w-full h-full bg-slate-950 relative overflow-hidden">
          <iframe
            src={`${activeItem.blobUrl}#toolbar=1&navpanes=0`}
            title={filename}
            className="w-full h-full border-0 bg-white"
          />
        </div>
      </div>
    );
  }

  // 2. WORD DOCUMENT & TEXT READER
  if (docType === 'word' || docType === 'text') {
    const themeBg =
      readerTheme === 'light'
        ? 'bg-[#ffffff] text-[#1e293b]'
        : readerTheme === 'sepia'
        ? 'bg-[#fbf0d9] text-[#433422]'
        : 'bg-[#0f172a] text-[#e2e8f0]';

    const paperBg =
      readerTheme === 'light'
        ? 'bg-white shadow-xl border-slate-200 text-slate-900'
        : readerTheme === 'sepia'
        ? 'bg-[#f4ecd8] shadow-xl border-[#e6dcbf] text-[#3d2f1f]'
        : 'bg-[#1e293b] shadow-xl border-slate-700 text-slate-100';

    return (
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full flex flex-col bg-[#0b121e] border border-slate-800 rounded-3xl overflow-hidden shadow-2xl transition-all ${
          isFullScreenDoc
            ? 'fixed inset-2 z-50 max-w-none max-h-none h-[calc(100vh-16px)]'
            : 'max-w-4xl h-[calc(100vh-210px)] max-h-[850px]'
        }`}
      >
        {/* Document Reader Controls Header */}
        <div className="px-4 py-2.5 bg-[#0d1624] border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400 flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-bold text-white truncate max-w-[180px] sm:max-w-xs">
                {filename}
              </h4>
              <p className="text-[10px] text-slate-400">
                {docType === 'word' ? 'Documento Word' : 'Documento de Texto'} · {formatBytes(activeItem.record.size)}
              </p>
            </div>
          </div>

          {/* Reader Toolbar: Font Size, Theme, Copy & Fullscreen */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Font size adjustments */}
            <div className="flex items-center bg-slate-800/80 rounded-xl p-0.5 border border-slate-700">
              <button
                type="button"
                onClick={() => setFontSize((f) => Math.max(12, f - 2))}
                className="px-2 py-1 text-xs font-bold text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
                title="Reducir letra"
              >
                A-
              </button>
              <span className="text-[10px] font-mono px-1 text-slate-400 select-none">
                {fontSize}px
              </span>
              <button
                type="button"
                onClick={() => setFontSize((f) => Math.min(26, f + 2))}
                className="px-2 py-1 text-xs font-bold text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
                title="Aumentar letra"
              >
                A+
              </button>
            </div>

            {/* Reading theme toggles */}
            <div className="flex items-center bg-slate-800/80 rounded-xl p-0.5 border border-slate-700">
              <button
                type="button"
                onClick={() => setReaderTheme('light')}
                className={`w-6 h-6 rounded-lg text-xs font-bold flex items-center justify-center transition-all ${
                  readerTheme === 'light' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
                title="Tema Claro"
              >
                C
              </button>
              <button
                type="button"
                onClick={() => setReaderTheme('sepia')}
                className={`w-6 h-6 rounded-lg text-xs font-bold flex items-center justify-center transition-all ${
                  readerTheme === 'sepia' ? 'bg-[#fbf0d9] text-[#523d24] shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
                title="Tema Sepia"
              >
                S
              </button>
              <button
                type="button"
                onClick={() => setReaderTheme('dark')}
                className={`w-6 h-6 rounded-lg text-xs font-bold flex items-center justify-center transition-all ${
                  readerTheme === 'dark' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
                title="Tema Oscuro"
              >
                O
              </button>
            </div>

            {/* Copy button */}
            <button
              type="button"
              onClick={handleCopyText}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Copiar texto del documento"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>

            {/* Fullscreen toggle */}
            <button
              type="button"
              onClick={() => setIsFullScreenDoc(!isFullScreenDoc)}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title={isFullScreenDoc ? 'Salir de pantalla completa' : 'Pantalla completa'}
            >
              {isFullScreenDoc ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Scrollable Document Paper Body */}
        <div className={`flex-1 w-full overflow-y-auto p-3 sm:p-6 transition-colors ${themeBg}`}>
          {loading ? (
            <div className="h-full min-h-[300px] flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              <p className="text-xs font-medium text-slate-400">
                Descifrando y preparando documento para lectura...
              </p>
            </div>
          ) : error ? (
            <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center p-6 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-white">{error}</h4>
              <p className="text-xs text-slate-400 max-w-sm">
                Puedes descargar el archivo en tu dispositivo para abrirlo en Microsoft Word, Google Docs u otra aplicación.
              </p>
              <button
                type="button"
                onClick={onExport}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-lg transition-colors cursor-pointer"
              >
                Sacar a mi dispositivo
              </button>
            </div>
          ) : docHtml ? (
            <div
              className={`max-w-3xl mx-auto p-6 sm:p-10 rounded-2xl border transition-colors ${paperBg}`}
              style={{ fontSize: `${fontSize}px`, lineHeight: 1.7 }}
            >
              <div
                className="vault-doc-content space-y-4 font-serif selection:bg-blue-500/30 selection:text-white"
                dangerouslySetInnerHTML={{ __html: docHtml }}
              />
            </div>
          ) : docText ? (
            <div
              className={`max-w-3xl mx-auto p-6 sm:p-8 rounded-2xl border transition-colors whitespace-pre-wrap font-sans selection:bg-blue-500/30 ${paperBg}`}
              style={{ fontSize: `${fontSize}px`, lineHeight: 1.65 }}
            >
              {docText}
            </div>
          ) : (
            <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center p-6 text-slate-400">
              <BookOpen className="w-10 h-10 mb-2 opacity-50" />
              <p className="text-xs">El documento está vacío o no tiene contenido de texto.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 3. SPREADSHEET / PRESENTATION / GENERIC DOCUMENT CARD
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="w-full max-w-md bg-[#131c2e] border border-slate-800 rounded-3xl p-6 sm:p-8 text-center shadow-2xl"
    >
      <div className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 shadow-blue-500/10">
        {docType === 'spreadsheet' ? (
          <FileSpreadsheet className="w-10 h-10" />
        ) : (
          <FileText className="w-10 h-10" />
        )}
      </div>

      <h3 className="text-lg font-bold text-white mb-1 break-all">
        {filename}
      </h3>
      <p className="text-xs text-blue-300/80 mb-6">
        Documento cifrado en la Bóveda Segura (AES-256)
      </p>

      <div className="bg-slate-900/80 rounded-2xl p-4 border border-slate-800 text-left text-xs space-y-2 mb-6">
        <div className="flex justify-between text-slate-400">
          <span>Formato:</span>
          <span className="font-semibold text-slate-200">
            {filename.split('.').pop()?.toUpperCase() || 'DOCUMENTO'}
          </span>
        </div>
        <div className="flex justify-between text-slate-400">
          <span>Tamaño:</span>
          <span className="font-semibold text-slate-200">
            {formatBytes(activeItem.record.size)}
          </span>
        </div>
        <div className="flex justify-between text-slate-400">
          <span>Ubicación en Bóveda:</span>
          <span className="font-semibold text-slate-200">
            {activeItem.record.album || 'General'}
          </span>
        </div>
      </div>

      <button
        onClick={onExport}
        disabled={isExporting}
        className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-2xl shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
      >
        <Download className={`w-5 h-5 ${isExporting ? 'animate-bounce' : ''}`} />
        <span>{isExporting ? 'Sacando a tu dispositivo...' : 'Sacar a mi dispositivo'}</span>
      </button>
      <p className="text-[11px] text-slate-500 mt-2">
        El documento se guardará en tu almacenamiento para abrirlo con su aplicación correspondiente.
      </p>
    </div>
  );
};
