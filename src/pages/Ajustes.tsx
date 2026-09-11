/**
 * Ajustes: la pareja, categorias, presupuestos, seguridad y exportacion.
 */

import { useMemo, useState } from 'react';
import { useStore } from '../store/store.tsx';
import { formatMonto, montoPlano, parseMonto } from '@shared/money';
import { claveMes } from '@shared/domain';
import { TX_TYPE_LABEL, TxType } from '@shared/types';
import { nombreMes } from '../lib/utils.ts';
import { api } from '../api/client.ts';
import { Avatar, Boton, Campo, Ficha, Hoja, Icono, Selector, Tarjeta } from '../components/ui/base.tsx';

export function Ajustes() {
  const {
    me, members, household, categories, budgets, accounts, transactions,
    guardarPresupuesto, salir, avisar,
  } = useStore();
  const moneda = household?.currency ?? 'USD';

  const [hoja, setHoja] = useState<null | 'invitar' | 'password' | 'presupuesto' | 'categorias'>(null);

  const mesActual = claveMes(Date.now());
  const delMes = budgets.filter((b) => b.period === mesActual);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold txt">Ajustes</h1>

      {/* La pareja */}
      <Tarjeta>
        <h2 className="font-semibold txt mb-3">{household?.name ?? 'Nuestra casa'}</h2>
        <div className="space-y-2.5">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3">
              <Avatar nombre={m.displayName} color={m.color} size={38} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium txt truncate">
                  {m.displayName}
                  {m.id === me?.id && <span className="txt-3 font-normal"> (vos)</span>}
                </p>
                <p className="text-xs txt-3 truncate">{m.email}</p>
              </div>
            </div>
          ))}
        </div>

        {members.length < 2 && (
          <Boton onClick={() => setHoja('invitar')} className="w-full mt-4">
            <Icono nombre="user-plus" size={17} /> Sumar a tu pareja
          </Boton>
        )}
      </Tarjeta>

      {/* Presupuestos */}
      <Tarjeta>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold txt">Presupuestos</h2>
          <button
            onClick={() => setHoja('presupuesto')}
            className="text-sm text-marca-600 dark:text-marca-500 font-medium min-h-9 px-1"
          >
            Agregar
          </button>
        </div>

        {delMes.length === 0 ? (
          <p className="text-sm txt-3">
            Sin presupuestos para {nombreMes(mesActual)}. Poner un tope por
            categoría ayuda a ver el desvío antes de que sea tarde.
          </p>
        ) : (
          <div className="space-y-2">
            {delMes.map((b) => {
              const cat = categories.find((c) => c.id === b.categoryId);
              return (
                <div key={b.id} className="flex items-center justify-between text-sm">
                  <span className="txt-2">{cat?.name ?? 'Todo el mes'}</span>
                  <span className="tabular txt font-medium">{formatMonto(b.amountMinor, moneda)}</span>
                </div>
              );
            })}
          </div>
        )}
      </Tarjeta>

      {/* Accesos */}
      <Tarjeta className="p-0 overflow-hidden">
        <Opcion
          icono="tags"
          titulo="Categorías"
          detalle={`${categories.filter((c) => !c.archived).length} activas`}
          alTocar={() => setHoja('categorias')}
        />
        <Opcion
          icono="lock"
          titulo="Cambiar contraseña"
          alTocar={() => setHoja('password')}
        />
        <Opcion
          icono="download"
          titulo="Exportar a CSV"
          detalle={`${transactions.length} movimientos`}
          alTocar={() => exportarCsv(transactions, categories, accounts, members, moneda, avisar)}
        />
      </Tarjeta>

      <Boton variante="secundario" onClick={() => void salir()} className="w-full">
        <Icono nombre="log-out" size={17} /> Cerrar sesion
      </Boton>

      <p className="text-xs txt-3 text-center px-6 leading-relaxed pb-2">
        Tus datos viven en tu propia base de Cloudflare. Nadie más que ustedes
        dos tiene acceso.
      </p>

      <HojaInvitar abierta={hoja === 'invitar'} alCerrar={() => setHoja(null)} />
      <HojaPassword abierta={hoja === 'password'} alCerrar={() => setHoja(null)} />
      <HojaPresupuesto
        abierta={hoja === 'presupuesto'}
        alCerrar={() => setHoja(null)}
        alGuardar={guardarPresupuesto}
      />
      <HojaCategorias abierta={hoja === 'categorias'} alCerrar={() => setHoja(null)} />
    </div>
  );
}

function Opcion({ icono, titulo, detalle, alTocar }: {
  icono: string; titulo: string; detalle?: string; alTocar: () => void;
}) {
  return (
    <button
      onClick={alTocar}
      className="w-full flex items-center gap-3 px-5 min-h-14 text-left border-b borde last:border-b-0 active:superficie-2 transition-colors"
    >
      <Icono nombre={icono} size={19} className="txt-2 shrink-0" />
      <span className="flex-1 text-sm font-medium txt">{titulo}</span>
      {detalle && <span className="text-xs txt-3 shrink-0">{detalle}</span>}
      <Icono nombre="chevron-right" size={17} className="txt-3 shrink-0" />
    </button>
  );
}

function HojaInvitar({ abierta, alCerrar }: { abierta: boolean; alCerrar: () => void }) {
  const { invitar, avisar } = useStore();
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [pass, setPass] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar() {
    setCargando(true);
    setError(null);
    try {
      await invitar({ email, password: pass, displayName: nombre });
      avisar(`${nombre} ya puede entrar con ese email y contraseña`, 'ok');
      setEmail(''); setNombre(''); setPass('');
      alCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear');
    } finally {
      setCargando(false);
    }
  }

  return (
    <Hoja abierta={abierta} alCerrar={alCerrar} titulo="Sumar a tu pareja">
      <div className="space-y-4">
        <p className="text-sm txt-2 leading-relaxed">
          Le creás la cuenta vos y le pasás los datos. Va a ver exactamente lo
          mismo que vos, en tiempo real.
        </p>
        <Campo etiqueta="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Cómo se llama" />
        <Campo etiqueta="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="su@email.com" autoComplete="off" />
        <Campo etiqueta="Contraseña" type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Mínimo 8 caracteres" autoComplete="new-password" />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <Boton
          onClick={() => void enviar()}
          disabled={!email || !nombre || pass.length < 8 || cargando}
          className="w-full min-h-12"
        >
          {cargando ? 'Creando...' : 'Crear su cuenta'}
        </Boton>
      </div>
    </Hoja>
  );
}

function HojaPassword({ abierta, alCerrar }: { abierta: boolean; alCerrar: () => void }) {
  const { avisar } = useStore();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar() {
    setCargando(true);
    setError(null);
    try {
      await api.cambiarPassword(actual, nueva);
      avisar('Contraseña actualizada', 'ok');
      setActual(''); setNueva('');
      alCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar');
    } finally {
      setCargando(false);
    }
  }

  return (
    <Hoja abierta={abierta} alCerrar={alCerrar} titulo="Cambiar contraseña">
      <div className="space-y-4">
        <Campo etiqueta="Contraseña actual" type="password" value={actual} onChange={(e) => setActual(e.target.value)} autoComplete="current-password" />
        <Campo etiqueta="Nueva contraseña" type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="Mínimo 8 caracteres" autoComplete="new-password" />
        <p className="text-xs txt-3">Al cambiarla se cierran las sesiones abiertas en otros dispositivos.</p>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <Boton onClick={() => void enviar()} disabled={!actual || nueva.length < 8 || cargando} className="w-full min-h-12">
          {cargando ? 'Guardando...' : 'Cambiar'}
        </Boton>
      </div>
    </Hoja>
  );
}

function HojaPresupuesto({ abierta, alCerrar, alGuardar }: {
  abierta: boolean;
  alCerrar: () => void;
  alGuardar: (b: { categoryId: string | null; amountMinor: number; period: string }) => Promise<void>;
}) {
  const { categories, household, budgets, avisar } = useStore();
  const moneda = household?.currency ?? 'USD';
  const mesActual = claveMes(Date.now());

  const [categoryId, setCategoryId] = useState('');
  const [monto, setMonto] = useState('');
  const [cargando, setCargando] = useState(false);

  // Si ya hay un presupuesto para esa categoria, se precarga el monto.
  const existente = useMemo(
    () => budgets.find((b) => b.period === mesActual && (b.categoryId ?? '') === categoryId),
    [budgets, mesActual, categoryId],
  );

  const gastos = categories.filter((c) => !c.archived && c.type === 'gasto');
  const montoMinor = parseMonto(monto, moneda);

  return (
    <Hoja abierta={abierta} alCerrar={alCerrar} titulo={`Presupuesto de ${nombreMes(mesActual)}`}>
      <div className="space-y-4">
        <Selector
          etiqueta="Categoría"
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value);
            const b = budgets.find((x) => x.period === mesActual && (x.categoryId ?? '') === e.target.value);
            setMonto(b ? montoPlano(b.amountMinor, moneda) : '');
          }}
        >
          <option value="">Todo el mes (global)</option>
          {gastos.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Selector>

        <Campo
          etiqueta="Tope mensual"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          placeholder="0.00"
          inputMode="decimal"
        />

        {existente && (
          <p className="text-xs txt-3">
            Ya había un tope de {formatMonto(existente.amountMinor, moneda)}. Se reemplaza.
          </p>
        )}

        <Boton
          onClick={async () => {
            if (montoMinor === null) return;
            setCargando(true);
            try {
              await alGuardar({ categoryId: categoryId || null, amountMinor: montoMinor, period: mesActual });
              setMonto(''); setCategoryId('');
              alCerrar();
            } catch (e) {
              avisar(e instanceof Error ? e.message : 'No se pudo guardar');
            } finally {
              setCargando(false);
            }
          }}
          disabled={montoMinor === null || montoMinor < 0 || cargando}
          className="w-full min-h-12"
        >
          {cargando ? 'Guardando...' : 'Guardar'}
        </Boton>
      </div>
    </Hoja>
  );
}

function HojaCategorias({ abierta, alCerrar }: { abierta: boolean; alCerrar: () => void }) {
  const { categories, guardarCategoria, avisar } = useStore();
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<'ingreso' | 'gasto'>('gasto');

  const visibles = categories.filter((c) => !c.archived);

  return (
    <Hoja abierta={abierta} alCerrar={alCerrar} titulo="Categorías">
      <div className="space-y-4">
        <div className="flex gap-2">
          <Campo
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nueva categoría"
            className="flex-1"
          />
          <Selector value={tipo} onChange={(e) => setTipo(e.target.value as 'ingreso' | 'gasto')} className="w-32">
            <option value="gasto">Gasto</option>
            <option value="ingreso">Ingreso</option>
          </Selector>
        </div>

        <Boton
          onClick={async () => {
            if (!nombre.trim()) return;
            try {
              await guardarCategoria({ name: nombre.trim(), type: tipo, icon: 'tag', color: '#64748b' });
              setNombre('');
            } catch (e) {
              avisar(e instanceof Error ? e.message : 'No se pudo crear');
            }
          }}
          disabled={!nombre.trim()}
          className="w-full"
        >
          Agregar
        </Boton>

        <div className="space-y-1.5 pt-2">
          {visibles.map((c) => (
            <div key={c.id} className="flex items-center gap-3 py-1.5">
              <Ficha color={c.color} icono={c.icon} size={34} />
              <span className="flex-1 text-sm txt truncate">{c.name}</span>
              <span className="text-xs txt-3 shrink-0">{c.type === 'gasto' ? 'Gasto' : 'Ingreso'}</span>
              <button
                onClick={async () => {
                  try {
                    await guardarCategoria({ archived: true }, c.id);
                  } catch (e) {
                    avisar(e instanceof Error ? e.message : 'No se pudo archivar');
                  }
                }}
                aria-label={`Archivar ${c.name}`}
                className="w-9 h-9 rounded-lg flex items-center justify-center txt-3 shrink-0"
              >
                <Icono nombre="archive" size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </Hoja>
  );
}

/**
 * Exporta todo a CSV. Importa para no quedar encerrado: los datos son tuyos y
 * tenes que poder llevartelos a una planilla cuando quieras.
 */
function exportarCsv(
  transactions: { id: string; type: TxType; amountMinor: number; description: string; date: number; categoryId: string | null; accountId: string; createdBy: string; notes: string | null }[],
  categories: { id: string; name: string }[],
  accounts: { id: string; name: string }[],
  members: { id: string; displayName: string }[],
  moneda: string,
  avisar: (t: string, tipo?: 'error' | 'ok') => void,
): void {
  const cat = new Map(categories.map((c) => [c.id, c.name]));
  const acc = new Map(accounts.map((a) => [a.id, a.name]));
  const mem = new Map(members.map((m) => [m.id, m.displayName]));

  // Comillas dobles escapadas, por si una descripcion trae comas o saltos.
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;

  const filas = [
    ['Fecha', 'Tipo', 'Descripcion', 'Monto', 'Moneda', 'Categoria', 'Cuenta', 'Quien', 'Notas'].join(','),
    ...transactions.map((t) => [
      new Date(t.date).toISOString().slice(0, 10),
      esc(TX_TYPE_LABEL[t.type] ?? ''),
      esc(t.description),
      // Sin separador de miles y con punto decimal: asi lo lee cualquier planilla.
      montoPlano(t.amountMinor, moneda),
      moneda,
      esc(cat.get(t.categoryId ?? '') ?? ''),
      esc(acc.get(t.accountId) ?? ''),
      esc(mem.get(t.createdBy) ?? ''),
      esc(t.notes ?? ''),
    ].join(',')),
  ].join('\n');

  try {
    // BOM al principio para que Excel respete los acentos.
    const blob = new Blob(['﻿' + filas], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gastos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    avisar('No se pudo generar el archivo');
  }
}
