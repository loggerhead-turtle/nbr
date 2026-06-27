import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <p className="text-6xl">⚾</p>
      <h1 className="mt-4 text-2xl font-black text-navy-900">Page not found</h1>
      <p className="mt-2 text-slate-500">
        We couldn’t find what you were looking for.
      </p>
      <Link href="/" className="btn-primary mt-6">
        Back to ratings
      </Link>
    </div>
  );
}
