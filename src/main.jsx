import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './pages/App.jsx'
import FacturaPublica from './pages/FacturaPublica.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Panel privado — solo dolcegustopanel@gmail.com */}
        <Route path="/"          element={<App />} />
        <Route path="/dashboard" element={<App />} />

        {/* Vista pública del QR — cualquiera con el enlace, sin login, sin expiración */}
        <Route path="/f/:uuid"   element={<FacturaPublica />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
