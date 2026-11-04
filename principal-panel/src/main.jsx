import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import PrincipalRoot from './PrincipalRoot.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PrincipalRoot />
  </StrictMode>,
)
