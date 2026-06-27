import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Frequently asked questions about National Baseball Ratings.",
  alternates: { canonical: "/faq" },
};

const FAQS: { q: string; a: string }[] = [
  {
    q: "Is this free?",
    a: "Yes. Searching ratings and generating tournament pools are completely free and require no login.",
  },
  {
    q: "How do I add my team?",
    a: "Visit “Add a Team” and submit your GameChanger team ID (found in your team’s GameChanger URL). We’ll begin collecting scores; a rating appears once the team has played enough games.",
  },
  {
    q: "Why is my team marked “Provisional”?",
    a: "Provisional means we don’t yet have enough games to rate the team confidently. Play more games and the provisional flag goes away.",
  },
  {
    q: "Why did my team’s rating change when it didn’t play?",
    a: "Two reasons: long layoffs increase uncertainty (rating deviation), and your opponents’ ratings can shift as they play, which changes the strength of your past results.",
  },
  {
    q: "How does the pool generator keep pools fair?",
    a: "It sorts teams by rating and distributes them with serpentine (snake) seeding, guaranteeing the strongest teams are split across different pools — then fine-tunes to keep total pool strength as even as possible.",
  },
  {
    q: "Are you affiliated with GameChanger?",
    a: "No. National Baseball Ratings is independent and is not affiliated with, endorsed by, or sponsored by GameChanger Media, Inc. or any league.",
  },
  {
    q: "How often are ratings updated?",
    a: "Roughly weekly to semi-weekly.",
  },
];

export default function FaqPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-black text-navy-900">Frequently asked questions</h1>
      <div className="mt-6 space-y-4">
        {FAQS.map((f) => (
          <details key={f.q} className="card p-5">
            <summary className="cursor-pointer font-semibold text-navy-900">{f.q}</summary>
            <p className="mt-2 text-slate-600">{f.a}</p>
          </details>
        ))}
      </div>
    </article>
  );
}
