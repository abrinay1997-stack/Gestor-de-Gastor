/**
 * El relleno de codigos: lo que repara los movimientos que nacieron mudos.
 *
 * Si se equivoca puede hacer dos cosas malas: dejar a alguien sin codigo (lo
 * de hoy) o, peor, cambiarle el codigo a un movimiento que ya se menciono en
 * una conversacion. Por eso se prueba contra una D1 de mentira, igual que el
 * barrido de la papelera: asi se arma «113 sin codigo y 74 con» sin base.
 */

import { describe, expect, it } from 'vitest';
import { rellenarCodigos } from './codigo.ts';
import type { Env } from './env.ts';
import { ALFABETO, LARGO_CODIGO, pareceCodigo } from '../shared/codigo.ts';

interface Fila { id: string; code: string | null; createdAt: number; updatedAt: number }

/**
 * Una D1 con lo justo: las tres consultas que usa el relleno —listar lo que
 * esta sin codigo, ver que codigos estan tomados, y escribir uno—.
 */
function baseFalsa(filas: Fila[]) {
  const sentencia = (sql: string, args: unknown[] = []) => ({
    async all<T>() {
      if (/WHERE code IS NULL/.test(sql)) {
        const limite = Number(args[0]);
        return {
          results: filas
            .filter((f) => f.code === null)
            .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
            .slice(0, limite)
            .map((f) => ({ id: f.id })) as T[],
        };
      }
      if (/WHERE code IN/.test(sql)) {
        const pedidos = new Set(args.map(String));
        return {
          results: filas
            .filter((f) => f.code !== null && pedidos.has(f.code))
            .map((f) => ({ code: f.code })) as T[],
        };
      }
      throw new Error(`Consulta que la base falsa no entiende: ${sql}`);
    },
    ejecutar() {
      if (!/^UPDATE tx SET code/.test(sql)) throw new Error(`No entiendo: ${sql}`);
      const [code, id] = args as [string, string];
      const f = filas.find((x) => x.id === id);
      // El mismo candado que la consulta de verdad: solo si sigue sin codigo.
      if (f && f.code === null) f.code = code;
    },
  });

  const db = {
    prepare(sql: string) {
      return { ...sentencia(sql), bind: (...args: unknown[]) => sentencia(sql, args) };
    },
    async batch(sentencias: ReturnType<typeof sentencia>[]) {
      for (const s of sentencias) s.ejecutar();
      return [];
    },
  };

  return { env: { DB: db } as unknown as Env, filas };
}

const mov = (id: string, code: string | null, createdAt = 1): Fila => (
  { id, code, createdAt, updatedAt: 777 }
);

describe('rellenarCodigos', () => {
  it('le da un codigo valido a cada movimiento que no tiene', async () => {
    const { env, filas } = baseFalsa([mov('a', null), mov('b', null), mov('c', null)]);

    const pendientes = await rellenarCodigos(env);

    expect(pendientes).toBe(3);
    for (const f of filas) {
      expect(f.code).not.toBeNull();
      expect(f.code).toHaveLength(LARGO_CODIGO);
      expect(pareceCodigo(f.code as string)).toBe(true);
      for (const ch of f.code as string) expect(ALFABETO).toContain(ch);
    }
  });

  it('no repite codigos, ni entre si ni con los que ya existen', async () => {
    const existentes = ['7K2MQ', 'XNJY5', 'H7CP7'];
    const { env, filas } = baseFalsa([
      ...existentes.map((c, i) => mov(`ya${i}`, c)),
      ...Array.from({ length: 150 }, (_, i) => mov(`n${i}`, null, i)),
    ]);

    await rellenarCodigos(env);

    const codigos = filas.map((f) => f.code);
    expect(codigos.every((c) => c !== null)).toBe(true);
    expect(new Set(codigos).size).toBe(filas.length);
  });

  it('NO le cambia el codigo a uno que ya lo tiene', async () => {
    const { env, filas } = baseFalsa([mov('viejo', '89PNE'), mov('nuevo', null)]);

    await rellenarCodigos(env);

    expect(filas.find((f) => f.id === 'viejo')?.code).toBe('89PNE');
  });

  it('no toca updated_at: ponerle nombre no es editarlo', async () => {
    const { env, filas } = baseFalsa([mov('a', null)]);

    await rellenarCodigos(env);

    expect(filas[0].updatedAt).toBe(777);
  });

  it('si no hay nada que rellenar, no escribe nada', async () => {
    const { env, filas } = baseFalsa([mov('a', '89PNE'), mov('b', '5NY7Z')]);
    let escrituras = 0;
    const batchOriginal = env.DB.batch.bind(env.DB);
    env.DB.batch = (async (s: Parameters<typeof batchOriginal>[0]) => {
      escrituras += 1;
      return batchOriginal(s);
    }) as typeof env.DB.batch;

    const pendientes = await rellenarCodigos(env);

    expect(pendientes).toBe(0);
    expect(escrituras).toBe(0);
    expect(filas.map((f) => f.code)).toEqual(['89PNE', '5NY7Z']);
  });

  it('es idempotente: una segunda pasada ya no encuentra nada', async () => {
    const { env, filas } = baseFalsa([mov('a', null), mov('b', null)]);

    await rellenarCodigos(env);
    const despues = filas.map((f) => f.code);

    expect(await rellenarCodigos(env)).toBe(0);
    expect(filas.map((f) => f.code)).toEqual(despues);
  });

  it('si otro telefono ya lo relleno en el medio, no le pisa el codigo', async () => {
    // Dos aperturas de la app a la vez: las dos ven «a» sin codigo, y la otra
    // llega primero a escribir.
    const { env, filas } = baseFalsa([mov('a', null)]);
    const original = env.DB.batch.bind(env.DB);
    env.DB.batch = (async (s: Parameters<typeof original>[0]) => {
      filas[0].code = 'GANADOR';
      return original(s);
    }) as typeof env.DB.batch;

    await rellenarCodigos(env);

    expect(filas[0].code).toBe('GANADOR');
  });
});
