import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { env, OWNER_USERNAME } from '../../lib/env';
import { supabase } from '../../lib/supabase';

interface AuthState {
  session: Session | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  async function signIn(username: string, password: string) {
    if (username !== OWNER_USERNAME) throw new Error('ชื่อผู้ใช้ไม่ถูกต้อง');
    const { error } = await supabase.auth.signInWithPassword({ email: env.ownerEmail, password });
    if (error) throw new Error('รหัสผ่านไม่ถูกต้อง');
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return <AuthContext.Provider value={{ session, loading, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** User id of the signed-in owner; only call inside authenticated routes. */
export function useUserId(): string {
  const { session } = useAuth();
  if (!session) throw new Error('Not signed in');
  return session.user.id;
}
