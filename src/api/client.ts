/**
 * Cliente HTTP. Fino a proposito: la logica esta en el store.
 */

import { derivarClave } from '@shared/kdf';
import type {
  Account, Budget, Category, Jar, Member, Snapshot, Transaction, TransactionInput,
} from '@shared/types';

export class ApiError extends Error {
  constructor(public status: number, mensaje: string) {
    super(mensaje);
  }
  /** Sin conexion o servidor caido: sirve para decidir si encolar el cambio. */
  get esDeRed(): boolean {
    return this.status === 0;
  }
}

async function pedir<T>(ruta: string, init: RequestInit = {}): Promise<T> {
  let res: Response;

  try {
    res = await fetch(ruta, {
      ...init,
      // La cookie de sesion es HttpOnly; hay que pedir que viaje.
      credentials: 'same-origin',
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, 'Sin conexion');
  }

  if (res.status === 204) return undefined as T;

  const texto = await res.text();
  let data: unknown = null;
  try {
    data = texto ? JSON.parse(texto) : null;
  } catch {
    // Respuesta que no es JSON (por ejemplo un HTML de error del borde).
  }

  if (!res.ok) {
    const mensaje =
      (data as { error?: string } | null)?.error ?? `Error ${res.status}`;
    throw new ApiError(res.status, mensaje);
  }

  return data as T;
}

const get = <T>(ruta: string) => pedir<T>(ruta);
const post = <T>(ruta: string, body: unknown) =>
  pedir<T>(ruta, { method: 'POST', body: JSON.stringify(body) });
const put = <T>(ruta: string, body: unknown) =>
  pedir<T>(ruta, { method: 'PUT', body: JSON.stringify(body) });
const del = <T>(ruta: string) => pedir<T>(ruta, { method: 'DELETE' });

/** Saldos recalculados que el servidor devuelve junto a cada mutacion. */
interface ConSaldos {
  accounts: Account[];
  jars: Jar[];
}

/**
 * Todo lo que toca contraseñas pasa antes por derivarClave.
 *
 * La contraseña de verdad no sale nunca del dispositivo: lo que viaja es una
 * clave derivada con 210.000 iteraciones de PBKDF2. El motivo esta explicado
 * en shared/kdf.ts, pero el resumen es que el servidor tiene 10 ms de CPU y
 * ese trabajo cuesta 150; aca no hay limite.
 *
 * La sal es el email, asi que hay que derivar con el email de la persona DUEÑA
 * de la contraseña. En el alta de la pareja, eso significa el email de ella,
 * no el de quien esta invitando.
 */
export const api = {
  estado: () => get<{ instalado: boolean }>('/api/status'),

  setup: async (d: {
    email: string; password: string; displayName: string;
    householdName: string; currency: string; setupKey: string;
  }) => post<{ ok: true; householdId: string }>('/api/setup', {
    ...d,
    password: await derivarClave(d.password, d.email),
  }),

  login: async (email: string, password: string) =>
    post<{ ok: true }>('/api/login', {
      email,
      password: await derivarClave(password, email),
    }),

  logout: () => post<{ ok: true }>('/api/logout', {}),

  invitar: async (d: { email: string; password: string; displayName: string; color?: string }) =>
    post<{ member: Member }>('/api/invite', {
      ...d,
      // Con el email de ELLA: es su contraseña, y su email es la sal.
      password: await derivarClave(d.password, d.email),
    }),

  cambiarPassword: async (email: string, currentPassword: string, newPassword: string) =>
    post<{ ok: true }>('/api/password', {
      currentPassword: await derivarClave(currentPassword, email),
      newPassword: await derivarClave(newPassword, email),
    }),

  snapshot: () => get<Snapshot>('/api/snapshot'),

  crearTx: (t: TransactionInput) =>
    post<{ transaction: Transaction } & ConSaldos>('/api/transactions', t),

  editarTx: (id: string, t: TransactionInput) =>
    put<{ transaction: Transaction } & ConSaldos>(`/api/transactions/${id}`, t),

  borrarTx: (id: string) =>
    del<{ ok: true } & ConSaldos>(`/api/transactions/${id}`),

  crearTxLote: (transactions: TransactionInput[]) =>
    post<{ transactions: Transaction[]; rechazados: { indice: number; motivo: string }[] } & ConSaldos>(
      '/api/transactions/batch', { transactions },
    ),

  crearCuenta: (a: Partial<Account>) => post<{ account: Account }>('/api/accounts', a),
  editarCuenta: (id: string, a: Partial<Account>) => put<{ account: Account }>(`/api/accounts/${id}`, a),
  archivarCuenta: (id: string) => del<{ ok: true; account?: Account }>(`/api/accounts/${id}`),
  borrarCuenta: (id: string) => del<{ ok: true }>(`/api/accounts/${id}?purge=1`),

  crearCategoria: (c: Partial<Category>) => post<{ category: Category }>('/api/categories', c),
  editarCategoria: (id: string, c: Partial<Category>) =>
    put<{ category: Category }>(`/api/categories/${id}`, c),

  guardarJarras: (jars: Partial<Jar>[]) => put<{ jars: Jar[] }>('/api/jars', { jars }),

  guardarPresupuesto: (b: { categoryId: string | null; amountMinor: number; period: string }) =>
    put<{ budget: Budget }>('/api/budgets', b),
  borrarPresupuesto: (id: string) => del<{ ok: true }>(`/api/budgets/${id}`),
};
