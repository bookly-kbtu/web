import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import confetti from "canvas-confetti";
import { addToCalendar } from "./calendar";
import {
  CalendarCheck,
  CalendarPlus,
  Check,
  Keyboard,
  Mic,
  Navigation,
  SendHorizontal,
  Heart,
  Bot,
  Square,
  X,
} from "lucide-react";
import {
  api,
  money,
  dateTime,
  readStorage,
  statusLabels,
  type BookingStatus,
  type Call,
  type Firm,
  type Slot,
} from "./api";

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
interface AiAgendaItem {
  id: string;
  service_name_snapshot: string;
  starts_at: string;
  status: BookingStatus;
}
interface AiChatResponse {
  conversation_id: string;
  reply: string;
  state: "clarify" | "recommend" | "pick_slot" | "confirm" | "booked" | "failed";
  candidates: AiCandidate[];
  slots: Slot[];
  booking: AiBooking | null;
  bookings: AiAgendaItem[];
  favorites_add: { id: string; name: string }[];
  favorites_show: boolean;
}
interface Message {
  role: "user" | "assistant";
  text: string;
  candidates?: AiCandidate[];
  slots?: Slot[];
  booking?: AiBooking | null;
  agenda?: AiAgendaItem[];
  favorites?: { id: string; name: string; address_text?: string | null }[];
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
  "«Какие у меня записи?»",
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

// Booking success: a short chime (synthesised, no asset) and coral confetti.
function celebrate() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctx();
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const at = ctx.currentTime + i * 0.09;
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.55);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch {
    /* sound is a nicety; never block the flow */
  }
  confetti({
    particleCount: 90,
    spread: 75,
    startVelocity: 32,
    origin: { y: 0.72 },
    colors: ["#ff596c", "#c52e49", "#ffe2e6", "#ffd9c4", "#ffffff"],
    disableForReducedMotion: true,
  });
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
  openSaved,
  syncSaved,
}: {
  call: Call;
  signedIn: boolean;
  firstName?: string;
  login: () => void;
  openBookings: () => void;
  openSaved: () => void;
  syncSaved: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [interim, setInterim] = useState("");
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [textMode, setTextMode] = useState(false);
  const [micError, setMicError] = useState("");
  const [sttLang, setSttLang] = useState<"ru-RU" | "kk-KZ">(
    () => (localStorage.getItem("bookly-stt-lang") as "ru-RU" | "kk-KZ") || "ru-RU",
  );
  const sttLangRef = useRef(sttLang);
  sttLangRef.current = sttLang;

  function toggleSttLang() {
    const next = sttLangRef.current === "ru-RU" ? "kk-KZ" : "ru-RU";
    setSttLang(next);
    sttLangRef.current = next;
    localStorage.setItem("bookly-stt-lang", next);
    if (recognition.current) {
      stopListening(true);
      setTimeout(() => startListening(), 200);
    }
  }
  const conversation = useRef<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const aborted = useRef(false);
  const feed = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (messages.length === 0) return;
    feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  useEffect(
    () => () => {
      recognition.current?.abort();
    },
    [],
  );

  async function send(text: string) {
    const message = text.trim();
    if (!message || sending) return;
    if (!signedIn) return login();
    setInput("");
    setMessages((old) => [...old, { role: "user", text: message }]);
    setSending(true);
    try {
      const favorites = readStorage<Firm[]>("bookly-favorites", [])
        .slice(0, 50)
        .map((f) => ({ id: f.id, name: f.name }));
      const response = await call<AiChatResponse>("/ai/v1/assistant/chat", {
        method: "POST",
        body: JSON.stringify({
          conversation_id: conversation.current,
          message,
          favorites,
        }),
      });
      conversation.current = response.conversation_id;
      // The assistant added catalogue firms to favourites: hydrate them with
      // full details and persist, so the Избранное tab shows real cards.
      if (response.favorites_add.length) {
        const current = readStorage<Firm[]>("bookly-favorites", []);
        for (const item of response.favorites_add) {
          if (current.some((f) => f.id === item.id)) continue;
          const firm = await api<Firm>(`/market/firms/${item.id}`).catch(() => null);
          if (firm) current.push(firm);
        }
        localStorage.setItem("bookly-favorites", JSON.stringify(current));
        syncSaved();
      }
      if (response.booking) celebrate();
      const reply = plainText(response.reply);
      setMessages((old) => [
        ...old,
        {
          role: "assistant",
          text: reply,
          candidates: response.candidates,
          slots: response.slots,
          booking: response.booking,
          agenda: response.bookings,
          favorites: response.favorites_show
            ? readStorage<Firm[]>("bookly-favorites", []).map((f) => ({
                id: f.id,
                name: f.name,
                address_text: f.address_text,
              }))
            : undefined,
          quickReplies:
            response.state === "pick_slot"
              ? ["Другая дата", "А дешевле есть?"]
              : undefined,
        },
      ]);
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
    if (!SpeechRecognitionImpl) {
      setMicError(
        "Голосовой ввод не поддерживается в этом браузере. Откройте сайт в Chrome или Safari.",
      );
      return;
    }
    if (!signedIn) return login();
    if (listening) return stopListening(false);
    setMicError("");
    const rec = new SpeechRecognitionImpl();
    rec.lang = sttLangRef.current;
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
              <span>Куда вас</span>
              <span className="accent">записать?</span>
            </h1>
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
                {!!message.favorites && (
                  <div className="ai-agenda">
                    {message.favorites.length === 0 && (
                      <div className="ai-agenda-row">
                        <div>
                          <strong>Пока пусто</strong>
                          <span>Скажите «добавь в избранное…» или жмите сердечко в каталоге</span>
                        </div>
                      </div>
                    )}
                    {message.favorites.slice(0, 6).map((f) => (
                      <div className="ai-agenda-row" key={f.id}>
                        <div>
                          <strong>{f.name}</strong>
                          {f.address_text && <span>{f.address_text}</span>}
                        </div>
                      </div>
                    ))}
                    <button className="agenda-all" onClick={openSaved}>
                      <Heart size={15} />
                      Открыть избранное
                    </button>
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
                {!!message.agenda?.length && (
                  <div className="ai-agenda">
                    {message.agenda.slice(0, 6).map((item) => (
                      <div className="ai-agenda-row" key={item.id}>
                        <div>
                          <strong>{item.service_name_snapshot}</strong>
                          <span>{dateTime(item.starts_at)}</span>
                        </div>
                        <span className={`agenda-status ${item.status}`}>
                          {statusLabels[item.status] ?? item.status}
                        </span>
                      </div>
                    ))}
                    <button className="agenda-all" onClick={openBookings}>
                      <CalendarCheck size={15} />
                      Все записи
                    </button>
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
                      <button
                        onClick={() =>
                          addToCalendar({
                            title: `${message.booking!.service_name_snapshot} — Bookly`,
                            start: message.booking!.starts_at,
                            end: message.booking!.ends_at,
                            location: message.booking!.address,
                          })
                        }
                      >
                        <CalendarPlus size={16} />
                        В календарь
                      </button>
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
        {textMode ? (
          <form
            className="dock-input"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <button
              type="button"
              className="icon-button"
              aria-label="Скрыть поле ввода"
              onClick={() => setTextMode(false)}
            >
              <X size={18} />
            </button>
            <input
              ref={inputRef}
              autoFocus
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
        ) : (
          <div className="dock-choices">
            <button
              className="dock-choice"
              aria-label="Написать текстом"
              title="Написать текстом"
              onClick={() => setTextMode(true)}
            >
              <Keyboard size={22} />
            </button>
            <button
              className="dock-choice voice"
              aria-label="Сказать голосом"
              title="Сказать голосом"
              onClick={startListening}
            >
              <Mic size={22} />
            </button>
          </div>
        )}
      </div>

      {listening &&
        createPortal(
          <div className="listen-overlay" role="dialog" aria-label="Голосовой ввод">
          <button
            className="listen-round listen-lang-btn"
            aria-label="Язык распознавания"
            onClick={toggleSttLang}
          >
            {sttLang === "ru-RU" ? "RU" : "KK"}
          </button>
          <div className="listen-body">
            <span className="listen-orb" aria-hidden="true" />
            <p className={`listen-transcript${interim ? "" : " placeholder"}`}>
              {interim || "Говорите, я слушаю"}
            </p>
          </div>
          <div className="listen-bottom">
            <div className="listen-controls">
              <button
                className="listen-round"
                aria-label="Ввести текстом"
                onClick={() => {
                  stopListening(true);
                  setTextMode(true);
                }}
              >
                <Keyboard size={20} />
              </button>
              <button
                className="listen-stop"
                aria-label="Готово, отправить"
                onClick={() => stopListening(false)}
              >
                <Square size={18} fill="currentColor" />
              </button>
              <button
                className="listen-round"
                aria-label="Отменить"
                onClick={() => stopListening(true)}
              >
                ✕
              </button>
            </div>
            <span className="listen-hint">Нажмите ■, когда закончите</span>
          </div>
          </div>,
          document.body,
        )}
    </section>
  );
}
