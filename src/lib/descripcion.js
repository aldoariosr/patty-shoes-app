/**
 * Devuelve una descripción legible del producto de un pedido.
 * Para pedidos normales usa el producto vinculado;
 * para pedidos migrados del histórico (PED-HIST-*), usa las notas,
 * donde queda guardado el detalle de la compra al migrar.
 */
export function descripcionProducto(pedido) {
    if (!pedido) return 'Producto'
    const prod = pedido.producto
    if (prod && prod.marca) {
        const texto = [prod.marca, prod.estilo].filter(Boolean).join(' ')
        const talla = prod.talla ? ` (Talla ${prod.talla})` : ''
        return `${texto}${talla}`
    }
    // Pedido migrado: quitar el prefijo de migración y devolver el detalle
    const notas = pedido.notas || ''
    const detalle = notas.replace(/^Migrado desde histórico Excel\s*[—–-]*\s*/, '').trim()
    return detalle || 'Producto migrado del Excel'
}

/**
 * Etiqueta corta para mostrar donde antes iba el código del pedido.
 * Los migrados muestran "🧾 Cuenta histórica" en vez de PED-HIST-<uuid>.
 */
export function etiquetaPedido(pedido) {
    if (pedido && (pedido.codigo || '').startsWith('PED-HIST')) return '🧾 Cuenta histórica'
    return pedido?.codigo || 'Pedido'
}
