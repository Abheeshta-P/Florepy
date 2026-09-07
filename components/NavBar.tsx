import { Link, useNavigate, useOutletContext } from "react-router";
import Button from "./ui/Button";
import { User, LogOut } from "lucide-react";
import { useState, useRef, useEffect } from "react";

function NavBar() {
  const {isSignedIn, isAuthLoading, userName, signIn, signOut} = useOutletContext<AuthContext>()
  const navigate = useNavigate();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleAuthClick = async()=> {
    if (isSignedIn) {
      try {
        await signOut();
        navigate("/");
      } catch (error) {
        console.error(`Puter sign out failed: ${error}`)
      }
      return;
    }

    try {
      const success = await signIn();
      if (success) navigate("/dashboard");
    } catch (error) {
      console.error(`Puter sign in failed: ${error}`);
    }
  }

  return (
    <header className="navbar">
      <nav className="inner">
        <div className="left">
          <Link to="/" className="brand">
            <img src="/florepy.png" alt="Logo" width={35} height={35} />
            <span className="name">Florepy</span>
          </Link>
          <ul className="links">
            <a href="/#hero">Home</a>
            <a href="/#upload">Upload</a>
            <a href="/#gallery">Community</a>
            {isSignedIn && !isAuthLoading && <Link to="/dashboard">Dashboard</Link>}
          </ul>
        </div>
        <div className="actions">
          {isAuthLoading ? (
            <div className="flex space-x-3 items-center">
              <div className="w-8 h-8 bg-zinc-200 animate-pulse rounded-full"></div>
            </div>
          ) : isSignedIn ? (
            <>
              <div className="relative" ref={dropdownRef}>
                <div 
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold cursor-pointer border border-primary/20 hover:bg-primary hover:text-white transition-colors"
                >
                  {userName ? userName.charAt(0).toUpperCase() : <User size={16} />}
                </div>
                
                {isDropdownOpen && (
                  <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-zinc-200 rounded-lg shadow-xl z-50 p-3">
                    <div className="border-b border-zinc-100 pb-3 mb-3">
                      <p className="text-xs text-zinc-500 mb-1">Signed in as</p>
                      <p className="text-sm font-semibold text-zinc-800 truncate">{userName || "User"}</p>
                    </div>
                    <Button onClick={handleAuthClick} size="sm" className="btn w-full">
                      Log Out
                    </Button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Button onClick={handleAuthClick} size="sm" variant="ghost">
                Log In
              </Button>
              <Button onClick={handleAuthClick} size="sm" className="cta">
                Get Started
              </Button>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}

export default NavBar