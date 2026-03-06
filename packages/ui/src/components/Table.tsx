import type { PropsWithChildren, ReactNode } from 'react';

interface Column<T> {
  key: string;
  header: ReactNode;
  render?: (row: T, idx: number) => ReactNode;
  align?: 'left' | 'center' | 'right';
  width?: string | number;
}

interface TableProps<T extends Record<string, unknown>> {
  columns: Column<T>[];
  rows: T[];
  rowKey?: (row: T, idx: number) => string | number;
  caption?: string;
  className?: string;
  empty?: ReactNode;
  loading?: boolean;
}

export function Table<T extends Record<string, unknown>>({
  columns,
  rows,
  rowKey,
  caption,
  className = '',
  empty = 'No data.',
  loading = false,
}: TableProps<T>) {
  return (
    <div className={`table-wrap ${className}`.trim()}>
      <table className="ghost-table" aria-busy={loading}>
        {caption && <caption className="ghost-table-caption">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                style={{ textAlign: col.align ?? 'left', width: col.width }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="table-state">
                <span className="pulse" /> Loading…
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="table-state muted">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, idx) => (
              <tr key={rowKey ? rowKey(row, idx) : idx}>
                {columns.map((col) => (
                  <td key={col.key} style={{ textAlign: col.align ?? 'left' }}>
                    {col.render
                      ? col.render(row, idx)
                      : (row[col.key] as ReactNode)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
