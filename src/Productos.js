import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'

export default function Productos() {
    const [productos, setProductos] = useState([])
    const [cargando, setCargando] = useState(true)

    useEffect(() => {
        async function cargar() {
            const { data, error } = await supabase
                .from('productos')
                .select('*')
                .eq('activo', true)
                .order('stock', { ascending: true })

            if (!error) setProductos(data)
            setCargando(false)
        }
        cargar()
    }, [])

    if (cargando) {
        return (
            <div className="flex justify-center items-center h-screen">
                <p className="text-xl text-gray-500">Cargando productos...</p>
            </div>
        )
    }

    return (
        <div className="p-4 max-w-md mx-auto">
            <h1 className="text-2xl font-bold text-blue-900 mb-2 text-center">
                PATTY SHOES
            </h1>
            <p className="text-center text-gray-500 text-sm mb-6">
                Sistema de Ventas
            </p>

            <h2 className="text-lg font-semibold text-gray-700 mb-4">
                Catálogo de Productos
            </h2>

            <div className="space-y-4">
                {productos.map((p) => (
                    <div
                        key={p.id}
                        className={`p-4 rounded-xl shadow-md ${p.stock <= 2 ? 'bg-red-50 border-2 border-red-200' : 'bg-white'
                            }`}
                    >
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="font-bold text-lg text-gray-900">{p.marca}</h3>
                                <p className="text-sm text-gray-600">
                                    {p.estilo} • Talla {p.talla}
                                </p>
                                <p className="text-sm text-gray-500">{p.color}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-xl font-bold text-blue-900">
                                    Gs {p.precio_venta.toLocaleString()}
                                </p>
                                <p
                                    className={`text-sm font-bold ${p.stock <= 2 ? 'text-red-600' : 'text-green-600'
                                        }`}
                                >
                                    Stock: {p.stock}
                                </p>
                            </div>
                        </div>
                        <p className="text-xs text-gray-400 mt-2">{p.descripcion}</p>
                    </div>
                ))}
            </div>

            <p className="text-center text-xs text-gray-400 mt-6">
                {productos.length} productos encontrados
            </p>
        </div>
    )
}