/**
 * Listado de movimientos con busqueda y filtros.
 *
 * El filtro "Solo mios / Solo suyos" es la vista individual que pide el
 * planteo: el libro es uno solo y compartido, pero cada movimiento sabe quien
 * lo cargo, asi que se puede mirar por separado sin partir los datos.
 */

import { useMemo, useState } from 'react';
import { useStore } from '../store/store.tsx';
import { formatMonto } from '@shared/money';
import { claveMes, resumir, transaccionesDelMes } from '@shared/domain';
import { TxType, type Transaction } from '@shared/types';
import { fechaCorta, moverMes, nombreMes } from '../lib/utils.ts';
import { Boton, Campo, Icono, Tarjeta, Vacio } from '../components/ui/base.tsx';
import { FilaMovimiento } from './Inicio.tsx';
import { cn } from '../lib/utils.ts';

type FiltroQuien = 'todos' | 'mios' | 'suyos';
type FiltroTipo = 'todos' | 'gastos' | 'ingresos';

export function Movimientos({ alEditar, alAgregar }: {
  alEditar: (tx: Transaction) => void;
  alAgregar: () => void;
}) {
  const { transactions, categories, me, members, household } = useStore();
  const moneda = household?.currency ?? 'USD';

  const [mes, setMes] = useState(() => claveMes(Date.now()));
  const [busqueda, setBusqueda] = useState('');
  const [quien, setQuien] = useState<FiltroQuien>('todos');
  const [tipo, setTipo] = useState<FiltroTipo>('todos');
  const [categoria, setCategoria] = useState('');

  const pareja = members.find((m) => m.id !== me?.id);

  const filtrados = useMemo(() => {
    let lista = transaccionesDelMes(transactions, mes);

    if (quien === 'mios') lista = lista.filter((t) => t.createdBy === me?.id);
    else if (quien === 'suyos' && pareja) lista = lista.filter((t) => t.createdBy === pareja.id);

    if (tipo === 'gastos') lista = lista.filter((t) => t.type === TxType.GASTO);
    else if (tipo === 'ingresos') lista = lista.filter((t) => t.type === TxType.INGRESO);

    if (categoria) lista = lista.filter((t) => t.categoryId === categoria);

    const q = busqueda.trim().toLowerCase();
    if (q) {
      lista = lista.filter(
        (t) => t.description.toLowerCase().includes(q) || (t.notes ?? '').toLowerCase().includes(q),
      );
    }

    return lista;
  }, [transactions, mes, quien, tipo, categoria, busqueda, me, pareja]);

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

  const hayFiltros = quien !== 'todos' || tipo !== 'todos' || categoria !== '' || busqueda !== '';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setMes(moverMes(mes, -1))}
          aria-label="Mes anterior"
          className="w-10 h-10 rounded-xl superficie-2 flex items-center justify-center txt-2"
        >
          <Icono nombre="chevron-left" size={19} />
        </button>
        <h1 className="font-semibold txt capitalize">{nombreMes(mes)}</h1>
        <button
          onClick={() => setMes(moverMes(mes, 1))}
          disabled={mes === claveMes(Date.now())}
          aria-label="Mes siguiente"
          className="w-10 h-10 rounded-xl superficie-2 flex items-center justify-center txt-2 disabled:opacity-30"
        >
          <Icono nombre="chevron-right" size={19} />
        </button>
      </div>

      <Campo
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar..."
        type="search"
      />

      {/* Filtros: quien y tipo */}
      <div className="space-y-2">
        {members.length > 1 && (
          <Segmentado
            valor={quien}
            alCambiar={setQuien}
            opciones={[
              { id: 'todos', etiqueta: 'Los dos' },
              { id: 'mios', etiqueta: 'Mios' },
              { id: 'suyos', etiqueta: pareja?.displayName ?? 'Suyos' },
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
          ]}
        />
      </div>

      {/* Categorias */}
      <div className="flex gap-2 overflow-x-auto sin-barra -mx-4 px-4 pb-1">
        {categories.filter((c) => !c.archived).map((c) => (
          <button
            key={c.id}
            onClick={() => setCategoria(categoria === c.id ? '' : c.id)}
            className={cn(
              'shrink-0 min-h-9 px-3 rounded-full border text-xs font-medium flex items-center gap-1.5 transition-all',
              categoria === c.id ? 'border-transparent text-white' : 'superficie-2 borde txt-2',
            )}
            style={categoria === c.id ? { background: c.color } : undefined}
          >
            <Icono nombre={c.icon} size={13} />
            {c.name}
          </button>
        ))}
      </div>

      {/* Totales de lo filtrado */}
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
            icono={hayFiltros ? 'search-x' : 'receipt-text'}
            titulo={hayFiltros ? 'Nada coincide' : 'Mes sin movimientos'}
            texto={hayFiltros
              ? 'Proba cambiando los filtros o buscando otra cosa.'
              : 'Todavia no registraron nada en este mes.'}
            accion={hayFiltros
              ? <Boton variante="secundario" onClick={() => {
                setQuien('todos'); setTipo('todos'); setCategoria(''); setBusqueda('');
              }}>Limpiar filtros</Boton>
              : <Boton onClick={alAgregar}>Registrar movimiento</Boton>}
          />
        </Tarjeta>
      ) : (
        <div className="space-y-3">
          {porDia.map(([dia, txs]) => (
            <Tarjeta key={dia} className="py-3">
              <p className="text-xs font-medium txt-3 px-1 mb-1">
                {fechaCorta(txs[0].date)}
              </p>
              <div className="divide-y divide-[var(--borde)] -mx-1">
                {txs.map((tx) => (
                  <FilaMovimiento key={tx.id} tx={tx} alTocar={() => alEditar(tx)} />
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
  valor: T;
  alCambiar: (v: T) => void;
  opciones: { id: T; etiqueta: string }[];
}) {
  return (
    <div className="flex gap-1 p-1 rounded-xl superficie-2">
      {opciones.map((o) => (
        <button
          key={o.id}
          onClick={() => alCambiar(o.id)}
          className={cn(
            'flex-1 min-h-9 rounded-lg text-xs font-medium transition-all truncate px-2',
            valor === o.id ? 'superficie txt shadow-sm' : 'txt-2',
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
