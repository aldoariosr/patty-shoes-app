-- ============================================================
-- Corrección de la RPC registrar_pago_cuotas
--
-- Motivo: la columna 'saldo' de pedidos es GENERADA (se calcula sola
-- a partir de otras columnas), por lo que NO puede actualizarse.
-- Basta con actualizar 'abono_inicial' y el saldo se recalcula solo.
--
-- Ejecutar en Supabase SQL Editor (reemplaza la versión anterior).
-- ============================================================

create or replace function registrar_pago_cuotas(
    p_pedido_id uuid,
    p_cliente_id uuid,
    p_cuotas jsonb,
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
    v_total_venta numeric(12, 2);
    v_num_cuotas int;
    v_nuevo_abono numeric(12, 2);
    v_nuevo_estado text;
    v_cuota jsonb;
begin
    -- Lock del pedido para evitar cobros simultáneos inconsistentes
    select saldo, abono_inicial, num_cuotas, total_venta
    into v_saldo_actual, v_abono_actual, v_num_cuotas, v_total_venta
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

    -- Actualizar el pedido DENTRO de la misma transacción.
    -- Solo abono_inicial y estado: 'saldo' es columna generada.
    v_nuevo_abono := v_abono_actual + v_monto_total;
    v_nuevo_estado := case when v_nuevo_abono >= v_total_venta then 'Pagado' else 'Pendiente' end;

    update pedidos
    set abono_inicial = v_nuevo_abono,
        estado = v_nuevo_estado
    where id = p_pedido_id;

    return v_pago_id;
end;
$$;

grant execute on function registrar_pago_cuotas(uuid, uuid, jsonb, text, text, text) to anon;
