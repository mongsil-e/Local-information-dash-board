import Header from '../components/Header';
import { Outlet } from 'react-router-dom';

function DashboardLayout() {
  return (
    <div>
      <Header />
      <main>
        <Outlet /> {/* Child routes like DashboardPage will render here */}
      </main>
    </div>
  );
}
export default DashboardLayout;
