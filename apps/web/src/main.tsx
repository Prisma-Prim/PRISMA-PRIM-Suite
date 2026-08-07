import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ApplicationRoot } from './ApplicationRoot';
import './styles.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found.');
}

createRoot(rootElement).render(
  <StrictMode>
    <ApplicationRoot pathname={window.location.pathname} />
  </StrictMode>,
);
