-- ============================================================
-- RLS con políticas permisivas para la app (clave anon)
-- Ejecutar en Supabase SQL Editor.
--
-- Por qué así: antes RLS bloqueaba todo porque no había políticas.
-- Con estas políticas la app sigue funcionando exactamente igual,
-- pero con RLS activado (estructura lista para agregar login después).
-- ============================================================

alter table clientes enable row level security;
alter table productos enable row level security;
alter table pedidos enable row level security;
alter table pagos enable row level security;
alter table calificaciones_clientes enable row level security;

-- ventas_historicas / auditoria_mensual / clientes_resumen suelen ser
-- tablas o vistas del schema public; si alguna no existe, el error es inofensivo
-- (ejecutar cada bloque por separado si hace falta).

do $$
declare t text;
begin
    foreach t in array array[
        'clientes', 'productos', 'pedidos', 'pagos', 'calificaciones_clientes'
    ] loop
        -- Eliminar políticas previas con el mismo nombre (idempotente)
        execute format('drop policy if exists "app_full_access" on %I', t);
        execute format(
            'create policy "app_full_access" on %I for all to anon using (true) with check (true)',
            t
        );
    end loop;
end $$;

-- Vistas: por defecto heredan los permisos de sus tablas base.
-- Si alguna vista es security_invoker o materializada, dar permisos explícitos:
grant select on clientes_resumen to anon;
grant select on auditoria_mensual to anon;
grant select, update on ventas_historicas to anon;

-- Permisos de ejecución para las RPC que usa la app
grant execute on function procesar_pedido_con_cuotas(uuid, numeric, text, text, text, boolean, text, numeric, integer) to anon;

-- ============================================================
-- IMPORTANTE: cuando agregues login con Supabase Auth más adelante,
-- reemplazá estas políticas anon por policies basadas en auth.uid().
-- ============================================================
