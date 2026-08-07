function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required server environment variable: ${name}`);
  return value;
}

export const serverEnv = {
  get supabaseUrl() { return required("SUPABASE_URL"); },
  get supabaseServiceRoleKey() { return required("SUPABASE_SERVICE_ROLE_KEY"); },
  get workerTokenPepper() { return required("WORKER_TOKEN_PEPPER"); },
};

export function hasSupabaseConfiguration() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
