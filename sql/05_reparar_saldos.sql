-- ============================================================
-- Reparación puntual: pedidos migrados donde se registró un pago
-- pero 'saldo'/'abono_inicial' no se actualizaron (error de columna
-- generada detectado el 25/08/2026).
--
-- Ejecutar UNA SOLA VEZ en Supabase SQL Editor.
--
-- Qué hace: para cada pedido migrado (PED-HIST-*), suma los pagos
-- registrados en la app al abono inicial. El 'saldo' se recalcula
-- solo porque es columna generada.
-- ============================================================

-- 1. ANTES: ver el estado actual (revisá que los montos tengan sentido)
select p.codigo, p.total_venta, p.abono_inicial, p.saldo, p.estado,
       pg.monto_pagado, pg.metodo_pago, pg.fecha_pago
from pedidos p
left join pagos pg on pg.pedido_id = p.id
where p.codigo like 'PED-HIST-%'
order by p.codigo;

-- 2. Sumar los pagos registrados en la app al abono inicial
update pedidos p
set abono_inicial = p.abono_inicial + coalesce(sub.total_pagado, 0),
    estado = case
        when p.abono_inicial + coalesce(sub.total_pagado, 0) >= p.total_venta then 'Pagado'
        else p.estado
    end
from (
    select pedido_id, sum(monto_pagado) as total_pagado
    from pagos
    group by pedido_id
) sub
where sub.pedido_id = p.id
  and p.codigo like 'PED-HIST-%';

-- 3. DESPUÉS: verificar que quedó consistente
select codigo, total_venta, abono_inicial, saldo, estado
from pedidos
where codigo like 'PED-HIST-%'
order by codigo;
