import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.js';
import './index.css';

// Intentional type error for autofix demo — TS2322. Should fail Vercel build.
const autofixDemoBreakage: number = 'this should be a number';
console.log(autofixDemoBreakage);

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
