import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import App from './App';
import { DEMO_USER, DEMO_TOKEN } from './services/mockAdapter';
import './index.css';

// STATIC DEMO: seed a demo session before React mounts so the show-and-tell
// build (GitHub Pages, no backend) opens already "signed in" — gated pages
// render instead of redirecting to /login. No-op on the real backend build.
// mockAdapter is imported statically by api.ts, so DEMO_* are already loaded.
if (import.meta.env.VITE_STATIC_DEMO === 'true') {
  localStorage.setItem('rides_token', DEMO_TOKEN);
  localStorage.setItem('rides_user', JSON.stringify(DEMO_USER));
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5000,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
