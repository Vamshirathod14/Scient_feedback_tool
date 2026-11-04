// src/components/Footer.jsx
import React from 'react';
import './HeaderFooter.css';

const Footer = () => {
  return (
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
};

export default Footer;