export type UserRole = "family" | "nurse";

export const authRoleCookie = "tka-role";

type AuthMetadata = Record<string, unknown> | null | undefined;

type AuthUserLike = {
  app_metadata?: AuthMetadata;
  user_metadata?: AuthMetadata;
} | null | undefined;

export function isUserRole(value: unknown): value is UserRole {
  return value === "family" || value === "nurse";
}

export function roleFromAuthUser(user: AuthUserLike): UserRole | null {
  const appRole = user?.app_metadata?.role;

  return isUserRole(appRole) ? appRole : null;
}

export function resolveAuthRole(user: AuthUserLike, cookieRole: unknown): UserRole | null {
  if (user) {
    return roleFromAuthUser(user);
  }

  return isUserRole(cookieRole) ? cookieRole : null;
}

export function defaultPathForRole(role: UserRole) {
  return role === "family" ? "/family" : "/nurse";
}
