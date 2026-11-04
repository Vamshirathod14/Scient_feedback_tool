import React, { useState } from 'react';
import axios from 'axios';
import PrincipalLogin from './PrincipalLogin';
import PrincipalPanel from './App';

function readStoredAdmin() {
  try {
    const raw = localStorage.getItem('principalAdminInfo');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function PrincipalRoot() {
  const [token, setToken] = useState(() => localStorage.getItem('principalToken'));
  const [adminInfo, setAdminInfo] = useState(readStoredAdmin);

  // Attach the admin JWT before PrincipalPanel mounts and fires its requests.
  if (token) {
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete axios.defaults.headers.common['Authorization'];
  }

  const handleLogin = (newToken, newAdmin) => {
    axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
    setToken(newToken);
    setAdminInfo(newAdmin);
  };

  const handleLogout = () => {
    localStorage.removeItem('principalToken');
    localStorage.removeItem('principalAdminInfo');
    delete axios.defaults.headers.common['Authorization'];
    setToken(null);
    setAdminInfo(null);
  };

  if (!token) {
    return <PrincipalLogin onLogin={handleLogin} />;
  }

  return <PrincipalPanel adminInfo={adminInfo} onLogout={handleLogout} />;
}
