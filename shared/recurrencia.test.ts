import { describe, expect, it } from 'vitest';
import {
  describirRegla, diasDelMes, fechaSegura, fechasVencidas,
  primeraFecha, siguienteFecha, type ReglaRecurrencia,
} from './recurrencia.ts';

const f = (epoch: number) => {
  const d = new Date(epoch);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** Epoch al mediodia local, igual que lo que produce el modulo. */
const en = (a: number, m: number, d: number) => new Date(a, m - 1, d, 12, 0, 0, 0).getTime();

describe('diasDelMes', () => {
  it('conoce los meses de 31, 30 y 28', () => {
    expect(diasDelMes(2026, 0)).toBe(31);
    expect(diasDelMes(2026, 3)).toBe(30);
    expect(diasDelMes(2026, 1)).toBe(28);
  });

  it('sabe que 2028 es bisiesto', () => {
    expect(diasDelMes(2028, 1)).toBe(29);
  });

  it('aplica bien la regla del siglo: 2000 bisiesto, 2100 no', () => {
    expect(diasDelMes(2000, 1)).toBe(29);
    expect(diasDelMes(2100, 1)).toBe(28);
  });
});

describe('fechaSegura', () => {
  it('respeta un dia que existe', () => {
    expect(f(fechaSegura(2026, 0, 15).getTime())).toBe('2026-01-15');
  });

  it('recorta el 31 de febrero al 28', () => {
    // Lo ingenuo seria setDate(31) sobre febrero, que desborda a marzo.
    expect(f(fechaSegura(2026, 1, 31).getTime())).toBe('2026-02-28');
  });

  it('recorta al 29 en año bisiesto', () => {
    expect(f(fechaSegura(2028, 1, 31).getTime())).toBe('2028-02-29');
  });

  it('recorta el 31 en meses de 30', () => {
    expect(f(fechaSegura(2026, 3, 31).getTime())).toBe('2026-04-30');
  });

  it('nunca se va al mes siguiente', () => {
    for (let mes = 0; mes < 12; mes++) {
      const d = fechaSegura(2026, mes, 31);
      expect(d.getMonth()).toBe(mes);
    }
  });
});

describe('primeraFecha', () => {
  const mensual = (dia: number): ReglaRecurrencia => ({ frecuencia: 'mensual', diaDelMes: dia });

  it('toma este mes si el dia todavia no paso', () => {
    expect(f(primeraFecha(mensual(20), en(2026, 3, 10)))).toBe('2026-03-20');
  });

  it('cuenta hoy como valido', () => {
    // Un pago que arranca el 10 y se crea el 10 no espera al mes siguiente.
    expect(f(primeraFecha(mensual(10), en(2026, 3, 10)))).toBe('2026-03-10');
  });

  it('pasa al mes siguiente si el dia ya paso', () => {
    expect(f(primeraFecha(mensual(5), en(2026, 3, 10)))).toBe('2026-04-05');
  });

  it('recorta al crear un pago del 31 estando en enero', () => {
    expect(f(primeraFecha(mensual(31), en(2026, 2, 1)))).toBe('2026-02-28');
  });

  it('semanal: encuentra el proximo dia de la semana', () => {
    // 2026-03-10 es martes (2). El proximo viernes (5) es el 13.
    const regla: ReglaRecurrencia = { frecuencia: 'semanal', diaDeSemana: 5 };
    expect(new Date(en(2026, 3, 10)).getDay()).toBe(2);
    expect(f(primeraFecha(regla, en(2026, 3, 10)))).toBe('2026-03-13');
  });

  it('semanal: si hoy es el dia, es hoy', () => {
    const regla: ReglaRecurrencia = { frecuencia: 'semanal', diaDeSemana: 2 };
    expect(f(primeraFecha(regla, en(2026, 3, 10)))).toBe('2026-03-10');
  });

  it('anual: toma el año que viene si la fecha ya paso', () => {
    const regla: ReglaRecurrencia = { frecuencia: 'anual', diaDelMes: 1, mesDelAnio: 1 };
    expect(f(primeraFecha(regla, en(2026, 3, 10)))).toBe('2027-01-01');
  });

  it('anual: toma este año si todavia no llego', () => {
    const regla: ReglaRecurrencia = { frecuencia: 'anual', diaDelMes: 25, mesDelAnio: 12 };
    expect(f(primeraFecha(regla, en(2026, 3, 10)))).toBe('2026-12-25');
  });
});

describe('siguienteFecha', () => {
  it('mensual avanza un mes', () => {
    const regla: ReglaRecurrencia = { frecuencia: 'mensual', diaDelMes: 15 };
    expect(f(siguienteFecha(regla, en(2026, 3, 15)))).toBe('2026-04-15');
  });

  it('el pago del 31 vuelve al 31 despues de caer en febrero', () => {
    // Este es el caso que se rompe solo si se avanza desde el dia real en vez
    // de desde el dia pedido: quedaria clavado en el 28 para siempre.
    const regla: ReglaRecurrencia = { frecuencia: 'mensual', diaDelMes: 31 };
    const febrero = siguienteFecha(regla, en(2026, 1, 31));
    expect(f(febrero)).toBe('2026-02-28');
    expect(f(siguienteFecha(regla, febrero))).toBe('2026-03-31');
  });

  it('un pago del 31 a lo largo de un año entero cae siempre en su mes', () => {
    const regla: ReglaRecurrencia = { frecuencia: 'mensual', diaDelMes: 31 };
    let fecha = en(2026, 1, 31);
    const dias: number[] = [];
    for (let i = 0; i < 12; i++) {
      fecha = siguienteFecha(regla, fecha);
      dias.push(new Date(fecha).getDate());
    }
    // Febrero 28, los meses de 30 dan 30, el resto 31. Ninguno es 1, 2 o 3,
    // que es lo que saldria si desbordara al mes siguiente.
    expect(dias).toEqual([28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31, 31]);
  });

  it('semanal avanza siete dias', () => {
    const regla: ReglaRecurrencia = { frecuencia: 'semanal', diaDeSemana: 2 };
    expect(f(siguienteFecha(regla, en(2026, 3, 10)))).toBe('2026-03-17');
  });

  it('semanal cruza fin de mes sin romperse', () => {
    const regla: ReglaRecurrencia = { frecuencia: 'semanal', diaDeSemana: 2 };
    expect(f(siguienteFecha(regla, en(2026, 3, 31)))).toBe('2026-04-07');
  });

  it('anual avanza un año', () => {
    const regla: ReglaRecurrencia = { frecuencia: 'anual', diaDelMes: 25, mesDelAnio: 12 };
    expect(f(siguienteFecha(regla, en(2026, 12, 25)))).toBe('2027-12-25');
  });

  it('el 29 de febrero de un bisiesto cae en 28 al año siguiente', () => {
    const regla: ReglaRecurrencia = { frecuencia: 'anual', diaDelMes: 29, mesDelAnio: 2 };
    expect(f(siguienteFecha(regla, en(2028, 2, 29)))).toBe('2029-02-28');
  });
});

describe('fechasVencidas', () => {
  const mensual: ReglaRecurrencia = { frecuencia: 'mensual', diaDelMes: 1 };

  it('no devuelve nada si todavia no vencio', () => {
    expect(fechasVencidas(mensual, en(2026, 4, 1), en(2026, 3, 15))).toEqual([]);
  });

  it('devuelve una si vencio una', () => {
    expect(fechasVencidas(mensual, en(2026, 3, 1), en(2026, 3, 15)).map(f))
      .toEqual(['2026-03-01']);
  });

  it('devuelve todas las atrasadas, no solo la ultima', () => {
    // Si nadie abrio la app en tres meses, son tres alquileres, no uno.
    expect(fechasVencidas(mensual, en(2026, 1, 1), en(2026, 3, 15)).map(f))
      .toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);
  });

  it('corta en el tope para que un dato corrupto no genere cientos', () => {
    const r = fechasVencidas(mensual, en(1990, 1, 1), en(2026, 3, 15));
    expect(r.length).toBe(24);
  });

  it('respeta un tope propio', () => {
    expect(fechasVencidas(mensual, en(2026, 1, 1), en(2026, 12, 31), 3).length).toBe(3);
  });

  it('no entra en bucle si la regla no avanza', () => {
    const rota = { frecuencia: 'ninguna' as unknown as 'mensual' };
    const r = fechasVencidas(rota, en(2026, 1, 1), en(2026, 12, 31));
    expect(r.length).toBe(1);
  });
});

describe('describirRegla', () => {
  it('describe la mensual', () => {
    expect(describirRegla({ frecuencia: 'mensual', diaDelMes: 10 })).toBe('El 10 de cada mes');
  });

  it('describe la semanal', () => {
    expect(describirRegla({ frecuencia: 'semanal', diaDeSemana: 1 })).toBe('Cada lunes');
  });

  it('describe la anual', () => {
    expect(describirRegla({ frecuencia: 'anual', diaDelMes: 25, mesDelAnio: 12 }))
      .toBe('El 25 de diciembre');
  });
});
