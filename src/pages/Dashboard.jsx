import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { TrendingUp, AlertTriangle, DollarSign, ShoppingBag } from 'lucide-react'

export default function Dashboard() {
    const [stats, setStats] = useState({
        ventasMes: 0,
        porCobrar: 0,
        stockBajo: 0,
        pedidosMes: 0,
    })
    const [cargando, setCargando] = useState(true)

    useEffect(() => {
        async function cargarStats() {
            // Ventas del mes
            const inicioMes = new Date().toISOString().slice(0, 7) + '-01'
            const { data: ventas } = await supabase
                .from('pedidos')
                .select('total_venta')
                .gte('fecha_pedido', inicioMes)
                .neq('estado', 'Cancelado')

            // Saldo por cobrar
            const { data: saldos } = await supabase
                .from('pedidos')
                .select('saldo')
                .neq('estado', 'Cancelado')

            // Stock bajo
            const { count: stockBajo } = await supabase
                .from('productos')
                .select('*', { count: 'exact', head: true })
                .lte('stock', 2)
                .eq('activo', true)

            // Pedidos del mes
            const { count: pedidos } = await supabase
                .from('pedidos')
                .select('*', { count: 'exact', head: true })
                .gte('fecha_pedido', inicioMes)

            setStats({
                ventasMes: ventas?.reduce((a, b) => a + (b.total_venta || 0), 0) || 0,
                porCobrar: saldos?.reduce((a, b) => a + (b.saldo || 0), 0) || 0,
                stockBajo: stockBajo || 0,
                pedidosMes: pedidos || 0,
            })
            setCargando(false)
        }

        cargarStats()
    }, [])

    if (cargando) {
        return (
            <div className="flex justify-center items-center h-screen pb-16">
                <p className="text-gray-500">Cargando...</p>
            </div>
        )
    }

    const cards = [
        {
            label: 'Ventas del Mes',
            value: `Gs ${stats.ventasMes.toLocaleString()}`,
            icon: TrendingUp,
            color: 'bg-blue-900 text-white',
        },
        {
            label: 'Por Cobrar',
            value: `Gs ${stats.porCobrar.toLocaleString()}`,
            icon: DollarSign,
            color: 'bg-pink-700 text-white',
        },
        {
            label: 'Stock Bajo',
            value: stats.stockBajo,
            icon: AlertTriangle,
            color: 'bg-red-600 text-white',
        },
        {
            label: 'Pedidos',
            value: stats.pedidosMes,
            icon: ShoppingBag,
            color: 'bg-amber-500 text-white',
        },
    ]

    return (
        <div className="p-4 pb-20 max-w-md mx-auto">
            <h1 className="text-2xl font-bold text-blue-900 mb-1 text-center">
                PATTY SHOES
            </h1>
            <p className="text-center text-gray-500 text-sm mb-6">
                Sistema de Ventas
            </p>

            <div className="grid grid-cols-2 gap-3 mb-6">
                {cards.map((card) => {
                    const Icon = card.icon
                    return (
                        <div
                            key={card.label}
                            className={`${card.color} rounded-2xl p-4 shadow-lg`}
                        >
                            <Icon size={24} className="mb-2 opacity-80" />
                            <p className="text-xs opacity-80 font-medium">{card.label}</p>
                            <p className="text-xl font-bold">{card.value}</p>
                        </div>
                    )
                })}
            </div>

            <h2 className="text-lg font-bold text-gray-800 mb-3">
                Acciones Rápidas
            </h2>
            <div className="space-y-3">
                <a
                    href="/nueva-venta"
                    className="block bg-blue-900 text-white rounded-xl p-4 shadow-md text-center font-bold text-lg"
                >
                    + Nueva Venta
                </a>
                <a
                    href="/cobrar-cuota"
                    className="block bg-green-600 text-white rounded-xl p-4 shadow-md text-center font-bold text-lg"
                >
                    💰 Cobrar Cuota
                </a>
                <a
                    href="/estado-cuenta"
                    className="block bg-amber-600 text-white rounded-xl p-4 shadow-md text-center font-bold text-lg"
                >
                    🧾 Estado de Cuenta
                </a>
            </div>
        </div>
    )
}