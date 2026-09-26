import React from 'react';
import './index.css';
import ReactDOM from 'react-dom/client';
import App from './App';

const preventInfiniteReload = () => {
  const lastReload = sessionStorage.getItem('last_chunk_reload');
  const now = Date.now();
  if (lastReload && now - parseInt(lastReload) < 10000) {
    console.error('Chunk load error loop detected. Please refresh manually.');
    return;
  }
  sessionStorage.setItem('last_chunk_reload', String(now));
  window.location.reload();
};

// Global handler for chunk load errors (PWA update issue)
window.addEventListener('error', (event) => {
  if (event.message?.includes('Failed to fetch dynamically imported module') ||
    event.message?.includes('Importing a module script failed') ||
    event.message?.includes('Loading chunk')) {
    console.error('Chunk load error detected, attempting reload...');
    preventInfiniteReload();
  }
});

// Also catch unhandled promise rejections (for dynamic imports)
window.addEventListener('unhandledrejection', (event) => {
  const message = event.reason?.message || String(event.reason);
  if (message?.includes('Failed to fetch dynamically imported module') ||
    message?.includes('Importing a module script failed') ||
    message?.includes('Loading chunk')) {
    console.error('Dynamic import error detected, attempting reload...');
    preventInfiniteReload();
  }
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);