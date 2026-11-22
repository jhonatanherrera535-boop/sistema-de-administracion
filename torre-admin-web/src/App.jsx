import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import ProtectedRoute from './components/ProtectedRoute';
import AdminDashboard from './pages/admin/Dashboard';
import PeriodDetail from './pages/admin/PeriodDetail';
import AdminPayments from './pages/admin/Payments';
import ResidentDashboard from './pages/resident/Dashboard';
import ResidentAccountDetail from './pages/resident/AccountDetail';
import AdminResidents from './pages/admin/Residents';
import ToastProvider from './components/ui/ToastProvider';
import AdminReport from './pages/admin/Report';   // ← nuevo


export default function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/change-password" element={<ChangePassword />} />

        <Route element={<ProtectedRoute role="admin" />}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/periods/:id" element={<PeriodDetail />} />
          <Route path="/admin/payments" element={<AdminPayments />} />
          <Route path="/admin/residents" element={<AdminResidents />} />   
          <Route path="/admin/report" element={<AdminReport />} />   {/* ← nueva */}
        </Route>

        <Route element={<ProtectedRoute role="resident" />}>
          <Route path="/resident" element={<ResidentDashboard />} />
          <Route path="/resident/periods/:id" element={<ResidentAccountDetail />} />
        </Route>

        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </ToastProvider>
  );
}