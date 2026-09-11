/**
 * Ajustes: perfil, la pareja, presupuestos, pagos habituales, categorias,
 * orden del Inicio, seguridad y exportacion.
 */

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/store.tsx';
import { api } from '../api/client.ts';
import { formatMonto, montoPlano, parseMonto } from '@shared/money';
import { claveMes, estadoPresupuestos } from '@shared/domain';
import { MIN_PASSWORD } from '@shared/kdf';
import {
  SECCIONES_INICIO, SECCION_LABEL, TX_TYPE_LABEL, TxType,
  type Budget, type Category, type SeccionInicio,
} from '@shared/types';
import { nombreMes } from '../lib/utils.ts';
import {
  Avatar, Barra, Boton, Campo, Ficha, Hoja, Icono, SelectorColor,
  SelectorIcono, Selector, Tarjeta,
} from '../components/ui/base.tsx';
import { SelectorEmoji } from '../components/ui/emoji.tsx';
import { useConfirmar } from '../components/ui/confirmar.tsx';
import { PagosHabituales } from './ajustes/PagosHabituales.tsx';
import { cn } from '../lib/utils.ts';

type Hoja1 = null | 'invitar' | 'password' | 'presupuesto' | 'categorias' | 'perfil' | 'inicio';

export function Ajustes() {
  const {
    me, members, household, categories, budgets, accounts, transactions, salir,
  } = useStore();
  const moneda = household?.currency ?? 'USD';

  const [hoja, setHoja] = useState<Hoja1>(null);
  const [presupuestoEdit, setPresupuestoEdit] = useState<Budget | null>(null);

  const mesActual = claveMes(Date.now());
  const delMes = useMemo(
    () => estadoPresupuestos(budgets, transactions, mesActual),
    [budgets, transactions, mesActual],
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold txt">Ajustes</h1>

      {/* Perfil y hogar */}
      <Tarjeta>
        <h2 className="font-semibold txt mb-3">{household?.name ?? 'Nuestra casa'}</h2>
        <div className="space-y-2.5">
          {members.map((m) => (
            <button
              key={m.id}
              onClick={() => m.id === me?.id && setHoja('perfil')}
              disabled={m.id !== me?.id}
              className="w-full flex items-center gap-3 text-left disabled:cursor-default"
            >
              <Avatar nombre={m.displayName} color={m.color} emoji={m.emoji} size={38} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium txt truncate">
                  {m.displayName}
                  {m.id === me?.id && <span className="txt-3 font-normal"> (vos)</span>}
                </p>
                <p className="text-xs txt-3 truncate">{m.email}</p>
              </div>
              {m.id === me?.id && <Icono nombre="pencil" size={15} className="txt-3 shrink-0" />}
            </button>
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
            onClick={() => { setPresupuestoEdit(null); setHoja('presupuesto'); }}
            className="text-sm text-marca-600 dark:text-marca-500 font-medium min-h-9 px-1"
          >
            Agregar
          </button>
        </div>

        {delMes.length === 0 ? (
          <p className="text-sm txt-3 leading-relaxed">
            Sin presupuestos para {nombreMes(mesActual)}. Poner un tope por
            categoría ayuda a ver el desvío antes de que sea tarde.
          </p>
        ) : (
          <div className="space-y-3.5">
            {delMes.map(({ budget, gastadoMinor, ratio }) => {
              const cat = categories.find((c) => c.id === budget.categoryId);
              return (
                <button
                  key={budget.id}
                  onClick={() => { setPresupuestoEdit(budget); setHoja('presupuesto'); }}
                  className="w-full text-left"
                >
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span className="text-sm font-medium txt">{cat?.name ?? 'Todo el mes'}</span>
                    <span className={cn(
                      'text-xs tabular',
                      ratio > 1 ? 'text-red-500 font-semibold' : ratio > 0.8 ? 'text-amber-500' : 'txt-2',
                    )}>
                      {formatMonto(gastadoMinor, moneda, { compacto: true })} / {formatMonto(budget.amountMinor, moneda, { compacto: true })}
                    </span>
                  </div>
                  <Barra ratio={ratio} color={cat?.color ?? '#10b981'} alerta />
                </button>
              );
            })}
          </div>
        )}
      </Tarjeta>

      <PagosHabituales />

      {/* Accesos */}
      <Tarjeta className="p-0 overflow-hidden">
        <Opcion
          icono="tags"
          titulo="Categorías"
          detalle={`${categories.filter((c) => !c.archived).length} activas`}
          alTocar={() => setHoja('categorias')}
        />
        <Opcion icono="grip-vertical" titulo="Ordenar el inicio" alTocar={() => setHoja('inicio')} />
        <Opcion icono="lock" titulo="Cambiar contraseña" alTocar={() => setHoja('password')} />
        <Opcion
          icono="download"
          titulo="Exportar a CSV"
          detalle={`${transactions.length} movimientos`}
          alTocar={() => exportarCsv(transactions, categories, accounts, members, moneda)}
        />
      </Tarjeta>

      <Boton variante="secundario" onClick={() => void salir()} className="w-full">
        <Icono nombre="log-out" size={17} /> Cerrar sesión
      </Boton>

      <p className="text-xs txt-3 text-center px-6 leading-relaxed pb-2">
        Tus datos viven en tu propia base de Cloudflare. Nadie más que ustedes
        dos tiene acceso.
      </p>

      <HojaPerfil abierta={hoja === 'perfil'} alCerrar={() => setHoja(null)} />
      <HojaOrdenInicio abierta={hoja === 'inicio'} alCerrar={() => setHoja(null)} />
      <HojaInvitar abierta={hoja === 'invitar'} alCerrar={() => setHoja(null)} />
      <HojaPassword abierta={hoja === 'password'} alCerrar={() => setHoja(null)} />
      <HojaPresupuesto
        abierta={hoja === 'presupuesto'}
        alCerrar={() => { setHoja(null); setPresupuestoEdit(null); }}
        editando={presupuestoEdit}
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

// --- perfil ---------------------------------------------------------------

function HojaPerfil({ abierta, alCerrar }: { abierta: boolean; alCerrar: () => void }) {
  const { me, guardarPerfil, avisar } = useStore();
  const [nombre, setNombre] = useState('');
  const [color, setColor] = useState('#10b981');
  const [emoji, setEmoji] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!abierta || !me) return;
    setNombre(me.displayName);
    setColor(me.color);
    setEmoji(me.emoji);
  }, [abierta, me]);

  return (
    <Hoja abierta={abierta} alCerrar={alCerrar} titulo="Tu perfil">
      <div className="space-y-5">
        <div className="flex flex-col items-center pt-1">
          <Avatar nombre={nombre || '?'} color={color} emoji={emoji} size={72} />
          <p className="text-sm txt-3 mt-2">Así te ven en la app</p>
        </div>

        <Campo etiqueta="Tu nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />

        <div>
          <span className="block text-xs font-medium txt-2 mb-2">Color</span>
          <SelectorColor valor={color} alElegir={setColor} />
        </div>

        <div>
          <span className="block text-xs font-medium txt-2 mb-2">Ícono</span>
          <SelectorEmoji valor={emoji} alElegir={setEmoji} color={color} />
        </div>

        <Boton
          onClick={async () => {
            setGuardando(true);
            try {
              await guardarPerfil({ displayName: nombre.trim(), color, emoji });
              alCerrar();
            } catch (e) {
              avisar(e instanceof Error ? e.message : 'No se pudo guardar');
            } finally {
              setGuardando(false);
            }
          }}
          disabled={!nombre.trim() || guardando}
          className="w-full min-h-12"
        >
          {guardando ? 'Guardando...' : 'Guardar'}
        </Boton>
      </div>
    </Hoja>
  );
}

// --- orden del inicio -----------------------------------------------------

/**
 * Ordenar y ocultar las secciones del Inicio.
 *
 * Se mueve con flechas y no arrastrando. Arrastrar en una lista dentro de una
 * hoja que ya scrollea pelea con el scroll y en el celular termina siendo
 * frustrante; las flechas siempre hacen lo que dicen.
 */
function HojaOrdenInicio({ abierta, alCerrar }: { abierta: boolean; alCerrar: () => void }) {
  const { me, guardarPerfil, avisar } = useStore();
  const [orden, setOrden] = useState<SeccionInicio[]>([]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!abierta) return;
    setOrden(me?.homeLayout?.length ? me.homeLayout : [...SECCIONES_INICIO]);
  }, [abierta, me]);

  const ocultas = SECCIONES_INICIO.filter((s) => !orden.includes(s));

  const mover = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= orden.length) return;
    const copia = [...orden];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    setOrden(copia);
  };

  return (
    <Hoja abierta={abierta} alCerrar={alCerrar} titulo="Ordenar el inicio">
      <div className="space-y-4">
        <p className="text-sm txt-2 leading-relaxed">
          Acomodá las secciones como las querés ver. Es tuyo: tu pareja tiene
          su propio orden.
        </p>

        <div className="space-y-2">
          {orden.map((s, i) => (
            <div key={s} className="flex items-center gap-2 superficie-2 rounded-xl p-2">
              <span className="flex-1 text-sm font-medium txt px-1.5 truncate">{SECCION_LABEL[s]}</span>
              <button
                onClick={() => mover(i, -1)}
                disabled={i === 0}
                aria-label="Subir"
                className="w-9 h-9 rounded-lg superficie flex items-center justify-center txt-2 disabled:opacity-25"
              >
                <Icono nombre="chevron-up" size={16} />
              </button>
              <button
                onClick={() => mover(i, 1)}
                disabled={i === orden.length - 1}
                aria-label="Bajar"
                className="w-9 h-9 rounded-lg superficie flex items-center justify-center txt-2 disabled:opacity-25"
              >
                <Icono nombre="chevron-down" size={16} />
              </button>
              <button
                onClick={() => setOrden(orden.filter((x) => x !== s))}
                aria-label="Ocultar"
                className="w-9 h-9 rounded-lg superficie flex items-center justify-center txt-3"
              >
                <Icono nombre="eye" size={16} />
              </button>
            </div>
          ))}
        </div>

        {ocultas.length > 0 && (
          <div>
            <p className="text-xs font-medium txt-3 mb-2">Ocultas</p>
            <div className="flex gap-2 flex-wrap">
              {ocultas.map((s) => (
                <button
                  key={s}
                  onClick={() => setOrden([...orden, s])}
                  className="min-h-9 px-3 rounded-full superficie-2 borde border text-xs font-medium txt-2 flex items-center gap-1.5"
                >
                  <Icono nombre="plus" size={13} /> {SECCION_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Boton variante="secundario" onClick={() => setOrden([...SECCIONES_INICIO])} className="flex-1">
            Restaurar
          </Boton>
          <Boton
            onClick={async () => {
              setGuardando(true);
              try {
                await guardarPerfil({ homeLayout: orden });
                alCerrar();
              } catch (e) {
                avisar(e instanceof Error ? e.message : 'No se pudo guardar');
              } finally {
                setGuardando(false);
              }
            }}
            disabled={guardando}
            className="flex-1 min-h-12"
          >
            {guardando ? 'Guardando...' : 'Guardar'}
          </Boton>
        </div>
      </div>
    </Hoja>
  );
}

// --- categorias -----------------------------------------------------------

function HojaCategorias({ abierta, alCerrar }: { abierta: boolean; alCerrar: () => void }) {
  const { categories, guardarCategoria, avisar } = useStore();
  const confirmar = useConfirmar();
  const [editando, setEditando] = useState<Category | null>(null);

  const visibles = categories.filter((c) => !c.archived);
  const gastos = visibles.filter((c) => c.type === 'gasto');
  const ingresos = visibles.filter((c) => c.type === 'ingreso');

  async function archivar(c: Category) {
    const ok = await confirmar({
      titulo: `¿Archivar "${c.name}"?`,
      detalle: 'Deja de aparecer al cargar movimientos. Los que ya la usan la conservan.',
      confirmar: 'Archivar',
      destructivo: true,
    });
    if (!ok) return;
    try {
      await guardarCategoria({ archived: true }, c.id);
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo archivar');
    }
  }

  return (
    <>
      <Hoja abierta={abierta && !editando} alCerrar={alCerrar} titulo="Categorías">
        <div className="space-y-5">
          <Boton onClick={() => setEditando({
            id: '', householdId: '', name: '', type: 'gasto', parentId: null,
            icon: 'tag', color: '#64748b', archived: false, displayOrder: 0, createdAt: 0,
          })} className="w-full">
            <Icono nombre="plus" size={17} /> Nueva categoría
          </Boton>

          {[
            { titulo: 'Gastos', lista: gastos },
            { titulo: 'Ingresos', lista: ingresos },
          ].map(({ titulo, lista }) => lista.length > 0 && (
            <div key={titulo}>
              <p className="text-xs font-medium txt-3 mb-2">{titulo}</p>
              <div className="space-y-1.5">
                {lista.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 py-1">
                    <Ficha color={c.color} icono={c.icon} size={34} />
                    <button onClick={() => setEditando(c)} className="flex-1 min-w-0 text-left">
                      <span className="text-sm txt truncate block">{c.name}</span>
                    </button>
                    <button
                      onClick={() => setEditando(c)}
                      aria-label={`Editar ${c.name}`}
                      className="w-9 h-9 rounded-lg flex items-center justify-center txt-3 shrink-0"
                    >
                      <Icono nombre="pencil" size={15} />
                    </button>
                    <button
                      onClick={() => void archivar(c)}
                      aria-label={`Archivar ${c.name}`}
                      className="w-9 h-9 rounded-lg flex items-center justify-center txt-3 shrink-0"
                    >
                      <Icono nombre="archive" size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Hoja>

      <EditorCategoria categoria={editando} alCerrar={() => setEditando(null)} />
    </>
  );
}

function EditorCategoria({ categoria, alCerrar }: {
  categoria: Category | null; alCerrar: () => void;
}) {
  const { guardarCategoria, avisar } = useStore();
  const [name, setName] = useState('');
  const [tipo, setTipo] = useState<'ingreso' | 'gasto'>('gasto');
  const [icon, setIcon] = useState('tag');
  const [color, setColor] = useState('#64748b');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!categoria) return;
    setName(categoria.name);
    setTipo(categoria.type);
    setIcon(categoria.icon);
    setColor(categoria.color);
  }, [categoria]);

  if (!categoria) return null;
  const esNueva = categoria.id === '';

  return (
    <Hoja abierta alCerrar={alCerrar} titulo={esNueva ? 'Nueva categoría' : 'Editar categoría'}>
      <div className="space-y-5">
        <div className="flex flex-col items-center pt-1">
          <Ficha color={color} icono={icon} size={64} />
          <p className="text-sm font-medium txt mt-2">{name || 'Sin nombre'}</p>
        </div>

        <Campo etiqueta="Nombre" value={name} onChange={(e) => setName(e.target.value)} placeholder="Comida, Transporte..." />

        {/* El tipo solo se elige al crear: cambiarlo despues dejaria
            movimientos de gasto colgados de una categoria de ingreso. */}
        {esNueva && (
          <div className="grid grid-cols-2 gap-2">
            {(['gasto', 'ingreso'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTipo(t)}
                className={cn(
                  'min-h-11 rounded-xl text-sm font-medium border transition-all capitalize',
                  tipo === t ? 'bg-marca-600 text-white border-transparent' : 'superficie-2 borde txt-2',
                )}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        <div>
          <span className="block text-xs font-medium txt-2 mb-2">Color</span>
          <SelectorColor valor={color} alElegir={setColor} />
        </div>

        <div>
          <span className="block text-xs font-medium txt-2 mb-2">Ícono</span>
          <SelectorIcono valor={icon} alElegir={setIcon} color={color} />
        </div>

        <Boton
          onClick={async () => {
            if (!name.trim()) return;
            setGuardando(true);
            try {
              await guardarCategoria(
                { name: name.trim(), type: tipo, icon, color },
                esNueva ? undefined : categoria.id,
              );
              alCerrar();
            } catch (e) {
              avisar(e instanceof Error ? e.message : 'No se pudo guardar');
            } finally {
              setGuardando(false);
            }
          }}
          disabled={!name.trim() || guardando}
          className="w-full min-h-12"
        >
          {guardando ? 'Guardando...' : 'Guardar'}
        </Boton>
      </div>
    </Hoja>
  );
}

// --- presupuestos ---------------------------------------------------------

function HojaPresupuesto({ abierta, alCerrar, editando }: {
  abierta: boolean; alCerrar: () => void; editando: Budget | null;
}) {
  const { categories, household, budgets, guardarPresupuesto, borrarPresupuesto, avisar } = useStore();
  const confirmar = useConfirmar();
  const moneda = household?.currency ?? 'USD';
  const mesActual = claveMes(Date.now());

  const [categoryId, setCategoryId] = useState('');
  const [monto, setMonto] = useState('');
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!abierta) return;
    setCategoryId(editando?.categoryId ?? '');
    setMonto(editando ? montoPlano(editando.amountMinor, moneda) : '');
  }, [abierta, editando, moneda]);

  const gastos = categories.filter((c) => !c.archived && c.type === 'gasto');
  const montoMinor = parseMonto(monto, moneda);
  const existente = budgets.find((b) => b.period === mesActual && (b.categoryId ?? '') === categoryId);

  async function eliminar() {
    if (!editando) return;
    const cat = categories.find((c) => c.id === editando.categoryId);
    const ok = await confirmar({
      titulo: `¿Borrar el presupuesto de ${cat?.name ?? 'todo el mes'}?`,
      detalle: 'Los movimientos no se tocan, solo deja de haber un tope.',
      destructivo: true,
    });
    if (!ok) return;
    try {
      await borrarPresupuesto(editando.id);
      alCerrar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo borrar');
    }
  }

  return (
    <Hoja
      abierta={abierta}
      alCerrar={alCerrar}
      titulo={editando ? 'Editar presupuesto' : `Presupuesto de ${nombreMes(mesActual)}`}
    >
      <div className="space-y-4">
        <Selector
          etiqueta="Categoría"
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value);
            const b = budgets.find((x) => x.period === mesActual && (x.categoryId ?? '') === e.target.value);
            setMonto(b ? montoPlano(b.amountMinor, moneda) : '');
          }}
          disabled={Boolean(editando)}
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

        {!editando && existente && (
          <p className="text-xs txt-3">
            Ya había un tope de {formatMonto(existente.amountMinor, moneda)}. Se reemplaza.
          </p>
        )}

        <div className="flex gap-2 pt-1">
          {editando && (
            <Boton variante="peligro" onClick={() => void eliminar()} className="px-4" aria-label="Borrar">
              <Icono nombre="trash-2" size={17} />
            </Boton>
          )}
          <Boton
            onClick={async () => {
              if (montoMinor === null) return;
              setCargando(true);
              try {
                await guardarPresupuesto({ categoryId: categoryId || null, amountMinor: montoMinor, period: mesActual });
                alCerrar();
              } catch (e) {
                avisar(e instanceof Error ? e.message : 'No se pudo guardar');
              } finally {
                setCargando(false);
              }
            }}
            disabled={montoMinor === null || montoMinor < 0 || cargando}
            className="flex-1 min-h-12"
          >
            {cargando ? 'Guardando...' : 'Guardar'}
          </Boton>
        </div>
      </div>
    </Hoja>
  );
}

// --- invitar y contraseña -------------------------------------------------

function HojaInvitar({ abierta, alCerrar }: { abierta: boolean; alCerrar: () => void }) {
  const { invitar, avisar } = useStore();
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [pass, setPass] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Hoja abierta={abierta} alCerrar={alCerrar} titulo="Sumar a tu pareja">
      <div className="space-y-4">
        <p className="text-sm txt-2 leading-relaxed">
          Le creás la cuenta vos y le pasás los datos. Va a ver exactamente lo
          mismo que vos, en tiempo real. Que cambie la contraseña apenas entre.
        </p>
        <Campo etiqueta="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Cómo se llama" />
        <Campo etiqueta="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="su@email.com" autoComplete="off" />
        <Campo etiqueta="Contraseña" type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Mínimo 8 caracteres" autoComplete="new-password" />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <Boton
          onClick={async () => {
            setCargando(true); setError(null);
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
          }}
          disabled={!email || !nombre || pass.length < MIN_PASSWORD || cargando}
          className="w-full min-h-12"
        >
          {cargando ? 'Creando...' : 'Crear su cuenta'}
        </Boton>
      </div>
    </Hoja>
  );
}

function HojaPassword({ abierta, alCerrar }: { abierta: boolean; alCerrar: () => void }) {
  const { avisar, me } = useStore();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Hoja abierta={abierta} alCerrar={alCerrar} titulo="Cambiar contraseña">
      <div className="space-y-4">
        <Campo etiqueta="Contraseña actual" type="password" value={actual} onChange={(e) => setActual(e.target.value)} autoComplete="current-password" />
        <Campo etiqueta="Nueva contraseña" type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="Mínimo 8 caracteres" autoComplete="new-password" />
        <p className="text-xs txt-3">Al cambiarla se cierran las sesiones abiertas en otros dispositivos.</p>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <Boton
          onClick={async () => {
            setCargando(true); setError(null);
            try {
              await api.cambiarPassword(me?.email ?? '', actual, nueva);
              avisar('Contraseña actualizada', 'ok');
              setActual(''); setNueva('');
              alCerrar();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'No se pudo cambiar');
            } finally {
              setCargando(false);
            }
          }}
          disabled={!actual || nueva.length < MIN_PASSWORD || cargando}
          className="w-full min-h-12"
        >
          {cargando ? 'Guardando...' : 'Cambiar'}
        </Boton>
      </div>
    </Hoja>
  );
}

// --- exportar -------------------------------------------------------------

function exportarCsv(
  transactions: { id: string; type: TxType; amountMinor: number; description: string; date: number; categoryId: string | null; accountId: string; createdBy: string; paidBy: string | null; notes: string | null }[],
  categories: { id: string; name: string }[],
  accounts: { id: string; name: string }[],
  members: { id: string; displayName: string }[],
  moneda: string,
): void {
  const cat = new Map(categories.map((c) => [c.id, c.name]));
  const acc = new Map(accounts.map((a) => [a.id, a.name]));
  const mem = new Map(members.map((m) => [m.id, m.displayName]));
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;

  const filas = [
    ['Fecha', 'Tipo', 'Descripcion', 'Monto', 'Moneda', 'Categoria', 'Cuenta', 'Lo hizo', 'Lo cargo', 'Notas'].join(','),
    ...transactions.map((t) => [
      new Date(t.date).toISOString().slice(0, 10),
      esc(TX_TYPE_LABEL[t.type] ?? ''),
      esc(t.description),
      montoPlano(t.amountMinor, moneda),
      moneda,
      esc(cat.get(t.categoryId ?? '') ?? ''),
      esc(acc.get(t.accountId) ?? ''),
      esc(mem.get(t.paidBy ?? t.createdBy) ?? ''),
      esc(mem.get(t.createdBy) ?? ''),
      esc(t.notes ?? ''),
    ].join(',')),
  ].join('\n');

  try {
    const blob = new Blob(['﻿' + filas], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gastos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    // Sin descarga disponible; no hay mucho que hacer.
  }
}
