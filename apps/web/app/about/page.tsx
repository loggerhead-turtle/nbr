import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How the Ratings Work",
  description:
    "How National Baseball Ratings are calculated: a global statistical model that rates every team from the full web of game results.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-black text-navy-900">How the ratings work</h1>
      <p className="mt-4 text-slate-600">
        The National Baseball Ratings (NBR) measure team strength from game results — not
        reputation, region, or record alone. Beating a strong team helps far more than beating a
        weak one, and the rating reflects <em>who</em> you played, not just whether you won.
      </p>

      <Section title="One global model, not head-to-head">
        Most teams never play each other directly. NBR doesn’t need them to. We solve the{" "}
        <strong>entire web of games at once</strong> — a single statistical model finds the one set
        of ratings that best explains every result across the whole state. Strength flows through{" "}
        <strong>chains of common opponents</strong>: if your opponents beat the teams that beat
        other teams, that all feeds your rating. Tournaments are the bridges that connect everyone
        into one comparable pool.
      </Section>

      <Section title="Margin of victory (capped)">
        A blowout says more than a one-run nail-biter, so bigger wins move the needle more — but
        with <strong>diminishing returns</strong>. Winning 12–2 counts well above winning 6–5;
        winning 25–0 counts barely more than 12–2. Running up the score doesn’t pad your rating.
      </Section>

      <Section title="Hard to game">
        Because every team is solved together from the same web of results, there’s no easy way to
        inflate a rating. <strong>Quality of opponent is what counts</strong> — beating weak teams
        barely moves you, and padding the schedule with easy wins can even lower your rating relative
        to teams testing themselves against tougher fields. Running up the score doesn’t help (margin
        is capped), and old results fade as recent games take over. The most reliable way up is
        simple: <strong>play good teams and beat them</strong>.
      </Section>

      <Section title="Recent games matter most">
        Ratings are recalculated regularly and <strong>weight recent games more heavily</strong>,
        so they move week to week as the season unfolds. A team that’s rolling climbs; a team
        that’s slipping falls. No one stays on top on reputation — you have to keep winning.
      </Section>

      <Section title="Confidence & provisional ratings">
        Teams with only a handful of games are shown as <em>Provisional</em> and treated
        cautiously (and kept out of the default ratings) until there’s enough data to be
        confident. Every team also carries a confidence level based on how much it has played.
      </Section>

      <Section title="Carrying over between seasons">
        Most clubs register a new team each year (e.g. 13U → 14U). When a team links its new
        season to its old one, its rating <strong>carries forward</strong> as a starting point
        rather than resetting — then quickly adjusts as the new season’s games come in.
      </Section>

      <Section title="Strength of schedule & connectivity">
        A rating is only meaningful relative to a connected web of opponents. Early in a season,
        before tournaments link everyone together, separate groups of teams aren’t directly
        comparable — expect ratings to settle as the season’s results fill in.
      </Section>

      <Section title="Comparing across age groups">
        An 8U team and a 16U team shouldn’t land on the same number just because each dominates
        its own bracket. NBR places every age group on <strong>one developmental scale</strong>,
        so an average older team sits above an average younger one. The size of each step is
        learned from the games where teams <strong>play up</strong> against an older age group —
        those cross-age matchups are the bridges that line the brackets up. Because strong young
        teams are the ones that tend to play up, the scale is held to a sensible, always-increasing
        curve so a single upset can’t flip an entire age group above an older one. Comparisons{" "}
        <strong>within</strong> an age group are always the most reliable; cross-age numbers firm
        up as more teams play up. Filter by age group for the most direct comparison.
      </Section>

      <Section title="Where the data comes from">
        Scores are compiled from publicly available game results and from games entered by our
        team. Ratings are refreshed on a weekly to semi-weekly basis.
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
