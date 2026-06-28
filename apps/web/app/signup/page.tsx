import type { Metadata } from "next";
import { SignupForm } from "@/components/account/auth-forms";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <div className="mx-auto max-w-6xl px-4">
      <SignupForm next={next} />
    </div>
  );
}
