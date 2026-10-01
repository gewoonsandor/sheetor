import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './components.css'
import App from './App.tsx'
import { applyTheme, watchSystemTheme } from './features/user/theme'
import { loadUser, subscribeUser } from './features/user/userStore'

applyTheme(loadUser())
subscribeUser(() => applyTheme(loadUser()))
watchSystemTheme(() => applyTheme(loadUser()))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
