/**
 * Selector de entidad, arriba de todo.
 *
 * Contempla las dos vistas que pidieron: cada economia por separado, y el
 * consolidado con etiquetas. "Todo" no es un filtro apagado, es una vista
 * propia: es donde se ve que la casa esta financiando a los negocios.
 */

import type { Entity } from '@shared/types';
import { useStore } from '../../store/store.tsx';
import { Icono } from './base.tsx';
import { cn } from '../../lib/utils.ts';

export function SelectorEntidad() {
  const { entities, entidadActiva, verEntidad } = useStore();
  const visibles = entities.filter((e) => !e.archived);

  // Con una sola economia el selector no dice nada: hasta que no creen un
  // negocio, la pantalla se queda como estaba.
  if (visibles.length < 2) return null;

  return (
    <div className="flex gap-1.5 overflow-x-auto sin-barra -mx-1 px-1 pb-0.5">
      <Pestana
        activa={entidadActiva === null}
        alTocar={() => verEntidad(null)}
        nombre="Todo"
        icono="chart-pie"
        color="#64748b"
      />
      {visibles.map((e) => (
        <Pestana
          key={e.id}
          activa={entidadActiva === e.id}
          alTocar={() => verEntidad(e.id)}
          nombre={e.name}
          icono={e.icon}
          color={e.color}
        />
      ))}
    </div>
  );
}

function Pestana({ activa, alTocar, nombre, icono, color }: {
  activa: boolean; alTocar: () => void; nombre: string; icono: string; color: string;
}) {
  return (
    <button
      onClick={alTocar}
      className={cn(
        'flex items-center gap-1.5 min-h-9 px-3 rounded-full text-sm font-medium',
        'whitespace-nowrap shrink-0 border transition-all active:scale-95',
        activa ? 'text-white border-transparent' : 'superficie-2 borde txt-2',
      )}
      style={activa ? { background: color } : undefined}
    >
      <Icono nombre={icono} size={14} />
      {nombre}
    </button>
  );
}

/** La etiqueta de entidad que llevan los movimientos en la vista consolidada. */
export function EtiquetaEntidad({ entidad }: { entidad: Entity | undefined }) {
  if (!entidad) return null;
  return (
    <span
      className="text-[10px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap"
      style={{ background: `${entidad.color}1f`, color: entidad.color }}
    >
      {entidad.name}
    </span>
  );
}
