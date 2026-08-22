import { useNavigate } from 'react-router-dom'
import Logo from '../components/Logo'

const features = [
  {
    icon: (
      <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ),
    title: "Hybrid RAG Architecture",
    desc: "Combines FAISS (dense vector) and BM25 (sparse keyword) with Reciprocal Rank Fusion."
  },
  {
    icon: (
      <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>
    ),
    title: "Ultra-Low Latency",
    desc: "Achieves ~1.5s end-to-end response times using WebSocket streaming."
  },
  {
    icon: (
      <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
        <line x1="8" y1="21" x2="16" y2="21"/>
        <line x1="12" y1="17" x2="12" y2="21"/>
      </svg>
    ),
    title: "High-Performance AI",
    desc: "Powered by Groq's rapid LPU inference and ElevenLabs Turbo TTS."
  },
  {
    icon: (
      <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 16v-4"/>
        <path d="M12 8h.01"/>
      </svg>
    ),
    title: "Smart Intent Routing",
    desc: "Automatically bypasses RAG for conversational queries to eliminate overhead."
  }
]

export default function LandingPage() {
  const navigate = useNavigate()

  return (
    <div className="landing">
      <nav className="landing-nav">
        <Logo />
        <div className="nav-actions">
          <a
            href="https://github.com/Praveen-pandey-ai/Voice-AI"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-github"
          >
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            GitHub
          </a>
          <button className="btn-get-started" onClick={() => navigate('/chat')}>
            Get Started
          </button>
        </div>
      </nav>

      <section className="landing-hero">
        <div className="powered-badge">
          <span/>
          Powered by Voice AI + RAG
        </div>

        <h1 className="hero-title">
          Your Networking Manuals,<br />
          Now a <span className="accent">Conversation.</span>
        </h1>

        <p className="hero-subtitle">
          Ask anything from networking manuals.<br />
          Get instant, accurate answers with Voice AI + RAG.
        </p>

        <div className="hero-actions">
          <button className="btn-voice-chat" onClick={() => navigate('/chat?mode=voice')}>
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
            Start Voice Chat
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <line x1="5" y1="12" x2="19" y2="12"/>
              <polyline points="12 5 19 12 12 19"/>
            </svg>
          </button>
          <button className="btn-type-instead" onClick={() => navigate('/chat?mode=text')}>
            Type Instead
          </button>
        </div>
      </section>

      <section className="landing-features">
        <p className="features-title">Built for Network Engineers</p>
        <div className="features-grid">
          {features.map((f, i) => (
            <div className="feature-card" key={i}>
              <div className="feature-icon">{f.icon}</div>
              <h4>{f.title}</h4>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>



    </div>
  )
}
