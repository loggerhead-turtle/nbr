import Link from "next/link";

const NAV = [
  { href: "/", label: "Ratings" },
  { href: "/pools", label: "Pool Generator" },
  { href: "/submit-team", label: "Add Team" },
  { href: "/about", label: "About" },
  { href: "/account", label: "Coaches" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-navy-900/10 bg-navy-900 text-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-diamond-600 text-lg font-black">
            ⚾
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-bold tracking-wide">National Baseball</span>
            <span className="block text-xs font-medium uppercase tracking-[0.2em] text-navy-100">
              Ratings
            </span>
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-sm font-medium sm:gap-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-navy-100 transition hover:bg-white/10 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
