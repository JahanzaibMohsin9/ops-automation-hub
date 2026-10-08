type SectionPlaceholderProps = {
  eyebrow: string;
  title: string;
  description: string;
};

export function SectionPlaceholder({
  eyebrow,
  title,
  description,
}: SectionPlaceholderProps) {
  return (
    <section className="rounded-[1.75rem] border border-dashed border-stone-900/15 bg-[linear-gradient(180deg,_rgba(248,180,0,0.08)_0%,_rgba(255,255,255,0.9)_100%)] p-10">
      <p className="text-sm font-semibold tracking-[0.26em] text-stone-500 uppercase">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-4xl font-semibold tracking-tight text-balance">
        {title}
      </h2>
      <p className="mt-4 max-w-2xl text-base leading-7 text-stone-600">
        {description}
      </p>
    </section>
  );
}
