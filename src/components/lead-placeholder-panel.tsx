import { Clock, Info } from "lucide-react";

type LeadPlaceholderPanelProps = {
  eyebrow: string;
  title: string;
  description: string;
};

export function LeadPlaceholderPanel({
  eyebrow,
  title,
  description,
}: LeadPlaceholderPanelProps) {
  return (
    <section className="rounded-[2.5rem] border border-stone-900/10 bg-white p-8 shadow-2xl shadow-stone-900/5 transition-all hover:shadow-stone-900/10">
      <div className="flex items-center gap-2 text-[10px] font-bold tracking-widest text-stone-400 uppercase">
        <Clock className="h-3 w-3" />
        {eyebrow}
      </div>
      <h3 className="mt-4 text-2xl font-semibold tracking-tight text-stone-900">
        {title}
      </h3>
      <p className="mt-4 text-sm leading-relaxed text-stone-500 italic">
        {description}
      </p>
      
       <div className="mt-8 flex items-center gap-3 rounded-2xl border border-stone-100 bg-stone-50/50 p-4">
         <Info className="h-4 w-4 text-stone-400 shrink-0" />
         <p className="text-[10px] font-bold text-stone-400 uppercase tracking-tighter">
            Processing is still running. We will retry automatically if this stage fails.
         </p>
      </div>
    </section>
  );
}
