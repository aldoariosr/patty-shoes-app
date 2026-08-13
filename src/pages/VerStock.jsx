import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Search, Plus, Minus, Package, AlertTriangle, Pencil, X, Check } from 'lucide-react'

export default function VerStock() {
    const navigate = useNavigate()
    const [productos, setProductos] = useState([])
    const [cargando, setCargando] = useState(true)
    const [buscar, setBuscar] = useState('')
    const [filtroStock, setFiltroStock] = useState('todos') // todos, bajo, agotado
    const [editando, setEditando] = useState(null)
    const [nuevoStock, setNuevoStock] = useState('')

    useEffect(() => {
        cargarProductos()
    }, [])

    async function cargarProductos() {
        setCargando(true)
        const { data, error } = await supabase
            .from('productos')
            .select('*')
            .eq('activo', true)
            .order('stock', { ascending: true })

        if (!error) setProductos(data || [])
        setCargando(false)
    }

    async function actualizarStock(productoId, cantidad) {
        const producto = productos.find(p => p.id === productoId)
        if (!producto) return

        const stockNuevo = Math.max(0, Number(cantidad))
        const { error } = await supabase
            .from('productos')
            .update({ stock: stockNuevo, updated_at: new Date().toISOString() })
            .eq('id', productoId)

        if (!error) {
            setProductos(productos.map(p => p.id === productoId ? { ...p, stock: stockNuevo } : p))
            setEditando(null)
        } else {
            alert('Error al actualizar stock: ' + error.message)
        }
    }

    /*async function toggleActivo(productoId, activo) {
        const { error } = await supabase
            .from('productos')
            .update({ activo: !activo })
            .eq('id', productoId)

        if (!error) {
            setProductos(productos.filter(p => p.id !== productoId))
        }
    }*/

    const productosFiltrados = productos.filter(p => {
        const coincideBusqueda =
            p.marca.toLowerCase().includes(buscar.toLowerCase()) ||
            p.estilo.toLowerCase().includes(buscar.toLowerCase()) ||
            p.talla?.includes(buscar) ||
            p.color?.toLowerCase().includes(buscar.toLowerCase()) ||
            p.codigo?.toLowerCase().includes(buscar.toLowerCase())

        if (!coincideBusqueda) return false

        if (filtroStock === 'bajo') return p.stock > 0 && p.stock <= 2
        if (filtroStock === 'agotado') return p.stock === 0
        return true
    })

    const totalProductos = productos.length
    const stockBajo = productos.filter(p => p.stock > 0 && p.stock <= 2).length
    const agotados = productos.filter(p => p.stock === 0).length

    if (cargando) {
        return (
            <div className="flex justify-center items-center h-screen pb-16">
                <p className="text-gray-500">Cargando stock...</p>
            </div>
        )
    }

    return (
        <div className="p-4 pb-24 max-w-md mx-auto">
            <button onClick={() => navigate('/')} className="flex items-center text-blue-900 font-bold mb-4">
                <ArrowLeft size={20} className="mr-1" /> Volver
            </button>

            <h1 className="text-2xl font-bold text-blue-900 mb-1">📦 Stock</h1>
            <p className="text-gray-500 text-sm mb-4">{totalProductos} productos • {stockBajo} bajo • {agotados} agotado</p>

            {/* Buscador */}
            <div className="relative mb-3">
                <Search size={16} className="absolute left-3 top-3.5 text-gray-400" />
                <input
                    type="text"
                    placeholder="Buscar por marca, estilo, talla..."
                    value={buscar}
                    onChange={(e) => setBuscar(e.target.value)}
                    className="w-full p-3 pl-9 border rounded-lg text-sm"
                />
            </div>

            {/* Filtros */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
                {[
                    { key: 'todos', label: 'Todos', count: totalProductos },
                    { key: 'bajo', label: 'Stock Bajo', count: stockBajo },
                    { key: 'agotado', label: 'Agotados', count: agotados },
                ].map(f => (
                    <button
                        key={f.key}
                        onClick={() => setFiltroStock(f.key)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${filtroStock === f.key
                            ? 'bg-blue-900 text-white'
                            : 'bg-gray-100 text-gray-600'
                            }`}
                    >
                        {f.label} ({f.count})
                    </button>
                ))}
            </div>

            {/* Lista de productos */}
            <div className="space-y-3">
                {productosFiltrados.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                        <Package size={48} className="mx-auto mb-2 text-gray-300" />
                        <p>No se encontraron productos</p>
                    </div>
                )}

                {productosFiltrados.map((p) => (
                    <div
                        key={p.id}
                        className={`bg-white border rounded-xl p-4 shadow-sm ${p.stock === 0 ? 'border-red-300 bg-red-50' :
                            p.stock <= 2 ? 'border-amber-300 bg-amber-50' : ''
                            }`}
                    >
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="font-bold text-gray-900">{p.marca} {p.estilo}</h3>
                                    {p.stock === 0 && <span className="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded-full font-bold">AGOTADO</span>}
                                    {p.stock > 0 && p.stock <= 2 && <span className="text-[10px] bg-amber-500 text-white px-2 py-0.5 rounded-full font-bold flex items-center gap-1"><AlertTriangle size={10} /> BAJO</span>}
                                </div>
                                <p className="text-xs text-gray-500">Talla {p.talla} • {p.color} • {p.codigo}</p>
                            </div>
                            <div className="text-right">
                                <p className="font-bold text-blue-900">Gs {p.precio_venta?.toLocaleString()}</p>
                            </div>
                        </div>

                        {/* Stock editable */}
                        <div className="flex items-center justify-between bg-white rounded-lg p-2 border">
                            <div className="flex items-center gap-3">
                                <span className="text-xs text-gray-500 font-medium">Stock:</span>
                                {editando === p.id ? (
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            min="0"
                                            value={nuevoStock}
                                            onChange={(e) => setNuevoStock(e.target.value)}
                                            className="w-16 p-1 border rounded text-center text-sm font-bold"
                                            autoFocus
                                        />
                                        <button onClick={() => actualizarStock(p.id, nuevoStock)} className="text-green-600">
                                            <Check size={18} />
                                        </button>
                                        <button onClick={() => setEditando(null)} className="text-red-500">
                                            <X size={18} />
                                        </button>
                                    </div>
                                ) : (
                                    <span className={`text-lg font-bold ${p.stock === 0 ? 'text-red-600' : p.stock <= 2 ? 'text-amber-600' : 'text-green-600'}`}>
                                        {p.stock}
                                    </span>
                                )}
                            </div>

                            {editando !== p.id && (
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => { setEditando(p.id); setNuevoStock(p.stock) }}
                                        className="p-1.5 text-gray-500 hover:text-blue-900 hover:bg-blue-50 rounded"
                                    >
                                        <Pencil size={16} />
                                    </button>
                                    <button
                                        onClick={() => actualizarStock(p.id, p.stock + 1)}
                                        className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                                    >
                                        <Plus size={16} />
                                    </button>
                                    <button
                                        onClick={() => actualizarStock(p.id, p.stock - 1)}
                                        className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                                    >
                                        <Minus size={16} />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}