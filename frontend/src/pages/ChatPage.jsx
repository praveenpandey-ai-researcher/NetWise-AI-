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
  // Words recognised so far in the current utterance, shown live while you talk.
  const [interimText, setInterimText] = useState('')
  // Set when speech recognition is unusable in this browser (missing API, denied
  // permission, or a blocked speech service - Brave disables it by default).
  // Voice mode then falls back to the text box so the app stays usable.
  const [speechBlocked, setSpeechBlocked] = useState(false)

  // Theme. Remembered across visits, falling back to the OS preference.
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('netwise-theme')
      if (saved === 'dark' || saved === 'light') return saved
    } catch (e) {
      // Private mode / blocked storage - fall through to the OS preference.
      console.error('Could not read saved theme:', e)
    }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  // The attribute lives on <html> so the whole app (not just this page) themes.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem('netwise-theme', theme)
    } catch (e) {
      console.error('Could not save theme:', e)
    }
  }, [theme])

  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'))
  
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

  // --- Voice loop state ---
  // Browser speech recognition stops on its own after one utterance or a few
  // seconds of silence. These track whether we still *want* to be listening so
  // the loop can resume, instead of going quiet until the next manual click.
  const wantListenRef = useRef(false)   // user intent: stay in the listening loop
  const isListeningRef = useRef(false)  // recognizer actually running
  const isSpeakingRef = useRef(false)   // assistant audio playing
  const processingRef = useRef(false)   // query sent, answer not finished
  const restartTimerRef = useRef(null)
  const startWatchdogRef = useRef(null)   // catches a start() that never opens the mic
  const responseTimerRef = useRef(null)   // catches an answer that never arrives
  const restartAttemptsRef = useRef(0)    // backs off repeated restart failures
  const speechFailuresRef = useRef(0)     // consecutive speech-service failures

  // Always go through this instead of setStatusText: it updates the ref in the
  // same tick. Previously the ref was synced in an effect, so a handler running
  // before the next render (recognition's onend fires immediately after a
  // result) saw the old value and clobbered the new status.
  const setStatus = (text) => {
    statusTextRef.current = text
    setStatusText(text)
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, statusText, interimText])

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
        setStatus('Searching knowledge base...')
      } else if (data.type === 'generating_response') {
        setStatus('Generating answer...')
      } else if (data.type === 'response_generated') {
        setStatus('Ready')
        setMessages(prev => [...prev, { role: 'ai', content: data.response }])
        // Answer complete. If audio is still playing, the mic resumes when the
        // queue drains instead.
        finishProcessing()
        maybeRestartListening()
      } else if (data.type === 'audio') {
        queueAudio(data.data, data.is_filler)
      } else if (data.type === 'error') {
        setStatus('Ready')
        setMessages(prev => [...prev, { role: 'system', content: `Backend error: ${data.message}` }])
        finishProcessing()
        maybeRestartListening()
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
      // The assistant has stopped talking - hand the mic back.
      isSpeakingRef.current = false;
      maybeRestartListening();
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
    isSpeakingRef.current = false;
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

    // Mute the mic while the assistant speaks, otherwise the recognizer hears
    // the answer coming out of the speakers and submits it as the next question.
    isSpeakingRef.current = true;
    if (isListeningRef.current) {
      pauseListening();
    }

    audioQueueRef.current.push(base64Audio);
    if (!isPlayingRef.current) {
      playNextInQueue();
    }
  };

  // --- Listening loop helpers ---

  // Stop the recognizer but keep wantListenRef, so the loop resumes later.
  const pauseListening = () => {
    setInterimText('');
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    isListeningRef.current = false;
    setIsListening(false);
    try {
      recognitionRef.current?.stop();
    } catch (e) {
      console.error('Failed to stop recognition:', e);
    }
  };

  // Queue another start attempt. Every failure path must go through here:
  // returning without scheduling a retry leaves the microphone dead for good,
  // because onstart never fires and onend has already been delivered.
  const scheduleRestart = () => {
    if (closedRef.current) return;
    if (!wantListenRef.current) return;

    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);

    const attempt = restartAttemptsRef.current;
    restartAttemptsRef.current = attempt + 1;
    // Backs off, but never gives up while the user wants to be listening.
    const delay = Math.min(400 + attempt * 300, 4000);

    restartTimerRef.current = setTimeout(startListening, delay);
  };

  const startListening = () => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    if (isListeningRef.current || isSpeakingRef.current || processingRef.current) return;

    try {
      recognition.start();
    } catch (e) {
      // Do NOT claim we are listening here. An earlier version set
      // isListeningRef = true on failure, which permanently blocked every later
      // restart while nothing was actually running.
      //
      // InvalidStateError is the common case: Chrome has not finished tearing
      // down the previous session yet. It is transient, so retry - the previous
      // version returned here and the mic never came back.
      if (!e || e.name !== 'InvalidStateError') {
        console.error('Failed to start recognition:', e);
      }
      isListeningRef.current = false;
      setIsListening(false);
      scheduleRestart();
      return;
    }

    // isListening is set by the recognizer's onstart handler, so the UI only
    // shows "Listening..." when the microphone is genuinely open.
    setStatus('Listening...');

    // If onstart never arrives the start silently failed; recover instead of
    // sitting on a stale "Listening..." forever.
    if (startWatchdogRef.current) clearTimeout(startWatchdogRef.current);
    startWatchdogRef.current = setTimeout(() => {
      if (isListeningRef.current) return;
      console.warn('Recognition did not start; retrying');
      maybeRestartListening();
    }, 1500);
  };

  // Called whenever something that blocked the mic finishes: recognition ended,
  // audio finished playing, or an answer completed.
  const maybeRestartListening = () => {
    if (closedRef.current) return;
    if (!wantListenRef.current) return;
    if (isListeningRef.current || isSpeakingRef.current || processingRef.current) return;

    scheduleRestart();
  };

  // Clears the in-flight query state and lets the mic resume.
  const finishProcessing = () => {
    processingRef.current = false;
    if (responseTimerRef.current) {
      clearTimeout(responseTimerRef.current);
      responseTimerRef.current = null;
    }
  };

  const handleSend = (text) => {
    if (!text.trim()) return;

    // Append. This used to replace the whole array, so every question wiped the
    // transcript and only ever one exchange was visible.
    setInterimText('');
    setMessages(prev => [...prev, { role: 'user', content: text }]);

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      finishProcessing();
      setStatus('Not connected to server');
      connectWebSocket();
      maybeRestartListening();
      return;
    }

    processingRef.current = true;

    // Set a status straight away. Without this, recognition's onend reset the
    // status to 'Ready' the moment you stopped speaking, so the bar read
    // "Click mic to speak" with no spinner while the answer was still coming -
    // and the mic stayed off because a query was in flight.
    setStatus('Thinking...');

    wsRef.current.send(JSON.stringify({ query: text }));

    // Watchdog: never stay stuck if the answer never arrives (dropped socket,
    // or the free-tier backend waking from sleep).
    if (responseTimerRef.current) clearTimeout(responseTimerRef.current);
    responseTimerRef.current = setTimeout(() => {
      if (!processingRef.current) return;
      finishProcessing();
      setStatus('Ready');
      setMessages(prev => [...prev, {
        role: 'system',
        content: "The server didn't respond in time. It may have been asleep - please ask again."
      }]);
      maybeRestartListening();
    }, 90000);
  }

  const handleTextSubmit = (e) => {
    e.preventDefault();
    handleSend(textInput);
    setTextInput('');
  }

  const toggleListen = () => {
    if (!recognitionRef.current) {
      alert("Speech Recognition is not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    if (isListening) {
      // Explicit stop: leave the loop until the user asks for it again.
      wantListenRef.current = false;
      pauseListening();
      setStatus('Ready');
    } else {
      wantListenRef.current = true;
      restartAttemptsRef.current = 0;
      finishProcessing();
      stopAudio();
      startListening();
    }
  }

  useEffect(() => {
    closedRef.current = false
    connectWebSocket()
    return () => {
      // Without this the socket outlived the page: the reconnect timer kept
      // firing and every mount leaked another open connection.
      closedRef.current = true
      wantListenRef.current = false
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current)
      if (startWatchdogRef.current) clearTimeout(startWatchdogRef.current)
      if (responseTimerRef.current) clearTimeout(responseTimerRef.current)
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
        wsRef.current = null
      }
      stopAudio()
      try { recognitionRef.current?.abort() } catch { /* not started */ }
    }
  }, [])

  // Recognizer is built once on mount. This used to run in the render body,
  // which made constructing it a side effect of rendering.
  useEffect(() => {
    if (recognitionRef.current) return;
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      // No speech API at all (Firefox, Safari). Show the text box rather than
      // leaving voice mode with no way to enter anything.
      setSpeechBlocked(true);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    // continuous = false ended the session after a single utterance or a few
    // seconds of quiet, which is what made the mic "suddenly stop". A continuous
    // session survives natural pauses; we still submit on the first final result.
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      isListeningRef.current = true;
      restartAttemptsRef.current = 0;
      if (startWatchdogRef.current) {
        clearTimeout(startWatchdogRef.current);
        startWatchdogRef.current = null;
      }
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      // stop() flushes a final result, so this can fire again just after we
      // submitted. Without this guard the same turn is sent twice.
      if (processingRef.current) return;

      // With interimResults on, this fires continuously. Show the partial words
      // as they are recognised, but only submit on a final transcript.
      let transcript = '';
      let pending = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript;
        } else {
          pending += event.results[i][0].transcript;
        }
      }

      // Any recognised words prove the speech service is reachable.
      if (transcript.trim() || pending.trim()) {
        speechFailuresRef.current = 0;
      }

      if (!transcript.trim()) {
        setInterimText(pending);
        return;
      }

      // Got the question - close the mic so it does not keep capturing.
      setInterimText('');
      pauseListening();

      stopAudio();

      handleSend(transcript.trim());
    };

    recognition.onerror = (event) => {
      isListeningRef.current = false;
      setIsListening(false);

      // 'no-speech' and 'aborted' are routine: the browser gives up after a few
      // seconds of silence. Treating them as fatal is what silently killed the
      // mic and left the page looking dead. Let onend restart the loop instead.
      if (event.error === 'no-speech' || event.error === 'aborted') return;

      console.error("Speech recognition error:", event.error);

      if (event.error === 'not-allowed') {
        // Permission denied - stop retrying and say so, rather than looping.
        wantListenRef.current = false;
        setStatus('Ready');
        setSpeechBlocked(true);
        setMessages(prev => [...prev, {
          role: 'system',
          content: 'Microphone access is blocked. Allow it in your browser settings and reload, or type your question below.'
        }]);
        return;
      }

      if (event.error === 'network' || event.error === 'service-not-allowed') {
        // The recognizer opens fine but the speech service is unreachable.
        // Brave blocks it by default, and some networks block it too. One retry
        // in case it is a blip, then fall back to typing so the app stays usable.
        speechFailuresRef.current += 1;
        if (speechFailuresRef.current >= 2) {
          wantListenRef.current = false;
          setStatus('Ready');
          setSpeechBlocked(true);
          setMessages(prev => [...prev, {
            role: 'system',
            content: "This browser is blocking speech recognition, so the mic can't hear you. Brave blocks it by default - try Chrome or Edge for voice. You can type your question below instead."
          }]);
          return;
        }
      }

      setStatus('Ready');
    };

    recognition.onend = () => {
      isListeningRef.current = false;
      setIsListening(false);
      // Only clear the listening label when the loop is genuinely finishing.
      // If a query is in flight handleSend has already set 'Thinking...', and if
      // we are about to restart we stay on 'Listening...' so the bar does not
      // flash "Click mic to speak" between attempts.
      const willRestart = wantListenRef.current
        && !processingRef.current
        && !isSpeakingRef.current
        && !closedRef.current;

      if (!willRestart && !processingRef.current && statusTextRef.current === 'Listening...') {
        setStatus('Ready');
      }
      // Recognition always ends after one utterance (continuous = false).
      // Restart if we are still meant to be listening.
      maybeRestartListening();
    };

    recognitionRef.current = recognition;
  }, []);

  // Auto-start microphone if mode is voice
  useEffect(() => {
    if (mode !== 'voice' || speechBlocked) return;

    // Small timeout to allow component to mount.
    // This used to call toggleListen(), which reads `isListening` from the
    // render it was created in - so it could toggle the mic back *off*.
    const timer = setTimeout(() => {
      wantListenRef.current = true;
      startListening();
    }, 500);

    return () => clearTimeout(timer);
  }, [mode, speechBlocked]);

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
            <button
              className="topbar-icon-btn"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? (
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              ) : (
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
              )}
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
          
          {interimText.trim() && (
            <div className="msg-row user-row">
              <div className="msg-avatar">
                <span style={{color: 'white', fontSize: '12px', fontWeight: 'bold'}}>H</span>
              </div>
              <div className="msg-body">
                <div className="msg-meta">
                  <strong>You</strong>
                </div>
                <div className="msg-bubble" style={{opacity: 0.65, fontStyle: 'italic'}}>
                  {interimText}
                </div>
              </div>
            </div>
          )}

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

            {mode === 'voice' && !speechBlocked ? (
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
