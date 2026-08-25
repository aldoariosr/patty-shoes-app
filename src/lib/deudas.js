import { supabase } from './supabase'

/**
 * Calcula la deuda real por cliente en un solo lugar, para que todas
 * las pantallas muestren exactamente el mismo valor.
 *
 * Suma:
 *  - saldos pendientes de pedidos de la app (no cancelados)
 *  - saldos históricos del Excel, EXCEPTO los ya migrados
 *    (los migrados se detectan porque existen como PED-HIST-<id> en pedidos)
 *
 * Devuelve un mapa: { [clienteId]: { id, nombre, telefono, deuda_total, cantidad_cuentas } }
 */
export async function calcularDeudasPorCliente() {
    const [{ data: todosClientes }, { data: codigosMigrados }, { data: saldosPedidos }, { data: historicas }] = await Promise.all([
        supabase.from('clientes').select('id, nombre, telefono'),
        supabase.from('pedidos').select('codigo').like('codigo', 'PED-HIST-%'),
        supabase.from('pedidos').select('saldo, cliente_id').gt('saldo', 0).neq('estado', 'Cancelado'),
        supabase.from('ventas_historicas').select('id, cliente_id, saldo_a_cobrar').gt('saldo_a_cobrar', 0),
    ])

    const clientesMap = {}
    for (const c of todosClientes || []) clientesMap[c.id] = c

    const setMigrados = new Set((codigosMigrados || []).map(p => p.codigo))

    const deudas = {}
    const agregar = (clienteId, monto) => {
        if (!clienteId || !clientesMap[clienteId]) return
        if (!deudas[clienteId]) {
            deudas[clienteId] = {
                ...clientesMap[clienteId],
                deuda_total: 0,
                cantidad_cuentas: 0,
            }
        }
        deudas[clienteId].deuda_total += Number(monto) || 0
        deudas[clienteId].cantidad_cuentas += 1
    }

    for (const p of saldosPedidos || []) agregar(p.cliente_id, p.saldo)
    for (const v of historicas || []) {
        if (setMigrados.has(`PED-HIST-${v.id}`)) continue // ya migrada: no contar doble
        agregar(v.cliente_id, v.saldo_a_cobrar)
    }

    return deudas
}
