import React, { useState } from 'react';
import axios from 'axios';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './PrincipalLogin.css';
import API_BASE_URL from './config/api';

/**
 * The principal panel reads the same reporting data as the admin panel, so it
 * signs in with the administrator account and reuses the admin JWT.
 */
function PrincipalLogin({ onLogin }) {
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.username || !formData.password) {
      toast.error('Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/admin/login`, formData);
      if (response.data.success) {
        localStorage.setItem('principalToken', response.data.token);
        localStorage.setItem('principalAdminInfo', JSON.stringify(response.data.admin));
        toast.success('Login successful!');
        onLogin(response.data.token, response.data.admin);
      }
    } catch (error) {
      if (error.response?.data?.error) {
        toast.error(error.response.data.error);
      } else {
        toast.error('Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="principal-login-container">
      <ToastContainer />
      <div className="principal-login-card">
        <div className="principal-login-header">
          <div className="principal-login-logo">🔐</div>
          <h1>Principal Login</h1>
          <p>Feedback Management System</p>
        </div>

        <form onSubmit={handleSubmit} className="principal-login-form">
          <div className="principal-form-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              name="username"
              autoComplete="username"
              value={formData.username}
              onChange={handleChange}
              placeholder="Enter administrator username"
              disabled={loading}
            />
          </div>

          <div className="principal-form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              autoComplete="current-password"
              value={formData.password}
              onChange={handleChange}
              placeholder="Enter password"
              disabled={loading}
            />
          </div>

          <button type="submit" className="principal-login-btn" disabled={loading}>
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <p className="principal-login-note">
          Use the administrator account configured in the backend.
        </p>
      </div>
    </div>
  );
}

export default PrincipalLogin;
