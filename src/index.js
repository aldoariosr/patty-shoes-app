import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';  // ← ESTA LÍNEA ES CLAVE
import App from './App';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

reportWebVitals();

// Registrar service worker (PWA instalable) solo en producción
if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${process.env.PUBLIC_URL}/sw.js`).catch((err) => {
      console.error('Error registrando el service worker:', err)
    })
  })
}