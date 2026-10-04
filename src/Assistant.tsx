import { useEffect, useRef, useState } from "react";
import {
  CalendarCheck,
  Mic,
  MicOff,
  SendHorizontal,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import { money, dateTime, type Booking, type Call, type Slot } from "./api";

export interface AiCandidate {
  master_id: string;
  display_name: string;
  service_id: string;
  service_name: string;
  price_amount: number;
  currency: string;
  duration_minutes: number;
}
interface AiChatResponse {
  conversation_id: string;
  reply: string;
  state: "clarify" | "recommend" | "pick_slot" | "confirm" | "booked" | "failed";
  candidates: AiCandidate[];
  slots: Slot[];
  booking: Booking | null;
}
interface Message {
  role: "user" | "assistant";
  text: string;
  candidates?: AiCandidate[];
  slots?: Slot[];
  booking?: Booking | null;
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
  "Хочу маникюр завтра после обеда",
  "Мужская стрижка в субботу, до 7000 тенге",
  "Нужно сделать брови на этой неделе",
];

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
  const voiceOnRef = useRef(voiceOn);
  voiceOnRef.current = voiceOn;
  const feed = useRef<HTMLDivElement>(null);

  useEffect(() => {
    feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  useEffect(
    () => () => {
      recognition.current?.abort();
      window.speechSynthesis?.cancel();
    },
    [],
  );

  function speak(text: string) {
    if (!voiceOnRef.current || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ru-RU";
    window.speechSynthesis.speak(utterance);
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
      setMessages((old) => [
        ...old,
        {
          role: "assistant",
          text: response.reply,
          candidates: response.candidates,
          slots: response.slots,
          booking: response.booking,
        },
      ]);
      speak(response.reply);
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

  function toggleMic() {
    if (!SpeechRecognitionImpl) return;
    if (!signedIn) return login();
    if (listening) {
      recognition.current?.stop();
      return;
    }
    setMicError("");
    window.speechSynthesis?.cancel();
    const rec = new SpeechRecognitionImpl();
    rec.lang = "ru-RU";
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    rec.onresult = (event) => {
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interimText += result[0].transcript;
      }
      setInterim(interimText || finalText);
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
      if (finalText.trim()) send(finalText);
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
          <div className="assistant-hello">
            <span className="assistant-avatar" aria-hidden="true">
              <Sparkles size={26} strokeWidth={1.6} />
            </span>
            <h1>
              {firstName ? `${firstName}, привет!` : "Привет!"}
              <br />
              <span>Куда вас записать?</span>
            </h1>
            <p>
              Скажите услугу, день и бюджет — найду мастера, покажу свободное
              время и запишу.
            </p>
            <div className="assistant-suggestions">
              {SUGGESTIONS.map((text) => (
                <button key={text} onClick={() => send(text)}>
                  {text}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message, i) => (
            <div key={i} className={`bubble-row ${message.role}`}>
              <div className="bubble">
                <p>{message.text}</p>
                {!!message.candidates?.length && (
                  <div className="ai-cards" role="list">
                    {message.candidates.map((c) => (
                      <article className="ai-card" role="listitem" key={c.service_id}>
                        <strong>{c.display_name}</strong>
                        <span>{c.service_name}</span>
                        <span className="ai-card-meta">
                          {money(c.price_amount, c.currency)} ·{" "}
                          {c.duration_minutes} мин
                        </span>
                        <button
                          className="primary"
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
                {message.booking && (
                  <div className="ai-booking">
                    <CalendarCheck size={20} />
                    <div>
                      <strong>{message.booking.service_name_snapshot}</strong>
                      <span>{dateTime(message.booking.starts_at)}</span>
                    </div>
                    <button className="primary" onClick={openBookings}>
                      Мои записи
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        {sending && (
          <div className="bubble-row assistant">
            <div className="bubble thinking" role="status" aria-label="Ассистент печатает">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
      </div>

      <div className="assistant-dock">
        {(listening || micError) && (
          <div className={`mic-status ${micError ? "error" : ""}`} role="status">
            {micError || interim || "Слушаю…"}
          </div>
        )}
        {!signedIn && (
          <div className="mic-status">
            <button className="linklike" onClick={login}>
              Войдите
            </button>
            , чтобы записываться голосом.
          </div>
        )}
        <div className="dock-row">
          <button
            className="icon-button"
            aria-pressed={voiceOn}
            aria-label={voiceOn ? "Выключить озвучку ответов" : "Включить озвучку ответов"}
            title={voiceOn ? "Выключить озвучку" : "Включить озвучку"}
            onClick={() => {
              if (voiceOn) window.speechSynthesis?.cancel();
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
              aria-label="Сообщение ассистенту"
              placeholder="Или напишите: маникюр завтра…"
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
          {SpeechRecognitionImpl ? (
            <button
              className={`mic-button ${listening ? "listening" : ""}`}
              aria-pressed={listening}
              aria-label={listening ? "Остановить запись" : "Сказать голосом"}
              onClick={toggleMic}
            >
              <Mic size={26} />
            </button>
          ) : (
            <span className="mic-button disabled" title="Голосовой ввод не поддерживается в этом браузере">
              <MicOff size={24} />
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
