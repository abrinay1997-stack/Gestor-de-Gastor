-- Un codigo corto por movimiento, para poder nombrarlo en voz alta.
--
-- El id es un UUID de 36 caracteres: sirve para la maquina y no sirve para
-- nada mas. Cuando uno de los dos quiere decir «este movimiento salio mal» —a
-- la otra persona, o a un asistente que va a mirar el codigo— no hay forma de
-- senalarlo. «El gasto del super del martes» son tres gastos.
--
-- Asi que cada movimiento lleva ademas un codigo de cinco caracteres, del
-- estilo de un codigo de transaccion bancaria. Las tres reglas que lo definen:
--
--   nace con el movimiento     -> se escribe en el INSERT, no despues
--   sobrevive a las ediciones  -> ningun UPDATE lo toca jamas
--   muere con el movimiento    -> es una columna de tx, no una tabla aparte,
--                                 asi que el DELETE se lo lleva puesto
--
-- El alfabeto tiene 30 simbolos y deja afuera los seis que se leen mal cuando
-- alguien dicta un codigo por telefono o lo copia a mano: 0 y O, 1 e I y L, y
-- la U (que se confunde con la V en mayusculas). Quedan 30^5 = 24.300.000
-- combinaciones para un hogar que carga unos cientos de movimientos al ano.

ALTER TABLE tx ADD COLUMN code TEXT;

-- Los que ya existen tambien necesitan el suyo, y tiene que salir sin
-- repetirse ni una vez: el indice unico de mas abajo no perdona.
--
-- Por eso el relleno no usa azar. Numera los movimientos (1, 2, 3...) y pasa
-- ese numero por  n * 7368787 + 1234567  (mod 30^5). Como 7368787 no es
-- divisible por 2, 3 ni 5, es coprimo con 30^5 y la cuenta es una BIYECCION:
-- numeros distintos dan codigos distintos, siempre, sin posibilidad de choque.
-- Y como multiplica y da la vuelta, dos movimientos seguidos salen con codigos
-- que no se parecen en nada, que es justo lo que se quiere de un codigo.
--
-- Los cinco caracteres son las cinco cifras del resultado en base 30.
WITH pos AS (
  SELECT id,
         (ROW_NUMBER() OVER (ORDER BY created_at, id) * 7368787 + 1234567) % 24300000 AS v
    FROM tx
)
UPDATE tx
   SET code = (
         SELECT substr('23456789ABCDEFGHJKMNPQRSTVWXYZ', (pos.v / 810000) % 30 + 1, 1)
             || substr('23456789ABCDEFGHJKMNPQRSTVWXYZ', (pos.v /  27000) % 30 + 1, 1)
             || substr('23456789ABCDEFGHJKMNPQRSTVWXYZ', (pos.v /    900) % 30 + 1, 1)
             || substr('23456789ABCDEFGHJKMNPQRSTVWXYZ', (pos.v /     30) % 30 + 1, 1)
             || substr('23456789ABCDEFGHJKMNPQRSTVWXYZ',  pos.v           % 30 + 1, 1)
           FROM pos WHERE pos.id = tx.id
       )
 WHERE code IS NULL;

-- El indice es lo que convierte al codigo en una llave de verdad: si algun dia
-- el generador devuelve uno repetido, la insercion falla en vez de dejar dos
-- movimientos respondiendo al mismo nombre. Tambien es lo que hace instantanea
-- la busqueda por codigo desde el buscador.
CREATE UNIQUE INDEX idx_tx_code ON tx(code);
