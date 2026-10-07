import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AuthProvider, useAuth } from './features/auth/AuthProvider';
import { LoginPage } from './features/auth/LoginPage';

// Pages are code-split; the slip page in particular pulls in the QR/OCR libraries.
const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const SlipUploadPage = lazy(() => import('./features/slips/SlipUploadPage').then((m) => ({ default: m.SlipUploadPage })));
const DailyPage = lazy(() => import('./features/transactions/DailyPage').then((m) => ({ default: m.DailyPage })));
const RecurringPage = lazy(() => import('./features/recurring/RecurringPage').then((m) => ({ default: m.RecurringPage })));
const ImportPage = lazy(() => import('./features/import/ImportPage').then((m) => ({ default: m.ImportPage })));
const DebtsPage = lazy(() => import('./features/debts/DebtsPage').then((m) => ({ default: m.DebtsPage })));
const CreditorPage = lazy(() => import('./features/debts/CreditorPage').then((m) => ({ default: m.CreditorPage })));
const PayeesPage = lazy(() => import('./features/payees/PayeesPage').then((m) => ({ default: m.PayeesPage })));

const loading = <div className="p-8 text-center text-slate-400">กำลังโหลด…</div>;

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  if (authLoading) return loading;
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={loading}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <RequireAuth>
                  <Layout />
                </RequireAuth>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="slips" element={<SlipUploadPage />} />
              <Route path="daily" element={<DailyPage />} />
              <Route path="recurring" element={<RecurringPage />} />
              <Route path="import" element={<ImportPage />} />
              <Route path="debts" element={<DebtsPage />} />
              <Route path="debts/:creditorId" element={<CreditorPage />} />
              <Route path="payees" element={<PayeesPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
