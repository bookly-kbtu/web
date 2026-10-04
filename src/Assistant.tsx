import { useEffect, useRef, useState } from "react";
import {
  CalendarCheck,
  Check,
  Keyboard,
  Mic,
  Navigation,
  SendHorizontal,
  Bot,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";
import { money, dateTime, readStorage, type Call, type Slot } from "./api";

export interface AiCandidate {
  master_id: string;
  display_name: string;
  service_id: string;
  service_name: string;
  price_amount: number;
  currency: string;
  duration_minutes: number;
}
interface AiBooking {
  id: string;
  starts_at: string;
  ends_at: string;
  service_name_snapshot: string;
  price_amount: number;
  currency: string;
  address?: string;
}
interface AiChatResponse {
  conversation_id: string;
  reply: string;
  state: "clarify" | "recommend" | "pick_slot" | "confirm" | "booked" | "failed";
  candidates: AiCandidate[];
  slots: Slot[];
  booking: AiBooking | null;
}
interface Message {
  role: "user" | "assistant";
  text: string;
  candidates?: AiCandidate[];
  slots?: Slot[];
  booking?: AiBooking | null;
  quickReplies?: string[];
}

// lib.dom has no SpeechRecognition types yet.
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}
const SpeechRecognitionImpl: (new () => Recognition) | undefined =
  (window as never as Record<string, new () => Recognition>).SpeechRecognition ||
  (window as never as Record<string, new () => Recognition>).webkitSpeechRecognition;

const SUGGESTIONS = [
  "«Барбер рядом на завтра»",
  "«Маникюр до 10 000 ₸»",
  "«Брови на этой неделе»",
];

function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return "Доброй ночи";
  if (hour < 12) return "Доброе утро";
  if (hour < 18) return "Добрый день";
  return "Добрый вечер";
}

// The model occasionally slips into markdown despite the prompt; both the
// chat bubble and the speech synthesizer want plain text.
function plainText(text: string) {
  return text.replace(/\*\*|__|[*_#`]/g, "").replace(/^[-•]\s+/gm, "");
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();
}

function slotLabel(slot: Slot) {
  return new Date(slot.starts_at).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Assistant({
  call,
  signedIn,
  firstName,
  login,
  openBookings,
}: {
  call: Call;
  signedIn: boolean;
  firstName?: string;
  login: () => void;
  openBookings: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [interim, setInterim] = useState("");
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [micError, setMicError] = useState("");
  const conversation = useRef<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const aborted = useRef(false);
  const voiceOnRef = useRef(voiceOn);
  voiceOnRef.current = voiceOn;
  const feed = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (messages.length === 0) return;
    feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  function stopSpeaking() {
    audioRef.current?.pause();
    audioRef.current = null;
    window.speechSynthesis?.cancel();
  }

  useEffect(
    () => () => {
      recognition.current?.abort();
      stopSpeaking();
    },
    [],
  );

  // Without an explicit voice the browser falls back to the system default,
  // which is often a legacy robotic voice — or not Russian at all.
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const pick = () => {
      const russian = synth
        .getVoices()
        .filter((v) => v.lang.toLowerCase().startsWith("ru"));
      voiceRef.current =
        russian.find((v) => /google/i.test(v.name)) ||
        russian.find((v) => /milena|katya|yuri/i.test(v.name)) ||
        russian.find((v) => !v.localService) ||
        russian[0] ||
        null;
    };
    pick();
    synth.addEventListener("voiceschanged", pick);
    return () => synth.removeEventListener("voiceschanged", pick);
  }, []);

  // Neural TTS from the AI service; browser speechSynthesis is the fallback.
  async function speak(text: string) {
    if (!voiceOnRef.current) return;
    stopSpeaking();
    try {
      const token = readStorage<{ access_token?: string } | null>(
        "bookly-session",
        null,
      )?.access_token;
      if (!token) throw new Error("no session");
      const response = await fetch("/ai/v1/assistant/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) throw new Error(`tts ${response.status}`);
      const url = URL.createObjectURL(await response.blob());
      if (!voiceOnRef.current) {
        URL.revokeObjectURL(url);
        return;
      }
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch {
      if (!voiceOnRef.current || !window.speechSynthesis) return;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "ru-RU";
      if (voiceRef.current) utterance.voice = voiceRef.current;
      utterance.rate = 1.05;
      window.speechSynthesis.speak(utterance);
    }
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || sending) return;
    if (!signedIn) return login();
    setInput("");
    setMessages((old) => [...old, { role: "user", text: message }]);
    setSending(true);
    try {
      const response = await call<AiChatResponse>("/ai/v1/assistant/chat", {
        method: "POST",
        body: JSON.stringify({
          conversation_id: conversation.current,
          message,
        }),
      });
      conversation.current = response.conversation_id;
      const reply = plainText(response.reply);
      setMessages((old) => [
        ...old,
        {
          role: "assistant",
          text: reply,
          candidates: response.candidates,
          slots: response.slots,
          booking: response.booking,
          quickReplies:
            response.state === "pick_slot"
              ? ["Другая дата", "А дешевле есть?"]
              : undefined,
        },
      ]);
      speak(reply);
    } catch (e) {
      setMessages((old) => [
        ...old,
        {
          role: "assistant",
          text:
            (e as Error).message ||
            "Не получилось связаться с ассистентом. Попробуйте ещё раз.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  function stopListening(discard: boolean) {
    aborted.current = discard;
    if (discard) recognition.current?.abort();
    else recognition.current?.stop();
  }

  function startListening() {
    if (!SpeechRecognitionImpl) return;
    if (!signedIn) return login();
    if (listening) return stopListening(false);
    setMicError("");
    stopSpeaking(); // the mic must not transcribe the bot's own voice
    const rec = new SpeechRecognitionImpl();
    rec.lang = "ru-RU";
    rec.interimResults = true;
    rec.continuous = false;
    aborted.current = false;
    let finalText = "";
    rec.onresult = (event) => {
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interimText += result[0].transcript;
      }
      setInterim(finalText + interimText);
    };
    rec.onerror = (event) => {
      if (event.error === "not-allowed")
        setMicError("Разрешите доступ к микрофону, чтобы говорить с ассистентом.");
      else if (event.error !== "aborted" && event.error !== "no-speech")
        setMicError("Микрофон не сработал. Скажите ещё раз или напишите текстом.");
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
      if (!aborted.current && finalText.trim()) send(finalText);
    };
    recognition.current = rec;
    setListening(true);
    rec.start();
  }

  const empty = messages.length === 0;
  const hasMic = !!SpeechRecognitionImpl;
  return (
    <section className="assistant" aria-label="Голосовой ассистент">
      <div className="assistant-feed" ref={feed}>
        {empty ? (
          <div className="assistant-hero">
            <p className="hero-greeting">
              {greeting()}
              {firstName ? `, ${firstName}` : ""}
            </p>
            <h1 className="hero-title">
              <span className="dim">Скажите,</span>
              <span>к кому</span>
              <span className="accent">записаться</span>
            </h1>
            <div className="hero-mic-zone">
              <button
                className="hero-mic"
                aria-label="Нажмите и говорите"
                onClick={hasMic ? startListening : () => inputRef.current?.focus()}
              >
                <Mic size={34} strokeWidth={1.8} />
              </button>
              <strong>{hasMic ? "Нажмите и говорите" : "Напишите запрос"}</strong>
              <span>услуга, день и бюджет — остальное сделаю сама</span>
            </div>
            <div className="assistant-suggestions">
              <span className="suggestions-label">Например</span>
              {SUGGESTIONS.map((text) => (
                <button key={text} onClick={() => send(text.replace(/[«»]/g, ""))}>
                  {text}
                </button>
              ))}
            </div>
            {!signedIn && (
              <p className="hero-signin">
                <button className="linklike" onClick={login}>
                  Войдите
                </button>
                , чтобы ассистент мог записывать вас.
              </p>
            )}
          </div>
        ) : (
          messages.map((message, i) => (
            <div
              key={i}
              className={message.role === "user" ? "bubble-row user" : "bubble-row ai"}
            >
              {message.role === "assistant" && (
                <span className="bubble-avatar" aria-hidden="true">
                  <Bot size={17} strokeWidth={1.9} />
                </span>
              )}
              <div className="bubble-stack">
                <div className="bubble">
                  <p>{message.text}</p>
                </div>
                {!!message.candidates?.length && (
                  <div className="ai-cards" role="list">
                    {message.candidates.map((c, index) => (
                      <article className="ai-card" role="listitem" key={c.service_id}>
                        <header>
                          <span className="ai-card-avatar" aria-hidden="true">
                            {initials(c.display_name)}
                          </span>
                          <div>
                            <strong>{c.display_name}</strong>
                            <span>{c.service_name}</span>
                          </div>
                        </header>
                        {index === 0 && (
                          <span className="ai-card-tag">Выгоднее всего</span>
                        )}
                        <div className="ai-card-meta">
                          {money(c.price_amount, c.currency)} · {c.duration_minutes}{" "}
                          мин
                        </div>
                        <button
                          className="ai-card-cta"
                          disabled={sending}
                          onClick={() =>
                            send(
                              `Выбираю вариант: ${c.display_name}, ${c.service_name}`,
                            )
                          }
                        >
                          Выбрать
                        </button>
                      </article>
                    ))}
                  </div>
                )}
                {!!message.slots?.length && (
                  <div className="ai-slots">
                    {message.slots.slice(0, 8).map((slot) => (
                      <button
                        key={slot.starts_at}
                        disabled={sending}
                        onClick={() =>
                          send(`Да, запиши меня на ${dateTime(slot.starts_at)}`)
                        }
                      >
                        {slotLabel(slot)}
                      </button>
                    ))}
                  </div>
                )}
                {!!message.quickReplies?.length && (
                  <div className="ai-quick">
                    {message.quickReplies.map((reply) => (
                      <button key={reply} disabled={sending} onClick={() => send(reply)}>
                        {reply}
                      </button>
                    ))}
                  </div>
                )}
                {message.booking && (
                  <div className="ai-booking">
                    <span className="ai-booking-check" aria-hidden="true">
                      <Check size={22} strokeWidth={3} />
                    </span>
                    <h3>
                      Вы записаны
                      <span>{dateTime(message.booking.starts_at)}</span>
                    </h3>
                    <dl>
                      <div>
                        <dt>Услуга</dt>
                        <dd>{message.booking.service_name_snapshot}</dd>
                      </div>
                      <div>
                        <dt>Стоимость</dt>
                        <dd>
                          {money(
                            message.booking.price_amount,
                            message.booking.currency,
                          )}{" "}
                          · оплата на месте
                        </dd>
                      </div>
                      {message.booking.address && (
                        <div>
                          <dt>Где</dt>
                          <dd>{message.booking.address}</dd>
                        </div>
                      )}
                    </dl>
                    <div className="ai-booking-actions">
                      {message.booking.address && (
                        <a
                          href={`https://2gis.kz/search/${encodeURIComponent(message.booking.address)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Navigation size={16} />
                          Маршрут
                        </a>
                      )}
                      <button onClick={openBookings}>
                        <CalendarCheck size={16} />
                        Мои записи
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        {sending && (
          <div className="bubble-row ai">
            <span className="bubble-avatar" aria-hidden="true">
              <Bot size={17} strokeWidth={1.9} />
            </span>
            <div className="bubble thinking" role="status" aria-label="Ассистент печатает">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
      </div>

      <div className="assistant-dock">
        {micError && (
          <div className="mic-status error" role="alert">
            {micError}
          </div>
        )}
        <div className="dock-row">
          <button
            className="icon-button dock-sound"
            aria-pressed={voiceOn}
            aria-label={voiceOn ? "Выключить озвучку ответов" : "Включить озвучку ответов"}
            title={voiceOn ? "Выключить озвучку" : "Включить озвучку"}
            onClick={() => {
              if (voiceOn) stopSpeaking();
              setVoiceOn(!voiceOn);
            }}
          >
            {voiceOn ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
          <form
            className="dock-input"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <input
              ref={inputRef}
              aria-label="Сообщение ассистенту"
              placeholder="Сообщение…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button
              type="submit"
              className="icon-button"
              aria-label="Отправить"
              disabled={!input.trim() || sending}
            >
              <SendHorizontal size={19} />
            </button>
          </form>
          {hasMic && (
            <button
              className="mic-button"
              aria-label="Сказать голосом"
              onClick={startListening}
            >
              <Mic size={24} />
            </button>
          )}
        </div>
      </div>

      {listening && (
        <div className="listen-overlay" role="dialog" aria-label="Голосовой ввод">
          <div className="listen-top">
            <button
              className="listen-round"
              aria-label="Отменить"
              onClick={() => stopListening(true)}
            >
              ✕
            </button>
            <span className="listen-pill">
              <span className="listen-dot" /> Слушаю…
            </span>
            <span className="listen-round listen-lang" aria-hidden="true">
              RU
            </span>
          </div>
          <div className="listen-body">
            <span className="listen-label">Вы говорите</span>
            <p className="listen-transcript">
              {interim || "…"}
              <span className="listen-caret" aria-hidden="true" />
            </p>
          </div>
          <div className="listen-bottom">
            <div className="listen-wave" aria-hidden="true">
              {Array.from({ length: 21 }, (_, i) => (
                <span key={i} style={{ animationDelay: `${(i % 7) * 0.12}s` }} />
              ))}
            </div>
            <div className="listen-controls">
              <button
                className="listen-round"
                aria-label="Ввести текстом"
                onClick={() => {
                  stopListening(true);
                  setTimeout(() => inputRef.current?.focus(), 50);
                }}
              >
                <Keyboard size={20} />
              </button>
              <button
                className="listen-stop"
                aria-label="Готово, отправить"
                onClick={() => stopListening(false)}
              >
                <Square size={20} fill="currentColor" />
              </button>
              <span className="listen-round listen-ghost" aria-hidden="true" />
            </div>
            <span className="listen-hint">Нажмите, когда закончите</span>
          </div>
        </div>
      )}
    </section>
  );
}
