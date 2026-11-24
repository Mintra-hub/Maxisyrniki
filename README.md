# Maxisyrniki: магазин в Telegram + сайт

Покупатель открывает магазин прямо в Telegram (или на сайте), выбирает товары и нажимает «Заказать».
Заказ приходит в **закрытую** группу Telegram. В канал заказы не попадают: там их увидели бы все подписчики.

```
docs/      ← сайт (GitHub Pages): index.html, app.js, стили, картинки
  catalog.js  ← ТОВАРЫ И ЦЕНЫ (одно место для правок)
  config.js   ← настройки (адрес сервера, имя бота, канал)
  i18n.js     ← тексты EN / RU / TH
worker/    ← сервер заказов (Cloudflare Workers, бесплатно)
```

Пока в `docs/config.js` не заполнен `API_URL`, сайт работает в **демо-режиме**: можно всё прощёлкать, но заказы никуда не уходят.

## Посмотреть сайт у себя на компьютере

В папке проекта выполните:
```powershell
npm start
```
Затем откройте в браузере **http://localhost:5500**.

- **С телефона:** телефон должен быть в том же Wi-Fi. Откройте адрес `http://192.168.x.x:5500`, который команда напечатает. Обычно подходит тот, что начинается на `192.168.1.` или `192.168.0.`. Если Windows спросит про доступ к сети, разрешите для «Частной сети».
- **Режим телефона на компьютере:** в Chrome нажмите F12, затем Ctrl+Shift+M.
- **Остановить сервер:** Ctrl+C в окне терминала.
- **Пока не заполнен `API_URL`, работает демо-режим:** заказ «отправляется», но никуда не уходит.
- **Начать заново:** очистить корзину, вернуть шарик, сбросить имя и адрес. В браузере нажмите F12 → вкладка Console, введите `localStorage.clear()`, нажмите Enter и обновите страницу (F5).
- **Внутри Telegram** магазин откроется только после выкладки на GitHub (шаги 3–5): Telegram требует адрес с `https://`.

> **Важно:** все аккаунты (бот, GitHub, Cloudflare, группа) лучше регистрировать на продавца, то есть на вашу девушку.

---

## Шаг 1. Создать бота (5 минут)

1. В Telegram откройте **@BotFather** и отправьте `/newbot`.
2. Название: `Maxisyrniki`. Username: например `maxisyrniki_bot` (должен заканчиваться на `bot`).
3. BotFather пришлёт **токен** вида `1234567890:AAH...`. Это пароль бота: **никому не отправляйте**, в код и в чаты не вставляйте. Он понадобится в шаге 4.
4. Запишите username бота в `docs/config.js` → `BOT_USERNAME: 'maxisyrniki_bot'`.

## Шаг 2. Закрытая группа для заказов

1. Создайте в Telegram **новую группу**, например «Заказы Maxisyrniki». Добавьте туда себя, девушку и бота.
2. Напишите в группе: `/start@maxisyrniki_bot` (с вашим username бота).
3. Откройте в браузере адрес ниже, подставив свой токен:
   `https://api.telegram.org/bot<ТОКЕН>/getUpdates`
4. Найдите `"chat":{"id":-100…` и скопируйте число **вместе с минусом**, например `-1001234567890`.
5. Вставьте его в `worker/wrangler.toml` → `ORDERS_CHAT_ID = "-1001234567890"`.

## Шаг 3. Сайт на GitHub Pages

1. Зарегистрируйтесь на https://github.com (бесплатно).
2. Создайте репозиторий **maxisyrniki** (Public). Можно оставить его пустым.
3. Загрузите в него всю папку проекта. Проще всего командами в этой папке:
   ```powershell
   git init
   git add .
   git commit -m "Maxisyrniki shop"
   git branch -M main
   git remote add origin https://github.com/ВАШ-НИК/maxisyrniki.git
   git push -u origin main
   ```
4. На GitHub откройте **Settings → Pages**. В Source выберите `Deploy from a branch`, Branch `main`, папку `/docs`, нажмите Save.
5. Через 1–2 минуты сайт откроется по адресу `https://ВАШ-НИК.github.io/maxisyrniki/`.
6. В `worker/wrangler.toml` укажите `ALLOWED_ORIGIN = "https://ВАШ-НИК.github.io"` (без `/maxisyrniki` на конце).

## Шаг 4. Сервер заказов на Cloudflare (10 минут, бесплатно)

1. Зарегистрируйтесь на https://dash.cloudflare.com.
2. В терминале, в папке `worker`:
   ```powershell
   cd worker
   npx wrangler login
   npx wrangler d1 create maxisyrniki
   ```
   Команда выдаст `database_id`. Вставьте его в `wrangler.toml` → `database_id = "..."`.
3. Создайте таблицы:
   ```powershell
   npx wrangler d1 execute maxisyrniki --remote --file=schema.sql
   ```
4. Сохраните токен бота как секрет. Команда спросит токен, вставьте его туда. В файлы токен не попадает.
   ```powershell
   npx wrangler secret put BOT_TOKEN
   ```
5. Запустите сервер:
   ```powershell
   npx wrangler deploy
   ```
   Команда покажет адрес вида `https://maxisyrniki-orders.ВАШ-АККАУНТ.workers.dev`.
6. Вставьте этот адрес в `docs/config.js` → `API_URL`, затем отправьте изменения на GitHub:
   ```powershell
   git add .
   git commit -m "config"
   git push
   ```

## Шаг 5. Магазин внутри Telegram (Mini App)

1. В @BotFather отправьте `/newapp` и выберите своего бота.
2. Title: `Maxisyrniki`. Description: `Order syrniki, cottage cheese, jams and more`.
3. Photo: загрузите `docs/img/miniapp-cover.png` (640×360, уже готова).
4. GIF: отправьте `/empty`.
5. URL: адрес сайта, например `https://ВАШ-НИК.github.io/maxisyrniki/`.
6. Short name: `shop`. Ссылка на магазин будет **`https://t.me/maxisyrniki_bot/shop`**.
7. Запишите `MINI_APP_NAME: 'shop'` в `docs/config.js` и снова сделайте `git push`.
8. Кнопка «Заказать» в чате с ботом: @BotFather → `/mybots` → ваш бот → **Bot Settings → Menu Button** → вставьте URL сайта и название `Заказать`.
9. Аватар бота: `/setuserpic` → `docs/img/icon.png`.

## Шаг 6. Проверка

1. Откройте `https://t.me/maxisyrniki_bot/shop`, добавьте товар и оформите заказ.
2. В группе «Заказы» должно появиться сообщение с составом, суммой, телефоном, адресом и кнопками «Написать клиенту» и «Карта».
3. Покупателю бот отправит «Спасибо! Заказ #N принят». Это работает, если покупатель хоть раз нажимал Start у бота.
4. Откройте магазин ещё раз: имя, телефон и адрес подставятся сами, а сверху появится кнопка «Повторить прошлый заказ».

## Как вставить магазин в канал

- Ссылку `https://t.me/maxisyrniki_bot/shop` можно добавить в описание канала и в закреплённый пост.
- Кнопку под постом можно сделать через бота для постов, например @ControllerBot, или просто ссылкой в тексте.

---

## Как поменять цены или товары

1. Откройте `docs/catalog.js` и измените `price`, названия или вкусы.
2. Обновите сайт и сервер (сервер берёт цены из этого же файла, поэтому покупатель не может подменить цену в браузере):
   ```powershell
   git add .
   git commit -m "prices"
   git push
   cd worker
   npx wrangler deploy
   ```

Язык уведомлений о заказах задаётся в `worker/wrangler.toml` → `NOTIFY_LANG` (`ru`, `th` или `en`). После изменения выполните `npx wrangler deploy`.

## Где смотреть все заказы

Cloudflare → Workers & Pages → D1 → `maxisyrniki` → таблица `orders`.

## Проверка без интернета

```powershell
node worker/test.mjs
```

Тест прогоняет сервер на поддельных данных: проверку входа через Telegram, пересчёт цен, защиту от спама и текст уведомления.
