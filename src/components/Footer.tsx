import { Link } from 'react-router-dom';
import { BrandMark, Wordmark } from './Brand';

/** Colophon at the end of every page. */
export function Footer() {
  return (
    <footer className="site-footer">
      <Link to="/" className="footer-brand" aria-label="GenAI.learn, home">
        <BrandMark size={22} />
        <Wordmark />
      </Link>
      <span className="footer-copy">Less reading, more practising. Your progress stays in this browser.</span>
    </footer>
  );
}
