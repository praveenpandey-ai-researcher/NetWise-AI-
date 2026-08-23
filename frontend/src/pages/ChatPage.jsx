import { useState, useRef, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Logo from '../components/Logo'

// Backend WebSocket endpoint.
// Set VITE_WS_URL in .env / the host's build env to point at a different backend.
// Without an override we fall back to a local backend when served from localhost,
// so `npm run dev` works without editing this file.
const WS_URL =
  import.meta.env.VITE_WS_URL ||
  (['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'ws://localhost:8000/ws/chat'
    : 'wss://netwise-ai.onrender.com/ws/chat')

export default function ChatPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const mode = searchParams.get('mode') || 'voice'
  
  const [isListening, setIsListening] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'system', content: "Hello! I'm your Voice AI Assistant. How can I help you with your networking today?" }
  ])
  const [statusText, setStatusText] = useState('Ready')
  const [wsStatus, setWsStatus] = useState('Connecting...')
  const [textInput, setTextInput] = useState('')
  
  const recognitionRef = useRef(null)
  const wsRef = useRef(null)
  const audioQueueRef = useRef([])
  const isPlayingRef = useRef(false)
  const reconnectTimerRef = useRef(null)
  const messagesEndRef = useRef(null)
  const currentAudioRef = useRef(null)
  // Set once the component unmounts, so in-flight callbacks stop reconnecting.
  const closedRef = useRef(false)
  // Mirrors statusText for callbacks registered once, which would otherwise
  // keep reading the value captured at registration time.
  const statusTextRef = useRef('Ready')

  useEffect(() => {
    statusTextRef.current = statusText
  }, [statusText])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, statusText])

  const connectWebSocket = () => {
    if (closedRef.current) return
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) return

    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      console.log('WebSocket Connected')
      setWsStatus('Connected')
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
    }

    ws.onmessage = (event) => {
      let data
      try {
        data = JSON.parse(event.data)
      } catch (e) {
        console.error('Bad message from server:', e)
        return
      }
      if (data.type === 'query_received') {
        setStatusText('Searching knowledge base...')
      } else if (data.type === 'generating_response') {
        setStatusText('Generating answer...')
      } else if (data.type === 'response_generated') {
        setStatusText('Ready')
        setMessages(prev => [...prev, { role: 'ai', content: data.response }])
      } else if (data.type === 'audio') {
        queueAudio(data.data, data.is_filler)
      } else if (data.type === 'error') {
        setStatusText('Ready')
        setMessages(prev => [...prev, { role: 'system', content: `Backend error: ${data.message}` }])
      }
    }

    ws.onerror = (error) => {
      console.error('WebSocket Error:', error)
      setWsStatus('Connection Error')
    }

    ws.onclose = () => {
      if (closedRef.current) return
      console.log('WebSocket closed, reconnecting in 2s...')
      setWsStatus('Reconnecting...')
      reconnectTimerRef.current = setTimeout(connectWebSocket, 2000)
    }
  }


  const playNextInQueue = () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      currentAudioRef.current = null;
      return;
    }

    isPlayingRef.current = true;
    const base64Audio = audioQueueRef.current.shift();

    const audio = new Audio("data:audio/mp3;base64," + base64Audio);
    currentAudioRef.current = audio;
    audio.onended = () => {
      // A clip that finished after stopAudio() must not restart the queue.
      if (currentAudioRef.current !== audio) return;
      playNextInQueue();
    };

    audio.play().catch(e => {
      console.error("Audio playback failed:", e);
      if (currentAudioRef.current !== audio) return;
      playNextInQueue();
    });
  };

  // Clearing the queue alone left the clip that was already playing talking over
  // the next question, so stop the active element too.
  const stopAudio = () => {
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    const audio = currentAudioRef.current;
    currentAudioRef.current = null;
    if (audio) {
      try {
        audio.pause();
        audio.src = '';
      } catch (e) {
        console.error('Failed to stop audio:', e);
      }
    }
  };

  const queueAudio = (base64Audio, isFiller) => {
    if (isFiller && isPlayingRef.current) return;
    audioQueueRef.current.push(base64Audio);
    if (!isPlayingRef.current) {
      playNextInQueue();
    }
  };

  // Built once on mount. This used to run in the render body, which made
  // constructing the recognizer a side effect of rendering.

  const handleSend = (text) => {
    if (!text.trim()) return;
    
    // Clear history on new query
    setMessages([{ role: 'user', content: text }]);
    
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ query: text }));
    } else {
      setStatusText('Not connected to server');
    }
  }

  const handleTextSubmit = (e) => {
    e.preventDefault();
    handleSend(textInput);
    setTextInput('');
  }

  const toggleListen = () => {
    if (isListening) {
      try {
        recognitionRef.current?.stop();
      } catch (e) {
        console.error('Failed to stop recognition:', e);
      }
      setIsListening(false);
      setStatusText('Ready');
    } else {
      if (recognitionRef.current) {
        stopAudio();

        try {
          recognitionRef.current.start();
        } catch (e) {
          // start() throws InvalidStateError if the recognizer is already
          // running. Previously this propagated and left isListening stuck on.
          console.error('Failed to start recognition:', e);
          setIsListening(false);
          setStatusText('Ready');
          return;
        }
        setIsListening(true);
        setStatusText('Listening...');
      } else {
        alert("Speech Recognition is not supported in this browser. Please use Chrome or Edge.");
      }
    }
  }

  useEffect(() => {
    closedRef.current = false
    connectWebSocket()
    return () => {
      // Without this the socket outlived the page: the reconnect timer kept
      // firing and every mount leaked another open connection.
      closedRef.current = true
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
        wsRef.current = null
      }
      stopAudio()
      try { recognitionRef.current?.abort() } catch { /* not started */ }
    }
  }, [])

  useEffect(() => {
    if (recognitionRef.current) return;
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setIsListening(false);

      stopAudio();

      handleSend(transcript);
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
      setStatusText('Ready');
    };

    recognition.onend = () => {
      setIsListening(false);
      if (statusTextRef.current === 'Listening...') {
        setStatusText('Ready');
      }
    };

    recognitionRef.current = recognition;
  }, []);

  // Auto-start microphone if mode is voice
  useEffect(() => {
    if (mode === 'voice' && !isListening) {
      // Small timeout to allow component to mount
      const timer = setTimeout(() => {
        if (!isListening && recognitionRef.current) {
          toggleListen();
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [mode]);

  return (
    <div className="chat-app">
      {/* Main Chat Area */}
      <main className="chat-main">
        <header className="chat-topbar">
          <div className="topbar-logo" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
            <Logo />
          </div>
          <div className="topbar-actions">
            <div className="rag-status">
              <span className="rag-dot" style={{ background: wsStatus === 'Connected' ? '#22c55e' : '#ef4444' }}></span>
              {wsStatus === 'Connected' ? 'RAG Enabled' : 'Disconnected'}
            </div>
            <button className="topbar-icon-btn">
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            </button>
          </div>
        </header>

        <div className="chat-messages">
          {messages.map((msg, idx) => (
            msg.role === 'system' ? (
              <div key={idx} className="msg-system">{msg.content}</div>
            ) : (
              <div key={idx} className={`msg-row ${msg.role === 'user' ? 'user-row' : ''}`}>
                <div className="msg-avatar">
                  {msg.role === 'ai' ? (
                    <svg width="16" height="16" fill="white" viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z"/>
                    </svg>
                  ) : (
                    <span style={{color: 'white', fontSize: '12px', fontWeight: 'bold'}}>H</span>
                  )}
                </div>
                <div className="msg-body">
                  <div className="msg-meta">
                    <strong>{msg.role === 'ai' ? 'NetWise AI' : 'You'}</strong>
                  </div>
                  <div className="msg-bubble">{msg.content}</div>
                </div>
              </div>
            )
          ))}
          
          {statusText !== 'Ready' && statusText !== 'Listening...' && (
            <div className="msg-row">
              <div className="msg-avatar">
                <svg width="16" height="16" fill="white" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z"/>
                </svg>
              </div>
              <div className="msg-body">
                <div className="msg-meta"><strong>NetWise AI</strong></div>
                <div className="msg-bubble">
                  <div className="loading-dots">
                    <span/><span/><span/>
                  </div>
                  <div style={{fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px', textAlign: 'center'}}>
                    {statusText}
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input-area">
          <div className="chat-input-inner">
            <button 
              className={`voice-mic-btn ${isListening ? 'listening' : ''}`}
              onClick={toggleListen}
              title={mode === 'voice' ? 'Click to stop' : 'Click to speak'}
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
            </button>

            {mode === 'voice' ? (
              <div className="waveform-area">
                <div className={`waveform-bars ${isListening ? 'active' : ''}`}>
                  <span className="bar"/><span className="bar"/><span className="bar"/>
                  <span className="bar"/><span className="bar"/><span className="bar"/><span className="bar"/>
                </div>
                <div className="waveform-text">
                  {isListening ? 'Listening...' : statusText !== 'Ready' ? statusText : 'Click mic to speak'}
                </div>
              </div>
            ) : (
              <form className="text-input-row" onSubmit={handleTextSubmit}>
                <input 
                  type="text" 
                  className="text-input" 
                  placeholder="Ask a networking question..." 
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                />
                <button type="submit" className="chat-send-btn" disabled={!textInput.trim()}>
                  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <line x1="22" y1="2" x2="11" y2="13"/>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </button>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
