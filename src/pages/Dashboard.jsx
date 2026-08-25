import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { User, Download, X, AlertTriangle, ClipboardCopy } from 'lucide-react'
import html2canvas from 'html2canvas'

export default function Dashboard() {
    const [cargando, setCargando] = useState(true)
    const [pagosRecientes, setPagosRecientes] = useState([])
    const [pagoSeleccionado, setPagoSeleccionado] = useState(null)
    const [filtroFecha, setFiltroFecha] = useState('todos') // todos, hoy, semana, mes
    const modalRef = useRef()

    // Alerta de vencidos para la dueña (no se notifica a los clientes)
    const [vencidos, setVencidos] = useState({ cantidad: 0, detalle: [] })
    // Cierre de caja del día
    const [cierreHoy, setCierreHoy] = useState({ total: 0, porMetodo: {} })

    useEffect(() => {
        async function cargarPagosRecientes() {
            let query = supabase
                .from('pagos')
                .select(`*, cliente:clientes(nombre)`)
                .order('fecha_pago', { ascending: false })
                .limit(50)

            const hoy = new Date()
            hoy.setHours(0, 0, 0, 0)

            if (filtroFecha === 'hoy') {
                query = query.gte('fecha_pago', hoy.toISOString())
            } else if (filtroFecha === 'semana') {
                const hace7Dias = new Date(hoy)
                hace7Dias.setDate(hoy.getDate() - 7)
                query = query.gte('fecha_pago', hace7Dias.toISOString())
            } else if (filtroFecha === 'mes') {
                const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
                query = query.gte('fecha_pago', inicioMes.toISOString())
            }

            const { data: pagos } = await query
            setPagosRecientes(pagos || [])
            setCargando(false)
        }

        cargarPagosRecientes()
    }, [filtroFecha])

    useEffect(() => {
        async function cargarAlertas() {
            try {
                // 1. Cuotas vencidas (para la dueña)
                const { data: pedidosCuotas } = await supabase
                    .from('pedidos')
                    .select('id, codigo, saldo, total_venta, num_cuotas, tipo_cuota, fecha_pedido, cliente:clientes(nombre, telefono), pagos(cuota_numero)')
                    .eq('condicion_pago', 'Cuotas')
                    .neq('estado', 'Cancelado')
                    .gt('saldo', 0)

                const intervalos = { '1': 7, '2': 15, '3': 30 }
                const hoy = new Date()
                hoy.setHours(0, 0, 0, 0)

                const detalle = []
                for (const p of pedidosCuotas || []) {
                    const pagadasNums = (p.pagos || []).map(pg => pg.cuota_numero)
                    const dias = intervalos[p.tipo_cuota || '3'] || 30
                    const fechaPedido = new Date(p.fecha_pedido)
                    let vencidas = 0

                    for (let i = 1; i <= (p.num_cuotas || 0); i++) {
                        if (pagadasNums.includes(i)) continue
                        const venc = new Date(fechaPedido)
                        venc.setDate(venc.getDate() + i * dias)
                        venc.setHours(0, 0, 0, 0)
                        if (venc < hoy) vencidas++
                    }

                    if (vencidas > 0) {
                        detalle.push({
                            nombre: p.cliente?.nombre || 'Cliente',
                            telefono: p.cliente?.telefono || '',
                            vencidas,
                            saldo: p.saldo || 0,
                        })
                    }
                }
                setVencidos({
                    cantidad: detalle.reduce((a, d) => a + d.vencidas, 0),
                    detalle: detalle.sort((a, b) => b.vencidas - a.vencidas),
                })

                // 2. Cierre de caja de hoy (por método de pago)
                const fechaHoy = new Date().toISOString().split('T')[0]
                const { data: pagosHoy } = await supabase
                    .from('pagos')
                    .select('monto_pagado, metodo_pago')
                    .eq('fecha_pago', fechaHoy)

                const porMetodo = {}
                let total = 0
                for (const pg of pagosHoy || []) {
                    const monto = Number(pg.monto_pagado) || 0
                    total += monto
                    porMetodo[pg.metodo_pago] = (porMetodo[pg.metodo_pago] || 0) + monto
                }
                setCierreHoy({ total, porMetodo })
            } catch (err) {
                console.error('Error cargando alertas:', err)
            }
        }
        cargarAlertas()
        const interval = setInterval(cargarAlertas, 60000)
        return () => clearInterval(interval)
    }, [])

    async function copiarResumenVencidos() {
        const lineas = [
            `📋 PATTY SHOES - Cobros pendientes (${new Date().toLocaleDateString('es-PY')})`,
            '',
            ...vencidos.detalle.map((d, i) =>
                `${i + 1}. ${d.nombre}${d.telefono ? ` (${d.telefono})` : ''}: ${d.vencidas} cuota${d.vencidas !== 1 ? 's' : ''} vencida${d.vencidas !== 1 ? 's' : ''} • Saldo: Gs ${d.saldo.toLocaleString()}`
            ),
            '',
            `Total vencido: Gs ${vencidos.detalle.reduce((a, d) => a + d.saldo, 0).toLocaleString()}`,
        ]
        const texto = lineas.join('\n')
        try {
            await navigator.clipboard.writeText(texto)
            alert('✅ Resumen copiado. Pegalo donde quieras (WhatsApp, notas, etc.)')
        } catch {
            // Fallback para navegadores sin clipboard API
            const ta = document.createElement('textarea')
            ta.value = texto
            document.body.appendChild(ta)
            ta.select()
            document.execCommand('copy')
            document.body.removeChild(ta)
            alert('✅ Resumen copiado')
        }
    }

    async function descargarPagoImagen(pago) {
        try {
            const element = modalRef.current
            if (!element) return

            const canvas = await html2canvas(element, {
                backgroundColor: '#ffffff',
                scale: 2
            })

            const imagen = canvas.toDataURL('image/png')
            const link = document.createElement('a')
            link.href = imagen
            link.download = `comprobante_${pago.cliente?.nombre || 'cliente'}_${new Date(pago.fecha_pago).toLocaleDateString('es-PY').replace(/\//g, '-')}.png`
            link.click()

            alert('✅ Comprobante guardado como imagen')
        } catch (error) {
            console.error('Error al guardar imagen:', error)
            alert('❌ Error al guardar la imagen')
        }
    }

    async function descargarExcel() {
        try {
            const { data: ventas } = await supabase
                .from('ventas_historicas')
                .select(`
                    id,
                    fecha_venta,
                    total_venta,
                    abono_inicial,
                    saldo,
                    estado,
                    cliente:clientes(nombre),
                    producto:productos(marca, estilo, talla)
                `)
                .order('fecha_venta', { ascending: false })

            if (!ventas || ventas.length === 0) {
                alert('No hay datos para exportar')
                return
            }

            let csvContent = "ID,Fecha,Cliente,Producto,Total,Abono,Saldo,Estado\n"

            ventas.forEach(v => {
                const producto = `${v.producto?.marca || ''} ${v.producto?.estilo || ''} T${v.producto?.talla || ''}`
                const fecha = new Date(v.fecha_venta).toLocaleDateString('es-PY')

                csvContent += `${v.id},"${fecha}","${v.cliente?.nombre || 'N/A'}","${producto}",${v.total_venta},${v.abono_inicial},${v.saldo},"${v.estado}"\n`
            })

            const encodedUri = 'data:text/csv;charset=utf-8,' + encodeURIComponent('\uFEFF' + csvContent)
            const link = document.createElement("a")
            link.setAttribute("href", encodedUri)
            link.setAttribute("download", `reporte_ventas_patty_${new Date().toISOString().split('T')[0]}.csv`)
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)

            alert('✅ Reporte descargado exitosamente')
        } catch (error) {
            console.error('Error al exportar:', error)
            alert('❌ Error al exportar datos')
        }
    }

    if (cargando) {
        return (
            <div className="flex justify-center items-center h-screen pb-16">
                <p className="text-gray-500">Cargando dashboard...</p>
            </div>
        )
    }

    return (
        <div className="p-4 pb-20 max-w-md mx-auto bg-gray-50 min-h-screen">
            {/* Header con Botones Flotantes */}
            <div className="mb-6 relative pt-2">
                <a
                    href="/zona-cliente"
                    className="absolute left-0 top-2 bg-purple-600 hover:bg-purple-700 text-white rounded-full p-2 shadow-lg transition-transform hover:scale-110 z-10"
                    title="Zona del Cliente"
                >
                    <User size={20} />
                </a>

                <h1 className="text-2xl font-bold text-blue-900 text-center pt-8">
                    PATTY SHOES
                </h1>
                <p className="text-center text-gray-500 text-sm mt-1">
                    Sistema de Ventas
                </p>

                <button
                    onClick={descargarExcel}
                    className="absolute right-0 top-2 bg-green-600 hover:bg-green-700 text-white rounded-full p-2 shadow-lg transition-transform hover:scale-110 z-10"
                    title="Descargar Excel"
                >
                    <Download size={20} />
                </button>
            </div>

            {/* Banner de cuotas vencidas (solo para la dueña) */}
            {vencidos.cantidad > 0 && (
                <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 mb-6">
                    <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle size={18} className="text-red-600" />
                        <h3 className="font-bold text-red-700 text-sm">
                            ⏰ {vencidos.cantidad} cuota{vencidos.cantidad !== 1 ? 's' : ''} vencida{vencidos.cantidad !== 1 ? 's' : ''} de {vencidos.detalle.length} cliente{vencidos.detalle.length !== 1 ? 's' : ''}
                        </h3>
                    </div>
                    <div className="space-y-1 mb-3 max-h-32 overflow-y-auto">
                        {vencidos.detalle.slice(0, 5).map((d, i) => (
                            <p key={i} className="text-xs text-red-600">
                                • <span className="font-semibold">{d.nombre}</span>: {d.vencidas} vencida{d.vencidas !== 1 ? 's' : ''} — Gs {d.saldo.toLocaleString()}
                            </p>
                        ))}
                        {vencidos.detalle.length > 5 && (
                            <p className="text-xs text-red-400 italic">...y {vencidos.detalle.length - 5} más</p>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <a
                            href="/cobrar-cuota"
                            className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2.5 px-3 rounded-lg text-center"
                        >
                            Ir a Cobrar
                        </a>
                        <button
                            onClick={copiarResumenVencidos}
                            className="flex-1 bg-white border border-red-300 text-red-700 hover:bg-red-100 text-xs font-bold py-2.5 px-3 rounded-lg flex items-center justify-center gap-1"
                        >
                            <ClipboardCopy size={13} /> Copiar resumen
                        </button>
                    </div>
                </div>
            )}

            {/* Cierre de caja del día */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 flex items-center justify-between">
                <div>
                    <p className="text-xs text-blue-600 font-bold uppercase">💰 Cierre de hoy</p>
                    <p className="text-xl font-bold text-blue-900">Gs {cierreHoy.total.toLocaleString()}</p>
                    {Object.keys(cierreHoy.porMetodo).length > 0 && (
                        <p className="text-[10px] text-gray-500 mt-0.5">
                            {Object.entries(cierreHoy.porMetodo).map(([m, t]) => `${m}: Gs ${t.toLocaleString()}`).join(' • ')}
                        </p>
                    )}
                </div>
            </div>

            {/* Acciones Rápidas */}
            <h2 className="text-lg font-bold text-gray-800 mb-3">
                Acciones Rápidas
            </h2>
            <div className="space-y-3 mb-6">
                <a
                    href="/nueva-venta"
                    className="block bg-blue-900 text-white rounded-xl p-4 shadow-md text-center font-bold text-lg hover:bg-blue-800 transition-colors"
                >
                    📝 Registrar Nuevo Pedido
                </a>
                <div className="grid grid-cols-2 gap-3">
                    <a
                        href="/cobrar-cuota"
                        className="block bg-green-600 text-white rounded-xl p-4 shadow-md text-center font-bold hover:bg-green-500 transition-colors"
                    >
                        💰 Cobrar Cuota
                    </a>
                    <a
                        href="/estado-cuenta"
                        className="block bg-amber-600 text-white rounded-xl p-4 shadow-md text-center font-bold hover:bg-amber-500 transition-colors"
                    >
                        🧾 Estado de Cuenta
                    </a>
                </div>
            </div>

            {/* Historial de Pagos Recientes con Filtros */}
            <div className="flex justify-between items-center mb-3">
                <h2 className="text-lg font-bold text-gray-800">
                    📋 Pagos Recientes
                </h2>
                <div className="flex gap-1">
                    {[
                        { id: 'todos', label: 'Todos' },
                        { id: 'hoy', label: 'Hoy' },
                        { id: 'semana', label: 'Semana' },
                        { id: 'mes', label: 'Mes' }
                    ].map(f => (
                        <button
                            key={f.id}
                            onClick={() => setFiltroFecha(f.id)}
                            className={`text-[10px] px-2 py-1 rounded-full font-bold ${filtroFecha === f.id
                                    ? 'bg-blue-900 text-white'
                                    : 'bg-gray-200 text-gray-600'
                                }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
                <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b sticky top-0">
                            <tr>
                                <th className="text-left p-3 font-semibold text-gray-700">Fecha</th>
                                <th className="text-left p-3 font-semibold text-gray-700">Cliente</th>
                                <th className="text-right p-3 font-semibold text-gray-700">Monto</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pagosRecientes.length === 0 ? (
                                <tr>
                                    <td colSpan={3} className="text-center p-4 text-gray-500">
                                        No hay pagos en este período
                                    </td>
                                </tr>
                            ) : (
                                pagosRecientes.map((pago) => (
                                    <tr
                                        key={pago.id}
                                        className="border-b hover:bg-blue-50 cursor-pointer transition-colors"
                                        onClick={() => setPagoSeleccionado(pago)}
                                    >
                                        <td className="p-3 text-gray-600 text-xs">
                                            {new Date(pago.fecha_pago).toLocaleDateString('es-PY')}
                                        </td>
                                        <td className="p-3 font-medium text-gray-900 text-xs">
                                            {pago.cliente?.nombre || 'Cliente'}
                                        </td>
                                        <td className="p-3 text-right font-bold text-green-600 text-xs">
                                            {pago.monto_pagado?.toLocaleString()}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal Comprobante */}
            {pagoSeleccionado && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-sm relative shadow-2xl">
                        <button
                            onClick={() => setPagoSeleccionado(null)}
                            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                        >
                            <X size={24} />
                        </button>

                        <div ref={modalRef} className="space-y-4 border-2 border-dashed border-gray-200 p-4 rounded-lg bg-white">
                            <div className="text-center border-b pb-4">
                                <h3 className="text-xl font-bold text-blue-900">📋 Comprobante de Pago</h3>
                                <p className="text-xs text-gray-500 mt-1">Patty Shoes - Sistema de Ventas</p>
                                <p className="text-xs text-gray-400">{new Date().toLocaleDateString('es-PY')}</p>
                            </div>

                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Cliente:</span>
                                    <span className="font-bold">{pagoSeleccionado.cliente?.nombre || 'N/A'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Fecha:</span>
                                    <span className="font-bold">{new Date(pagoSeleccionado.fecha_pago).toLocaleDateString('es-PY')}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Método:</span>
                                    <span className="font-bold">{pagoSeleccionado.metodo_pago}</span>
                                </div>
                                {pagoSeleccionado.referencia && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Ref:</span>
                                        <span className="font-bold">{pagoSeleccionado.referencia}</span>
                                    </div>
                                )}
                                <div className="border-t pt-3 mt-2">
                                    <div className="flex justify-between items-center">
                                        <span className="font-bold text-gray-700">Total Pagado:</span>
                                        <span className="text-xl font-bold text-green-600">Gs {pagoSeleccionado.monto_pagado?.toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="text-center text-[10px] text-gray-400 pt-2">
                                <p>Gracias por su compra</p>
                            </div>
                        </div>

                        <button
                            onClick={() => descargarPagoImagen(pagoSeleccionado)}
                            className="w-full mt-4 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
                        >
                            <Download size={18} />
                            Guardar como Imagen
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}