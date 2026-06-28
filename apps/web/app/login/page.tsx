import type { Metadata } from "next";
import { LoginForm } from "@/components/account/auth-forms";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <div className="mx-auto max-w-6xl px-4">
      <LoginForm next={next} />
    </div>
  );
}
