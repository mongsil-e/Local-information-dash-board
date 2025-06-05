// frontend/src/pages/LoginPage.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './LoginPage.css';

function LoginPage() {
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login: authLogin } = useAuth(); // Renamed to avoid conflict
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      // /api/login does not have CSRF protection in server.js, so no CSRF token needed for this specific call.
      const loginResponse = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ employeeId, password }),
      });

      const responseData = await loginResponse.json();

      if (!loginResponse.ok) {
        throw new Error(responseData.error || `Login failed with status: ${loginResponse.status}`);
      }

      // Login successful
      if (responseData.mustChangePassword) {
        console.warn('User must change password. Navigating to dashboard for now.');
        // Future: navigate('/change-password', { state: { employeeId: responseData.user.employeeId } });
      }

      authLogin(responseData.user); // Pass the user object
      navigate('/');

    } catch (err) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-container">
      <h2>로그인</h2>
      <form id="loginForm" onSubmit={handleSubmit}>
        {error && <p className="error-message" style={{color: 'red'}}>{error}</p>}
        <div className="form-group">
          <label htmlFor="employeeId">사번</label>
          <input
            type="text"
            id="employeeId"
            name="employeeId"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            required
            disabled={isSubmitting}
          />
        </div>
        <div className="form-group">
          <label htmlFor="password">비밀번호</label>
          <input
            type="password"
            id="password"
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={isSubmitting}
          />
        </div>
        <button type="submit" className="btn btn--primary" disabled={isSubmitting}>
          {isSubmitting ? '로그인 중...' : '로그인'}
        </button>
      </form>
    </div>
  );
}

export default LoginPage;
