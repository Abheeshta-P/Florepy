import { Link, useNavigate, useOutletContext } from "react-router";
import Button from "./ui/Button";
import { User, LogOut } from "lucide-react";

function NavBar() {
  const {isSignedIn, isAuthLoading, userName, signIn, signOut} = useOutletContext<AuthContext>()
  const navigate = useNavigate();

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
              <div className="flex items-center gap-3">
                <div 
                  className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold border border-primary/20"
                  title={userName ? `Signed in as ${userName}` : "Signed in"}
                >
                  {userName ? userName.charAt(0).toUpperCase() : <User size={14} />}
                </div>
                
                <button 
                  onClick={handleAuthClick} 
                  className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                  title="Log Out"
                >
                  <LogOut size={16} />
                </button>
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