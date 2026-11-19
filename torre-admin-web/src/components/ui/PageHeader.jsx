export default function PageHeader({
  title,
  description,
  icon,
  eyebrow = 'Torre Admin',
  action,
}) {
  return (
    <section className="relative isolate mb-6 overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-br from-white via-white to-blue-50 p-5 shadow-sm sm:p-6">
      <div className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-blue-100/60 blur-2xl" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          {icon && (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-2xl text-white shadow-md shadow-blue-200">
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-blue-600">
              {eyebrow}
            </p>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              {title}
            </h1>
            {description && (
              <p className="mt-1 text-sm text-slate-600">{description}</p>
            )}
          </div>
        </div>
        {action && <div className="self-end shrink-0 sm:self-auto">{action}</div>}
      </div>
    </section>
  );
}
