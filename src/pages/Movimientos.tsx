/**
 * Listado de movimientos con periodo, busqueda y filtros.
 *
 * Todos los filtros son independientes y se combinan: se puede pedir "los
 * gastos de comida que hizo Avalon la semana pasada" sin que uno anule a otro.
 */

import { useMemo, useState } from 'react';
import { useStore } from '../store/store.tsx';
import { formatMonto } from '@shared/money';
import { autorDe, filtrarPorEntidad, resumir } from '@shared/domain';
import { dentroDe, periodoMes, type Periodo } from '@shared/periodo';
import { TxType, type Transaction } from '@shared/types';
import { fechaCorta } from '../lib/utils.ts';
import { Boton, Campo, Icono, Tarjeta, Vacio } from '../components/ui/base.tsx';
import { SelectorEntidad } from '../components/ui/entidad.tsx';
import { SelectorPeriodo } from '../components/ui/periodo.tsx';
import { FilaMovimiento } from './Inicio.tsx';
import { cn } from '../lib/utils.ts';

type FiltroQuien = 'todos' | string;
type FiltroTipo = 'todos' | 'gastos' | 'ingresos' | 'transferencias';

export function Movimientos({ alVerMovimiento, alAgregar }: {
  alVerMovimiento: (tx: Transaction) => void;
  alAgregar: () => void;
}) {
  const {
    transactions: todos, categories, accounts, members, household, entities,
    entidadActiva, verEntidad,
  } = useStore();

  // La lista respeta la economia elegida. En "Todo" no filtra nada.
  const transactions = useMemo(
    () => filtrarPorEntidad(todos, categories, entidadActiva),
    [todos, categories, entidadActiva],
  );
  const moneda = household?.currency ?? 'USD';

  const [periodo, setPeriodo] = useState<Periodo>(() => periodoMes(Date.now()));
  const [busqueda, setBusqueda] = useState('');
  const [quien, setQuien] = useState<FiltroQuien>('todos');
  const [tipo, setTipo] = useState<FiltroTipo>('todos');
  const [categoria, setCategoria] = useState('');
  const [cuenta, setCuenta] = useState('');
  const [verFiltros, setVerFiltros] = useState(false);

  const filtrados = useMemo(() => {
    let lista = transactions.filter((t) => dentroDe(t.date, periodo));

    if (quien !== 'todos') lista = lista.filter((t) => autorDe(t) === quien);

    if (tipo === 'gastos') lista = lista.filter((t) => t.type === TxType.GASTO);
    else if (tipo === 'ingresos') lista = lista.filter((t) => t.type === TxType.INGRESO);
    else if (tipo === 'transferencias') lista = lista.filter((t) => t.type === TxType.TRANSFERENCIA);

    if (categoria) lista = lista.filter((t) => t.categoryId === categoria);
    if (cuenta) lista = lista.filter((t) => t.accountId === cuenta || t.destAccountId === cuenta);

    const q = busqueda.trim().toLowerCase();
    if (q) {
      lista = lista.filter(
        (t) => t.description.toLowerCase().includes(q) || (t.notes ?? '').toLowerCase().includes(q),
      );
    }

    return lista;
  }, [transactions, periodo, quien, tipo, categoria, cuenta, busqueda]);

  const resumen = useMemo(() => resumir(filtrados), [filtrados]);

  /** Agrupado por dia, que es como se lee naturalmente un extracto. */
  const porDia = useMemo(() => {
    const grupos = new Map<string, Transaction[]>();
    for (const tx of filtrados) {
      const clave = new Date(tx.date).toDateString();
      const lista = grupos.get(clave);
      if (lista) lista.push(tx);
      else grupos.set(clave, [tx]);
    }
    return [...grupos.entries()];
  }, [filtrados]);

  const activos = [
    quien !== 'todos', tipo !== 'todos', categoria !== '', cuenta !== '', busqueda !== '',
  ].filter(Boolean).length;

  // Cuantos habria en este periodo SIN el filtro de economia. Sirve para no
  // echarle la culpa al mes cuando en realidad la lista esta vacia porque la
  // economia elegida todavia no tiene ninguna categoria asignada: decir
  // "periodo sin movimientos" ahi es directamente mentir.
  const hayEnElPeriodo = useMemo(
    () => todos.filter((t) => dentroDe(t.date, periodo)).length,
    [todos, periodo],
  );
  const vacioPorLaEconomia = entidadActiva !== null && activos === 0 && hayEnElPeriodo > 0;
  const nombreActiva = entities.find((e) => e.id === entidadActiva)?.name ?? '';

  const limpiar = () => {
    setQuien('todos'); setTipo('todos'); setCategoria(''); setCuenta(''); setBusqueda('');
  };

  return (
    <div className="space-y-4">
      <SelectorEntidad />
      <SelectorPeriodo periodo={periodo} alCambiar={setPeriodo} />

      <div className="flex gap-2">
        <Campo
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar..."
          type="search"
          className="flex-1"
        />
        <button
          onClick={() => setVerFiltros(!verFiltros)}
          aria-label="Filtros"
          className={cn(
            'w-11 min-h-11 rounded-xl border flex items-center justify-center shrink-0 relative transition-colors',
            activos > 0 ? 'bg-marca-600 text-white border-transparent' : 'superficie-2 borde txt-2',
          )}
        >
          <Icono nombre="filter" size={18} />
          {activos > 0 && (
            <span className="absolute -top-1 -right-1 w-4.5 h-4.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
              {activos}
            </span>
          )}
        </button>
      </div>

      {verFiltros && (
        <div className="space-y-3 superficie-2 rounded-2xl p-3">
          {members.length > 1 && (
            <Segmentado
              valor={quien}
              alCambiar={setQuien}
              opciones={[
                { id: 'todos', etiqueta: 'Los dos' },
                ...members.map((m) => ({ id: m.id, etiqueta: m.displayName })),
              ]}
            />
          )}

          <Segmentado
            valor={tipo}
            alCambiar={setTipo}
            opciones={[
              { id: 'todos', etiqueta: 'Todo' },
              { id: 'gastos', etiqueta: 'Gastos' },
              { id: 'ingresos', etiqueta: 'Ingresos' },
              { id: 'transferencias', etiqueta: 'Transf.' },
            ]}
          />

          {/* Cuando hay varias economias, la ficha dice de cual es: sin eso,
              dos "Suscripciones" se ven identicas y el filtro parece roto. */}
          <div className="flex gap-2 overflow-x-auto sin-barra pb-1">
            {categories.filter((c) => (
              !c.archived && (entidadActiva === null || c.entityId === entidadActiva)
            )).map((c) => (
              <button
                key={c.id}
                onClick={() => setCategoria(categoria === c.id ? '' : c.id)}
                className={cn(
                  'shrink-0 min-h-9 px-3 rounded-full border text-xs font-medium flex items-center gap-1.5 transition-all',
                  categoria === c.id ? 'border-transparent text-white' : 'superficie borde txt-2',
                )}
                style={categoria === c.id ? { background: c.color } : undefined}
              >
                <Icono nombre={c.icon} size={13} />
                <span className="flex flex-col items-start leading-tight">
                  {c.name}
                  {entidadActiva === null && entities.filter((e) => !e.archived).length > 1 && (
                    <span
                      className="text-[9px] font-normal"
                      style={{
                        color: categoria === c.id
                          ? 'rgb(255 255 255 / 0.75)'
                          : (entities.find((e) => e.id === c.entityId)?.color ?? 'var(--texto-3)'),
                      }}
                    >
                      {entities.find((e) => e.id === c.entityId)?.name ?? 'Sin economía'}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>

          <div className="flex gap-2 overflow-x-auto sin-barra pb-1">
            {accounts.filter((a) => !a.archived).map((a) => (
              <button
                key={a.id}
                onClick={() => setCuenta(cuenta === a.id ? '' : a.id)}
                className={cn(
                  'shrink-0 min-h-9 px-3 rounded-full border text-xs font-medium flex items-center gap-1.5 transition-all',
                  cuenta === a.id ? 'border-transparent text-white' : 'superficie borde txt-2',
                )}
                style={cuenta === a.id ? { background: a.color } : undefined}
              >
                <Icono nombre={a.icon} size={13} />
                {a.name}
              </button>
            ))}
          </div>

          {activos > 0 && (
            <button onClick={limpiar} className="w-full min-h-10 text-sm txt-2 rounded-xl superficie">
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {filtrados.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <Mini etiqueta="Movimientos" valor={String(resumen.cantidad)} />
          <Mini etiqueta="Gastos" valor={formatMonto(resumen.gastoMinor, moneda, { compacto: true })} />
          <Mini etiqueta="Ingresos" valor={formatMonto(resumen.ingresoMinor, moneda, { compacto: true })} />
        </div>
      )}

      {filtrados.length === 0 ? (
        <Tarjeta>
          <Vacio
            icono={vacioPorLaEconomia ? 'filter' : activos > 0 ? 'search-x' : 'receipt-text'}
            titulo={vacioPorLaEconomia
              ? `Nada en ${nombreActiva}`
              : activos > 0 ? 'Nada coincide' : 'Período sin movimientos'}
            texto={vacioPorLaEconomia
              ? `Hay ${hayEnElPeriodo} movimiento${hayEnElPeriodo === 1 ? '' : 's'} este mes, pero ninguno es de ${nombreActiva}. Un movimiento pertenece a la economía de su categoría: asigná las categorías de ${nombreActiva} en Ajustes → Categorías.`
              : activos > 0
                ? 'Probá cambiando los filtros o buscando otra cosa.'
                : 'No hay movimientos registrados en este período.'}
            accion={vacioPorLaEconomia
              ? <Boton variante="secundario" onClick={() => verEntidad(null)}>Ver todo</Boton>
              : activos > 0
                ? <Boton variante="secundario" onClick={limpiar}>Limpiar filtros</Boton>
                : <Boton onClick={alAgregar}>Registrar movimiento</Boton>}
          />
        </Tarjeta>
      ) : (
        <div className="space-y-3">
          {porDia.map(([dia, txs]) => (
            <Tarjeta key={dia} className="py-3">
              <p className="text-xs font-medium txt-3 px-1 mb-1">{fechaCorta(txs[0].date)}</p>
              <div className="divide-y divide-[var(--borde)] -mx-1">
                {txs.map((tx) => (
                  <FilaMovimiento key={tx.id} tx={tx} alTocar={() => alVerMovimiento(tx)} />
                ))}
              </div>
            </Tarjeta>
          ))}
        </div>
      )}
    </div>
  );
}

function Segmentado<T extends string>({ valor, alCambiar, opciones }: {
  valor: T; alCambiar: (v: T) => void; opciones: { id: T; etiqueta: string }[];
}) {
  return (
    <div className="flex gap-1 p-1 rounded-xl superficie">
      {opciones.map((o) => (
        <button
          key={o.id}
          onClick={() => alCambiar(o.id)}
          className={cn(
            'flex-1 min-h-9 rounded-lg text-xs font-medium transition-all truncate px-2',
            valor === o.id ? 'superficie-2 txt shadow-sm' : 'txt-2',
          )}
        >
          {o.etiqueta}
        </button>
      ))}
    </div>
  );
}

function Mini({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="superficie borde border rounded-2xl p-3 text-center">
      <p className="text-[10px] txt-3 mb-0.5">{etiqueta}</p>
      <p className="text-sm font-semibold tabular txt truncate">{valor}</p>
    </div>
  );
}
