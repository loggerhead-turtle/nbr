import type { Metadata } from "next";
import { LoginForm } from "@/components/admin/login-form";

export const metadata: Metadata = { title: "Admin sign in", robots: { index: false } };

export default function AdminLoginPage() {
  return (
    <div className="mx-auto max-w-6xl px-4">
      <LoginForm />
    </div>
  );
}
