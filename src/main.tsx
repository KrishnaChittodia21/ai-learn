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

// cold-start splash (index.html): fade it out once the app has painted, then remove it
requestAnimationFrame(() => {
  const boot = document.getElementById('boot');
  if (!boot) return;
  // still inside its 300 ms delay: nothing was shown, so drop it at once
  if (performance.now() < 300) return boot.remove();
  boot.classList.add('done');
  setTimeout(() => boot.remove(), 220);
});
