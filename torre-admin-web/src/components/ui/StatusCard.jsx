const styles = {
  empty: {
    icon: '✦',
    iconClass: 'bg-slate-100 text-slate-500',
    cardClass: 'border-slate-200 from-white to-slate-50',
  },
  error: {
    icon: '!',
    iconClass: 'bg-red-100 text-red-700',
    cardClass: 'border-red-200 from-white to-red-50',
  },
  warning: {
    icon: '!',
    iconClass: 'bg-amber-100 text-amber-700',
    cardClass: 'border-amber-200 from-white to-amber-50',
  },
  info: {
    icon: 'i',
    iconClass: 'bg-blue-100 text-blue-700',
    cardClass: 'border-blue-200 from-white to-blue-50',
  },
  loading: {
    icon: null,
    iconClass: 'bg-blue-100 text-blue-700',
    cardClass: 'border-blue-100 from-white to-blue-50',
  },
};

export default function StatusCard({
  type = 'info',
  title,
  children,
  compact = false,
  className = '',
}) {
  const style = styles[type] || styles.info;

  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      className={`flex items-center gap-4 rounded-2xl border bg-gradient-to-br shadow-sm ${
        compact ? 'p-3' : 'p-6 sm:p-8'
      } ${style.cardClass} ${className}`}
    >
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg font-bold ${style.iconClass}`}>
        {type === 'loading' ? (
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
        ) : style.icon}
      </span>
      <div className="min-w-0">
        {title && (
          <p className="font-semibold text-slate-800">{title}</p>
        )}
        {children && (
          <div className={`${title ? 'mt-0.5' : ''} text-sm text-slate-600`}>
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
