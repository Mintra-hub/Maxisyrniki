// ===== Settings you fill in once (see README.md, steps 3–5) =====
export const CONFIG = {
  // Address of your Cloudflare Worker (step 4). While it contains "YOUR",
  // the site runs in DEMO mode: orders are NOT sent anywhere.
  API_URL: 'https://maxisyrniki-orders.maxisyrniki.workers.dev',

  // Your bot's username without @ (step 1), e.g. 'maxisyrniki_bot'
  BOT_USERNAME: 'maxisyrniki_bot',

  // Mini App short name from @BotFather /newapp (step 5), e.g. 'shop'.
  // Then the link https://t.me/<BOT_USERNAME>/<MINI_APP_NAME> opens the shop inside Telegram.
  MINI_APP_NAME: 'shop',

  // Your public Telegram channel, e.g. 'https://t.me/maxisyrniki'
  CHANNEL_URL: 'https://t.me/maxisyrniki',
};
