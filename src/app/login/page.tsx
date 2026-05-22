import { Suspense } from "react";

import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-[#f4efe5] text-[#4c5b50]">正在加载登录页...</main>}>
      <LoginForm />
    </Suspense>
  );
}
