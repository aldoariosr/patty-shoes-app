import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Search, Download, Package, X, FileDown, AlertTriangle } from 'lucide-react'
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

    useEffect(() => {
        const clienteId = searchParams.get('cliente')
        if (!clienteId) return
        async function cargarClientePorId() {
            const { data } = await supabase.from('clientes').select('*').eq('id', clienteId).single()
            if (data) seleccionarCliente(data)
        }
        cargarClientePorId()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    async function buscarClientesInput(texto) {
        setBuscarCliente(texto)
        setMostrarClientes(true)
        if (texto.length < 2) {
            setClientes([])
            return
        }
        const { data } = await supabase
            .from('clientes')
            .select('*')
            .or(`nombre.ilike.%${texto}%,telefono.ilike.%${texto}%,codigo.ilike.%${texto}%`)
            .order('nombre')
            .limit(20)
        setClientes(data || [])
    }

    // Misma lógica que Cobrar Cuota, para mostrar cuántas cuotas atrasadas tiene cada cuenta
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
        setCargando(true)
        // Cuentas activas de la app (pedidos)
        const { data: pedidos } = await supabase
            .from('pedidos')
            .select(`*, producto:productos(marca, estilo, talla, color)`)
            .eq('cliente_id', cliente.id)
            .order('fecha_pedido', { ascending: false })

        // Cuentas del histórico del Excel
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
                fuente: 'app',
                fecha: p.fecha_pedido,
                producto: [p.producto?.marca, p.producto?.estilo, p.producto?.talla ? `Talla ${p.producto.talla}` : null]
                    .filter(Boolean).join(' • ') || 'Producto',
                total: p.total_venta || 0,
                saldo: p.saldo || 0,
                pagado: (p.total_venta || 0) - (p.saldo || 0),
                estado: p.estado,
                cuotasAtrasadas,
            })
        }

        const cuentasHistorico = (historico || []).map(v => ({
            id: `hist-${v.id}`,
            fuente: 'historico',
            fecha: v.fecha_venta,
            producto: [v.marca, v.color, v.talle ? `Talla ${v.talle}` : null, v.tipo_producto]
                .filter(Boolean).join(' • ') || 'Producto (histórico)',
            total: v.venta || 0,
            saldo: v.saldo_a_cobrar || 0,
            pagado: (v.venta || 0) - (v.saldo_a_cobrar || 0),
            estado: v.estado_pedido,
        }))

        const todas = [...cuentasApp, ...cuentasHistorico].sort((a, b) =>
            new Date(b.fecha || 0) - new Date(a.fecha || 0)
        )

        setCuentas(todas)
        setCargando(false)
    }

    function limpiarSeleccion() {
        setClienteSeleccionado(null)
        setCuentas([])
        setBuscarCliente('')
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

    return (
        <div className="p-4 pb-24 max-w-md mx-auto">
            <button onClick={() => navigate('/')} className="flex items-center text-blue-900 font-bold mb-4">
                <ArrowLeft size={20} className="mr-1" /> Volver
            </button>

            <h1 className="text-2xl font-bold text-blue-900 mb-1">🧾 Estado de Cuenta</h1>
            <p className="text-gray-500 text-sm mb-4">Buscá un cliente para ver el detalle de sus cuentas</p>

            {/* Buscador de cliente */}
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

            {cargando && <p className="text-center text-gray-500 py-8">Cargando cuentas...</p>}

            {!cargando && clienteSeleccionado && (
                <>
                    {/* Recibo — esto es lo que se convierte en imagen */}
                    <div ref={reciboRef} className="bg-white border-2 border-blue-900 rounded-2xl p-5 mb-4">
                        <div className="text-center mb-4 pb-3 border-b-2 border-dashed border-gray-300">
                            <h2 className="text-xl font-bold text-blue-900">PATTY SHOES</h2>
                            <p className="text-xs text-gray-500">Estado de Cuenta</p>
                            <p className="text-xs text-gray-400 mt-1">
                                {new Date().toLocaleDateString('es-PY', { day: '2-digit', month: 'long', year: 'numeric' })}
                            </p>
                        </div>

                        <div className="mb-4">
                            <p className="text-xs text-gray-500">Cliente</p>
                            <p className="font-bold text-gray-900 text-lg">{clienteSeleccionado.nombre}</p>
                        </div>

                        {cuentas.length === 0 ? (
                            <div className="text-center py-6 text-gray-400">
                                <Package size={32} className="mx-auto mb-2" />
                                <p className="text-sm">Este cliente no tiene cuentas registradas</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {cuentas.map((c, i) => (
                                    <div key={c.id} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
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
                                            <span className={`text-sm font-bold ${c.saldo > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                {c.saldo > 0 ? `Debe: Gs ${c.saldo.toLocaleString()}` : 'Saldado'}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="mt-4 pt-3 border-t-2 border-dashed border-gray-300 flex justify-between items-center">
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
                </>
            )}
        </div>
    )
}