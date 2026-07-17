type RuntimeEnvironment = Partial<Pick<NodeJS.ProcessEnv,
  | "APP_MODE"
  | "AUTH_MODE"
  | "NEXT_PUBLIC_APP_MODE"
  | "NODE_ENV"
  | "DATABASE_URL"
  | "GATEWAY_API_TOKEN"
  | "LOCAL_AUTH_SESSION_SECRET"
  | "LOCAL_FAMILY_EMAIL"
  | "LOCAL_FAMILY_PASSWORD"
  | "LOCAL_NURSE_EMAIL"
  | "LOCAL_NURSE_PASSWORD"
  | "NEXT_PUBLIC_SUPABASE_URL"
  | "NEXT_PUBLIC_SUPABASE_ANON_KEY"
>>;

export type AppMode = "demo" | "production" | "invalid";
export type AuthMode = "demo" | "local" | "supabase" | "invalid";

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

export function resolveAuthMode(env: RuntimeEnvironment = process.env): AuthMode {
  if (resolveAppMode(env) === "demo") return "demo";
  if (env.AUTH_MODE === "local" || env.AUTH_MODE === "supabase") return env.AUTH_MODE;
  return "invalid";
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

export function hasLocalAuthConfiguration(env: RuntimeEnvironment = process.env) {
  return Boolean(
    env.LOCAL_AUTH_SESSION_SECRET && env.LOCAL_AUTH_SESSION_SECRET.length >= 32
      && env.LOCAL_FAMILY_EMAIL
      && env.LOCAL_FAMILY_PASSWORD && env.LOCAL_FAMILY_PASSWORD.length >= 12
      && env.LOCAL_NURSE_EMAIL
      && env.LOCAL_NURSE_PASSWORD && env.LOCAL_NURSE_PASSWORD.length >= 12,
  );
}

export function hasGatewayApiToken(env: RuntimeEnvironment = process.env) {
  return Boolean(env.GATEWAY_API_TOKEN && env.GATEWAY_API_TOKEN.length >= 24);
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

    const authMode = resolveAuthMode(env);
    if (authMode === "invalid") {
      issues.push("AUTH_MODE must be explicitly set to local or supabase in production mode.");
    } else if (authMode === "local" && !hasLocalAuthConfiguration(env)) {
      issues.push("Local production authentication requires a session secret and two role credentials.");
    } else if (authMode === "supabase" && !hasSupabaseAuthConfiguration(env)) {
      issues.push("Supabase URL and anonymous key are required for Supabase authentication.");
    }

    if (!hasGatewayApiToken(env)) {
      issues.push("A GATEWAY_API_TOKEN of at least 24 characters is required in production mode.");
    }
  }

  return {
    mode,
    authMode: resolveAuthMode(env),
    ready: issues.length === 0,
    durableStorage: mode === "production" && hasUsableDatabaseUrl(env),
    authentication: mode === "production" && (
      (resolveAuthMode(env) === "local" && hasLocalAuthConfiguration(env))
      || (resolveAuthMode(env) === "supabase" && hasSupabaseAuthConfiguration(env))
    ),
    gatewayAuthentication: mode === "production" && hasGatewayApiToken(env),
    issues,
  };
}
