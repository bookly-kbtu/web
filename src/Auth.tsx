import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, LogOut, Smartphone } from "lucide-react";
import { Modal } from "./components";
import { post, type Session } from "./api";

export default function Auth({
  session,
  update,
  close,
}: {
  session: Session | null;
  update: (s: Session | null) => void;
  close: () => void;
}) {
  const [register, setRegister] = useState(false);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const cooldown = Math.max(0, Math.ceil((resendAt - now) / 1000));
  async function requestCode() {
    setError("");
    setBusy(true);
    try {
      const result = await post<{ resend_available_at: string }>(
        "/auth/otp/request",
        { phone, channel: "sms" },
      );
      setSent(true);
      setResendAt(Date.parse(result.resend_available_at));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!sent) return requestCode();
    setError("");
    setBusy(true);
    try {
      update(
        await post<Session>(register ? "/auth/register" : "/auth/login", {
          phone,
          code,
          ...(register ? { name } : {}),
        }),
      );
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    setError("");
    try {
      await post("/auth/logout", { refresh_token: session!.refresh_token });
      update(null);
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        session
          ? "Ваш профиль"
          : register
            ? "Знакомство с Bookly"
            : "С возвращением"
      }
      close={close}
    >
      <div className="auth-body">
        {session ? (
          <>
            <div className="profile-avatar">
              {session.user.first_name.slice(0, 1)}
            </div>
            <h3>{session.user.first_name}</h3>
            <p className="muted">{session.user.phone}</p>
            <button className="primary full" disabled={busy} onClick={logout}>
              <LogOut size={17} />
              Выйти
            </button>
          </>
        ) : (
          <>
            <div className="auth-symbol">
              <Smartphone size={28} strokeWidth={1.5} />
            </div>
            <p className="auth-intro">Ваше время. Ваши места.</p>
            <div className="auth-tabs">
              <button
                onClick={() => {
                  setRegister(false);
                  setError("");
                }}
                className={!register ? "active" : ""}
              >
                Вход
              </button>
              <button
                onClick={() => {
                  setRegister(true);
                  setError("");
                }}
                className={register ? "active" : ""}
              >
                Регистрация
              </button>
            </div>
            <form onSubmit={submit}>
              {register && (
                <label>
                  Имя
                  <input
                    required
                    autoComplete="given-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={80}
                  />
                </label>
              )}
              <label>
                Номер телефона
                <input
                  type="tel"
                  required
                  autoComplete="tel"
                  placeholder="+7 700 123 45 67"
                  value={phone}
                  readOnly={sent}
                  onChange={(e) =>
                    setPhone(e.target.value.replace(/[^+\d]/g, ""))
                  }
                  pattern="\+[0-9]{10,15}"
                />
              </label>
              {sent && (
                <>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setSent(false);
                      setCode("");
                      setError("");
                    }}
                  >
                    Изменить номер
                  </button>
                  <label>
                    Код подтверждения
                    <input
                      required
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      pattern="[0-9]{4}"
                      maxLength={4}
                      value={code}
                      onChange={(e) =>
                        setCode(e.target.value.replace(/\D/g, ""))
                      }
                      className="code-input"
                    />
                  </label>
                </>
              )}
              <button className="primary full" disabled={busy}>
                {busy
                  ? "Подождите…"
                  : sent
                    ? register
                      ? "Создать аккаунт"
                      : "Войти"
                    : "Получить код"}
                <ArrowRight size={17} />
              </button>
              {sent && (
                <button
                  type="button"
                  className="text-button resend"
                  onClick={requestCode}
                  disabled={busy || cooldown > 0}
                >
                  {cooldown
                    ? `Повторить через ${cooldown} с`
                    : "Получить новый код"}
                </button>
              )}
            </form>
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
