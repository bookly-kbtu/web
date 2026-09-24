import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  LocateFixed,
  MapPin,
  Maximize,
  Minus,
  Plus,
  Search,
  Star,
  X,
} from "lucide-react";
import { api, type City, type Firm } from "./api";
import { Photo } from "./components";
import { MapCanvas, type MapActions } from "./MapCanvas";
import { ALMATY, hasCoordinates, mapLinks, type Coordinates } from "./maps";
import "./map.css";

export default function MapExplore({
  city,
  category,
  query,
  saved,
  open,
}: {
  city?: City;
  category: string;
  query: string;
  saved?: Firm[];
  open: (id: string) => void;
}) {
  const [firms, setFirms] = useState<Firm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [geoError, setGeoError] = useState("");
  const [locating, setLocating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [area, setArea] = useState<Coordinates | null>(null);
  const [radius, setRadius] = useState(5000);
  const [offset, setOffset] = useState(0);
  const [more, setMore] = useState(false);
  const [retry, setRetry] = useState(0);
  const map = useRef<MapActions>(null);
  const locationRequest = useRef(0);
  useEffect(
    () => () => {
      locationRequest.current++;
    },
    [],
  );
  useEffect(() => {
    locationRequest.current++;
    setLocating(false);
    setArea(null);
    setOffset(0);
    setSelected(null);
  }, [city?.id, category, query, saved]);
  useEffect(() => {
    if (saved) {
      setFirms(saved);
      setLoading(false);
      setMore(false);
      setError("");
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    if (offset === 0) setFirms([]);
    const params = new URLSearchParams({
      limit: "100",
      offset: String(offset),
    });
    if (city) params.set("city_id", city.id);
    if (category) params.set("category_id", category);
    if (query) params.set("q", query);
    if (area) {
      params.set("lat", String(area.latitude));
      params.set("lng", String(area.longitude));
      params.set("radius_m", String(radius));
    }
    api<Firm[]>(`/market/firms?${params}`, { signal: controller.signal })
      .then((items) => {
        if (controller.signal.aborted) return;
        setFirms((old) =>
          offset === 0
            ? items
            : [...new Map([...old, ...items].map((f) => [f.id, f])).values()],
        );
        setMore(items.length === 100);
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e.message);
          setFirms([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [city?.id, category, query, area, radius, offset, retry, saved]);
  const points = useMemo(() => firms.filter(hasCoordinates), [firms]);
  const center = area || (city && hasCoordinates(city) ? city : ALMATY);
  const current = firms.find((f) => f.id === selected);
  const select = (id: string) => {
    setSelected(id);
    const row = document.getElementById(`map-row-${id}`);
    const parent = row?.parentElement;
    if (row && parent)
      parent.scrollTop +=
        row.getBoundingClientRect().top - parent.getBoundingClientRect().top;
  };
  function locate() {
    if (!navigator.geolocation) {
      setGeoError("Геолокация не поддерживается браузером.");
      return;
    }
    setLocating(true);
    setGeoError("");
    const request = ++locationRequest.current;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (request !== locationRequest.current) return;
        setLocating(false);
        const next = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setArea(next);
        setOffset(0);
        map.current?.move(next);
      },
      (e) => {
        if (request !== locationRequest.current) return;
        setLocating(false);
        setGeoError(
          e.code === 1
            ? "Доступ к геолокации запрещён. Разрешите его в настройках браузера."
            : "Не удалось определить местоположение.",
        );
      },
      { timeout: 10000, maximumAge: 60000 },
    );
  }
  return (
    <div className="map-explore">
      <aside className="map-results" aria-label="Салоны на карте">
        <div className="map-results-header">
          <div>
            <span className="eyebrow">ВАШ ГОРОД. ВАШ РИТМ.</span>
            <h3>{city?.name || "Открывайте новые места"}</h3>
          </div>
          <p role="status">
            {loading
              ? "Ищем места…"
              : `${points.length} на карте · ${firms.length} в подборке`}
          </p>
        </div>
        {error ? (
          <div className="map-empty" role="alert">
            <p>{error}</p>
            <button onClick={() => setRetry((n) => n + 1)}>Повторить</button>
          </div>
        ) : loading && !firms.length ? (
          <div className="map-empty">Загружаем салоны…</div>
        ) : !firms.length ? (
          <div className="map-empty">
            <MapPin />
            <h4>Пока нет мест</h4>
            <p>Измените фильтры или область поиска.</p>
          </div>
        ) : (
          <div className="map-list">
            {firms.map((firm) => (
              <button
                id={`map-row-${firm.id}`}
                className={`map-row ${selected === firm.id ? "selected" : ""}`}
                key={firm.id}
                onClick={() => select(firm.id)}
                aria-pressed={selected === firm.id}
              >
                <Photo src={firm.avatar_url} alt={firm.name} />
                <div>
                  <span className="map-category">
                    {firm.category || "Салон красоты"}
                  </span>
                  <h4>{firm.name}</h4>
                  <p>
                    {firm.address_text || firm.city_name || "Адрес не указан"}
                  </p>
                  <span className="map-row-meta">
                    {firm.average_rating != null && (
                      <span className="rating">
                        <Star size={12} fill="currentColor" />
                        {firm.average_rating.toFixed(1)}
                      </span>
                    )}
                    {firm.distance_meters != null
                      ? `${(firm.distance_meters / 1000).toFixed(1)} км`
                      : `${firm.services_count} услуг`}
                    {!hasCoordinates(firm) && <span>Без координат</span>}
                  </span>
                </div>
              </button>
            ))}
            {more && (
              <button
                className="map-load-more"
                disabled={loading}
                onClick={() => setOffset((n) => n + 100)}
              >
                {loading ? "Загрузка…" : "Показать ещё"}
              </button>
            )}
          </div>
        )}
      </aside>
      <div className="map-stage">
        <MapCanvas
          ref={map}
          firms={points}
          center={center}
          selected={selected}
          select={select}
        />
        {!saved && (
          <div className="map-search-area">
            <button
              onClick={() => {
                setArea(map.current?.center() || center);
                setOffset(0);
              }}
              disabled={loading}
            >
              <Search size={15} />
              Искать здесь
            </button>
            <select
              aria-label="Радиус поиска"
              value={radius}
              onChange={(e) => {
                setRadius(Number(e.target.value));
                setOffset(0);
              }}
            >
              <option value={1000}>1 км</option>
              <option value={3000}>3 км</option>
              <option value={5000}>5 км</option>
              <option value={10000}>10 км</option>
            </select>
            {area && (
              <button
                title="Сбросить область поиска"
                aria-label="Сбросить область поиска"
                onClick={() => {
                  setArea(null);
                  setOffset(0);
                }}
              >
                <X size={15} />
              </button>
            )}
          </div>
        )}
        <div className="map-tools">
          <button
            title="Приблизить"
            aria-label="Приблизить"
            onClick={() => map.current?.zoom(1)}
          >
            <Plus size={20} />
          </button>
          <button
            title="Отдалить"
            aria-label="Отдалить"
            onClick={() => map.current?.zoom(-1)}
          >
            <Minus size={20} />
          </button>
          <button
            title="Все найденные места"
            aria-label="Все найденные места"
            onClick={() => map.current?.fit()}
          >
            <Maximize size={18} />
          </button>
          <button
            title="Рядом со мной"
            aria-label="Рядом со мной"
            disabled={locating}
            onClick={locate}
          >
            <LocateFixed size={20} className={locating ? "locating" : ""} />
          </button>
        </div>
        {geoError && (
          <div className="geo-error" role="alert">
            {geoError}
            <button
              aria-label="Закрыть сообщение"
              onClick={() => setGeoError("")}
            >
              <X size={15} />
            </button>
          </div>
        )}
        {current && (
          <div className="map-selection">
            <button
              className="map-selection-close icon-button"
              aria-label="Закрыть выбранный салон"
              onClick={() => setSelected(null)}
            >
              <X size={17} />
            </button>
            <div className="map-selection-info">
              <Photo src={current.avatar_url} alt={current.name} />
              <div>
                <span className="map-category">
                  {current.category || "Салон красоты"}
                </span>
                <h3>{current.name}</h3>
                <p>{current.address_text || "Адрес не указан"}</p>
              </div>
            </div>
            <div className="map-selection-actions">
              <button className="primary" onClick={() => open(current.id)}>
                Услуги и мастера
                <ArrowUpRight size={15} />
              </button>
              <a href={mapLinks(current).dgis} target="_blank" rel="noreferrer">
                2ГИС
                <ArrowUpRight size={15} />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
