// src/components/Header.jsx
import React from 'react';
import './HeaderFooter.css';

const Header = () => {
  return (
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
};

export default Header;