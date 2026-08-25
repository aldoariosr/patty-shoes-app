import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { calcularDeudasPorCliente } from '../lib/deudas'
import { descripcionProducto } from '../lib/descripcion'
import { parseFecha } from '../lib/fechas'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Search, Download, Package, X, FileDown, AlertTriangle, ChevronDown, ChevronUp, CheckCircle, Clock } from 'lucide-react'
import html2canvas from 'html2canvas'
import * as XLSX from 'xlsx'

export default function EstadoCuenta() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const reciboRef = useRef(null)

    const [clientes, setClientes] = useState([])
    const [buscarCliente, setBuscarCliente] = useState('')
    const [mostrarClientes, setMostrarClientes] = useState(false)
    const [clienteSeleccionado, setClienteSeleccionado] = useState(null)

    const [cuentas, setCuentas] = useState([])
    const [cargando, setCargando] = useState(false)
    const [descargando, setDescargando] = useState(false)

    // Estado para controlar el despliegue de "DETALLES"
    const [mostrarDetalles, setMostrarDetalles] = useState(false)

    // Completar datos de registros históricos sin monto (Total 0 / "Sin Clasificar")
    const [editandoHist, setEditandoHist] = useState(null)
    const [formHist, setFormHist] = useState({ producto: '', total: '' })

    // Detalle de pagos por cuenta (método, fechas, puntualidad)
    const [pagosVisibles, setPagosVisibles] = useState(null)
    const [detallePagos, setDetallePagos] = useState({})

    async function alternarPagos(cuenta) {
        if (pagosVisibles === cuenta.id) {
            setPagosVisibles(null)
            return
        }
        setPagosVisibles(cuenta.id)
        if (cuenta.pedidoId && !detallePagos[cuenta.id]) {
            const { data } = await supabase
                .from('pagos')
                .select('*')
                .eq('pedido_id', cuenta.pedidoId)
                .order('cuota_numero', { ascending: true })
            setDetallePagos(prev => ({ ...prev, [cuenta.id]: data || [] }))
        }
    }

    // Puntualidad de un pago: compara fecha de pago contra el vencimiento teórico de la cuota
    function evaluarPuntualidad(pago, cuenta) {
        if (!pago.cuota_numero || pago.cuota_numero <= 0 || !cuenta.fecha) return null
        const intervalos = { '1': 7, '2': 15, '3': 30 }
        const venc = parseFecha(cuenta.fecha)
        if (!venc) return null
        venc.setDate(venc.getDate() + pago.cuota_numero * (intervalos[cuenta.tipoCuota || '3'] || 30))
        const fechaPago = new Date(pago.fecha_pago)
        if (isNaN(fechaPago.getTime())) return null
        const dias = Math.floor((fechaPago - venc) / (1000 * 60 * 60 * 24))
        return dias <= 0
            ? { puntual: true, texto: '✅ Puntual' }
            : { puntual: false, texto: `⏱️ ${dias} día${dias !== 1 ? 's' : ''} tarde` }
    }

    // Lista de clientes con deuda pendiente (pantalla de inicio)
    const [deudores, setDeudores] = useState([])
    const [cargandoDeudores, setCargandoDeudores] = useState(true)

    useEffect(() => {
        cargarDeudores()
        const clienteId = searchParams.get('cliente')
        if (!clienteId) return
        async function cargarClientePorId() {
            const { data } = await supabase.from('clientes').select('*').eq('id', clienteId).single()
            if (data) seleccionarCliente(data)
        }
        cargarClientePorId()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    async function cargarDeudores() {
        setCargandoDeudores(true)
        // Cálculo centralizado (misma fuente que la pestaña Clientes)
        const deudas = await calcularDeudasPorCliente()
        setDeudores(Object.values(deudas).sort((a, b) => b.deuda_total - a.deuda_total))
        setCargandoDeudores(false)
    }

    async function buscarClientesInput(texto) {
        setBuscarCliente(texto)
        setMostrarClientes(true)
        if (texto.length < 2) {
            setClientes([])
            return
        }
        // Quitar caracteres que rompen la sintaxis del filtro .or() de PostgREST
        const seguro = texto.replace(/[%(),*]/g, ' ').trim()
        const { data } = await supabase
            .from('clientes')
            .select('*')
            .or(`nombre.ilike.%${seguro}%,telefono.ilike.%${seguro}%,codigo.ilike.%${seguro}%`)
            .order('nombre')
            .limit(20)
        setClientes(data || [])
    }

    function calcularCuotasAtrasadas(pedido, pagosRealizados) {
        const hoy = new Date()
        hoy.setHours(0, 0, 0, 0)
        const fechaPedido = new Date(pedido.fecha_pedido)
        const tipoCuota = pedido.tipo_cuota || '3'
        const numCuotas = pedido.num_cuotas
        const intervalos = { '1': 7, '2': 15, '3': 30 }
        const diasIntervalo = intervalos[tipoCuota] || 30
        const cuotasPagadasNums = pagosRealizados.map(p => p.cuota_numero)
        let atrasadas = 0
        for (let i = 1; i <= (numCuotas || 0); i++) {
            if (!cuotasPagadasNums.includes(i)) {
                const fechaVencimiento = new Date(fechaPedido)
                fechaVencimiento.setDate(fechaVencimiento.getDate() + (i * diasIntervalo))
                fechaVencimiento.setHours(0, 0, 0, 0)
                if (fechaVencimiento < hoy) atrasadas++
            }
        }
        return atrasadas
    }

    async function seleccionarCliente(cliente) {
        setClienteSeleccionado(cliente)
        setBuscarCliente(cliente.nombre)
        setMostrarClientes(false)
        setMostrarDetalles(false) // Colapsar detalles al cambiar de cliente
        setCargando(true)

        const { data: pedidos } = await supabase
            .from('pedidos')
            .select(`*, producto:productos(marca, estilo, talla, color)`)
            .eq('cliente_id', cliente.id)
            .order('fecha_pedido', { ascending: false })

        const { data: historico } = await supabase
            .from('ventas_historicas')
            .select('*')
            .eq('cliente_id', cliente.id)
            .order('fecha_venta', { ascending: false })

        const cuentasApp = []
        for (const p of (pedidos || [])) {
            let cuotasAtrasadas = 0
            if (p.condicion_pago === 'Cuotas' && p.estado !== 'Cancelado' && p.saldo > 0) {
                const { data: pagosPedido } = await supabase
                    .from('pagos')
                    .select('cuota_numero')
                    .eq('pedido_id', p.id)
                cuotasAtrasadas = calcularCuotasAtrasadas(p, pagosPedido || [])
            }
            cuentasApp.push({
                id: `app-${p.id}`,
                pedidoId: p.id,
                fuente: 'app',
                fecha: p.fecha_pedido,
                producto: [p.producto?.marca, p.producto?.estilo, p.producto?.talla ? `Talla ${p.producto.talla}` : null]
                    .filter(Boolean).join(' • ') || descripcionProducto(p),
                total: p.total_venta || 0,
                saldo: p.saldo || 0,
                pagado: (p.total_venta || 0) - (p.saldo || 0),
                estado: p.estado,
                cuotasAtrasadas,
                tipoCuota: p.tipo_cuota,
                numCuotas: p.num_cuotas,
            })
        }

        // Ocultar históricas que ya fueron migradas (existe PED-HIST-<id> en pedidos)
        const { data: codigosMigrados } = await supabase
            .from('pedidos')
            .select('codigo')
            .eq('cliente_id', cliente.id)
            .or('codigo.ilike.PED-HIST-%,codigo.ilike.PED-IMP-%')
        const setMigrados = new Set((codigosMigrados || []).map(p => p.codigo))

        const cuentasHistorico = (historico || [])
            .filter(v => !setMigrados.has(`PED-HIST-${v.id}`) && !setMigrados.has(`PED-IMP-${v.id}`))
            .map(v => ({
                id: `hist-${v.id}`,
                historicoId: v.id,
                fuente: 'historico',
                fecha: parseFecha(v.fecha_venta)?.toISOString() || null,
                producto: [v.marca, v.color, v.talle ? `Talla ${v.talle}` : null, v.tipo_producto]
                    .filter(Boolean).join(' • ') || 'Producto (histórico)',
                total: v.venta || 0,
                saldo: v.saldo_a_cobrar || 0,
                pagado: (v.venta || 0) - (v.saldo_a_cobrar || 0),
                estado: v.estado_pedido,
            }))

        const todas = [...cuentasApp, ...cuentasHistorico].sort((a, b) => {
            const fa = a.fecha ? new Date(a.fecha).getTime() : 0
            const fb = b.fecha ? new Date(b.fecha).getTime() : 0
            return fb - fa
        })

        setCuentas(todas)
        setCargando(false)
    }

    function limpiarSeleccion() {
        setClienteSeleccionado(null)
        setCuentas([])
        setBuscarCliente('')
        setMostrarClientes(false)
        setMostrarDetalles(false)
        cargarDeudores()
    }

    const deudaTotal = cuentas.reduce((acc, c) => acc + Math.max(0, c.saldo || 0), 0)

    async function descargarExcelCliente() {
        if (!clienteSeleccionado) return
        setDescargando(true)
        try {
            const wb = XLSX.utils.book_new()
            const hojaCuentas = cuentas.map((c, i) => ({
                '#': i + 1, 'Origen': c.fuente === 'app' ? 'App' : 'Histórico Excel',
                'Fecha': c.fecha, 'Producto': c.producto, 'Total (Gs)': c.total,
                'Pagado (Gs)': Math.max(0, c.pagado), 'Saldo (Gs)': c.saldo, 'Estado': c.estado,
                'Cuotas Atrasadas': c.cuotasAtrasadas || 0,
            }))
            const wsCuentas = XLSX.utils.json_to_sheet(hojaCuentas)
            wsCuentas['!cols'] = [{ wch: 4 }, { wch: 14 }, { wch: 12 }, { wch: 34 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 14 }]
            XLSX.utils.book_append_sheet(wb, wsCuentas, 'Cuentas')

            const wsResumen = XLSX.utils.json_to_sheet([
                { 'Cliente': clienteSeleccionado.nombre, 'Teléfono': clienteSeleccionado.telefono || '', 'Deuda Total (Gs)': deudaTotal, 'Cantidad de Cuentas': cuentas.length },
            ])
            XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen')

            const fecha = new Date().toISOString().slice(0, 10)
            const nombreArchivo = `estado-cuenta-${clienteSeleccionado.nombre.replace(/\s+/g, '-').toLowerCase()}-${fecha}.xlsx`
            XLSX.writeFile(wb, nombreArchivo)
        } catch (err) {
            alert('No se pudo generar el Excel: ' + err.message)
        }
        setDescargando(false)
    }

    async function descargarComoImagen() {
        if (!reciboRef.current) return
        setDescargando(true)
        try {
            const canvas = await html2canvas(reciboRef.current, {
                backgroundColor: '#ffffff',
                scale: 2,
            })
            const link = document.createElement('a')
            const nombreArchivo = `estado-cuenta-${clienteSeleccionado.nombre.replace(/\s+/g, '-').toLowerCase()}.png`
            link.download = nombreArchivo
            link.href = canvas.toDataURL('image/png')
            link.click()
        } catch (err) {
            alert('No se pudo generar la imagen: ' + err.message)
        }
        setDescargando(false)
    }

    // Completar un registro histórico sin datos (Total 0) como pedido real.
    // Queda en la pestaña Pedidos para gestionar entrega y cobro normal.
    async function guardarEdicionHistorica(e) {
        e.preventDefault()
        const totalNum = Number(formHist.total)
        if (!formHist.producto.trim()) {
            alert('Ingresá el detalle del producto')
            return
        }
        if (!totalNum || totalNum <= 0) {
            alert('Ingresá el monto total de la venta')
            return
        }

        const codigo = `PED-IMP-${editandoHist.historicoId}`
        const { data: existente } = await supabase
            .from('pedidos')
            .select('id')
            .eq('codigo', codigo)
            .maybeSingle()

        if (existente) {
            alert('Este registro ya fue completado anteriormente')
            setEditandoHist(null)
            return
        }

        setCargando(true)
        const fecha = editandoHist.fecha || new Date().toISOString()
        const { error } = await supabase
            .from('pedidos')
            .insert([{
                codigo,
                cliente_id: clienteSeleccionado.id,
                fecha_pedido: fecha,
                precio_venta: totalNum,
                cantidad: 1,
                abono_inicial: 0,
                estado: 'Pendiente',
                condicion_pago: 'Contado',
                tipo_cuota: '3',
                num_cuotas: 1,
                notas: `Pedido importado del Excel — ${formHist.producto.trim()}`,
            }])
        setCargando(false)

        if (error) {
            alert('Error al guardar: ' + error.message)
            return
        }

        setEditandoHist(null)
        await seleccionarCliente(clienteSeleccionado)
        alert('✅ Pedido completado. Ya aparece en la pestaña Pedidos para registrar entrega y cobro.')
    }

    // Migrar todas las cuentas históricas con saldo a pedidos de la app
    async function migrarTodasHistoricas() {
        const historicasPendientes = cuentas.filter(c => c.fuente === 'historico' && c.saldo > 0)
        if (historicasPendientes.length === 0) {
            alert('No hay cuentas históricas pendientes de migrar')
            return
        }

        const confirmar = window.confirm(
            `¿Migrar ${historicasPendientes.length} cuenta(s) histórica(s) a la app?\n\n` +
            `Total a migrar: Gs ${historicasPendientes.reduce((a, c) => a + c.saldo, 0).toLocaleString()}`
        )
        if (!confirmar) return

        setCargando(true)
        let creadas = 0
        let yaExistian = 0

        for (const c of historicasPendientes) {
            try {
                const codigoMigrado = `PED-HIST-${c.historicoId}`
                const { data: existente } = await supabase
                    .from('pedidos')
                    .select('id')
                    .eq('codigo', codigoMigrado)
                    .maybeSingle()

                if (existente) {
                    yaExistian++
                    continue
                }

                const { error } = await supabase
                    .from('pedidos')
                    .insert([{
                        codigo: codigoMigrado,
                        cliente_id: clienteSeleccionado.id,
                        fecha_pedido: parseFecha(c.fecha)?.toISOString() || new Date().toISOString(),
                        precio_venta: c.total,
                        cantidad: 1,
                        abono_inicial: c.pagado,
                        estado: 'Pendiente',
                        condicion_pago: 'Contado',
                        tipo_cuota: '3',
                        num_cuotas: 1,
                        notas: `Migrado desde histórico Excel — ${c.producto}`,
                    }])

                if (error) throw error
                creadas++
            } catch (err) {
                console.error('Error migrando cuenta:', c.id, err)
                alert('Error al migrar una cuenta: ' + err.message)
            }
        }

        await seleccionarCliente(clienteSeleccionado)
        alert(`✅ Migración completada: ${creadas} nueva(s), ${yaExistian} ya existía(n)`)
    }

    return (
        <div className="p-4 pb-24 max-w-md mx-auto">
            <button onClick={() => navigate('/')} className="flex items-center text-blue-900 font-bold mb-4">
                <ArrowLeft size={20} className="mr-1" /> Volver
            </button>

            <h1 className="text-2xl font-bold text-blue-900 mb-1">🧾 Estado de Cuenta</h1>
            <p className="text-gray-500 text-sm mb-4">Buscá un cliente o tocá uno con deuda pendiente</p>

            {/* Buscador de cliente (arriba, para filtrar rápido) */}
            <div className="relative mb-4">
                <Search size={16} className="absolute left-3 top-3.5 text-gray-400" />
                <input
                    type="text"
                    placeholder="Buscar cliente por nombre, teléfono o código..."
                    value={buscarCliente}
                    onChange={(e) => buscarClientesInput(e.target.value)}
                    onFocus={() => setMostrarClientes(true)}
                    className="w-full p-3 pl-9 border rounded-lg text-sm"
                />
                {clienteSeleccionado && (
                    <button
                        onClick={limpiarSeleccion}
                        className="absolute right-3 top-3 text-gray-400"
                    >
                        <X size={18} />
                    </button>
                )}

                {mostrarClientes && clientes.length > 0 && (
                    <div className="absolute z-10 w-full bg-white border rounded-lg shadow-lg mt-1 max-h-64 overflow-y-auto">
                        {clientes.map((c) => (
                            <button
                                key={c.id}
                                onClick={() => seleccionarCliente(c)}
                                className="w-full text-left p-3 hover:bg-gray-50 border-b text-sm"
                            >
                                <p className="font-semibold text-gray-900">{c.nombre}</p>
                                {c.telefono && <p className="text-xs text-gray-500">{c.telefono}</p>}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* LISTA DE CLIENTES CON DEUDA PENDIENTE (filtrada por el buscador) */}
            {!clienteSeleccionado && (
                <div className="mb-6">
                    {cargandoDeudores ? (
                        <p className="text-center text-gray-400 text-sm py-4">Cargando deudas...</p>
                    ) : deudores.length === 0 ? (
                        <div className="text-center py-8 bg-green-50 rounded-xl border border-green-100">
                            <Package size={36} className="mx-auto mb-2 text-green-500" />
                            <p className="font-semibold text-green-700">¡Todo al día!</p>
                            <p className="text-xs text-gray-500 mt-1">No hay clientes con deuda pendiente</p>
                        </div>
                    ) : (
                        <>
                            <h2 className="text-sm font-bold text-gray-700 mb-2">
                                💰 Deudas Pendientes
                            </h2>
                            <div className="space-y-2">
                                {deudores
                                    .filter(d =>
                                        !buscarCliente.trim() ||
                                        d.nombre?.toLowerCase().includes(buscarCliente.toLowerCase()) ||
                                        d.telefono?.includes(buscarCliente)
                                    )
                                    .map((d) => (
                                        <button
                                            key={d.id}
                                            onClick={() => seleccionarCliente(d)}
                                            className="w-full text-left bg-white border border-red-100 rounded-xl p-3 hover:shadow-md hover:border-red-300 transition-all flex justify-between items-center"
                                        >
                                            <div className="min-w-0">
                                                <p className="font-bold text-sm text-gray-900 truncate">{d.nombre}</p>
                                                <p className="text-xs text-gray-500">
                                                    {d.cantidad_cuentas > 0 && `${d.cantidad_cuentas} cuenta${d.cantidad_cuentas !== 1 ? 's' : ''}${d.telefono ? ' • ' : ''}`}{d.telefono}
                                                </p>
                                            </div>
                                            <span className="text-sm font-bold text-red-600 shrink-0 ml-2">
                                                Debe Gs {d.deuda_total.toLocaleString()}
                                            </span>
                                        </button>
                                    ))}
                            </div>
                        </>
                    )}
                </div>
            )}

            {cargando && <p className="text-center text-gray-500 py-8">Cargando cuentas...</p>}

            {!cargando && clienteSeleccionado && (
                <>
                    {/* Tarjeta Resumen del Cliente */}
                    <div className="bg-white border-2 border-blue-900 rounded-2xl p-5 mb-4 shadow-sm">
                        <div className="text-center mb-4 pb-3 border-b-2 border-dashed border-gray-300">
                            <h2 className="text-xl font-bold text-blue-900">PATTY SHOES</h2>
                            <p className="text-xs text-gray-500">Resumen de Cliente</p>
                        </div>

                        <div className="mb-4 text-center">
                            <div className="bg-blue-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-2 text-blue-900 font-bold text-2xl">
                                {clienteSeleccionado.nombre.charAt(0)}
                            </div>
                            <p className="text-xs text-gray-500">Cliente</p>
                            <p className="font-bold text-gray-900 text-lg">{clienteSeleccionado.nombre}</p>
                            {clienteSeleccionado.telefono && (
                                <p className="text-sm text-gray-600">{clienteSeleccionado.telefono}</p>
                            )}
                        </div>

                        <div className="bg-red-50 rounded-lg p-3 mb-4 text-center border border-red-100">
                            <p className="text-xs text-red-600 font-bold uppercase">Deuda Total Estimada</p>
                            <p className="text-2xl font-bold text-red-700">Gs {deudaTotal.toLocaleString()}</p>
                        </div>

                        {/* BOTÓN DETALLES (ACORDEÓN) */}
                        <button
                            onClick={() => setMostrarDetalles(!mostrarDetalles)}
                            className="w-full bg-blue-900 hover:bg-blue-800 text-white font-bold py-3 px-4 rounded-xl shadow-md flex items-center justify-between transition-colors"
                        >
                            <span className="flex items-center gap-2">
                                <FileDown size={18} />
                                {mostrarDetalles ? 'OCULTAR DETALLES' : 'VER DETALLES'}
                            </span>
                            {mostrarDetalles ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                        </button>
                    </div>

                    {/* SECCIÓN DESPLEGABLE DE DETALLES */}
                    {mostrarDetalles && (
                        <div className="animate-fade-in-down">
                            {/* Recibo — esto es lo que se convierte en imagen */}
                            <div ref={reciboRef} className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
                                <div className="text-center mb-4 pb-3 border-b border-gray-200">
                                    <h3 className="text-lg font-bold text-gray-800">Detalle de Cuentas</h3>
                                    <p className="text-xs text-gray-500">
                                        {new Date().toLocaleDateString('es-PY', { day: '2-digit', month: 'long', year: 'numeric' })}
                                    </p>
                                </div>

                                {cuentas.length === 0 ? (
                                    <div className="text-center py-6 text-gray-400">
                                        <Package size={32} className="mx-auto mb-2" />
                                        <p className="text-sm">Este cliente no tiene cuentas registradas</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {cuentas.map((c, i) => {
                                            const tieneSaldo = c.saldo > 0
                                            const esCobrarable = tieneSaldo && (c.fuente === 'app' || c.fuente === 'historico')
                                            const handleClick = async () => {
                                                if (tieneSaldo && c.fuente === 'app' && c.pedidoId) {
                                                    navigate(`/cobrar-cuota?cliente=${clienteSeleccionado.id}&pedido=${c.pedidoId}`)
                                                } else if (tieneSaldo && c.fuente === 'historico') {
                                                    const mensaje = `¿Deseas migrar esta cuenta histórica a la app para poder cobrarla?\n\nProducto: ${c.producto}\nTotal: Gs ${c.total.toLocaleString()}\nSaldo pendiente: Gs ${c.saldo.toLocaleString()}`
                                                    const confirmar = window.confirm(mensaje)
                                                    if (!confirmar) return

                                                    try {
                                                        // Código determinístico: si ya fue migrada antes, no duplicar
                                                        const codigoMigrado = `PED-HIST-${c.historicoId}`
                                                        const { data: existente } = await supabase
                                                            .from('pedidos')
                                                            .select('id')
                                                            .eq('codigo', codigoMigrado)
                                                            .maybeSingle()

                                                        if (existente) {
                                                            navigate(`/cobrar-cuota?cliente=${clienteSeleccionado.id}&pedido=${existente.id}`)
                                                            return
                                                        }

                                                        const nuevoPedido = {
                                                            codigo: codigoMigrado,
                                                            cliente_id: clienteSeleccionado.id,
                                                            fecha_pedido: parseFecha(c.fecha)?.toISOString() || new Date().toISOString(),
                                                            precio_venta: c.total,
                                                            cantidad: 1,
                                                            abono_inicial: c.pagado,
                                                            estado: c.saldo > 0 ? 'Pendiente' : 'Pagado',
                                                            condicion_pago: 'Contado',
                                                            tipo_cuota: '3',
                                                            num_cuotas: 1,
                                                            notas: `Migrado desde histórico Excel — ${c.producto}`,
                                                        }

                                                        const { data: pedidoCreado, error } = await supabase
                                                            .from('pedidos')
                                                            .insert([nuevoPedido])
                                                            .select()
                                                            .single()

                                                        if (error) throw error

                                                        alert('✅ Cuenta migrada exitosamente. Ahora serás redirigido para realizar el cobro.')
                                                        // Refrescar la lista para que la cuenta migrada ya no aparezca como histórica
                                                        await seleccionarCliente(clienteSeleccionado)
                                                        navigate(`/cobrar-cuota?cliente=${clienteSeleccionado.id}&pedido=${pedidoCreado.id}`)
                                                    } catch (err) {
                                                        alert('Error al migrar la cuenta: ' + err.message)
                                                    }
                                                }
                                            }
                                            return (
                                                <div
                                                    key={c.id}
                                                    className={`rounded-lg p-3 border ${tieneSaldo ? 'bg-white border-blue-200 hover:bg-blue-50 cursor-pointer' : 'bg-gray-50 border-gray-100 opacity-70'}`}
                                                    onClick={handleClick}
                                                >
                                                    <div className="flex justify-between items-start mb-1">
                                                        <p className="text-sm font-semibold text-gray-800">
                                                            {i + 1}. {c.producto}
                                                        </p>
                                                        <span className="text-[10px] text-gray-400">
                                                            {c.fecha ? new Date(c.fecha).toLocaleDateString('es-PY') : ''}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between text-xs text-gray-600">
                                                        <span>Total: Gs {c.total.toLocaleString()}</span>
                                                        <span>Pagado: Gs {Math.max(0, c.pagado).toLocaleString()}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center mt-1">
                                                        <span className="text-xs text-gray-500 flex items-center gap-1">
                                                            {c.estado}
                                                            {c.cuotasAtrasadas > 0 && (
                                                                <span className="flex items-center gap-0.5 text-red-600 font-bold bg-red-50 px-1.5 py-0.5 rounded-full text-[10px]">
                                                                    <AlertTriangle size={10} /> {c.cuotasAtrasadas} atrasada{c.cuotasAtrasadas > 1 ? 's' : ''}
                                                                </span>
                                                            )}
                                                        </span>
                                                        <span className={`text-sm font-bold ${tieneSaldo ? 'text-red-600' : 'text-green-600'}`}>
                                                            {tieneSaldo ? `Debe: Gs ${c.saldo.toLocaleString()}` : 'Saldado'}
                                                        </span>
                                                    </div>
                                                    {tieneSaldo && esCobrarable && (
                                                        <p className="text-[10px] text-blue-600 mt-1 font-medium">👆 Tocar para cobrar esta cuenta</p>
                                                    )}

                                                    {/* Detalle de pagos (solo cuentas de la app) */}
                                                    {c.fuente === 'app' && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); alternarPagos(c) }}
                                                            className="w-full mt-2 bg-gray-100 hover:bg-blue-50 text-gray-700 text-xs font-bold py-1.5 rounded-lg flex items-center justify-center gap-1"
                                                        >
                                                            💳 {pagosVisibles === c.id ? 'Ocultar pagos' : 'Ver historial de pagos'}
                                                        </button>
                                                    )}
                                                    {c.fuente === 'app' && pagosVisibles === c.id && (
                                                        <div className="mt-2 border-t pt-2 space-y-1" onClick={(e) => e.stopPropagation()}>
                                                            {(detallePagos[c.id] || []).length === 0 ? (
                                                                <p className="text-xs text-gray-400 text-center py-1">Sin pagos registrados todavía</p>
                                                            ) : (
                                                                detallePagos[c.id].map((pg) => {
                                                                    const puntualidad = evaluarPuntualidad(pg, c)
                                                                    return (
                                                                        <div key={pg.id} className="bg-blue-50 rounded-lg p-2 flex justify-between items-center text-xs">
                                                                            <div className="min-w-0">
                                                                                <p className="font-bold text-gray-800">
                                                                                    {(pg.cuota_numero || 0) > 0 ? `Cuota #${pg.cuota_numero}` : 'Pago inicial / abono'}
                                                                                    {pg.total_cuotas ? ` de ${pg.total_cuotas}` : ''}
                                                                                </p>
                                                                                <p className="text-gray-500 flex items-center gap-2 flex-wrap mt-0.5">
                                                                                    <span className="flex items-center gap-0.5"><Clock size={9} />{new Date(pg.fecha_pago).toLocaleDateString('es-PY')}</span>
                                                                                    <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-semibold">💳 {pg.metodo_pago}</span>
                                                                                    {pg.referencia && <span className="text-gray-400">Ref: {pg.referencia}</span>}
                                                                                </p>
                                                                                {puntualidad && (
                                                                                    <p className={`mt-0.5 font-semibold ${puntualidad.puntual ? 'text-green-600' : 'text-orange-600'}`}>
                                                                                        {puntualidad.texto}
                                                                                    </p>
                                                                                )}
                                                                            </div>
                                                                            <div className="text-right shrink-0 ml-2">
                                                                                <p className="font-bold text-green-700">Gs {(pg.monto_pagado || 0).toLocaleString()}</p>
                                                                                <p className="text-[10px] text-gray-400 flex items-center gap-0.5 justify-end"><CheckCircle size={9} />{pg.estado}</p>
                                                                            </div>
                                                                        </div>
                                                                    )
                                                                })
                                                            )}
                                                        </div>
                                                    )}
                                                    {c.fuente === 'historico' && !c.total && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                setEditandoHist(c)
                                                                setFormHist({ producto: c.producto === 'Producto (histórico)' ? '' : c.producto, total: '' })
                                                            }}
                                                            className="w-full mt-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold py-2 rounded-lg"
                                                        >
                                                            ✏️ Completar datos y pasar a Pedidos
                                                        </button>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}

                                <div className="mt-4 pt-3 border-t border-gray-200 flex justify-between items-center">
                                    <span className="font-bold text-gray-700">DEUDA TOTAL</span>
                                    <span className="text-xl font-bold text-blue-900">
                                        Gs {deudaTotal.toLocaleString()}
                                    </span>
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={descargarComoImagen}
                                    disabled={descargando || cuentas.length === 0}
                                    className="flex-1 bg-blue-900 text-white font-bold py-3 rounded-xl shadow-md flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
                                >
                                    <Download size={18} />
                                    {descargando ? 'Generando...' : 'Imagen'}
                                </button>
                                <button
                                    onClick={descargarExcelCliente}
                                    disabled={descargando || cuentas.length === 0}
                                    className="flex-1 bg-green-700 text-white font-bold py-3 rounded-xl shadow-md flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
                                >
                                    <FileDown size={18} />
                                    Excel
                                </button>
                            </div>

                            {cuentas.some(c => c.fuente === 'historico' && c.saldo > 0) && (
                                <button
                                    onClick={migrarTodasHistoricas}
                                    disabled={cargando}
                                    className="w-full mt-2 bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 rounded-xl shadow-md disabled:opacity-50 text-sm"
                                >
                                    📥 Migrar cuentas históricas a la app
                                </button>
                            )}
                        </div>
                    )}
                </>
            )}

            {/* MODAL: completar registro histórico sin datos */}
            {editandoHist && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-3">
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-bold text-blue-900">✏️ Completar Registro</h3>
                            <button onClick={() => setEditandoHist(null)}>
                                <X size={20} className="text-gray-400" />
                            </button>
                        </div>
                        <p className="text-xs text-gray-500">
                            Este registro vino del Excel sin monto. Completalo para gestionarlo como pedido normal (entrega + cobro).
                        </p>
                        <form onSubmit={guardarEdicionHistorica} className="space-y-3">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Producto / Detalle *</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Ej: Nike Air • Rojo • Talla 38"
                                    value={formHist.producto}
                                    onChange={(e) => setFormHist({ ...formHist, producto: e.target.value })}
                                    className="w-full p-3 border rounded-lg text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Total de la venta (Gs) *</label>
                                <input
                                    type="number"
                                    min="1"
                                    required
                                    placeholder="Ej: 350000"
                                    value={formHist.total}
                                    onChange={(e) => setFormHist({ ...formHist, total: e.target.value })}
                                    className="w-full p-3 border rounded-lg text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Fecha</label>
                                <input
                                    type="text"
                                    readOnly
                                    value={editandoHist.fecha ? new Date(editandoHist.fecha).toLocaleDateString('es-PY') : 'Hoy'}
                                    className="w-full p-3 border rounded-lg bg-gray-100 text-sm text-gray-600"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={cargando}
                                className="w-full bg-blue-900 text-white font-bold py-3 rounded-xl disabled:opacity-50"
                            >
                                {cargando ? 'Guardando...' : '✅ Guardar y pasar a Pedidos'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}