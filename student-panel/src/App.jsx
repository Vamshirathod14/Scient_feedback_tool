// src/App.jsx
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import Login from './pages/Login';
import StudentDashboard from './pages/StudentDashboard';
import Header from './components/Header';
import Footer from './components/Footer';
import './App.css';

// Custom hook to check if current route is login
function useIsLoginRoute() {
  const location = useLocation();
  return location.pathname === '/login';
}

function AppContent() {
  const [studentData, setStudentData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const isLoginRoute = useIsLoginRoute();

  useEffect(() => {
    // Check if user is already logged in on app load
    const token = localStorage.getItem('token');
    const savedStudent = localStorage.getItem('studentData');
    
    if (token && savedStudent) {
      try {
        setStudentData(JSON.parse(savedStudent));
      } catch (e) {
        console.error("Failed to parse saved student data:", e);
        localStorage.removeItem('token');
        localStorage.removeItem('studentData');
      }
    }
    setIsLoading(false);
  }, []);

  const handleLogin = (student) => {
    setStudentData(student);
    // Save to localStorage to persist across refreshes
    localStorage.setItem('studentData', JSON.stringify(student));
  };

  const handleLogout = () => {
    setStudentData(null);
    // Clear localStorage on logout
    localStorage.removeItem('token');
    localStorage.removeItem('studentData');
  };

  if (isLoading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="App">
      {/* Only show header if not on login page */}
      {!isLoginRoute && <Header />}
      
      <main className="main-content">
        <ToastContainer
          position="top-right"
          autoClose={5000}
          hideProgressBar={false}
          newestOnTop={false}
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="colored"
        />
        <Routes>
          <Route 
            path="/login" 
            element={
              studentData ? 
              <Navigate to="/dashboard" replace /> : 
              <Login onLogin={handleLogin} />
            } 
          />
          <Route 
            path="/dashboard" 
            element={
              studentData ? 
              <StudentDashboard studentData={studentData} onLogout={handleLogout} /> : 
              <Navigate to="/login" replace />
            } 
          />
          <Route 
            path="/" 
            element={<Navigate to={studentData ? "/dashboard" : "/login"} replace />} 
          />
        </Routes>
      </main>
      
      {/* Only show footer if not on login page */}
      {!isLoginRoute && <Footer />}
    </div>
  );
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;