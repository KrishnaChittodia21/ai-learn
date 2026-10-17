import { Link } from 'react-router-dom';

/** Colophon at the end of every page. */
export function Footer() {
  return (
    <footer className="site-footer">
      <Link to="/" className="footer-brand">
        GenAI <span>Field Manual</span>
      </Link>
      <span className="footer-copy">Less reading, more practising. Your progress stays in this browser.</span>
    </footer>
  );
}
