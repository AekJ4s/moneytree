import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { OWNER_USERNAME } from '../../lib/env';
import { useAuth } from './AuthProvider';

export function LoginPage() {
  const { session, signIn } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(OWNER_USERNAME, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="text-center">
          <div className="text-3xl">🌳</div>
          <h1 className="mt-1 text-xl font-semibold text-emerald-700">MoneyTree</h1>
          <p className="text-sm text-slate-500">บันทึกการเงินส่วนตัว</p>
        </div>
        <label className="block">
          <span className="text-sm text-slate-600">ชื่อผู้ใช้</span>
          <input className="input mt-1 bg-slate-100 text-slate-500" value={OWNER_USERNAME} readOnly autoComplete="username" />
        </label>
        <label className="block">
          <span className="text-sm text-slate-600">รหัสผ่าน</span>
          <input
            className="input mt-1"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            autoFocus
            required
          />
        </label>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button className="btn-primary w-full" disabled={busy || !password}>
          {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
        </button>
      </form>
    </div>
  );
}
