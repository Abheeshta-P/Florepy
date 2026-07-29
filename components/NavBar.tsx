function NavBar() {
  const handleAuthClick = async()=> {
console.log("logged")  }

  return (
    <header className="navbar">
      <nav className="inner">
        <div className="left">
          <div className="brand">
            <img src="/florepy.png" alt="Logo" width={35} height={35}/>
            <span className="name">
              Florepy
            </span>
          </div>
          <ul className="links">
            <a href="#">Product</a>
            <a href="#">Pricing</a>
            <a href="#">Community</a>
            <a href="#">Enterprise</a>
          </ul>
        </div>
        <div className="actions">
          <button onClick={handleAuthClick} className="login">Log In</button>
          <a href="#upload" className="cta">Get Started</a>
        </div>
      </nav>
    </header>
  )
}

export default NavBar