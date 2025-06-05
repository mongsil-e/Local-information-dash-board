// frontend/src/components/Header.jsx
import React from 'react'; // Ensure React is imported if not already
import './Header.css'; // Import the CSS file

function Header() {
  // Placeholder data/handlers for now
  const userName = "PKG 설비 2파트"; // Will come from auth context later
  const handleLogout = () => console.log("Logout clicked"); // Will be implemented later
  const handleThemeToggle = () => console.log("Theme toggle clicked"); // Will be implemented later

  return (
    <header className="header">
      <div className="header__logo">인폼 현황판</div>
      <div className="header__user-area">
        <div className="header__user-name" id="userInfo">{userName}</div>
        <button id="logoutButton" className="btn btn--secondary" onClick={handleLogout}>로그아웃</button>
        <button className="header__theme-toggle" aria-label="테마 전환 (라이트/다크)" onClick={handleThemeToggle}>🌓</button>
      </div>
    </header>
  );
}

export default Header;
