// Central API config for the admin panel.
// Set VITE_API_URL in admin-panel/.env to point at a different backend.
const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/+$/, '');

export default API_BASE_URL;
