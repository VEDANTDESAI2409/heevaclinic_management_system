import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AppProvider } from './context/AppContext.jsx';
import { PrintProvider } from './context/PrintContext.jsx';
import './styles.css';
import '@fontsource-variable/inter';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProvider>
        <PrintProvider>
          <App />
        </PrintProvider>
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>
);

// PWA: register service worker (production builds only — keeps HMR clean in dev)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}
