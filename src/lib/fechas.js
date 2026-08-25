/**
 * Parser robusto de fechas para datos históricos importados del Excel.
 *
 * El Excel guarda las fechas como número serial (días desde el 30/12/1899),
 * ej: 14/10/2025 = 45944. Si ese número se pasa directo a new Date(),
 * JavaScript lo interpreta como milisegundos desde 1970 → fechas absurdas.
 *
 * Acepta:
 *  - ISO de Supabase: "2025-10-14" / "2025-10-14T..."
 *  - Serial de Excel (número o texto numérico en rango plausible)
 *  - Texto "dd/mm/yyyy", "dd-mm-yyyy", "dd/mm/yy"
 *
 * Devuelve un objeto Date válido o null si no se puede interpretar.
 */
export function parseFecha(valor) {
    if (valor === null || valor === undefined || valor === '') return null

    // ISO de la base de datos
    if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}/.test(valor)) {
        const d = new Date(valor)
        return isNaN(d.getTime()) ? null : d
    }

    // Serial de Excel (número o texto solo de dígitos)
    const esNumero = typeof valor === 'number' || /^\d+(\.\d+)?$/.test(String(valor).trim())
    if (esNumero) {
        const n = Number(valor)
        // Rango plausible de seriales de Excel: años ~1954 a ~2064
        if (n > 20000 && n < 60000) {
            // 25569 días entre el 30/12/1899 (época Excel) y el 1/1/1970 (época Unix)
            return new Date(Math.round((n - 25569) * 24 * 60 * 60 * 1000))
        }
        return null
    }

    // Texto dd/mm/yyyy o dd/mm/yy
    const m = String(valor).trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
    if (m) {
        const dia = Number(m[1])
        const mes = Number(m[2])
        let anio = Number(m[3])
        if (anio < 100) anio += 2000
        if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null
        const d = new Date(anio, mes - 1, dia)
        return isNaN(d.getTime()) ? null : d
    }

    // Último intento: delegar al navegador (p. ej. "14 Oct 2025")
    const d = new Date(valor)
    return isNaN(d.getTime()) ? null : d
}
