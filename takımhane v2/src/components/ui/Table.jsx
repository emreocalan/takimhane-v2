export function Table({ columns, data, onRowClick, emptyText = 'Kayıt bulunamadı' }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-700">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700 bg-slate-800/50">
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400"
                style={{ width: col.width }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/50">
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-slate-500">
                {emptyText}
              </td>
            </tr>
          ) : data.map((row, i) => (
            <tr
              key={row.id ?? i}
              onClick={() => onRowClick?.(row)}
              className={`bg-slate-800 transition-colors ${onRowClick ? 'cursor-pointer hover:bg-slate-700/60' : ''}`}
            >
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-3 text-slate-200">
                  {col.render ? col.render(row[col.key], row) : row[col.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function StatusBadge({ status, map }) {
  const item = map[status] ?? { label: status, cls: 'badge-info' }
  return <span className={item.cls}>{item.label}</span>
}
