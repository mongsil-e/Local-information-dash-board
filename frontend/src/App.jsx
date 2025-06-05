// frontend/src/App.jsx
import React, { useEffect } from 'react'; // Import useEffect
import { Routes, Route } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import DashboardLayout from './layouts/DashboardLayout';
import ProtectedRoute from './components/ProtectedRoute'; // Import ProtectedRoute
import { useAuth } from './contexts/AuthContext'; // Import useAuth

function App() {
  const { setUser, setIsAuthenticated, setLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    const checkAuthStatus = async () => {
      // No need to check if already authenticated by a login action in this session
      if (isAuthenticated) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await fetch('/api/auth-status');
        if (response.ok) {
          const data = await response.json();
          if (data.isAuthenticated) {
            setUser(data.user);
            setIsAuthenticated(true);
          } else {
            // Not authenticated, or token invalid
            setUser(null);
            setIsAuthenticated(false);
          }
        } else {
          // API error, treat as not authenticated
           setUser(null);
           setIsAuthenticated(false);
        }
      } catch (error) {
        console.error('Failed to fetch auth status:', error);
        setUser(null);
        setIsAuthenticated(false);
      } finally {
        setLoading(false);
      }
    };

    checkAuthStatus();
  }, [isAuthenticated, setUser, setIsAuthenticated, setLoading]); // Add isAuthenticated to dependency array

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        {/* Other dashboard-related nested routes:
        <Route path="settings" element={<SettingsPage />} />
        */}
      </Route>
      {/* <Route path="*" element={<NotFoundPage />} /> */}
    </Routes>
  );
}

export default App;
