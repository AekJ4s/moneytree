function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export const env = {
  supabaseUrl: required('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL),
  supabaseKey: required('VITE_SUPABASE_PUBLISHABLE_KEY', import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY),
  ownerEmail: required('VITE_OWNER_EMAIL', import.meta.env.VITE_OWNER_EMAIL),
};

/** The app is single-user: the login form always uses this username. */
export const OWNER_USERNAME = 'Jasdakorn';
