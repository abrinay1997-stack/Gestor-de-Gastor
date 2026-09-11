/**
 * Selector de periodo: dia, semana, mes, año o rango libre.
 *
 * Tocar el encabezado de fecha lo abre. Las flechas a los costados mueven el
 * periodo sin abrir nada, que es el gesto mas frecuente por lejos (ver el mes
 * anterior). Elegir OTRO tipo de periodo es mucho menos habitual, asi que vive
 * un toque mas adentro.
 */

import { useState } from 'react';
import {
  describirPeriodo, moverPeriodo, periodoAnio, periodoDia, periodoMes,
  periodoRango, periodoSemana, periodoTodo, type Periodo, type TipoPeriodo,
} from '@shared/periodo';
import { aInputDate, deInputDate, mayusculaInicial } from '../../lib/utils.ts';
import { Boton, Campo, Hoja, Icono } from './base.tsx';
import { cn } from '../../lib/utils.ts';

const TIPOS: { id: TipoPeriodo; etiqueta: string }[] = [
  { id: 'dia', etiqueta: 'Día' },
  { id: 'semana', etiqueta: 'Semana' },
  { id: 'mes', etiqueta: 'Mes' },
  { id: 'anio', etiqueta: 'Año' },
  { id: 'rango', etiqueta: 'Rango' },
  { id: 'todo', etiqueta: 'Todo' },
];

export function SelectorPeriodo({ periodo, alCambiar }: {
  periodo: Periodo;
  alCambiar: (p: Periodo) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [desde, setDesde] = useState(aInputDate(periodo.desde));
  const [hasta, setHasta] = useState(aInputDate(periodo.hasta));

  // Un rango libre o "todo" no tienen un siguiente evidente, asi que las
  // flechas se apagan en vez de no hacer nada al tocarlas.
  const movible = periodo.tipo !== 'rango' && periodo.tipo !== 'todo';
  // No dejar avanzar hacia un futuro que todavia no existe.
  const haySiguiente = movible && periodo.hasta < Date.now();

  function elegirTipo(tipo: TipoPeriodo) {
    const ahora = Date.now();
    switch (tipo) {
      case 'dia': alCambiar(periodoDia(ahora)); break;
      case 'semana': alCambiar(periodoSemana(ahora)); break;
      case 'mes': alCambiar(periodoMes(ahora)); break;
      case 'anio': alCambiar(periodoAnio(ahora)); break;
      case 'todo': alCambiar(periodoTodo()); break;
      case 'rango': return; // el rango se aplica con su boton
    }
    setAbierto(false);
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => movible && alCambiar(moverPeriodo(periodo, -1))}
          disabled={!movible}
          aria-label="Período anterior"
          className="w-10 h-10 rounded-xl superficie-2 flex items-center justify-center txt-2 disabled:opacity-30 shrink-0"
        >
          <Icono nombre="chevron-left" size={19} />
        </button>

        <button
          onClick={() => setAbierto(true)}
          className="flex-1 min-h-10 rounded-xl flex items-center justify-center gap-1.5 px-2 active:superficie-2 transition-colors"
        >
          <span className="font-semibold txt truncate">{mayusculaInicial(describirPeriodo(periodo))}</span>
          <Icono nombre="chevron-down" size={15} className="txt-3 shrink-0" />
        </button>

        <button
          onClick={() => haySiguiente && alCambiar(moverPeriodo(periodo, 1))}
          disabled={!haySiguiente}
          aria-label="Período siguiente"
          className="w-10 h-10 rounded-xl superficie-2 flex items-center justify-center txt-2 disabled:opacity-30 shrink-0"
        >
          <Icono nombre="chevron-right" size={19} />
        </button>
      </div>

      <Hoja abierta={abierto} alCerrar={() => setAbierto(false)} titulo="Período">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {TIPOS.map((t) => (
              <button
                key={t.id}
                onClick={() => elegirTipo(t.id)}
                className={cn(
                  'min-h-11 rounded-xl text-sm font-medium border transition-all',
                  periodo.tipo === t.id
                    ? 'bg-marca-600 text-white border-transparent'
                    : 'superficie-2 borde txt-2',
                )}
              >
                {t.etiqueta}
              </button>
            ))}
          </div>

          {/* El rango necesita sus dos fechas, asi que se despliega al elegirlo. */}
          {periodo.tipo === 'rango' && (
            <div className="space-y-3 pt-1">
              <Campo etiqueta="Desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
              <Campo etiqueta="Hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
              <Boton
                onClick={() => {
                  alCambiar(periodoRango(deInputDate(desde), deInputDate(hasta)));
                  setAbierto(false);
                }}
                className="w-full min-h-12"
              >
                Aplicar
              </Boton>
            </div>
          )}

          {periodo.tipo !== 'rango' && (
            <button
              onClick={() => {
                setDesde(aInputDate(periodo.desde));
                setHasta(aInputDate(periodo.hasta));
                alCambiar(periodoRango(periodo.desde, periodo.hasta));
              }}
              className="w-full min-h-11 rounded-xl superficie-2 borde border text-sm txt-2 flex items-center justify-center gap-2"
            >
              <Icono nombre="calendar-days" size={16} /> Elegir un rango exacto
            </button>
          )}
        </div>
      </Hoja>
    </>
  );
}
