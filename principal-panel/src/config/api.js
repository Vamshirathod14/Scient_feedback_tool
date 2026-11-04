// Central API config for the principal panel.
// Set VITE_API_URL in principal-panel/.env to point at a different backend.
const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/+$/, '');

export default API_BASE_URL;
