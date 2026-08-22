const LogoIcon = () => (
  <div className="logo-icon">
    <div className="logo-waves">
      <span/><span/><span/><span/><span/>
    </div>
  </div>
)

export default function Logo() {
  return (
    <div className="logo">
      <LogoIcon />
      <div className="logo-text">
        <h2>NetWise AI</h2>
        <p>Voice AI Assistant</p>
      </div>
    </div>
  )
}
