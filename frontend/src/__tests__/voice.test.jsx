import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ChatPage from '../pages/ChatPage.jsx'

let recognizer = null

class FakeSpeechRecognition {
  constructor() {
    this.started = false
    this.startCalls = 0
    // When > 0, the next N start() calls throw InvalidStateError, the way Chrome
    // does while it is still tearing down the previous session.
    this.failNextStarts = 0
    recognizer = this
  }
  start() {
    this.startCalls++
    if (this.failNextStarts > 0) {
      this.failNextStarts--
      const e = new Error('cannot start')
      e.name = 'InvalidStateError'
      throw e
    }
    if (this.started) {
      const e = new Error('already started')
      e.name = 'InvalidStateError'
      throw e
    }
    this.started = true
    queueMicrotask(() => this.onstart && this.onstart())
  }
  stop() {
    if (!this.started) return
    this.started = false
    queueMicrotask(() => this.onend && this.onend())
  }
  abort() { this.stop() }

  endWith(error) {
    if (error) this.onerror && this.onerror({ error })
    this.started = false
    this.onend && this.onend()
  }
  emitFinal(text) { this.emit(text, true) }
  emitInterim(text) { this.emit(text, false) }
  emit(text, isFinal) {
    this.onresult && this.onresult({
      resultIndex: 0,
      results: Object.assign([], {
        length: 1,
        0: Object.assign([{ transcript: text }], { isFinal, length: 1 }),
      }),
    })
  }
}

let socket = null
class FakeWebSocket {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3
  constructor() {
    this.readyState = FakeWebSocket.OPEN
    this.sent = []
    socket = this
    queueMicrotask(() => this.onopen && this.onopen())
  }
  send(d) { this.sent.push(JSON.parse(d)) }
  close() { this.readyState = FakeWebSocket.CLOSED }
  reply(obj) { this.onmessage && this.onmessage({ data: JSON.stringify(obj) }) }
}

class FakeAudio {
  constructor() { this.src = '' }
  play() { return Promise.resolve() }
  pause() {}
}

beforeEach(() => {
  recognizer = null; socket = null
  vi.useFakeTimers({ shouldAdvanceTime: true })
  window.SpeechRecognition = FakeSpeechRecognition
  window.webkitSpeechRecognition = FakeSpeechRecognition
  global.WebSocket = FakeWebSocket; window.WebSocket = FakeWebSocket
  global.Audio = FakeAudio; window.Audio = FakeAudio
  window.HTMLElement.prototype.scrollIntoView = () => {}
})

afterEach(() => {
  cleanup()
  vi.clearAllTimers()
  vi.useRealTimers()
})

const renderChat = () =>
  render(<MemoryRouter initialEntries={['/chat?mode=voice']}><ChatPage /></MemoryRouter>)

const flush = async (ms) => {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms) })
  await act(async () => {})
}

const barText = () => document.querySelector('.waveform-text').textContent

describe('voice loop', () => {
  it('auto-starts the mic in voice mode', async () => {
    renderChat(); await flush(700)
    expect(recognizer.started).toBe(true)
    expect(barText()).toBe('Listening...')
  })

  it('restarts after a no-speech timeout', async () => {
    renderChat(); await flush(700)
    const before = recognizer.startCalls
    await act(async () => { recognizer.endWith('no-speech') })
    await flush(1500)
    expect(recognizer.startCalls).toBeGreaterThan(before)
    expect(recognizer.started).toBe(true)
  })

  // THE REGRESSION: Chrome throws InvalidStateError when restarted too soon.
  // The old code returned without scheduling a retry, so the mic never
  // reopened and the bar sat on "Click mic to speak" forever.
  it('recovers when start() keeps throwing InvalidStateError', async () => {
    renderChat(); await flush(700)

    recognizer.failNextStarts = 3
    await act(async () => { recognizer.endWith('no-speech') })

    await flush(8000)

    expect(recognizer.started).toBe(true)
    expect(barText()).not.toBe('Click mic to speak')
  })

  it('never shows "Click mic to speak" while the loop is alive', async () => {
    renderChat(); await flush(700)

    // Step through several restart gaps; the bar must never advertise a dead mic.
    for (let i = 0; i < 5; i++) {
      await act(async () => { recognizer.endWith('no-speech') })
      for (const step of [50, 100, 200, 400, 800]) {
        await flush(step)
        expect(barText()).not.toBe('Click mic to speak')
      }
    }
  })

  it('recovers from a network error', async () => {
    renderChat(); await flush(700)
    await act(async () => { recognizer.endWith('network') })
    await flush(6000)
    expect(recognizer.started).toBe(true)
  })

  it('shows a thinking status while waiting', async () => {
    renderChat(); await flush(700)
    await act(async () => { recognizer.emitFinal('how do i reset my router') })
    await flush(50)
    expect(socket.sent.at(-1)).toEqual({ query: 'how do i reset my router' })
    expect(barText()).toBe('Thinking...')
  })

  it('does not submit the same turn twice', async () => {
    renderChat(); await flush(700)
    await act(async () => { recognizer.emitFinal('vlan setup') })
    await flush(50)
    await act(async () => { recognizer.emitFinal('vlan setup') })
    await flush(50)
    expect(socket.sent.filter(m => m.query === 'vlan setup')).toHaveLength(1)
  })

  it('resumes listening after the answer completes', async () => {
    renderChat(); await flush(700)
    await act(async () => { recognizer.emitFinal('what is dhcp') })
    await flush(50)
    await act(async () => { socket.reply({ type: 'response_generated', response: 'DHCP assigns addresses.' }) })
    await flush(2000)
    expect(recognizer.started).toBe(true)
    expect(barText()).toBe('Listening...')
  })

  it('recovers if the backend never answers', async () => {
    renderChat(); await flush(700)
    await act(async () => { recognizer.emitFinal('ping test') })
    await flush(50)
    expect(barText()).toBe('Thinking...')
    await flush(95000)
    expect(screen.getByText(/didn't respond in time/i)).toBeTruthy()
    expect(recognizer.started).toBe(true)
  })

  it('shows the live transcript while you are still speaking', async () => {
    renderChat(); await flush(700)

    await act(async () => { recognizer.emitInterim('how do i reset') })
    await flush(20)
    expect(screen.getByText('how do i reset')).toBeTruthy()
    // Nothing is submitted until the phrase is final.
    expect(socket.sent).toHaveLength(0)

    await act(async () => { recognizer.emitFinal('how do i reset my router') })
    await flush(50)

    // The provisional line is replaced by the committed question.
    expect(screen.queryByText('how do i reset')).toBeNull()
    expect(screen.getByText('how do i reset my router')).toBeTruthy()
    expect(socket.sent.at(-1)).toEqual({ query: 'how do i reset my router' })
  })

  it('keeps the whole conversation instead of wiping it each turn', async () => {
    renderChat(); await flush(700)

    await act(async () => { recognizer.emitFinal('what is dhcp') })
    await flush(50)
    await act(async () => { socket.reply({ type: 'response_generated', response: 'DHCP hands out addresses.' }) })
    await flush(2000)

    await act(async () => { recognizer.emitFinal('what is dns') })
    await flush(50)
    await act(async () => { socket.reply({ type: 'response_generated', response: 'DNS resolves names.' }) })
    await flush(2000)

    // Both questions and both answers are still on screen.
    expect(screen.getByText('what is dhcp')).toBeTruthy()
    expect(screen.getByText('DHCP hands out addresses.')).toBeTruthy()
    expect(screen.getByText('what is dns')).toBeTruthy()
    expect(screen.getByText('DNS resolves names.')).toBeTruthy()
  })

  it('falls back to the text box when the browser has no speech API', async () => {
    delete window.SpeechRecognition
    delete window.webkitSpeechRecognition

    renderChat(); await flush(700)

    const input = document.querySelector('.text-input')
    expect(input).toBeTruthy()
    expect(document.querySelector('.waveform-area')).toBeNull()
  })

  it('falls back to typing when the speech service is blocked (Brave)', async () => {
    renderChat(); await flush(700)

    // First network error is treated as a blip and retried.
    await act(async () => { recognizer.endWith('network') })
    await flush(2000)
    await act(async () => { recognizer.endWith('network') })
    await flush(2000)

    expect(screen.getByText(/blocking speech recognition/i)).toBeTruthy()
    expect(document.querySelector('.text-input')).toBeTruthy()
  })

  it('can still ask a question by typing in the fallback box', async () => {
    delete window.SpeechRecognition
    delete window.webkitSpeechRecognition

    renderChat(); await flush(700)

    const input = document.querySelector('.text-input')
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, 'what is a vlan')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      document.querySelector('.text-input-row').dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }))
    })
    await flush(50)

    expect(socket.sent.at(-1)).toEqual({ query: 'what is a vlan' })
    expect(screen.getByText('what is a vlan')).toBeTruthy()
  })

  it('stops for good when the user clicks the mic', async () => {
    renderChat(); await flush(700)
    await act(async () => { document.querySelector('.voice-mic-btn').click() })
    await flush(6000)
    expect(recognizer.started).toBe(false)
    expect(barText()).toBe('Click mic to speak')
  })

  it('stops retrying when microphone permission is denied', async () => {
    renderChat(); await flush(700)
    await act(async () => { recognizer.endWith('not-allowed') })
    await flush(6000)
    expect(recognizer.started).toBe(false)
    expect(screen.getByText(/Microphone access is blocked/i)).toBeTruthy()
  })
})
