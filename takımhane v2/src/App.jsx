import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import AppLayout from '@/components/layout/AppLayout'
import LoginPage from '@/pages/auth/LoginPage'
import DashboardPage from '@/pages/dashboard/DashboardPage'
import WorkOrdersPage from '@/pages/work-orders/WorkOrdersPage'
import CheckoutsPage from '@/pages/checkouts/CheckoutsPage'
import RegrindPage from '@/pages/regrind/RegrindPage'
import CatalogPage from '@/pages/catalog/CatalogPage'
import StockPage from '@/pages/stock/StockPage'
import CalibrationPage from '@/pages/calibration/CalibrationPage'
import RecordsPage from '@/pages/records/RecordsPage'
import CncStatusPage from '@/pages/cnc-status/CncStatusPage'
import AdminPage from '@/pages/admin/AdminPage'
import SetupWizard from '@/pages/setup/SetupWizard'
import AlarmsPage from '@/pages/alarms/AlarmsPage'
import MagazineComparisonPage from '@/pages/magazine/MagazineComparisonPage'
import ToolFinderPage from '@/pages/tool-finder/ToolFinderPage'

function SplashScreen() {
  return (
    <div className="flex h-full items-center justify-center bg-slate-900">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-600 border-t-blue-500" />
        <span className="text-sm text-slate-400">Yükleniyor…</span>
      </div>
    </div>
  )
}

function RequireAuth({ children }) {
  const { session, profile, loading } = useAuthStore()
  if (loading) return <SplashScreen />
  if (!session) return <Navigate to="/login" replace />
  // Profile loaded but no facility yet → go to setup
  if (profile && !profile.facility_id) return <Navigate to="/setup" replace />
  return children
}

function RequireNoFacility({ children }) {
  const { session, profile, loading } = useAuthStore()
  if (loading) return <SplashScreen />
  if (!session) return <Navigate to="/login" replace />
  if (profile?.facility_id) return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  const initialize = useAuthStore((s) => s.initialize)
  useEffect(() => { initialize() }, [initialize])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/setup" element={
          <RequireNoFacility>
            <SetupWizard />
          </RequireNoFacility>
        } />
        <Route
          path="/"
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard"    element={<DashboardPage />} />
          <Route path="work-orders"  element={<WorkOrdersPage />} />
          <Route path="checkouts"    element={<CheckoutsPage />} />
          <Route path="regrind"      element={<RegrindPage />} />
          <Route path="catalog"      element={<CatalogPage />} />
          <Route path="stock"        element={<StockPage />} />
          <Route path="calibration"  element={<CalibrationPage />} />
          <Route path="records"      element={<RecordsPage />} />
          <Route path="cnc-status"   element={<CncStatusPage />} />
          <Route path="admin"        element={<AdminPage />} />
          <Route path="alarms"       element={<AlarmsPage />} />
          <Route path="magazine/:woId"  element={<MagazineComparisonPage />} />
          <Route path="tool-finder"    element={<ToolFinderPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
