// The city of Rotwell: districts and every enterable building.
// The world module places one building per LOCATIONS entry in its district.
// Gameplay modules register a handler per `type` (see DESIGN.md for owners).

export const CITY_NAME = 'Rotwell';

// Map layout: downtown in the middle, the others around it.
// `dir` is where the district sits relative to downtown.
export const DISTRICTS = {
  downtown: {
    id: 'downtown', name: 'Downtown Rotwell', dir: 'center', danger: 2,
    vibe: 'Sooty concrete towers, flickering neon, pigeons with attitude. Busy day and night.',
    palette: { ground: '#3a3733', wall: ['#5b5650', '#4a4540', '#6a5f55', '#3f3c39'], accent: '#c9a227' },
  },
  hilltop: {
    id: 'hilltop', name: 'Hilltop Heights', dir: 'north', danger: 1,
    vibe: 'Old money and new crimes. Gated mansions, a casino, a university nobody can afford. Cleaner, but rotten underneath.',
    palette: { ground: '#3d3f38', wall: ['#8a8273', '#76705f', '#9a917c', '#5f5b50'], accent: '#7a1f2b' },
  },
  rustyards: {
    id: 'rustyards', name: 'The Rustyards', dir: 'east', danger: 3,
    vibe: 'Docks, cranes, shipping containers and a meat-rendering plant you can smell from orbit. Oily black water on the east edge.',
    palette: { ground: '#33302b', wall: ['#5c3d2a', '#4b3a2c', '#6b4a33', '#3e3a36'], accent: '#b0672a' },
  },
  gutterside: {
    id: 'gutterside', name: 'Gutterside', dir: 'south', danger: 4,
    vibe: 'The slums. Graffiti, burning barrels, boarded windows, a motel that rents by the hour or the infestation. You start here.',
    palette: { ground: '#2e2b27', wall: ['#4d463c', '#3c3630', '#5a4e40', '#463d33'], accent: '#a5c234' },
  },
  dustbowl: {
    id: 'dustbowl', name: 'The Dustbowl', dir: 'west', danger: 3,
    vibe: 'Sun-bleached outskirts: trailer park, junkyard, biker bar, drag strip, and a fenced-off military bunker nobody talks about.',
    palette: { ground: '#5b4f3c', wall: ['#7a6a52', '#6b5c47', '#8a7a5e', '#54493a'], accent: '#d6b33c' },
  },
};

// type -> who handles it:
//   systems  (src/systems)  : home bar gym bank hospital police store pizza gun_shop clothing library
//                             university casino nightclub office church factory fight_club junkyard
//                             diner liquor tattoo fortune pawn gas dealer
//   vehicles (src/vehicles) : car_dealer chop_shop race
//   quests   (src/quests)   : hobo_camp city_hall gang_hq bunker warehouse
export const LOCATIONS = [
  // ---- Gutterside (south, start) ----
  { id: 'roach_motel', type: 'home', name: 'Roach Motel, Room 6', district: 'gutterside', home: { tier: 0, price: 0, rentPerDay: 0, energyRestore: 0.7 } },
  { id: 'greasy_spoon', type: 'diner', name: 'The Greasy Spoon', district: 'gutterside' },
  { id: 'gutter_liquor', type: 'liquor', name: 'Booze Hut', district: 'gutterside' },
  { id: 'ink_stinks', type: 'tattoo', name: 'Ink Stinks Tattoo', district: 'gutterside' },
  { id: 'madame_ooze', type: 'fortune', name: "Madame Ooze's Fortunes", district: 'gutterside' },
  { id: 'hobo_camp', type: 'hobo_camp', name: 'Under the Overpass', district: 'gutterside', open: true },
  { id: 'lucky_larrys', type: 'pawn', name: "Lucky Larry's Pawn", district: 'gutterside' },
  { id: 'rats_clubhouse', type: 'gang_hq', name: 'Gutter Rats Clubhouse', district: 'gutterside', faction: 'rats' },

  // ---- Downtown (center) ----
  { id: 'rusty_nail', type: 'bar', name: 'The Rusty Nail', district: 'downtown' },
  { id: 'iron_lung', type: 'gym', name: 'Iron Lung Gym', district: 'downtown' },
  { id: 'first_bank', type: 'bank', name: 'First Bank of Rotwell', district: 'downtown' },
  { id: 'st_mercy', type: 'hospital', name: "St. Mercy's (Mostly) General", district: 'downtown' },
  { id: 'rotwell_pd', type: 'police', name: 'Rotwell PD', district: 'downtown' },
  { id: 'gas_n_gulp', type: 'store', name: 'Gas-N-Gulp Mart', district: 'downtown' },
  { id: 'pizza_butt', type: 'pizza', name: 'Pizza Butt', district: 'downtown' },
  { id: 'lemon_lot', type: 'car_dealer', name: 'Lemon Lot Motors', district: 'downtown' },
  { id: 'bang_bros', type: 'gun_shop', name: 'Bang Bang Bros. Firearms', district: 'downtown' },
  { id: 'threads', type: 'clothing', name: 'Threads & Dreads Thrift', district: 'downtown' },
  { id: 'library', type: 'library', name: 'Rotwell Public Library', district: 'downtown' },
  { id: 'city_hall', type: 'city_hall', name: 'City Hall', district: 'downtown' },
  { id: 'skid_row_apts', type: 'home', name: 'Skid Row Apartments', district: 'downtown', home: { tier: 1, price: 6000, energyRestore: 0.85 } },

  // ---- Hilltop Heights (north) ----
  { id: 'rotwell_u', type: 'university', name: 'Rotwell University', district: 'hilltop' },
  { id: 'golden_tooth', type: 'casino', name: 'The Golden Tooth Casino', district: 'hilltop' },
  { id: 'club_velvet', type: 'nightclub', name: 'Club Velvet', district: 'hilltop' },
  { id: 'grimco', type: 'office', name: 'Grimco Tower', district: 'hilltop' },
  { id: 'holy_rebate', type: 'church', name: 'Church of the Holy Rebate', district: 'hilltop' },
  { id: 'syndicate_lounge', type: 'gang_hq', name: 'The Velvet Syndicate', district: 'hilltop', faction: 'syndicate' },
  { id: 'hilltop_penthouse', type: 'home', name: 'Pinnacle Penthouse', district: 'hilltop', home: { tier: 3, price: 175000, energyRestore: 1.0 } },
  { id: 'hilltop_mansion', type: 'home', name: 'Grimsworth Manor', district: 'hilltop', home: { tier: 4, price: 1000000, energyRestore: 1.0 } },

  // ---- The Rustyards (east, docks) ----
  { id: 'meat_plant', type: 'factory', name: 'Rotwell Meat & Rendering', district: 'rustyards' },
  { id: 'chop_chop', type: 'chop_shop', name: 'Chop Chop Customs', district: 'rustyards' },
  { id: 'the_pit', type: 'fight_club', name: 'The Pit', district: 'rustyards' },
  { id: 'dock_loft', type: 'home', name: 'Dockside Loft', district: 'rustyards', home: { tier: 2, price: 40000, energyRestore: 0.95 } },
  { id: 'fuel_fumes', type: 'gas', name: 'Fuel & Fumes', district: 'rustyards' },
  { id: 'warehouse_13', type: 'warehouse', name: 'Warehouse 13', district: 'rustyards' },

  // ---- The Dustbowl (west, outskirts) ----
  { id: 'double_wide', type: 'home', name: 'Double-Wide Dreams', district: 'dustbowl', home: { tier: 1, price: 3500, energyRestore: 0.8 } },
  { id: 'dirty_spur', type: 'bar', name: 'The Dirty Spur', district: 'dustbowl' },
  { id: 'junkyard', type: 'junkyard', name: "Scrapper Pete's Junkyard", district: 'dustbowl' },
  { id: 'drag_strip', type: 'race', name: 'Dustbowl Drag Strip', district: 'dustbowl' },
  { id: 'bunker', type: 'bunker', name: 'Restricted Bunker 9', district: 'dustbowl' },
  { id: 'dusty_pump', type: 'gas', name: 'Last Chance Gas', district: 'dustbowl' },
];
