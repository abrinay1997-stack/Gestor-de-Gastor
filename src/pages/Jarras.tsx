/**
 * Jarras (metodo de los 6 frascos).
 *
 * Se conserva del repo original porque es una decision del hogar sobre como
 * repartir la plata, no un detalle tecnico. Lo que cambia es la aritmetica:
 * los porcentajes van en puntos base y el reparto usa el metodo del mayor
 * resto, asi la suma de las jarras siempre da exactamente el ingreso.
 */

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/store.tsx';
import { formatBp, formatMonto, montoPlano, parseMonto } from '@shared/money';
import {
  entidadDe, entidadPorDefecto, flujoDeJarras, indexarCategorias, jarrasDe,
  repartirEnJarras, sinAsignar, validarJarras,
} from '@shared/domain';
import { describirPeriodo, periodoMes, type Periodo } from '@shared/periodo';
import type { Entity, Jar, Transaction } from '@shared/types';
import { FilaMovimiento } from './Inicio.tsx';
import {
  Barra, Boton, Campo, Ficha, Hoja, Icono, Selector, Tarjeta, Vacio,
} from '../components/ui/base.tsx';
import { SelectorPeriodo } from '../components/ui/periodo.tsx';
import { SelectorEntidad } from '../components/ui/entidad.tsx';
import { cn } from '../lib/utils.ts';


const COLORES = ['#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#f59e0b', '#f43f5e', '#06b6d4', '#64748b'];

/** Como se llena la jarra, en una linea. */
function describirLlenado(j: Jar, moneda: string): string {
  if (j.fillKind === 'resto') return 'lo que sobre de cada ingreso';
  if (j.fillKind === 'fijo') return `${formatMonto(j.fillMinor ?? 0, moneda)} de cada ingreso`;
  return `${formatBp(j.percentageBp)} de cada ingreso`;
}

export function Jarras({ alVerMovimiento }: { alVerMovimiento: (tx: Transaction) => void }) {
  const {
    jars, accounts, imputaciones, jarTransfers, transactions, categories, entities,
    entidadActiva, household, guardarJarras, ponerJarrasAlDia, avisar,
  } = useStore();
  const moneda = household?.currency ?? 'USD';

  // La casa reparte en frascos y cada negocio en los suyos. En "Todo" se ven
  // todas juntas, que es la unica vista que cuadra contra las cuentas: la
  // plata esta mezclada en las mismas cuentas aunque los sobres sean de
  // dueños distintos.
  const porDefecto = useMemo(() => entidadPorDefecto(entities), [entities]);
  const visibles = useMemo(
    () => (entidadActiva === null ? jars : jars.filter((j) => j.entityId === entidadActiva)),
    [jars, entidadActiva],
  );

  const nombreActiva = entities.find((e) => e.id === entidadActiva)?.name ?? '';

  // En "Todo" con mas de una economia, cada tanda lleva su titulo: seis
  // frascos de la casa y tres de un negocio en una sola lista corrida no se
  // entienden, y los porcentajes de cada tanda suman 100% por separado.
  const grupos = useMemo((): { entidad: Entity | null; jarras: Jar[] }[] => {
    if (entidadActiva !== null) return [{ entidad: null, jarras: visibles }];

    const porEntidad = new Map<string, Jar[]>();
    for (const j of visibles) {
      const clave = j.entityId ?? '';
      porEntidad.set(clave, [...(porEntidad.get(clave) ?? []), j]);
    }
    if (porEntidad.size < 2) return [{ entidad: null, jarras: visibles }];

    const porId = new Map(entities.map((e) => [e.id, e]));
    return [...porEntidad]
      .map(([clave, jarras]) => ({ entidad: porId.get(clave) ?? null, jarras }))
      .sort((a, b) => (a.entidad?.displayOrder ?? 999) - (b.entidad?.displayOrder ?? 999));
  }, [visibles, entities, entidadActiva]);

  const [editando, setEditando] = useState(false);
  const [abierta, setAbierta] = useState<Jar | null>(null);
  const [traspasando, setTraspasando] = useState(false);
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoMes(Date.now()));
  const [poniendoAlDia, setPoniendoAlDia] = useState(false);

  const fechaDe = useMemo(() => {
    const mapa = new Map(transactions.map((t) => [t.id, t.date]));
    return (txId: string) => mapa.get(txId);
  }, [transactions]);

  // Lo que entro y salio en el periodo elegido. El saldo grande sigue siendo
  // el de toda la vida: es el que dice si se puede gastar.
  const flujo = useMemo(
    () => flujoDeJarras(jars, imputaciones, jarTransfers, fechaDe, periodo),
    [jars, imputaciones, jarTransfers, fechaDe, periodo],
  );
  // La barra mide cuanto de lo que la jarra recibio EN TODA SU VIDA ya se
  // gasto. Medirlo contra el mes daria la barra llena en cuanto el ingreso
  // entre el mes anterior, aunque la jarra siga casi intacta.
  const flujoVida = useMemo(
    () => flujoDeJarras(jars, imputaciones, jarTransfers),
    [jars, imputaciones, jarTransfers],
  );

  // El total de la vista, y el sin asignar contra TODAS las jarras: la resta
  // es entre las cuentas del hogar y todo lo que ya tiene dueño, mire uno lo
  // que mire.
  const total = useMemo(() => visibles.reduce((s, j) => s + j.balanceMinor, 0), [visibles]);
  const saldosVida = useMemo(
    () => new Map(jars.map((j) => [j.id, j.balanceMinor])),
    [jars],
  );
  const libre = useMemo(() => sinAsignar(accounts, saldosVida), [accounts, saldosVida]);
  const enCuentas = useMemo(
    () => jars.reduce((s, j) => s + j.balanceMinor, 0) + libre,
    [jars, libre],
  );

  // Ingresos que nunca llegaron a ninguna jarra. Hasta ahora repartir era un
  // interruptor apagado por defecto y no se encendio nunca.
  const huerfanos = useMemo(() => {
    const conImputacion = new Set(imputaciones.map((i) => i.txId));
    const indice = indexarCategorias(categories);
    return transactions.filter((t) => {
      if (t.type !== 2 || t.jarId || t.distributeToJars || conImputacion.has(t.id)) return false;
      // Sin jarras propias no hay donde repartirlo: ofrecerlo seria un boton
      // que no hace nada. El servidor lo saltea igual.
      const suyas = jarrasDe(jars, entidadDe(t, indice), porDefecto);
      if (suyas.length === 0) return false;
      return entidadActiva === null || suyas[0].entityId === entidadActiva;
    });
  }, [transactions, imputaciones, categories, jars, porDefecto, entidadActiva]);

  async function alDia() {
    setPoniendoAlDia(true);
    try {
      const n = await ponerJarrasAlDia();
      avisar(n === 1 ? 'Se repartió 1 ingreso' : `Se repartieron ${n} ingresos`, 'ok');
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo repartir');
    } finally {
      setPoniendoAlDia(false);
    }
  }

  return (
    <div className="space-y-4">
      <SelectorEntidad />

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold txt tracking-tight">Jarras</h1>
        {jars.length > 0 && (
          <div className="flex gap-2">
            <Boton variante="secundario" onClick={() => setTraspasando(true)} className="px-3">
              <Icono nombre="arrow-left-right" size={16} /> Mover
            </Boton>
            <Boton variante="secundario" onClick={() => setEditando(true)} className="px-3">
              <Icono nombre="settings-2" size={16} /> Ajustar
            </Boton>
          </div>
        )}
      </div>

      {visibles.length === 0 ? (
        <Tarjeta>
          <Vacio
            icono="piggy-bank"
            titulo={entidadActiva === null ? 'Sin jarras' : 'Todavía no reparte'}
            texto={entidadActiva === null
              ? 'Repartí cada ingreso en frascos con un propósito: necesidades, ahorro, diversión. Te da control sin llevar la cuenta a mano.'
              : 'Esta economía todavía no tiene jarras. Un negocio suele querer separar impuestos, insumos y publicidad de cada cobro, antes de que la plata se mezcle.'}
            accion={<Boton onClick={() => setEditando(true)}>Crear jarras</Boton>}
          />
        </Tarjeta>
      ) : (
        <>
          {/* La conciliacion: hasta ahora las jarras y las cuentas eran dos
              libros que nadie podia cotejar. */}
          <Tarjeta>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs txt-2 mb-1">
                  {entidadActiva === null ? 'En jarras' : `En jarras de ${nombreActiva}`}
                </p>
                <p className="text-2xl font-bold tabular tracking-tight txt">
                  {formatMonto(total, moneda)}
                </p>
              </div>
              <div>
                <p className="text-xs txt-2 mb-1">
                  {libre < 0 ? 'Asignado de más' : 'Sin asignar'}
                </p>
                <p className={cn(
                  'text-2xl font-bold tabular tracking-tight',
                  libre < 0 ? 'text-red-500' : 'txt',
                )}>
                  {formatMonto(Math.abs(libre), moneda)}
                </p>
              </div>
            </div>
            <p className="text-xs txt-3 mt-3 leading-relaxed">
              {libre < 0 ? (
                <>
                  {/* El sin asignar es del hogar entero, siempre. Mirando una
                      economia sola, decir "las jarras" a secas haria pensar
                      que el rojo es de este negocio. */}
                  {entidadActiva === null ? 'Las jarras' : 'Todas las jarras juntas'} tienen
                  asignado más de lo que hay en las cuentas
                  ({formatMonto(enCuentas, moneda)}). Movés plata entre jarras o
                  ajustás un saldo de cuenta.
                </>
              ) : (
                <>
                  {/* Las cuentas no estan separadas por economia, asi que el
                      sin asignar siempre es del hogar entero. Decirlo evita
                      que se lea como plata libre de este negocio. */}
                  {entidadActiva === null
                    ? <>Suman {formatMonto(enCuentas, moneda)}, que es exactamente lo que hay en las cuentas.</>
                    : <>Todas las jarras juntas y lo sin asignar suman {formatMonto(enCuentas, moneda)}, que es lo que hay en las cuentas. Las cuentas no están separadas por economía.</>}
                  {libre > 0 && ' Lo de la derecha todavía no tiene trabajo asignado.'}
                </>
              )}
            </p>
          </Tarjeta>

          {huerfanos.length > 0 && (
            <Tarjeta className="border-marca-500/40">
              <p className="text-sm font-medium txt mb-1">
                {huerfanos.length === 1
                  ? 'Hay 1 ingreso que nunca se repartió'
                  : `Hay ${huerfanos.length} ingresos que nunca se repartieron`}
              </p>
              <p className="text-xs txt-3 leading-relaxed mb-3">
                Suman {formatMonto(huerfanos.reduce((a, t) => a + t.amountMinor, 0), moneda)}.
                Se reparten con los porcentajes de ahora. Los que ya tienen una jarra
                puesta no se tocan.
              </p>
              <Boton onClick={() => void alDia()} disabled={poniendoAlDia} className="w-full">
                {poniendoAlDia ? 'Repartiendo...' : 'Repartirlos ahora'}
              </Boton>
            </Tarjeta>
          )}

          <SelectorPeriodo periodo={periodo} alCambiar={setPeriodo} />

          {grupos.map((g) => (
          <div key={g.entidad?.id ?? 'todas'} className="space-y-2.5">
            {g.entidad && (
              <div className="flex items-center gap-2 pt-1" style={{ color: g.entidad.color }}>
                <Icono nombre={g.entidad.icon} size={15} />
                <span className="text-xs font-semibold uppercase tracking-wide">
                  {g.entidad.name}
                </span>
              </div>
            )}
            {g.jarras.map((j) => {
              const f = flujo.get(j.id) ?? { entroMinor: 0, salioMinor: 0 };
              const vida = flujoVida.get(j.id) ?? { entroMinor: 0, salioMinor: 0 };
              const enRojo = j.balanceMinor < 0;
              // El numero grande es SIEMPRE lo que queda. Es el que se usa
              // para decidir si se puede gastar, y el que cuadra contra las
              // cuentas. Mostrar el neto del mes aca haria que una jarra con
              // plata se leyera en negativo solo porque el ingreso entro el
              // mes pasado.
              const gastado = enRojo
                ? 1
                : vida.entroMinor > 0 ? vida.salioMinor / vida.entroMinor : 0;

              return (
                <Tarjeta key={j.id} className="p-4 active:opacity-70 transition-opacity cursor-pointer"
                  onClick={() => setAbierta(j)}>
                  <div className="flex items-center gap-3 mb-3">
                    <Ficha color={j.color} icono={j.icon} size={42} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium txt truncate">{j.name}</p>
                      <p className="text-xs txt-3">
                        {describirLlenado(j, moneda)}
                        {j.acumula && ' · acumula'}
                      </p>
                    </div>
                    <p className={cn(
                      'font-semibold tabular shrink-0',
                      enRojo ? 'text-red-500' : 'txt',
                    )}>
                      {formatMonto(j.balanceMinor, moneda)}
                    </p>
                    <Icono nombre="chevron-right" size={16} className="txt-3 shrink-0 -mr-1" />
                  </div>

                  {/* Cuanto de lo que entro en el periodo ya se gasto. */}
                  <Barra ratio={gastado} color={j.color} alerta />

                  {/* La frase que se viene a buscar: cuanto se puede gastar
                      todavia, o cuanto se gasto de mas. El saldo de arriba ya
                      lo dice en numero, pero en numero hay que interpretarlo y
                      el signo se lee mal en el apuro. */}
                  <p className={cn(
                    'text-xs mt-2 font-medium',
                    enRojo ? 'text-red-500' : 'text-marca-700 dark:text-marca-500',
                  )}>
                    {enRojo
                      ? `Te pasaste ${formatMonto(-j.balanceMinor, moneda)}`
                      : j.balanceMinor === 0
                        ? 'Vacía: no queda nada para gastar de acá'
                        : `Podés gastar ${formatMonto(j.balanceMinor, moneda)}`}
                  </p>

                  <p className="text-[11px] txt-3 mt-1">
                    {f.entroMinor === 0 && f.salioMinor === 0 ? (
                      <>Sin movimientos en {describirPeriodo(periodo).toLowerCase()}</>
                    ) : (
                      <>
                        {describirPeriodo(periodo).toLowerCase()}: entró{' '}
                        <span className="tabular">{formatMonto(f.entroMinor, moneda)}</span>
                        {', salió '}
                        <span className="tabular">{formatMonto(f.salioMinor, moneda)}</span>
                      </>
                    )}
                  </p>

                  {enRojo && (
                    <p className="text-xs txt-3 mt-1.5 leading-relaxed">
                      Salió más de lo que esta jarra recibió en toda su vida.
                      Movele plata desde otra con el botón «Mover» de arriba.
                    </p>
                  )}
                </Tarjeta>
              );
            })}
          </div>
          ))}

          <p className="text-xs txt-3 text-center px-4 leading-relaxed">
            Al registrar un ingreso, marcá "Repartir entre las jarras" y el
            monto se divide según estos porcentajes, al centavo. Lo que sobra de
            un mes no se pierde: se queda en la jarra.
          </p>
        </>
      )}

      <MovimientosDeJarra
        jarra={abierta}
        alCerrar={() => setAbierta(null)}
        alVerMovimiento={(tx) => { setAbierta(null); alVerMovimiento(tx); }}
      />

      <HojaTraspaso abierta={traspasando} alCerrar={() => setTraspasando(false)} />

      <EditorJarras
        abierta={editando}
        alCerrar={() => setEditando(false)}
        jarras={jars}
        alGuardar={async (nuevas) => {
          try {
            await guardarJarras(nuevas);
            setEditando(false);
          } catch (e) {
            avisar(e instanceof Error ? e.message : 'No se pudo guardar');
          }
        }}
      />
    </div>
  );
}

/**
 * Mover plata de una jarra a otra.
 *
 * No toca ninguna cuenta: la plata sigue donde estaba, lo que cambia es para
 * que esta. Es lo unico que permite sacar del rojo a una jarra en la que se
 * gasto de mas.
 */
function HojaTraspaso({ abierta, alCerrar, desde }: {
  abierta: boolean; alCerrar: () => void; desde?: string;
}) {
  const {
    jars: todas, entities, entidadActiva, household,
    traspasarEntreJarras, pagarAOtraEconomia, avisar,
  } = useStore();
  const moneda = household?.currency ?? 'USD';

  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  // Vacio = mover adentro de la misma economia. Con valor = pagarle a otra.
  const [economiaDestino, setEconomiaDestino] = useState('');
  const [montoTexto, setMontoTexto] = useState('');
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);

  const variasEconomias = useMemo(
    () => new Set(todas.map((j) => j.entityId ?? '')).size > 1,
    [todas],
  );

  // Un traspaso re-etiqueta plata dentro de una misma economia: por eso el
  // destino se limita a las hermanas de la jarra de origen. Sacar de los
  // impuestos de PanaClaw para tapar la comida de la casa no es mover un
  // sobre, es que el negocio le pago a la casa — y para eso esta el modo pago,
  // abajo en "A".
  //
  // El origen, en cambio, muestra TODAS: si no, elegir una jarra de un negocio
  // dejaba encerrado ahi y no habia forma de volver a las de la casa.
  const jars = useMemo(() => {
    const ancla = todas.find((j) => j.id === (desde ?? origen));
    const entidad = ancla?.entityId ?? entidadActiva ?? null;
    if (entidad === null) return todas;
    return todas.filter((j) => j.entityId === entidad);
  }, [todas, desde, origen, entidadActiva]);

  const nombreAmbito = entities.find(
    (e) => e.id === todas.find((j) => j.id === origen)?.entityId,
  )?.name;

  /** Las jarras agrupadas por economia, para el selector de origen. */
  const porEconomia = useMemo(() => {
    if (!variasEconomias) return null;
    return entities
      .filter((e) => todas.some((j) => j.entityId === e.id))
      .map((e) => ({ economia: e, jarras: todas.filter((j) => j.entityId === e.id) }));
  }, [entities, todas, variasEconomias]);

  useEffect(() => {
    if (!abierta) return;
    // Por defecto, de la que mas tiene a la que esta en rojo: es el caso que
    // trae a alguien a esta pantalla.
    const enRojo = jars.find((j) => j.balanceMinor < 0);
    const conMas = [...jars].sort((a, b) => b.balanceMinor - a.balanceMinor)[0];
    setOrigen(desde ?? conMas?.id ?? '');
    setDestino(enRojo && enRojo.id !== (desde ?? conMas?.id) ? enRojo.id : '');
    setEconomiaDestino('');
    setMontoTexto(enRojo ? montoPlano(-enRojo.balanceMinor, moneda) : '');
    setNota('');
    // Solo al abrir: recalcular con cada tecla pisaria lo que se esta eligiendo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierta, desde, moneda]);

  const monto = parseMonto(montoTexto, moneda);
  const jarraOrigen = todas.find((j) => j.id === origen);
  const esPago = economiaDestino !== '';

  // Las economias que podrian cobrar: las que no son la del origen y tienen
  // jarras donde poner la plata.
  const puedenCobrar = useMemo(() => entities.filter((e) => (
    !e.archived
    && e.id !== (jarraOrigen?.entityId ?? null)
    && todas.some((j) => j.entityId === e.id)
  )), [entities, todas, jarraOrigen]);

  // Como caeria el pago, con las reglas de la economia que cobra.
  const repartoDelPago = useMemo(() => {
    if (!esPago || monto === null || monto <= 0) return [];
    const destinoJarras = todas.filter((j) => j.entityId === economiaDestino);
    const partes = repartirEnJarras(monto, destinoJarras);
    return destinoJarras
      .map((jarra) => ({ jarra, parte: partes.get(jarra.id) ?? 0 }))
      .filter((x) => x.parte !== 0);
  }, [esPago, monto, todas, economiaDestino]);

  const puede = origen !== ''
    && (esPago ? repartoDelPago.length > 0 : destino !== '' && origen !== destino)
    && monto !== null && monto > 0 && !guardando;

  async function guardar() {
    if (!puede || monto === null) return;
    setGuardando(true);
    try {
      if (esPago) {
        await pagarAOtraEconomia({
          fromJarId: origen, toEntityId: economiaDestino, amountMinor: monto,
          note: nota.trim() || undefined,
        });
      } else {
        await traspasarEntreJarras({
          fromJarId: origen, toJarId: destino, amountMinor: monto, note: nota.trim() || undefined,
        });
      }
      alCerrar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo mover');
    } finally {
      setGuardando(false);
    }
  }

  if (!abierta) return null;

  return (
    <Hoja abierta alCerrar={alCerrar} titulo={esPago ? 'Pagarle a otra economía' : 'Mover entre jarras'}>
      <div className="space-y-4">
        <p className="text-xs txt-3 leading-relaxed">
          {esPago ? (
            <>
              No se mueve plata de ninguna cuenta: ya está ahí, lo que cambia es
              de quién es. Por eso no cuenta como ingreso —el negocio ya lo contó
              cuando cobró— y el total del hogar no se mueve.
            </>
          ) : (
            <>
              No se mueve plata de ninguna cuenta. Solo cambia para qué está
              guardada.
              {variasEconomias && nombreAmbito
                && ` Estas son las jarras de ${nombreAmbito}; para pasarle plata a otra economía, elegila abajo en "A".`}
            </>
          )}
        </p>

        <Selector
          etiqueta="De"
          value={origen}
          onChange={(e) => {
            setOrigen(e.target.value);
            // El destino viejo puede ser de otra economia: se limpia para no
            // mandar un traspaso que cruza sin querer.
            setDestino('');
            setEconomiaDestino('');
          }}
        >
          <option value="">Elegí una jarra</option>
          {porEconomia
            ? porEconomia.map(({ economia, jarras }) => (
              <optgroup key={economia.id} label={economia.name}>
                {jarras.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.name} · {formatMonto(j.balanceMinor, moneda)}
                  </option>
                ))}
              </optgroup>
            ))
            : todas.map((j) => (
              <option key={j.id} value={j.id}>
                {j.name} · {formatMonto(j.balanceMinor, moneda)}
              </option>
            ))}
        </Selector>

        {/* El destino: otra jarra de la misma economia, o directamente otra
            economia. Lo segundo es el escalon que usan ellos —el negocio le
            paga a la casa— y se ve distinto porque es otra cosa. */}
        <Selector
          etiqueta="A"
          value={esPago ? `e:${economiaDestino}` : destino}
          onChange={(e) => {
            const v = e.target.value;
            if (v.startsWith('e:')) { setEconomiaDestino(v.slice(2)); setDestino(''); }
            else { setEconomiaDestino(''); setDestino(v); }
          }}
        >
          <option value="">Elegí a dónde va</option>
          {jars.filter((j) => j.id !== origen).map((j) => (
            <option key={j.id} value={j.id}>
              {j.name} · {formatMonto(j.balanceMinor, moneda)}
            </option>
          ))}
          {puedenCobrar.length > 0 && (
            <optgroup label="Pagarle a otra economía">
              {puedenCobrar.map((e) => (
                <option key={e.id} value={`e:${e.id}`}>
                  {e.name} · se reparte en sus jarras
                </option>
              ))}
            </optgroup>
          )}
        </Selector>

        <Campo
          etiqueta="Monto"
          value={montoTexto}
          onChange={(e) => setMontoTexto(e.target.value)}
          placeholder="0.00"
          inputMode="decimal"
        />

        {/* No se bloquea: a veces la jarra de origen tambien esta en rojo y
            aun asi conviene mover. Pero se dice. */}
        {jarraOrigen && monto !== null && monto > jarraOrigen.balanceMinor && (
          <p className="text-xs text-amber-600 dark:text-amber-500 px-1 -mt-2 leading-relaxed">
            {jarraOrigen.name} queda en{' '}
            {formatMonto(jarraOrigen.balanceMinor - monto, moneda)}.
          </p>
        )}

        {/* Como cae el pago, antes de hacerlo. Con las reglas de quien cobra,
            no las de quien paga. */}
        {esPago && repartoDelPago.length > 0 && (
          <div className="superficie-2 rounded-2xl p-3 space-y-1.5 -mt-1">
            <p className="text-xs txt-2 mb-1.5">
              Entra repartido en las jarras de{' '}
              {entities.find((e) => e.id === economiaDestino)?.name}:
            </p>
            {repartoDelPago.map(({ jarra, parte }) => (
              <div key={jarra.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="txt-2 truncate">{jarra.name}</span>
                <span className="tabular font-medium txt shrink-0">
                  {formatMonto(parte, moneda)}
                </span>
              </div>
            ))}
          </div>
        )}

        <Campo
          etiqueta="Por qué (opcional)"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder={esPago ? 'Lo que me tocó de septiembre...' : 'Me pasé con la comida...'}
          maxLength={200}
        />

        <Boton onClick={() => void guardar()} disabled={!puede} className="w-full min-h-12">
          {guardando
            ? (esPago ? 'Pagando...' : 'Moviendo...')
            : (esPago ? 'Pagar' : 'Mover')}
        </Boton>
      </div>
    </Hoja>
  );
}

/**
 * Movimientos que tocaron una jarra.
 *
 * No alcanza con filtrar por jar_id: un ingreso repartido no apunta a ninguna
 * jarra en particular, pero le entro plata a todas. La lista sale de las
 * mismas imputaciones congeladas que suman el saldo, asi que lo que se ve y
 * lo que dice el numero de arriba son lo mismo por construccion.
 */
function MovimientosDeJarra({ jarra, alCerrar, alVerMovimiento }: {
  jarra: Jar | null;
  alCerrar: () => void;
  alVerMovimiento: (tx: Transaction) => void;
}) {
  const { transactions, imputaciones, household } = useStore();
  const moneda = household?.currency ?? 'USD';

  const movimientos = useMemo(() => {
    if (!jarra) return [];
    const porTx = new Map(transactions.map((t) => [t.id, t]));
    return imputaciones
      .filter((i) => i.jarId === jarra.id && i.amountMinor !== 0)
      .map((i) => ({ tx: porTx.get(i.txId), delta: i.amountMinor }))
      .filter((x): x is { tx: Transaction; delta: number } => x.tx !== undefined)
      .sort((a, b) => b.tx.date - a.tx.date);
  }, [jarra, transactions, imputaciones]);

  if (!jarra) return null;

  const entro = movimientos.filter((m) => m.delta > 0).reduce((a, m) => a + m.delta, 0);
  const salio = movimientos.filter((m) => m.delta < 0).reduce((a, m) => a - m.delta, 0);

  return (
    <Hoja abierta alCerrar={alCerrar} titulo={jarra.name}>
      <div className="space-y-4">
        <div className="flex flex-col items-center text-center pt-1">
          <Ficha color={jarra.color} icono={jarra.icon} size={52} />
          <p className={cn(
            'text-3xl font-bold tabular tracking-tight mt-3',
            jarra.balanceMinor < 0 ? 'text-red-500' : 'txt',
          )}>
            {formatMonto(jarra.balanceMinor, moneda)}
          </p>
          <p className="text-xs txt-3 mt-1">{describirLlenado(jarra, moneda)}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="superficie-2 rounded-2xl p-3 text-center">
            <p className="text-[10px] txt-3 mb-0.5">Entró</p>
            <p className="text-sm font-semibold tabular text-marca-600 dark:text-marca-500">
              {formatMonto(entro, moneda)}
            </p>
          </div>
          <div className="superficie-2 rounded-2xl p-3 text-center">
            <p className="text-[10px] txt-3 mb-0.5">Salió</p>
            <p className="text-sm font-semibold tabular text-red-500">
              {formatMonto(salio, moneda)}
            </p>
          </div>
        </div>

        {movimientos.length === 0 ? (
          <Vacio
            icono="receipt-text"
            titulo="Sin movimientos"
            texto="Esta jarra todavía no recibió ni gastó nada. Repartí un ingreso o imputale un gasto."
          />
        ) : (
          <div>
            <p className="text-xs font-medium txt-3 px-1 mb-1">
              {movimientos.length} movimiento{movimientos.length > 1 ? 's' : ''}
            </p>
            <div className="divide-y divide-[var(--borde)]">
              {movimientos.map(({ tx, delta }) => (
                <div key={tx.id} className="relative">
                  <FilaMovimiento tx={tx} alTocar={() => alVerMovimiento(tx)} />
                  {/* Lo que entro o salio DE ESTA JARRA, que en un ingreso
                      repartido no es el monto total del movimiento. */}
                  <span className={cn(
                    'absolute right-1 bottom-2 text-[10px] tabular font-medium',
                    delta > 0 ? 'text-marca-600 dark:text-marca-500' : 'text-red-500',
                  )}>
                    {delta > 0 ? '+' : '−'}{formatMonto(Math.abs(delta), moneda, { compacto: true })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Hoja>
  );
}

interface Borrador {
  id?: string;
  name: string;
  percentageBp: number;
  color: string;
  icon: string;
  acumula: boolean;
  fillKind: 'porcentaje' | 'fijo' | 'resto';
  fillMinor: number | null;
}

/** Los seis frascos de siempre, para una economia personal que arranca. */
const FRASCOS_CASA: Omit<Borrador, 'id'>[] = [
  { name: 'Necesidades', percentageBp: 5500, color: '#3b82f6', icon: 'house', acumula: false, fillKind: 'porcentaje', fillMinor: null },
  { name: 'Ahorro largo plazo', percentageBp: 1000, color: '#10b981', icon: 'piggy-bank', acumula: true, fillKind: 'porcentaje', fillMinor: null },
  { name: 'Educación', percentageBp: 1000, color: '#8b5cf6', icon: 'graduation-cap', acumula: false, fillKind: 'porcentaje', fillMinor: null },
  { name: 'Diversión', percentageBp: 1000, color: '#ec4899', icon: 'party-popper', acumula: false, fillKind: 'porcentaje', fillMinor: null },
  { name: 'Libertad financiera', percentageBp: 1000, color: '#f59e0b', icon: 'trending-up', acumula: true, fillKind: 'porcentaje', fillMinor: null },
  { name: 'Donaciones', percentageBp: 500, color: '#f43f5e', icon: 'heart-handshake', acumula: false, fillKind: 'porcentaje', fillMinor: null },
];

/**
 * Lo que un negocio suele querer apartar de cada cobro antes de que la plata
 * se mezcle. La ultima es de resto, asi que la suma cierra sola y el cobro
 * puede ser de $50 o de $5.000 sin tocar nada.
 */
const FRASCOS_NEGOCIO: Omit<Borrador, 'id'>[] = [
  { name: 'Impuestos', percentageBp: 2000, color: '#f43f5e', icon: 'landmark', acumula: true, fillKind: 'porcentaje', fillMinor: null },
  { name: 'Insumos', percentageBp: 1000, color: '#f59e0b', icon: 'package', acumula: false, fillKind: 'porcentaje', fillMinor: null },
  { name: 'Publicidad', percentageBp: 1000, color: '#8b5cf6', icon: 'megaphone', acumula: false, fillKind: 'porcentaje', fillMinor: null },
  { name: 'Para repartir', percentageBp: 0, color: '#10b981', icon: 'hand-coins', acumula: true, fillKind: 'resto', fillMinor: null },
];

function EditorJarras({ abierta, alCerrar, jarras, alGuardar }: {
  abierta: boolean;
  alCerrar: () => void;
  jarras: Jar[];
  alGuardar: (jars: Partial<Jar>[]) => Promise<void>;
}) {
  const { entities, entidadActiva, household } = useStore();
  const moneda = household?.currency ?? 'USD';

  const economias = useMemo(() => entities.filter((e) => !e.archived), [entities]);
  const porDefecto = useMemo(() => entidadPorDefecto(entities), [entities]);

  // Se edita UNA economia por vez. Los porcentajes suman 100% dentro de cada
  // una, asi que mezclarlas en una sola lista mostraria un 200% que no
  // significa nada.
  const [entidad, setEntidad] = useState<string | null>(null);
  const [borradores, setBorradores] = useState<Borrador[]>([]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!abierta) return;
    setEntidad(entidadActiva ?? porDefecto);
  }, [abierta, entidadActiva, porDefecto]);

  useEffect(() => {
    if (!abierta) return;
    const suyas = jarras.filter((j) => j.entityId === entidad);
    const clase = economias.find((e) => e.id === entidad)?.kind;
    setBorradores(
      suyas.length > 0
        ? suyas.map((j) => ({
          id: j.id, name: j.name, percentageBp: j.percentageBp, color: j.color,
          icon: j.icon, acumula: j.acumula, fillKind: j.fillKind, fillMinor: j.fillMinor,
        }))
        : (clase === 'negocio' ? FRASCOS_NEGOCIO : FRASCOS_CASA).map((b) => ({ ...b })),
    );
  }, [abierta, jarras, entidad, economias]);

  const sumaBp = borradores.reduce((s, b) => s + b.percentageBp, 0);
  const { ok, motivo } = validarJarras(borradores as Jar[]);
  const hayResto = borradores.some((b) => b.fillKind === 'resto');

  const cambiar = (i: number, campo: keyof Borrador, valor: string | number | boolean | null) => {
    setBorradores((prev) => prev.map((b, k) => (k === i ? { ...b, [campo]: valor } : b)));
  };

  /**
   * Reparte lo que falta o sobra para llegar a 100% entre todas las jarras,
   * proporcionalmente. Evita la pelea de ajustar porcentajes a mano hasta que
   * el numero cierre.
   */
  const emparejar = () => {
    // Solo se reparten las de porcentaje: una jarra fija o de resto no tiene
    // porcentaje que ajustar.
    const indices = borradores
      .map((b, i) => (b.fillKind === 'porcentaje' ? i : -1))
      .filter((i) => i >= 0);
    if (indices.length === 0) return;

    const objetivo = 10_000;
    const actual = indices.reduce((t, i) => t + borradores[i].percentageBp, 0) || 1;

    let acumulado = 0;
    const ajustadas = [...borradores];
    indices.forEach((idx, k) => {
      const nuevo = k === indices.length - 1
        // La ultima se lleva exactamente lo que falta: la suma cierra siempre.
        ? objetivo - acumulado
        : Math.round((borradores[idx].percentageBp / actual) * objetivo);
      acumulado += nuevo;
      ajustadas[idx] = { ...ajustadas[idx], percentageBp: nuevo };
    });

    setBorradores(ajustadas);
  };

  return (
    <Hoja abierta={abierta} alCerrar={alCerrar} titulo="Ajustar jarras">
      <div className="space-y-3">
        {economias.length > 1 && (
          <>
            <Selector
              etiqueta="Economía"
              value={entidad ?? ''}
              onChange={(e) => setEntidad(e.target.value || null)}
            >
              {economias.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </Selector>
            <p className="text-xs txt-3 -mt-1 px-1 leading-relaxed">
              Cada economía reparte sus propios ingresos. Los porcentajes suman
              100% acá adentro, no entre todas.
            </p>
          </>
        )}

        <div className={cn(
          'rounded-2xl p-3.5 text-sm flex items-center gap-2.5',
          ok ? 'bg-marca-50 text-marca-700 dark:bg-marca-500/10 dark:text-marca-500' : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-500',
        )}>
          <Icono nombre={ok ? 'circle-check' : 'triangle-alert'} size={17} />
          <span className="flex-1">
            {/* Con una jarra de resto la suma no tiene que dar 100%: lo que
                falte lo absorbe ella. Decir "suman 40%" ahi asustaria sin
                motivo. */}
            {hayResto
              ? <>Los porcentajes suman {(sumaBp / 100).toFixed(2)}% · el resto va a la última</>
              : <>Suman {(sumaBp / 100).toFixed(2)}%{!ok && ' · tienen que sumar 100%'}</>}
          </span>
          {!ok && !hayResto && (
            <button onClick={emparejar} className="font-medium underline shrink-0">
              Emparejar
            </button>
          )}
        </div>

        {!ok && motivo && (
          <p className="text-xs text-amber-700 dark:text-amber-500 px-1 leading-relaxed">
            {motivo}
          </p>
        )}

        {borradores.map((b, i) => (
          <div key={b.id ?? `nueva-${i}`} className="superficie-2 rounded-2xl p-3 space-y-3">
            <div className="flex items-center gap-2.5">
              <Ficha color={b.color} icono={b.icon} size={38} />
              <input
                value={b.name}
                onChange={(e) => cambiar(i, 'name', e.target.value)}
                placeholder="Nombre"
                className="flex-1 min-w-0 min-h-10 px-3 rounded-xl superficie borde border txt text-base outline-none focus:border-marca-500"
              />
              <button
                onClick={() => setBorradores((p) => p.filter((_, k) => k !== i))}
                aria-label={`Quitar ${b.name}`}
                className="w-10 h-10 rounded-xl flex items-center justify-center txt-3 shrink-0"
              >
                <Icono nombre="trash-2" size={17} />
              </button>
            </div>

            {/* Como se llena. Un frasco de la casa va por porcentaje porque el
                sueldo es parejo; un cobro de agencia va de $50 a $5.000 y ahi
                "$100 de publicidad" dice mas que un 3%. */}
            <div className="flex gap-1.5">
              {([
                ['porcentaje', '%'],
                ['fijo', 'Monto fijo'],
                ['resto', 'Lo que sobre'],
              ] as const).map(([clase, etiqueta]) => (
                <button
                  key={clase}
                  onClick={() => {
                    cambiar(i, 'fillKind', clase);
                    // Solo una jarra puede quedarse con el resto: dos se lo
                    // repartirian sin ninguna regla.
                    if (clase === 'resto') {
                      setBorradores((prev) => prev.map((o, k) => (
                        k !== i && o.fillKind === 'resto'
                          ? { ...o, fillKind: 'porcentaje' as const }
                          : o
                      )));
                    }
                  }}
                  className={cn(
                    'flex-1 min-h-9 rounded-xl text-xs font-medium border transition-colors',
                    b.fillKind === clase
                      ? 'bg-marca-600 text-white border-transparent'
                      : 'superficie borde txt-2',
                  )}
                >
                  {etiqueta}
                </button>
              ))}
            </div>

            {b.fillKind === 'porcentaje' && (
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={10000}
                  step={50}
                  value={b.percentageBp}
                  onChange={(e) => cambiar(i, 'percentageBp', Number(e.target.value))}
                  className="flex-1 accent-marca-600"
                  aria-label={`Porcentaje de ${b.name}`}
                />
                <span className="text-sm font-semibold tabular txt w-16 text-right shrink-0">
                  {formatBp(b.percentageBp)}
                </span>
              </div>
            )}

            {b.fillKind === 'fijo' && (
              <Campo
                etiqueta="Monto de cada ingreso"
                value={b.fillMinor === null ? '' : montoPlano(b.fillMinor, moneda)}
                onChange={(e) => cambiar(
                  i, 'fillMinor', parseMonto(e.target.value, moneda),
                )}
                placeholder="0.00"
                inputMode="decimal"
              />
            )}

            {b.fillKind === 'resto' && (
              <p className="text-xs txt-3 px-1 leading-relaxed">
                Se lleva lo que quede después de las demás, y absorbe el
                redondeo. Así la suma cierra al centavo cobre lo que cobre.
              </p>
            )}

            <div className="flex gap-1.5 flex-wrap">
              {COLORES.map((c) => (
                <button
                  key={c}
                  onClick={() => cambiar(i, 'color', c)}
                  aria-label={`Color ${c}`}
                  className="w-7 h-7 rounded-lg transition-transform active:scale-90"
                  style={{ background: c, outline: b.color === c ? '2px solid currentColor' : 'none' }}
                />
              ))}
            </div>

            {/* De por vida o del mes. "Ahorro largo plazo" leido de a un mes no
                significa nada, y "Diversion" acumulada desde siempre tampoco. */}
            <button
              onClick={() => cambiar(i, 'acumula', !b.acumula)}
              className="w-full flex items-center gap-2.5 text-left"
            >
              <div className={cn(
                'w-10 h-6 rounded-full p-0.5 transition-colors shrink-0',
                b.acumula ? 'bg-marca-500' : 'superficie borde border',
              )}>
                <div className={cn(
                  'w-5 h-5 rounded-full bg-white shadow transition-transform',
                  b.acumula && 'translate-x-4',
                )} />
              </div>
              <span className="text-xs txt-2 leading-snug">
                {b.acumula
                  ? 'Acumula de por vida, como un ahorro'
                  : 'Se lee por mes, como un gasto corriente'}
              </span>
            </button>
          </div>
        ))}

        <Boton
          variante="secundario"
          onClick={() => setBorradores((p) => [...p, {
            name: 'Nueva jarra', percentageBp: 0, color: COLORES[p.length % COLORES.length],
            icon: 'piggy-bank', acumula: false, fillKind: 'porcentaje', fillMinor: null,
          }])}
          className="w-full"
        >
          <Icono nombre="plus" size={17} /> Agregar jarra
        </Boton>

        <div className="flex gap-2 pt-1">
          <Boton variante="secundario" onClick={alCerrar} className="flex-1">Cancelar</Boton>
          <Boton
            onClick={async () => {
              setGuardando(true);
              // El PUT recibe la lista COMPLETA y borra lo que no venga, asi
              // que las jarras de las otras economias viajan intactas. Sin
              // esto, ajustar los frascos de la casa borraria los del negocio.
              const otras = jarras
                .filter((j) => j.entityId !== entidad)
                .map((j) => ({
                  id: j.id, name: j.name, percentageBp: j.percentageBp, color: j.color,
                  icon: j.icon, acumula: j.acumula, entityId: j.entityId,
                  fillKind: j.fillKind, fillMinor: j.fillMinor,
                }));
              const propias = borradores
                .filter((b) => b.name.trim() !== '')
                .map((b) => ({ ...b, entityId: entidad }));
              await alGuardar([...otras, ...propias]);
              setGuardando(false);
            }}
            disabled={!ok || guardando}
            className="flex-1 min-h-12"
          >
            {guardando ? 'Guardando...' : 'Guardar'}
          </Boton>
        </div>

        {!ok && !motivo && (
          <p className="text-xs txt-3 text-center">
            Los porcentajes deben sumar 100% para poder repartir un ingreso.
          </p>
        )}
      </div>
    </Hoja>
  );
}
