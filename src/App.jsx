import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useApp } from './context/AppContext';
import AppShell from './layout/AppShell';
import Dashboard from './pages/Dashboard';
import Patients from './pages/Patients';
import PatientProfile from './pages/PatientProfile';
import Consultations from './pages/Consultations';
import Appointments from './pages/Appointments';
import Prescriptions from './pages/Prescriptions';
import Billing from './pages/Billing';
import Payments from './pages/Payments';
import Medicines from './pages/Medicines';
import Inventory from './pages/Inventory';
import Returns from './pages/Returns';
import Expenses from './pages/Expenses';
import Reports from './pages/Reports';
import Alerts from './pages/Alerts';
import Staff from './pages/Staff';
import SettingsPage from './pages/SettingsPage';
import LockScreen from './components/LockScreen';
import { Logo } from './components/ui';
import { Loader } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error('HEEVA CLINIC render error', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="error-screen">
        <Logo size={56} />
        <h1>HEEVA CLINIC</h1>
        <h2>Something went wrong</h2>
        <p>The application could not display this screen.</p>
        <div className="error-actions">
          <button className="btn btn-primary" onClick={() => this.setState({ error: null })}>Try Again</button>
          <button className="btn btn-outline" onClick={() => window.location.reload()}>Reload Application</button>
        </div>
      </div>
    );
  }
}

function DatabaseErrorScreen({ message }) {
  return (
    <div className="boot-screen">
      <Logo size={64} />
      <div className="boot-name">Database connection required</div>
      <div className="boot-sub">{message}</div>
      <button className="btn btn-primary" onClick={() => window.location.reload()}>Retry connection</button>
    </div>
  );
}

function BootScreen() {
  return (
    <div className="boot-screen">
      <Logo size={64} />
      <div className="boot-name">HEEVA CLINIC</div>
      <div className="boot-sub">Trusted care, every time.</div>
      <div className="boot-spinner"><Loader size={22} className="spin" /></div>
    </div>
  );
}

export default function App() {
  const { booting, databaseError, isAuthenticated, login } = useApp();
  if (booting) return <BootScreen />;
  if (databaseError) return <DatabaseErrorScreen message={databaseError} />;
  if (!isAuthenticated) return <LockScreen onLogin={login} />;
  return <ErrorBoundary>
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/patients" element={<Patients />} />
        <Route path="/patients/:id" element={<PatientProfile />} />
        <Route path="/consultations" element={<Consultations />} />
        <Route path="/appointments" element={<Appointments />} />
        <Route path="/prescriptions" element={<Prescriptions />} />
        <Route path="/billing" element={<Billing />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/medicines" element={<Medicines />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/returns" element={<Returns />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/staff" element={<Staff />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </ErrorBoundary>;
}
