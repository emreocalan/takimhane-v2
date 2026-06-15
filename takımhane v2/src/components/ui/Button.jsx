const variants = {
  primary:   'bg-blue-600 text-white hover:bg-blue-500 shadow-sm shadow-blue-600/20',
  secondary: 'bg-slate-700 text-slate-100 hover:bg-slate-600 border border-slate-600',
  danger:    'bg-red-600 text-white hover:bg-red-500',
  ghost:     'text-slate-400 hover:bg-slate-800 hover:text-slate-100',
  success:   'bg-emerald-600 text-white hover:bg-emerald-500',
}

const sizes = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-6 py-3 text-base',
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  type = 'button',
  onClick,
  className = '',
  icon,
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`
        inline-flex items-center justify-center gap-2 rounded-lg font-medium
        transition-all active:scale-[.98] disabled:pointer-events-none disabled:opacity-50
        ${variants[variant]} ${sizes[size]} ${className}
      `}
    >
      {loading && (
        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {!loading && icon && <span>{icon}</span>}
      {children}
    </button>
  )
}
