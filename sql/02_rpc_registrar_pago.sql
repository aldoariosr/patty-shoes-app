-- ============================================================
-- RPC atómica para registrar pagos de cuotas + secuencia de códigos PAG
-- Ejecutar en Supabase SQL Editor.
--
-- Reemplaza el flujo del frontend que hacía: insert pagos (N filas)
-- y después update pedidos en pasos separados (riesgo de inconsistencia).
-- ============================================================

-- 1. Secuencia para códigos de pago correlativos PAG-000001, PAG-000002...
create sequence if not exists seq_codigo_pago start 1;

-- Valor por defecto para la columna codigo de pagos
alter table pagos alter column codigo set default 'PAG-' || lpad(nextval('seq_codigo_pago')::text, 6, '0');

-- 2. RPC atómica: inserta los pagos y actualiza el pedido en una sola transacción
create or replace function registrar_pago_cuotas(
    p_pedido_id uuid,
    p_cliente_id uuid,
    p_cuotas jsonb,          -- [{"cuota_numero": 1, "monto": 150000}, ...]
    p_metodo_pago text,
    p_referencia text default '',
    p_notas text default ''
)
returns uuid
language plpgsql
security definer
as $$
declare
    v_pago_id uuid;
    v_monto_total numeric(12, 2);
    v_saldo_actual numeric(12, 2);
    v_abono_actual numeric(12, 2);
    v_num_cuotas int;
    v_nuevo_saldo numeric(12, 2);
    v_nuevo_estado text;
    v_cuota jsonb;
begin
    -- Lock del pedido para evitar cobros simultáneos inconsistentes
    select saldo, abono_inicial, num_cuotas
    into v_saldo_actual, v_abono_actual, v_num_cuotas
    from pedidos
    where id = p_pedido_id
    for update;

    if not found then
        raise exception 'Pedido no encontrado';
    end if;

    -- Total del pago
    v_monto_total := 0;
    for v_cuota in select * from jsonb_array_elements(p_cuotas) loop
        v_monto_total := v_monto_total + (v_cuota->>'monto')::numeric;
    end loop;

    if v_monto_total <= 0 then
        raise exception 'El monto total debe ser mayor a 0';
    end if;

    if v_monto_total > v_saldo_actual then
        raise exception 'El monto (%) excede el saldo pendiente (%)', v_monto_total, v_saldo_actual;
    end if;

    -- Insertar un registro de pago por cada cuota
    for v_cuota in select * from jsonb_array_elements(p_cuotas) loop
        insert into pagos (
            pedido_id, cliente_id, cuota_numero, total_cuotas,
            monto_cuota, monto_pagado, metodo_pago, referencia,
            fecha_pago, estado, notas
        ) values (
            p_pedido_id, p_cliente_id, (v_cuota->>'cuota_numero')::int, v_num_cuotas,
            (v_cuota->>'monto')::numeric, (v_cuota->>'monto')::numeric,
            p_metodo_pago, p_referencia,
            current_date, 'Confirmado',
            case when p_notas is null or p_notas = '' then null else p_notas end
        )
        returning id into v_pago_id;
    end loop;

    -- Actualizar el pedido dentro de la misma transacción
    v_nuevo_saldo := greatest(0, v_saldo_actual - v_monto_total);
    v_nuevo_estado := case when v_nuevo_saldo <= 0 then 'Pagado' else 'Pendiente' end;

    update pedidos
    set abono_inicial = v_abono_actual + v_monto_total,
        saldo = v_nuevo_saldo,
        estado = v_nuevo_estado
    where id = p_pedido_id;

    return v_pago_id;
end;
$$;

-- NOTA sobre tipos:
-- - Si pedidos.id / pagos.pedido_id NO son uuid sino text, cambiá los tipos de los parámetros.
-- - Si pagos.id es bigint/serial en vez de uuid, cambiá "returns uuid" por "returns bigint".

grant execute on function registrar_pago_cuotas(uuid, uuid, jsonb, text, text, text) to anon;
