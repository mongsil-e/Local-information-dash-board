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

  // Logout function
  const logout = async () => {
    try {
      // Fetch CSRF token
      const csrfResponse = await fetch('/api/csrf-token');
      // Check if the response is ok before trying to parse as JSON
      if (!csrfResponse.ok) {
        // Try to get more error info from the response if possible
        const errorText = await csrfResponse.text();
        console.error('CSRF token fetch failed:', csrfResponse.status, errorText);
        // Fallback or throw error if CSRF is strictly required for logout
        // For now, we'll log and attempt logout without it, server might reject.
      } else {
        const csrfData = await csrfResponse.json();
        const token = csrfData.csrfToken;

        if (token) {
          await fetch('/api/logout', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-CSRF-Token': token // Send CSRF token in header
            },
            // body: JSON.stringify({}) // Empty body is fine for logout
          });
        } else {
          console.error('CSRF token not received, proceeding with client-side logout only.');
        }
      }
    } catch (error) {
      // This catch block handles network errors for CSRF fetch or logout fetch,
      // or errors from .json() if response wasn't valid JSON.
      console.error('Logout API call or CSRF token fetch failed:', error);
    } finally {
      // Always clear client-side authentication state
      setUser(null);
      setIsAuthenticated(false);
      // ProtectedRoute will handle navigation to /login if current route is protected.
    }
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
