import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Dashboard from './pages/Dashboard'
import NuevaVenta from './pages/NuevaVenta'
import CobrarCuota from './pages/CobrarCuota'
import VerStock from './pages/VerStock'
import Pedidos from './pages/Pedidos'
import Productos from './Productos'
import EstadoCuenta from './pages/EstadoCuenta'
import Clientes from './pages/Clientes'


function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/nueva-venta" element={<NuevaVenta />} />
          <Route path="/cobrar-cuota" element={<CobrarCuota />} />
          <Route path="/stock" element={<VerStock />} />
          <Route path="/pedidos" element={<Pedidos />} />
          <Route path="/clientes" element={<Productos />} />
          <Route path="/estado-cuenta" element={<EstadoCuenta />} />
          <Route path="/cliente" element={<Clientes />} />
        </Routes>
        <Navbar />
      </div>
    </BrowserRouter>
  )
}

export default App