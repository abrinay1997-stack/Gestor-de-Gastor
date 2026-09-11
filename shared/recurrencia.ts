/**
 * Calculo de fechas para los pagos habituales.
 *
 * Vive aparte y con tests propios porque las fechas recurrentes tienen una
 * trampa clasica: un pago el dia 31 en un mes que no tiene 31. Lo ingenuo es
 * hacer setDate(31) sobre febrero, y JavaScript desborda al 2 o 3 de marzo,
 * asi que el alquiler "del 31" termina apareciendo en marzo y el mes de
 * febrero queda sin el. Aca el dia se recorta al ultimo dia real del mes.
 *
 * Todas las fechas se calculan al mediodia local, no a medianoche: asi un
 * cambio de horario de verano no puede correr el pago al dia anterior.
 */

export type Frecuencia = 'semanal' | 'mensual' | 'anual';

export const FRECUENCIA_LABEL: Record<Frecuencia, string> = {
  semanal: 'Cada semana',
  mensual: 'Cada mes',
  anual: 'Cada año',
};

export const DIAS_SEMANA = [
  'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado',
] as const;

export const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const;

/** Cuantos dias tiene un mes. El dia 0 del siguiente es el ultimo de este. */
export function diasDelMes(anio: number, mes0: number): number {
  return new Date(anio, mes0 + 1, 0).getDate();
}

/**
 * Arma una fecha recortando el dia al ultimo que exista en ese mes.
 * Pedir el 31 de febrero devuelve el 28 (o el 29 en año bisiesto).
 */
export function fechaSegura(anio: number, mes0: number, dia: number): Date {
  const tope = diasDelMes(anio, mes0);
  return new Date(anio, mes0, Math.min(dia, tope), 12, 0, 0, 0);
}

export interface ReglaRecurrencia {
  frecuencia: Frecuencia;
  /** 1-31, para mensual y anual. */
  diaDelMes?: number;
  /** 0 = domingo, para semanal. */
  diaDeSemana?: number;
  /** 1-12, para anual. */
  mesDelAnio?: number;
}

/**
 * Primera fecha de cobro a partir de un momento dado.
 * Si hoy es justo el dia, es hoy: un pago que arranca el 10 y se crea el 10 no
 * tiene que esperar al mes siguiente.
 */
export function primeraFecha(regla: ReglaRecurrencia, desde = Date.now()): number {
  const d = new Date(desde);
  const anio = d.getFullYear();
  const mes0 = d.getMonth();
  const hoy = new Date(anio, mes0, d.getDate(), 12, 0, 0, 0).getTime();

  switch (regla.frecuencia) {
    case 'semanal': {
      const objetivo = regla.diaDeSemana ?? 1;
      const faltan = (objetivo - d.getDay() + 7) % 7;
      return new Date(anio, mes0, d.getDate() + faltan, 12, 0, 0, 0).getTime();
    }

    case 'mensual': {
      const dia = regla.diaDelMes ?? 1;
      const esteMes = fechaSegura(anio, mes0, dia).getTime();
      if (esteMes >= hoy) return esteMes;
      return fechaSegura(anio, mes0 + 1, dia).getTime();
    }

    case 'anual': {
      const dia = regla.diaDelMes ?? 1;
      const mes = (regla.mesDelAnio ?? 1) - 1;
      const esteAnio = fechaSegura(anio, mes, dia).getTime();
      if (esteAnio >= hoy) return esteAnio;
      return fechaSegura(anio + 1, mes, dia).getTime();
    }

    default:
      return hoy;
  }
}

/**
 * Siguiente fecha despues de una que ya se cobro.
 *
 * Avanza SIEMPRE desde el dia pedido por la regla, no desde el dia en que
 * efectivamente cayo. Si no, un pago del 31 que en febrero cayo el 28 pasaria
 * a cobrarse el 28 para siempre, porque cada mes avanzaria desde el ultimo.
 */
export function siguienteFecha(regla: ReglaRecurrencia, ultima: number): number {
  const d = new Date(ultima);

  switch (regla.frecuencia) {
    case 'semanal':
      return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7, 12, 0, 0, 0).getTime();

    case 'mensual':
      return fechaSegura(d.getFullYear(), d.getMonth() + 1, regla.diaDelMes ?? d.getDate()).getTime();

    case 'anual':
      return fechaSegura(
        d.getFullYear() + 1,
        (regla.mesDelAnio ?? d.getMonth() + 1) - 1,
        regla.diaDelMes ?? d.getDate(),
      ).getTime();

    default:
      return ultima;
  }
}

/**
 * Todas las fechas vencidas hasta hoy, empezando por la que toca.
 *
 * Devuelve una lista porque puede haber mas de una: si nadie abre la app ni
 * corre el disparador durante dos meses, hay dos alquileres para crear, no
 * uno. El tope evita que un dato corrupto (una fecha del año 1990) genere
 * cientos de movimientos de golpe.
 */
export function fechasVencidas(
  regla: ReglaRecurrencia,
  proxima: number,
  hasta = Date.now(),
  tope = 24,
): number[] {
  const out: number[] = [];
  let fecha = proxima;

  while (fecha <= hasta && out.length < tope) {
    out.push(fecha);
    const siguiente = siguienteFecha(regla, fecha);
    // Guarda contra una regla que no avance: sin esto seria un bucle infinito.
    if (siguiente <= fecha) break;
    fecha = siguiente;
  }

  return out;
}

/** Texto legible de la regla, para mostrar en la lista de pagos. */
export function describirRegla(regla: ReglaRecurrencia): string {
  switch (regla.frecuencia) {
    case 'semanal':
      return `Cada ${DIAS_SEMANA[regla.diaDeSemana ?? 1].toLowerCase()}`;
    case 'mensual':
      return `El ${regla.diaDelMes ?? 1} de cada mes`;
    case 'anual':
      return `El ${regla.diaDelMes ?? 1} de ${MESES[(regla.mesDelAnio ?? 1) - 1]}`;
    default:
      return '';
  }
}
