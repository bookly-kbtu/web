import { useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarCheck,
  Clock3,
  MapPin,
  Search,
  UserRound,
} from "lucide-react";
import {
  api,
  money,
  json,
  type Booking,
  type Call,
  type MasterLocation,
  type MasterProfile,
  type MasterService,
  type PlatformCategory,
  type Slot,
} from "./api";
import { Modal, Photo } from "./components";

const PAGE_SIZE = 12;

export default function Masters({
  call,
  signedIn,
  login,
  booked,
}: {
  call: Call;
  signedIn: boolean;
  login: () => void;
  booked: () => void;
}) {
  const [categories, setCategories] = useState<PlatformCategory[]>([]);
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [masters, setMasters] = useState<MasterProfile[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<MasterProfile | null>(null);

  useEffect(() => {
    api<PlatformCategory[]>("/categories")
      .then(setCategories)
      .catch(() => {});
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE + 1),
      offset: String(page * PAGE_SIZE),
    });
    if (query) params.set("q", query);
    if (category) params.set("category_id", category);
    api<MasterProfile[]>(`/masters?${params}`, { signal: controller.signal })
      .then((items) => {
        setMasters(items.slice(0, PAGE_SIZE));
        setMore(items.length > PAGE_SIZE);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, category, page]);

  return (
    <section className="catalog panel-page">
      <div className="results-heading">
        <div>
          <span className="section-index">02</span>
          <h2>Онлайн-запись</h2>
        </div>
        <span className="results-label">МАСТЕРА BOOKLY</span>
      </div>
      <div className="search-bar">
        <Search size={21} />
        <input
          aria-label="Поиск мастеров"
          placeholder="Имя мастера…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {categories.length > 0 && (
        <div className="categories expanded">
          <button
            className={!category ? "selected" : ""}
            onClick={() => {
              setCategory("");
              setPage(0);
            }}
          >
            Все мастера
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              className={category === c.id ? "selected" : ""}
              onClick={() => {
                setCategory(c.id);
                setPage(0);
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      {error ? (
        <div className="empty" role="alert">
          <p>{error}</p>
        </div>
      ) : loading ? (
        <div className="empty" role="status">
          Загружаем мастеров…
        </div>
      ) : masters.length ? (
        <div className="firm-grid">
          {masters.map((m) => (
            <article className="firm-card" key={m.user_id}>
              <div className="card-media">
                <button
                  className="photo-button"
                  onClick={() => setSelected(m)}
                  aria-label={`Записаться к ${m.display_name}`}
                >
                  <Photo src={m.avatar_url} alt={m.display_name} />
                </button>
              </div>
              <h3>
                <button onClick={() => setSelected(m)}>
                  {m.display_name}
                  <ArrowRight size={18} />
                </button>
              </h3>
              {m.description && <p className="address">{m.description}</p>}
              <button className="primary" onClick={() => setSelected(m)}>
                Записаться
                <CalendarCheck size={17} />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty">
          <span className="empty-icon">
            <UserRound size={28} />
          </span>
          <h3>Мастеров пока нет</h3>
          <p>
            Здесь появятся мастера, которые принимают записи онлайн. Если вы
            мастер, откройте кабинет и заполните профиль.
          </p>
        </div>
      )}
      {!loading && !error && (page > 0 || more) && (
        <div className="pagination">
          <button disabled={!page} onClick={() => setPage((p) => p - 1)}>
            Назад
          </button>
          <span>Страница {page + 1}</span>
          <button disabled={!more} onClick={() => setPage((p) => p + 1)}>
            Дальше
          </button>
        </div>
      )}
      {selected && (
        <BookingFlow
          master={selected}
          call={call}
          signedIn={signedIn}
          login={login}
          close={() => setSelected(null)}
          done={() => {
            setSelected(null);
            booked();
          }}
        />
      )}
    </section>
  );
}

function localDate(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function slotTime(value: string, timeZone: string) {
  return new Date(value).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
}

function BookingFlow({
  master,
  call,
  signedIn,
  login,
  close,
  done,
}: {
  master: MasterProfile;
  call: Call;
  signedIn: boolean;
  login: () => void;
  close: () => void;
  done: () => void;
}) {
  const [services, setServices] = useState<MasterService[]>([]);
  const [locations, setLocations] = useState<MasterLocation[]>([]);
  const [service, setService] = useState<MasterService | null>(null);
  const [location, setLocation] = useState("");
  const [date, setDate] = useState(localDate(0));
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slot, setSlot] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api<MasterService[]>(`/masters/${master.user_id}/services`),
      api<MasterLocation[]>(`/masters/${master.user_id}/locations`),
    ])
      .then(([services, locations]) => {
        setServices(services);
        const active = locations.filter((l) => l.is_active);
        setLocations(active);
        setLocation((active.find((l) => l.is_primary) || active[0])?.id || "");
      })
      .catch((e) => setError(e.message));
  }, [master.user_id]);
  useEffect(() => {
    setSlot("");
    if (!service || !location) return setSlots(null);
    const controller = new AbortController();
    setSlots(null);
    const params = new URLSearchParams({
      service_id: service.id,
      location_id: location,
      date,
    });
    api<Slot[]>(`/masters/${master.user_id}/slots?${params}`, {
      signal: controller.signal,
    })
      .then(setSlots)
      .catch((e) => {
        if (!controller.signal.aborted) {
          setSlots([]);
          setError(e.message);
        }
      });
    return () => controller.abort();
  }, [master.user_id, service, location, date]);

  const place = locations.find((l) => l.id === location);
  async function book() {
    if (!signedIn) return login();
    setBusy(true);
    setError("");
    try {
      await call<Booking>(
        "/bookings",
        json("POST", {
          master_id: master.user_id,
          master_service_id: service!.id,
          master_location_id: location,
          starts_at: slot,
          client_comment: comment.trim() || null,
        }),
      );
      done();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={master.display_name} close={close} wide>
      <div className="detail-body booking-flow">
        {master.description && (
          <p className="description">{master.description}</p>
        )}
        <h3 className="step-title">1. Услуга</h3>
        {services.length ? (
          <div className="choice-list">
            {services.map((s) => (
              <button
                key={s.id}
                className={`service choice ${service?.id === s.id ? "chosen" : ""}`}
                aria-pressed={service?.id === s.id}
                onClick={() => setService(s)}
              >
                <div>
                  <h4>{s.name}</h4>
                  {s.description && <p>{s.description}</p>}
                  <small>
                    {s.category_name} · {s.duration_minutes} мин
                  </small>
                </div>
                <strong>{money(s.price_amount, s.currency)}</strong>
              </button>
            ))}
          </div>
        ) : (
          <p className="muted">Мастер ещё не добавил услуги.</p>
        )}
        {service && (
          <>
            <h3 className="step-title">2. Адрес</h3>
            {locations.length ? (
              <div className="chips">
                {locations.map((l) => (
                  <button
                    key={l.id}
                    className={location === l.id ? "selected" : ""}
                    onClick={() => setLocation(l.id)}
                  >
                    <MapPin size={14} />
                    {l.name} · {l.address_text}
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted">Мастер ещё не указал адрес.</p>
            )}
            <h3 className="step-title">3. Дата и время</h3>
            <div className="chips">
              {Array.from({ length: 14 }, (_, i) => localDate(i)).map((d) => (
                <button
                  key={d}
                  className={date === d ? "selected" : ""}
                  onClick={() => setDate(d)}
                >
                  {new Date(`${d}T12:00:00`).toLocaleDateString("ru-RU", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}
                </button>
              ))}
            </div>
            {location &&
              (slots === null ? (
                <p className="muted">Ищем свободное время…</p>
              ) : slots.length ? (
                <div className="chips slots">
                  {slots.map((s) => (
                    <button
                      key={s.starts_at}
                      className={slot === s.starts_at ? "selected" : ""}
                      onClick={() => setSlot(s.starts_at)}
                    >
                      <Clock3 size={14} />
                      {slotTime(s.starts_at, place?.time_zone || "Asia/Almaty")}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="muted">На этот день свободного времени нет.</p>
              ))}
          </>
        )}
        {slot && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              book();
            }}
          >
            <label>
              Комментарий для мастера
              <input
                value={comment}
                maxLength={500}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Необязательно"
              />
            </label>
            <button className="primary full" disabled={busy}>
              {signedIn
                ? busy
                  ? "Записываем…"
                  : `Записаться на ${slotTime(slot, place?.time_zone || "Asia/Almaty")}`
                : "Войдите, чтобы записаться"}
              <ArrowRight size={17} />
            </button>
          </form>
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
