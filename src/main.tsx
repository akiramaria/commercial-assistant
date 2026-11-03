import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthGate } from './lib/auth';
import { StoreProvider } from './lib/store';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>
      <StoreProvider>
        <App />
      </StoreProvider>
    </AuthGate>
  </StrictMode>,
);
