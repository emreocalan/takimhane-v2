export default function Select({
  label,
  error,
  required,
  options = [],
  placeholder = 'Seçiniz…',
  className = '',
  ...props
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label className="block text-xs font-medium uppercase tracking-wider text-slate-400">
          {label}{required && <span className="ml-1 text-red-400">*</span>}
        </label>
      )}
      <select
        {...props}
        className={`
          w-full rounded-lg border px-3 py-2.5 text-sm text-white
          bg-slate-700 transition-colors
          ${error
            ? 'border-red-500 focus:ring-red-500'
            : 'border-slate-600 focus:border-blue-500 focus:ring-blue-500'
          }
          focus:outline-none focus:ring-1 disabled:opacity-50
        `}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
