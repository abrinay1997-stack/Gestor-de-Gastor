/**
 * Las dos decisiones que deciden si un movimiento llega a sus jarras.
 *
 * Las dos nacieron de bugs con plata de verdad adentro, y las dos son puras:
 * no necesitan base ni red, solo los datos del movimiento.
 */

import { describe, expect, it } from 'vitest';
import { mismoReparto, repartoPosible } from './jarras.ts';
import type { Jar, Transaction } from '../shared/types.ts';
import { TxType } from '../shared/types.ts';

const reparto = (p: Partial<Transaction> = {}) => ({
  type: TxType.INGRESO,
  amountMinor: 50_000,
  distributeToJars: true,
  jarId: null,
  categoryId: null,
  entityId: null,
  ...p,
} as Pick<Transaction, 'type' | 'amountMinor' | 'distributeToJars' | 'jarId' | 'categoryId' | 'entityId'>);

const jarra = (id: string): Jar => ({
  id, householdId: 'h', name: id, acumula: false, percentageBp: 10_000,
  color: '#000', icon: 'jar', displayOrder: 0, createdAt: 0, balanceMinor: 0,
  entityId: 'e1', fillKind: 'porcentaje', fillMinor: null,
});

describe('mismoReparto', () => {
  it('lo que no toca el reparto no lo cambia', () => {
    // Corregir la descripcion o mover la fecha no puede volver a repartir con
    // los porcentajes de hoy: eso reescribiria un reparto viejo en silencio.
    expect(mismoReparto(reparto(), reparto())).toBe(true);
  });

  it('ve cambiar el monto y el interruptor', () => {
    expect(mismoReparto(reparto(), reparto({ amountMinor: 60_000 }))).toBe(false);
    expect(mismoReparto(reparto(), reparto({ distributeToJars: false }))).toBe(false);
    expect(mismoReparto(reparto(), reparto({ jarId: 'j1', distributeToJars: false }))).toBe(false);
  });

  /**
   * El bug: de la categoria sale la economia, y de la economia salen las
   * jarras. Un cobro repartido entre los seis frascos de la casa al que
   * despues se le corrige la categoria a una de PanaClaw tiene que repartirse
   * de nuevo entre las jarras de PanaClaw. Sin la categoria en esta
   * comparacion, la edicion parecia «no cambio nada» y el cobro se quedaba
   * imputado a los frascos de la casa para siempre.
   */
  it('ve cambiar la economia, que es la que decide ENTRE QUE jarras se reparte', () => {
    expect(mismoReparto(reparto(), reparto({ categoryId: 'pagina-web' }))).toBe(false);
    expect(mismoReparto(
      reparto({ categoryId: 'salario' }),
      reparto({ categoryId: 'pagina-web' }),
    )).toBe(false);
    expect(mismoReparto(reparto(), reparto({ entityId: 'panaclaw' }))).toBe(false);
  });
});

describe('repartoPosible', () => {
  it('con jarras, no toca nada', () => {
    const r = reparto();
    expect(repartoPosible(r, [jarra('j1')])).toBe(r);
  });

  it('sin jarras, apaga el reparto', () => {
    // Guardarlo encendido dejaba un ingreso «repartido» entre cero jarras: la
    // plata no llegaba a ninguna Y ademas el movimiento se volvia invisible,
    // porque la lista de huerfanos y la puesta al dia buscaban justamente los
    // que lo tenian apagado.
    expect(repartoPosible(reparto(), []).distributeToJars).toBe(false);
  });

  it('un movimiento que no reparte se devuelve igual', () => {
    const gasto = reparto({ type: TxType.GASTO, distributeToJars: false, jarId: 'j1' });
    expect(repartoPosible(gasto, [])).toBe(gasto);
  });

  it('no pierde ningun otro dato al apagarlo', () => {
    const r = reparto({ categoryId: 'c1', amountMinor: 1234 });
    const d = repartoPosible(r, []);
    expect(d).toEqual({ ...r, distributeToJars: false });
  });
});
