import React from 'react';
// Usamos iconos limpios de trazo fino
import { Trash2 } from 'lucide-react';

export interface ModalEliminarProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmar: () => void;
  isDeleting?: boolean;
}

export const ModalEliminar: React.FC<ModalEliminarProps> = ({
  isOpen,
  onClose,
  onConfirmar,
  isDeleting = false,
}) => {
  if (!isOpen) return null;

  return (
    // Capa de fondo oscura translúcida (Backdrop)
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 select-none">
      
      {/* Contenedor del Modal */}
      <div className="w-full max-w-sm rounded-3xl bg-zinc-900/90 border border-zinc-800 p-6 text-center shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-200">
        
        {/* Icono superior estilizado con un contenedor muy sutil */}
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 text-red-400">
          <Trash2 size={24} strokeWidth={1.5} />
        </div>

        {/* Textos Informativos */}
        <h3 className="text-xl font-semibold text-zinc-100 tracking-tight">
          ¿Eliminar este elemento privado?
        </h3>
        <p className="mt-2 text-sm text-zinc-400 leading-relaxed px-2">
          Esta acción es irreversible y eliminará el registro cifrado de tu bóveda de forma permanente.
        </p>

        {/* Contenedor de Botones Inferiores */}
        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          
          {/* Botón Cancelar - Estilo minimalista y transparente */}
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="w-full order-2 sm:order-1 px-5 py-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 text-zinc-300 font-medium transition-colors duration-200 active:scale-[0.98] focus:outline-none cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>

          {/* Botón Eliminar - Rojo sofisticado sin resplandores toscos */}
          <button
            type="button"
            onClick={onConfirmar}
            disabled={isDeleting}
            className="w-full order-1 sm:order-2 px-5 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium transition-colors duration-200 shadow-lg shadow-red-900/20 active:scale-[0.98] focus:outline-none cursor-pointer disabled:opacity-50"
          >
            {isDeleting ? 'Borrando...' : 'Eliminar'}
          </button>

        </div>

      </div>
    </div>
  );
};
