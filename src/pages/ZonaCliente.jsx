import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, TrendingUp, DollarSign, AlertTriangle, Calendar, BarChart3, X } from 'lucide-react'
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts'

export default function ZonaCliente() {
    const navigate = useNavigate()
    const [cargando, setCargando] = useState(true)
    const [stats, setStats] = useState({
        ventasMes: 0,
        gananciasMes: 0,
        porCobrar: 0,
        stockBajo: 0,
        pedidosMes: 0
    })
    const [historial, setHistorial] = useState([])
    const [graficoData, setGraficoData] = useState([])

    // Estados para modales
    const [modalAbierto, setModalAbierto] = useState(null)

    useEffect(() => {
        cargarDatos()
    }, [])

    async function cargarDatos() {
        setCargando(true)
        try {
            // 1. Obtener auditoría mensual (histórico real)
            const { data: auditoria } = await supabase
                .from('auditoria_mensual')
                .select('*')
                .order('anio', { ascending: false })
                .order('mes', { ascending: false })
                .limit(12)

            // 2. Obtener datos del mes actual (en tiempo real)
            const hoy = new Date()
            const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString()

            const { data: ventasMes } = await supabase
                .from('ventas_historicas') // O 'pedidos' si usas esa tabla
                .select('total_venta, costo')
                .gte('fecha_venta', inicioMes)
                .eq('estado_pedido', 'Pagado')

            const { data: porCobrar } = await supabase
                .from('pedidos')
                .select('saldo')
                .gt('saldo', 0)
                .neq('estado', 'Cancelado')

            const { data: productosBajos } = await supabase
                .from('productos')
                .select('stock')
                .lt('stock', 5)

            // Calcular totales
            const totalVentas = ventasMes?.reduce((acc, v) => acc + (v.total_venta || 0), 0) || 0
            const totalCostos = ventasMes?.reduce((acc, v) => acc + (v.costo || 0), 0) || 0
            const totalGanancias = totalVentas - totalCostos
            const totalPorCobrar = porCobrar?.reduce((acc, p) => acc + (p.saldo || 0), 0) || 0
            const totalStockBajo = productosBajos?.length || 0

            setStats({
                ventasMes: totalVentas,
                gananciasMes: totalGanancias,
                porCobrar: totalPorCobrar,
                stockBajo: totalStockBajo,
                pedidosMes: ventasMes?.length || 0
            })

            // Procesar historial para el gráfico
            if (auditoria && auditoria.length > 0) {
                const datosGrafico = auditoria.map(item => ({
                    nombre: new Date(item.anio, item.mes - 1).toLocaleDateString('es-PY', { month: 'short' }),
                    ventas: Math.round(item.total_ventas / 1000000), // En millones
                    ganancias: Math.round(item.ganancia_neta / 1000000)
                })).reverse()

                setGraficoData(datosGrafico)
                setHistorial(auditoria)
            }

        } catch (error) {
            console.error("Error cargando datos:", error)
        } finally {
            setCargando(false)
        }
    }

    function abrirModalDetalle(tipo) {
        setModalAbierto(tipo)
    }

    function cerrarModal() {
        setModalAbierto(null)
    }

    if (cargando) {
        return (
            <div className="flex justify-center items-center h-screen pb-16">
                <p className="text-gray-500">Cargando zona del cliente...</p>
            </div>
        )
    }

    return (
        <div className="p-4 pb-24 max-w-md mx-auto bg-gray-50 min-h-screen">
            {/* Header */}
            <div className="mb-6">
                <button onClick={() => navigate('/')} className="flex items-center text-blue-900 font-bold mb-2">
                    <ArrowLeft size={20} className="mr-1" /> Volver al Inicio
                </button>
                <h1 className="text-2xl font-bold text-blue-900">📊 ZONA DEL CLIENTE</h1>
                <p className="text-gray-500 text-sm">Control total de tu negocio</p>
            </div>

            {/* Tarjetas Estadísticas (Clickeables) */}
            <div className="grid grid-cols-2 gap-3 mb-6">
                {/* Ventas del Mes */}
                <div
                    onClick={() => abrirModalDetalle('ventas')}
                    className="bg-white p-4 rounded-xl shadow-sm border border-blue-100 cursor-pointer hover:shadow-md transition-shadow"
                >
                    <div className="flex items-center justify-between mb-2">
                        <div className="bg-blue-100 p-2 rounded-lg">
                            <TrendingUp size={20} className="text-blue-600" />
                        </div>
                    </div>
                    <p className="text-xs text-gray-500 font-medium">Ventas del Mes</p>
                    <p className="text-lg font-bold text-blue-900">Gs {stats.ventasMes.toLocaleString()}</p>
                </div>

                {/* Ganancias */}
                <div
                    onClick={() => abrirModalDetalle('ganancias')}
                    className="bg-white p-4 rounded-xl shadow-sm border border-green-100 cursor-pointer hover:shadow-md transition-shadow"
                >
                    <div className="flex items-center justify-between mb-2">
                        <div className="bg-green-100 p-2 rounded-lg">
                            <DollarSign size={20} className="text-green-600" />
                        </div>
                    </div>
                    <p className="text-xs text-gray-500 font-medium">Ganancia Neta</p>
                    <p className="text-lg font-bold text-green-700">Gs {stats.gananciasMes.toLocaleString()}</p>
                </div>

                {/* Por Cobrar */}
                <div
                    onClick={() => abrirModalDetalle('porCobrar')}
                    className="bg-white p-4 rounded-xl shadow-sm border border-pink-100 cursor-pointer hover:shadow-md transition-shadow"
                >
                    <div className="flex items-center justify-between mb-2">
                        <div className="bg-pink-100 p-2 rounded-lg">
                            <Calendar size={20} className="text-pink-600" />
                        </div>
                    </div>
                    <p className="text-xs text-gray-500 font-medium">Por Cobrar</p>
                    <p className="text-lg font-bold text-pink-700">Gs {stats.porCobrar.toLocaleString()}</p>
                </div>

                {/* Stock Bajo */}
                <div
                    onClick={() => abrirModalDetalle('stock')}
                    className="bg-white p-4 rounded-xl shadow-sm border border-red-100 cursor-pointer hover:shadow-md transition-shadow"
                >
                    <div className="flex items-center justify-between mb-2">
                        <div className="bg-red-100 p-2 rounded-lg">
                            <AlertTriangle size={20} className="text-red-600" />
                        </div>
                    </div>
                    <p className="text-xs text-gray-500 font-medium">Stock Crítico</p>
                    <p className="text-lg font-bold text-red-700">{stats.stockBajo} prod.</p>
                </div>
            </div>

            {/* Gráfico de Tendencias */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6">
                <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
                    <BarChart3 size={16} /> Evolución Semestral (en Millones)
                </h3>
                <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={graficoData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="nombre" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}M`} />
                            <Tooltip
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                formatter={(value) => [`Gs ${value}M`, '']}
                            />
                            <Legend wrapperStyle={{ paddingTop: '10px' }} />
                            <Bar name="Ventas" dataKey="ventas" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                            <Bar name="Ganancias" dataKey="ganancias" fill="#22c55e" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Botón Ver Histórico Completo */}
            <button
                onClick={() => abrirModalDetalle('historico')}
                className="w-full bg-blue-900 text-white font-bold py-3 rounded-xl shadow-md hover:bg-blue-800 transition-colors"
            >
                📅 Ver Histórico Mensual Detallado
            </button>

            {/* MODAL GENÉRICO */}
            {modalAbierto && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-sm relative max-h-[80vh] overflow-y-auto">
                        <button onClick={cerrarModal} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
                            <X size={24} />
                        </button>

                        <h3 className="text-xl font-bold text-blue-900 mb-4 capitalize">
                            {modalAbierto === 'ventas' && '📈 Detalle de Ventas'}
                            {modalAbierto === 'ganancias' && '💰 Detalle de Ganancias'}
                            {modalAbierto === 'porCobrar' && '💵 Cuentas por Cobrar'}
                            {modalAbierto === 'stock' && '⚠️ Stock Crítico'}
                            {modalAbierto === 'historico' && '📅 Histórico Mensual'}
                        </h3>

                        {/* Contenido dinámico según el modal */}
                        {modalAbierto === 'ventas' && (
                            <div className="space-y-3">
                                <p className="text-sm text-gray-600">Total vendido este mes:</p>
                                <p className="text-3xl font-bold text-blue-900">Gs {stats.ventasMes.toLocaleString()}</p>
                                <div className="bg-blue-50 p-3 rounded-lg text-xs text-blue-800">
                                    Incluye impuestos y descuentos aplicados.
                                </div>
                            </div>
                        )}

                        {modalAbierto === 'ganancias' && (
                            <div className="space-y-3">
                                <p className="text-sm text-gray-600">Ganancia neta estimada:</p>
                                <p className="text-3xl font-bold text-green-700">Gs {stats.gananciasMes.toLocaleString()}</p>
                                <div className="bg-green-50 p-3 rounded-lg text-xs text-green-800">
                                    Calculado como: Ventas - Costo de Mercadería
                                </div>
                            </div>
                        )}

                        {modalAbierto === 'porCobrar' && (
                            <div className="space-y-3">
                                <p className="text-sm text-gray-600">Total pendiente de cobro:</p>
                                <p className="text-3xl font-bold text-pink-700">Gs {stats.porCobrar.toLocaleString()}</p>
                                <p className="text-xs text-gray-500">Revisa la sección "Estado de Cuenta" para ver el detalle por cliente.</p>
                            </div>
                        )}

                        {modalAbierto === 'stock' && (
                            <div className="space-y-3">
                                <p className="text-sm text-gray-600">Productos con stock menor a 5 unidades:</p>
                                <p className="text-3xl font-bold text-red-700">{stats.stockBajo} productos</p>
                                <p className="text-xs text-red-600 font-medium">¡Atención! Reponer mercadería lo antes posible.</p>
                            </div>
                        )}

                        {modalAbierto === 'historico' && historial.length > 0 && (
                            <div className="space-y-2">
                                {historial.map((item, index) => (
                                    <div key={index} className="border-b pb-2 last:border-0">
                                        <p className="font-bold text-sm text-gray-800">
                                            {new Date(item.anio, item.mes - 1).toLocaleDateString('es-PY', { month: 'long', year: 'numeric' })}
                                        </p>
                                        <div className="flex justify-between text-xs mt-1">
                                            <span className="text-blue-600">Ventas: Gs {item.total_ventas?.toLocaleString()}</span>
                                            <span className="text-green-600">Ganancia: Gs {item.ganancia_neta?.toLocaleString()}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}