import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/workspace";

export default async function Home() {
  const { userId } = await getAuthContext();

  if (userId) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(248,180,0,0.22),_transparent_34%),linear-gradient(135deg,_#f7f2e8_0%,_#efe6d5_42%,_#d6e0d4_100%)] px-6 py-12 text-stone-900">
      <div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-6xl flex-col justify-between rounded-[2.5rem] border border-stone-900/10 bg-white/75 p-8 shadow-[0_40px_100px_rgba(64,48,20,0.12)] backdrop-blur-md md:p-16">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-900">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <span className="text-xl font-bold tracking-tight">Ops Hub</span>
          </div>
          <div className="hidden items-center gap-8 md:flex">
            <a
              href="#features"
              className="text-sm font-medium text-stone-600 transition-colors hover:text-stone-900"
            >
              Features
            </a>
            <Link
              href="/sign-in"
              className="text-sm font-semibold text-stone-900 transition-opacity hover:opacity-70"
            >
              Sign in
            </Link>
          </div>
        </header>

        <section className="mt-20 grid gap-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="space-y-10">
            <div className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 text-xs font-bold tracking-widest text-amber-800 uppercase">
              AI-Powered Revenue Operations
            </div>
            <div className="space-y-6">
              <h1 className="max-w-3xl text-6xl leading-[0.95] font-semibold tracking-tight text-balance md:text-8xl">
                Automate your intake to close flow.
              </h1>
              <p className="max-w-xl text-xl leading-relaxed text-stone-600">
                Connect your forms, CRM, and documents. Let AI enrich, score, and
                route your leads with human oversight where it matters most.
              </p>
            </div>
            <div className="flex flex-wrap gap-4">
              <Link
                className="rounded-full bg-stone-900 px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-stone-900/20 transition-all duration-300 hover:scale-[1.02] hover:bg-stone-800 active:scale-95"
                href="/sign-up"
              >
                Get started for free
              </Link>
              <Link
                className="rounded-full border border-stone-900/10 bg-white/50 px-8 py-4 text-lg font-semibold text-stone-900 backdrop-blur transition-all duration-300 hover:bg-white hover:shadow-md active:scale-95"
                href="/sign-in"
              >
                Platform demo
              </Link>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-tr from-amber-200/20 to-stone-200/20 blur-2xl" />
            <aside className="relative rounded-[2rem] border border-stone-900/10 bg-stone-950 p-8 text-stone-50 shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-6">
                <div>
                  <p className="text-xs font-bold tracking-widest text-stone-500 uppercase">
                    Current Workflow
                  </p>
                  <p className="mt-1 text-lg font-medium text-stone-200">
                    Lead Processing Pipeline
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-red-500/50" />
                  <div className="h-2 w-2 rounded-full bg-amber-500/50" />
                  <div className="h-2 w-2 rounded-full bg-green-500/50" />
                </div>
              </div>

              <div className="mt-8 space-y-5">
                {[
                  {
                    label: "Intake",
                    value: "Verified / Webhook 200",
                    color: "bg-emerald-500/20 text-emerald-400",
                    delay: "0ms",
                  },
                  {
                    label: "Enrichment",
                    value: "Clearbit / 14 Fields Found",
                    color: "bg-blue-500/20 text-blue-400",
                    delay: "80ms",
                  },
                  {
                    label: "AI Scoring",
                    value: "High Fit / 94/100",
                    color: "bg-amber-500/20 text-amber-400",
                    delay: "160ms",
                  },
                  {
                    label: "CRM Sync",
                    value: "HubSpot / Active",
                    color: "bg-stone-800 text-stone-400",
                    delay: "240ms",
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="animate-slide-up flex items-center justify-between rounded-2xl border border-white/5 bg-white/[0.03] p-4 text-sm transition-colors hover:bg-white/[0.06]"
                    style={{ animationDelay: item.delay }}
                  >
                    <span className="font-medium text-stone-400">{item.label}</span>
                    <span
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${item.color}`}
                    >
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-8 border-t border-white/10 pt-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 p-0.5">
                    <div className="flex h-full w-full items-center justify-center rounded-full bg-stone-950">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        className="text-amber-500"
                      >
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-stone-200">
                      AI Trust Guarantee
                    </p>
                    <p className="text-xs text-stone-500">
                      Human-in-the-loop validation active
                    </p>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </section>

        <section id="features" className="mt-32">
          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                title: "Precision Scoring",
                body: "Our AI evaluates leads against your Ideal Customer Profile with reasoning you can audit and trust.",
                icon: (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 20V10M18 20V4M6 20v-4" />
                  </svg>
                ),
              },
              {
                title: "Deep Enrichment",
                body: "Automatically pull firmographic data, technologies, and LinkedIn profiles for every inbound signal.",
                icon: (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v8M8 12h8" />
                  </svg>
                ),
              },
              {
                title: "Document OCR",
                body: "Extract structured data from invoices and contracts directly into your operational workflow.",
                icon: (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                ),
              },
            ].map((feature) => (
              <article
                key={feature.title}
                className="group rounded-[2rem] border border-stone-900/10 bg-white/40 p-8 transition-all duration-300 hover:bg-white hover:shadow-xl hover:shadow-stone-900/5"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-900 text-white transition-transform duration-300 group-hover:-translate-y-1">
                  {feature.icon}
                </div>
                <h2 className="mt-6 text-xl font-bold text-stone-900">
                  {feature.title}
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-stone-600">
                  {feature.body}
                </p>
              </article>
            ))}
          </div>
        </section>

        <footer className="mt-32 flex flex-col items-center justify-between gap-4 border-t border-stone-900/5 pt-8 text-sm text-stone-500 md:flex-row">
          <p>&copy; 2026 Ops Automation Hub. Built for professional RevOps teams.</p>
          <div className="flex gap-8 font-medium">
            <a href="#" className="transition-colors hover:text-stone-900">
              Privacy Policy
            </a>
            <a href="#" className="transition-colors hover:text-stone-900">
              Terms of Service
            </a>
            <a href="#" className="transition-colors hover:text-stone-900">
              Contact Support
            </a>
          </div>
        </footer>
      </div>
    </main>
  );
}
