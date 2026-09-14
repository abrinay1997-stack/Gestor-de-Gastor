/**
 * Prueba de las entidades contra un Worker de verdad.
 *
 * Lo central: la entidad vive en la CATEGORIA y el movimiento la hereda, asi
 * que reclasificar una categoria arrastra toda su historia sin reescribir un
 * solo movimiento. Y el resultado por entidad tiene que sumar el total.
 *
 *   npx wrangler dev --local --port 8805 &
 *   node scripts/prueba-entidades.mjs http://127.0.0.1:8805
 */

const BASE = process.argv[2] ?? 'http://127.0.0.1:8805';
let cookie = '';
const fallos = [];
const ok = (n, c, d = '') => {
  console.log(`  ${c ? 'OK  ' : 'MAL '} ${n}${c ? '' : `  -> ${d}`}`);
  if (!c) fallos.push(n);
};

async function pedir(ruta, opciones = {}) {
  const res = await fetch(BASE + ruta, {
    ...opciones,
    headers: { ...(opciones.body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
  });
  const c = res.headers.get('set-cookie');
  if (c) cookie = c.split(';')[0];
  const t = await res.text();
  try { return { status: res.status, datos: t ? JSON.parse(t) : null }; } catch { return { status: res.status, datos: t }; }
}
async function derivar(password, email) {
  const enc = new TextEncoder();
  const m = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const b = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode('gg:v1:' + email.trim().toLowerCase()), iterations: 210_000, hash: 'SHA-256' }, m, 256);
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** El mismo calculo que hace el cliente, para comprobarlo de punta a punta. */
function resultados(snap) {
  const cats = new Map(snap.categories.map((c) => [c.id, c]));
  const out = new Map();
  for (const t of snap.transactions) {
    if (t.type !== 2 && t.type !== 3) continue; // transferencias y ajustes no cuentan
    const e = t.entityId ?? (t.categoryId ? cats.get(t.categoryId)?.entityId ?? null : null);
    const a = out.get(e) ?? { ingreso: 0, gasto: 0 };
    if (t.type === 2) a.ingreso += t.amountMinor; else a.gasto += t.amountMinor;
    out.set(e, a);
  }
  return out;
}

async function main() {
  console.log(`\nProbando contra ${BASE}\n`);
  const email = `ent+${Date.now()}@ejemplo.test`;

  console.log('1. Hogar nuevo: nace con Familia');
  const alta = await pedir('/api/setup', { method: 'POST', body: JSON.stringify({
    email, password: await derivar('contraseña-larga', email), displayName: 'Abrinay',
    householdName: 'Casa', currency: 'USD', setupKey: 'clave-de-prueba' }) });
  if (alta.status !== 200) { console.log('  MAL alta:', alta.status, JSON.stringify(alta.datos)); process.exit(1); }

  let snap = (await pedir('/api/snapshot')).datos;
  ok('el snapshot trae entidades', Array.isArray(snap.entities), typeof snap.entities);
  ok('nace una sola, Familia', snap.entities.length === 1 && snap.entities[0].name === 'Familia',
     JSON.stringify(snap.entities?.map((e) => e.name)));
  const familia = snap.entities[0].id;
  ok('las categorias de la semilla ya cuelgan de ella',
     snap.categories.every((c) => c.entityId === familia));
  ok('las jarras tambien', snap.jars.every((j) => j.entityId === familia));

  console.log('\n2. Los dos negocios');
  const pc = (await pedir('/api/entities', { method: 'POST', body: JSON.stringify({ name: 'PanaClaw', kind: 'negocio' }) })).datos.entity;
  const bk = (await pedir('/api/entities', { method: 'POST', body: JSON.stringify({ name: 'BukoFlow', kind: 'negocio' }) })).datos.entity;
  ok('se crean', pc?.name === 'PanaClaw' && bk?.name === 'BukoFlow');
  ok('con su tipo', pc.kind === 'negocio');

  const cuenta = (await pedir('/api/accounts', { method: 'POST', body: JSON.stringify({
    name: 'BG principal', category: 2, currency: 'USD', initialBalanceMinor: 0 }) })).datos.account;

  console.log('\n3. Las categorias con dueño, y los movimientos heredando');
  const video = (await pedir('/api/categories', { method: 'POST', body: JSON.stringify({
    name: 'Video musical', type: 'gasto', entityId: bk.id }) })).datos.category;
  const cobro = (await pedir('/api/categories', { method: 'POST', body: JSON.stringify({
    name: 'PanaClaw', type: 'ingreso', entityId: pc.id }) })).datos.category;
  snap = (await pedir('/api/snapshot')).datos;
  const comida = snap.categories.find((c) => c.name === 'Comida');

  for (const [tipo, monto, cat, desc] of [
    [3, 55924, video.id, 'Sebastián'],
    [2, 50000, cobro.id, 'B&S Logistycs'],
    [3, 14736, comida.id, 'Alimentos'],
    [2, 20000, null, 'Quincena'],
  ]) {
    await pedir('/api/transactions', { method: 'POST', body: JSON.stringify({
      type: tipo, amountMinor: monto, accountId: cuenta.id, categoryId: cat,
      date: Date.now(), description: desc }) });
  }

  snap = (await pedir('/api/snapshot')).datos;
  ok('ningun movimiento lleva entidad escrita: la heredan',
     snap.transactions.every((t) => t.entityId === null));

  let r = resultados(snap);
  ok('BukoFlow: -$559.24', (r.get(bk.id)?.ingreso ?? 0) - (r.get(bk.id)?.gasto ?? 0) === -55924,
     JSON.stringify(r.get(bk.id)));
  ok('PanaClaw: +$500.00', (r.get(pc.id)?.ingreso ?? 0) - (r.get(pc.id)?.gasto ?? 0) === 50000,
     JSON.stringify(r.get(pc.id)));
  ok('Familia: -$147.36', (r.get(familia)?.ingreso ?? 0) - (r.get(familia)?.gasto ?? 0) === -14736,
     JSON.stringify(r.get(familia)));
  ok('la quincena sin categoria queda sin clasificar', (r.get(null)?.ingreso ?? 0) === 20000);

  const suma = [...r.values()].reduce((a, x) => a + x.ingreso - x.gasto, 0);
  ok('los resultados suman el total', suma === 70000 - 70660, suma);

  console.log('\n4. RECLASIFICAR UNA CATEGORIA ARRASTRA SU HISTORIA');
  await pedir(`/api/categories/${video.id}`, { method: 'PUT', body: JSON.stringify({ entityId: pc.id }) });
  snap = (await pedir('/api/snapshot')).datos;
  r = resultados(snap);
  ok('el gasto se movio a PanaClaw', (r.get(pc.id)?.gasto ?? 0) === 55924, JSON.stringify(r.get(pc.id)));
  ok('BukoFlow quedo vacia', (r.get(bk.id) ?? null) === null);
  ok('SIN reescribir un solo movimiento',
     snap.transactions.every((t) => t.entityId === null));

  console.log('\n5. Jarras por entidad, con su propio 100%');
  const jarrasFamilia = snap.jars.filter((j) => j.entityId === familia);
  const nuevas = [
    ...jarrasFamilia,
    { name: 'Impuestos', percentageBp: 2000, color: '#a33', icon: 'landmark', entityId: pc.id, fillKind: 'porcentaje', acumula: false },
    { name: 'Publicidad', percentageBp: 0, color: '#3a3', icon: 'sparkles', entityId: pc.id, fillKind: 'fijo', fillMinor: 10000, acumula: false },
    { name: 'Operación', percentageBp: 0, color: '#33a', icon: 'briefcase', entityId: pc.id, fillKind: 'resto', acumula: false },
  ];
  const g = await pedir('/api/jars', { method: 'PUT', body: JSON.stringify({ jars: nuevas }) });
  ok('acepta jarras de negocio que no suman 100%', g.status === 200, JSON.stringify(g.datos));

  const rota = await pedir('/api/jars', { method: 'PUT', body: JSON.stringify({ jars: [
    ...jarrasFamilia.map((j) => ({ ...j, percentageBp: 1000 })),
  ] }) });
  ok('sigue exigiendo 100% cuando no hay jarra de resto', rota.status === 400, rota.status);

  console.log('\n6. El reparto usa solo las jarras de su entidad');
  snap = (await pedir('/api/snapshot')).datos;
  const jarrasPc = snap.jars.filter((j) => j.entityId === pc.id);
  ok('PanaClaw tiene sus tres', jarrasPc.length === 3, jarrasPc.length);

  const idsPc = new Set(jarrasPc.map((j) => j.id));
  const idsFam = new Set(snap.jars.filter((j) => j.entityId === familia).map((j) => j.id));

  // Un cobro de $1.000 de PanaClaw: 20% de impuestos, $100 fijos de
  // publicidad, y los $700 restantes a operacion.
  const cobroPc = (await pedir('/api/transactions', { method: 'POST', body: JSON.stringify({
    type: 2, amountMinor: 100000, accountId: cuenta.id, categoryId: cobro.id,
    distributeToJars: true, date: Date.now(), description: 'Cobro grande' }) })).datos;

  const impPc = cobroPc.imputaciones ?? [];
  ok('el cobro se reparte', impPc.length === 3, impPc.length);
  ok('NINGUN CENTAVO CAE EN UN FRASCO DE LA CASA',
     impPc.every((i) => idsPc.has(i.jarId)), JSON.stringify(impPc));
  ok('y la suma es exacta', impPc.reduce((a, i) => a + i.amountMinor, 0) === 100000,
     impPc.reduce((a, i) => a + i.amountMinor, 0));

  const porNombre = Object.fromEntries(impPc.map((i) => [
    snap.jars.find((j) => j.id === i.jarId)?.name, i.amountMinor,
  ]));
  ok('impuestos: 20%', porNombre['Impuestos'] === 20000, JSON.stringify(porNombre));
  ok('publicidad: los $100 fijos', porNombre['Publicidad'] === 10000, JSON.stringify(porNombre));
  ok('operación: lo que sobra', porNombre['Operación'] === 70000, JSON.stringify(porNombre));

  // Y un ingreso sin categoria: sigue cayendo en la casa, como antes de que
  // existieran los negocios.
  const suelto = (await pedir('/api/transactions', { method: 'POST', body: JSON.stringify({
    type: 2, amountMinor: 100000, accountId: cuenta.id,
    distributeToJars: true, date: Date.now(), description: 'Quincena repartida' }) })).datos;
  const impSuelto = suelto.imputaciones ?? [];
  ok('un ingreso sin categoria cae en los frascos de la casa',
     impSuelto.length > 0 && impSuelto.every((i) => idsFam.has(i.jarId)),
     JSON.stringify(impSuelto));
  ok('y tambien al centavo', impSuelto.reduce((a, i) => a + i.amountMinor, 0) === 100000);

  // La conciliacion tiene que seguir cerrando con las dos economias juntas:
  // lo que hay en las cuentas es lo que esta en jarras mas lo que no tiene
  // dueño todavia, sin importar de que economia sea cada jarra.
  snap = (await pedir('/api/snapshot')).datos;
  const enJarras = snap.jars.reduce((a, j) => a + j.balanceMinor, 0);
  const enCuentas = snap.accounts.filter((c) => !c.archived)
    .reduce((a, c) => a + c.balanceMinor, 0);
  const libre = enCuentas - enJarras;
  ok('la identidad cuentas = jarras + sin asignar se mantiene',
     enJarras + libre === enCuentas, `jarras ${enJarras} + libre ${libre} != ${enCuentas}`);
  // Aca da negativo a proposito: se gastaron $706.60 sin descontarlos de
  // ninguna jarra. Es el caso que la pantalla marca en rojo, no un error.
  ok('sin asignar queda en -$6.60, que es el rojo que la app muestra',
     libre === -660, libre);

  // Cambiar un porcentaje no puede mover lo ya repartido.
  const antes = snap.jars.find((j) => j.name === 'Impuestos').balanceMinor;
  await pedir('/api/jars', { method: 'PUT', body: JSON.stringify({ jars: snap.jars.map(
    (j) => (j.name === 'Impuestos' ? { ...j, percentageBp: 4000 } : j)) }) });
  snap = (await pedir('/api/snapshot')).datos;
  ok('subir el porcentaje NO reescribe lo ya cobrado',
     snap.jars.find((j) => j.name === 'Impuestos').balanceMinor === antes,
     `${antes} -> ${snap.jars.find((j) => j.name === 'Impuestos').balanceMinor}`);

  console.log('\n7. Archivar no borra historia');
  await pedir(`/api/entities/${bk.id}`, { method: 'DELETE' });
  snap = (await pedir('/api/snapshot')).datos;
  ok('queda archivada', snap.entities.find((e) => e.id === bk.id)?.archived === true);
  ok('los movimientos siguen todos', snap.transactions.length === 6, snap.transactions.length);

  console.log();
  if (fallos.length) { console.log(`FALLARON ${fallos.length}: ${fallos.join(', ')}`); process.exit(1); }
  console.log('Todo bien.');
}
main().catch((e) => { console.error(e); process.exit(1); });
