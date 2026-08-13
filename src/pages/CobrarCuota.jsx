import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Search, X, CheckCircle, AlertTriangle, Calendar, DollarSign } from 'lucide-react'

export default function CobrarCuota() {
    const navigate = useNavigate()

    const [clientes, setClientes] = useState([])
    const [buscarCliente, setBuscarCliente] = useState('')
    const [mostrarClientes, setMostrarClientes] = useState(false)
    const [clienteSeleccionado, setClienteSeleccionado] = useState(null)

    const [pedidos, setPedidos] = useState([])
    const [pedidoSeleccionado, setPedidoSeleccionado] = useState(null)
    const [pagosPedido, setPagosPedido] = useState([])
    const [cuotasAtrasadas, setCuotasAtrasadas] = useState([])

    const [guardando, setGuardando] = useState(false)
    const [mensajeExito, setMensajeExito] = useState('')

    const [formPago, setFormPago] = useState({
        cantidad_cuotas_pagar: 1,
        monto_pagado: '',
        metodo_pago: 'Efectivo',
        referencia: '',
        notas: '',
    })

    const metodosPago = [
        { value: 'Efectivo', label: '💵 Efectivo' },
        { value: 'Transferencia', label: '🏦 Transferencia Bancaria' },
        { value: 'Giros', label: '📲 Giros (Tigo/Claro)' },
        { value: 'Tarjeta', label: '💳 Tarjeta de Crédito/Débito' },
    ]

    const tiposCuotaLabel = {
        '1': 'Semanal',
        '2': 'Quincenal',
        '3': 'Mensual',
    }

    // Cargar clientes
    useEffect(() => {
        async function cargarClientes() {
            const { data } = await supabase.from('clientes').select('*').order('nombre')
            setClientes(data || [])
        }
        cargarClientes()
    }, [])

    // Filtrar clientes
    const clientesFiltrados = clientes.filter(c =>
        c.nombre.toLowerCase().includes(buscarCliente.toLowerCase()) ||
        c.telefono?.includes(buscarCliente) ||
        c.codigo?.toLowerCase().includes(buscarCliente.toLowerCase())
    )

    // Calcular cuotas atrasadas de un pedido
    function calcularCuotasAtrasadas(pedido, pagosRealizados) {
        const hoy = new Date()
        hoy.setHours(0, 0, 0, 0)
        const fechaPedido = new Date(pedido.fecha_pedido)
        const tipoCuota = pedido.tipo_cuota || '3'
        const numCuotas = pedido.num_cuotas

        const intervalos = { '1': 7, '2': 15, '3': 30 }
        const diasIntervalo = intervalos[tipoCuota] || 30

        const cuotasPagadasNums = pagosRealizados.map(p => p.cuota_numero)
        const atrasadas = []

        for (let i = 1; i <= numCuotas; i++) {
            if (!cuotasPagadasNums.includes(i)) {
                const fechaVencimiento = new Date(fechaPedido)
                fechaVencimiento.setDate(fechaVencimiento.getDate() + (i * diasIntervalo))
                fechaVencimiento.setHours(0, 0, 0, 0)

                if (fechaVencimiento < hoy) {
                    atrasadas.push({
                        cuota_numero: i,
                        fecha_vencimiento: fechaVencimiento,
                        dias_atraso: Math.floor((hoy - fechaVencimiento) / (1000 * 60 * 60 * 24)),
                    })
                }
            }
        }
        return atrasadas
    }

    // Cargar pedidos del cliente
    async function cargarPedidosCliente(cliente) {
        setClienteSeleccionado(cliente)
        setBuscarCliente(cliente.nombre)
        setMostrarClientes(false)
        setPedidoSeleccionado(null)
        setPagosPedido([])
        setCuotasAtrasadas([])

        const { data } = await supabase
            .from('pedidos')
            .select(`*, producto:productos(marca, estilo, talla, color)`)
            .eq('cliente_id', cliente.id)
            .neq('estado', 'Cancelado')
            .gt('saldo', 0)
            .order('fecha_pedido', { ascending: false })

        const pedidosConAtraso = []
        for (const pedido of (data || [])) {
            if (pedido.condicion_pago === 'Cuotas') {
                const { data: pagos } = await supabase
                    .from('pagos')
                    .select('*')
                    .eq('pedido_id', pedido.id)
                    .order('cuota_numero', { ascending: true })

                const atrasadas = calcularCuotasAtrasadas(pedido, pagos || [])
                pedidosConAtraso.push({ ...pedido, atrasadas, pagos: pagos || [] })
            } else {
                pedidosConAtraso.push({ ...pedido, atrasadas: [], pagos: [] })
            }
        }
        setPedidos(pedidosConAtraso)
    }

    // Seleccionar pedido
    async function seleccionarPedido(pedido) {
        setPedidoSeleccionado(pedido)
        setMensajeExito('')

        const { data: pagos } = await supabase
            .from('pagos')
            .select('*')
            .eq('pedido_id', pedido.id)
            .order('cuota_numero', { ascending: true })

        setPagosPedido(pagos || [])

        const atrasadas = calcularCuotasAtrasadas(pedido, pagos || [])
        setCuotasAtrasadas(atrasadas)

        // Calcular siguiente cuota a pagar (la más antigua atrasada, o la siguiente en orden)
        /*const cuotasPagadasNums = (pagos || []).map(p => p.cuota_numero)
        let siguienteCuota = 1
        for (let i = 1; i <= pedido.num_cuotas; i++) {
            if (!cuotasPagadasNums.includes(i)) {
                siguienteCuota = i
                break
            }
        }*/

        const saldoRestante = pedido.saldo
        const cuotasRestantes = pedido.num_cuotas - (pagos || []).length
        const montoSugerido = cuotasRestantes > 0 ? Math.ceil(saldoRestante / cuotasRestantes) : saldoRestante

        setFormPago({
            cantidad_cuotas_pagar: 1,
            monto_pagado: montoSugerido > 0 ? montoSugerido : '',
            metodo_pago: 'Efectivo',
            referencia: '',
            notas: '',
        })
    }

    // Calcular monto total según cantidad de cuotas a pagar
    function calcularMontoTotal() {
        if (!pedidoSeleccionado) return 0
        const cantidad = Number(formPago.cantidad_cuotas_pagar) || 1
        const montoPorCuota = Math.ceil(pedidoSeleccionado.saldo / (pedidoSeleccionado.num_cuotas - pagosPedido.length))
        return Math.min(montoPorCuota * cantidad, pedidoSeleccionado.saldo)
    }

    async function registrarPago(e) {
        e.preventDefault()
        if (!pedidoSeleccionado) return

        setGuardando(true)
        const cantidadCuotas = Number(formPago.cantidad_cuotas_pagar) || 1
        const montoTotal = Number(formPago.monto_pagado)

        if (montoTotal <= 0) {
            alert('El monto debe ser mayor a 0')
            setGuardando(false)
            return
        }

        // Determinar qué cuotas vamos a pagar (las más antiguas atrasadas primero, luego las siguientes)
        const cuotasPagadasNums = pagosPedido.map(p => p.cuota_numero)
        const cuotasAPagar = []
        let montoRestante = montoTotal

        // Primero pagar cuotas atrasadas (más antiguas primero)
        const atrasadasOrdenadas = [...cuotasAtrasadas].sort((a, b) => a.cuota_numero - b.cuota_numero)
        for (const atr of atrasadasOrdenadas) {
            if (cuotasAPagar.length >= cantidadCuotas) break
            if (!cuotasPagadasNums.includes(atr.cuota_numero)) {
                const montoCuota = Math.ceil(pedidoSeleccionado.saldo / (pedidoSeleccionado.num_cuotas - pagosPedido.length))
                const montoAsignado = Math.min(montoCuota, montoRestante)
                cuotasAPagar.push({
                    cuota_numero: atr.cuota_numero,
                    monto: montoAsignado,
                    es_atrasada: true,
                })
                montoRestante -= montoAsignado
            }
        }

        // Si todavía falta, pagar las siguientes cuotas en orden
        for (let i = 1; i <= pedidoSeleccionado.num_cuotas; i++) {
            if (cuotasAPagar.length >= cantidadCuotas) break
            if (!cuotasPagadasNums.includes(i) && !cuotasAPagar.find(c => c.cuota_numero === i)) {
                const montoCuota = Math.ceil(pedidoSeleccionado.saldo / (pedidoSeleccionado.num_cuotas - pagosPedido.length))
                const montoAsignado = Math.min(montoCuota, montoRestante)
                cuotasAPagar.push({
                    cuota_numero: i,
                    monto: montoAsignado,
                    es_atrasada: false,
                })
                montoRestante -= montoAsignado
            }
        }

        // Insertar pagos
        const fechaHoy = new Date().toISOString().split('T')[0]
        for (const cuota of cuotasAPagar) {
            await supabase.from('pagos').insert([{
                codigo: `PAG-${Date.now()}-${cuota.cuota_numero}`,
                pedido_id: pedidoSeleccionado.id,
                cliente_id: clienteSeleccionado.id,
                cuota_numero: cuota.cuota_numero,
                total_cuotas: pedidoSeleccionado.num_cuotas,
                monto_cuota: cuota.monto,
                monto_pagado: cuota.monto,
                metodo_pago: formPago.metodo_pago,
                referencia: formPago.referencia,
                fecha_pago: fechaHoy,
                estado: 'Confirmado',
                notas: cuota.es_atrasada ? `Cuota atrasada. ${formPago.notas}` : formPago.notas,
            }])
        }

        // Actualizar pedido
        const nuevoAbono = pedidoSeleccionado.abono_inicial + montoTotal
        const nuevoEstado = nuevoAbono >= pedidoSeleccionado.total_venta ? 'Pagado' : pedidoSeleccionado.estado

        await supabase
            .from('pedidos')
            .update({ abono_inicial: nuevoAbono, estado: nuevoEstado })
            .eq('id', pedidoSeleccionado.id)

        // Recargar
        const pedidoActualizado = { ...pedidoSeleccionado, abono_inicial: nuevoAbono, estado: nuevoEstado }
        await seleccionarPedido(pedidoActualizado)

        const textoCuotas = cuotasAPagar.map(c => `#${c.cuota_numero}`).join(', ')
        setMensajeExito(`✅ Pagaste cuota(s) ${textoCuotas} por Gs ${montoTotal.toLocaleString()}`)
        setGuardando(false)
    }

    return (
        <div className="p-4 pb-24 max-w-md mx-auto">
            <button onClick={() => navigate('/')} className="flex items-center text-blue-900 font-bold mb-4">
                <ArrowLeft size={20} className="mr-1" /> Volver
            </button>

            <h1 className="text-2xl font-bold text-blue-900 mb-1">💰 Cobrar Cuota</h1>
            <p className="text-gray-500 text-sm mb-6">Registrá los pagos de tus clientes</p>

            {/* BUSCAR CLIENTE */}
            <div className="relative mb-4">
                <label className="block text-sm font-bold text-gray-700 mb-1">Buscar Cliente</label>
                <div className="relative">
                    <Search size={16} className="absolute left-3 top-3.5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Escribí nombre, teléfono o código..."
                        value={buscarCliente}
                        onChange={(e) => { setBuscarCliente(e.target.value); setMostrarClientes(true) }}
                        onFocus={() => setMostrarClientes(true)}
                        className="w-full p-3 pl-9 border rounded-lg text-sm"
                    />
                </div>
                {mostrarClientes && buscarCliente && (
                    <div className="absolute z-20 w-full bg-white border rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                        {clientesFiltrados.length === 0 ? (
                            <div className="p-3 text-sm text-gray-500">No se encontraron clientes</div>
                        ) : (
                            clientesFiltrados.map((c) => (
                                <div
                                    key={c.id}
                                    onClick={() => cargarPedidosCliente(c)}
                                    className="p-3 hover:bg-blue-50 cursor-pointer border-b last:border-b-0 text-sm"
                                >
                                    <span className="font-semibold">{c.nombre}</span>
                                    <span className="text-gray-500 ml-2 text-xs">{c.telefono} • {c.ciudad}</span>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>

            {/* CLIENTE SELECCIONADO */}
            {clienteSeleccionado && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 flex items-center gap-2">
                    <div className="bg-blue-900 text-white w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm">
                        {clienteSeleccionado.nombre.charAt(0)}
                    </div>
                    <div className="flex-1">
                        <p className="font-bold text-blue-900 text-sm">{clienteSeleccionado.nombre}</p>
                        <p className="text-xs text-gray-500">{clienteSeleccionado.telefono}</p>
                    </div>
                    <button onClick={() => { setClienteSeleccionado(null); setPedidos([]); setPedidoSeleccionado(null); setBuscarCliente('') }}>
                        <X size={18} className="text-gray-400 hover:text-red-500" />
                    </button>
                </div>
            )}

            {/* PEDIDOS CON DEUDA */}
            {clienteSeleccionado && pedidos.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                    <CheckCircle size={48} className="mx-auto mb-2 text-green-500" />
                    <p className="font-semibold">¡Este cliente no tiene deudas!</p>
                </div>
            )}

            {pedidos.length > 0 && !pedidoSeleccionado && (
                <div className="mb-4">
                    <h3 className="text-sm font-bold text-gray-700 mb-2">📋 Pedidos con saldo</h3>
                    <div className="space-y-2">
                        {pedidos.map((p) => (
                            <button
                                key={p.id}
                                onClick={() => seleccionarPedido(p)}
                                className="w-full text-left bg-white border rounded-xl p-3 hover:shadow-md transition-shadow relative"
                            >
                                {p.atrasadas.length > 0 && (
                                    <div className="absolute -top-2 -right-2 bg-red-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">
                                        {p.atrasadas.length}
                                    </div>
                                )}
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="font-bold text-sm text-gray-900">{p.codigo}</p>
                                        <p className="text-xs text-gray-500">{p.producto?.marca} {p.producto?.estilo}</p>
                                        <p className="text-xs text-gray-400">{new Date(p.fecha_pedido).toLocaleDateString('es-PY')}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-bold text-red-600">Gs {p.saldo.toLocaleString()}</p>
                                        <p className="text-xs text-gray-500">de Gs {p.total_venta.toLocaleString()}</p>
                                    </div>
                                </div>
                                <div className="mt-2 flex gap-2 flex-wrap">
                                    <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-medium">
                                        {p.condicion_pago}
                                    </span>
                                    <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                                        {p.num_cuotas} cuotas {tiposCuotaLabel[p.tipo_cuota] || 'Mensual'}
                                    </span>
                                    {p.atrasadas.length > 0 && (
                                        <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                            <AlertTriangle size={10} /> {p.atrasadas.length} atrasada{p.atrasadas.length > 1 ? 's' : ''}
                                        </span>
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* DETALLE DEL PEDIDO + PAGO */}
            {pedidoSeleccionado && (
                <div className="space-y-4">
                    {/* Info del pedido */}
                    <div className="bg-white border rounded-xl p-4">
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <h3 className="font-bold text-blue-900">{pedidoSeleccionado.codigo}</h3>
                                <p className="text-xs text-gray-500">{pedidoSeleccionado.producto?.marca} {pedidoSeleccionado.producto?.estilo}</p>
                            </div>
                            <button onClick={() => setPedidoSeleccionado(null)} className="text-xs text-gray-500 hover:text-blue-900 underline">
                                Cambiar
                            </button>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-3">
                            <div className="bg-gray-50 rounded-lg p-2 text-center">
                                <p className="text-xs text-gray-500">Total</p>
                                <p className="font-bold text-sm">Gs {pedidoSeleccionado.total_venta.toLocaleString()}</p>
                            </div>
                            <div className="bg-green-50 rounded-lg p-2 text-center">
                                <p className="text-xs text-green-600">Pagado</p>
                                <p className="font-bold text-sm text-green-700">Gs {(pedidoSeleccionado.abono_inicial || 0).toLocaleString()}</p>
                            </div>
                            <div className="bg-red-50 rounded-lg p-2 text-center">
                                <p className="text-xs text-red-500">Saldo</p>
                                <p className="font-bold text-sm text-red-600">Gs {pedidoSeleccionado.saldo.toLocaleString()}</p>
                            </div>
                        </div>
                    </div>

                    {/* Cuotas atrasadas */}
                    {cuotasAtrasadas.length > 0 && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                            <h4 className="text-sm font-bold text-red-700 mb-2 flex items-center gap-1">
                                <AlertTriangle size={16} /> Cuotas Atrasadas ({cuotasAtrasadas.length})
                            </h4>
                            <div className="space-y-1">
                                {cuotasAtrasadas.map((atr) => (
                                    <div key={atr.cuota_numero} className="flex justify-between items-center text-sm bg-white rounded-lg p-2 border border-red-100">
                                        <div>
                                            <span className="font-bold text-red-700">Cuota #{atr.cuota_numero}</span>
                                            <span className="text-gray-500 text-xs ml-2">Venció: {atr.fecha_vencimiento.toLocaleDateString('es-PY')}</span>
                                        </div>
                                        <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                                            {atr.dias_atraso} días atraso
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Historial de pagos */}
                    {pagosPedido.length > 0 && (
                        <div>
                            <h4 className="text-sm font-bold text-gray-700 mb-2">📄 Pagos realizados</h4>
                            <div className="space-y-1">
                                {pagosPedido.map((pago) => (
                                    <div key={pago.id} className="bg-green-50 border border-green-200 rounded-lg p-2 flex justify-between items-center text-sm">
                                        <div className="flex items-center gap-2">
                                            <CheckCircle size={14} className="text-green-600" />
                                            <span className="text-green-800 font-medium">Cuota {pago.cuota_numero}/{pago.total_cuotas}</span>
                                            <span className="text-gray-500 text-xs flex items-center gap-1">
                                                <Calendar size={10} /> {new Date(pago.fecha_pago || pago.created_at).toLocaleDateString('es-PY')}
                                            </span>
                                        </div>
                                        <span className="font-bold text-green-700">Gs {pago.monto_pagado.toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Mensaje éxito */}
                    {mensajeExito && (
                        <div className="bg-green-100 border border-green-300 text-green-800 rounded-xl p-3 text-sm font-semibold text-center">
                            {mensajeExito}
                        </div>
                    )}

                    {/* Formulario de pago */}
                    <form onSubmit={registrarPago} className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 space-y-3">
                        <h4 className="font-bold text-blue-900 text-sm flex items-center gap-1">
                            <DollarSign size={16} /> Registrar Pago — {new Date().toLocaleDateString('es-PY')}
                        </h4>

                        {/* Cantidad de cuotas a pagar */}
                        <div>
                            <label className="block text-xs font-bold text-blue-900 mb-1">¿Cuántas cuotas va a pagar?</label>
                            <select
                                value={formPago.cantidad_cuotas_pagar}
                                onChange={(e) => {
                                    const cant = Number(e.target.value)
                                    const montoPorCuota = Math.ceil(pedidoSeleccionado.saldo / (pedidoSeleccionado.num_cuotas - pagosPedido.length))
                                    setFormPago({
                                        ...formPago,
                                        cantidad_cuotas_pagar: cant,
                                        monto_pagado: Math.min(montoPorCuota * cant, pedidoSeleccionado.saldo),
                                    })
                                }}
                                className="w-full p-2.5 border border-blue-300 rounded-lg text-sm bg-white"
                            >
                                {Array.from({ length: Math.min(pedidoSeleccionado.num_cuotas - pagosPedido.length, 12) }, (_, i) => i + 1).map(n => (
                                    <option key={n} value={n}>{n} cuota{n > 1 ? 's' : ''}</option>
                                ))}
                            </select>
                        </div>

                        {/* Monto */}
                        <div>
                            <label className="block text-xs font-bold text-blue-900 mb-1">Monto Total (Gs)</label>
                            <input
                                type="number"
                                min="1"
                                max={pedidoSeleccionado.saldo}
                                required
                                value={formPago.monto_pagado}
                                onChange={(e) => setFormPago({ ...formPago, monto_pagado: e.target.value })}
                                className="w-full p-2.5 border border-blue-300 rounded-lg text-sm"
                            />
                            <p className="text-xs text-blue-600 mt-1">
                                Sugerido: Gs {calcularMontoTotal().toLocaleString()} por {formPago.cantidad_cuotas_pagar} cuota(s)
                            </p>
                        </div>

                        {/* Método */}
                        <div>
                            <label className="block text-xs font-bold text-blue-900 mb-1">Método de Pago</label>
                            <select
                                value={formPago.metodo_pago}
                                onChange={(e) => setFormPago({ ...formPago, metodo_pago: e.target.value })}
                                className="w-full p-2.5 border border-blue-300 rounded-lg text-sm bg-white"
                            >
                                {metodosPago.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                        </div>

                        {/* Referencia */}
                        <div>
                            <label className="block text-xs font-bold text-blue-900 mb-1">Referencia / N° Comprobante</label>
                            <input
                                type="text"
                                placeholder="Ej: Transferencia #12345"
                                value={formPago.referencia}
                                onChange={(e) => setFormPago({ ...formPago, referencia: e.target.value })}
                                className="w-full p-2.5 border border-blue-300 rounded-lg text-sm"
                            />
                        </div>

                        {/* Notas */}
                        <div>
                            <label className="block text-xs font-bold text-blue-900 mb-1">Notas</label>
                            <textarea
                                value={formPago.notas}
                                onChange={(e) => setFormPago({ ...formPago, notas: e.target.value })}
                                className="w-full p-2.5 border border-blue-300 rounded-lg text-sm"
                                rows="2"
                            />
                        </div>

                        {/* Resumen */}
                        <div className="bg-white rounded-lg p-3 border border-blue-200 space-y-1">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Saldo actual:</span>
                                <span className="font-bold text-red-600">Gs {pedidoSeleccionado.saldo.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Este pago:</span>
                                <span className="font-bold text-green-600">Gs {Number(formPago.monto_pagado || 0).toLocaleString()}</span>
                            </div>
                            <div className="border-t pt-1 flex justify-between text-sm">
                                <span className="text-gray-600">Quedará:</span>
                                <span className="font-bold text-blue-900">
                                    Gs {Math.max(0, pedidoSeleccionado.saldo - Number(formPago.monto_pagado || 0)).toLocaleString()}
                                </span>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={guardando || pedidoSeleccionado.saldo <= 0}
                            className="w-full bg-green-600 text-white font-bold py-3 rounded-xl shadow-md disabled:opacity-50"
                        >
                            {guardando ? 'Registrando...' : `💰 Registrar Pago (${formPago.cantidad_cuotas_pagar} cuota${formPago.cantidad_cuotas_pagar > 1 ? 's' : ''})`}
                        </button>
                    </form>
                </div>
            )}
        </div>
    )
}