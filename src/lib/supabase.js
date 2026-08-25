import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
    throw new Error(
        'Faltan las variables de entorno REACT_APP_SUPABASE_URL y/o REACT_APP_SUPABASE_ANON_KEY. ' +
        'Creá un archivo .env en la raíz del proyecto con esos valores.'
    )
}

export const supabase = createClient(supabaseUrl, supabaseKey)
