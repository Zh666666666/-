export function hasUsableDatabaseUrl() {
  const value = process.env.DATABASE_URL;

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
