/** Shared styling wrapper for legal/long-form text pages. */
export function LegalProse({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-black text-navy-900">{title}</h1>
      <p className="mt-1 text-sm text-slate-400">Last updated: {updated}</p>
      <div className="legal mt-6 space-y-5 text-sm leading-relaxed text-slate-600 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-navy-900 [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-slate-800">
        {children}
      </div>
    </article>
  );
}
