import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Search, Package, CheckCircle, Clock, XCircle, ChevronDown, ChevronUp } from 'lucide-react'

export default function Pedidos() {
    const navigate = useNavigate()
    const [pedidos, setPedidos] = useState([])
    const [cargando, setCargando] = useState(true)
    const [buscar, setBuscar] = useState('')
    const [filtroEstado, setFiltroEstado] = useState('todos')
    const [expandido, setExpandido] = useState(null)

    useEffect(() => {
        cargarPedidos()
    }, [])

    async function cargarPedidos() {
        setCargando(true)
        const { data, error } = await supabase
            .from('pedidos')
            .select(`
        *,
        cliente:clientes(nombre, telefono),
        producto:productos(marca, estilo, talla, color)
      `)
            .order('fecha_pedido', { ascending: false })

        if (!error) setPedidos(data || [])
        setCargando(false)
    }

    async function cambiarEstado(pedidoId, nuevoEstado) {
        const { error } = await supabase
            .from('pedidos')
            .update({ estado: nuevoEstado })
            .eq('id', pedidoId)

        if (!error) {
            setPedidos(pedidos.map(p => p.id === pedidoId ? { ...p, estado: nuevoEstado } : p))
        }
    }

    const estados = {
        'Pendiente': { color: 'bg-amber-100 text-amber-800 border-amber-200', icon: Clock },
        'Pagado': { color: 'bg-green-100 text-green-800 border-green-200', icon: CheckCircle },
        'Cancelado': { color: 'bg-red-100 text-red-800 border-red-200', icon: XCircle },
        'Entregado': { color: 'bg-blue-100 text-blue-800 border-blue-200', icon: Package },
    }

    const pedidosFiltrados = pedidos.filter(p => {
        const coincideBusqueda =
            p.codigo?.toLowerCase().includes(buscar.toLowerCase()) ||
            p.cliente?.nombre?.toLowerCase().includes(buscar.toLowerCase()) ||
            p.producto?.marca?.toLowerCase().includes(buscar.toLowerCase())

        if (!coincideBusqueda) return false
        if (filtroEstado !== 'todos' && p.estado !== filtroEstado) return false
        return true
    })

    const totalPedidos = pedidos.length
    const pendientes = pedidos.filter(p => p.estado === 'Pendiente').length
    const pagados = pedidos.filter(p => p.estado === 'Pagado').length
    const cancelados = pedidos.filter(p => p.estado === 'Cancelado').length

    if (cargando) {
        return (
            <div className="flex justify-center items-center h-screen pb-16">
                <p className="text-gray-500">Cargando pedidos...</p>
            </div>
        )
    }

    return (
        <div className="p-4 pb-24 max-w-md mx-auto">
            <button onClick={() => navigate('/')} className="flex items-center text-blue-900 font-bold mb-4">
                <ArrowLeft size={20} className="mr-1" /> Volver
            </button>

            <h1 className="text-2xl font-bold text-blue-900 mb-1">📋 Pedidos</h1>
            <p className="text-gray-500 text-sm mb-4">{totalPedidos} total • {pendientes} pendientes</p>

            {/* Buscador */}
            <div className="relative mb-3">
                <Search size={16} className="absolute left-3 top-3.5 text-gray-400" />
                <input
                    type="text"
                    placeholder="Buscar por código, cliente, producto..."
                    value={buscar}
                    onChange={(e) => setBuscar(e.target.value)}
                    className="w-full p-3 pl-9 border rounded-lg text-sm"
                />
            </div>

            {/* Filtros de estado */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
                {[
                    { key: 'todos', label: 'Todos', count: totalPedidos },
                    { key: 'Pendiente', label: 'Pendientes', count: pendientes },
                    { key: 'Pagado', label: 'Pagados', count: pagados },
                    { key: 'Cancelado', label: 'Cancelados', count: cancelados },
                ].map(f => (
                    <button
                        key={f.key}
                        onClick={() => setFiltroEstado(f.key)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${filtroEstado === f.key
                            ? 'bg-blue-900 text-white'
                            : 'bg-gray-100 text-gray-600'
                            }`}
                    >
                        {f.label} ({f.count})
                    </button>
                ))}
            </div>

            {/* Lista de pedidos */}
            <div className="space-y-3">
                {pedidosFiltrados.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                        <Package size={48} className="mx-auto mb-2 text-gray-300" />
                        <p>No se encontraron pedidos</p>
                    </div>
                )}

                {pedidosFiltrados.map((p) => {
                    const EstadoIcon = estados[p.estado]?.icon || Clock
                    const estadoStyle = estados[p.estado]?.color || 'bg-gray-100 text-gray-600'

                    return (
                        <div key={p.id} className="bg-white border rounded-xl shadow-sm overflow-hidden">
                            {/* Header del pedido */}
                            <div
                                className="p-4 cursor-pointer"
                                onClick={() => setExpandido(expandido === p.id ? null : p.id)}
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-gray-900 text-sm">{p.codigo}</span>
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border flex items-center gap-1 ${estadoStyle}`}>
                                                <EstadoIcon size={10} /> {p.estado}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">
                                            👤 {p.cliente?.nombre || 'Sin cliente'} • {new Date(p.fecha_pedido).toLocaleDateString('es-PY')}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold text-blue-900">Gs {p.total_venta?.toLocaleString()}</p>
                                        {p.saldo > 0 && (
                                            <p className="text-xs text-red-500 font-medium">Debe: Gs {p.saldo.toLocaleString()}</p>
                                        )}
                                    </div>
                                </div>

                                <p className="text-sm text-gray-700">
                                    {p.producto?.marca} {p.producto?.estilo} • Talla {p.producto?.talla}
                                </p>

                                <div className="flex justify-center mt-2">
                                    {expandido === p.id ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                                </div>
                            </div>

                            {/* Detalle expandido */}
                            {expandido === p.id && (
                                <div className="border-t bg-gray-50 p-4 space-y-3">
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                        <div>
                                            <p className="text-gray-500 text-xs">Cantidad</p>
                                            <p className="font-semibold">{p.cantidad}</p>
                                        </div>
                                        <div>
                                            <p className="text-gray-500 text-xs">Precio unitario</p>
                                            <p className="font-semibold">Gs {p.precio_venta?.toLocaleString()}</p>
                                        </div>
                                        <div>
                                            <p className="text-gray-500 text-xs">Condición</p>
                                            <p className="font-semibold">{p.condicion_pago}</p>
                                        </div>
                                        <div>
                                            <p className="text-gray-500 text-xs">Envío</p>
                                            <p className="font-semibold">{p.tipo_envio}</p>
                                        </div>
                                    </div>

                                    {p.condicion_pago === 'Cuotas' && (
                                        <div className="bg-blue-50 rounded-lg p-3">
                                            <p className="text-xs text-blue-800 font-semibold">💳 Cuotas: {p.num_cuotas} • Abono inicial: Gs {p.abono_inicial?.toLocaleString()}</p>
                                            <p className="text-xs text-blue-600">Saldo pendiente: Gs {p.saldo?.toLocaleString()}</p>
                                        </div>
                                    )}

                                    {p.direccion_envio && (
                                        <p className="text-xs text-gray-500">📍 {p.direccion_envio}</p>
                                    )}

                                    {p.notas && (
                                        <p className="text-xs text-gray-500 italic">📝 {p.notas}</p>
                                    )}

                                    {/* Cambiar estado */}
                                    <div className="pt-2 border-t">
                                        <p className="text-xs text-gray-500 mb-2 font-medium">Cambiar estado:</p>
                                        <div className="flex gap-2 flex-wrap">
                                            {['Pendiente', 'Pagado', 'Entregado', 'Cancelado'].map(est => (
                                                <button
                                                    key={est}
                                                    onClick={() => cambiarEstado(p.id, est)}
                                                    className={`px-3 py-1 rounded-lg text-xs font-bold ${p.estado === est
                                                        ? 'bg-blue-900 text-white'
                                                        : 'bg-white border text-gray-600 hover:bg-gray-100'
                                                        }`}
                                                >
                                                    {est}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}