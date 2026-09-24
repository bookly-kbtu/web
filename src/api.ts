export interface City {
  id: string;
  name: string;
  latitude?: number | null;
  longitude?: number | null;
}
export interface Category {
  id: string;
  name: string;
}
export interface Firm {
  id: string;
  name: string;
  category: string | null;
  city_name: string | null;
  address_text: string | null;
  avatar_url: string | null;
  average_rating: number | null;
  reviews_count: number | null;
  services_count: number;
  masters_count: number;
  work_start_time: string | null;
  work_end_time: string | null;
  description?: string | null;
  latitude: number | null;
  longitude: number | null;
  distance_meters?: number | null;
}
export interface MarketStats {
  cities_count: number;
  firms_count: number;
  services_count: number;
  masters_count: number;
}
export interface Service {
  id: string;
  name: string;
  description: string | null;
  price_min_amount: number | null;
  price_max_amount: number | null;
  currency: string | null;
  duration_minutes: number | null;
}
export interface Master {
  id: string;
  display_name: string;
  profession: string | null;
  avatar_url: string | null;
  average_rating: number | null;
}
export interface User {
  id: string;
  first_name: string;
  phone: string;
}
export interface Tokens {
  access_token: string;
  refresh_token: string;
}
export interface Session extends Tokens {
  user: User;
}

export function readStorage<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(
      `${import.meta.env.VITE_API_URL || "/api/v1"}${path}`,
      {
        ...options,
        headers: { "Content-Type": "application/json", ...options.headers },
      },
    );
  } catch {
    throw new Error("Не удалось подключиться. Попробуйте ещё раз.");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      body?.error ||
        (response.status >= 500
          ? "Сервис временно недоступен. Попробуйте позже."
          : "Не удалось выполнить запрос."),
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

export const post = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });

export function price(service: Service) {
  if (service.price_min_amount == null) return "По запросу";
  const format = (amount: number) =>
    new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: service.currency || "KZT",
      maximumFractionDigits: 2,
    }).format(amount / 100);
  return service.price_max_amount != null &&
    service.price_max_amount !== service.price_min_amount
    ? `${format(service.price_min_amount)} – ${format(service.price_max_amount)}`
    : format(service.price_min_amount);
}
