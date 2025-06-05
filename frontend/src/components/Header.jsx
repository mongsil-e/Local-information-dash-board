// frontend/src/components/Header.jsx
import React from 'react';
import { useAuth } from '../contexts/AuthContext'; // Corrected path
import './Header.css';

function Header() {
  const { isAuthenticated, user, logout } = useAuth();

  const handleThemeToggle = () => {
    console.log("Theme toggle clicked"); // Actual theme toggle logic will be later
    // Example: document.body.classList.toggle('theme-dark');
  };

  return (
    <header className="header">
      <div className="header__logo">인폼 현황판</div>
      <div className="header__user-area">
        {isAuthenticated && user && ( // Ensure user object exists
          <>
            <div className="header__user-name" id="userInfo">
              {user.name || user.employeeId || 'User'} {/* Display name or ID, fallback to 'User' */}
            </div>
            <button
              id="logoutButton"
              className="btn btn--secondary"
              onClick={logout} // Use logout from context
            >
              로그아웃
            </button>
          </>
        )}
        {/* Theme toggle is always visible */}
        <button
          className="header__theme-toggle"
          aria-label="테마 전환 (라이트/다크)"
          onClick={handleThemeToggle}
        >
          🌓
        </button>
      </div>
    </header>
  );
}

export default Header;
