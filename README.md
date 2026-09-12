# Senimdi Sapa — Marketplace для GitHub Pages

Веб-приложение маркетплейса с покупателем, каталогом, корзиной, заказами, доставкой, картой и админ-панелью. Существующий функционал учёта товаров и отчётов сохранён.

## Что есть
- Покупатель вместо продавца
- Каталог, поиск, сортировка, корзина
- Оформление заказа
- Доставка или самовывоз
- Карта OpenStreetMap + выбор точки кликом
- Геолокация покупателя через браузер
- Админ задаёт адрес и точку магазина на карте
- Админ задаёт цену доставки и порог бесплатной доставки
- История заказов покупателя
- Firebase Auth / Firestore / Storage
- Импорт товаров CSV/JSON
- Отчёты и печать

## GitHub Pages
1. Загрузите содержимое папки `Dealer-main` в репозиторий.
2. В GitHub: Settings → Pages → Deploy from branch → `main` / root.
3. В Firebase Authentication → Settings → Authorized domains добавьте адрес GitHub Pages, например `username.github.io`.
4. Включите Google/Phone Authentication и Firestore.

## Администратор
Роль определяется через Custom Claims, `ADMIN_EMAILS` в `firebase.js` или документ `users/{uid}` с полем `role: "admin"`. Обычные пользователи получают роль `buyer`.

## Firestore
Используются коллекции:
- `users/{uid}`
- `products/{id}`
- `invoices/{id}` — заказы
- `settings/shop` — настройки магазина и доставки

Перед публикацией примените правила из `FIREBASE_SETUP.md`. Для production рекомендуется выдавать админские права только через Custom Claims/Cloud Functions и настроить строгие правила Firestore.

## Карта
Используется OpenStreetMap через Leaflet. Отдельный API-ключ карты для базовой работы не нужен.

## Важно
`firebase.js` уже содержит конфигурацию проекта из исходного архива и `USE_DEMO = false`. Не публикуйте секреты серверных сервисных аккаунтов — Firebase Web API key сам по себе не является секретом, безопасность обеспечивают Auth и Firestore Rules.
