-- ============================================================
-- Limpieza de migraciones antiguas sin detalle de producto
--
-- Las primeras migraciones (PED-HIST-*) guardaron la deuda pero SIN
-- el detalle del producto en las notas. Con el código actual las
-- nuevas migraciones sí incluyen el detalle.
--
-- Este script elimina SOLO los pedidos migrados que NO tienen ningún
-- pago registrado (es seguro: no toca pagos ni otros pedidos).
-- Después de ejecutarlo, volvé a usar "Migrar cuentas históricas"
-- desde Estado de Cuenta y quedarán con el detalle del producto.
-- ============================================================

delete from pedidos
where codigo like 'PED-HIST-%'
  and not exists (
      select 1 from pagos where pagos.pedido_id = pedidos.id
  );

-- Ver cuántos quedaron (los que ya tenían pagos, no se borran):
select codigo, total_venta, saldo, notas from pedidos where codigo like 'PED-HIST-%';
