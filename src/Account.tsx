import {
  lazy,
  Suspense,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Bell, CalendarDays, Check, LogOut, UserRound } from "lucide-react";
import {
  api,
  dateTime,
  hasRole,
  json,
  money,
  statusLabels,
  type Booking,
  type Call,
  type ClientProfile,
  type MasterProfile,
  type Notification,
  type Session,
} from "./api";
const MasterCabinet = lazy(() => import("./MasterCabinet"));
const Admin = lazy(() => import("./Admin"));

export type AccountTab =
  "profile" | "bookings" | "notifications" | "master" | "admin";

export default function Account({
  session,
  call,
  tab,
  setTab,
  logout,
  refreshUser,
  unreadChanged,
}: {
  session: Session;
  call: Call;
  tab: AccountTab;
  setTab: (tab: AccountTab) => void;
  logout: () => void;
  refreshUser: () => void;
  unreadChanged: () => void;
}) {
  const tabs: [AccountTab, string][] = [
    ["profile", "Профиль"],
    ["bookings", "Мои записи"],
    ["notifications", "Уведомления"],
    [
      "master",
      hasRole(session.user, "master") ? "Кабинет мастера" : "Стать мастером",
    ],
    ...(hasRole(session.user, "admin")
      ? [["admin", "Администрирование"] as [AccountTab, string]]
      : []),
  ];
  return (
    <section className="catalog panel-page">
      <div className="results-heading">
        <div>
          <span className="section-index">03</span>
          <h2>Кабинет</h2>
        </div>
        <button className="text-button" onClick={logout}>
          <LogOut size={15} /> Выйти
        </button>
      </div>
      <div className="detail-tabs account-tabs" role="tablist">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <Suspense fallback={<p className="muted">Загружаем…</p>}>
        {tab === "profile" && <Profile call={call} />}
        {tab === "bookings" && <ClientBookings call={call} />}
        {tab === "notifications" && (
          <Notifications call={call} changed={unreadChanged} />
        )}
        {tab === "master" && (
          <MasterCabinet call={call} becameMaster={refreshUser} />
        )}
        {tab === "admin" && <Admin call={call} />}
      </Suspense>
    </section>
  );
}

function Profile({ call }: { call: Call }) {
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    call<ClientProfile>("/users/me/profile")
      .then((p) => {
        setProfile(p);
        setFirstName(p.first_name || "");
        setLastName(p.last_name || "");
        setAvatar(p.avatar_url || "");
      })
      .catch((e) => setError(e.message));
  }, [call]);
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setProfile(
        await call<ClientProfile>(
          "/users/me/profile",
          json("PATCH", {
            first_name: firstName.trim(),
            last_name: lastName.trim() || null,
            avatar_url: avatar.trim() || null,
          }),
        ),
      );
      setMessage("Сохранено");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!profile) return <Status error={error} />;
  return (
    <form className="panel-form" onSubmit={save}>
      <div className="profile-avatar">
        {avatar ? <img src={avatar} alt="" /> : <UserRound size={26} />}
      </div>
      <p className="muted">{profile.phone}</p>
      <label>
        Имя
        <input
          required
          maxLength={80}
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
        />
      </label>
      <label>
        Фамилия
        <input
          maxLength={80}
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
        />
      </label>
      <label>
        Ссылка на фото
        <input
          type="url"
          value={avatar}
          onChange={(e) => setAvatar(e.target.value)}
          placeholder="https://…"
        />
      </label>
      <button className="primary" disabled={busy}>
        {busy ? "Сохраняем…" : "Сохранить"}
      </button>
      <Feedback message={message} error={error} />
    </form>
  );
}

function ClientBookings({ call }: { call: Call }) {
  const [items, setItems] = useState<Booking[] | null>(null);
  const [masters, setMasters] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  useEffect(() => {
    call<Booking[]>("/bookings/my")
      .then((items) => {
        setItems(items);
        for (const id of new Set(items.map((b) => b.master_id)))
          api<MasterProfile>(`/masters/${id}`)
            .then((m) =>
              setMasters((old) => ({ ...old, [id]: m.display_name })),
            )
            .catch(() => {});
      })
      .catch((e) => setError(e.message));
  }, [call]);
  async function cancel(id: string) {
    if (!confirm("Отменить запись?")) return;
    setBusy(id);
    setError("");
    try {
      const updated = await call<Booking>(
        `/bookings/${id}/cancel`,
        json("POST"),
      );
      setItems((old) => old!.map((b) => (b.id === id ? updated : b)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  if (!items) return <Status error={error} />;
  if (!items.length)
    return (
      <div className="empty">
        <span className="empty-icon">
          <CalendarDays size={28} />
        </span>
        <h3>Записей пока нет</h3>
        <p>Выберите мастера во вкладке «Онлайн-запись».</p>
      </div>
    );
  return (
    <div className="booking-list">
      {items.map((b) => (
        <BookingRow
          key={b.id}
          booking={b}
          subtitle={masters[b.master_id]}
          actions={
            (b.status === "pending" || b.status === "confirmed") &&
            new Date(b.starts_at) > new Date() && (
              <button
                className="text-button"
                disabled={busy === b.id}
                onClick={() => cancel(b.id)}
              >
                Отменить
              </button>
            )
          }
        />
      ))}
      <Feedback error={error} />
    </div>
  );
}

export function BookingRow({
  booking,
  subtitle,
  actions,
}: {
  booking: Booking;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <article className="service booking-row">
      <div>
        <h4>{booking.service_name_snapshot}</h4>
        <p>
          {dateTime(booking.starts_at)} · {booking.duration_minutes} мин
          {subtitle ? ` · ${subtitle}` : ""}
        </p>
        {booking.client_comment && <small>«{booking.client_comment}»</small>}
        <span className={`status status-${booking.status}`}>
          {statusLabels[booking.status]}
        </span>
      </div>
      <div className="row-side">
        <strong>{money(booking.price_amount, booking.currency)}</strong>
        <div className="row-actions">{actions}</div>
      </div>
    </article>
  );
}

function Notifications({ call, changed }: { call: Call; changed: () => void }) {
  const [items, setItems] = useState<Notification[] | null>(null);
  const [error, setError] = useState("");
  function load() {
    call<Notification[]>("/notifications?limit=50")
      .then(setItems)
      .catch((e) => setError(e.message));
  }
  useEffect(load, [call]);
  async function read(id?: string) {
    try {
      await call(
        id ? `/notifications/${id}/read` : "/notifications/read-all",
        json("POST"),
      );
      const now = new Date().toISOString();
      setItems((old) =>
        old!.map((n) =>
          !id || n.id === id ? { ...n, read_at: n.read_at || now } : n,
        ),
      );
      changed();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!items) return <Status error={error} />;
  if (!items.length)
    return (
      <div className="empty">
        <span className="empty-icon">
          <Bell size={28} />
        </span>
        <h3>Уведомлений нет</h3>
        <p>Здесь появятся новости о ваших записях.</p>
      </div>
    );
  return (
    <div className="booking-list">
      {items.some((n) => !n.read_at) && (
        <button className="text-button" onClick={() => read()}>
          Отметить все прочитанными
        </button>
      )}
      {items.map((n) => (
        <article
          className={`service notification ${n.read_at ? "" : "unread"}`}
          key={n.id}
        >
          <div>
            <h4>{notificationTitle(n)}</h4>
            <p>
              {n.payload.service_name}
              {n.payload.starts_at ? ` · ${dateTime(n.payload.starts_at)}` : ""}
            </p>
            <small>{dateTime(n.created_at)}</small>
          </div>
          {!n.read_at && (
            <button
              className="icon-button"
              title="Прочитано"
              aria-label="Отметить прочитанным"
              onClick={() => read(n.id)}
            >
              <Check size={17} />
            </button>
          )}
        </article>
      ))}
      <Feedback error={error} />
    </div>
  );
}

function notificationTitle(n: Notification) {
  if (n.payload.status) return statusLabels[n.payload.status];
  return (
    {
      booking_created: "Новая запись",
      booking_confirmed: "Запись подтверждена",
      booking_cancelled: "Запись отменена",
      booking_reminder: "Напоминание о записи",
    }[n.notification_type] || "Уведомление"
  );
}

export function Status({ error }: { error: string }) {
  return error ? (
    <p className="form-error" role="alert">
      {error}
    </p>
  ) : (
    <p className="muted" role="status">
      Загружаем…
    </p>
  );
}

export function Feedback({
  message,
  error,
}: {
  message?: string;
  error?: string;
}) {
  return (
    <>
      {message && (
        <p className="form-success" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
