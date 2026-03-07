interface LivePortalPageProps {
  params: Promise<{ tournamentId: string }>
}

export default async function LivePortalPage({ params }: LivePortalPageProps) {
  const { tournamentId } = await params

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-50">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl shadow-slate-950/40">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-400">
            Live Portal Disabled
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            This live portal is temporarily unavailable.
          </h1>
        </div>

        <p className="max-w-2xl text-base leading-7 text-slate-300">
          The live portal for tournament <span className="font-mono text-slate-200">{tournamentId}</span> has been
          disabled to reduce server load while production is being stabilized.
        </p>

        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Court TV, control center, and referee workflows remain the primary surfaces while this route is disabled.
        </div>
      </div>
    </main>
  )
}
