import type { ReactNode } from 'react';

/**
 * KPI as a ledger figure: mono label · serif value · optional thin meter (with an optional threshold tick,
 * e.g. the pass mark) · context line.
 */
export function StatTile({ label, value, hint, meter, mark }: { label: string; value: ReactNode; hint?: ReactNode; meter?: number; mark?: number }) {
  return (
    <div className="dv-stat">
      <div className="dv-stat-label">{label}</div>
      <div className="dv-stat-value">{value}</div>
      {meter !== undefined && (
        <div className="dv-meter" aria-hidden>
          <span style={{ width: `${Math.max(0, Math.min(100, meter))}%` }} />
          {mark !== undefined && <i className="dv-meter-mark" style={{ left: `${Math.max(0, Math.min(100, mark))}%` }} />}
        </div>
      )}
      {hint && <div className="dv-stat-hint">{hint}</div>}
    </div>
  );
}
