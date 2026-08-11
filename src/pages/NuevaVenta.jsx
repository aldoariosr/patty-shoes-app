import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, X, Search } from 'lucide-react'

export default function NuevaVenta() {
    const navigate = useNavigate()
    const [clientes, setClientes] = useState([])
    const [productos, setProductos] = useState([])
    const [guardando, setGuardando] = useState(false)

    const [buscarCliente, setBuscarCliente] = useState('')
    const [buscarProducto, setBuscarProducto] = useState('')
    const [mostrarClientes, setMostrarClientes] = useState(false)
    const [mostrarProductos, setMostrarProductos] = useState(false)

    const [modalCliente, setModalCliente] = useState(false)
    const [modalProducto, setModalProducto] = useState(false)
    const [nuevoCliente, setNuevoCliente] = useState({ codigo: '', nombre: '', telefono: '', direccion: '', ciudad: '' })
    const [nuevoProducto, setNuevoProducto] = useState({ codigo: '', marca: '', estilo: '', talla: '', color: '', precio_venta: '', stock: '' })

    const [form, setForm] = useState({
        codigo: '',
        cliente_id: '',
        cliente_nombre: '',
        producto_id: '',
        producto_nombre: '',
        cantidad: 1,
        precio_venta: '',
        condicion_pago: 'Contado',
        tipo_cuota: '3',
        num_cuotas: 1,
        abono_inicial: 0,
        metodo_pago: 'Efectivo',
        referencia_pago: '',
        tipo_envio: 'Retira en Local',
        direccion_envio: '',
        estado: 'Pendiente',
        notas: '',
    })

    const calcularCuota = () => {
        const total = Number(form.precio_venta) * Number(form.cantidad)
        const saldo = total - Number(form.abono_inicial)
        if (saldo > 0 && form.num_cuotas > 0) return Math.ceil(saldo / form.num_cuotas)
        return 0
    }

    const tiposCuota = [
        { value: '1', label: '1 - Semanal' },
        { value: '2', label: '2 - Quincenal' },
        { value: '3', label: '3 - Mensual' },
    ]

    const metodosPago = [
        { value: 'Efectivo', label: '💵 Efectivo' },
        { value: 'Transferencia', label: '🏦 Transferencia Bancaria' },
        { value: 'Giros', label: '📲 Giros (Tigo/Claro)' },
        { value: 'Tarjeta', label: '💳 Tarjeta de Crédito/Débito' },
    ]

    useEffect(() => {
        async function cargarDatos() {
            const { data: c } = await supabase.from('clientes').select('*').order('nombre')
            const { data: p } = await supabase.from('productos').select('*').eq('activo', true).order('marca')
            setClientes(c || [])
            setProductos(p || [])

            const { count } = await supabase.from('pedidos').select('*', { count: 'exact', head: true })
            setForm((f) => ({ ...f, codigo: `PED-${String((count || 0) + 1).padStart(3, '0')}` }))
        }
        cargarDatos()
    }, [])

    const clientesFiltrados = clientes.filter(c =>
        c.nombre.toLowerCase().includes(buscarCliente.toLowerCase()) ||
        c.telefono?.includes(buscarCliente) ||
        c.codigo?.toLowerCase().includes(buscarCliente.toLowerCase())
    )

    const productosFiltrados = productos.filter(p =>
        p.marca.toLowerCase().includes(buscarProducto.toLowerCase()) ||
        p.estilo.toLowerCase().includes(buscarProducto.toLowerCase()) ||
        p.codigo?.toLowerCase().includes(buscarProducto.toLowerCase()) ||
        p.talla?.includes(buscarProducto)
    )

    async function guardarPedido(e) {
        e.preventDefault()
        if (!form.cliente_id || !form.producto_id) {
            alert('Seleccioná un cliente y un producto')
            return
        }
        setGuardando(true)

        const totalVenta = Number(form.precio_venta) * Number(form.cantidad)
        const abono = form.condicion_pago === 'Contado' ? totalVenta : Number(form.abono_inicial)

        // 1. Insertar pedido
        const { data: pedidoData, error: errorPedido } = await supabase.from('pedidos').insert([
            {
                codigo: form.codigo,
                cliente_id: form.cliente_id,
                producto_id: form.producto_id,
                cantidad: Number(form.cantidad),
                precio_venta: Number(form.precio_venta),
                condicion_pago: form.condicion_pago,
                tipo_cuota: form.tipo_cuota,
                num_cuotas: Number(form.num_cuotas),
                abono_inicial: abono,
                tipo_envio: form.tipo_envio,
                direccion_envio: form.direccion_envio,
                estado: form.condicion_pago === 'Contado' ? 'Pagado' : 'Pendiente',
                notas: form.notas,
            },
        ]).select()

        if (errorPedido || !pedidoData) {
            alert('❌ Error al guardar pedido: ' + errorPedido?.message)
            setGuardando(false)
            return
        }

        const pedidoCreado = pedidoData[0]

        // 2. Registrar el pago (contado = pago total, cuotas = pago del abono inicial)
        const { error: errorPago } = await supabase.from('pagos').insert([{
            codigo: `PAG-${Date.now()}`,
            pedido_id: pedidoCreado.id,
            cliente_id: form.cliente_id,
            cuota_numero: 1,
            total_cuotas: form.condicion_pago === 'Contado' ? 1 : Number(form.num_cuotas),
            monto_cuota: abono,
            monto_pagado: abono,
            metodo_pago: form.metodo_pago,
            referencia: form.referencia_pago,
            fecha_pago: new Date().toISOString().split('T')[0],
            estado: 'Confirmado',
            notas: form.condicion_pago === 'Contado' ? 'Pago al contado' : `Abono inicial - ${form.num_cuotas} cuotas`,
        }])

        if (errorPago) {
            console.error('Error al registrar pago:', errorPago)
        }

        // 3. Actualizar stock
        const producto = productos.find((p) => p.id === form.producto_id)
        if (producto) {
            await supabase.from('productos').update({ stock: producto.stock - Number(form.cantidad) }).eq('id', form.producto_id)
        }

        alert(form.condicion_pago === 'Contado'
            ? '✅ Venta de contado guardada exitosamente!'
            : '✅ Pedido a cuotas guardado exitosamente!')
        navigate('/')
        setGuardando(false)
    }

    async function crearCliente(e) {
        e.preventDefault()
        const { data, error } = await supabase.from('clientes').insert([{
            codigo: nuevoCliente.codigo || `CLI-${Date.now()}`,
            nombre: nuevoCliente.nombre,
            telefono: nuevoCliente.telefono,
            direccion: nuevoCliente.direccion,
            ciudad: nuevoCliente.ciudad,
        }]).select()

        if (!error && data) {
            setClientes([...clientes, data[0]])
            setForm({ ...form, cliente_id: data[0].id, cliente_nombre: data[0].nombre })
            setBuscarCliente(data[0].nombre)
            setModalCliente(false)
            setNuevoCliente({ codigo: '', nombre: '', telefono: '', direccion: '', ciudad: '' })
        } else {
            alert('Error al crear cliente: ' + error?.message)
        }
    }

    async function crearProducto(e) {
        e.preventDefault()
        const { data, error } = await supabase.from('productos').insert([{
            codigo: nuevoProducto.codigo || `PRD-${Date.now()}`,
            marca: nuevoProducto.marca,
            estilo: nuevoProducto.estilo,
            talla: nuevoProducto.talla,
            color: nuevoProducto.color,
            precio_venta: Number(nuevoProducto.precio_venta),
            stock: Number(nuevoProducto.stock),
            activo: true,
        }]).select()

        if (!error && data) {
            setProductos([...productos, data[0]])
            setForm({ ...form, producto_id: data[0].id, producto_nombre: `${data[0].marca} ${data[0].estilo}`, precio_venta: data[0].precio_venta })
            setBuscarProducto(`${data[0].marca} ${data[0].estilo}`)
            setModalProducto(false)
            setNuevoProducto({ codigo: '', marca: '', estilo: '', talla: '', color: '', precio_venta: '', stock: '' })
        } else {
            alert('Error al crear producto: ' + error?.message)
        }
    }

    const totalVenta = Number(form.precio_venta) * Number(form.cantidad)
    const valorCuota = calcularCuota()
    const saldoPendiente = totalVenta - Number(form.abono_inicial)

    return (
        <div className="p-4 pb-24 max-w-md mx-auto">
            <button onClick={() => navigate('/')} className="flex items-center text-blue-900 font-bold mb-4">
                <ArrowLeft size={20} className="mr-1" /> Volver
            </button>

            <h1 className="text-2xl font-bold text-blue-900 mb-6">Nueva Venta</h1>

            <form onSubmit={guardarPedido} className="space-y-4">

                {/* ID PEDIDO */}
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">ID Pedido</label>
                    <input type="text" value={form.codigo} readOnly className="w-full p-3 border rounded-lg bg-gray-100 text-gray-600" />
                </div>

                {/* CLIENTE */}
                <div className="relative">
                    <label className="block text-sm font-bold text-gray-700 mb-1">Cliente *</label>
                    <div className="flex gap-2">
                        <div className="flex-1 relative">
                            <div className="relative">
                                <Search size={16} className="absolute left-3 top-3.5 text-gray-400" />
                                <input type="text" placeholder="Escribí nombre, teléfono o código..." value={buscarCliente}
                                    onChange={(e) => { setBuscarCliente(e.target.value); setMostrarClientes(true) }}
                                    onFocus={() => setMostrarClientes(true)} className="w-full p-3 pl-9 border rounded-lg text-sm" />
                            </div>
                            {mostrarClientes && buscarCliente && (
                                <div className="absolute z-20 w-full bg-white border rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                                    {clientesFiltrados.length === 0 ? (
                                        <div className="p-3 text-sm text-gray-500">No se encontraron clientes</div>
                                    ) : (
                                        clientesFiltrados.map((c) => (
                                            <div key={c.id} onClick={() => {
                                                setForm({ ...form, cliente_id: c.id, cliente_nombre: c.nombre })
                                                setBuscarCliente(c.nombre); setMostrarClientes(false)
                                            }} className="p-3 hover:bg-blue-50 cursor-pointer border-b last:border-b-0 text-sm">
                                                <span className="font-semibold">{c.nombre}</span>
                                                <span className="text-gray-500 ml-2 text-xs">{c.telefono} • {c.ciudad}</span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                        <button type="button" onClick={() => setModalCliente(true)} className="w-11 h-11 bg-blue-900 text-white rounded-lg flex items-center justify-center hover:bg-blue-800">
                            <Plus size={20} />
                        </button>
                    </div>
                    {form.cliente_nombre && (
                        <div className="mt-1 flex items-center gap-1 text-sm text-green-700 bg-green-50 px-2 py-1 rounded">
                            ✅ {form.cliente_nombre}
                            <button type="button" onClick={() => { setForm({ ...form, cliente_id: '', cliente_nombre: '' }); setBuscarCliente('') }} className="ml-auto text-red-500"><X size={14} /></button>
                        </div>
                    )}
                </div>

                {/* PRODUCTO */}
                <div className="relative">
                    <label className="block text-sm font-bold text-gray-700 mb-1">Producto *</label>
                    <div className="flex gap-2">
                        <div className="flex-1 relative">
                            <div className="relative">
                                <Search size={16} className="absolute left-3 top-3.5 text-gray-400" />
                                <input type="text" placeholder="Escribí marca, estilo o talla..." value={buscarProducto}
                                    onChange={(e) => { setBuscarProducto(e.target.value); setMostrarProductos(true) }}
                                    onFocus={() => setMostrarProductos(true)} className="w-full p-3 pl-9 border rounded-lg text-sm" />
                            </div>
                            {mostrarProductos && buscarProducto && (
                                <div className="absolute z-20 w-full bg-white border rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                                    {productosFiltrados.length === 0 ? (
                                        <div className="p-3 text-sm text-gray-500">No se encontraron productos</div>
                                    ) : (
                                        productosFiltrados.map((p) => (
                                            <div key={p.id} onClick={() => {
                                                setForm({ ...form, producto_id: p.id, producto_nombre: `${p.marca} ${p.estilo}`, precio_venta: p.precio_venta })
                                                setBuscarProducto(`${p.marca} ${p.estilo} - Talla ${p.talla}`); setMostrarProductos(false)
                                            }} className={`p-3 hover:bg-blue-50 cursor-pointer border-b last:border-b-0 text-sm ${p.stock <= 0 ? 'opacity-50' : ''}`}>
                                                <span className="font-semibold">{p.marca} {p.estilo}</span>
                                                <span className="text-gray-500 ml-2 text-xs">Talla {p.talla} • Gs {p.precio_venta?.toLocaleString()} • Stock: {p.stock}</span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                        <button type="button" onClick={() => setModalProducto(true)} className="w-11 h-11 bg-blue-900 text-white rounded-lg flex items-center justify-center hover:bg-blue-800">
                            <Plus size={20} />
                        </button>
                    </div>
                    {form.producto_nombre && (
                        <div className="mt-1 flex items-center gap-1 text-sm text-green-700 bg-green-50 px-2 py-1 rounded">
                            ✅ {form.producto_nombre}
                            <button type="button" onClick={() => { setForm({ ...form, producto_id: '', producto_nombre: '', precio_venta: '' }); setBuscarProducto('') }} className="ml-auto text-red-500"><X size={14} /></button>
                        </div>
                    )}
                </div>

                {/* PRECIO Y CANTIDAD */}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Precio Venta (Gs)</label>
                        <input type="number" required value={form.precio_venta} onChange={(e) => setForm({ ...form, precio_venta: e.target.value })} className="w-full p-3 border rounded-lg" />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Cantidad</label>
                        <input type="number" min="1" value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} className="w-full p-3 border rounded-lg" />
                    </div>
                </div>

                {/* TOTAL */}
                <div className="bg-blue-900 text-white rounded-xl p-4 text-center">
                    <p className="text-xs opacity-80">TOTAL A PAGAR</p>
                    <p className="text-2xl font-bold">Gs {totalVenta.toLocaleString()}</p>
                </div>

                {/* CONDICIÓN DE PAGO */}
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Condición de Pago</label>
                    <select value={form.condicion_pago} onChange={(e) => setForm({ ...form, condicion_pago: e.target.value })} className="w-full p-3 border rounded-lg bg-white">
                        <option value="Contado">Contado</option>
                        <option value="Cuotas">Cuotas</option>
                    </select>
                </div>

                {/* MÉTODO DE PAGO (siempre visible) */}
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                    <h4 className="text-sm font-bold text-amber-900 flex items-center gap-1">💳 Método de Pago</h4>
                    <select value={form.metodo_pago} onChange={(e) => setForm({ ...form, metodo_pago: e.target.value })} className="w-full p-3 border border-amber-300 rounded-lg bg-white text-sm">
                        {metodosPago.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                    <div>
                        <label className="block text-xs font-bold text-amber-900 mb-1">Referencia / N° Comprobante</label>
                        <input type="text" placeholder="Ej: Transferencia #12345" value={form.referencia_pago}
                            onChange={(e) => setForm({ ...form, referencia_pago: e.target.value })} className="w-full p-3 border border-amber-300 rounded-lg text-sm" />
                    </div>
                </div>

                {/* CUOTAS */}
                {form.condicion_pago === 'Cuotas' && (
                    <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 space-y-3">
                        <div>
                            <label className="block text-sm font-bold text-blue-900 mb-1">Tipo de Cuota *</label>
                            <select value={form.tipo_cuota} onChange={(e) => setForm({ ...form, tipo_cuota: e.target.value })} className="w-full p-3 border border-blue-300 rounded-lg bg-white">
                                {tiposCuota.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-sm font-bold text-blue-900 mb-1">N° Cuotas</label>
                                <input type="number" min="1" value={form.num_cuotas} onChange={(e) => setForm({ ...form, num_cuotas: e.target.value })} className="w-full p-3 border border-blue-300 rounded-lg" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-blue-900 mb-1">Abono Inicial (Gs)</label>
                                <input type="number" min="0" value={form.abono_inicial} onChange={(e) => setForm({ ...form, abono_inicial: e.target.value })} className="w-full p-3 border border-blue-300 rounded-lg" />
                            </div>
                        </div>
                        {valorCuota > 0 && (
                            <div className="bg-white rounded-lg p-3 text-center border border-blue-200">
                                <p className="text-sm text-blue-900 font-semibold">
                                    💰 Cada cuota {tiposCuota.find(t => t.value === form.tipo_cuota)?.label.split(' - ')[1].toLowerCase()}: <span className="text-lg font-bold">Gs {valorCuota.toLocaleString()}</span>
                                </p>
                                <p className="text-xs text-gray-500 mt-1">(Gs {saldoPendiente.toLocaleString()} ÷ {form.num_cuotas} cuotas)</p>
                            </div>
                        )}
                    </div>
                )}

                {/* ENVÍO */}
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Tipo de Envío</label>
                    <select value={form.tipo_envio} onChange={(e) => setForm({ ...form, tipo_envio: e.target.value })} className="w-full p-3 border rounded-lg bg-white">
                        <option value="Retira en Local">Retira en Local</option>
                        <option value="Envio (Domicilio)">Envío a Domicilio</option>
                        <option value="Delivery">Delivery</option>
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Dirección de Envío</label>
                    <input type="text" value={form.direccion_envio} onChange={(e) => setForm({ ...form, direccion_envio: e.target.value })} className="w-full p-3 border rounded-lg" placeholder="Dirección completa" />
                </div>

                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Notas</label>
                    <textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} className="w-full p-3 border rounded-lg" rows="2" />
                </div>

                <button type="submit" disabled={guardando} className="w-full bg-green-600 text-white font-bold py-4 rounded-xl shadow-lg disabled:opacity-50 text-lg">
                    {guardando ? 'Guardando...' : '✅ Guardar Pedido'}
                </button>
            </form>

            {/* MODAL NUEVO CLIENTE */}
            {modalCliente && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-3">
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-bold text-blue-900">➕ Nuevo Cliente</h3>
                            <button onClick={() => setModalCliente(false)}><X size={20} className="text-gray-500" /></button>
                        </div>
                        <form onSubmit={crearCliente} className="space-y-3">
                            <input placeholder="Nombre completo *" required value={nuevoCliente.nombre} onChange={e => setNuevoCliente({ ...nuevoCliente, nombre: e.target.value })} className="w-full p-3 border rounded-lg" />
                            <input placeholder="Teléfono" value={nuevoCliente.telefono} onChange={e => setNuevoCliente({ ...nuevoCliente, telefono: e.target.value })} className="w-full p-3 border rounded-lg" />
                            <input placeholder="Dirección" value={nuevoCliente.direccion} onChange={e => setNuevoCliente({ ...nuevoCliente, direccion: e.target.value })} className="w-full p-3 border rounded-lg" />
                            <input placeholder="Ciudad" value={nuevoCliente.ciudad} onChange={e => setNuevoCliente({ ...nuevoCliente, ciudad: e.target.value })} className="w-full p-3 border rounded-lg" />
                            <button type="submit" className="w-full bg-blue-900 text-white font-bold py-3 rounded-xl">Guardar Cliente</button>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL NUEVO PRODUCTO */}
            {modalProducto && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-3">
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-bold text-blue-900">➕ Nuevo Producto</h3>
                            <button onClick={() => setModalProducto(false)}><X size={20} className="text-gray-500" /></button>
                        </div>
                        <form onSubmit={crearProducto} className="space-y-3">
                            <input placeholder="Marca *" required value={nuevoProducto.marca} onChange={e => setNuevoProducto({ ...nuevoProducto, marca: e.target.value })} className="w-full p-3 border rounded-lg" />
                            <input placeholder="Estilo *" required value={nuevoProducto.estilo} onChange={e => setNuevoProducto({ ...nuevoProducto, estilo: e.target.value })} className="w-full p-3 border rounded-lg" />
                            <input placeholder="Talla" value={nuevoProducto.talla} onChange={e => setNuevoProducto({ ...nuevoProducto, talla: e.target.value })} className="w-full p-3 border rounded-lg" />
                            <input placeholder="Color" value={nuevoProducto.color} onChange={e => setNuevoProducto({ ...nuevoProducto, color: e.target.value })} className="w-full p-3 border rounded-lg" />
                            <div className="grid grid-cols-2 gap-3">
                                <input placeholder="Precio Venta *" required type="number" value={nuevoProducto.precio_venta} onChange={e => setNuevoProducto({ ...nuevoProducto, precio_venta: e.target.value })} className="w-full p-3 border rounded-lg" />
                                <input placeholder="Stock *" required type="number" value={nuevoProducto.stock} onChange={e => setNuevoProducto({ ...nuevoProducto, stock: e.target.value })} className="w-full p-3 border rounded-lg" />
                            </div>
                            <button type="submit" className="w-full bg-blue-900 text-white font-bold py-3 rounded-xl">Guardar Producto</button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}