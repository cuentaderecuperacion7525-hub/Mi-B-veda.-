/**
 * Utilidades compartidas de formato de tamaño de archivos para Bóveda Segura.
 * Unificado según los requerimientos globales a la unidad "Mb".
 */

export const formatSize = (bytes?: number): string => {
  if (!bytes || bytes <= 0) return '0 Mb';
  const mb = bytes / (1024 * 1024);
  if (mb < 0.01) return '< 0.01 Mb';
  if (mb < 1) return `${mb.toFixed(2)} Mb`;
  return `${mb.toFixed(1)} Mb`;
};

export const formatFileSize = formatSize;
