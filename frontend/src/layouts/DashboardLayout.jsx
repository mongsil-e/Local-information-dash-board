// frontend/src/layouts/DashboardLayout.jsx
import React from 'react'; // Ensure React is imported
import Header from '../components/Header';
import { Outlet } from 'react-router-dom';
import { DataProvider } from '../contexts/DataContext'; // Import DataProvider

function DashboardLayout() {
  return (
    <div>
      <Header />
      <DataProvider> {/* Wrap the main content area */}
        <main>
          <Outlet /> {/* Child routes like DashboardPage will render here and have access to DataContext */}
        </main>
      </DataProvider>
      {/* Footer or other layout elements if any */}
    </div>
  );
}

export default DashboardLayout;
