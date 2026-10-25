import { describe, expect, it } from 'vitest';
import {
  ALFABETO, COMBINACIONES, LARGO_CODIGO, generarCodigo, normalizarCodigo, pareceCodigo,
} from './codigo.ts';

describe('alfabeto', () => {
  it('tiene 30 simbolos y ninguno repetido', () => {
    expect(ALFABETO).toHaveLength(30);
    expect(new Set(ALFABETO).size).toBe(30);
  });

  /**
   * Los seis que se confunden al dictar o copiar a mano. Que falten es el
   * unico motivo por el que el alfabeto no es simplemente A-Z0-9.
   */
  it('deja afuera los simbolos que se leen mal', () => {
    for (const malo of ['0', 'O', '1', 'I', 'L', 'U']) {
      expect(ALFABETO).not.toContain(malo);
    }
  });

  it('da 24.300.000 combinaciones', () => {
    expect(COMBINACIONES).toBe(24_300_000);
  });
});

describe('generarCodigo', () => {
  it('siempre son cinco simbolos del alfabeto', () => {
    for (let i = 0; i < 2000; i++) {
      const c = generarCodigo();
      expect(c).toHaveLength(LARGO_CODIGO);
      for (const ch of c) expect(ALFABETO).toContain(ch);
    }
  });

  /**
   * Con 24 millones de combinaciones, 5.000 codigos no deberian chocar casi
   * nunca (la probabilidad de que haya AL MENOS un choque ronda el 0,05%).
   * Esta prueba no busca el cero absoluto —seria tirar una moneda y exigir
   * cara—, sino cazar un generador que devuelva siempre lo mismo o que se
   * quede pegado en una parte del alfabeto.
   */
  it('no se repite en tandas grandes', () => {
    const vistos = new Set<string>();
    for (let i = 0; i < 5000; i++) vistos.add(generarCodigo());
    expect(vistos.size).toBeGreaterThan(4990);
  });

  /**
   * El descarte de los bytes >= 240 existe para esto: 256 no es multiplo de
   * 30, asi que tomar el resto sin descartar nada le daria a los 16 primeros
   * simbolos un 12,5% mas de probabilidad que al resto. Con suficientes
   * muestras, cada simbolo tiene que aparecer una cantidad parecida.
   */
  it('usa todo el alfabeto de forma pareja', () => {
    const veces = new Map<string, number>([...ALFABETO].map((c) => [c, 0]));
    const total = 30_000;
    for (let i = 0; i < total / LARGO_CODIGO; i++) {
      for (const ch of generarCodigo()) veces.set(ch, (veces.get(ch) ?? 0) + 1);
    }
    const esperado = total / 30;
    for (const [simbolo, n] of veces) {
      expect(n, `el simbolo ${simbolo} salio ${n} veces`).toBeGreaterThan(esperado * 0.7);
      expect(n, `el simbolo ${simbolo} salio ${n} veces`).toBeLessThan(esperado * 1.3);
    }
  });
});

describe('normalizarCodigo', () => {
  it('arregla mayusculas, espacios y guiones', () => {
    expect(normalizarCodigo(' 7k2mq ')).toBe('7K2MQ');
    expect(normalizarCodigo('7K2-MQ')).toBe('7K2MQ');
    expect(normalizarCodigo('7 K 2 M Q')).toBe('7K2MQ');
  });

  /**
   * Lo que NO hace, que es la mitad del punto: traducir los simbolos parecidos
   * seria adivinar, y adivinar mal convierte un codigo correcto en otro que
   * existe y apunta a otro movimiento.
   */
  it('no adivina simbolos parecidos', () => {
    expect(normalizarCodigo('7K2MO')).toBe('7K2MO');
    expect(normalizarCodigo('7K21Q')).toBe('7K21Q');
  });
});

describe('pareceCodigo', () => {
  it('acepta lo que puede ser un codigo', () => {
    expect(pareceCodigo('7K2MQ')).toBe(true);
    expect(pareceCodigo(' 7k2mq ')).toBe(true);
    for (let i = 0; i < 200; i++) expect(pareceCodigo(generarCodigo())).toBe(true);
  });

  it('rechaza lo que no lo es', () => {
    expect(pareceCodigo('super')).toBe(false);      // cinco letras, pero con U
    expect(pareceCodigo('7K2M')).toBe(false);       // corto
    expect(pareceCodigo('7K2MQ9')).toBe(false);     // largo
    expect(pareceCodigo('')).toBe(false);
    expect(pareceCodigo('pizza')).toBe(false);
  });
});
