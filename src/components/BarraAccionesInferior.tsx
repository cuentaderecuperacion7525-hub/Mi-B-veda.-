import React from 'react';
// Importamos iconos limpios y estilizados de trazo fino (estilo Outline)
import { Heart, Copy, Download, Trash2 } from 'lucide-react';

export interface BarraAccionesProps {
  esFavorito: boolean;
  onAlternarFavorito: () => void;
  onCopiar: () => void;
  onSacarDeBoveda: () => void;
  onEliminar: () => void;
  mostrarCopiar?: boolean;
  estaSacando?: boolean;
  esInmersivo?: boolean;
}

export const BarraAccionesInferior: React.FC<BarraAccionesProps> = ({
  esFavorito,
  onAlternarFavorito,
  onCopiar,
  onSacarDeBoveda,
  onEliminar,
  mostrarCopiar = true,
  estaSacando = false,
  esInmersivo = false,
}) => {
  return (
    <footer
      className={`fixed bottom-0 left-0 right-0 z-50 w-full bg-black/75 backdrop-blur-md px-6 py-4 pb-safe flex items-center justify-around border-t border-white/5 transition-transform duration-300 ${
        esInmersivo ? 'translate-y-full opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'
      }`}
    >
      {/* Botón Favorito: cambia de estilo si está activo */}
      <button
        type="button"
        onClick={onAlternarFavorito}
        className="p-3 text-white transition-colors duration-200 active:scale-95 hover:text-red-400 focus:outline-none cursor-pointer"
        aria-label="Favorito"
        title={esFavorito ? 'Quitar de favoritos' : 'Añadir a favoritos'}
      >
        <Heart 
          size={24} 
          strokeWidth={1.5} 
          className={esFavorito ? 'fill-red-500 text-red-500' : ''}
        />
      </button>

      {/* Botón Copiar al portapapeles */}
      {mostrarCopiar && (
        <button
          type="button"
          onClick={onCopiar}
          className="p-3 text-white transition-colors duration-200 active:scale-95 hover:text-blue-400 focus:outline-none cursor-pointer"
          aria-label="Copiar"
          title="Copiar imagen al portapapeles"
        >
          <Copy size={24} strokeWidth={1.5} />
        </button>
      )}

      {/* Botón Sacar de la Bóveda (Descargar/Exportar al almacenamiento libre) */}
      <button
        type="button"
        onClick={onSacarDeBoveda}
        disabled={estaSacando}
        className="p-3 text-white transition-colors duration-200 active:scale-95 hover:text-green-400 focus:outline-none disabled:opacity-50 cursor-pointer"
        aria-label="Sacar de Bóveda"
        title="Sacar de la bóveda a tu galería libre"
      >
        <Download 
          size={24} 
          strokeWidth={1.5} 
          className={estaSacando ? 'animate-bounce text-green-400' : ''}
        />
      </button>

      {/* Botón Eliminar permanentemente */}
      <button
        type="button"
        onClick={onEliminar}
        className="p-3 text-white transition-colors duration-200 active:scale-95 hover:text-red-500 focus:outline-none cursor-pointer"
        aria-label="Eliminar"
        title="Eliminar permanentemente"
      >
        <Trash2 size={24} strokeWidth={1.5} />
      </button>
    </footer>
  );
};
