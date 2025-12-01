// src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'

// Theme & global styles (load YOUR styles last so they win)
import './styles/tokens.css'
import './styles/global.css'

// App chrome (no router required)
import AppShell from './ui/AppShell'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppShell />
  </React.StrictMode>,
)
