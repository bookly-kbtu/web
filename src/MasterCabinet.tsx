import { useEffect, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  api,
  ApiError,
  json,
  money,
  type Booking,
  type BookingStatus,
  type Call,
  type MasterLocation,
  type MasterProfile,
  type MasterService,
  type PlatformCategory,
  type ScheduleException,
  type WorkingHour,
} from "./api";
import { AvatarField, BookingRow, Feedback, Status } from "./Account";

type Section = "profile" | "locations" | "services" | "schedule" | "bookings";

export default function MasterCabinet({
  call,
  becameMaster,
}: {
  call: Call;
  becameMaster: () => void;
}) {
  const [profile, setProfile] = useState<MasterProfile | null | undefined>();
  const [section, setSection] = useState<Section>("bookings");
  const [error, setError] = useState("");
  useEffect(() => {
    call<MasterProfile>("/masters/me/profile")
      .then(setProfile)
      .catch((e) => {
        if ((e as ApiError).status === 404) {
          setProfile(null);
          setSection("profile");
        } else setError(e.message);
      });
  }, [call]);
  if (profile === undefined) return <Status error={error} />;
  if (!profile)
    return (
      <div className="panel-form">
        <p className="description">
          Создайте профиль мастера, добавьте адрес, услуги и рабочие часы. После
          этого клиенты смогут записываться к вам онлайн.
        </p>
        <ProfileForm
          call={call}
          profile={null}
          saved={(p) => {
            setProfile(p);
            setSection("locations");
            becameMaster();
          }}
        />
      </div>
    );
  const sections: [Section, string][] = [
    ["bookings", "Записи"],
    ["schedule", "Расписание"],
    ["services", "Услуги"],
    ["locations", "Адреса"],
    ["profile", "Профиль"],
  ];
  return (
    <>
      <div className="chips sub-tabs">
        {sections.map(([id, label]) => (
          <button
            key={id}
            className={section === id ? "selected" : ""}
            onClick={() => setSection(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {!profile.is_active && (
        <p className="form-error">
          Профиль отключён администратором и не виден клиентам.
        </p>
      )}
      {section === "profile" && (
        <ProfileForm call={call} profile={profile} saved={setProfile} />
      )}
      {section === "locations" && <Locations call={call} />}
      {section === "services" && <Services call={call} />}
      {section === "schedule" && <Schedule call={call} />}
      {section === "bookings" && <MasterBookings call={call} />}
    </>
  );
}

function ProfileForm({
  call,
  profile,
  saved,
}: {
  call: Call;
  profile: MasterProfile | null;
  saved: (p: MasterProfile) => void;
}) {
  const [name, setName] = useState(profile?.display_name || "");
  const [description, setDescription] = useState(profile?.description || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      saved(
        await call<MasterProfile>(
          "/masters/me/profile",
          json(profile ? "PATCH" : "POST", {
            display_name: name.trim(),
            description: description.trim() || null,
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
  return (
    <form className="panel-form" onSubmit={submit}>
      {profile && (
        <AvatarField
          call={call}
          path="/masters/me/avatar"
          url={profile.avatar_url}
          changed={saved}
        />
      )}
      <label>
        Имя для клиентов
        <input
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        О себе
        <textarea
          rows={4}
          maxLength={2000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <button className="primary" disabled={busy}>
        {profile ? "Сохранить" : "Стать мастером"}
      </button>
      <Feedback message={message} error={error} />
    </form>
  );
}

function Locations({ call }: { call: Call }) {
  const [items, setItems] = useState<MasterLocation[] | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  function load() {
    call<MasterLocation[]>("/masters/me/locations")
      .then(setItems)
      .catch((e) => setError(e.message));
  }
  useEffect(load, [call]);
  function body(l: Partial<MasterLocation>) {
    return {
      name: l.name,
      address_text: l.address_text,
      latitude: l.latitude ?? null,
      longitude: l.longitude ?? null,
      time_zone: l.time_zone || "Asia/Almaty",
      is_primary: !!l.is_primary,
    };
  }
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function add(event: FormEvent) {
    event.preventDefault();
    run(async () => {
      await call(
        "/masters/me/locations",
        json(
          "POST",
          body({
            name: name.trim(),
            address_text: address.trim(),
            latitude: lat ? Number(lat) : null,
            longitude: lng ? Number(lng) : null,
            is_primary: !items?.some((l) => l.is_active),
          }),
        ),
      );
      setName("");
      setAddress("");
      setLat("");
      setLng("");
    });
  }
  if (!items) return <Status error={error} />;
  return (
    <>
      <div className="booking-list">
        {items
          .filter((l) => l.is_active)
          .map((l) => (
            <article className="service" key={l.id}>
              <div>
                <h4>
                  {l.name}{" "}
                  {l.is_primary && (
                    <span className="status status-confirmed">Основной</span>
                  )}
                </h4>
                <p>{l.address_text}</p>
                <small>{l.time_zone}</small>
              </div>
              <div className="row-actions">
                {!l.is_primary && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        call(
                          `/masters/me/locations/${l.id}`,
                          json("PATCH", body({ ...l, is_primary: true })),
                        ),
                      )
                    }
                  >
                    Сделать основным
                  </button>
                )}
                <button
                  className="icon-button"
                  title="Удалить адрес"
                  aria-label="Удалить адрес"
                  disabled={busy}
                  onClick={() =>
                    confirm("Удалить адрес?") &&
                    run(() =>
                      call(`/masters/me/locations/${l.id}`, json("DELETE")),
                    )
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
      </div>
      <form className="panel-form" onSubmit={add}>
        <h3 className="step-title">Новый адрес</h3>
        <label>
          Название
          <input
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Студия на Абая"
          />
        </label>
        <label>
          Адрес
          <input
            required
            maxLength={300}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </label>
        <div className="form-row">
          <label>
            Широта
            <input
              inputMode="decimal"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="43.2389"
            />
          </label>
          <label>
            Долгота
            <input
              inputMode="decimal"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              placeholder="76.8897"
            />
          </label>
        </div>
        <button className="primary" disabled={busy}>
          <Plus size={16} /> Добавить адрес
        </button>
        <Feedback error={error} />
      </form>
    </>
  );
}

const emptyService = {
  id: "",
  category_id: "",
  name: "",
  description: "",
  price: "",
  duration: "60",
  is_active: true,
};

function Services({ call }: { call: Call }) {
  const [items, setItems] = useState<MasterService[] | null>(null);
  const [categories, setCategories] = useState<PlatformCategory[]>([]);
  const [form, setForm] = useState(emptyService);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  function load() {
    call<MasterService[]>("/masters/me/services")
      .then(setItems)
      .catch((e) => setError(e.message));
  }
  useEffect(() => {
    load();
    api<PlatformCategory[]>("/categories")
      .then(setCategories)
      .catch(() => {});
  }, [call]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await call(
        form.id ? `/masters/me/services/${form.id}` : "/masters/me/services",
        json(form.id ? "PATCH" : "POST", {
          category_id: form.category_id,
          name: form.name.trim(),
          description: form.description.trim() || null,
          price_amount: Math.round(Number(form.price) * 100),
          currency: "KZT",
          duration_minutes: Number(form.duration),
          is_active: form.is_active,
        }),
      );
      setForm(emptyService);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function disable(id: string) {
    if (!confirm("Скрыть услугу от клиентов?")) return;
    try {
      await call(`/masters/me/services/${id}`, json("DELETE"));
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const set = (patch: Partial<typeof form>) =>
    setForm((f) => ({ ...f, ...patch }));
  if (!items) return <Status error={error} />;
  return (
    <>
      <div className="booking-list">
        {items.map((s) => (
          <article
            className={`service ${s.is_active ? "" : "inactive"}`}
            key={s.id}
          >
            <div>
              <h4>{s.name}</h4>
              <p>
                {s.category_name} · {s.duration_minutes} мин
                {s.is_active ? "" : " · скрыта"}
              </p>
            </div>
            <div className="row-side">
              <strong>{money(s.price_amount, s.currency)}</strong>
              <div className="row-actions">
                <button
                  className="text-button"
                  onClick={() =>
                    setForm({
                      id: s.id,
                      category_id: s.category_id,
                      name: s.name,
                      description: s.description || "",
                      price: String(s.price_amount / 100),
                      duration: String(s.duration_minutes),
                      is_active: s.is_active,
                    })
                  }
                >
                  Изменить
                </button>
                {s.is_active && (
                  <button
                    className="icon-button"
                    title="Скрыть"
                    aria-label="Скрыть услугу"
                    onClick={() => disable(s.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
      <form className="panel-form" onSubmit={submit}>
        <h3 className="step-title">
          {form.id ? "Изменить услугу" : "Новая услуга"}
        </h3>
        {!categories.length && (
          <p className="form-error">
            Категорий пока нет. Их создаёт администратор.
          </p>
        )}
        <label>
          Категория
          <select
            required
            value={form.category_id}
            onChange={(e) => set({ category_id: e.target.value })}
          >
            <option value="">Выберите категорию</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Название
          <input
            required
            maxLength={200}
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        </label>
        <label>
          Описание
          <textarea
            rows={3}
            maxLength={2000}
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
          />
        </label>
        <div className="form-row">
          <label>
            Цена, ₸
            <input
              required
              type="number"
              min="0"
              step="1"
              value={form.price}
              onChange={(e) => set({ price: e.target.value })}
            />
          </label>
          <label>
            Длительность, мин
            <input
              required
              type="number"
              min="5"
              step="5"
              value={form.duration}
              onChange={(e) => set({ duration: e.target.value })}
            />
          </label>
        </div>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => set({ is_active: e.target.checked })}
          />
          Показывать клиентам
        </label>
        <div className="row-actions">
          <button className="primary" disabled={busy}>
            {form.id ? "Сохранить" : "Добавить услугу"}
          </button>
          {form.id && (
            <button
              type="button"
              className="text-button"
              onClick={() => setForm(emptyService)}
            >
              Отмена
            </button>
          )}
        </div>
        <Feedback error={error} />
      </form>
    </>
  );
}

const weekdays = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
  "Воскресенье",
];
const exceptionKinds: Record<ScheduleException["exception_kind"], string> = {
  unavailable: "Выходной",
  custom_hours: "Особые часы",
  blocked_interval: "Перерыв",
};

function Schedule({ call }: { call: Call }) {
  const [locations, setLocations] = useState<MasterLocation[] | null>(null);
  const [location, setLocation] = useState("");
  const [hours, setHours] = useState<WorkingHour[]>([]);
  const [exceptions, setExceptions] = useState<ScheduleException[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [exception, setException] = useState({
    kind: "unavailable" as ScheduleException["exception_kind"],
    from: "",
    to: "",
    start: "",
    end: "",
    reason: "",
  });
  useEffect(() => {
    Promise.all([
      call<MasterLocation[]>("/masters/me/locations"),
      call<WorkingHour[]>("/masters/me/working-hours"),
      call<ScheduleException[]>("/masters/me/schedule-exceptions"),
    ])
      .then(([locations, hours, exceptions]) => {
        const active = locations.filter((l) => l.is_active);
        setLocations(active);
        setLocation((active.find((l) => l.is_primary) || active[0])?.id || "");
        setHours(
          hours.map((h) => ({
            ...h,
            start_time: h.start_time.slice(0, 5),
            end_time: h.end_time.slice(0, 5),
          })),
        );
        setExceptions(exceptions);
      })
      .catch((e) => setError(e.message));
  }, [call]);
  if (!locations) return <Status error={error} />;
  if (!locations.length)
    return <p className="muted">Сначала добавьте адрес во вкладке «Адреса».</p>;

  const day = (weekday: number) =>
    hours.find((h) => h.location_id === location && h.weekday === weekday);
  function toggle(weekday: number, on: boolean) {
    setHours((old) =>
      on
        ? [
            ...old,
            {
              location_id: location,
              weekday,
              start_time: "10:00",
              end_time: "19:00",
            },
          ]
        : old.filter(
            (h) => !(h.location_id === location && h.weekday === weekday),
          ),
    );
  }
  function change(weekday: number, patch: Partial<WorkingHour>) {
    setHours((old) =>
      old.map((h) =>
        h.location_id === location && h.weekday === weekday
          ? { ...h, ...patch }
          : h,
      ),
    );
  }
  async function saveHours() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const saved = await call<WorkingHour[]>(
        "/masters/me/working-hours",
        json("PUT", {
          items: hours.map(
            ({ location_id, weekday, start_time, end_time }) => ({
              location_id,
              weekday,
              start_time,
              end_time,
            }),
          ),
        }),
      );
      setHours(
        saved.map((h) => ({
          ...h,
          start_time: h.start_time.slice(0, 5),
          end_time: h.end_time.slice(0, 5),
        })),
      );
      setMessage("Расписание сохранено");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function addException(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const timed = exception.kind !== "unavailable";
      const item = await call<ScheduleException>(
        "/masters/me/schedule-exceptions",
        json("POST", {
          location_id: location || null,
          exception_kind: exception.kind,
          starts_on: `${exception.from}T00:00:00Z`,
          ends_on: `${exception.to || exception.from}T00:00:00Z`,
          local_start_time: timed ? exception.start : null,
          local_end_time: timed ? exception.end : null,
          reason: exception.reason.trim() || null,
        }),
      );
      setExceptions((old) => [...old, item]);
      setException((e) => ({ ...e, from: "", to: "", reason: "" }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function removeException(id: string) {
    try {
      await call(`/masters/me/schedule-exceptions/${id}`, json("DELETE"));
      setExceptions((old) => old.filter((x) => x.id !== id));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      {locations.length > 1 && (
        <div className="chips">
          {locations.map((l) => (
            <button
              key={l.id}
              className={location === l.id ? "selected" : ""}
              onClick={() => setLocation(l.id)}
            >
              {l.name}
            </button>
          ))}
        </div>
      )}
      <div className="panel-form">
        <h3 className="step-title">Рабочие часы</h3>
        {weekdays.map((name, i) => {
          const h = day(i + 1);
          return (
            <div className="hours-row" key={name}>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={!!h}
                  onChange={(e) => toggle(i + 1, e.target.checked)}
                />
                {name}
              </label>
              {h ? (
                <>
                  <input
                    type="time"
                    aria-label={`${name}, начало`}
                    value={h.start_time}
                    onChange={(e) =>
                      change(i + 1, { start_time: e.target.value })
                    }
                  />
                  <span>–</span>
                  <input
                    type="time"
                    aria-label={`${name}, конец`}
                    value={h.end_time}
                    onChange={(e) =>
                      change(i + 1, { end_time: e.target.value })
                    }
                  />
                </>
              ) : (
                <span className="muted">выходной</span>
              )}
            </div>
          );
        })}
        <button className="primary" disabled={busy} onClick={saveHours}>
          Сохранить расписание
        </button>
      </div>
      <form className="panel-form" onSubmit={addException}>
        <h3 className="step-title">Исключения</h3>
        {exceptions.map((x) => (
          <div className="service" key={x.id}>
            <div>
              <h4>{exceptionKinds[x.exception_kind]}</h4>
              <p>
                {x.starts_on.slice(0, 10)}
                {x.ends_on.slice(0, 10) !== x.starts_on.slice(0, 10)
                  ? ` – ${x.ends_on.slice(0, 10)}`
                  : ""}
                {x.local_start_time
                  ? ` · ${x.local_start_time.slice(0, 5)}–${x.local_end_time?.slice(0, 5)}`
                  : ""}
                {x.reason ? ` · ${x.reason}` : ""}
              </p>
            </div>
            <button
              type="button"
              className="icon-button"
              title="Удалить"
              aria-label="Удалить исключение"
              onClick={() => removeException(x.id)}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <label>
          Тип
          <select
            value={exception.kind}
            onChange={(e) =>
              setException((x) => ({
                ...x,
                kind: e.target.value as ScheduleException["exception_kind"],
              }))
            }
          >
            {Object.entries(exceptionKinds).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <div className="form-row">
          <label>
            С
            <input
              required
              type="date"
              value={exception.from}
              onChange={(e) =>
                setException((x) => ({ ...x, from: e.target.value }))
              }
            />
          </label>
          <label>
            По
            <input
              type="date"
              value={exception.to}
              min={exception.from}
              onChange={(e) =>
                setException((x) => ({ ...x, to: e.target.value }))
              }
            />
          </label>
        </div>
        {exception.kind !== "unavailable" && (
          <div className="form-row">
            <label>
              Время с
              <input
                required
                type="time"
                value={exception.start}
                onChange={(e) =>
                  setException((x) => ({ ...x, start: e.target.value }))
                }
              />
            </label>
            <label>
              до
              <input
                required
                type="time"
                value={exception.end}
                onChange={(e) =>
                  setException((x) => ({ ...x, end: e.target.value }))
                }
              />
            </label>
          </div>
        )}
        <label>
          Причина
          <input
            maxLength={200}
            value={exception.reason}
            onChange={(e) =>
              setException((x) => ({ ...x, reason: e.target.value }))
            }
          />
        </label>
        <button className="primary" disabled={busy}>
          <Plus size={16} /> Добавить исключение
        </button>
      </form>
      <Feedback message={message} error={error} />
    </>
  );
}

const masterActions: Partial<Record<BookingStatus, [string, string][]>> = {
  pending: [
    ["confirm", "Подтвердить"],
    ["cancel", "Отменить"],
  ],
  confirmed: [
    ["complete", "Завершить"],
    ["no-show", "Не пришёл"],
    ["cancel", "Отменить"],
  ],
};

function MasterBookings({ call }: { call: Call }) {
  const [items, setItems] = useState<Booking[] | null>(null);
  const [filter, setFilter] = useState<"upcoming" | "all">("upcoming");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  useEffect(() => {
    call<Booking[]>("/masters/me/bookings")
      .then(setItems)
      .catch((e) => setError(e.message));
  }, [call]);
  async function act(id: string, action: string) {
    if (action === "cancel" && !confirm("Отменить запись клиента?")) return;
    setBusy(id);
    setError("");
    try {
      const updated = await call<Booking>(
        `/masters/me/bookings/${id}/${action}`,
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
  const now = Date.now();
  const list = items
    .filter(
      (b) =>
        filter === "all" ||
        ((b.status === "pending" || b.status === "confirmed") &&
          Date.parse(b.ends_at) > now - 86400000),
    )
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  return (
    <div className="booking-list">
      <div className="chips">
        <button
          className={filter === "upcoming" ? "selected" : ""}
          onClick={() => setFilter("upcoming")}
        >
          Активные
        </button>
        <button
          className={filter === "all" ? "selected" : ""}
          onClick={() => setFilter("all")}
        >
          Все
        </button>
      </div>
      {list.length ? (
        list.map((b) => (
          <BookingRow
            key={b.id}
            booking={b}
            actions={masterActions[b.status]?.map(([action, label]) => (
              <button
                key={action}
                className="text-button"
                disabled={busy === b.id}
                onClick={() => act(b.id, action)}
              >
                {label}
              </button>
            ))}
          />
        ))
      ) : (
        <p className="muted">Записей нет.</p>
      )}
      <Feedback error={error} />
    </div>
  );
}
