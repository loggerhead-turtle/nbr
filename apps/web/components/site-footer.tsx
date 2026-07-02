import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-sm font-bold text-navy-900">National Baseball Ratings</p>
            <p className="mt-2 text-sm text-slate-500">
              An independent, data-driven NBR for amateur baseball teams — built to
              make tournament pools fair and to help teams find balanced scrimmages.
            </p>
          </div>
          <FooterCol
            title="Explore"
            links={[
              { href: "/", label: "Team NBR" },
              { href: "/pools", label: "Pool Generator" },
              { href: "/about", label: "How the NBR Works" },
            ]}
          />
          <FooterCol
            title="Help"
            links={[
              { href: "/faq", label: "FAQ" },
              { href: "/submit-team", label: "Add a Team" },
            ]}
          />
          <FooterCol
            title="Legal"
            links={[
              { href: "/terms", label: "Terms of Service" },
              { href: "/privacy", label: "Privacy Policy" },
            ]}
          />
        </div>
        <div className="mt-8 border-t border-slate-100 pt-6 text-xs text-slate-400">
          <p>
            © {new Date().getFullYear()} National Baseball Ratings. The NBR is a set of
            estimates provided “as is” for informational purposes only. Not affiliated with,
            endorsed by, or sponsored by GameChanger Media, Inc. or any league.
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</p>
      <ul className="mt-3 space-y-2 text-sm">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="text-slate-600 hover:text-navy-800">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
