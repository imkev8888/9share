import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { Logo } from "@/components/icons";
import { LegalLinks } from "@/components/legal-links";
import { createClient } from "@/lib/supabase/server";

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2.5">
          <Logo className="h-10 w-10" />
          <span className="text-2xl font-extrabold tracking-tight text-ink">
            9share
          </span>
        </Link>

        <div className="glass-strong rounded-3xl p-7 sm:p-9">
          <h1 className="mb-1 text-center text-2xl font-extrabold text-ink">
            Welcome
          </h1>
          <p className="mb-6 text-center text-sm text-ink-soft">
            My Chu Chu Mui
          </p>
          <Suspense fallback={<div className="h-80" />}>
            <AuthForm />
          </Suspense>
        </div>

        <div className="mt-6 space-y-3 text-center">
          <p className="text-xs text-ink-soft">
            Created by Kelvin Ng with love.
          </p>
          <LegalLinks />
        </div>
      </div>
    </div>
  );
}
