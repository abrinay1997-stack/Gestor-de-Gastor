-- Si un pago habitual ya se vio en el banco.
--
-- El disparador nocturno registra el pago el dia que toca y lo resta del saldo
-- en ese momento: la app no espera a que nadie lo confirme, porque un saldo
-- que muestra plata que ya se fue es peor que uno que se adelanta un dia.
--
-- Pero «la app lo registro» no es lo mismo que «lo vi en el banco». Esta
-- columna es lo segundo: NULL = registrado y sin mirar todavia; un epoch =
-- cuando alguien confirmo que el movimiento esta en el extracto. Lo muestra la
-- pestana «Completados» de Inicio.
--
-- No cambia ningun saldo: es solo una marca de conciliacion.

ALTER TABLE tx ADD COLUMN bank_confirmed_at INTEGER;

-- Lo que ya existe se da por conciliado: nadie va a volver a revisar el
-- extracto de septiembre, y arrancar con todo el historial «sin confirmar»
-- seria ruido.
UPDATE tx SET bank_confirmed_at = updated_at WHERE recurring_id IS NOT NULL;
