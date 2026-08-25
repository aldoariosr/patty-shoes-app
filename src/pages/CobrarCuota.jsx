import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { descripcionProducto, etiquetaPedido } from '../lib/descripcion'
import { ArrowLeft, Search, X, CheckCircle, AlertTriangle, Calendar, DollarSign, Star, Clock, Users } from 'lucide-react'

export default function CobrarCuota() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const clienteIdParam = searchParams.get('cliente')
    const pedidoIdParam = searchParams.get('pedido')

    const [clientes, setClientes] = useState([])
    const [buscarCliente, setBuscarCliente] = useState('')
    const [mostrarClientes, setMostrarClientes] = useState(false)
    const [clienteSeleccionado, setClienteSeleccionado] = useState(null)

    const [pedidos, setPedidos] = useState([])
    const [pedidoSeleccionado, setPedidoSeleccionado] = useState(null)
    const [pagosPedido, setPagosPedido] = useState([])
    const [cuotasAtrasadas, setCuotasAtrasadas] = useState([])

    // Lista global de clientes con deudas pendientes (pantalla de inicio)
    const [cobrosPendientes, setCobrosPendientes] = useState([])
    const [cargandoPendientes, setCargandoPendientes] = useState(true)

    const [guardando, setGuardando] = useState(false)
    const [mensajeExito, setMensajeExito] = useState('')

    // Calificación del cliente después de un pago (opcional)
    const [pedirCalificacion, setPedirCalificacion] = useState(false)
    const [ultimoPagoId, setUltimoPagoId] = useState(null) // Mantenemos esta para la lógica
    const [estrellasSeleccionadas, setEstrellasSeleccionadas] = useState(0)
    const [comentarioCalificacion, setComentarioCalificacion] = useState('')
    const [guardandoCalificacion, setGuardandoCalificacion] = useState(false)

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

    // Cargar clientes para el buscador
    useEffect(() => {
        async function cargarClientes() {
            const { data } = await supabase.from('clientes').select('*').order('nombre')
            setClientes(data || [])
        }
        cargarClientes()
    }, [])

    // Cargar lista global de cobros pendientes al entrar a la pantalla
    useEffect(() => {
        async function cargarCobrosPendientes() {
            setCargandoPendientes(true)
            try {
                // Traer todos los pedidos con saldo pendiente
                const { data: pedidosPendientes } = await supabase
                    .from('pedidos')
                    .select(`*, cliente:clientes(id, nombre, telefono), producto:productos(marca, estilo)`)
                    .neq('estado', 'Cancelado')
                    .neq('estado', 'Pagado')
                    .gt('saldo', 0)
                    .order('fecha_pedido', { ascending: true })

                // Una sola query para todos los pagos de los pedidos (evita N+1)
                const pedidosIds = (pedidosPendientes || []).map(p => p.id)
                const { data: todosPagos } = pedidosIds.length > 0
                    ? await supabase.from('pagos').select('pedido_id, cuota_numero').in('pedido_id', pedidosIds)
                    : { data: [] }
                const pagosPorPedido = {}
                for (const pg of (todosPagos || [])) {
                    if (!pagosPorPedido[pg.pedido_id]) pagosPorPedido[pg.pedido_id] = []
                    pagosPorPedido[pg.pedido_id].push(pg)
                }

                const intervalos = { '1': 7, '2': 15, '3': 30 }
                const hoy = new Date()
                hoy.setHours(0, 0, 0, 0)

                // Para cada pedido, calcular la fecha del próximo pago
                const conFechaProximo = await Promise.all((pedidosPendientes || []).map(async (p) => {
                    let proximoPago = null
                    let cuotasVencidas = 0

                    if (p.condicion_pago === 'Cuotas') {
                        const pagos = pagosPorPedido[p.id] || []
                        const pagosNums = pagos.map(pg => pg.cuota_numero)
                        const diasIntervalo = intervalos[p.tipo_cuota || '3'] || 30
                        const fechaPedido = new Date(p.fecha_pedido)

                        for (let i = 1; i <= p.num_cuotas; i++) {
                            if (!pagosNums.includes(i)) {
                                const fechaVenc = new Date(fechaPedido)
                                fechaVenc.setDate(fechaVenc.getDate() + (i * diasIntervalo))
                                fechaVenc.setHours(0, 0, 0, 0)
                                if (fechaVenc < hoy) {
                                    cuotasVencidas++
                                } else if (!proximoPago) {
                                    proximoPago = fechaVenc
                                }
                            }
                        }
                        // Si todas están vencidas, el próximo pago es "HOY" (urgente)
                        if (!proximoPago && cuotasVencidas > 0) proximoPago = new Date(hoy)
                    } else {
                        // Contado con saldo pendiente = pago inmediato
                        proximoPago = new Date(p.fecha_pedido)
                    }

                    return { ...p, proximoPago, cuotasVencidas }
                }))

                // Ordenar por fecha del próximo pago (más cercano primero, luego vencidos)
                conFechaProximo.sort((a, b) => {
                    if (!a.proximoPago) return 1
                    if (!b.proximoPago) return -1
                    return a.proximoPago - b.proximoPago
                })

                setCobrosPendientes(conFechaProximo)
            } catch (err) {
                console.error('Error cargando cobros pendientes:', err)
            }
            setCargandoPendientes(false)
        }
        cargarCobrosPendientes()
    }, [])

    // Auto-cargar cliente desde los parámetros de la URL (?cliente=...)
    useEffect(() => {
        if (clienteIdParam && clientes.length > 0) {
            const cliente = clientes.find(c => c.id.toString() === clienteIdParam.toString())
            if (cliente) {
                cargarPedidosCliente(cliente)
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clienteIdParam, clientes])

    // Auto-seleccionar pedido desde los parámetros de la URL (&pedido=...)
    useEffect(() => {
        if (pedidoIdParam && pedidos.length > 0) {
            const pedido = pedidos.find(p => p.id.toString() === pedidoIdParam.toString())
            if (pedido) {
                seleccionarPedido(pedido)
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pedidoIdParam, pedidos])

    // Filtrar clientes
    const clientesFiltrados = clientes.filter(c =>
        c.nombre?.toLowerCase().includes(buscarCliente.toLowerCase()) ||
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
            .neq('estado', 'Pagado')
            .gt('saldo', 0)
            .order('fecha_pedido', { ascending: false })

        const pedidosConAtraso = []
        const pedidosCuotas = (data || []).filter(p => p.condicion_pago === 'Cuotas')
        const idsCuotas = pedidosCuotas.map(p => p.id)
        const { data: todosPagos } = idsCuotas.length > 0
            ? await supabase.from('pagos').select('*').in('pedido_id', idsCuotas).order('cuota_numero', { ascending: true })
            : { data: [] }
        const pagosPorPedido = {}
        for (const pg of (todosPagos || [])) {
            if (!pagosPorPedido[pg.pedido_id]) pagosPorPedido[pg.pedido_id] = []
            pagosPorPedido[pg.pedido_id].push(pg)
        }

        for (const pedido of (data || [])) {
            if (pedido.condicion_pago === 'Cuotas') {
                const pagos = pagosPorPedido[pedido.id] || []
                const atrasadas = calcularCuotasAtrasadas(pedido, pagos)
                pedidosConAtraso.push({ ...pedido, atrasadas, pagos })
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

        // Excluir el abono inicial (cuota_numero 0) del conteo de cuotas pagadas
        const pagosDeCuotas = (pagos || []).filter(p => (p.cuota_numero || 0) > 0)
        setPagosPedido(pagosDeCuotas)

        const atrasadas = calcularCuotasAtrasadas(pedido, pagosDeCuotas)
        setCuotasAtrasadas(atrasadas)

        const saldoRestante = pedido.saldo
        const cuotasRestantes = pedido.num_cuotas - pagosDeCuotas.length
        const montoSugerido = cuotasRestantes > 0 ? Math.ceil(saldoRestante / cuotasRestantes) : saldoRestante

        setFormPago({
            cantidad_cuotas_pagar: 1,
            monto_pagado: montoSugerido > 0 ? montoSugerido : '',
            metodo_pago: 'Efectivo',
            referencia: '',
            notas: '',
        })
    }

    // Función auxiliar para cálculo interno (usada en el onChange)
    const obtenerMontoSugerido = () => {
        if (!pedidoSeleccionado) return 0;
        const cuotasRestantes = pedidoSeleccionado.num_cuotas - pagosPedido.length;
        if (cuotasRestantes <= 0) return 0;
        return Math.ceil(pedidoSeleccionado.saldo / cuotasRestantes);
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
                const montoCuota = obtenerMontoSugerido();
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
                const montoCuota = obtenerMontoSugerido();
                const montoAsignado = Math.min(montoCuota, montoRestante)
                cuotasAPagar.push({
                    cuota_numero: i,
                    monto: montoAsignado,
                    es_atrasada: false,
                })
                montoRestante -= montoAsignado
            }
        }

        // Insertar pagos + actualizar saldo en UNA transacción atómica (RPC en Supabase)
        // Si la RPC no está creada todavía (sql/02_rpc_registrar_pago.sql), cae al método anterior
        let pagoIdParaCalificar = null
        const fechaHoy = new Date().toISOString().split('T')[0]

        const { data: rpcId, error: errorRpc } = await supabase.rpc('registrar_pago_cuotas', {
            p_pedido_id: pedidoSeleccionado.id,
            p_cliente_id: clienteSeleccionado.id,
            p_cuotas: cuotasAPagar,
            p_metodo_pago: formPago.metodo_pago,
            p_referencia: formPago.referencia || '',
            p_notas: cuotasAtrasadas.length > 0 ? `Cuota atrasada. ${formPago.notas}`.trim() : formPago.notas,
        })

        if (!errorRpc) {
            pagoIdParaCalificar = rpcId
        } else {
            // Fallback: flujo anterior paso a paso
            console.warn('RPC no disponible, usando flujo alternativo:', errorRpc.message)
            for (const cuota of cuotasAPagar) {
                const { data: pagoInsertado, error } = await supabase.from('pagos').insert([{
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
                }]).select().single()

                if (error) {
                    console.error("Error al insertar pago:", error);
                    alert("Error al guardar el pago. Verifica la consola.");
                    setGuardando(false);
                    return;
                }
                if (pagoInsertado) pagoIdParaCalificar = pagoInsertado.id
            }

            const nuevoAbonoFallback = (pedidoSeleccionado.abono_inicial || 0) + montoTotal
            // NOTA: 'saldo' es columna generada en la DB (se calcula sola a partir
            // de total_venta y abono_inicial) → NUNCA se actualiza directamente.
            const { error: errorUpdate } = await supabase
                .from('pedidos')
                .update({
                    abono_inicial: nuevoAbonoFallback,
                    estado: nuevoAbonoFallback >= (pedidoSeleccionado.total_venta || 0) ? 'Pagado' : pedidoSeleccionado.estado,
                })
                .eq('id', pedidoSeleccionado.id)

            if (errorUpdate) {
                console.error('Error al actualizar pedido:', errorUpdate)
                alert('❌ El pago se guardó pero hubo un error al actualizar el saldo: ' + errorUpdate.message)
                setGuardando(false)
                return
            }
        }

        // Recargar
        const nuevoSaldo = Math.max(0, pedidoSeleccionado.saldo - montoTotal)
        const pedidoActualizado = {
            ...pedidoSeleccionado,
            abono_inicial: (pedidoSeleccionado.abono_inicial || 0) + montoTotal,
            saldo: nuevoSaldo,
            estado: nuevoSaldo <= 0 ? 'Pagado' : pedidoSeleccionado.estado,
        }
        await seleccionarPedido(pedidoActualizado)

        const textoCuotas = cuotasAPagar.map(c => `#${c.cuota_numero}`).join(', ')
        setMensajeExito(`✅ Pagaste cuota(s) ${textoCuotas} por Gs ${montoTotal.toLocaleString()}`)
        setGuardando(false)

        // Paso opcional: calificar cómo fue esta cobranza
        setUltimoPagoId(pagoIdParaCalificar)
        setEstrellasSeleccionadas(0)
        setComentarioCalificacion('')
        setPedirCalificacion(true)
    }

    async function guardarCalificacion() {
        if (!estrellasSeleccionadas || !clienteSeleccionado) return
        setGuardandoCalificacion(true)
        await supabase.from('calificaciones_clientes').insert([{
            cliente_id: clienteSeleccionado.id,
            pago_id: ultimoPagoId,
            estrellas: estrellasSeleccionadas,
            comentario: comentarioCalificacion || null,
        }])
        setGuardandoCalificacion(false)
        setPedirCalificacion(false)
    }

    function omitirCalificacion() {
        setPedirCalificacion(false)
    }

    // Helpers de formato para la lista de cobros
    function formatearFechaProximo(fecha) {
        if (!fecha) return '—'
        const hoy = new Date()
        hoy.setHours(0, 0, 0, 0)
        const diff = Math.round((fecha - hoy) / (1000 * 60 * 60 * 24))
        if (diff < 0) return `Vencido hace ${Math.abs(diff)} día${Math.abs(diff) !== 1 ? 's' : ''}`
        if (diff === 0) return '🔴 Vence HOY'
        if (diff === 1) return '🟠 Vence MAÑANA'
        if (diff <= 7) return `🟡 En ${diff} días`
        return `🟢 ${fecha.toLocaleDateString('es-PY')}`
    }

    function colorBadgeProximo(fecha) {
        if (!fecha) return 'bg-gray-100 text-gray-600'
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
        const diff = Math.round((fecha - hoy) / (1000 * 60 * 60 * 24))
        if (diff < 0) return 'bg-red-100 text-red-700'
        if (diff === 0) return 'bg-red-100 text-red-700'
        if (diff <= 3) return 'bg-orange-100 text-orange-700'
        if (diff <= 7) return 'bg-yellow-100 text-yellow-700'
        return 'bg-green-100 text-green-700'
    }

    return (
        <div className="p-4 pb-24 max-w-md mx-auto">
            <button onClick={() => navigate('/')} className="flex items-center text-blue-900 font-bold mb-4">
                <ArrowLeft size={20} className="mr-1" /> Volver
            </button>

            <h1 className="text-2xl font-bold text-blue-900 mb-1">💰 Cobrar Cuota</h1>
            <p className="text-gray-500 text-sm mb-4">Registrá los pagos de tus clientes</p>

            {/* BUSCAR CLIENTE (arriba, también filtra la lista) */}
            <div className="relative mb-4">
                <div className="relative">
                    <Search size={16} className="absolute left-3 top-3.5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Filtrar o buscar cliente..."
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

            {/* LISTA DE COBROS PENDIENTES (pantalla de inicio sin cliente seleccionado) */}
            {!clienteSeleccionado && (
                <div className="mb-6">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-bold text-gray-700 flex items-center gap-1">
                            <Users size={15} /> Pendientes de cobro
                        </h2>
                        <span className="text-xs text-gray-400">{cobrosPendientes.length} cliente{cobrosPendientes.length !== 1 ? 's' : ''}</span>
                    </div>

                    {cargandoPendientes ? (
                        <div className="text-center py-6 text-gray-400 text-sm">Cargando cobros...</div>
                    ) : cobrosPendientes.length === 0 ? (
                        <div className="text-center py-8 bg-green-50 rounded-xl border border-green-100">
                            <CheckCircle size={36} className="mx-auto mb-2 text-green-500" />
                            <p className="font-semibold text-green-700">¡Todo al día!</p>
                            <p className="text-xs text-gray-500 mt-1">No hay cobros pendientes</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {cobrosPendientes
                                .filter(p =>
                                    !buscarCliente.trim() ||
                                    p.cliente?.nombre?.toLowerCase().includes(buscarCliente.toLowerCase()) ||
                                    p.cliente?.telefono?.includes(buscarCliente)
                                )
                                .map((p) => (
                                <button
                                    key={p.id}
                                    onClick={() => cargarPedidosCliente(p.cliente)}
                                    className="w-full text-left bg-white border border-gray-200 rounded-xl p-3 hover:shadow-md hover:border-blue-300 transition-all relative"
                                >
                                    {p.cuotasVencidas > 0 && (
                                        <div className="absolute -top-1.5 -right-1.5 bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                            {p.cuotasVencidas} vencida{p.cuotasVencidas !== 1 ? 's' : ''}
                                        </div>
                                    )}
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-sm text-gray-900 truncate">{p.cliente?.nombre}</p>
                                            <p className="text-xs text-gray-500 truncate">{descripcionProducto(p)}</p>
                                        </div>
                                        <div className="text-right ml-2 shrink-0">
                                            <p className="text-sm font-bold text-red-600">Gs {p.saldo.toLocaleString()}</p>
                                            <p className="text-xs text-gray-400">{p.condicion_pago}</p>
                                        </div>
                                    </div>
                                    <div className="mt-2">
                                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${colorBadgeProximo(p.proximoPago)}`}>
                                            <Clock size={10} />
                                            {formatearFechaProximo(p.proximoPago)}
                                        </span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

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
                    <button
                        onClick={() => navigate(`/estado-cuenta?cliente=${clienteSeleccionado.id}`)}
                        className="text-xs font-bold text-amber-700 bg-amber-100 px-2.5 py-1.5 rounded-lg whitespace-nowrap"
                    >
                        🧾 Estado de Cuenta
                    </button>
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
                                        <p className="font-bold text-sm text-gray-900">{etiquetaPedido(p)}</p>
                                        <p className="text-xs text-gray-500">{descripcionProducto(p)}</p>
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
                                <h3 className="font-bold text-blue-900">{etiquetaPedido(pedidoSeleccionado)}</h3>
                                <p className="text-xs text-gray-500">{descripcionProducto(pedidoSeleccionado)}</p>
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
                                            <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-semibold">
                                                💳 {pago.metodo_pago}
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

                    {/* Calificar la cobranza (opcional, no bloquea el flujo) */}
                    {pedirCalificacion && (
                        <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 space-y-3">
                            <div className="flex justify-between items-start">
                                <h4 className="font-bold text-amber-900 text-sm">
                                    ⭐ ¿Cómo fue esta cobranza con {clienteSeleccionado?.nombre}?
                                </h4>
                                <button
                                    type="button"
                                    onClick={omitirCalificacion}
                                    className="text-amber-700 text-xs underline"
                                >
                                    Omitir
                                </button>
                            </div>

                            <div className="flex justify-center gap-1">
                                {[1, 2, 3, 4, 5].map((n) => (
                                    <button
                                        key={n}
                                        type="button"
                                        onClick={() => setEstrellasSeleccionadas(n)}
                                        className="p-1"
                                    >
                                        <Star
                                            size={32}
                                            className={n <= estrellasSeleccionadas ? 'text-amber-500 fill-amber-500' : 'text-gray-300'}
                                        />
                                    </button>
                                ))}
                            </div>

                            <textarea
                                value={comentarioCalificacion}
                                onChange={(e) => setComentarioCalificacion(e.target.value)}
                                placeholder="Comentario opcional (ej: pagó puntual, costó contactar, etc.)"
                                className="w-full p-2.5 border border-amber-300 rounded-lg text-sm"
                                rows="2"
                            />

                            <button
                                type="button"
                                onClick={guardarCalificacion}
                                disabled={!estrellasSeleccionadas || guardandoCalificacion}
                                className="w-full bg-amber-500 text-white font-bold py-2.5 rounded-xl shadow-md disabled:opacity-50"
                            >
                                {guardandoCalificacion ? 'Guardando...' : 'Guardar valoración'}
                            </button>
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
                                    const montoPorCuota = obtenerMontoSugerido();
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
                                Sugerido: Gs {obtenerMontoSugerido().toLocaleString()} por {formPago.cantidad_cuotas_pagar} cuota(s)
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
