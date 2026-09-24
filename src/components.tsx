import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  Clock3,
  Heart,
  MapPin,
  Scissors,
  Star,
  X,
} from "lucide-react";
import { api, price, type Firm, type Master, type Service } from "./api";
import { mapLinks } from "./maps";

export function Photo({
  src,
  alt,
  className = "",
}: {
  src?: string | null;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return src && !failed ? (
    <img
      className={className}
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  ) : (
    <div className={`photo-placeholder ${className}`}>
      <Scissors size={32} strokeWidth={1} />
      <span>{alt}</span>
    </div>
  );
}

export function Modal({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "modal wide" : "modal"}
      onCancel={close}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="modal-header">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Закрыть"
          title="Закрыть"
          onClick={close}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function FirmCard({
  firm,
  saved,
  toggle,
  open,
}: {
  firm: Firm;
  saved: boolean;
  toggle: () => void;
  open: () => void;
}) {
  return (
    <article className="firm-card">
      <div className="card-media">
        <button
          className="photo-button"
          onClick={open}
          aria-label={`Открыть ${firm.name}`}
        >
          <Photo src={firm.avatar_url} alt={firm.name} />
        </button>
        <button
          className={`save-button ${saved ? "saved" : ""}`}
          aria-label={saved ? "Убрать из избранного" : "В избранное"}
          title={saved ? "Убрать из избранного" : "В избранное"}
          aria-pressed={saved}
          onClick={toggle}
        >
          <Heart size={19} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="card-meta">
        <span>{firm.category || "Салон и мастера"}</span>
        {firm.average_rating != null && (
          <span className="rating">
            <Star size={13} fill="currentColor" />
            {firm.average_rating.toFixed(1)}
          </span>
        )}
      </div>
      <h3>
        <button onClick={open}>
          {firm.name}
          <ArrowUpRight size={18} />
        </button>
      </h3>
      <p className="address">
        <MapPin size={14} />
        {firm.address_text || firm.city_name || "Адрес не указан"}
      </p>
      <div className="card-footer">
        <span>{firm.services_count} услуг</span>
        <span>{firm.masters_count} мастеров</span>
      </div>
    </article>
  );
}

export function FirmDetails({ id, close }: { id: string; close: () => void }) {
  const [data, setData] = useState<{
    firm: Firm;
    photos: { photo_url: string }[];
    services: Service[];
    masters: Master[];
  }>();
  const [tab, setTab] = useState("services");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const options = { signal: controller.signal };
    setError("");
    Promise.all([
      api<Firm>(`/market/firms/${id}`, options),
      api<{ photo_url: string }[]>(`/market/firms/${id}/photos`, options),
      api<Service[]>(`/market/firms/${id}/services`, options),
      api<Master[]>(`/market/firms/${id}/masters`, options),
    ])
      .then(([firm, photos, services, masters]) =>
        setData({ firm, photos, services, masters }),
      )
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [id, retry]);
  return (
    <Modal title={data?.firm.name || "Салон"} close={close} wide>
      {error ? (
        <div className="empty" role="alert">
          <p>{error}</p>
          <button onClick={() => setRetry((x) => x + 1)}>Повторить</button>
        </div>
      ) : !data ? (
        <div className="empty" role="status">
          Загружаем информацию…
        </div>
      ) : (
        <>
          <div className="detail-gallery">
            {(data.photos.length
              ? data.photos.slice(0, 5).map((p) => p.photo_url)
              : [data.firm.avatar_url]
            ).map((src, i) => (
              <Photo key={i} src={src} alt={data.firm.name} />
            ))}
          </div>
          <div className="detail-body">
            <div className="detail-meta">
              <span>
                <MapPin size={16} />
                {data.firm.address_text ||
                  data.firm.city_name ||
                  "Адрес не указан"}
              </span>
              {data.firm.average_rating != null && (
                <span className="rating">
                  <Star size={15} />
                  {data.firm.average_rating.toFixed(1)} ·{" "}
                  {data.firm.reviews_count ?? 0} отзывов
                </span>
              )}
            </div>
            {data.firm.work_start_time && (
              <p className="muted">
                <Clock3 size={15} /> {data.firm.work_start_time} –{" "}
                {data.firm.work_end_time || "—"}
              </p>
            )}
            {data.firm.description && (
              <p className="description">{data.firm.description}</p>
            )}
            <div className="external-map-links">
              <a
                className="map-link"
                target="_blank"
                rel="noreferrer"
                href={mapLinks(data.firm).dgis}
              >
                Открыть в 2ГИС <ArrowUpRight size={15} />
              </a>
              <a
                className="map-link"
                target="_blank"
                rel="noreferrer"
                href={mapLinks(data.firm).yandex}
              >
                Яндекс Карты <ArrowUpRight size={15} />
              </a>
              <a
                className="map-link"
                target="_blank"
                rel="noreferrer"
                href={mapLinks(data.firm).google}
              >
                Google Maps <ArrowUpRight size={15} />
              </a>
            </div>
            <div className="detail-tabs">
              <button
                className={tab === "services" ? "active" : ""}
                onClick={() => setTab("services")}
              >
                Услуги · {data.services.length}
              </button>
              <button
                className={tab === "masters" ? "active" : ""}
                onClick={() => setTab("masters")}
              >
                Мастера · {data.masters.length}
              </button>
            </div>
            {tab === "services" ? (
              data.services.length ? (
                data.services.map((service) => (
                  <div className="service" key={service.id}>
                    <div>
                      <h4>{service.name}</h4>
                      {service.description && <p>{service.description}</p>}
                      {service.duration_minutes != null && (
                        <small>{service.duration_minutes} мин</small>
                      )}
                    </div>
                    <strong>{price(service)}</strong>
                  </div>
                ))
              ) : (
                <p className="empty">Услуги пока не добавлены</p>
              )
            ) : data.masters.length ? (
              data.masters.map((master) => (
                <div className="master" key={master.id}>
                  <Photo src={master.avatar_url} alt={master.display_name} />
                  <div>
                    <h4>{master.display_name}</h4>
                    <p>{master.profession || "Мастер"}</p>
                  </div>
                  {master.average_rating != null && (
                    <span className="rating">
                      <Star size={14} />
                      {master.average_rating.toFixed(1)}
                    </span>
                  )}
                </div>
              ))
            ) : (
              <p className="empty">Мастера пока не добавлены</p>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
