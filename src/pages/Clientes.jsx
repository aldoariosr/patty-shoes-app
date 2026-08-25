import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Search, Plus, X, Star, MessageCircle, FileText, Pencil } from 'lucide-react'

export default function Clientes() {
    const navigate = useNavigate()
    const [clientes, setClientes] = useState([])
    const [cargando, setCargando] = useState(true)
    const [buscar, setBuscar] = useState('')
    const [orden, setOrden] = useState('nombre') // nombre, deuda, calificacion

    const [modalAbierto, setModalAbierto] = useState(false)
    const [clienteEditando, setClienteEditando] = useState(null)
    const [form, setForm] = useState({ nombre: '', telefono: '', direccion: '', ciudad: '', instagram: '', es_compania_municipalidad: false, notas: '' })
    const [guardando, setGuardando] = useState(false)

    useEffect(() => {
        cargarClientes()
    }, [])

    async function cargarClientes() {
        setCargando(true)
        const { data, error } = await supabase
            .from('clientes_resumen')
            .select('*')
            .order('nombre')
        if (!error) setClientes(data || [])
        setCargando(false)
    }

    const clientesFiltrados = clientes
        .filter(c =>
            c.nombre?.toLowerCase().includes(buscar.toLowerCase()) ||
            c.telefono?.includes(buscar) ||
            c.codigo?.toLowerCase().includes(buscar.toLowerCase())
        )
        .sort((a, b) => {
            if (orden === 'deuda') return (b.deuda_total || 0) - (a.deuda_total || 0)
            if (orden === 'calificacion') return (b.calificacion_promedio || 0) - (a.calificacion_promedio || 0)
            return a.nombre.localeCompare(b.nombre)
        })

    function abrirNuevo() {
        setClienteEditando(null)
        setForm({ nombre: '', telefono: '', direccion: '', ciudad: '', instagram: '', es_compania_municipalidad: false, notas: '' })
        setModalAbierto(true)
    }

    function abrirEditar(cliente) {
        setClienteEditando(cliente)
        setForm({
            nombre: cliente.nombre || '',
            telefono: cliente.telefono || '',
            direccion: cliente.direccion || '',
            ciudad: cliente.ciudad || '',
            instagram: cliente.instagram || '',
            es_compania_municipalidad: cliente.es_compania_municipalidad || false,
            notas: cliente.notas || '',
        })
        setModalAbierto(true)
    }

    async function guardarCliente(e) {
        e.preventDefault()
        if (!form.nombre.trim()) return
        setGuardando(true)

        if (clienteEditando) {
            const { error } = await supabase.from('clientes').update(form).eq('id', clienteEditando.id)
            if (error) {
                alert('❌ Error al guardar los cambios: ' + error.message)
                setGuardando(false)
                return
            }
        } else {
            const codigo = 'CLI-' + Date.now().toString(36).toUpperCase()
            const { error } = await supabase.from('clientes').insert([{ ...form, codigo }])
            if (error) {
                alert('❌ Error al crear el cliente: ' + error.message)
                setGuardando(false)
                return
            }
        }

        setGuardando(false)
        setModalAbierto(false)
        cargarClientes()
    }

    function linkWhatsapp(telefono) {
        const limpio = telefono.replace(/\D/g, '')
        return `https://wa.me/${limpio}`
    }

    if (cargando) {
        return (
            <div className="flex justify-center items-center h-screen pb-16">
                <p className="text-gray-500">Cargando clientes...</p>
            </div>
        )
    }

    return (
        <div className="p-4 pb-24 max-w-md mx-auto">
            <button onClick={() => navigate('/')} className="flex items-center text-blue-900 font-bold mb-4">
                <ArrowLeft size={20} className="mr-1" /> Volver
            </button>

            <div className="flex justify-between items-center mb-1">
                <h1 className="text-2xl font-bold text-blue-900">👥 Clientes</h1>
                <button
                    onClick={abrirNuevo}
                    className="bg-blue-900 text-white rounded-lg p-2 flex items-center gap-1 text-xs font-bold"
                >
                    <Plus size={16} /> Nuevo
                </button>
            </div>
            <p className="text-gray-500 text-sm mb-4">{clientes.length} clientes registrados</p>

            {/* Buscador */}
            <div className="relative mb-3">
                <Search size={16} className="absolute left-3 top-3.5 text-gray-400" />
                <input
                    type="text"
                    placeholder="Buscar por nombre, teléfono o código..."
                    value={buscar}
                    onChange={(e) => setBuscar(e.target.value)}
                    className="w-full p-3 pl-9 border rounded-lg text-sm"
                />
            </div>

            {/* Orden */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
                {[
                    { key: 'nombre', label: 'A-Z' },
                    { key: 'deuda', label: 'Mayor deuda' },
                    { key: 'calificacion', label: 'Mejor calificación' },
                ].map(o => (
                    <button
                        key={o.key}
                        onClick={() => setOrden(o.key)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${orden === o.key ? 'bg-blue-900 text-white' : 'bg-gray-100 text-gray-600'
                            }`}
                    >
                        {o.label}
                    </button>
                ))}
            </div>

            {/* Lista */}
            <div className="space-y-2">
                {clientesFiltrados.length === 0 && (
                    <div className="text-center py-8 text-gray-500 text-sm">No se encontraron clientes</div>
                )}

                {clientesFiltrados.map((c) => (
                    <div key={c.id} className="bg-white border rounded-xl p-3 shadow-sm">
                        <div className="flex justify-between items-start">
                            <div className="flex-1" onClick={() => abrirEditar(c)}>
                                <div className="flex items-center gap-2">
                                    <p className="font-bold text-gray-900 text-sm">{c.nombre}</p>
                                    {c.es_compania_municipalidad && (
                                        <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-bold">MUNI</span>
                                    )}
                                </div>
                                {c.telefono && <p className="text-xs text-gray-500">{c.telefono}</p>}
                                {c.calificacion_promedio && (
                                    <div className="flex items-center gap-0.5 mt-1">
                                        <Star size={12} className="text-amber-500 fill-amber-500" />
                                        <span className="text-xs font-semibold text-gray-600">{c.calificacion_promedio}</span>
                                        <span className="text-[10px] text-gray-400">({c.calificaciones_cantidad ?? 0})</span>
                                    </div>
                                )}
                            </div>
                            <div className="text-right">
                                {c.deuda_total > 0 ? (
                                    <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded-full">
                                        Debe Gs {c.deuda_total.toLocaleString()}
                                    </span>
                                ) : (
                                    <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full">Al día</span>
                                )}
                            </div>
                        </div>

                        <div className="flex gap-2 mt-2 pt-2 border-t border-gray-100">
                            {c.telefono && (
                                <a
                                    href={linkWhatsapp(c.telefono)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex-1 flex items-center justify-center gap-1 bg-green-50 text-green-700 text-xs font-bold py-1.5 rounded-lg"
                                >
                                    <MessageCircle size={13} /> WhatsApp
                                </a>
                            )}
                            <button
                                onClick={() => navigate(`/estado-cuenta?cliente=${c.id}`)}
                                className="flex-1 flex items-center justify-center gap-1 bg-amber-50 text-amber-700 text-xs font-bold py-1.5 rounded-lg"
                            >
                                <FileText size={13} /> Estado Cuenta
                            </button>
                            <button
                                onClick={() => abrirEditar(c)}
                                className="flex items-center justify-center gap-1 bg-gray-50 text-gray-600 text-xs font-bold py-1.5 px-3 rounded-lg"
                            >
                                <Pencil size={13} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Modal crear/editar */}
            {modalAbierto && (
                <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50">
                    <div className="bg-white rounded-t-2xl p-4 w-full max-w-md max-h-[85vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="font-bold text-blue-900">
                                {clienteEditando ? 'Editar Cliente' : 'Nuevo Cliente'}
                            </h3>
                            <button onClick={() => setModalAbierto(false)}>
                                <X size={20} className="text-gray-400" />
                            </button>
                        </div>

                        <form onSubmit={guardarCliente} className="space-y-3">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Nombre *</label>
                                <input
                                    type="text"
                                    required
                                    value={form.nombre}
                                    onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                                    className="w-full p-2.5 border rounded-lg text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Teléfono</label>
                                <input
                                    type="text"
                                    value={form.telefono}
                                    onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                                    className="w-full p-2.5 border rounded-lg text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Dirección</label>
                                <input
                                    type="text"
                                    value={form.direccion}
                                    onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                                    className="w-full p-2.5 border rounded-lg text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Ciudad</label>
                                <input
                                    type="text"
                                    value={form.ciudad}
                                    onChange={(e) => setForm({ ...form, ciudad: e.target.value })}
                                    className="w-full p-2.5 border rounded-lg text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Instagram</label>
                                <input
                                    type="text"
                                    value={form.instagram}
                                    onChange={(e) => setForm({ ...form, instagram: e.target.value })}
                                    className="w-full p-2.5 border rounded-lg text-sm"
                                />
                            </div>
                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={form.es_compania_municipalidad}
                                    onChange={(e) => setForm({ ...form, es_compania_municipalidad: e.target.checked })}
                                />
                                Compañero/a de la municipalidad
                            </label>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Notas</label>
                                <textarea
                                    value={form.notas}
                                    onChange={(e) => setForm({ ...form, notas: e.target.value })}
                                    className="w-full p-2.5 border rounded-lg text-sm"
                                    rows="2"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={guardando}
                                className="w-full bg-blue-900 text-white font-bold py-3 rounded-xl shadow-md disabled:opacity-50"
                            >
                                {guardando ? 'Guardando...' : clienteEditando ? 'Guardar cambios' : 'Crear cliente'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
