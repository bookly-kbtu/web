import { useEffect, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import {
  dateTime,
  json,
  type AdminUser,
  type Booking,
  type Call,
  type ImportRun,
  type MasterProfile,
  type PlatformCategory,
  type Role,
} from "./api";
import { BookingRow, Feedback, Status } from "./Account";

type Section = "categories" | "users" | "masters" | "bookings" | "import";

export default function Admin({ call }: { call: Call }) {
  const [section, setSection] = useState<Section>("categories");
  const sections: [Section, string][] = [
    ["categories", "Категории"],
    ["users", "Пользователи"],
    ["masters", "Мастера"],
    ["bookings", "Записи"],
    ["import", "Импорт"],
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
      {section === "categories" && <Categories call={call} />}
      {section === "users" && <Users call={call} />}
      {section === "masters" && <Masters call={call} />}
      {section === "bookings" && <Bookings call={call} />}
      {section === "import" && <Import call={call} />}
    </>
  );
}

function slugify(value: string) {
  const map: Record<string, string> = {
    а: "a",
    б: "b",
    в: "v",
    г: "g",
    д: "d",
    е: "e",
    ё: "e",
    ж: "zh",
    з: "z",
    и: "i",
    й: "y",
    к: "k",
    л: "l",
    м: "m",
    н: "n",
    о: "o",
    п: "p",
    р: "r",
    с: "s",
    т: "t",
    у: "u",
    ф: "f",
    х: "h",
    ц: "ts",
    ч: "ch",
    ш: "sh",
    щ: "sch",
    ы: "y",
    э: "e",
    ю: "yu",
    я: "ya",
  };
  return value
    .toLowerCase()
    .split("")
    .map((c) => map[c] ?? c)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function Categories({ call }: { call: Call }) {
  const [items, setItems] = useState<PlatformCategory[] | null>(null);
  const [editing, setEditing] = useState<PlatformCategory | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");
  function load() {
    call<PlatformCategory[]>("/admin/categories?limit=100")
      .then(setItems)
      .catch((e) => setError(e.message));
  }
  useEffect(load, [call]);
  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await call(
        editing ? `/admin/categories/${editing.id}` : "/admin/categories",
        json(editing ? "PUT" : "POST", {
          name: name.trim(),
          slug: slug || slugify(name),
          is_active: editing?.is_active ?? true,
        }),
      );
      setEditing(null);
      setName("");
      setSlug("");
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function toggle(c: PlatformCategory) {
    setError("");
    try {
      if (c.is_active) await call(`/admin/categories/${c.id}`, json("DELETE"));
      else
        await call(
          `/admin/categories/${c.id}`,
          json("PUT", { name: c.name, slug: c.slug, is_active: true }),
        );
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!items) return <Status error={error} />;
  return (
    <>
      <div className="booking-list">
        {items.map((c) => (
          <article
            className={`service ${c.is_active ? "" : "inactive"}`}
            key={c.id}
          >
            <div>
              <h4>{c.name}</h4>
              <p>
                {c.slug}
                {c.is_active ? "" : " · отключена"}
              </p>
            </div>
            <div className="row-actions">
              <button
                className="text-button"
                onClick={() => {
                  setEditing(c);
                  setName(c.name);
                  setSlug(c.slug);
                }}
              >
                Изменить
              </button>
              <button className="text-button" onClick={() => toggle(c)}>
                {c.is_active ? "Отключить" : "Включить"}
              </button>
            </div>
          </article>
        ))}
      </div>
      <form className="panel-form" onSubmit={save}>
        <h3 className="step-title">
          {editing ? "Изменить категорию" : "Новая категория"}
        </h3>
        <label>
          Название
          <input
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Маникюр"
          />
        </label>
        <label>
          Slug
          <input
            maxLength={100}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder={slugify(name) || "manikyur"}
          />
        </label>
        <div className="row-actions">
          <button className="primary">
            <Plus size={16} /> {editing ? "Сохранить" : "Добавить"}
          </button>
          {editing && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setEditing(null);
                setName("");
                setSlug("");
              }}
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

const allRoles: Role[] = ["client", "master", "admin"];

function Users({ call }: { call: Call }) {
  const [items, setItems] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    call<AdminUser[]>("/admin/users?limit=100")
      .then(setItems)
      .catch((e) => setError(e.message));
  }, [call]);
  async function update(user: AdminUser, patch: Partial<AdminUser>) {
    setError("");
    try {
      if (patch.status)
        await call(
          `/admin/users/${user.id}/status`,
          json("PATCH", { status: patch.status }),
        );
      if (patch.roles)
        await call(
          `/admin/users/${user.id}/roles`,
          json("PUT", { roles: patch.roles }),
        );
      setItems((old) =>
        old!.map((u) => (u.id === user.id ? { ...u, ...patch } : u)),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!items) return <Status error={error} />;
  return (
    <div className="booking-list">
      {items.map((u) => (
        <article className="service" key={u.id}>
          <div>
            <h4>{u.phone || u.id}</h4>
            <p>С {new Date(u.created_at).toLocaleDateString("ru-RU")}</p>
            <div className="chips compact">
              {allRoles.map((r) => (
                <label className="checkbox" key={r}>
                  <input
                    type="checkbox"
                    checked={u.roles.includes(r)}
                    onChange={(e) =>
                      update(u, {
                        roles: e.target.checked
                          ? [...u.roles, r]
                          : u.roles.filter((x) => x !== r),
                      })
                    }
                  />
                  {r}
                </label>
              ))}
            </div>
          </div>
          <select
            aria-label="Статус"
            value={u.status}
            onChange={(e) =>
              update(u, { status: e.target.value as AdminUser["status"] })
            }
          >
            <option value="active">активен</option>
            <option value="blocked">заблокирован</option>
            <option value="deleted">удалён</option>
          </select>
        </article>
      ))}
      <Feedback error={error} />
    </div>
  );
}

function Masters({ call }: { call: Call }) {
  const [items, setItems] = useState<MasterProfile[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    call<MasterProfile[]>("/admin/masters?limit=100")
      .then(setItems)
      .catch((e) => setError(e.message));
  }, [call]);
  async function toggle(m: MasterProfile) {
    setError("");
    try {
      await call(
        `/admin/masters/${m.user_id}/status`,
        json("PATCH", { is_active: !m.is_active }),
      );
      setItems((old) =>
        old!.map((x) =>
          x.user_id === m.user_id ? { ...x, is_active: !m.is_active } : x,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!items) return <Status error={error} />;
  return (
    <div className="booking-list">
      {!items.length && <p className="muted">Мастеров пока нет.</p>}
      {items.map((m) => (
        <article
          className={`service ${m.is_active ? "" : "inactive"}`}
          key={m.user_id}
        >
          <div>
            <h4>{m.display_name}</h4>
            <p>{m.description || "Без описания"}</p>
          </div>
          <button className="text-button" onClick={() => toggle(m)}>
            {m.is_active ? "Отключить" : "Включить"}
          </button>
        </article>
      ))}
      <Feedback error={error} />
    </div>
  );
}

function Bookings({ call }: { call: Call }) {
  const [items, setItems] = useState<Booking[] | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    setItems(null);
    call<Booking[]>(
      `/admin/bookings?limit=100${status ? `&status=${status}` : ""}`,
    )
      .then(setItems)
      .catch((e) => setError(e.message));
  }, [call, status]);
  return (
    <div className="booking-list">
      <select
        aria-label="Статус записи"
        value={status}
        onChange={(e) => setStatus(e.target.value)}
      >
        <option value="">Все статусы</option>
        <option value="pending">Ожидают</option>
        <option value="confirmed">Подтверждены</option>
        <option value="completed">Завершены</option>
        <option value="cancelled_by_client">Отменены клиентом</option>
        <option value="cancelled_by_master">Отменены мастером</option>
        <option value="no_show">Неявка</option>
      </select>
      {!items ? (
        <Status error={error} />
      ) : items.length ? (
        items.map((b) => <BookingRow key={b.id} booking={b} />)
      ) : (
        <p className="muted">Записей нет.</p>
      )}
    </div>
  );
}

function Import({ call }: { call: Call }) {
  const [runs, setRuns] = useState<ImportRun[] | null>(null);
  const [cities, setCities] = useState<{ external_id: string; name: string }[]>(
    [],
  );
  const [city, setCity] = useState("");
  const [max, setMax] = useState("10");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  function load() {
    call<ImportRun[]>("/admin/import/runs?limit=20")
      .then(setRuns)
      .catch((e) => setError(e.message));
  }
  useEffect(() => {
    load();
    call<{ external_id: string; name: string }[]>(
      "/admin/import/sources/zapis_kz/cities",
    )
      .then(setCities)
      .catch(() => {});
  }, [call]);
  async function run(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await call<ImportRun>(
        "/admin/import/runs",
        json("POST", {
          source_code: "zapis_kz",
          city_id: city,
          max_firms: Number(max),
          save_snapshots: true,
        }),
      );
      setMessage(
        `Импорт: ${result.status}, фирм ${result.firms_processed}, ошибок ${result.errors_count}`,
      );
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <form className="panel-form" onSubmit={run}>
        <h3 className="step-title">Импорт с zapis.kz</h3>
        <div className="form-row">
          <label>
            Город
            <select
              required
              value={city}
              onChange={(e) => setCity(e.target.value)}
            >
              <option value="">Выберите город</option>
              {cities.map((c) => (
                <option key={c.external_id} value={c.external_id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Фирм за раз (1–50)
            <input
              type="number"
              min="1"
              max="50"
              value={max}
              onChange={(e) => setMax(e.target.value)}
            />
          </label>
        </div>
        <button className="primary" disabled={busy}>
          {busy ? "Импортируем… (до 2 минут)" : "Запустить"}
        </button>
        <Feedback message={message} error={error} />
      </form>
      {!runs ? (
        <Status error={error} />
      ) : (
        <div className="booking-list">
          {runs.map((r) => (
            <article className="service" key={r.id}>
              <div>
                <h4>
                  {r.source_code} · {r.status}
                </h4>
                <p>
                  {dateTime(r.started_at)} · фирм {r.firms_processed}, мастеров{" "}
                  {r.masters_processed}, услуг {r.services_processed}, ошибок{" "}
                  {r.errors_count}
                </p>
                {r.error_summary && <small>{r.error_summary}</small>}
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
