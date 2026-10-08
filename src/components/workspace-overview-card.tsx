type WorkspaceOverviewCardProps = {
  title: string;
  description: string;
};

export function WorkspaceOverviewCard({
  title,
  description,
}: WorkspaceOverviewCardProps) {
  return (
    <article className="rounded-[1.5rem] border border-stone-900/10 bg-white p-6 shadow-[0_18px_50px_rgba(70,56,24,0.08)]">
      <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-stone-600">{description}</p>
    </article>
  );
}
