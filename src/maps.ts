import type { Firm } from "./api";

export type Coordinates = { latitude: number; longitude: number };
export function hasCoordinates<
  T extends { latitude?: number | null; longitude?: number | null },
>(value: T): value is T & Coordinates {
  return (
    typeof value.latitude === "number" &&
    Number.isFinite(value.latitude) &&
    Math.abs(value.latitude) <= 90 &&
    typeof value.longitude === "number" &&
    Number.isFinite(value.longitude) &&
    Math.abs(value.longitude) <= 180
  );
}
export const ALMATY: Coordinates = {
  latitude: 43.238949,
  longitude: 76.889709,
};

export function mapLinks(firm: Firm) {
  const query = encodeURIComponent(
    [firm.name, firm.city_name, firm.address_text].filter(Boolean).join(", "),
  );
  const point = hasCoordinates(firm)
    ? `${firm.longitude},${firm.latitude}`
    : null;
  return {
    dgis: point
      ? `https://2gis.kz/geo/${point}?m=${point}%2F16`
      : `https://2gis.kz/search/${query}`,
    yandex: point
      ? `https://yandex.kz/maps/?pt=${point}&z=16&l=map`
      : `https://yandex.kz/maps/?text=${query}`,
    google: `https://www.google.com/maps/search/?api=1&query=${point ? `${firm.latitude},${firm.longitude}` : query}`,
  };
}
