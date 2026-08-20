import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Search, Package, Clock, DollarSign, Truck, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'

export default function Pedidos() {
    const navigate = useNavigate()
    const [pedidos, setPedidos] = useState([])
    const [cargando, setCargando] = useState(true)
    const [buscar, setBuscar] = useState('')
    const [expandido, setExpandido] = useState(null)
    const [pedidoAProcesar, setPedidoAProcesar] = useState(null)
    const [mostrarModal, setMostrarModal] = useState(false)
    const [procesando, setProcesando] = useState(false)

    const [form, setForm] = useState({
        monto_pagado: '',
        metodo_pago: 'Efectivo',
        referencia: '',
        marcarEntregado: true,
        notas: ''
    })

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

    function abrirModal(pedido) {
        setPedidoAProcesar(pedido)

        // Calcular primera cuota si es cuotas sin abono
        let montoSugerido = pedido.saldo || pedido.total_venta

        if (pedido.condicion_pago === 'Cuotas' && (!pedido.abono_inicial || pedido.abono_inicial === 0)) {
            const numCuotas = pedido.num_cuotas || 1
            montoSugerido = Math.ceil(pedido.total_venta / numCuotas)
        }

        setForm({
            monto_pagado: montoSugerido.toString(),
            metodo_pago: 'Efectivo',
            referencia: '',
            marcarEntregado: true,
            notas: 'Pago inicial - Primera cuota'
        })
        setMostrarModal(true)
    }

    async function procesarPago(e) {
        e.preventDefault()
        if (!pedidoAProcesar) return

        setProcesando(true)
        const monto = Number(form.monto_pagado)

        try {
            // 1. Registrar pago
            const { error: errorPago } = await supabase.from('pagos').insert([{
                codigo: `PAG-${Date.now()}`,
                pedido_id: pedidoAProcesar.id,
                cliente_id: pedidoAProcesar.cliente_id,
                cuota_numero: 1,
                total_cuotas: pedidoAProcesar.num_cuotas || 1,
                monto_cuota: monto,
                monto_pagado: monto,
                metodo_pago: form.metodo_pago,
                referencia: form.referencia,
                fecha_pago: new Date().toISOString().split('T')[0],
                estado: 'Confirmado',
                notas: form.notas
            }])

            if (errorPago) throw errorPago

            // 2. Llamar función SQL para actualizar y generar cuotas
            const { error: errorFunc } = await supabase.rpc('procesar_pedido_con_cuotas', {
                p_pedido_id: pedidoAProcesar.id,
                p_monto_pago: monto,
                p_metodo_pago: form.metodo_pago,
                p_referencia: form.referencia || '',
                p_notas: form.notas || '',
                p_es_entrega: form.marcarEntregado,
                p_tipo_cuota: pedidoAProcesar.condicion_pago === 'Cuotas' ? 'cantidad' : 'ninguna',
                p_monto_cuota: 0,
                p_cantidad_cuotas: pedidoAProcesar.num_cuotas || 1
            })

            if (errorFunc) throw errorFunc

            alert('✅ Pago registrado. El pedido pasó a "Cobrar Cuota"')
            setMostrarModal(false)
            cargarPedidos()

        } catch (error) {
            alert('❌ Error: ' + error.message)
        } finally {
            setProcesando(false)
        }
    }

    const pedidosFiltrados = pedidos.filter(p => {
        if (p.estado === 'Pagado' || p.estado === 'Cancelado') return false
        if (p.estado !== 'Pendiente') return false

        const coincide =
            p.codigo?.toLowerCase().includes(buscar.toLowerCase()) ||
            p.cliente?.nombre?.toLowerCase().includes(buscar.toLowerCase()) ||
            p.producto?.marca?.toLowerCase().includes(buscar.toLowerCase())

        return coincide
    })

    if (cargando) {
        return <div className="flex justify-center items-center h-screen"><p>Cargando...</p></div>
    }

    return (
        <div className="p-4 pb-24 max-w-md mx-auto">
            <button onClick={() => navigate('/')} className="flex items-center text-blue-900 font-bold mb-4">
                <ArrowLeft size={20} className="mr-1" /> Volver
            </button>

            <h1 className="text-2xl font-bold text-blue-900 mb-1">📋 Pedidos</h1>
            <p className="text-gray-500 text-sm mb-4">{pedidosFiltrados.length} pendientes de gestión</p>

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

            <div className="space-y-3">
                {pedidosFiltrados.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 bg-white rounded-xl border border-dashed">
                        <Package size={48} className="mx-auto mb-2 text-green-300" />
                        <p className="font-medium">¡Todo al día!</p>
                        <p className="text-sm">No hay pedidos pendientes</p>
                    </div>
                ) : (
                    pedidosFiltrados.map((p) => (
                        <div key={p.id} className="bg-white border rounded-xl shadow-sm overflow-hidden">
                            <div
                                className="p-4 cursor-pointer hover:bg-gray-50"
                                onClick={() => setExpandido(expandido === p.id ? null : p.id)}
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-sm">{p.codigo}</span>
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${p.estado === 'Pendiente' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                                                }`}>
                                                {p.estado}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">
                                            {p.cliente?.nombre} • {new Date(p.fecha_pedido).toLocaleDateString('es-PY')}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold text-sm">Gs {p.total_venta?.toLocaleString()}</p>
                                        {p.saldo > 0 && (
                                            <p className="text-xs text-red-500 font-medium">Debe: Gs {p.saldo.toLocaleString()}</p>
                                        )}
                                    </div>
                                </div>
                                <p className="text-sm text-gray-700 truncate">
                                    {p.producto?.marca} {p.producto?.estilo} • Talla {p.producto?.talla}
                                </p>
                                <div className="flex justify-center mt-2">
                                    {expandido === p.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                </div>
                            </div>

                            {expandido === p.id && (
                                <div className="border-t bg-gray-50 p-4 space-y-3">
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                        <div><p className="text-xs text-gray-500">Cantidad</p><p className="font-semibold">{p.cantidad}</p></div>
                                        <div><p className="text-xs text-gray-500">Precio</p><p className="font-semibold">Gs {p.precio_venta?.toLocaleString()}</p></div>
                                        <div><p className="text-xs text-gray-500">Condición</p><p className="font-semibold text-blue-700">{p.condicion_pago}</p></div>
                                        <div><p className="text-xs text-gray-500">Envío</p><p className="font-semibold">{p.tipo_envio}</p></div>
                                    </div>

                                    {p.condicion_pago === 'Cuotas' && (
                                        <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                                            <p className="text-xs text-blue-800 font-semibold">💳 Plan: {p.num_cuotas} cuotas</p>
                                            <p className="text-xs text-blue-600 mt-1">Abono: Gs {p.abono_inicial?.toLocaleString() || 0}</p>
                                            <p className="text-xs text-red-600 font-bold mt-1">Saldo: Gs {p.saldo?.toLocaleString()}</p>
                                        </div>
                                    )}

                                    {p.direccion_envio && <p className="text-xs text-gray-500">📍 {p.direccion_envio}</p>}
                                    {p.notas && <p className="text-xs text-gray-500 italic">"{p.notas}"</p>}

                                    <button
                                        onClick={(e) => { e.stopPropagation(); abrirModal(p); }}
                                        disabled={procesando}
                                        className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2"
                                    >
                                        <DollarSign size={16} />
                                        {p.abono_inicial > 0 ? 'Registrar Siguiente Pago' : 'Registrar Pago y Entrega'}
                                    </button>
                                    <p className="text-[10px] text-center text-gray-500">
                                        Al confirmar, el pedido pasará a "Cobrar Cuota"
                                    </p>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {mostrarModal && pedidoAProcesar && (
                <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4 relative">
                        <button onClick={() => setMostrarModal(false)} className="absolute top-4 right-4 text-gray-400">
                            <AlertTriangle size={24} />
                        </button>

                        <h3 className="text-lg font-bold text-blue-900 text-center">Pago y Entrega</h3>

                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm">
                            <p className="font-bold">{pedidoAProcesar.codigo}</p>
                            <p className="text-gray-700">{pedidoAProcesar.cliente?.nombre}</p>
                            <div className="mt-2 pt-2 border-t border-blue-100 flex justify-between text-xs">
                                <span>Total: <strong>Gs {pedidoAProcesar.total_venta?.toLocaleString()}</strong></span>
                                <span className="text-red-600">Saldo: <strong>Gs {(pedidoAProcesar.saldo || pedidoAProcesar.total_venta)?.toLocaleString()}</strong></span>
                            </div>
                        </div>

                        <form onSubmit={procesarPago} className="space-y-3">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Monto a Pagar (Gs)</label>
                                <input
                                    type="number"
                                    required
                                    value={form.monto_pagado}
                                    onChange={(e) => setForm({ ...form, monto_pagado: e.target.value })}
                                    className="w-full p-3 border rounded-lg text-lg font-bold text-center"
                                />
                                {pedidoAProcesar.condicion_pago === 'Cuotas' && !pedidoAProcesar.abono_inicial && (
                                    <p className="text-[10px] text-blue-600 mt-1 text-center">💡 Corresponde a la 1ª cuota</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Método</label>
                                <select
                                    value={form.metodo_pago}
                                    onChange={(e) => setForm({ ...form, metodo_pago: e.target.value })}
                                    className="w-full p-2.5 border rounded-lg bg-white text-sm"
                                >
                                    <option value="Efectivo">💵 Efectivo</option>
                                    <option value="Transferencia">🏦 Transferencia</option>
                                    <option value="Giros">📲 Giros</option>
                                    <option value="Tarjeta">💳 Tarjeta</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Referencia</label>
                                <input
                                    type="text"
                                    value={form.referencia}
                                    onChange={(e) => setForm({ ...form, referencia: e.target.value })}
                                    className="w-full p-2.5 border rounded-lg text-sm"
                                    placeholder="Opcional"
                                />
                            </div>

                            <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={form.marcarEntregado}
                                        onChange={(e) => setForm({ ...form, marcarEntregado: e.target.checked })}
                                        className="w-5 h-5 text-green-600 rounded"
                                    />
                                    <span className="block text-sm font-bold text-green-900">Marcar como ENTREGADO</span>
                                </label>
                            </div>

                            <button
                                type="submit"
                                disabled={procesando}
                                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-3.5 rounded-xl"
                            >
                                {procesando ? 'Procesando...' : '✅ Confirmar Operación'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}