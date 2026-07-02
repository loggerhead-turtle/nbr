import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How the NBR Works",
  description:
    "How the NBR is calculated: a global statistical model that gives every amateur baseball team one number from the full web of game results.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-black text-navy-900">How the NBR works</h1>
      <p className="mt-4 text-slate-600">
        The National Baseball Ratings (NBR) measure team strength from game results — not
        reputation, region, or record alone. Beating a strong team helps far more than beating a
        weak one, and your NBR reflects <em>who</em> you played, not just whether you won.
      </p>

      <Section title="One global model, not head-to-head">
        Most teams never play each other directly. The NBR doesn’t need them to. We solve the{" "}
        <strong>entire web of games at once</strong> — a single statistical model finds the one set
        of numbers that best explains every result across the whole state. Strength flows through{" "}
        <strong>chains of common opponents</strong>: if your opponents beat the teams that beat
        other teams, that all feeds your NBR. Tournaments are the bridges that connect everyone
        into one comparable pool.
      </Section>

      <Section title="Margin of victory (capped at 7 runs)">
        A blowout says more than a one-run nail-biter, so bigger wins move the needle more — but
        with <strong>diminishing returns, and the margin is capped at 7 runs</strong>. Winning 12–2
        counts well above winning 6–5, but a 7-run win counts the same as winning by 15 or 25.
        Running up the score never pads your NBR.
      </Section>

      <Section title="Hard to game">
        Because every team is solved together from the same web of results, there’s no easy way to
        inflate an NBR. <strong>Quality of opponent is what counts</strong> — beating weak teams
        barely moves you, and padding the schedule with easy wins can even lower your NBR relative
        to teams testing themselves against tougher fields. Running up the score doesn’t help
        (margin is capped at 7 runs), and old results fade as recent games take over. The most
        reliable way up is simple: <strong>play good teams and beat them</strong>.
      </Section>

      <Section title="Recent games matter most">
        The NBR is recalculated regularly and <strong>weights recent games more heavily</strong>,
        so it moves week to week as the season unfolds. A team that’s rolling climbs; a team that’s
        slipping falls. No one stays on top on reputation — you have to keep winning.
      </Section>

      <Section title="Confidence & provisional teams">
        Teams with only a handful of games are shown as <em>Provisional</em> and treated
        cautiously (and kept out of the default NBR list) until there’s enough data to be
        confident — about 5 games. Every team also carries a confidence level based on how much it
        has played.
      </Section>

      <Section title="Carrying over between seasons">
        Most clubs register a new team each year (e.g. 13U → 14U). When a team links its new
        season to its old one, its NBR <strong>carries forward</strong> as a starting point rather
        than resetting — then quickly adjusts as the new season’s games come in.
      </Section>

      <Section title="Strength of schedule & connectivity">
        An NBR is only meaningful relative to a connected web of opponents. Early in a season,
        before tournaments link everyone together, separate groups of teams aren’t directly
        comparable — expect the NBR to settle as the season’s results fill in.
      </Section>

      <Section title="Comparing across age groups">
        An 8U team and a 16U team shouldn’t land on the same number just because each dominates its
        own bracket. The NBR places every age group on <strong>one developmental scale</strong>, so
        an average older team sits above an average younger one. The size of each step is learned
        from the games where teams <strong>play up</strong> against an older age group — those
        cross-age matchups are the bridges that line the brackets up. Because strong young teams are
        the ones that tend to play up, the scale is held to a sensible, always-increasing curve so a
        single upset can’t flip an entire age group above an older one. Comparisons{" "}
        <strong>within</strong> an age group are always the most reliable; cross-age numbers firm up
        as more teams play up. Filter by age group for the most direct comparison.
      </Section>

      <Section title="Where the data comes from">
        Scores are compiled from publicly available game results and from games entered by our
        team. The NBR is refreshed on a weekly to semi-weekly basis.
      </Section>

      <p className="mt-8 rounded-lg bg-slate-100 p-4 text-sm text-slate-500">
        The NBR is a set of statistical estimates provided for informational purposes only. See our{" "}
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
