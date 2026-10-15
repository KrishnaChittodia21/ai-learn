import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';

/** Site footer at the end of every page: brand on the left, copyright on the right. */
export function Footer() {
  return (
    <footer className="site-footer">
      <Link to="/" className="brand footer-brand">
        <span className="brand-tile" aria-hidden>
          <Sparkles size={15} strokeWidth={2.5} />
        </span>
        GenAI Learn
      </Link>
      <span className="footer-copy">© 2026 GenAI Learn: less reading, more practising</span>
    </footer>
  );
}
