export type UserRole = "patient" | "nurse";

export const authRoleCookie = "tka-role";

type AuthMetadata = Record<string, unknown> | null | undefined;

type AuthUserLike = {
  app_metadata?: AuthMetadata;
  user_metadata?: AuthMetadata;
} | null | undefined;

export function isUserRole(value: unknown): value is UserRole {
  return value === "patient" || value === "nurse";
}

export function roleFromAuthUser(user: AuthUserLike): UserRole | null {
  const appRole = user?.app_metadata?.role;
  const userRole = user?.user_metadata?.role;

  if (isUserRole(appRole)) {
    return appRole;
  }

  return isUserRole(userRole) ? userRole : null;
}

export function resolveAuthRole(user: AuthUserLike, cookieRole: unknown): UserRole | null {
  return roleFromAuthUser(user) ?? (isUserRole(cookieRole) ? cookieRole : null);
}

export function defaultPathForRole(role: UserRole) {
  return role === "patient" ? "/elder" : "/nurse";
}
