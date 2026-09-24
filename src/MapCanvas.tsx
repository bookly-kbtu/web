import {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Firm } from "./api";
import { hasCoordinates, type Coordinates } from "./maps";

export interface MapActions {
  center(): Coordinates;
  move(point: Coordinates): void;
  zoom(delta: number): void;
  fit(): void;
}
interface Engine extends MapActions {
  destroy(): void;
  points(firms: Firm[], select: (id: string) => void): void;
  highlight(id: string | null): void;
}
type Props = {
  firms: Firm[];
  center: Coordinates;
  selected: string | null;
  select: (id: string) => void;
};
const apiKey = import.meta.env.VITE_2GIS_KEY?.trim();
let sdkPromise: Promise<typeof import("@2gis/mapgl/types")> | undefined;
function loadMapGL() {
  sdkPromise ??= import("@2gis/mapgl")
    .then(({ load }) => load("https://mapgl.2gis.com/api/js/v1"))
    .catch((error) => {
      sdkPromise = undefined;
      throw error;
    });
  return sdkPromise;
}

function pin(firm: Firm, select: (id: string) => void) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "salon-pin";
  button.dataset.firm = firm.id;
  button.textContent =
    firm.average_rating != null ? `★ ${firm.average_rating.toFixed(1)}` : "●";
  button.setAttribute("aria-label", `На карте: ${firm.name}`);
  button.title = firm.name;
  button.onclick = (event) => {
    event.stopPropagation();
    select(firm.id);
  };
  return button;
}

export const MapCanvas = forwardRef<MapActions, Props>(function MapCanvas(
  { firms, center, selected, select },
  ref,
) {
  const container = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const latest = useRef({ firms, center, selected, select });
  latest.current = { firms, center, selected, select };
  const [provider, setProvider] = useState<"2gis" | "osm">(
    apiKey ? "2gis" : "osm",
  );
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useImperativeHandle(
    ref,
    () => ({
      center: () => engine.current?.center() || latest.current.center,
      move: (point) => engine.current?.move(point),
      zoom: (delta) => engine.current?.zoom(delta),
      fit: () => engine.current?.fit(),
    }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;
    const timeout = window.setTimeout(() => {
      if (!cancelled && !engine.current)
        setError(
          "Карта долго загружается. Попробуйте ещё раз или смените карту.",
        );
    }, 15000);
    setReady(false);
    setError("");
    const host = container.current!;
    // A private host keeps a late SDK load from touching a remounted map.
    const node = document.createElement("div");
    node.className = "map-engine";
    host.append(node);
    const initial = latest.current.center;
    const selectPin = (id: string) => latest.current.select(id);
    const highlight = (id: string | null) =>
      node
        .querySelectorAll<HTMLButtonElement>(".salon-pin")
        .forEach((button) => {
          button.classList.toggle("selected", button.dataset.firm === id);
          button.setAttribute(
            "aria-pressed",
            String(button.dataset.firm === id),
          );
        });
    async function start() {
      if (provider === "2gis") {
        const sdk = await loadMapGL();
        if (cancelled) return;
        const map = new sdk.Map(node, {
          key: apiKey!,
          center: [initial.longitude, initial.latitude],
          zoom: 12,
          maxZoom: 19,
          zoomControl: false,
        });
        let markers: InstanceType<typeof sdk.HtmlMarker>[] = [];
        let points: Coordinates[] = [];
        map.on("error", () => {
          if (!cancelled)
            setError("Не удалось загрузить 2ГИС. Можно открыть другую карту.");
        });
        const fit = () => {
          if (!points.length) return;
          if (points.length === 1) {
            map.setCenter([points[0].longitude, points[0].latitude]);
            map.setZoom(15);
            return;
          }
          map.fitBounds(
            {
              southWest: [
                Math.min(...points.map((p) => p.longitude)),
                Math.min(...points.map((p) => p.latitude)),
              ],
              northEast: [
                Math.max(...points.map((p) => p.longitude)),
                Math.max(...points.map((p) => p.latitude)),
              ],
            },
            { padding: { top: 90, bottom: 70, left: 65, right: 65 } },
          );
          if (map.getZoom() > 16) map.setZoom(16);
        };
        engine.current = {
          center: () => {
            const [longitude, latitude] = map.getCenter();
            return { latitude, longitude };
          },
          move: (p) => {
            map.setCenter([p.longitude, p.latitude]);
            map.setZoom(14);
          },
          zoom: (delta) => map.setZoom(map.getZoom() + delta),
          fit,
          highlight,
          points: (firms, select) => {
            markers.forEach((m) => m.destroy());
            points = firms.filter(hasCoordinates);
            markers = firms.filter(hasCoordinates).map(
              (firm) =>
                new sdk.HtmlMarker(map, {
                  coordinates: [firm.longitude, firm.latitude],
                  html: pin(firm, select),
                  anchor: [26, 36],
                }),
            );
          },
          destroy: () => {
            markers.forEach((m) => m.destroy());
            map.destroy();
          },
        };
      } else {
        const map = L.map(node, {
          zoomControl: false,
          scrollWheelZoom: true,
        }).setView([initial.latitude, initial.longitude], 12);
        const tiles = L.tileLayer(
          import.meta.env.VITE_MAP_TILE_URL ||
            "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
          {
            maxZoom: 19,
            attribution:
              import.meta.env.VITE_MAP_ATTRIBUTION ||
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          },
        ).addTo(map);
        tiles.on("tileerror", () => {
          if (!cancelled)
            setError("Часть карты не загрузилась. Проверьте соединение.");
        });
        const group = L.featureGroup().addTo(map);
        const fit = () => {
          if (group.getLayers().length)
            map.fitBounds(group.getBounds(), {
              padding: [65, 80],
              maxZoom: 16,
              animate: false,
            });
        };
        const observer = new ResizeObserver(() => map.invalidateSize());
        observer.observe(node);
        engine.current = {
          center: () => ({
            latitude: map.getCenter().lat,
            longitude: map.getCenter().lng,
          }),
          move: (p) =>
            map.setView([p.latitude, p.longitude], 14, { animate: false }),
          zoom: (delta) => map.setZoom(map.getZoom() + delta),
          fit,
          highlight,
          points: (firms, select) => {
            group.clearLayers();
            firms.filter(hasCoordinates).forEach((firm) => {
              L.marker([firm.latitude, firm.longitude], {
                keyboard: false,
                icon: L.divIcon({
                  html: pin(firm, select),
                  className: "salon-marker",
                  iconSize: [52, 36],
                  iconAnchor: [26, 36],
                }),
              }).addTo(group);
            });
          },
          destroy: () => {
            observer.disconnect();
            map.remove();
          },
        };
      }
      destroy = engine.current!.destroy;
      window.clearTimeout(timeout);
      engine.current!.points(latest.current.firms, selectPin);
      engine.current!.highlight(latest.current.selected);
      engine.current!.fit();
      setReady(true);
    }
    start().catch(() => {
      if (!cancelled)
        setError("Карта недоступна. Попробуйте ещё раз или смените карту.");
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      destroy?.();
      engine.current = null;
      node.remove();
    };
  }, [provider, attempt]);

  useEffect(() => {
    if (ready) {
      engine.current?.points(firms, (id) => latest.current.select(id));
      engine.current?.highlight(latest.current.selected);
      engine.current?.fit();
    }
  }, [firms, ready]);
  useEffect(() => {
    engine.current?.move(center);
  }, [center.latitude, center.longitude]);
  useEffect(() => {
    engine.current?.highlight(selected);
    const firm = firms.find((f) => f.id === selected);
    if (firm && hasCoordinates(firm)) engine.current?.move(firm);
  }, [selected, firms]);
  return (
    <>
      <div
        className="map-canvas"
        ref={container}
        role="region"
        aria-label="Карта салонов"
        data-ready={ready}
      />
      <div className="map-provider">
        <span className="provider-dot" />
        {provider === "2gis" ? "2ГИС" : "OpenStreetMap"}
        {apiKey && (
          <button
            onClick={() => setProvider((p) => (p === "osm" ? "2gis" : "osm"))}
          >
            Сменить карту
          </button>
        )}
      </div>
      {error && (
        <div className="map-warning" role="alert">
          <span>{error}</span>
          <button onClick={() => setAttempt((n) => n + 1)}>Повторить</button>
          {provider === "2gis" && (
            <button onClick={() => setProvider("osm")}>OpenStreetMap</button>
          )}
        </div>
      )}
    </>
  );
});
