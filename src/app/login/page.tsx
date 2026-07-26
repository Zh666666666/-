import { Suspense } from "react";

import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[100dvh] items-center justify-center bg-canvas">
          <span className="flex items-center gap-3 text-sm text-[var(--muted-foreground)]">
            <span
              aria-hidden="true"
              className="size-4 animate-spin rounded-full border-2 border-[var(--hairline-strong)] border-t-ink-800"
            />
            正在加载登录页
          </span>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
