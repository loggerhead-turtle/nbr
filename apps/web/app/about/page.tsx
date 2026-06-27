import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How the Ratings Work",
  description:
    "How National Baseball Ratings are calculated: a Glicko-2 statistical model that rates teams by who they played and how they did.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-black text-navy-900">How the ratings work</h1>
      <p className="mt-4 text-slate-600">
        The National Baseball Ratings (NBR) measure team strength from game results — not
        reputation, region, or record alone. Beating a strong team helps your rating far more
        than beating a weak one, and every result is weighed by how certain we are about both
        teams.
      </p>

      <Section title="The model: Glicko-2">
        We use <strong>Glicko-2</strong>, a modern, peer-reviewed rating system (an evolution of
        Elo). Each team has three numbers:
        <ul className="ml-5 mt-3 list-disc space-y-1">
          <li>
            <strong>Rating</strong> — overall strength. New teams start at 1500.
          </li>
          <li>
            <strong>Rating deviation (RD)</strong> — how confident we are. It shrinks as a team
            plays and grows during long layoffs.
          </li>
          <li>
            <strong>Volatility</strong> — how erratic a team’s results have been.
          </li>
        </ul>
      </Section>

      <Section title="Provisional ratings">
        Teams with very few games, or long periods of inactivity, are marked{" "}
        <em>Provisional</em>. Their ratings are shown but treated cautiously and kept out of the
        default ranking until we have enough data to be confident.
      </Section>

      <Section title="Strength of schedule & connectivity">
        A rating only means something relative to the teams you’ve played and the teams they’ve
        played. When two groups of teams never face each other, their ratings aren’t directly
        comparable yet — tournament games are the bridges that connect everyone. Early in a
        season, expect ratings to move as the web of results fills in.
      </Section>

      <Section title="Home field & margin">
        We apply a small home-field adjustment for non-neutral games and none for neutral-site
        tournament games. The core model rewards winning and losing; blowouts are not rewarded
        disproportionately.
      </Section>

      <Section title="Where the data comes from">
        Scores are compiled from publicly available game results and from games entered by our
        team. Ratings are recalculated on a weekly to semi-weekly basis.
      </Section>

      <p className="mt-8 rounded-lg bg-slate-100 p-4 text-sm text-slate-500">
        Ratings are statistical estimates provided for informational purposes only. See our{" "}
        <a href="/terms" className="font-medium text-navy-700 underline">
          Terms of Service
        </a>
        .
      </p>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-bold text-navy-900">{title}</h2>
      <div className="mt-2 text-slate-600">{children}</div>
    </section>
  );
}
