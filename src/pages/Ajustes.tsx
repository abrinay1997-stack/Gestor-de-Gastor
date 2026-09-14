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
  type Budget, type Category, type Entity, type SeccionInicio,
} from '@shared/types';
import { nombreMes } from '../lib/utils.ts';
import {
  Avatar, Barra, Boton, Campo, Ficha, Hoja, Icono, SelectorColor,
  SelectorIcono, Selector, Tarjeta,
} from '../components/ui/base.tsx';
import { SelectorEmoji } from '../components/ui/emoji.tsx';
import { OpcionesPorEconomia } from '../components/ui/entidad.tsx';
import { useConfirmar } from '../components/ui/confirmar.tsx';
import { PagosHabituales } from './ajustes/PagosHabituales.tsx';
import { cn } from '../lib/utils.ts';

type Hoja1 = null | 'invitar' | 'password' | 'presupuestos' | 'presupuesto'
  | 'habituales' | 'categorias' | 'entidades' | 'perfil' | 'inicio';

export function Ajustes({ alVerConsejero, alVerAnalisis }: {
  /** Consejero y Analisis no estan en la barra de abajo: se entra por aca. */
  alVerConsejero?: () => void;
  alVerAnalisis?: () => void;
}) {
  const {
    me, members, household, categories, entities, budgets, accounts, transactions,
    recurring, salir,
  } = useStore();
  const moneda = household?.currency ?? 'USD';

  const [hoja, setHoja] = useState<Hoja1>(null);
  const [presupuestoEdit, setPresupuestoEdit] = useState<Budget | null>(null);

  const mesActual = claveMes(Date.now());
  const delMes = useMemo(
    () => estadoPresupuestos(budgets, transactions, mesActual, categories),
    [budgets, transactions, mesActual, categories],
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold txt tracking-tight">Ajustes</h1>

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

      {/* Todo lo que no es el dia a dia vive aca, en una sola lista. Antes
          los presupuestos y los pagos habituales eran dos tarjetas abiertas
          que empujaban el resto de los ajustes fuera de la pantalla. */}
      <Tarjeta className="p-0 overflow-hidden">
        {alVerConsejero && (
          <Opcion
            icono="sparkles"
            color="#10b981"
            titulo="Consejero"
            detalle="Preguntale"
            alTocar={alVerConsejero}
          />
        )}
        {alVerAnalisis && (
          <Opcion
            icono="chart-pie"
            color="#3b82f6"
            titulo="Análisis"
            detalle="Gráficos"
            alTocar={alVerAnalisis}
          />
        )}
        <Opcion
          icono="scale"
          titulo="Presupuestos"
          detalle={delMes.length > 0 ? `${delMes.length} este mes` : 'Sin topes'}
          alTocar={() => setHoja('presupuestos')}
        />
        <Opcion
          icono="repeat"
          titulo="Pagos habituales"
          detalle={recurring.length > 0 ? `${recurring.length} activos` : 'Ninguno'}
          alTocar={() => setHoja('habituales')}
        />
        <Opcion
          icono="building-2"
          titulo="Economías"
          detalle={entities.filter((e) => !e.archived).map((e) => e.name).join(' · ')}
          alTocar={() => setHoja('entidades')}
        />
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
      <HojaPresupuestos
        abierta={hoja === 'presupuestos'}
        alCerrar={() => setHoja(null)}
        alEditar={(b) => { setPresupuestoEdit(b); setHoja('presupuesto'); }}
      />
      <PagosHabituales abierta={hoja === 'habituales'} alCerrar={() => setHoja(null)} />
      <HojaPresupuesto
        abierta={hoja === 'presupuesto'}
        alCerrar={() => { setHoja('presupuestos'); setPresupuestoEdit(null); }}
        editando={presupuestoEdit}
      />
      <HojaEntidades abierta={hoja === 'entidades'} alCerrar={() => setHoja(null)} />
      <HojaCategorias abierta={hoja === 'categorias'} alCerrar={() => setHoja(null)} />
    </div>
  );
}

/**
 * Una fila de la lista. El color es para las dos primeras, que no configuran
 * nada sino que llevan a otra pantalla: sin eso se perdian entre los ajustes.
 */
function Opcion({ icono, titulo, detalle, color, alTocar }: {
  icono: string; titulo: string; detalle?: string; color?: string; alTocar: () => void;
}) {
  return (
    <button
      onClick={alTocar}
      className="w-full flex items-center gap-3 px-5 min-h-14 text-left border-b borde last:border-b-0 active:superficie-2 transition-colors"
    >
      <Icono
        nombre={icono}
        size={19}
        className={cn('shrink-0', !color && 'txt-2')}
        style={color ? { color } : undefined}
      />
      <span className="text-sm font-medium txt shrink-0">{titulo}</span>
      {/* El detalle cede primero: con tres economias listadas el nombre de la
          fila quedaba aplastado contra el icono. */}
      <span className="flex-1 min-w-0 text-xs txt-3 text-right truncate">{detalle}</span>
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

/**
 * Las economias: la casa y los negocios.
 *
 * Un solo libro con varios dueños del dinero. Lo que decide de quien es cada
 * movimiento no se elige aca sino en la categoria: aca solo se define que
 * economias existen.
 */
function HojaEntidades({ abierta, alCerrar }: { abierta: boolean; alCerrar: () => void }) {
  const { entities, categories, archivarEntidad, avisar } = useStore();
  const confirmar = useConfirmar();
  const [editando, setEditando] = useState<Entity | null>(null);

  const visibles = entities.filter((e) => !e.archived);

  async function archivar(e: Entity) {
    const cuantas = categories.filter((c) => c.entityId === e.id && !c.archived).length;
    const ok = await confirmar({
      titulo: `¿Archivar "${e.name}"?`,
      detalle: cuantas > 0
        ? `Deja de aparecer en el selector. Sus ${cuantas} categorías y todo su historial se quedan como están.`
        : 'Deja de aparecer en el selector. Nada se borra.',
      destructivo: true,
    });
    if (!ok) return;
    try {
      await archivarEntidad(e.id);
    } catch (err) {
      avisar(err instanceof Error ? err.message : 'No se pudo archivar');
    }
  }

  return (
    <>
      <Hoja abierta={abierta && !editando} alCerrar={alCerrar} titulo="Economías">
        <div className="space-y-5">
          <p className="text-xs txt-3 leading-relaxed">
            La casa y cada negocio, cada uno con su propio resultado, sus jarras y
            sus presupuestos. De quién es cada movimiento se define en su
            categoría, no acá.
          </p>

          <Boton onClick={() => setEditando({
            id: '', householdId: '', name: '', kind: 'negocio', color: '#9a6a06',
            icon: 'briefcase', displayOrder: visibles.length, archived: false, createdAt: 0,
          })} className="w-full">
            <Icono nombre="plus" size={17} /> Nueva economía
          </Boton>

          <div className="space-y-1">
            {visibles.map((e) => (
              <div key={e.id} className="flex items-center gap-3 py-2">
                <Ficha color={e.color} icono={e.icon} size={38} />
                <button onClick={() => setEditando(e)} className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-medium txt truncate">{e.name}</p>
                  <p className="text-xs txt-3">
                    {e.kind === 'negocio' ? 'Negocio' : 'Personal'}
                    {' · '}
                    {categories.filter((c) => c.entityId === e.id && !c.archived).length} categorías
                  </p>
                </button>
                {visibles.length > 1 && (
                  <button
                    onClick={() => void archivar(e)}
                    aria-label={`Archivar ${e.name}`}
                    className="w-9 h-9 rounded-lg flex items-center justify-center txt-3 shrink-0"
                  >
                    <Icono nombre="archive" size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </Hoja>

      <EditorEntidad entidad={editando} alCerrar={() => setEditando(null)} />
    </>
  );
}

function EditorEntidad({ entidad, alCerrar }: { entidad: Entity | null; alCerrar: () => void }) {
  const { guardarEntidad, avisar } = useStore();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'personal' | 'negocio'>('negocio');
  const [icon, setIcon] = useState('briefcase');
  const [color, setColor] = useState('#9a6a06');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!entidad) return;
    setName(entidad.name);
    setKind(entidad.kind);
    setIcon(entidad.icon);
    setColor(entidad.color);
  }, [entidad]);

  if (!entidad) return null;
  const esNueva = entidad.id === '';

  return (
    <Hoja abierta alCerrar={alCerrar} titulo={esNueva ? 'Nueva economía' : 'Editar economía'}>
      <div className="space-y-5">
        <div className="flex flex-col items-center pt-1">
          <Ficha color={color} icono={icon} size={64} />
          <p className="text-sm font-medium txt mt-2">{name || 'Sin nombre'}</p>
        </div>

        <Campo
          etiqueta="Nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="PanaClaw, BukoFlow..."
        />

        <div className="grid grid-cols-2 gap-2">
          {([['personal', 'Personal'], ['negocio', 'Negocio']] as const).map(([k, etiqueta]) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={cn(
                'min-h-11 rounded-xl text-sm font-medium border transition-all',
                kind === k ? 'bg-marca-600 text-white border-transparent' : 'superficie-2 borde txt-2',
              )}
            >
              {etiqueta}
            </button>
          ))}
        </div>

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
              await guardarEntidad(
                { name: name.trim(), kind, icon, color },
                esNueva ? undefined : entidad.id,
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

function HojaCategorias({ abierta, alCerrar }: { abierta: boolean; alCerrar: () => void }) {
  const { categories, entities, entidadActiva, guardarCategoria, avisar } = useStore();
  const confirmar = useConfirmar();
  const [editando, setEditando] = useState<Category | null>(null);

  // Una categoria nueva nace en la entidad que se esta mirando. Si estan en
  // el consolidado, en la primera, que es Familia.
  const entidadPorDefecto = entidadActiva ?? entities.find((e) => !e.archived)?.id ?? null;

  const visibles = categories.filter((c) => !c.archived);
  const gastos = visibles.filter((c) => c.type === 'gasto');
  const ingresos = visibles.filter((c) => c.type === 'ingreso');

  // Con mas de una economia, la lista se agrupa por dueño. Sin esto habia que
  // abrir las 30 categorias de a una para saber cual era de quien, que es
  // justo lo que hay que hacer despues de crear un negocio.
  const economias = entities.filter((e) => !e.archived);
  const agrupar = (lista: Category[]) => {
    if (economias.length < 2) return [{ economia: null as Entity | null, lista }];
    const grupos = economias
      .map((economia) => ({ economia, lista: lista.filter((c) => c.entityId === economia.id) }))
      .filter((g) => g.lista.length > 0);
    const sueltas = lista.filter((c) => !economias.some((e) => e.id === c.entityId));
    // Las sin dueño van primero: son las que hay que arreglar.
    return sueltas.length > 0
      ? [{ economia: null as Entity | null, lista: sueltas }, ...grupos]
      : grupos;
  };

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
            icon: 'tag', color: '#64748b', archived: false, displayOrder: 0,
            createdAt: 0, entityId: entidadPorDefecto,
          })} className="w-full">
            <Icono nombre="plus" size={17} /> Nueva categoría
          </Boton>

          {economias.length > 1 && (
            <p className="text-xs txt-3 leading-relaxed superficie-2 rounded-2xl p-3">
              Un movimiento pertenece a la economía de su categoría. Mové una
              categoría de economía y toda su historia se va con ella, sin tocar
              ningún movimiento.
            </p>
          )}

          {[
            { titulo: 'Gastos', lista: gastos },
            { titulo: 'Ingresos', lista: ingresos },
          ].map(({ titulo, lista }) => lista.length > 0 && (
            <div key={titulo}>
              <p className="text-xs font-medium txt-3 mb-2">{titulo}</p>
              {agrupar(lista).map(({ economia, lista: suyas }) => (
              <div key={economia?.id ?? 'sueltas'} className="mb-3 last:mb-0">
                {economias.length > 1 && (
                  <p className="text-[11px] font-semibold uppercase tracking-wide mb-1.5"
                    style={{ color: economia?.color ?? '#ef4444' }}>
                    {economia?.name ?? 'Sin economía'}
                  </p>
                )}
              <div className="space-y-1.5">
                {suyas.map((c) => (
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
  const { entities, transactions, guardarCategoria, avisar } = useStore();
  const [name, setName] = useState('');
  const [tipo, setTipo] = useState<'ingreso' | 'gasto'>('gasto');
  const [icon, setIcon] = useState('tag');
  const [color, setColor] = useState('#64748b');
  const [entityId, setEntityId] = useState<string>('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!categoria) return;
    setName(categoria.name);
    setTipo(categoria.type);
    setIcon(categoria.icon);
    setColor(categoria.color);
    setEntityId(categoria.entityId ?? '');
  }, [categoria]);

  const visibles = entities.filter((e) => !e.archived);
  // Cuantos movimientos se van a reclasificar de una: es la informacion que
  // hace que valga la pena tener la entidad aca y no en cada movimiento.
  const cuantos = categoria
    ? transactions.filter((t) => t.categoryId === categoria.id && !t.entityId).length
    : 0;
  const cambiaDeEntidad = categoria !== null && (categoria.entityId ?? '') !== entityId;

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

        {visibles.length > 1 && (
          <>
            <Selector
              etiqueta="De quién es"
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
            >
              <option value="">Sin clasificar</option>
              {visibles.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Selector>
            {cambiaDeEntidad && cuantos > 0 && (
              <p className="text-xs txt-3 px-1 -mt-2 leading-relaxed">
                {cuantos === 1
                  ? 'El movimiento que usa esta categoría pasa también.'
                  : `Los ${cuantos} movimientos que usan esta categoría pasan también.`}
                {' '}No se reescribe ninguno: la entidad se lee desde acá.
              </p>
            )}
          </>
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
                { name: name.trim(), type: tipo, icon, color, entityId: entityId || null },
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

/**
 * La lista de topes del mes. Vive en una hoja y no suelta en Ajustes porque
 * con varios presupuestos empujaba todo lo demas fuera de la pantalla.
 */
function HojaPresupuestos({ abierta, alCerrar, alEditar }: {
  abierta: boolean; alCerrar: () => void; alEditar: (b: Budget | null) => void;
}) {
  const { categories, entities, budgets, transactions, household } = useStore();
  const moneda = household?.currency ?? 'USD';
  const mesActual = claveMes(Date.now());

  const delMes = useMemo(
    () => estadoPresupuestos(budgets, transactions, mesActual, categories),
    [budgets, transactions, mesActual, categories],
  );

  return (
    <Hoja abierta={abierta} alCerrar={alCerrar} titulo="Presupuestos">
      <div className="space-y-5">
        <p className="text-xs txt-3 -mt-1">{nombreMes(mesActual)}</p>

        <Boton onClick={() => alEditar(null)} className="w-full">
          <Icono nombre="plus" size={17} /> Nuevo presupuesto
        </Boton>

        {delMes.length === 0 ? (
          <p className="text-sm txt-3 leading-relaxed">
            Todavía no hay topes este mes. Poner un tope por categoría ayuda a
            ver el desvío antes de que sea tarde.
          </p>
        ) : (
          <div className="space-y-4">
            {delMes.map(({ budget, gastadoMinor, ratio }) => {
              const cat = categories.find((c) => c.id === budget.categoryId);
              // El global puede ser de una economia sola; el de categoria la
              // hereda de ella. En los dos casos se dice de quien es el tope.
              const economia = entities.find((e) => e.id === (cat ? cat.entityId : budget.entityId));
              const restante = budget.amountMinor - gastadoMinor;
              return (
                <button
                  key={budget.id}
                  onClick={() => alEditar(budget)}
                  className="w-full text-left"
                >
                  <div className="flex items-baseline justify-between mb-1.5 gap-2">
                    <span className="text-sm font-medium txt truncate">
                      {cat?.name ?? 'Todo el mes'}
                      {economia && (
                        <span className="txt-3 font-normal"> · {economia.name}</span>
                      )}
                    </span>
                    <span className={cn(
                      'text-xs tabular shrink-0',
                      ratio > 1 ? 'text-red-500 font-semibold' : ratio > 0.8 ? 'text-amber-500' : 'txt-2',
                    )}>
                      {formatMonto(gastadoMinor, moneda, { compacto: true })} / {formatMonto(budget.amountMinor, moneda, { compacto: true })}
                    </span>
                  </div>
                  <Barra ratio={ratio} color={cat?.color ?? '#10b981'} alerta />
                  <p className="text-[11px] txt-3 mt-1">
                    {restante >= 0
                      ? `Quedan ${formatMonto(restante, moneda)}`
                      : `Te pasaste ${formatMonto(-restante, moneda)}`}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Hoja>
  );
}

function HojaPresupuesto({ abierta, alCerrar, editando }: {
  abierta: boolean; alCerrar: () => void; editando: Budget | null;
}) {
  const {
    categories, entities, entidadActiva, household, budgets,
    guardarPresupuesto, borrarPresupuesto, avisar,
  } = useStore();
  const confirmar = useConfirmar();
  const moneda = household?.currency ?? 'USD';
  const mesActual = claveMes(Date.now());

  const [categoryId, setCategoryId] = useState('');
  // Solo para el tope global. Vacio = todas las economias.
  const [economiaTope, setEconomiaTope] = useState('');
  const [monto, setMonto] = useState('');
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!abierta) return;
    setCategoryId(editando?.categoryId ?? '');
    setEconomiaTope(editando?.entityId ?? (editando ? '' : entidadActiva ?? ''));
    setMonto(editando ? montoPlano(editando.amountMinor, moneda) : '');
  }, [abierta, editando, moneda, entidadActiva]);

  // El presupuesto no lleva entidad propia: la saca de su categoria, igual que
  // un movimiento. Lo unico que cambia con la economia activa es cuantas
  // categorias hay para elegir.
  const gastos = categories.filter((c) => (
    !c.archived && c.type === 'gasto'
    && (entidadActiva === null || c.entityId === entidadActiva)
  ));
  const economias = entities.filter((e) => !e.archived);
  const suEconomia = entities.find(
    (e) => e.id === categories.find((c) => c.id === categoryId)?.entityId,
  );
  const montoMinor = parseMonto(monto, moneda);
  const existente = budgets.find((b) => (
    b.period === mesActual
    && (b.categoryId ?? '') === categoryId
    && (b.entityId ?? '') === (categoryId ? '' : economiaTope)
  ));

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
          <OpcionesPorEconomia items={gastos} />
        </Selector>

        {economias.length > 1 && (categoryId ? (
          <p className="text-xs txt-3 -mt-2 px-1 leading-relaxed">
            Es el tope de {suEconomia?.name ?? 'nadie'}, porque la categoría es
            de ahí. Si mañana movés la categoría, el tope se va con ella.
          </p>
        ) : (
          <>
            <Selector
              etiqueta="Economía"
              value={economiaTope}
              onChange={(e) => setEconomiaTope(e.target.value)}
              disabled={Boolean(editando)}
            >
              <option value="">Todas juntas</option>
              {economias.map((e) => (
                <option key={e.id} value={e.id}>Solo {e.name}</option>
              ))}
            </Selector>
            <p className="text-xs txt-3 -mt-2 px-1 leading-relaxed">
              {economiaTope
                ? `Cuenta todo lo que gaste ${economias.find((e) => e.id === economiaTope)?.name} este mes, en cualquier categoría.`
                : 'Cuenta los gastos de todas las economías juntas.'}
            </p>
          </>
        ))}

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
                await guardarPresupuesto({
                  categoryId: categoryId || null,
                  // La entidad solo viaja en el tope global: el de categoria
                  // la hereda de la categoria y congelarla seria un error.
                  entityId: categoryId ? null : (economiaTope || null),
                  amountMinor: montoMinor,
                  period: mesActual,
                });
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
