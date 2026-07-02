import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Frequently asked questions about National Baseball Ratings.",
  alternates: { canonical: "/faq" },
};

const FAQS: { q: string; a: string }[] = [
  {
    q: "Is this free?",
    a: "Yes. Looking up the NBR and generating tournament pools are completely free and require no login.",
  },
  {
    q: "How do I add my team?",
    a: "Visit “Add a Team” and submit your team’s details. Once it has played enough games, an NBR appears.",
  },
  {
    q: "Why is my team marked “Provisional”?",
    a: "Provisional means we don’t yet have enough games — about 5 — to set the team’s NBR confidently. Play more games and the provisional flag goes away.",
  },
  {
    q: "Why did my team’s NBR change when it didn’t play?",
    a: "The NBR is recomputed from the whole web of results each cycle. When your opponents (and their opponents) play, their NBR shifts — which changes the strength of the teams you beat or lost to, and therefore your NBR. Recent games are also weighted more heavily over time.",
  },
  {
    q: "How does the pool generator keep pools fair?",
    a: "It sorts teams by NBR and distributes them with serpentine (snake) seeding, guaranteeing the strongest teams are split across different pools — then fine-tunes to keep total pool strength as even as possible.",
  },
  {
    q: "Does margin of victory matter?",
    a: "Yes, but it’s capped at 7 runs — winning by 7 counts the same as winning by 15, so running up the score never pads your NBR.",
  },
  {
    q: "Are you affiliated with GameChanger?",
    a: "No. National Baseball Ratings is independent and is not affiliated with, endorsed by, or sponsored by GameChanger Media, Inc. or any league.",
  },
  {
    q: "How often is the NBR updated?",
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
