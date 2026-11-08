// Loading placeholder for lazy routes and viz widgets (M9): nothing for the first 200 ms (fast loads never flash),
// then a skeleton in the shape of what is coming, with one linear sheen. Reduced motion: static, no sheen.
import { useEffect, useState } from 'react';
import { SKELETON_DELAY } from '../lib/motion';

export function RouteSkeleton({ kind = 'page', label = 'Loading' }: { kind?: 'page' | 'shorts' | 'viz'; label?: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setShow(true), SKELETON_DELAY);
    return () => clearTimeout(t);
  }, []);
  if (!show) return kind === 'viz' ? <div className="skel-viz" aria-hidden /> : null;
  return (
    <div className={`skel skel-${kind}`} role="status" aria-label={label}>
      {kind === 'viz' ? (
        <>
          <span className="sk sk-line w40" />
          <span className="sk sk-block" />
          <span className="sk sk-line w70" />
        </>
      ) : (
        <>
          <span className="sk sk-line w30" />
          <span className="sk sk-title" />
          <span className="sk sk-line w70" />
          <div className="skel-grid">
            {Array.from({ length: kind === 'shorts' ? 6 : 3 }, (_, i) => (
              <span key={i} className={`sk ${kind === 'shorts' ? 'sk-thumb' : 'sk-card'}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
