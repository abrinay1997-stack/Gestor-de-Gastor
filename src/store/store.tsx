/**
 * Estado de la app.
 *
 * Tres propiedades que hacen que se sienta instantanea:
 *
 * 1. Actualizacion optimista: al cargar un gasto aparece en pantalla antes de
 *    que el servidor conteste. Si el servidor rechaza, se revierte y se avisa.
 * 2. Tiempo real: lo que carga una persona aparece en el telefono de la otra
 *    sin refrescar, por el WebSocket.
 * 3. Cola sin conexion: si no hay señal, el movimiento se guarda igual y se
 *    manda solo cuando vuelve. Nada se pierde por estar en el subte.
 */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef,
  type ReactNode,
} from 'react';
import { api, ApiError } from '../api/client.ts';
import { live, type EstadoLive } from '../api/live.ts';
import { calcularJarras, calcularSaldos } from '@shared/domain';
import type {
  Account, Budget, Category, Jar, LiveEvent, Member, Snapshot, Transaction,
  TransactionInput,
} from '@shared/types';

const CLAVE_COLA = 'gg_cola_v1';

interface Estado {
  cargando: boolean;
  autenticado: boolean;
  instalado: boolean;
  me: Member | null;
  members: Member[];
  household: Snapshot['household'] | null;
  accounts: Account[];
  categories: Category[];
  jars: Jar[];
  budgets: Budget[];
  transactions: Transaction[];
  /** Ids con una escritura en vuelo: la UI los muestra atenuados. */
  enVuelo: Set<string>;
  /** Movimientos cargados sin conexion, esperando para subir. */
  cola: TransactionInput[];
  online: string[];
  estadoLive: EstadoLive;
  aviso: { texto: string; tipo: 'error' | 'ok' } | null;
}

const inicial: Estado = {
  cargando: true, autenticado: false, instalado: true, me: null, members: [],
  household: null, accounts: [], categories: [], jars: [], budgets: [],
  transactions: [], enVuelo: new Set(), cola: [], online: [],
  estadoLive: 'desconectado', aviso: null,
};

type Accion =
  | { t: 'cargando'; v: boolean }
  | { t: 'instalado'; v: boolean }
  | { t: 'snapshot'; snap: Snapshot }
  | { t: 'salir' }
  | { t: 'tx:upsert'; tx: Transaction }
  | { t: 'tx:delete'; id: string }
  | { t: 'saldos'; accounts: Account[]; jars: Jar[] }
  | { t: 'account:upsert'; account: Account }
  | { t: 'account:delete'; id: string }
  | { t: 'category:upsert'; category: Category }
  | { t: 'jars'; jars: Jar[] }
  | { t: 'budget:upsert'; budget: Budget }
  | { t: 'budget:delete'; id: string }
  | { t: 'members'; members: Member[] }
  | { t: 'vuelo:add'; id: string }
  | { t: 'vuelo:del'; id: string }
  | { t: 'cola'; cola: TransactionInput[] }
  | { t: 'online'; ids: string[] }
  | { t: 'live'; estado: EstadoLive }
  | { t: 'aviso'; aviso: Estado['aviso'] };

/** Mas nuevos primero; a igual fecha, el ultimo cargado arriba. */
const ordenar = (txs: Transaction[]): Transaction[] =>
  [...txs].sort((a, b) => b.date - a.date || b.createdAt - a.createdAt);

function reducer(s: Estado, a: Accion): Estado {
  switch (a.t) {
    case 'cargando':
      return { ...s, cargando: a.v };

    case 'instalado':
      return { ...s, instalado: a.v, cargando: false };

    case 'snapshot':
      return {
        ...s, cargando: false, autenticado: true, instalado: true,
        me: a.snap.me, members: a.snap.members, household: a.snap.household,
        accounts: a.snap.accounts, categories: a.snap.categories,
        jars: a.snap.jars, budgets: a.snap.budgets,
        transactions: ordenar(a.snap.transactions),
      };

    case 'salir':
      return { ...inicial, cargando: false, autenticado: false, instalado: s.instalado };

    case 'tx:upsert': {
      const resto = s.transactions.filter((t) => t.id !== a.tx.id);
      return { ...s, transactions: ordenar([...resto, a.tx]) };
    }

    case 'tx:delete':
      return { ...s, transactions: s.transactions.filter((t) => t.id !== a.id) };

    case 'saldos':
      return { ...s, accounts: a.accounts, jars: a.jars };

    case 'account:upsert': {
      const resto = s.accounts.filter((c) => c.id !== a.account.id);
      return {
        ...s,
        accounts: [...resto, a.account].sort(
          (x, y) => Number(x.archived) - Number(y.archived) || x.displayOrder - y.displayOrder,
        ),
      };
    }

    case 'account:delete':
      return {
        ...s,
        accounts: s.accounts.filter((c) => c.id !== a.id),
        transactions: s.transactions.filter(
          (t) => t.accountId !== a.id && t.destAccountId !== a.id,
        ),
      };

    case 'category:upsert': {
      const resto = s.categories.filter((c) => c.id !== a.category.id);
      return {
        ...s,
        categories: [...resto, a.category].sort(
          (x, y) => Number(x.archived) - Number(y.archived) || x.displayOrder - y.displayOrder,
        ),
      };
    }

    case 'jars':
      return { ...s, jars: a.jars };

    case 'budget:upsert': {
      const resto = s.budgets.filter((b) => b.id !== a.budget.id);
      return { ...s, budgets: [...resto, a.budget] };
    }

    case 'budget:delete':
      return { ...s, budgets: s.budgets.filter((b) => b.id !== a.id) };

    case 'members':
      return { ...s, members: a.members };

    case 'vuelo:add': {
      const v = new Set(s.enVuelo);
      v.add(a.id);
      return { ...s, enVuelo: v };
    }

    case 'vuelo:del': {
      const v = new Set(s.enVuelo);
      v.delete(a.id);
      return { ...s, enVuelo: v };
    }

    case 'cola':
      return { ...s, cola: a.cola };

    case 'online':
      return { ...s, online: a.ids };

    case 'live':
      return { ...s, estadoLive: a.estado };

    case 'aviso':
      return { ...s, aviso: a.aviso };

    default:
      return s;
  }
}

// --- cola sin conexion ---------------------------------------------------

function leerCola(): TransactionInput[] {
  try {
    const crudo = localStorage.getItem(CLAVE_COLA);
    return crudo ? (JSON.parse(crudo) as TransactionInput[]) : [];
  } catch {
    return [];
  }
}

function escribirCola(cola: TransactionInput[]): void {
  try {
    localStorage.setItem(CLAVE_COLA, JSON.stringify(cola));
  } catch {
    // Almacenamiento lleno o bloqueado (modo privado). La app sigue
    // funcionando, solo que sin poder guardar para despues.
  }
}

// --- contexto ------------------------------------------------------------

interface Acciones {
  entrar: (email: string, password: string) => Promise<void>;
  instalar: (d: Parameters<typeof api.setup>[0]) => Promise<void>;
  salir: () => Promise<void>;
  recargar: () => Promise<void>;
  guardarTx: (tx: TransactionInput, idExistente?: string) => Promise<void>;
  borrarTx: (id: string) => Promise<void>;
  guardarCuenta: (c: Partial<Account>, id?: string) => Promise<void>;
  archivarCuenta: (id: string) => Promise<void>;
  guardarCategoria: (c: Partial<Category>, id?: string) => Promise<void>;
  guardarJarras: (jars: Partial<Jar>[]) => Promise<void>;
  guardarPresupuesto: (b: { categoryId: string | null; amountMinor: number; period: string }) => Promise<void>;
  invitar: (d: { email: string; password: string; displayName: string }) => Promise<void>;
  avisar: (texto: string, tipo?: 'error' | 'ok') => void;
}

const Ctx = createContext<(Estado & Acciones) | null>(null);

export function Store({ children }: { children: ReactNode }) {
  const [estado, dispatch] = useReducer(reducer, inicial);

  // Se usa una ref para que `vaciarCola` pueda leer la cola actual sin
  // volver a crearse en cada cambio (lo que reiniciaria los efectos).
  const colaRef = useRef<TransactionInput[]>([]);

  const avisar = useCallback((texto: string, tipo: 'error' | 'ok' = 'error') => {
    dispatch({ t: 'aviso', aviso: { texto, tipo } });
    setTimeout(() => dispatch({ t: 'aviso', aviso: null }), 4000);
  }, []);

  const cargar = useCallback(async () => {
    try {
      const snap = await api.snapshot();
      dispatch({ t: 'snapshot', snap });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        const { instalado } = await api.estado().catch(() => ({ instalado: true }));
        dispatch({ t: 'instalado', v: instalado });
        dispatch({ t: 'cargando', v: false });
      } else {
        dispatch({ t: 'cargando', v: false });
        avisar(e instanceof Error ? e.message : 'No se pudo cargar');
      }
    }
  }, [avisar]);

  // Arranque.
  useEffect(() => {
    colaRef.current = leerCola();
    dispatch({ t: 'cola', cola: colaRef.current });
    void cargar();
  }, [cargar]);

  const setCola = useCallback((cola: TransactionInput[]) => {
    colaRef.current = cola;
    escribirCola(cola);
    dispatch({ t: 'cola', cola });
  }, []);

  /** Sube lo que haya quedado pendiente por falta de conexion. */
  const vaciarCola = useCallback(async () => {
    const pendientes = colaRef.current;
    if (pendientes.length === 0) return;

    try {
      const r = await api.crearTxLote(pendientes);
      for (const tx of r.transactions) dispatch({ t: 'tx:upsert', tx });
      dispatch({ t: 'saldos', accounts: r.accounts, jars: r.jars });
      setCola([]);

      if (r.transactions.length > 0) {
        avisar(
          `Se sincronizaron ${r.transactions.length} movimiento${r.transactions.length > 1 ? 's' : ''} pendiente${r.transactions.length > 1 ? 's' : ''}`,
          'ok',
        );
      }
      if (r.rechazados.length > 0) {
        avisar(`${r.rechazados.length} movimiento(s) no se pudieron guardar`);
      }
    } catch {
      // Sigue sin conexion. Se queda en la cola para el proximo intento.
    }
  }, [avisar, setCola]);

  // Tiempo real: se conecta solo cuando hay sesion.
  useEffect(() => {
    if (!estado.autenticado) return;

    live.conectar();

    const quitarEscucha = live.al((ev: LiveEvent) => {
      switch (ev.kind) {
        case 'tx:upsert': dispatch({ t: 'tx:upsert', tx: ev.tx }); break;
        case 'tx:delete': dispatch({ t: 'tx:delete', id: ev.id }); break;
        case 'account:upsert': dispatch({ t: 'account:upsert', account: ev.account }); break;
        case 'account:delete': dispatch({ t: 'account:delete', id: ev.id }); break;
        case 'category:upsert': dispatch({ t: 'category:upsert', category: ev.category }); break;
        case 'budget:upsert': dispatch({ t: 'budget:upsert', budget: ev.budget }); break;
        case 'jar:upsert': break; // los saldos llegan recalculados aparte
        case 'hello':
        case 'presence': dispatch({ t: 'online', ids: ev.online }); break;
      }
    });

    const quitarEstado = live.alCambiarEstado((e) => {
      dispatch({ t: 'live', estado: e });
      // Al recuperar la conexion: subir lo pendiente y volver a sincronizar,
      // porque mientras estuvo caida pudieron pasar cosas que no llegaron.
      if (e === 'conectado') {
        void vaciarCola().then(() => cargar());
      }
    });

    return () => {
      quitarEscucha();
      quitarEstado();
      live.desconectar();
    };
  }, [estado.autenticado, vaciarCola, cargar]);

  // Los eventos de tiempo real traen movimientos pero no saldos: se recalculan
  // en el cliente con la misma funcion que usa el servidor, asi que coinciden.
  const cuentasConSaldo = useMemo(() => {
    const saldos = calcularSaldos(estado.accounts, estado.transactions);
    return estado.accounts.map((c) => ({ ...c, balanceMinor: saldos.get(c.id) ?? c.balanceMinor }));
  }, [estado.accounts, estado.transactions]);

  const jarrasConSaldo = useMemo(() => {
    const saldos = calcularJarras(estado.jars, estado.transactions);
    return estado.jars.map((j) => ({ ...j, balanceMinor: saldos.get(j.id) ?? 0 }));
  }, [estado.jars, estado.transactions]);

  const acciones = useMemo<Acciones>(() => ({
    avisar,

    entrar: async (email, password) => {
      await api.login(email, password);
      await cargar();
    },

    instalar: async (d) => {
      await api.setup(d);
      await cargar();
    },

    salir: async () => {
      await api.logout().catch(() => {});
      live.desconectar();
      dispatch({ t: 'salir' });
    },

    recargar: cargar,

    guardarTx: async (entrada, idExistente) => {
      const id = idExistente ?? crypto.randomUUID();
      const esNuevo = !idExistente;

      // Version optimista: se pinta ya, con los datos que se tienen.
      const previo = estado.transactions.find((t) => t.id === id);
      const optimista: Transaction = {
        ...entrada,
        id,
        householdId: estado.household?.id ?? '',
        createdBy: previo?.createdBy ?? estado.me?.id ?? '',
        createdAt: previo?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      };

      dispatch({ t: 'tx:upsert', tx: optimista });
      dispatch({ t: 'vuelo:add', id });

      try {
        const r = esNuevo
          ? await api.crearTx({ ...entrada, id })
          : await api.editarTx(id, entrada);

        dispatch({ t: 'tx:upsert', tx: r.transaction });
        dispatch({ t: 'saldos', accounts: r.accounts, jars: r.jars });
      } catch (e) {
        if (e instanceof ApiError && e.esDeRed && esNuevo) {
          // Sin conexion: se deja en pantalla y se encola para despues.
          setCola([...colaRef.current, { ...entrada, id }]);
          avisar('Guardado sin conexion. Se subira al volver la señal.', 'ok');
        } else {
          // El servidor lo rechazo: se deshace para no mostrar algo falso.
          if (previo) dispatch({ t: 'tx:upsert', tx: previo });
          else dispatch({ t: 'tx:delete', id });
          avisar(e instanceof Error ? e.message : 'No se pudo guardar');
          throw e;
        }
      } finally {
        dispatch({ t: 'vuelo:del', id });
      }
    },

    borrarTx: async (id) => {
      const previo = estado.transactions.find((t) => t.id === id);
      dispatch({ t: 'tx:delete', id });

      try {
        const r = await api.borrarTx(id);
        dispatch({ t: 'saldos', accounts: r.accounts, jars: r.jars });
      } catch (e) {
        if (previo) dispatch({ t: 'tx:upsert', tx: previo });
        avisar(e instanceof Error ? e.message : 'No se pudo borrar');
        throw e;
      }
    },

    guardarCuenta: async (c, id) => {
      const r = id ? await api.editarCuenta(id, c) : await api.crearCuenta(c);
      dispatch({ t: 'account:upsert', account: r.account });
    },

    archivarCuenta: async (id) => {
      const r = await api.archivarCuenta(id);
      if (r.account) dispatch({ t: 'account:upsert', account: r.account });
      else dispatch({ t: 'account:delete', id });
    },

    guardarCategoria: async (c, id) => {
      const r = id ? await api.editarCategoria(id, c) : await api.crearCategoria(c);
      dispatch({ t: 'category:upsert', category: r.category });
    },

    guardarJarras: async (jars) => {
      const r = await api.guardarJarras(jars);
      dispatch({ t: 'jars', jars: r.jars });
    },

    guardarPresupuesto: async (b) => {
      const r = await api.guardarPresupuesto(b);
      dispatch({ t: 'budget:upsert', budget: r.budget });
    },

    invitar: async (d) => {
      const r = await api.invitar(d);
      dispatch({ t: 'members', members: [...estado.members, r.member] });
    },
  }), [avisar, cargar, estado.transactions, estado.household, estado.me, estado.members, setCola]);

  const valor = useMemo(
    () => ({ ...estado, accounts: cuentasConSaldo, jars: jarrasConSaldo, ...acciones }),
    [estado, cuentasConSaldo, jarrasConSaldo, acciones],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useStore tiene que usarse dentro de <Store>');
  return ctx;
}
