import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { ReferenceEntry } from './ReferenceEntry';
import './styles.css';

const rootElement = document.getElementById('root');

if (rootElement === null) {
  throw new Error('Root-Element fehlt.');
}

createRoot(rootElement).render(
  <StrictMode>
    <ReferenceEntry />
  </StrictMode>,
);
