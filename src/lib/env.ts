type RuntimeEnvironment = Partial<Pick<NodeJS.ProcessEnv,
  | "APP_MODE"
  | "NEXT_PUBLIC_APP_MODE"
  | "NODE_ENV"
  | "DATABASE_URL"
  | "NEXT_PUBLIC_SUPABASE_URL"
  | "NEXT_PUBLIC_SUPABASE_ANON_KEY"
>>;

export type AppMode = "demo" | "production" | "invalid";

export function resolveAppMode(env: RuntimeEnvironment = process.env): AppMode {
  const configuredMode = env.APP_MODE ?? env.NEXT_PUBLIC_APP_MODE;

  if (configuredMode === "demo" || configuredMode === "production") {
    return configuredMode;
  }

  return env.NODE_ENV === "production" ? "invalid" : "demo";
}

export function isDemoMode(env: RuntimeEnvironment = process.env) {
  return resolveAppMode(env) === "demo";
}

export function hasUsableDatabaseUrl(env: RuntimeEnvironment = process.env) {
  const value = env.DATABASE_URL;

  if (!value || value.includes("[") || value.includes("]")) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "postgresql:" || url.protocol === "postgres:";
  } catch {
    return false;
  }
}

export function hasSupabaseAuthConfiguration(env: RuntimeEnvironment = process.env) {
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function getRuntimeReadiness(env: RuntimeEnvironment = process.env) {
  const mode = resolveAppMode(env);
  const issues: string[] = [];

  if (mode === "invalid") {
    issues.push("APP_MODE must be explicitly set to demo or production.");
  }

  if (mode === "production") {
    if (!hasUsableDatabaseUrl(env)) {
      issues.push("A valid DATABASE_URL is required in production mode.");
    }

    if (!hasSupabaseAuthConfiguration(env)) {
      issues.push("Supabase URL and anonymous key are required in production mode.");
    }
  }

  return {
    mode,
    ready: issues.length === 0,
    durableStorage: mode === "production" && hasUsableDatabaseUrl(env),
    authentication: mode === "production" && hasSupabaseAuthConfiguration(env),
    issues,
  };
}
