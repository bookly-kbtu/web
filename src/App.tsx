import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Heart,
  LayoutGrid,
  Map,
  MapPin,
  Search,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import {
  api,
  createClient,
  post,
  tokenClaims,
  readStorage,
  type Category,
  type City,
  type Firm,
  type Session,
  type User,
  type MarketStats,
} from "./api";
import { FirmCard, FirmDetails } from "./components";
import Auth from "./Auth";
import type { AccountTab } from "./Account";
const MapExplore = lazy(() => import("./MapExplore"));
const Masters = lazy(() => import("./Masters"));
const Account = lazy(() => import("./Account"));

const PAGE_SIZE = 12;

export default function App() {
  const [cities, setCities] = useState<City[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [city, setCity] = useState("");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [firms, setFirms] = useState<Firm[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filtersError, setFiltersError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [view, setView] = useState<"catalog" | "saved" | "masters" | "account">(
    "catalog",
  );
  const [accountTab, setAccountTab] = useState<AccountTab>("bookings");
  const [unread, setUnread] = useState(0);
  const [saved, setSaved] = useState<Firm[]>(() =>
    readStorage("bookly-favorites", []),
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [session, setSession] = useState<Session | null>(() =>
    readStorage("bookly-session", null),
  );
  const [filters, setFilters] = useState(false);
  const [layout, setLayout] = useState<"grid" | "map">("map");
  const [stats, setStats] = useState<MarketStats | null>(null);

  useEffect(() => {
    let active = true;
    api<MarketStats>("/market/stats")
      .then((value) => {
        if (active && Number.isFinite(value.firms_count)) setStats(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [retry]);

  const sessionRef = useRef(session);
  function updateSession(value: Session | null) {
    sessionRef.current = value;
    setSession(value);
    if (value) localStorage.setItem("bookly-session", JSON.stringify(value));
    else localStorage.removeItem("bookly-session");
  }
  const call = useMemo(
    () => createClient(() => sessionRef.current, updateSession),
    [],
  );
  const signedIn = !!session;
  function refreshUnread() {
    if (!sessionRef.current) return setUnread(0);
    call<{ count: number }>("/notifications/unread-count")
      .then((r) => setUnread(r.count))
      .catch(() => {});
  }
  useEffect(() => {
    refreshUnread();
    if (!signedIn) return;
    const timer = setInterval(refreshUnread, 60000);
    return () => clearInterval(timer);
  }, [signedIn]);
  async function refreshUser() {
    try {
      const user = await call<User>("/auth/me");
      if (!sessionRef.current) return;
      updateSession({ ...sessionRef.current, user });
      const tokenRoles = tokenClaims(sessionRef.current.access_token).roles;
      if (
        [...(tokenRoles || [])].sort().join() !==
        [...(user.roles || [])].sort().join()
      )
        await call.refresh();
    } catch {
      /* the client already signs out on a dead session */
    }
  }
  useEffect(() => {
    if (signedIn) refreshUser();
  }, [signedIn]);
  function openAccount(tab: AccountTab = accountTab) {
    if (!sessionRef.current) return setAuthOpen(true);
    setAccountTab(tab);
    setView("account");
    window.scrollTo(0, 0);
  }
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    let active = true;
    Promise.all([
      api<City[]>("/market/cities"),
      api<Category[]>("/market/categories?kind=category&limit=100"),
    ])
      .then(([cities, categories]) => {
        if (active) {
          setCities(cities);
          setCategories(categories);
          setFiltersError(false);
        }
      })
      .catch(() => {
        if (active) setFiltersError(true);
      });
    return () => {
      active = false;
    };
  }, [retry]);
  useEffect(() => {
    const controller = new AbortController();
    if (view !== "catalog" || layout === "map") return;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE + 1),
      offset: String(page * PAGE_SIZE),
    });
    if (query) params.set("q", query);
    if (city) params.set("city_id", city);
    if (category) params.set("category_id", category);
    api<Firm[]>(`/market/firms?${params}`, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setFirms(result.slice(0, PAGE_SIZE));
          setMore(result.length > PAGE_SIZE);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [city, category, query, page, retry, view, layout]);
  function toggleSaved(firm: Firm) {
    setSaved((old) => {
      const next = old.some((f) => f.id === firm.id)
        ? old.filter((f) => f.id !== firm.id)
        : [...old, firm];
      localStorage.setItem("bookly-favorites", JSON.stringify(next));
      return next;
    });
  }
  function reset() {
    setSearch("");
    setQuery("");
    setCity("");
    setCategory("");
    setPage(0);
  }
  const list =
    view === "saved"
      ? saved.filter((f) =>
          `${f.name} ${f.address_text || ""}`
            .toLowerCase()
            .includes(search.toLowerCase()),
        )
      : firms;
  return (
    <>
      <header className="header">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setView("catalog");
            reset();
          }}
        >
          <span className="brand-mark" aria-hidden="true">
            B<Sparkles size={12} />
          </span>
          Bookly
        </a>
        <nav aria-label="Основная навигация">
          <button
            className={view === "catalog" ? "active" : ""}
            onClick={() => setView("catalog")}
          >
            Открыть для себя
          </button>
          <button
            className={view === "masters" ? "active" : ""}
            onClick={() => setView("masters")}
          >
            Онлайн-запись
          </button>
          <button
            className={view === "saved" ? "active" : ""}
            onClick={() => setView("saved")}
          >
            Избранное
            {saved.length > 0 && (
              <span className="nav-count">{saved.length}</span>
            )}
          </button>
        </nav>
        {session && (
          <button
            className="icon-button bell"
            aria-label={`Уведомления${unread ? `: ${unread} новых` : ""}`}
            title="Уведомления"
            onClick={() => openAccount("notifications")}
          >
            <Bell size={19} />
            {unread > 0 && <span className="nav-count">{unread}</span>}
          </button>
        )}
        <button className="account" onClick={() => openAccount()}>
          <UserRound size={17} />
          <span>{session?.user.first_name || "Войти"}</span>
          <ArrowUpRight size={15} />
        </button>
      </header>
      {view === "masters" || view === "account" ? (
        <main>
          <Suspense
            fallback={
              <div className="empty" role="status">
                Загружаем…
              </div>
            }
          >
            {view === "masters" ? (
              <Masters
                call={call}
                signedIn={signedIn}
                login={() => setAuthOpen(true)}
                booked={() => {
                  refreshUnread();
                  openAccount("bookings");
                }}
              />
            ) : session ? (
              <Account
                session={session}
                call={call}
                tab={accountTab}
                setTab={setAccountTab}
                refreshUser={refreshUser}
                unreadChanged={refreshUnread}
                logout={async () => {
                  await post("/auth/logout", {
                    refresh_token: session.refresh_token,
                  }).catch(() => {});
                  updateSession(null);
                  setView("catalog");
                }}
              />
            ) : null}
          </Suspense>
        </main>
      ) : (
        <main className={layout === "map" ? "map-mode" : ""}>
          <section className="intro">
            <div className="intro-top">
              <span className="eyebrow">
                <span className="live-dot" /> BEAUTY & SELF-CARE
              </span>
              <span className="edition">МЕСТА. ЛЮДИ. ВЫ.</span>
            </div>
            <div className="intro-line">
              <h1>
                {view === "saved" ? (
                  <>
                    Ваши любимые
                    <br />
                    <span>места.</span>
                  </>
                ) : (
                  <>
                    Время
                    <br />
                    <span>для себя.</span>
                    <span className="heading-star" aria-hidden="true">
                      ✳
                    </span>
                  </>
                )}
              </h1>
              <div className="intro-note">
                <span className="note-icon">
                  <Sparkles size={25} strokeWidth={1.5} />
                </span>
                <p>
                  {view === "saved"
                    ? "То, к чему хочется возвращаться."
                    : "Хороший мастер меняет не только образ. Но и настроение."}
                </p>
                <a href="#catalog" aria-label="Перейти к каталогу">
                  <ArrowDown size={22} />
                </a>
              </div>
            </div>
            <div className="intro-bottom">
              <span>
                {view === "saved"
                  ? "ВАША ЛИЧНАЯ ПОДБОРКА"
                  : "НАЙДИТЕ СВОЁ МЕСТО"}
              </span>
              <span>01 / BOOKLY SELECT</span>
            </div>
          </section>
          <section id="catalog" className="catalog">
            <div className="search-bar">
              <Search size={21} />
              <input
                aria-label="Поиск салонов"
                placeholder="Название салона, адрес…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  className="icon-button"
                  aria-label="Очистить поиск"
                  title="Очистить поиск"
                  onClick={() => setSearch("")}
                >
                  <X size={17} />
                </button>
              )}
              {view === "catalog" && (
                <>
                  <div className="city-select">
                    <MapPin size={18} />
                    <select
                      aria-label="Город"
                      value={city}
                      onChange={(e) => {
                        setCity(e.target.value);
                        setPage(0);
                      }}
                    >
                      <option value="">Все города</option>
                      {cities.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    className={`filter-button ${filters ? "active" : ""}`}
                    aria-expanded={filters}
                    aria-label="Категории"
                    title="Категории"
                    onClick={() => setFilters(!filters)}
                  >
                    <SlidersHorizontal size={20} />
                  </button>
                </>
              )}
            </div>
            {view === "catalog" && (
              <div className={`categories ${filters ? "expanded" : ""}`}>
                <button
                  className={!category ? "selected" : ""}
                  onClick={() => {
                    setCategory("");
                    setPage(0);
                  }}
                >
                  <Sparkles size={15} />
                  Все места
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
            {filtersError && view === "catalog" && (
              <div className="filter-error" role="alert">
                Не удалось загрузить фильтры.{" "}
                <button onClick={() => setRetry((x) => x + 1)}>
                  Повторить
                </button>
              </div>
            )}
            <div className="results-heading">
              <div>
                <span className="section-index">
                  {view === "saved" ? "02" : "01"}
                </span>
                <h2>
                  {view === "saved"
                    ? "Избранное"
                    : category
                      ? categories.find((c) => c.id === category)?.name
                      : "Места, которые вдохновляют"}
                </h2>
              </div>
              <div className="results-controls">
                <span className="results-label">
                  {view === "saved"
                    ? `${list.length} мест`
                    : stats
                      ? `${stats.firms_count.toLocaleString("ru-RU")} мест в каталоге`
                      : "САЛОНЫ И МАСТЕРА"}
                </span>
                <div
                  className="layout-toggle"
                  role="group"
                  aria-label="Вид каталога"
                >
                  <button
                    title="Карта"
                    aria-pressed={layout === "map"}
                    onClick={() => setLayout("map")}
                  >
                    <Map size={16} />
                    Карта
                  </button>
                  <button
                    title="Список"
                    aria-pressed={layout === "grid"}
                    onClick={() => setLayout("grid")}
                  >
                    <LayoutGrid size={16} />
                    Список
                  </button>
                </div>
              </div>
            </div>
            {layout === "map" ? (
              <Suspense
                fallback={
                  <div className="empty" role="status">
                    Загружаем карту…
                  </div>
                }
              >
                <MapExplore
                  city={cities.find((c) => c.id === city)}
                  category={category}
                  query={query}
                  saved={view === "saved" ? list : undefined}
                  open={setSelected}
                />
              </Suspense>
            ) : view === "catalog" && error ? (
              <div className="empty error-state" role="alert">
                <span className="empty-icon">
                  <Search size={28} />
                </span>
                <h3>Немного тишины</h3>
                <p>{error}</p>
                <button
                  className="primary"
                  onClick={() => setRetry((x) => x + 1)}
                >
                  Попробовать снова
                  <ArrowRight size={17} />
                </button>
              </div>
            ) : view === "catalog" && loading ? (
              <div
                className="firm-grid"
                aria-label="Загрузка салонов"
                aria-busy="true"
              >
                {Array.from({ length: 6 }, (_, i) => (
                  <div className="skeleton" key={i}>
                    <div />
                    <span />
                    <span />
                  </div>
                ))}
              </div>
            ) : list.length ? (
              <div className="firm-grid">
                {list.map((firm, i) => (
                  <div
                    key={firm.id}
                    className="card-enter"
                    style={{ animationDelay: `${i * 35}ms` }}
                  >
                    <FirmCard
                      firm={firm}
                      saved={saved.some((s) => s.id === firm.id)}
                      toggle={() => toggleSaved(firm)}
                      open={() => setSelected(firm.id)}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty">
                <span className="empty-icon">
                  {view === "saved" ? (
                    <Heart size={28} />
                  ) : (
                    <Search size={28} />
                  )}
                </span>
                <h3>
                  {view === "saved"
                    ? "Любимые места ещё впереди"
                    : "Пока ничего не найдено"}
                </h3>
                <p>
                  {view === "saved"
                    ? "Здесь будут салоны, которые вам понравились."
                    : "Попробуйте другой запрос или город."}
                </p>
                <button
                  className="primary"
                  onClick={() => {
                    reset();
                    setView("catalog");
                  }}
                >
                  {view === "saved" ? "Открыть каталог" : "Сбросить фильтры"}
                  <ArrowRight size={17} />
                </button>
              </div>
            )}
            {layout === "grid" &&
              view === "catalog" &&
              !error &&
              !loading &&
              (page > 0 || more) && (
                <div className="pagination">
                  <button
                    disabled={!page}
                    onClick={() => {
                      setPage((p) => p - 1);
                      document.getElementById("catalog")?.scrollIntoView();
                    }}
                  >
                    <ArrowLeft size={17} />
                    Назад
                  </button>
                  <span>Страница {page + 1}</span>
                  <button
                    disabled={!more}
                    onClick={() => {
                      setPage((p) => p + 1);
                      document.getElementById("catalog")?.scrollIntoView();
                    }}
                  >
                    Дальше
                    <ArrowRight size={17} />
                  </button>
                </div>
              )}
          </section>
          <section className="closing">
            <span className="closing-mark" aria-hidden="true">
              ✳
            </span>
            <p>
              Забота о себе.
              <br />
              <span>Всегда хорошая идея.</span>
            </p>
            <a href="#catalog" aria-label="Вернуться к каталогу">
              <ArrowUpRight size={32} />
            </a>
          </section>
        </main>
      )}
      <footer>
        <a className="brand" href="#">
          <span className="brand-mark" aria-hidden="true">
            B<Sparkles size={12} />
          </span>
          Bookly
        </a>
        <span>Маленькие перемены. Хорошее настроение.</span>
        <span>© {new Date().getFullYear()} Bookly</span>
      </footer>
      {selected && (
        <FirmDetails id={selected} close={() => setSelected(null)} />
      )}
      {authOpen && (
        <Auth
          session={session}
          update={(value) => {
            updateSession(value);
            if (!value && view === "account") setView("catalog");
          }}
          close={() => setAuthOpen(false)}
        />
      )}
    </>
  );
}
