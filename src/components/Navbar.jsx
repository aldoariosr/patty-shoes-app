import { Link, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { Home, ShoppingCart, Package, Users, ClipboardList } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function Navbar() {
    const location = useLocation()
    const path = location.pathname
    const [cuotasAtrasadas, setCuotasAtrasadas] = useState(0)

    useEffect(() => {
        async function contarAtrasadas() {
            // Traer todos los pedidos de cuotas con saldo > 0
            const { data: pedidos } = await supabase
                .from('pedidos')
                .select('*, pagos(*)')
                .eq('condicion_pago', 'Cuotas')
                .neq('estado', 'Cancelado')
                .gt('saldo', 0)

            let totalAtrasadas = 0

            for (const pedido of (pedidos || [])) {
                const hoy = new Date()
                hoy.setHours(0, 0, 0, 0)
                const fechaPedido = new Date(pedido.fecha_pedido)
                const tipoCuota = pedido.tipo_cuota || '3'
                const intervalos = { '1': 7, '2': 15, '3': 30 }
                const diasIntervalo = intervalos[tipoCuota] || 30

                const cuotasPagadas = (pedido.pagos || []).map(p => p.cuota_numero)

                for (let i = 1; i <= pedido.num_cuotas; i++) {
                    if (!cuotasPagadas.includes(i)) {
                        const fechaVencimiento = new Date(fechaPedido)
                        fechaVencimiento.setDate(fechaVencimiento.getDate() + (i * diasIntervalo))
                        fechaVencimiento.setHours(0, 0, 0, 0)
                        if (fechaVencimiento < hoy) {
                            totalAtrasadas++
                            break // Solo contamos 1 por cliente para el badge
                        }
                    }
                }
            }

            setCuotasAtrasadas(totalAtrasadas)
        }

        contarAtrasadas()
        const interval = setInterval(contarAtrasadas, 30000) // Actualizar cada 30 seg
        return () => clearInterval(interval)
    }, [])

    const links = [
        { to: '/', icon: Home, label: 'Inicio' },
        { to: '/nueva-venta', icon: ShoppingCart, label: 'Venta' },
        { to: '/pedidos', icon: ClipboardList, label: 'Pedidos' },
        { to: '/stock', icon: Package, label: 'Stock' },
        { to: '/clientes', icon: Users, label: 'Clientes' },
    ]

    return (
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
            <div className="flex justify-around items-center h-16 max-w-md mx-auto">
                {links.map((link) => {
                    const Icon = link.icon
                    const isActive = path === link.to
                    //const isCobrar = link.to === '/nueva-venta' // El botón Venta lleva a cobrar también
                    return (
                        <Link
                            key={link.to}
                            to={link.to}
                            className={`flex flex-col items-center justify-center w-full h-full relative ${isActive ? 'text-blue-900' : 'text-gray-400'}`}
                        >
                            <div className="relative">
                                <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                                {/* Badge de cuotas atrasadas - mostrar en Venta o en Cobrar Cuota */}
                                {link.label === 'Venta' && cuotasAtrasadas > 0 && (
                                    <span className="absolute -top-2 -right-2 bg-red-600 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                                        {cuotasAtrasadas}
                                    </span>
                                )}
                            </div>
                            <span className="text-[10px] mt-1 font-medium">{link.label}</span>
                        </Link>
                    )
                })}
            </div>
        </nav>
    )
}