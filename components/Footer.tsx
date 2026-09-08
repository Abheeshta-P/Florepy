import { Link } from "react-router";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <img src="/florepy.png" alt="Florepy" width={28} height={28} />
          <span>Florepy</span>
        </div>
        <p className="footer-copy">
          &copy; {new Date().getFullYear()} Florepy. All rights reserved.
        </p>
        <div className="footer-links">
          <Link to="/community">Community</Link>
          <a href="mailto:eventra.sass+florepy@gmail.com">Contact</a>
        </div>
      </div>
    </footer>
  );
}
