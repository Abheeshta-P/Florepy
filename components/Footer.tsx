import { Link } from "react-router";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <img src="/florepy.png" alt="Florepy" className="w-4.5 h-4.5 sm:w-6 sm:h-6 shrink-0" width={24} height={24} />
          <span>Florepy</span>
        </div>
        <p className="footer-copy">
          &copy; {new Date().getFullYear()} Florepy<span className="hidden sm:inline">. All rights reserved.</span>
        </p>
        <div className="footer-links">
          <Link to="/community">Community</Link>
          <a href="mailto:eventra.sass+florepy@gmail.com">Contact</a>
        </div>
      </div>
    </footer>
  );
}
