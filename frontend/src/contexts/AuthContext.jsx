// frontend/src/contexts/AuthContext.jsx
import React, { createContext, useState, useContext } from 'react';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null); // User object: { employeeId, name, ... }
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true); // To track initial auth status check

  // Login function (will be expanded later to call API)
  const login = (userData) => {
    setUser(userData);
    setIsAuthenticated(true);
  };

  // Logout function (will be expanded later to call API)
  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
  };

  const value = {
    user,
    isAuthenticated,
    loading,
    setLoading,
    login,
    logout,
    setUser, // Exposing setUser for auth status check
    setIsAuthenticated // Exposing setIsAuthenticated for auth status check
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
