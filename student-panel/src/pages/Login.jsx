// src/pages/Login.jsx
import React, { useState, useEffect } from "react";
import axios from "axios";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import './Login.css';
import API_BASE_URL from '../config/api';

// Render free instances spin down when idle. The first request after a pause can
// take 30-60 seconds, so give login enough time and warm the server on load.
const LOGIN_TIMEOUT_MS = 60000;

function Login({ onLogin }) {
  const [login, setLogin] = useState({ hallticket: "", password: "" });
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showTechSupport, setShowTechSupport] = useState(false);

  useEffect(() => {
    // Start waking the backend while the student is typing their credentials.
    axios.get(`${API_BASE_URL}/health`, { timeout: LOGIN_TIMEOUT_MS }).catch(() => {});
  }, []);

  // Technical Support Component
  const TechnicalSupport = () => {
    if (!showTechSupport) return null;

    const contactDetails = {
      developer: {
        name: "Vamshi Ramavath",
        email: "vamshinaikramavath@gmail.com",
        phone: "+91 9014243908",
        role: "Lead Developer - V Soft",
        photo: "/vamshiofficail.png"
      }
    };

    const handleContact = (method) => {
      switch (method) {
        case 'whatsapp':
          window.open(`https://wa.me/918522092885?text=Hello%20Dr K.Jyothsna ,%20I%20need%20help%20with%20the%20feedback%20system.`);
          break;
        case 'phone':
          window.open(`tel:${contactDetails.developer.phone}`);
          break;
        default:
          break;
      }
    };

    return (
      <div className="support-modal-overlay" onClick={() => setShowTechSupport(false)}>
        <div className="support-modal" onClick={(e) => e.stopPropagation()}>
          <div className="support-header">
            <h3>🛠️ Developer Support</h3>
            <button className="support-close" onClick={() => setShowTechSupport(false)}>×</button>
          </div>
          
          <div className="support-content">
            <div className="support-section">
              <div className="contact-card">
                <div className="developer-photo-section">
                  <img 
                    src={contactDetails.developer.photo} 
                    alt={contactDetails.developer.name}
                    className="developer-photo"
                  />
                  <div className="developer-badge">
                    <span className="badge-icon">👨‍💻</span>
                    <span>Developer</span>
                  </div>
                </div>
                
                <div className="contact-info">
                  <h4>{contactDetails.developer.name}</h4>
                  <p className="developer-role">{contactDetails.developer.role}</p>
                  <div className="contact-details">
                    <p className="contact-item">
                      <span className="contact-icon">📱</span>
                      <span>{contactDetails.developer.phone}</span>
                    </p>
                  </div>
                </div>
                
                <div className="contact-actions">
                  <button onClick={() => handleContact('whatsapp')} className="btn-whatsapp">
                    💬 WhatsApp
                  </button>
                  
                </div>
              </div>
            </div>

            <div className="quick-solutions">
              <h4>🚀 Quick Solutions</h4>
              <div className="solutions-list">
                <div className="solution-item">
                  <span className="solution-icon">🌐</span>
                  <div>
                    <strong>Check Internet Connection</strong>
                    <p>Ensure you have stable internet access</p>
                  </div>
                </div>
                <div className="solution-item">
                  <span className="solution-icon">🧹</span>
                  <div>
                    <strong>Clear Browser Cache</strong>
                    <p>Clear cache and try again</p>
                  </div>
                </div>
                <div className="solution-item">
                  <span className="solution-icon">🔍</span>
                  <div>
                    <strong>Try Different Browser</strong>
                    <p>Use Chrome, Firefox, or Edge</p>
                  </div>
                </div>
                <div className="solution-item">
                  <span className="solution-icon">🔄</span>
                  <div>
                    <strong>Restart Device</strong>
                    <p>Sometimes a simple restart helps</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="support-footer">
              <p>I'll respond to your query as soon as possible! ⚡</p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Toggle password visibility
  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  // Login with enhanced error handling
  const handleLogin = async () => {
    if (!login.hallticket || !login.password) {
      toast.error("Please fill all fields!");
      return;
    }
    
    setIsLoading(true);
    
    try {
      const res = await axios.post(`${API_BASE_URL}/login`, login, {
        timeout: LOGIN_TIMEOUT_MS,
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (res.data.success) {
        localStorage.setItem('token', res.data.token);
        // Save student data to localStorage for persistence
        localStorage.setItem('studentData', JSON.stringify(res.data.student));
        onLogin(res.data.student);
        toast.success("Login successful!");
      } else {
        toast.error(res.data.error || "Login failed");
      }
    } catch(error) {
      console.error('Login error details:', error);
      
      // Network-related errors
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        toast.error("⌛ The server is waking up. Please wait a few seconds and try again.");
      } 
      else if (error.message === 'Network Error' || !error.response) {
        toast.error("🌐 Network error. Please check your internet connection.");
      }
      // Server errors (5xx)
      else if (error.response?.status >= 500) {
        toast.error("🔧 Server error. Please try again in a few minutes.");
      }
      // Client errors (4xx)
      else if (error.response?.status === 400) {
        toast.error(error.response.data.error || "❌ Invalid hallticket or password.");
      }
      else if (error.response?.status === 401) {
        toast.error("🔐 Authentication failed. Please login again.");
      }
      else if (error.response?.status === 403) {
        toast.error("🚫 Access forbidden. Please contact administrator.");
      }
      else if (error.response?.status === 404) {
        toast.error("🔍 Service not found. Please contact support.");
      }
      // CORS errors
      else if (error.response?.status === 0) {
        toast.error("🛡️ Connection blocked by browser. Try refreshing or using different browser.");
      }
      else {
        toast.error(error.response?.data?.error || "Login failed. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Header Component
  const Header = () => (
    <header className="college-header">
      <div className="header-container">
        <div className="logo-container">
          <img 
            src="IMG_3594.jpg" 
            alt="SCIENT INSTITUTE OF TECHNOLOGY Logo" 
            className="college-logo"
          />
        </div>
        <div className="college-info">
          <h1>SCIENT INSTITUTE OF TECHNOLOGY</h1>
          <p className="ugc-autonomous">(UGC AUTONOMOUS)</p>
          <p className="college-address">Ibrahimpatnam R.R.Dist Telangana 501359</p>
        </div>
      </div>
    </header>
  );

  // Footer Component
  const Footer = () => (
    <footer className="college-footer">
      <div className="footer-container">
        <div className="footer-content">
          <div className="copyright">
            <p>&copy; {new Date().getFullYear()} SCIENT INSTITUTE OF TECHNOLOGY. All rights reserved.</p>
          </div>
          <div className="developer-info">
            <p>Designed and developed by </p>
            <div className="vsoft-info">
              <img 
                src="/vamshi.PNG" 
                alt="V Soft Logo" 
                className="vsoft-logo"
              />
              <span>V Soft</span>
              Follow us on
              <a 
                href="https://www.linkedin.com/public-profile/settings?trk=d_flagship3_profile_self_view_public_profile" 
                target="_blank" 
                rel="noopener noreferrer"
                className="linkedin-link"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#0077b5">
                  <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );

  return (
    <div className="login-full-page">
      <Header />
      <div className="login-content-wrapper">
        <div className="login-container">
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
          />
          
          <div className="auth-form">
            <h2>Student Login</h2>
            <p>Login with your Hall Ticket Number and common password</p>
            <div className="form-group">
              <input 
                placeholder="Hall Ticket Number" 
                value={login.hallticket} 
                onChange={e => setLogin({...login, hallticket: e.target.value})}
                required
                disabled={isLoading}
              />
            </div>
            <div className="form-group password-input-group">
              <input 
                type={showPassword ? "text" : "password"}
                placeholder="Password" 
                value={login.password} 
                onChange={e => setLogin({...login, password: e.target.value})}
                required
                disabled={isLoading}
              />
              <span 
                className="password-toggle"
                onClick={togglePasswordVisibility}
              >
                {showPassword ? "🙈" : "👁️"}
              </span>
            </div>
            <button 
              onClick={handleLogin} 
              className="btn-primary" 
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <span className="loading-spinner"></span>
                  Logging in...
                </>
              ) : (
                "Login"
              )}
            </button>
            
            <p className="tech-support-link">
              Having trouble? <span onClick={() => setShowTechSupport(true)}>Contact Developer</span>
            </p>
          </div>
        </div>
      </div>
      
      {/* Technical Support Modal */}
      <TechnicalSupport />
      
      <Footer />
    </div>
  );
}

export default Login;