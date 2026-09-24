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
export type Role = "client" | "master" | "admin";
export interface User {
  id: string;
  first_name: string;
  phone: string;
  roles?: Role[];
}
export interface Tokens {
  access_token: string;
  refresh_token: string;
}
export interface Session extends Tokens {
  user: User;
}

export interface PlatformCategory {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
}
export interface MasterProfile {
  user_id: string;
  display_name: string;
  description: string | null;
  avatar_url: string | null;
  is_active: boolean;
}
export interface MasterService {
  id: string;
  master_id: string;
  category_id: string;
  category_name: string;
  name: string;
  description: string | null;
  price_amount: number;
  currency: string;
  duration_minutes: number;
  is_active: boolean;
}
export interface MasterLocation {
  id: string;
  master_id: string;
  name: string;
  address_text: string;
  latitude: number | null;
  longitude: number | null;
  time_zone: string;
  is_primary: boolean;
  is_active: boolean;
}
export interface WorkingHour {
  id?: string;
  location_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
}
export interface ScheduleException {
  id: string;
  location_id: string | null;
  exception_kind: "unavailable" | "custom_hours" | "blocked_interval";
  starts_on: string;
  ends_on: string;
  local_start_time: string | null;
  local_end_time: string | null;
  reason: string | null;
}
export interface Slot {
  starts_at: string;
  ends_at: string;
}
export type BookingStatus =
  | "pending"
  | "confirmed"
  | "completed"
  | "cancelled_by_client"
  | "cancelled_by_master"
  | "no_show";
export interface Booking {
  id: string;
  client_id: string;
  master_id: string;
  master_service_id: string;
  master_location_id: string;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  service_name_snapshot: string;
  price_amount: number;
  currency: string;
  duration_minutes: number;
  client_comment: string | null;
}
export interface ClientProfile {
  user_id: string;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}
export interface Notification {
  id: string;
  booking_id: string | null;
  notification_type: string;
  payload: {
    status?: BookingStatus;
    starts_at?: string;
    service_name?: string;
  };
  read_at: string | null;
  created_at: string;
}
export interface AdminUser {
  id: string;
  phone: string | null;
  status: "active" | "blocked" | "deleted";
  roles: Role[];
  created_at: string;
}
export interface ImportRun {
  id: string;
  source_code: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  firms_processed: number;
  masters_processed: number;
  services_processed: number;
  errors_count: number;
  error_summary: string | null;
}

export type Call = (<T>(path: string, options?: RequestInit) => Promise<T>) & {
  // Reissues the access token, e.g. after roles changed on the server.
  refresh: () => Promise<unknown>;
};

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
    throw new ApiError(
      body?.error ||
        (response.status >= 500
          ? "Сервис временно недоступен. Попробуйте позже."
          : "Не удалось выполнить запрос."),
      response.status,
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

export function tokenClaims(token: string): { exp?: number; roles?: Role[] } {
  try {
    return JSON.parse(
      atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
  } catch {
    return {};
  }
}

function tokenExpiresSoon(token: string) {
  const { exp } = tokenClaims(token);
  return !exp || exp * 1000 < Date.now() + 30000;
}

// Authorised requests share one refresh: rotating the refresh token twice
// in parallel would revoke the session.
export function createClient(
  get: () => Session | null,
  set: (s: Session | null) => void,
): Call {
  let refreshing: Promise<Session | null> | null = null;
  async function fresh(force = false) {
    const session = get();
    if (!session) return null;
    if (!force && !tokenExpiresSoon(session.access_token)) return session;
    refreshing ??= post<Tokens>("/auth/refresh", {
      refresh_token: session.refresh_token,
    })
      .then((tokens) => {
        const next = { ...get()!, ...tokens };
        set(next);
        return next;
      })
      .catch(() => {
        set(null);
        return null;
      })
      .finally(() => {
        refreshing = null;
      });
    return refreshing;
  }
  async function call<T>(path: string, options: RequestInit = {}) {
    const session = await fresh();
    if (!session) throw new Error("Войдите в аккаунт, чтобы продолжить.");
    const run = (s: Session) =>
      api<T>(path, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${s.access_token}`,
        },
      });
    try {
      return await run(session);
    } catch (e) {
      if ((e as ApiError).status !== 401) throw e;
      const retried = await fresh(true);
      if (!retried) throw new Error("Сессия истекла. Войдите снова.");
      return run(retried);
    }
  }
  return Object.assign(call, { refresh: () => fresh(true) });
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
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

export const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export function money(amount: number, currency = "KZT") {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount / 100);
}

export const statusLabels: Record<BookingStatus, string> = {
  pending: "Ожидает подтверждения",
  confirmed: "Подтверждена",
  completed: "Завершена",
  cancelled_by_client: "Отменена клиентом",
  cancelled_by_master: "Отменена мастером",
  no_show: "Клиент не пришёл",
};

export function dateTime(value: string) {
  return new Date(value).toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function hasRole(user: User | undefined, role: Role) {
  return !!user?.roles?.includes(role);
}
