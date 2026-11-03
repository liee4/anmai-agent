import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.js';
import './styles/app.css';
import './styles/details.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
