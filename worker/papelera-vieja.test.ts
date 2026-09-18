/**
 * El barrido de la papelera, que es lo unico que borra sin que nadie lo pida.
 *
 * Corre de noche y no hay quien lo mire: si se equivoca, se lleva cosas que
 * nadie queria perder. Por eso se prueba contra una D1 de mentira en vez de
 * levantar un Worker: asi se puede poner una fila «tirada hace 40 dias» sin
 * tocar reloj ni base de verdad.
 */

import { describe, expect, it } from 'vitest';
import { barrerPapelera } from './papelera-vieja.ts';
import type { Env } from './env.ts';

interface Fila { id: string; tabla: string; trashedAt: number | null; atada: boolean }

/**
 * Una D1 con lo justo: entiende las tres formas de consulta que usa el
 * barrido —listar lo vencido, preguntar si algo esta atado, y borrar—.
 */
function baseFalsa(filas: Fila[]) {
  const vivas = [...filas];

  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          const arg = args[0];
          return {
            async all<T>() {
              const tabla = /FROM (\w+)/.exec(sql)?.[1] ?? '';
              const corte = Number(arg);
              return {
                results: vivas
                  .filter((f) => f.tabla === tabla && f.trashedAt !== null && f.trashedAt <= corte)
                  .map((f) => ({ id: f.id })) as T[],
              };
            },
            async first() {
              // Cualquier «SELECT 1 FROM ... WHERE algo = ?1» es una atadura.
              const f = vivas.find((x) => x.id === String(arg));
              return f?.atada ? { 1: 1 } : null;
            },
            async run() {
              const i = vivas.findIndex((x) => x.id === String(arg));
              if (i >= 0) vivas.splice(i, 1);
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };

  return { env: { DB: db } as unknown as Env, vivas };
}

const dias = (n: number) => Date.now() - n * 86_400_000;

describe('barrerPapelera', () => {
  it('borra lo vencido que no tiene nada colgando', async () => {
    const { env, vivas } = baseFalsa([
      { id: 'vieja', tabla: 'category', trashedAt: dias(40), atada: false },
    ]);
    const { borrados } = await barrerPapelera(env);
    expect(borrados).toBe(1);
    expect(vivas).toHaveLength(0);
  });

  it('NO borra lo que todavía no cumplió los 30 días', async () => {
    const { env, vivas } = baseFalsa([
      { id: 'fresca', tabla: 'category', trashedAt: dias(29), atada: false },
    ]);
    const { borrados } = await barrerPapelera(env);
    expect(borrados).toBe(0);
    expect(vivas.map((f) => f.id)).toEqual(['fresca']);
  });

  it('NO borra lo que tiene historia, por más viejo que sea', async () => {
    const { env, vivas } = baseFalsa([
      { id: 'usada', tabla: 'category', trashedAt: dias(400), atada: true },
    ]);
    const { borrados } = await barrerPapelera(env);
    expect(borrados).toBe(0);
    expect(vivas.map((f) => f.id)).toEqual(['usada']);
  });

  it('NO toca lo que no está en la papelera', async () => {
    const { env, vivas } = baseFalsa([
      { id: 'en-uso', tabla: 'category', trashedAt: null, atada: false },
    ]);
    await barrerPapelera(env);
    expect(vivas.map((f) => f.id)).toEqual(['en-uso']);
  });

  it('separa bien dentro de una misma tanda', async () => {
    const { env, vivas } = baseFalsa([
      { id: 'cat-vieja', tabla: 'category', trashedAt: dias(45), atada: false },
      { id: 'cat-usada', tabla: 'category', trashedAt: dias(45), atada: true },
      { id: 'cuenta-vieja', tabla: 'account', trashedAt: dias(60), atada: false },
      { id: 'cuenta-usada', tabla: 'account', trashedAt: dias(60), atada: true },
      { id: 'eco-nueva', tabla: 'entity', trashedAt: dias(1), atada: false },
    ]);
    const { borrados } = await barrerPapelera(env);
    expect(borrados).toBe(2);
    expect(vivas.map((f) => f.id).sort()).toEqual(['cat-usada', 'cuenta-usada', 'eco-nueva']);
  });
});
