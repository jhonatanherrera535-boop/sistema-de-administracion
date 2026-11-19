export default function Button({ variant = 'primary', children, className = '', ...props }) {
  const variants = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm',
    secondary: 'border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium',
    danger: 'bg-red-600 hover:bg-red-700 text-white font-medium shadow-sm',
    ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-800 font-medium',
    success: 'bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm',
  };
  return (
    <button
      className={`px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}