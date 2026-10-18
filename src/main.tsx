import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './fonts.css'
import './styles/index.css'
import './prism-theme.css'
import './styles/achievements.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
