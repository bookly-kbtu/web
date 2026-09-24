import { test, expect } from "@playwright/test";

const firm = {
  id: "firm-1",
  name: "Салон красоты с длинным названием",
  category: "Красота и уход",
  address_text: "Алматы, проспект Абая, 125",
  city_name: "Алматы",
  avatar_url: null,
  average_rating: 4.9,
  reviews_count: 24,
  services_count: 4,
  masters_count: 3,
  latitude: 43.2,
  longitude: 76.9,
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    let body: unknown = [];
    if (url.pathname.endsWith("/cities"))
      body = [{ id: "city-1", name: "Алматы" }];
    else if (url.pathname.endsWith("/categories"))
      body = [{ id: "category-1", name: "Салоны красоты" }];
    else if (url.pathname.endsWith("/firms"))
      body =
        url.searchParams.get("q") === "ничего"
          ? []
          : [
              firm,
              {
                ...firm,
                id: "firm-2",
                name: "The Space",
                latitude: 43.225,
                longitude: 76.91,
              },
              {
                ...firm,
                id: "firm-3",
                name: "Atmosphere",
                latitude: 43.24,
                longitude: 76.93,
              },
            ];
    else if (url.pathname.endsWith("/firm-1"))
      body = { ...firm, description: "Пространство красоты и заботы о себе." };
    else if (url.pathname.endsWith("/services"))
      body = [
        {
          id: "service-1",
          name: "Стрижка",
          price_min_amount: 950000,
          price_max_amount: 950000,
          currency: "KZT",
          duration_minutes: 60,
        },
      ];
    else if (url.pathname.endsWith("/masters"))
      body = [
        {
          id: "master-1",
          display_name: "Алина",
          profession: "Стилист",
          avatar_url: null,
          average_rating: 4.9,
        },
      ];
    else if (url.pathname.endsWith("/otp/request"))
      body = {
        resend_available_at: new Date(Date.now() + 60000).toISOString(),
      };
    else if (url.pathname.endsWith("/login"))
      body = {
        access_token: "test",
        refresh_token: "test",
        user: { id: "user-1", first_name: "Дани", phone: "+77001234567" },
      };
    await route.fulfill({ json: body });
  });
});

test("catalog, favorites, details and responsive layout", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Список", exact: true }).click();
  await expect(page.locator(".firm-card")).toHaveCount(3);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `/tmp/bookly-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "В избранное", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: /Избранное/ }).click();
  await expect(page.locator(".firm-card")).toHaveCount(1);
  await page.reload();
  await page.getByRole("button", { name: "Список", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Убрать из избранного" }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: firm.name, exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator(".service")).toContainText("9 500");
  await page.getByRole("button", { name: "Мастера · 1" }).click();
  await expect(page.locator(".master")).toContainText("Алина");
  await page.screenshot({
    path: `/tmp/bookly-detail-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.getByRole("textbox", { name: "Поиск салонов" }).fill("ничего");
  await expect(page.getByText("Пока ничего не найдено")).toBeVisible();
  expect(errors).toEqual([]);
});

test("phone login", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await page.getByLabel("Номер телефона").fill("+77001234567");
  await page.getByRole("button", { name: "Получить код", exact: true }).click();
  await page.getByLabel("Код подтверждения").fill("1234");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Войти", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".account")).toContainText("Дани");
});

test("server failure and retry", async ({ page }) => {
  await page.route("**/market/firms?**", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Сервис временно недоступен" },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Список", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Сервис временно недоступен",
  );
  await page.unroute("**/market/firms?**");
  await page.getByRole("button", { name: "Попробовать снова" }).click();
  await expect(page.locator(".firm-card")).toHaveCount(3);
});

test("map markers, selection, area search and navigation links", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-ready",
    "true",
  );
  await expect(page.locator(".salon-pin")).toHaveCount(3);
  await expect(page.locator(".map-row")).toHaveCount(3);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: `На карте: ${firm.name}`, exact: true })
    .click();
  await expect(page.locator(".map-selection")).toContainText(firm.name);
  await expect(page.locator(".map-selection a")).toHaveAttribute(
    "href",
    "https://2gis.kz/geo/76.9,43.2?m=76.9,43.2%2F16",
  );
  await expect(page.locator(".leaflet-zoom-anim")).toHaveCount(0);
  await page.waitForFunction(
    () => {
      const tiles = Array.from(
        document.querySelectorAll<HTMLImageElement>(
          ".leaflet-tile-container img",
        ),
      );
      return (
        tiles.length > 0 &&
        tiles.every((tile) => tile.complete && tile.naturalWidth > 0)
      );
    },
    {},
    { timeout: 20000 },
  );
  await page.screenshot({
    path: `/tmp/bookly-map-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Услуги и мастера" }).click();
  await expect(
    page.getByRole("link", { name: "Открыть в 2ГИС" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Яндекс Карты" })).toBeVisible();
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.getByRole("button", { name: "Закрыть выбранный салон" }).click();
  const request = page.waitForRequest(
    (req) =>
      req.url().includes("/market/firms?") &&
      new URL(req.url()).searchParams.get("radius_m") === "3000",
  );
  await page.getByLabel("Радиус поиска").selectOption("3000");
  await page.getByRole("button", { name: "Искать здесь" }).click();
  const url = new URL((await request).url());
  expect(url.searchParams.has("lat")).toBe(true);
  expect(url.searchParams.has("lng")).toBe(true);
  await expect(page.locator(".map-row")).toHaveCount(3);
  const resetRequest = page.waitForRequest(
    (req) =>
      req.url().includes("/market/firms?") &&
      !new URL(req.url()).searchParams.has("radius_m"),
  );
  await page.getByRole("button", { name: "Сбросить область поиска" }).click();
  await resetRequest;
  expect(errors).toEqual([]);
});

test("map handles absent coordinates and geolocation denial", async ({
  page,
}) => {
  await page.route("**/market/firms?**", (route) =>
    route.fulfill({ json: [{ ...firm, latitude: null, longitude: null }] }),
  );
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition: (
          _success: unknown,
          error: (value: { code: number }) => void,
        ) => error({ code: 1 }),
      },
    }),
  );
  await page.goto("/");
  await expect(page.locator(".map-row")).toContainText("Без координат");
  await expect(page.locator(".salon-pin")).toHaveCount(0);
  await page.getByRole("button", { name: "Рядом со мной" }).click();
  await expect(page.locator(".geo-error")).toContainText(
    "Доступ к геолокации запрещён",
  );
});
