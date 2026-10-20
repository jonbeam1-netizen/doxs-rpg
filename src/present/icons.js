// One small line-icon set (16px grid, 1.5 stroke, currentColor) for location types and prompt verbs.
// icon(name) -> inline <svg> string ('' for unknown names).
const P = {
  food: 'M5 2v12M3.3 2v3.2a1.7 1.7 0 003.4 0V2M11.5 14V2c-1.6.8-2.5 2.6-2.5 5.2h2.5',
  drink: 'M3 3h10L8 8.6zM8 8.6V13.4M5.4 13.6h5.2',
  music: 'M6 12.3V3.8l7-1.4v8.4M6 12.3a1.8 1.8 0 11-3.6 0 1.8 1.8 0 013.6 0zM13 10.8a1.8 1.8 0 11-3.6 0 1.8 1.8 0 013.6 0z',
  shop: 'M3.4 5.6h9.2l-.8 8H4.2zM6 5.6V4.2a2 2 0 014 0v1.4',
  money: 'M2 4.6h12v6.8H2zM8 6.3a1.7 1.7 0 110 3.4 1.7 1.7 0 010-3.4zM4.2 8h.01M11.8 8h.01',
  dice: 'M3 3h10v10H3zM5.7 5.7h.01M10.3 5.7h.01M8 8h.01M5.7 10.3h.01M10.3 10.3h.01',
  gun: 'M2 5.8h11v2.6H7.6L6.6 12H4l.9-3.6H2zM13 6.2h1.2',
  gym: 'M2.4 8h11.2M4.4 5.2v5.6M11.6 5.2v5.6M2.4 6.4v3.2M13.6 6.4v3.2',
  fist: 'M4.2 7.2V5.6a1 1 0 012 0v1M6.2 6.6V4.8a1 1 0 012 0v1.8M8.2 6.6V5.2a1 1 0 012 0v1.6M10.2 7V6a1 1 0 012 0v3.6c0 2.2-1.6 3.9-4 3.9H7.4c-1.9 0-3.2-1.4-3.2-3.4V7.2',
  book: 'M3 3.6c2-.8 3.6-.7 5 .5 1.4-1.2 3-1.3 5-.5v9c-2-.8-3.6-.7-5 .5-1.4-1.2-3-1.3-5-.5zM8 4.1v9',
  school: 'M1.5 6L8 3l6.5 3L8 9zM4.5 7.4v3c1 .9 2.1 1.4 3.5 1.4s2.5-.5 3.5-1.4v-3M14.5 6v3.4',
  home: 'M2.5 7.4L8 3l5.5 4.4M4 6.3V13h8V6.3M6.8 13V9.8h2.4V13',
  badge: 'M8 2l5 2v4c0 3-2.2 5-5 6-2.8-1-5-3-5-6V4z',
  hall: 'M2.5 6L8 3l5.5 3zM3.6 6.6v6M6.5 6.6v6M9.5 6.6v6M12.4 6.6v6M2.5 13.4h11',
  medical: 'M6.5 2.5h3v4h4v3h-4v4h-3v-4h-4v-3h4z',
  work: 'M2.5 5.6h11V13h-11zM6 5.6V4h4v1.6M2.5 9h11',
  crate: 'M2.5 5L8 2.5 13.5 5v8.5h-11zM2.5 7.5h11M5.2 13.5V10h5.6v3.5',
  wrench: 'M10.6 2.4a3 3 0 00-2.9 3.9l-4.9 4.9a1.4 1.4 0 002 2l4.9-4.9a3 3 0 003.9-2.9l-1.7 1-1.6-.5-.5-1.6z',
  car: 'M2.4 10.4V8.4L4 5h8l1.6 3.4v2zM4.6 12.4v-2M11.4 12.4v-2M4.6 8.2h.01M11.4 8.2h.01',
  flag: 'M3.6 14V2.4M3.6 3h8.8l-2 3 2 3H3.6',
  church: 'M8 1.8v4M6.5 3.3h3M4 14V8.6L8 6l4 2.6V14zM7 14v-2.6h2V14',
  skull: 'M8 2.4c-3 0-5 2-5 4.6 0 1.6.8 2.7 2 3.3V13h6v-2.7c1.2-.6 2-1.7 2-3.3 0-2.6-2-4.6-5-4.6zM6 7.4h.01M10 7.4h.01M7.2 13v-1.6M8.8 13v-1.6',
  eye: 'M1.5 8S4 3.6 8 3.6 14.5 8 14.5 8 12 12.4 8 12.4 1.5 8 1.5 8zM8 6.4a1.6 1.6 0 110 3.2 1.6 1.6 0 010-3.2z',
  flame: 'M8 2.2c.6 2.6 3.6 3.6 3.6 6.8a3.6 3.6 0 01-7.2 0c0-1.6.8-2.4 1.5-3.1.2 1.2.8 1.9 1.6 2.1-.1-2.1.1-4 .5-5.8z',
  hatch: 'M8 2.5a5.5 5.5 0 110 11 5.5 5.5 0 010-11zM8 4.8v6.4M4.8 8h6.4',
  anchor: 'M8 4.6v9M5.5 7h5M3 9.6c0 2.3 2.2 4 5 4s5-1.7 5-4M8 2a1.3 1.3 0 110 2.6A1.3 1.3 0 018 2z',
  fish: 'M2 8c2-3 6-4 9-1.6L14 4.6v6.8l-3-1.8C8 12 4 11 2 8zM5.2 7.6h.01',
  light: 'M6 14l1-8.6h2l1 8.6zM6.6 5.4h2.8M7 3h2v2.4H7zM3 3.6l3 1.2M13 3.6l-3 1.2',
  arcade: 'M3 10h10v3.5H3zM8 10V6.2M8 3a1.6 1.6 0 110 3.2A1.6 1.6 0 018 3z',
  bars: 'M3 3h10v10H3zM6.3 3v10M9.7 3v10',
  drop: 'M8 2.4s4 4.3 4 7a4 4 0 01-8 0c0-2.7 4-7 4-7z',
  pill: 'M4.2 11.8a2.6 2.6 0 010-3.7l3.9-3.9a2.6 2.6 0 013.7 3.7l-3.9 3.9a2.6 2.6 0 01-3.7 0zM6.1 6.2l3.7 3.7',
  door: 'M4 14V2.4h8V14M2.4 14h11.2M9.6 8.4v.6',
  talk: 'M2.5 3.4h11v7.2h-6l-3 2.6v-2.6h-2z',
  star: 'M8 2l1.8 3.8 4.2.5-3.1 2.9.8 4.1L8 11.3l-3.7 2 .8-4.1L2 6.3l4.2-.5z',
};

export const TYPE_ICON = {
  diner: 'food', pizza: 'food', isle_seafood: 'fish', bar: 'drink', liquor: 'drink', nightclub: 'music',
  store: 'shop', clothing: 'shop', pawn: 'shop', gas: 'shop', shop: 'shop', pharmacy: 'medical', tattoo: 'drop',
  bank: 'money', casino: 'dice', gun_shop: 'gun', gym: 'gym', fight_club: 'fist', library: 'book', university: 'school',
  home: 'home', police: 'badge', city_hall: 'hall', hospital: 'medical', factory: 'work', office: 'work',
  warehouse: 'crate', junkyard: 'wrench', chop_shop: 'wrench', car_dealer: 'car', race: 'flag', church: 'church',
  gang_hq: 'skull', fortune: 'eye', hobo_camp: 'flame', bunker: 'hatch', isle_arcade: 'arcade', isle_cove: 'anchor',
  isle_pier: 'anchor', isle_lighthouse: 'light', isle_prison: 'bars', dealer: 'pill',
};

const cache = new Map();
export function icon(name) {
  if (!P[name]) return '';
  let s = cache.get(name);
  if (!s) {
    s = `<svg class="pr-ico" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="${P[name]}"/></svg>`;
    cache.set(name, s);
  }
  return s;
}
