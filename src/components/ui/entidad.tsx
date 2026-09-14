/**
 * Selector de entidad, arriba de todo.
 *
 * Contempla las dos vistas que pidieron: cada economia por separado, y el
 * consolidado con etiquetas. "Todo" no es un filtro apagado, es una vista
 * propia: es donde se ve que la casa esta financiando a los negocios.
 */

import type { Entity } from '@shared/types';
import { useStore } from '../../store/store.tsx';

import { cn } from '../../lib/utils.ts';

export function SelectorEntidad() {
  const { entities, entidadActiva, verEntidad } = useStore();
  const visibles = entities.filter((e) => !e.archived);

  // Con una sola economia el selector no dice nada: hasta que no creen un
  // negocio, la pantalla se queda como estaba.
  if (visibles.length < 2) return null;

  const opciones = [
    { id: null as string | null, nombre: 'Todo', color: null as string | null },
    ...visibles.map((e) => ({ id: e.id as string | null, nombre: e.name, color: e.color })),
  ];

  // Hasta cinco entran en partes iguales, que es lo que lo hace simetrico y
  // callado. De ahi en adelante se desliza, porque partirlo en seis dejaria
  // cada nombre en dos letras.
  const enPartesIguales = opciones.length <= 5;

  return (
    <div
      role="tablist"
      className={cn(
        'superficie-2 borde border rounded-2xl p-1 gap-1',
        enPartesIguales ? 'grid' : 'flex overflow-x-auto sin-barra',
      )}
      style={enPartesIguales
        ? { gridTemplateColumns: `repeat(${opciones.length}, minmax(0, 1fr))` }
        : undefined}
    >
      {opciones.map((o) => {
        const activa = entidadActiva === o.id;
        return (
          <button
            key={o.id ?? 'todo'}
            role="tab"
            aria-selected={activa}
            onClick={() => verEntidad(o.id)}
            className={cn(
              'min-h-9 px-2 rounded-xl text-[13px] font-medium truncate transition-colors',
              !enPartesIguales && 'shrink-0 px-3.5',
              activa ? 'superficie txt shadow-sm' : 'txt-3',
            )}
            style={activa && o.color
              // Un fondo suave del color de la economia, no el color lleno: se
              // distingue igual y deja de gritar.
              ? { background: `color-mix(in srgb, ${o.color} 16%, var(--superficie))`, color: o.color }
              : undefined}
          >
            {o.nombre}
          </button>
        );
      })}
    </div>
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

/**
 * Las opciones de un desplegable, agrupadas por economia.
 *
 * Existe porque con dos economias hay dos "Suscripciones" y dos "Publicidad", y
 * en un desplegable nativo se ven exactamente iguales: elegir la equivocada
 * manda el gasto a la economia equivocada, y de ahi a las jarras equivocadas.
 *
 * `<optgroup>` es la forma nativa de resolverlo: el sistema operativo lo dibuja
 * con el titulo del grupo, en iOS y en Android, sin inventar nada.
 *
 * Con una sola economia no agrupa: un unico titulo repetido no dice nada.
 */
export function OpcionesPorEconomia<T extends { id: string; name: string; entityId: string | null }>(
  { items }: { items: T[] },
) {
  const { entities } = useStore();
  const economias = entities.filter((e) => !e.archived);

  if (economias.length < 2) {
    return <>{items.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</>;
  }

  const grupos = economias
    .map((e) => ({ economia: e, suyos: items.filter((x) => x.entityId === e.id) }))
    .filter((g) => g.suyos.length > 0);

  // Los que no cuelgan de ninguna economia viva van al final, dichos por su
  // nombre: esconderlos los volveria imposibles de arreglar.
  const sueltos = items.filter((x) => !economias.some((e) => e.id === x.entityId));

  return (
    <>
      {grupos.map(({ economia, suyos }) => (
        <optgroup key={economia.id} label={economia.name}>
          {suyos.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </optgroup>
      ))}
      {sueltos.length > 0 && (
        <optgroup label="Sin economía">
          {sueltos.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </optgroup>
      )}
    </>
  );
}
