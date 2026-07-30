import { useOutletContext } from "react-router";
import Button from "./ui/Button";

function NavBar() {
  const {isSignedIn, userName, signIn, signOut} = useOutletContext<AuthContext>()

  const handleAuthClick = async()=> {
    if (isSignedIn) {
      try {
        await signOut();
      } catch (error) {
        console.error(`Puter sign out failed: ${error}`)
      }
      return;
    }

    try {
      await signIn();
    } catch (error) {
      console.error(`Puter sign in failed: ${error}`);
    }
  }

  return (
    <header className="navbar">
      <nav className="inner">
        <div className="left">
          <div className="brand">
            <img src="/florepy.png" alt="Logo" width={35} height={35} />
            <span className="name">Florepy</span>
          </div>
          <ul className="links">
            <a href="#">Product</a>
            <a href="#">Pricing</a>
            <a href="#">Community</a>
            <a href="#">Enterprise</a>
          </ul>
        </div>
        <div className="actions">
          {isSignedIn ? (
            <>
              <span className="greeting">
                {userName ? `Hi ${userName}` : "Signed in"}
              </span>
              <Button onClick={handleAuthClick} size="sm" className="btn">
                Log Out
              </Button>
            </>
          ) : (
            <>
              <Button onClick={handleAuthClick} size="sm" variant="ghost">
                Log In
              </Button>
              <a href="#upload" className="cta">
                Get Started
              </a>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}

export default NavBar