// Single source of truth for products and prices.
// Used by the website (display) AND by the Cloudflare Worker (price check),
// so a customer can't change prices in the browser.
// To change a price: edit here, then redeploy both the site (git push) and the worker.

export const PRODUCTS = [
  {
    id: 'syrniki',
    price: 200,
    img: 'img/syrniki.jpg',
    name: { en: 'Syrniki', ru: 'Сырники', th: 'ซีร์นิกิ' },
    desc: {
      en: '1 box · 4 pcs × 75 g · frozen',
      ru: '1 коробка · 4 шт × 75 г · замороженные',
      th: '1 กล่อง · 4 ชิ้น × 75 ก. · แช่แข็ง',
    },
    // On/off option shown as a switch on the card (price is added per item)
    option: {
      price: 20,
      icon: '🔥', offIcon: '❄️',
      name: { en: 'Cook for me', ru: 'Приготовить', th: 'ทอดให้พร้อมทาน' },
      short: { en: 'cooked', ru: 'приготовить', th: 'ทอดแล้ว' },
      hint: { en: 'ready to eat', ru: 'готовые к еде', th: 'พร้อมทาน' },
      off: { en: 'frozen', ru: 'замороженные', th: 'แช่แข็ง' },
    },
    variants: [
      { id: 'vanilla', color: '#f3d27a', name: { en: 'Classic', ru: 'Классические', th: 'คลาสสิก' } },
      { id: 'strawberry', color: '#ec6b6b', name: { en: 'Strawberry', ru: 'Клубника', th: 'สตรอว์เบอร์รี' } },
      { id: 'mango', color: '#f5a623', name: { en: 'Mango', ru: 'Манго', th: 'มะม่วง' } },
      { id: 'grape', color: '#9b59b6', name: { en: 'Grape', ru: 'Виноград', th: 'องุ่น' } },
      { id: 'cranberry', color: '#8b1a1a', name: { en: 'Cranberry', ru: 'Клюква', th: 'แครนเบอร์รี' } },
    ],
  },
  {
    id: 'cottage',
    price: 200,
    img: 'img/cottage-cheese.jpg',
    name: { en: 'Cottage cheese', ru: 'Творог', th: 'คอทเทจชีส' },
    desc: { en: '500 g', ru: '500 г', th: '500 ก.' },
  },
  {
    id: 'jam',
    price: 100,
    img: 'img/jams.jpg',
    name: { en: 'Jam', ru: 'Джем', th: 'แยม' },
    desc: { en: '250 g jar', ru: 'Банка 250 г', th: 'ขวด 250 ก.' },
    variants: [
      { id: 'mango', color: '#f5a623', name: { en: 'Mango', ru: 'Манго', th: 'มะม่วง' } },
      { id: 'strawberry', color: '#e2363f', name: { en: 'Strawberry', ru: 'Клубника', th: 'สตรอว์เบอร์รี' } },
      { id: 'kiwi', color: '#7cb342', name: { en: 'Kiwi', ru: 'Киви', th: 'กีวี' } },
      { id: 'mixberry', color: '#6a1b4d', name: { en: 'Mixberry', ru: 'Ягодный микс', th: 'มิกซ์เบอร์รี' } },
    ],
  },
  {
    id: 'sourcream',
    price: 100,
    img: 'img/sour-cream.jpg',
    isNew: true,
    name: { en: 'Sour cream', ru: 'Сметана', th: 'ซาวร์ครีม' },
    desc: { en: '250 g', ru: '250 г', th: '250 ก.' },
  },
  {
    id: 'yogurt',
    price: 100,
    img: 'img/greek-yogurt.jpg',
    isNew: true,
    name: { en: 'Greek yogurt', ru: 'Греческий йогурт', th: 'กรีกโยเกิร์ต' },
    desc: {
      en: '200 g portion',
      ru: 'Порция 200 г',
      th: 'ขนาด 200 ก.',
    },
    option: {
      price: 0,
      icon: '🥣', offIcon: '🍓',
      name: { en: 'No fruits', ru: 'Без фруктов', th: 'ไม่ใส่ผลไม้' },
      short: { en: 'no fruits, 200 g yogurt', ru: 'без фруктов, 200 г йогурта', th: 'ไม่ใส่ผลไม้ โยเกิร์ต 200 ก.' },
      hint: { en: '+50 g yogurt instead of fruits', ru: '+50 г йогурта вместо фруктов', th: 'เพิ่มโยเกิร์ต 50 ก. แทนผลไม้' },
      off: { en: '150 g yogurt + 50 g fruits', ru: '150 г йогурта + 50 г фруктов', th: 'โยเกิร์ต 150 ก. + ผลไม้ 50 ก.' },
    },
  },
  {
    // Prize from the balloon game. Not shown in the product list, price 0.
    // The server allows it once per customer (by phone / Telegram account)
    // and only together with at least one paid item.
    id: 'bonus',
    price: 0,
    hidden: true,
    bonus: true,
    img: 'img/sour-cream.jpg',
    name: { en: 'Free bonus', ru: 'Бесплатный бонус', th: 'โบนัสฟรี' },
    desc: { en: 'Sour cream topping in a sauce cup', ru: 'Сметана-топинг в соуснике', th: 'ท็อปปิ้งซาวร์ครีมในถ้วยซอส' },
  },
];

export const MAX_QTY = 20;
export const BALLOON_TAPS = 5;
