// ==========================================================================
// 1. КОНСТАНТЫ
// ==========================================================================

const APP_NAME = "food-diary";

const NUTRIENT_KEYS = [
  "kcal",
  "protein",
  "fat",
  "carbs",
  "fiber",
  "sugar",
  "freeSugar",
  "salt",
  "satFat",
  "transFat",
];

const MICRO_KEYS = [
  "vitaminA",
  "vitaminC",
  "vitaminD",
  "vitaminE",
  "vitaminK",
  "vitaminB6",
  "vitaminB12",
  "folate",
  "calcium",
  "iron",
  "potassium",
  "magnesium",
  "zinc",
];

// Суточные нормы (FDA Daily Values)
const MICRO_NORMALS = {
  vitaminA: 900,
  vitaminC: 90,
  vitaminD: 20,
  vitaminE: 15,
  vitaminK: 120,
  vitaminB6: 1.7,
  vitaminB12: 2.4,
  folate: 400,
  calcium: 1300,
  iron: 18,
  potassium: 4700,
  magnesium: 420,
  zinc: 11,
};

const KCAL_PER_GRAM = { protein: 4, fat: 9, carbs: 4 };

const SNACK = 0;
const BREAKFAST = 1;
const LUNCH = 2;
const DINNER = 3;

const DAY = 0;
const WEEK = 1;
const MONTH = 2;

const QUICK_GRAMS = [50, 100, 200, 500];
const MAX_GRAMS = 5000;
const DEFAULT_SERVING = 100;
const STEP_KCAL = 0.0005;

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"];
const NORM_RATIO_HIGH = 1.1;
const PHOTO_MAX_WIDTH = 1280;
const PHOTO_QUALITY = 0.82;

const MAINTAIN = 0;
const LOSE = -1;
const GAIN = 1;

const DEFAULT_PERSON = {
  sex: true,
  birthdate: null,
  height: 175,
  weight: 70,
  activity: 1.375,
  weightGoal: MAINTAIN,
};

const LOGS = {
  water: {
    icon: "droplet",
    max: 10000,
    decimals: 0,
    quick: [150, 250, 330, 500],
    add: true,
  },
  sleep: {
    icon: "moon",
    max: 24,
    decimals: 1,
    quick: [6, 7, 8, 9],
  },
  steps: {
    icon: "steps",
    max: 100000,
    decimals: 0,
    quick: [3000, 5000, 8000, 10000],
  },
  weight: {
    icon: "scale",
    max: 500,
    decimals: 1,
    quick: [],
  },
};

const STORAGE_KEYS = [
  "meals",
  "foods",
  "person",
  "weight",
  "water",
  "sleep",
  "activity",
  "tags",
  "favorites",
  "recents",
];

// ==========================================================================
// 2. ВНЕШНИЕ ДАННЫЕ
// ==========================================================================

const REFS = Array.isArray(window.REFS)
  ? window.REFS
  : (console.warn("window.REFS is not an array, food base is empty"), []);
const translations = window.TRANSLATIONS || {};
const PHOTO_API_URL = window.PHOTO_API_URL || "";

// ==========================================================================
// 3. СОСТОЯНИЕ
// ==========================================================================

let S = {};
let lang = "en";

let person;
let meals = [];
let foods = [];
let tags = [];
let favorites = [];
let recents = [];

const log = {
  water: [],
  sleep: [],
  steps: [],
  weight: [],
};

let date = new Date();
let today = new Date(date);

let calendarDate = new Date(date);
let calendarPages = {};
let chosenButton = null;

let page = null;
let link = null;

// Индексы, сбрасываются при изменении данных
let dayIndex = null;
let frequency = null;

// ==========================================================================
// 4. УТИЛИТЫ
// ==========================================================================

const $ = (id) => document.getElementById(id);

const pad = (n, d = 2) => String(n).padStart(d, "0");
const getDate = (d) => {
  d = new Date(d);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
};
const getTimeText = (d) => {
  d = new Date(d);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const getDateText = (d) => {
  d = new Date(d);
  return `${d.getDate()} ${S.mons[d.getMonth()]}`;
};

const startOfDay = (d) => {
  d = new Date(d);
  d.setHours(0, 0, 0, 0);
  return d;
};

const addDays = (d, n) => {
  d = new Date(d);
  d.setDate(d.getDate() + n);
  return d;
};

const getMonday = (d) => {
  const x = startOfDay(d);
  const day = x.getDay();
  x.setDate(x.getDate() - (day === 0 ? 6 : day - 1));
  return x;
};

const weekdayIndex = (d) => (new Date(d).getDay() + 6) % 7;

const round = (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d;

const fmt = (x, d = 0) => (x ? String(round(x, d)).replace(".", ",") : "—");

const clean = (s) =>
  [
    ...String(s)
      .normalize("NFKC")
      .replace(/[^\p{L}\p{M}\p{N}\s-]/gu, " ")
      .replace(/\s+/gu, " ")
      .trim(),
  ]
    .slice(0, 100)
    .join(" ");

const norm = (s) =>
  s.trim().toLowerCase().replace("ё", "е").replace(/\s+/g, " ");

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const debounce = (fn, ms) => {
  let timer = null;
  let lastArgs = [];
  const call = (...args) => {
    lastArgs = args;
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  call.flush = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
    fn(...lastArgs);
  };
  return call;
};

const emptyNutrition = () =>
  Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0]));
const emptyMicro = () => Object.fromEntries(MICRO_KEYS.map((k) => [k, null]));

// ==========================================================================
// 5. РАСЧЕТЫ
// ==========================================================================

// Единственный источник агрегатов по позициям приема или дня
const sumItems = (items) => {
  const r = {
    grams: 0,
    ...emptyNutrition(),
    ...emptyMicro(),
    healthScore: null,
  };
  const healthScore = {
    kcal: 0,
    grams: 0,
  };
  const weight = {
    kcal: 0,
    grams: 0,
  };

  for (const item of items) {
    const f = item.grams / 100;
    r.grams += item.grams;

    if (item.nutrition)
      NUTRIENT_KEYS.forEach((k) => (r[k] += (item.nutrition[k] || 0) * f));

    if (item.micro)
      MICRO_KEYS.forEach((k) => (r[k] += (item.micro[k] || 0) * f));

    if (item.healthScore) {
      const kcal = item.nutrition ? (item.nutrition.kcal || 0) * f : 0;
      weight.kcal += kcal;
      healthScore.kcal += item.healthScore * kcal;
      weight.grams += item.grams;
      healthScore.grams += item.healthScore * item.grams;
    }
  }

  if (weight.kcal) r.healthScore = healthScore.kcal / weight.kcal;
  else if (weight.grams) r.healthScore = healthScore.grams / weight.grams;
  return r;
};

const clamp01 = (x) => Math.max(0, Math.min(1, x));

const computeHealth = (nutrition, micro) => {
  const { kcal, protein, fat, fiber, freeSugar, salt, satFat, transFat } =
    nutrition;
  const unsatFat = Math.max(0, fat - satFat - transFat);

  const microCoverage = Object.entries(micro ?? {}).reduce(
    (s, [k, v]) => s + Math.min(v / MICRO_NORMALS[k], 1),
    0,
  );

  const s =
    90 -
    10 * clamp01(kcal / 800) -
    30 * clamp01(freeSugar / 10) -
    15 * clamp01(satFat / 10) -
    20 * clamp01(salt / 2) +
    8 * clamp01(fiber / 8) +
    4 * clamp01(protein / 25) +
    10 * clamp01(unsatFat / 70) +
    5 * clamp01(microCoverage / 3);

  return Math.round(Math.max(0, Math.min(100, s)));
};

const healthColor = (score) => {
  const s = score / 50;
  const r = s < 1 ? 200 : 330 - 130 * s;
  const g = s < 1 ? 120 + 50 * s : 170;
  const b = s < 1 ? 120 - 40 * s : 80 + 60 * s;
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
};

const getAge = (birthdate) => {
  if (!birthdate) return 30;
  const Y = Math.floor(birthdate / 10000);
  const M = Math.floor(birthdate / 100) % 100;
  const D = birthdate % 100;
  const now = new Date();
  const m = now.getMonth() + 1 - M;
  const age = now.getFullYear() - Y - (m < 0 || (m === 0 && now.getDate() < D));
  return Math.min(120, Math.max(0, age));
};

const computeGoals = ({ sex, age, height, weight, activity, weightGoal }) => {
  const bmr = 10 * weight + 6.25 * height - 5 * age + (sex ? 5 : -161);
  const tdee = bmr * activity;
  const kcal = Math.max(
    1200,
    tdee * (weightGoal === LOSE ? 0.85 : weightGoal === GAIN ? 1.1 : 1),
  );
  const protein = weight * (weightGoal === LOSE ? 2.0 : 1.6);
  const fat = (kcal * 0.3) / 9;
  return {
    kcal,
    protein,
    fat,
    carbs: Math.max(0, (kcal - protein * 4 - fat * 9) / 4),
    fiber: (14 * kcal) / 1000,
    sugar: (kcal * 0.1) / 4,
    salt: 5,
    satFat: (kcal * 0.1) / 9,
    water: weight * 30,
  };
};

const updatePerson = () => {
  person.age = getAge(person.birthdate);
  person.goals = computeGoals(person);
};

// Последнее измерение до 12:00, иначе первое измерение дня
const morningWeight = (entries) => {
  if (!entries.length) return null;
  const sorted = [...entries].sort((a, b) => a.date - b.date);
  const morning = sorted.filter((e) => new Date(e.date).getHours() < 12);
  return morning.length ? morning.at(-1) : sorted[0];
};

const linearRegression = (points) => {
  const n = points.length;
  if (n < 2) return null;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0,
    sxy = 0;
  points.forEach(({ x, y }) => {
    sxx += (x - mx) ** 2;
    sxy += (x - mx) * (y - my);
  });
  if (!sxx) return null;
  const b = sxy / sxx;
  return { a: my - b * mx, b };
};

const computeFromIngredients = (ingredients, yieldGrams) => {
  const dst = {
    grams: 0,
    nutrition: emptyNutrition(),
    micro: emptyMicro(),
  };

  for (const { foodId, grams } of ingredients) {
    const f = findFood(foodId);
    if (!f) continue;
    dst.grams += grams;
    NUTRIENT_KEYS.forEach(
      (k) => (dst.nutrition[k] += (f.nutrition[k] || 0) * grams),
    );
    MICRO_KEYS.forEach((k) => (dst.micro[k] += (f.micro[k] || 0) * grams));
  }

  const g = 1 / (yieldGrams || dst.grams);
  for (const k of NUTRIENT_KEYS) dst.nutrition[k] *= g;
  for (const k of MICRO_KEYS) dst.micro[k] *= g;

  return dst;
};

// ==========================================================================
// 6. ПРОДУКТЫ И ПОИСК
// ==========================================================================

const findFood = (id) =>
  id == null
    ? null
    : foods.find((f) => f.id === id) || REFS.find((f) => f.id === id) || null;

const foodName = (f) => (lang === "en" ? f.en : f.ru);

let compiledTagRules;

const autoTags = (name) => {
  const result = [];
  for (const [re, tag] of compiledTagRules) {
    if (re.test(name) && !result.includes(tag)) result.push(tag);
  }
  return result;
};

const prepareRefs = () => {
  REFS.forEach((f) => {
    f.healthScore = computeHealth(f.nutrition, f.micro);
    f.tags = autoTags(foodName(f));
  });
};

const ENDINGS = (
  "ами ями ого его ому ему ыми ими ов ев ей ам ям ах ях ом ем ой ый ий ая яя ое ее ые ие " +
  "ых их ую юю ть ся а я о е ы и у ю й ь"
)
  .split(" ")
  .sort((a, b) => b.length - a.length);

const normalizeWord = (w) => {
  w = w.toLowerCase().replace(/ё/g, "е");

  if (/[а-я]/.test(w)) {
    for (const e of ENDINGS)
      if (w.length - e.length >= 3 && w.endsWith(e))
        return w.slice(0, -e.length);
    return w;
  }

  if (/(o|x|ch|sh|ss)es$/.test(w) && w.length >= 5) return w.slice(0, -2);
  if (/[^aeiou]ies$/.test(w) && w.length >= 6) return w.slice(0, -3) + "y";
  if (w.endsWith("s") && !w.endsWith("ss") && w.length >= 4)
    return w.slice(0, -1);
  return w;
};

const normalizePhrase = (s) =>
  s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9\s-]/g, " ")
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean)
    .map(normalizeWord)
    .join(" ");

const levenshtein = (a, b) => {
  if (a.length < b.length) [a, b] = [b, a];
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++)
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] !== b[j - 1]),
      );
    prev = cur;
  }
  return prev[b.length];
};

const similarity = (a, b) =>
  a === b ? 1 : 1 - levenshtein(a, b) / Math.max(a.length, b.length, 1);

const phraseSimilarity = (a, b) => {
  if (a === b) return 1;

  const aw = a.split(" ");
  const bw = b.split(" ");
  const pairs = [];

  for (let i = 0; i < aw.length; i++)
    for (let j = 0; j < bw.length; j++)
      pairs.push([similarity(aw[i], bw[j]), i, j]);

  pairs.sort((a, b) => b[0] - a[0]);

  const usedA = new Set();
  const usedB = new Set();
  let total = 0;

  for (const [s, i, j] of pairs) {
    if (usedA.has(i) || usedB.has(j)) continue;
    total += s;
    usedA.add(i);
    usedB.add(j);
  }

  const words = (2 * total) / (aw.length + bw.length);
  return 0.9 * words + 0.1 * similarity(a, b);
};

const keysCache = new WeakMap();

const foodKeys = (f) => {
  let keys = keysCache.get(f);
  if (!keys) {
    keys = [
      ...new Set(
        [f.ru, f.en, ...(f.aliases || [])]
          .filter(Boolean)
          .map(normalizePhrase)
          .filter(Boolean),
      ),
    ];
    keysCache.set(f, keys);
  }
  return keys;
};

const matchScore = (food, query) => {
  query = normalizePhrase(query);
  if (!query) return 0;

  let score = 0;
  for (const key of foodKeys(food))
    score = Math.max(score, phraseSimilarity(key, query));
  return score;
};

const getFrequency = () => {
  if (!frequency) {
    frequency = new Map();
    meals.forEach((m) =>
      m.items.forEach(({ foodId }) => {
        if (foodId != null)
          frequency.set(foodId, (frequency.get(foodId) || 0) + 1);
      }),
    );
  }
  return frequency;
};

const activeFoods = () => [...foods.filter((f) => !f.archived), ...REFS];

// Сравнение кандидатов: уверенность, свой продукт, избранное, частота, короткое имя
const compareMatches = (a, b) => {
  const f = getFrequency();
  return (
    b.confidence - a.confidence ||
    b.food.custom - a.food.custom ||
    favorites.includes(b.food.id) - favorites.includes(a.food.id) ||
    (f.get(b.food.id) || 0) - (f.get(a.food.id) || 0) ||
    foodName(a.food).length - foodName(b.food).length
  );
};

const rankFoods = (text, foods = activeFoods()) => {
  const query = normalizePhrase(text);
  if (!query) return [];
  return foods
    .map((food) => ({ food, confidence: matchScore(food, query) }))
    .filter((m) => m.confidence >= 0.5)
    .sort(compareMatches);
};

const matchFood = (text, foods) => rankFoods(text, foods)[0] || null;

// ==========================================================================
// 7. ПАРСЕР
// ==========================================================================

const unitOf = (word) => {
  const w = word.toLowerCase().replace(/ё/g, "е").replace(/\.$/, "");
  if (/^(г|гр|грамм|грамма|граммов|g|gr|gram|grams)$/.test(w)) return "g";
  if (/^(кг|kg|килограмм|килограмма|килограммов)$/.test(w)) return "kg";
  if (/^(мл|ml|миллилитр|миллилитра|миллилитров)$/.test(w)) return "ml";
  if (/^(л|l|литр|литра|литров|liter|liters|litre|litres)$/.test(w)) return "l";
  if (/^(шт|штук|штука|штуки|штучки|pc|pcs|piece|pieces)$/.test(w)) return "pc";
  if (
    /^(кусок|куска|кусков|кусочек|кусочка|кусочков|куски|кусочки|slice|slices)$/.test(
      w,
    )
  )
    return "pc";
  if (/^(чл|tsp)$/.test(w)) return "tsp";
  if (/^(стл|tbsp)$/.test(w) || /^лож/.test(w)) return "tbsp";
  if (/^(стакан|стакана|стаканов|стаканчик|кружка|чашка|cup|cups)$/.test(w))
    return "cup";
  if (/^(порция|порции|порций|порцию|serving|servings)$/.test(w))
    return "serving";
  return null;
};

// Единицы, которые можно указать без числа: «стакан молока»
const COUNTABLE_UNITS = ["pc", "tsp", "tbsp", "cup", "serving"];

const toGrams = (count, unit, food) => {
  const serving = food.servingGrams || DEFAULT_SERVING;
  const k =
    {
      g: 1,
      kg: 1000,
      ml: 1,
      l: 1000,
      pc: food.pieceGrams || serving,
      tsp: 5,
      tbsp: 15,
      cup: 200,
      serving,
    }[unit] || serving;
  return Math.max(1, Math.round(count * k));
};

const splitFragments = (text) =>
  text
    .split(/[;\n]|(?<!\d),|,(?!\d)/)
    .map(norm)
    .filter(Boolean)
    .flatMap((part) => {
      const name = clean(parseQuantity(part).name);
      const whole = name ? matchFood(name) : null;
      if (whole && whole.confidence >= 0.9) return [part];
      return part.split(/\s+(?:и|с|со|and|with)\s+|\s*\+\s*/i);
    })
    .map(norm)
    .filter(Boolean);

const parseQuantity = (fragment) => {
  let text = fragment
    .replace(/(^|\s)ч\.\s?л\.?/gi, "$1 чл ")
    .replace(/(^|\s)ст\.\s?л\.?/gi, "$1 стл ")
    .replace(/чайн\S*\s+лож\S*/gi, " чл ")
    .replace(/столов\S*\s+лож\S*/gi, " стл ");

  const number = text.match(/(\d+(?:[.,]\d+)?)\s*([a-zа-я]+\.?)?/i);
  if (number) {
    const count = +number[1].replace(",", ".");
    const unit = number[2] ? unitOf(number[2]) : null;
    const consumed = unit ? number[0] : number[1];
    // Вырезаем число по позиции совпадения, а не первое вхождение в строке
    const name =
      text.slice(0, number.index) +
      " " +
      text.slice(number.index + consumed.length);
    if (unit) return { count, unit, name };
    return { count, unit: count <= 20 ? "pc" : "g", name };
  }

  const words = text.split(/\s+/);
  const i = words.findIndex((w) => COUNTABLE_UNITS.includes(unitOf(w)));
  if (i >= 0) {
    const unit = unitOf(words[i]);
    words.splice(i, 1);
    return { count: 1, unit, name: words.join(" ") };
  }
  return { count: 1, unit: "pc", name: text };
};

const makeItem = (food, grams, source, confidence = 1) => ({
  foodId: food.id,
  name: foodName(food),
  grams,
  nutrition: { ...food.nutrition },
  micro: { ...food.micro },
  healthScore: food.healthScore,
  confidence,
  confirmed: false,
  source,
});

const parseMeal = (text) =>
  splitFragments(text).map((fragment) => {
    let { count, unit, name } = parseQuantity(fragment);
    name = clean(name);
    const match = name && matchFood(name);
    const grams = match && toGrams(count, unit, match.food);

    if (match) {
      return {
        ...makeItem(match.food, grams, "parse", match.confidence),
        fragment: norm(fragment),
      };
    }
    return {
      foodId: null,
      name: capitalize(name || clean(fragment)),
      grams,
      nutrition: null,
      micro: null,
      healthScore: null,
      confidence: 0,
      confirmed: false,
      source: "parse",
      fragment: norm(fragment),
    };
  });

const isProblem = (item) =>
  item.foodId == null || (item.confidence < 0.5 && !item.confirmed);

// ==========================================================================
// 8. ЧИСЛОВЫЕ МАСКИ
// ==========================================================================

const normalizeNumber = (v, max, decimals) => {
  v = v.replace(",", ".").replace(/[^\d.]/g, "");
  const i = v.indexOf(".");
  if (i >= 0) {
    v = decimals
      ? v.slice(0, i + 1) +
        v
          .slice(i + 1)
          .replace(/\./g, "")
          .slice(0, decimals)
      : v.slice(0, i);
  }
  v = v.replace(/^0+(?=\d)/, "");
  while (v && +v > max) v = v.slice(0, -1);
  return v.replace(".", ",");
};

const parseNumber = (s) => {
  s = String(s ?? "").trim();
  if (s === "" || s === ",") return null;
  const v = +s.replace(",", ".");
  return Number.isNaN(v) ? null : v;
};

const maskNumber = (input, max, decimals) => {
  input.addEventListener("input", () => {
    input.value = normalizeNumber(input.value, max, decimals);
  });
  input.addEventListener("paste", (e) => {
    e.preventDefault();
    input.value = normalizeNumber(
      e.clipboardData.getData("text"),
      max,
      decimals,
    );
    input.dispatchEvent(new Event("input"));
  });
};

// ==========================================================================
// 9. DOM-ССЫЛКИ
// ==========================================================================

/* --- Страницы и навигация --- */
const pages = {
  diary: $("diary-page"),
  meal: $("meal-page"),
  dish: $("dish-page"),
  stats: $("stats-page"),
  person: $("person-page"),
  settings: $("settings-page"),
};

const nav = $("nav");
const navBar = $("nav-bar");
const navLinks = {
  diary: $("nav-diary"),
  meal: $("add-meal"),
  stats: $("nav-stats"),
  person: $("nav-person"),
  settings: $("nav-settings"),
};

/* --- Дневник --- */
const calendar = $("calendar");
const calendars = $("calendars");
const chosenDay = $("chosen-day");
const daySummary = $("day-summary");
const dayLogs = $("day-logs");
const dayMealsList = $("day-meals");

/* --- Прием пищи --- */
const mealDate = $("meal-date");
const mealTime = $("meal-time");
const mealType = $("meal-type");
const mealText = $("meal-text");
const clearText = $("clear-text");
const iconPhoto = $("icon-photo");
const iconVoice = $("icon-voice");
const iconSearch = $("icon-search");
const iconStar = $("icon-star");
const photoInput = $("photo-input");
const mealPhoto = $("meal-photo");
const quickPicks = $("quick-picks");
const mealItems = $("meal-items");
const tagButtons = $("tag-buttons");
const editTagsButton = $("edit-tags");
const noteBlock = $("note-block");
const mealNote = $("meal-note");
const mealDelete = $("meal-delete");
const confirmButton = $("confirm");
const cancelButton = $("cancel");

/* --- Продукт / рецепт --- */
const dishKind = $("dish-kind");
const dishName = $("dish-name");
const dishBasis = $("dish-basis");
const dishServing = $("dish-serving-grams");
const dishYieldField = $("dish-yield-field");
const dishYield = $("dish-yield");
const dishInputs = {
  kcal: $("dish-kcal"),
  protein: $("dish-protein"),
  fat: $("dish-fat"),
  carbs: $("dish-carbs"),
  fiber: $("dish-fiber"),
  sugar: $("dish-sugar"),
  salt: $("dish-salt"),
  satFat: $("dish-satfat"),
};
const toggleMicro = $("toggle-micro");
const dishMicro = $("dish-micro");
const dishMicroSource = $("dish-micro-source");
const dishMicroBars = $("dish-micro-bars");
const ingredientsBlock = $("ingredients-block");
const addIngredient = $("add-ingredient");
const ingredientsList = $("ingredients-list");
const ingredientsTotal = $("ingredients-total");
const dishTags = $("dish-tags");
const dishPhotoButton = $("dish-photo-button");
const dishPhoto = $("dish-photo");
const dishPhotoInput = $("dish-photo-input");
const dishArchive = $("dish-archive");
const dishSave = $("dish-save");
const dishCancel = $("dish-cancel");

/* --- Оверлей и модальное окно --- */
const overlay = $("overlay");
const modal = $("modal");
const question = $("question");
const modalYes = $("modal-yes");
const modalNo = $("modal-no");

/* --- Поиск --- */
const searchSheet = $("search-sheet");
const searchInput = $("search-input");
const searchClear = $("search-clear");
const searchTabs = $("search-tabs");
const searchResults = $("search-results");
const searchCreate = $("search-create");
const searchCancel = $("search-cancel");

/* --- Порция --- */
const portionSheet = $("portion-sheet");
const portionTitle = $("portion-title");
const portionNote = $("portion-note");
const portionGrams = $("portion-grams");
const portionQuick = $("portion-quick");
const portionInfo = $("portion-info");
const portionReplace = $("portion-replace");
const portionCreate = $("portion-create");
const portionDelete = $("portion-delete");
const portionConfirmItem = $("portion-confirm-item");
const portionConfirm = $("portion-confirm");

/* --- Теги --- */
const tagsSheet = $("tags-sheet");
const tagInput = $("tag");
const createTagButton = $("create-tag");
const tagActions = $("tag-actions");
const closeTags = $("close-tags");
const applyTags = $("apply-tags");

/* --- Пикер даты/времени --- */
const whenPicker = $("when-picker");
const whenCalendar = $("when-calendar");
const whenDays = $("when-days");
const clock = $("clock");
const hand = $("hand");
const line = $("line");
const white = $("white");
const black = $("black");
const dayButton = $("day");
const hourButton = $("hour");
const minuteButton = $("minute");
const closeWhen = $("close-when");
const applyWhen = $("apply-when");

/* --- Профиль --- */
const personButton = $("person");
const goalsList = $("goals");
const personPicker = $("person-picker");
const birthdateInput = $("birthdate");
const sexInput = $("sex");
const heightInput = $("height");
const weightInput = $("weight");
const activityInput = $("activity");
const goalInput = $("goal");
const closePerson = $("close-person");
const applyPerson = $("apply-person");
const exportButton = $("export");
const importButton = $("import");
const importInput = $("import-input");
const resetButton = $("reset");

/* --- Детали дня --- */
const statsSheet = $("stats-sheet");
const statsSheetTitle = $("stats-sheet-title");
const dayRings = $("day-rings");
const dayMicro = $("day-micro");
const dayMealShares = $("day-meal-shares");

/* --- Журнал --- */
const logSheet = $("log-sheet");
const logTitle = $("log-title");
const logValue = $("log-value");
const logUnit = $("log-unit");
const logQuick = $("log-quick");
const closeLog = $("close-log");
const applyLog = $("apply-log");

/* --- Статистика --- */
const periodArea = $("period");
const rangeArea = $("range");
const rangeLabel = $("range-label");
const chartTip = $("chart-tip");

// ==========================================================================
// 10. ЛОКАЛИЗАЦИЯ
// ==========================================================================

const setLanguage = () => {
  lang = navigator.language?.toLowerCase().startsWith("ru") ? "ru" : "en";
  document.documentElement.lang = lang;
  S = translations[lang];

  document
    .querySelectorAll("[data-i18n]")
    .forEach((el) => (el.textContent = S[el.dataset.i18n]));
  document
    .querySelectorAll("[data-i18n-placeholder]")
    .forEach((el) => (el.placeholder = S[el.dataset.i18nPlaceholder]));
  document
    .querySelectorAll("[data-i18n-title]")
    .forEach((el) => (el.title = S[el.dataset.i18nTitle]));
  document
    .querySelectorAll("[data-i18n-aria-label]")
    .forEach((el) =>
      el.setAttribute("aria-label", S[el.dataset.i18nAriaLabel]),
    );

  whenCalendar.firstElementChild.innerHTML = S.wds
    .map((w) => `<span>${w}</span>`)
    .join("");

  compiledTagRules = (S.tagRules || [])
    .map(([pattern, tag]) => {
      try {
        return [new RegExp(pattern, "i"), tag];
      } catch {
        console.warn(`tagRules: invalid pattern "${pattern}"`);
        return null;
      }
    })
    .filter(Boolean);
};

// ==========================================================================
// 11. ХРАНИЛИЩЕ
// ==========================================================================

const read = (key, fallback) => {
  try {
    const value = localStorage.getItem(key);
    return value == null ? fallback : JSON.parse(value);
  } catch {
    console.warn(`localStorage: cannot read ${key}`);
    return fallback;
  }
};

const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    showMessage(S.storageError);
    return false;
  }
};

const invalidate = () => {
  dayIndex = null;
  frequency = null;
  calendarPages = {};
};

const saveMeals = () => {
  invalidate();
  write("meals", meals);
};
const saveFoods = () => write("foods", foods);
const saveTags = () => write("tags", tags);
const saveFavorites = () => write("favorites", favorites);
const saveRecents = () => write("recents", recents);
const saveWeight = () => write("weight", log.weight);
const saveWater = () => write("water", log.water);
const saveSleep = () => write("sleep", log.sleep);
const saveActivity = () => write("activity", log.activity);

const personToStore = () => {
  const { sex, birthdate, height, weight, activity, weightGoal } = person;
  return { sex, birthdate, height, weight, activity, weightGoal };
};

const savePerson = () => {
  updatePerson();
  invalidate();
  write("person", personToStore());
};

const loadPerson = () => {
  person = { ...DEFAULT_PERSON, ...read("person", {}) };
  updatePerson();
};

const loadMeals = () => {
  meals = read("meals", []).filter(Boolean);
};

const loadFoods = () => {
  foods = read("foods", [])
    .filter(Boolean)
    .map((f) => {
      if (f.ru == null && f.name != null) {
        const { name, ...rest } = f;
        return { ...rest, ru: name };
      }
      return f;
    });
};

const loadJournals = () => {
  log.weight = read("weight", []);
  log.water = read("water", []);
  log.sleep = read("sleep", []);
  log.activity = read("activity", []);
};

const loadAux = () => {
  const stored = read("tags", null);
  tags = Array.isArray(stored) ? stored.filter(Boolean) : [...S.defaultTags];
  favorites = read("favorites", []);
  recents = read("recents", []);
};

const loadAll = () => {
  loadPerson();
  loadMeals();
  loadFoods();
  loadJournals();
  loadAux();
  invalidate();
};

const updateRecents = (items) => {
  const now = Date.now();
  items
    .filter((i) => i.foodId != null)
    .forEach(({ foodId, grams }) => {
      recents = [
        { foodId, grams, ts: now },
        ...recents.filter((r) => r.foodId !== foodId),
      ];
    });
  recents = recents.slice(0, 50);
  saveRecents();
};

/* --- Экспорт и импорт --- */

const exportData = () => {
  const data = {
    app: APP_NAME,
    exported: Date.now(),
    meals,
    foods,
    person: personToStore(),
    weight: log.weight,
    water: log.water,
    sleep: log.sleep,
    activity: log.activity,
    tags,
    favorites,
    recents,
  };
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${APP_NAME}-${getDate(new Date())}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

const IMPORT_ARRAYS = [
  "meals",
  "foods",
  "weight",
  "water",
  "sleep",
  "activity",
  "tags",
  "favorites",
  "recents",
];

const validImport = (data) => {
  try {
    const { sex, height, weight, activity, weightGoal, birthdate } =
      data.person;
    return (
      data.app === APP_NAME &&
      [sex, height, weight, activity, weightGoal, birthdate].every(
        Number.isFinite,
      ) &&
      IMPORT_ARRAYS.every((k) => Array.isArray(data[k])) &&
      data.meals.every(
        (m) =>
          Number.isFinite(m.created) &&
          Number.isFinite(m.eaten) &&
          Array.isArray(m.items),
      )
    );
  } catch {
    return false;
  }
};

const importData = (data) => {
  const payload = Object.fromEntries(IMPORT_ARRAYS.map((k) => [k, data[k]]));
  payload.person = data.person;
  payload.schemaVersion = data.schemaVersion;
  // Пишем все ключи сразу: при ошибке квоты прерываем, не оставляя половину
  if (!Object.keys(payload).every((k) => write(k, payload[k]))) return;
  migrate();
  loadAll();
  date = new Date();
  calendarDate = new Date(date);
  renderPage("diary");
  gcPhotos();
};

const resetData = async () => {
  STORAGE_KEYS.forEach((k) => localStorage.removeItem(k));
  migrate();
  loadAll();
  await clearPhotos();
  date = new Date();
  calendarDate = new Date(date);
  renderPage("diary");
};

// ==========================================================================
// 12. ФОТОГРАФИИ (IndexedDB + Yandex Object Storage)
// ==========================================================================

let photoDb = null;
let lastPhotoId = 0;
let syncing = false;
const photoUrls = new Map();
const photoRenderTokens = new WeakMap();

const nextPhotoId = () => (lastPhotoId = Math.max(Date.now(), lastPhotoId + 1));

const openPhotoStore = () =>
  new Promise((resolve) => {
    if (!window.indexedDB) return resolve(null);
    try {
      const request = indexedDB.open("FoodDiaryPhotos", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("photos", { keyPath: "id" });
      request.onsuccess = () => {
        photoDb = request.result;
        document.body.classList.add("photos");
        resolve(photoDb);
      };
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

const photoStore = (mode, fn) =>
  new Promise((resolve, reject) => {
    const tx = photoDb.transaction("photos", mode);
    const request = fn(tx.objectStore("photos"));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
  });

const getPhoto = (id) => photoStore("readonly", (s) => s.get(id));
const putPhoto = (record) => photoStore("readwrite", (s) => s.put(record));
const removePhoto = (id) => photoStore("readwrite", (s) => s.delete(id));
const allPhotos = () => photoStore("readonly", (s) => s.getAll());

const loadImage = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("loadImage"));
    };
    img.src = url;
  });

const compressImage = async (file, maxWidth = 1280, quality = 0.82) => {
  const source = await createImageBitmap(file).catch(() => loadImage(file));
  const scale = Math.min(1, maxWidth / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  return { blob, width: canvas.width, height: canvas.height };
};

const addPhoto = async (file) => {
  if (!photoDb) return null;
  try {
    const { blob, width, height } = await compressImage(
      file,
      PHOTO_MAX_WIDTH,
      PHOTO_QUALITY,
    );
    const id = nextPhotoId();
    await putPhoto({
      id,
      blob,
      mime: "image/jpeg",
      width,
      height,
      size: blob.size,
      status: "pending",
      attempts: 0,
      objectKey: `photos/${id}.jpg`,
      createdAt: Date.now(),
    });
    syncPhotos();
    return id;
  } catch (e) {
    console.warn("addPhoto", e);
    return null;
  }
};

const presign = async (action, key) => {
  const response = await fetch(PHOTO_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, key, mime: "image/jpeg" }),
  });
  if (!response.ok) throw new Error(`presign ${response.status}`);
  return (await response.json()).url;
};

const syncPhotos = async () => {
  if (!photoDb || !PHOTO_API_URL || !navigator.onLine || syncing) return;
  syncing = true;
  try {
    for (const record of await allPhotos()) {
      try {
        if (record.status === "deleted") {
          const url = await presign("delete", record.objectKey);
          const response = await fetch(url, { method: "DELETE" });
          if (response.ok || response.status === 404)
            await removePhoto(record.id);
        } else if (record.status === "pending" || record.status === "error") {
          const url = await presign("put", record.objectKey);
          const response = await fetch(url, {
            method: "PUT",
            body: record.blob,
            headers: { "Content-Type": record.mime },
          });
          if (!response.ok) throw new Error(`upload ${response.status}`);
          // Перечитываем запись: за время загрузки фото могли пометить удалённым
          const current = await getPhoto(record.id).catch(() => null);
          if (current && current.status !== "deleted") {
            await putPhoto({ ...current, status: "uploaded" });
          }
        }
      } catch (e) {
        if (record.status !== "deleted") {
          const attempts = (record.attempts || 0) + 1;
          await putPhoto({
            ...record,
            attempts,
            status: attempts >= 5 ? "error" : record.status,
          });
        }
        console.warn("syncPhotos", e);
      }
    }
  } finally {
    syncing = false;
  }
};

const getPhotoUrl = async (id) => {
  if (photoUrls.has(id)) return photoUrls.get(id);
  let url = null;
  const record = photoDb ? await getPhoto(id).catch(() => null) : null;
  if (record?.blob) {
    // Кэшируются только локальные object-URL: пресайненные ссылки временные
    url = URL.createObjectURL(record.blob);
    photoUrls.set(id, url);
  } else if (
    PHOTO_API_URL &&
    navigator.onLine &&
    record?.status !== "deleted"
  ) {
    url = await presign("get", `photos/${id}.jpg`).catch(() => null);
  }
  return url;
};

const deletePhoto = async (id) => {
  if (!photoDb || id == null) return;
  const url = photoUrls.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    photoUrls.delete(id);
  }
  const record = await getPhoto(id).catch(() => null);
  if (!record) return;
  if (record.status === "pending" && !record.attempts) await removePhoto(id);
  else await putPhoto({ ...record, blob: null, status: "deleted" });
  syncPhotos();
};

const referencedPhotos = () =>
  new Set(
    [
      ...meals.map((m) => m.photoId),
      ...foods.map((f) => f.photoId),
      meal?.photoId,
      dish?.photoId,
    ].filter((id) => id != null),
  );

const gcPhotos = async () => {
  if (!photoDb) return;
  const used = referencedPhotos();
  for (const record of await allPhotos()) {
    if (record.status !== "deleted" && !used.has(record.id))
      await deletePhoto(record.id);
  }
};

const clearPhotos = async () => {
  if (!photoDb) return;
  for (const record of await allPhotos()) await deletePhoto(record.id);
};

const renderPhoto = async (container, id) => {
  const token = Symbol();
  photoRenderTokens.set(container, token);
  container.classList.toggle("hidden", id == null);
  container.innerHTML = "";
  if (id == null) return;
  const url = await getPhotoUrl(id);
  if (photoRenderTokens.get(container) !== token) return;
  container.innerHTML = `
        ${url ? `<img src="${url}" alt="">` : '<div class="photo-stub"><svg><use href="sprite.svg#camera"></use></svg></div>'}
        <button class="photo-remove" aria-label="${S.removePhoto}"><svg><use href="sprite.svg#close"></use></svg></button>`;
};

// ==========================================================================
// 13. НАВИГАЦИЯ, ШТОРКИ, МОДАЛЬНОЕ ОКНО
// ==========================================================================

const renderPage = (name, withLink = true) => {
  if (page) page.classList.add("hidden");
  if (link) {
    link.classList.remove("active");
    link.removeAttribute("aria-current");
  }

  page = pages[name];
  link = withLink ? navLinks[name] || null : null;

  page.classList.remove("hidden");
  if (link) {
    link.classList.add("active");
    link.setAttribute("aria-current", "page");
  }
  navBar.classList.toggle("hidden", name === "meal" || name === "dish");
  window.scrollTo(0, 0);

  if (name === "diary") renderDiary();
  else if (name === "stats") {
    renderRange();
    renderStats();
  } else if (name === "person") renderPerson();
};

const toDiaryPage = () => renderPage("diary");

nav.onclick = (e) => {
  const button = e.target.closest("button");
  if (!button || button === link) return;
  if (button.dataset.page === "meal") openMeal(newMeal(), true);
  else renderPage(button.dataset.page);
};

let openedSheet = null;
let onSheetClose = null;

const openSheet = (sheet, onClose = null) => {
  closeSheet();
  openedSheet = sheet;
  onSheetClose = onClose;
  overlay.classList.add("open");
  sheet.classList.add("open");
};

const closeSheet = () => {
  if (!openedSheet) return;
  openedSheet.classList.remove("open");
  overlay.classList.remove("open");
  const callback = onSheetClose;
  openedSheet = null;
  onSheetClose = null;
  if (callback) callback();
};

overlay.onclick = closeSheet;

let onModalYes = null;

const showModal = (text, onYes) => {
  question.textContent = text;
  onModalYes = onYes;
  modalYes.textContent = onYes ? S.yes : "OK";
  modalNo.classList.toggle("hidden", !onYes);
  modal.hidden = false;
};

const showMessage = (text) => showModal(text, null);

const closeModal = () => {
  modal.hidden = true;
  onModalYes = null;
};

modalYes.onclick = () => {
  const callback = onModalYes;
  closeModal();
  if (callback) callback();
};
modalNo.onclick = closeModal;
modal.onclick = (e) => {
  if (e.target === modal) closeModal();
};

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!modal.hidden) closeModal();
  else closeSheet();
});

/* --- Сегменты --- */

const setSegment = (segment, value, attr) => {
  const buttons = [...segment.querySelectorAll("button")];
  const i = Math.max(
    0,
    buttons.findIndex((b) => b.dataset[attr] === String(value)),
  );
  segment.style.setProperty("--n", String(buttons.length));
  segment.style.setProperty("--i", String(i));
  buttons.forEach((b, j) => b.classList.toggle("active", j === i));
};

const onSegment = (segment, attr, callback) => {
  segment.addEventListener("click", (e) => {
    const button = e.target.closest("button");
    if (!button || button.classList.contains("active")) return;
    setSegment(segment, button.dataset[attr], attr);
    callback(button.dataset[attr]);
  });
};

const segmentHtml = (attr, options, value) => {
  const i = Math.max(
    0,
    options.findIndex((o) => String(o.value) === String(value)),
  );
  return `<div class="segment" style="--n:${options.length};--i:${i}">${options
    .map(
      (o, j) =>
        `<button data-${attr}="${o.value}" class="${j === i ? "active" : ""}">${clean(o.label)}</button>`,
    )
    .join("")}</div>`;
};

const healthbar = (score) =>
  score == null
    ? ""
    : `<div class="healthbar" style="--score:${Math.round(score)};--color:var(${healthColor(score)})"></div>`;

// ==========================================================================
// 14. ДНЕВНИК
// ==========================================================================

const getDayIndex = () => {
  if (!dayIndex) {
    dayIndex = new Map();
    [...meals]
      .sort((a, b) => a.eaten - b.eaten)
      .forEach((m) => {
        const key = getDate(m.eaten);
        if (!dayIndex.has(key)) dayIndex.set(key, { meals: [], sum: null });
        dayIndex.get(key).meals.push(m);
      });
  }
  return dayIndex;
};

const dayMeals = (key) => getDayIndex().get(key)?.meals || [];

const daySum = (key) => {
  const entry = getDayIndex().get(key);
  if (!entry) return sumItems([]);
  if (!entry.sum) entry.sum = sumItems(entry.meals.flatMap((m) => m.items));
  return entry.sum;
};

const dayEntries = (journal, key) =>
  journal.filter((e) => getDate(e.date) === key);
const dayWater = (key) =>
  dayEntries(log.water, key).reduce((s, e) => s + e.ml, 0);
const daySleep = (key) => dayEntries(log.sleep, key)[0]?.hours ?? null;
const daySteps = (key) => dayEntries(log.activity, key)[0]?.steps ?? null;
const dayWeight = (key) =>
  morningWeight(dayEntries(log.weight, key))?.weight ?? null;

/* --- Календарь --- */

const getMarkHtml = (key) => {
  if (!dayMeals(key).length) return "";
  const kcal = daySum(key).kcal;
  const ratio = kcal / person.goals.kcal;
  const size = Math.min(64, 12 + 24 * ratio);
  const color = ratio <= NORM_RATIO_HIGH ? "--green" : "--red";
  return (
    `<i style="width:${size}px;height:${size}px;background:var(${color})"></i>` +
    `<small class="mono">${Math.round(kcal)}</small>`
  );
};

const addPageMonth = (delta) => {
  const month = calendarDate.getMonth() + delta;
  const year = calendarDate.getFullYear();
  const m = (month + 12) % 12;
  const y = year + delta * (month !== m);
  calendarDate.setDate(1);
  calendarDate.setFullYear(y);
  calendarDate.setMonth(m);
};

const getCalendarPage = (delta = 0) => {
  const month = calendarDate.getMonth() + delta;
  const year = calendarDate.getFullYear();
  const m = (month + 12) % 12;
  const y = year + delta * (month !== m);
  const k = 100 * y + m;

  if (calendarPages[k]) return calendarPages[k];

  const first = (new Date(y, m, 1).getDay() + 6) % 7;
  const last = new Date(y, m + 1, 0).getDate();
  const t = getDate(today);
  const c = getDate(date);

  const getClass = (d) => (d === c ? "big" : d > t ? "gray" : "");

  const dayHtml = (n) => {
    const d = getDate(new Date(y, m, n));
    return `<button><span class="${getClass(d)}">${n}</span>${getMarkHtml(d)}</button>`;
  };

  let days =
    S.wds.map((w) => `<span>${w}</span>`).join("") +
    '<span class="empty"></span>'.repeat(first);
  for (let i = 1; i <= last; i++) days += dayHtml(i);

  const el = document.createElement("DIV");
  el.className = "calendar";
  el.innerHTML = `
        <h2 class="row">
            <button class="prev" aria-label="${S.previous}"><svg><use href="sprite.svg#prev"></use></svg></button>
            <span class="big">${S.months[m]} ${y}</span>
            <button class="next" aria-label="${S.next}"><svg><use href="sprite.svg#next"></use></svg></button>
        </h2>
        <div class="days">${days}</div>`;

  calendarPages[k] = el;
  return el;
};

const renderPageCalendar = () => {
  calendar.replaceChildren(getCalendarPage());
  chosenButton = calendar.querySelector(".days .big");
};

calendar.addEventListener("click", (e) => {
  const button = e.target.closest("button");
  if (!button) return;

  if (button.classList.contains("prev") || button.classList.contains("next")) {
    addPageMonth(button.classList.contains("prev") ? -1 : 1);
    return renderPageCalendar();
  }

  if (chosenButton) chosenButton.classList.remove("big");
  chosenButton = button.firstElementChild;
  chosenButton.classList.add("big");

  date = new Date(
    calendarDate.getFullYear(),
    calendarDate.getMonth(),
    +chosenButton.textContent,
    12,
  );
  renderDay();
});

/* --- Свайп между месяцами --- */

let startX = null;
let dragging = false;
let shift = 0;
let delta = 0;
let width = 0;

const MIN_SHIFT = 10;
const MAX_SHIFT = 40;

const renderCalendars = () => {
  width = calendar.clientWidth + 30;
  calendars.style.setProperty("--width", `${calendar.clientWidth}px`);
  calendars.replaceChildren(
    getCalendarPage(-1),
    getCalendarPage(),
    getCalendarPage(1),
  );
  calendar.replaceChildren(calendars);
  calendars.style.transition = "none";
  calendars.style.transform = `translateX(-${width}px)`;
};

calendars.addEventListener("transitionend", () => {
  addPageMonth(delta);
  renderPageCalendar();
});

calendar.addEventListener("pointerdown", (e) => {
  startX = e.clientX;
  delta = 0;
  dragging = false;
});

calendar.addEventListener("pointermove", (e) => {
  if (startX === null) return;

  shift = e.clientX - startX;

  if (!dragging) {
    if (Math.abs(shift) < MIN_SHIFT) return;
    dragging = true;

    delta = shift > 0 ? -1 : 1;
    startX -= delta * MIN_SHIFT;
    shift += delta * MIN_SHIFT;

    renderCalendars();
    calendar.setPointerCapture(e.pointerId);
  }
  calendars.style.transform = `translateX(${shift - width}px)`;
});

const stopDragging = () => {
  if (startX === null) return;
  startX = null;

  if (!dragging) return;
  dragging = false;

  delta = Math.abs(shift) > MAX_SHIFT ? (shift > 0 ? -1 : 1) : 0;

  calendars.style.transition = `transform 0.2s ease`;
  calendars.style.transform = `translateX(-${width + delta * width}px)`;
};

calendar.addEventListener("pointerup", stopDragging);
calendar.addEventListener("pointercancel", stopDragging);

/* --- Сводка, журналы, список приемов --- */

const renderSummary = () => {
  const key = getDate(date);
  const s = daySum(key);
  const g = person.goals;
  const ratio = s.kcal / g.kcal;
  const water = dayWater(key);
  const pair = (label, v, goal) => `${label} ${fmt(v)}/${fmt(goal)}`;

  daySummary.innerHTML = `
        <div class="kcal-bar ${ratio > 1 ? "over" : ""}" style="--fill:${Math.min(1, ratio)}">
            <div class="bar"></div>
            <div class="labels mono">${fmt(s.kcal)} / ${fmt(g.kcal)} ${S.kcalUnit}</div>
        </div>
        <div class="macros small mono help">
            ${pair(S.P, s.protein, g.protein)} · ${pair(S.F, s.fat, g.fat)} · ${pair(S.C, s.carbs, g.carbs)} ·
            ${S.W} ${fmt(water / 1000, 1)}/${fmt(g.water / 1000, 1)} ${S.l}
        </div>`;
};

const logText = (kind, key) => {
  if (kind === "water") {
    const ml = dayWater(key);
    return ml ? `${fmt(ml / 1000, 2)} ${S.l}` : "—";
  }
  if (kind === "sleep") {
    const h = daySleep(key);
    return h == null ? "—" : `${fmt(h, 1)} ${S.h}`;
  }
  if (kind === "steps") return fmt(daySteps(key));
  const w = dayWeight(key);
  return w == null ? "—" : `${fmt(w, 1)} ${S.kg}`;
};

const renderLogs = () => {
  const key = getDate(date);
  dayLogs.innerHTML = Object.entries(LOGS)
    .map(
      ([kind, { icon }]) => `
        <button class="log-chip" data-kind="${kind}" aria-label="${S.logTitles[kind]}">
            <svg class="tool"><use href="sprite.svg#${icon}"></use></svg>
            <span class="mono small">${logText(kind, key)}</span>
        </button>`,
    )
    .join("");
};

const mealHtml = (m) => {
  const s = sumItems(m.items);
  const names = m.items.map((i) => clean(i.name)).join(" · ");
  const tagHtml = m.tags
    .map((t) => `<span class="small help">${clean(t)}</span>`)
    .join("");
  const photo =
    m.photoId != null
      ? '<svg class="tool"><use href="sprite.svg#camera"></use></svg>'
      : "";
  return `<button class="meal" data-created="${m.created}">
        ${tagHtml ? `<div class="tags">${tagHtml}</div>` : ""}
        <div class="row gap-10">
            <span class="time mono">${getTimeText(m.eaten)}</span>
            <span class="type small help">${S.mealTypes[m.type]}</span>
            ${photo}
            <span class="kcal mono right">${fmt(s.kcal)} ${S.kcalUnit}</span>
        </div>
        <div class="items small help">${names}</div>
        ${healthbar(s.healthScore)}
    </button>`;
};

const renderDayMeals = () => {
  const list = dayMeals(getDate(date));
  dayMealsList.innerHTML = list.length
    ? list.map(mealHtml).join("")
    : `<div class="small help center pad-20">${S.noRecords}</div>`;
};

const renderDay = () => {
  chosenDay.textContent = getDateText(date);
  renderSummary();
  renderLogs();
  renderDayMeals();
};

const renderDiary = () => {
  calendarDate = new Date(date);
  calendarDate.setDate(1);
  renderPageCalendar();
  renderDay();
};

dayMealsList.onclick = (e) => {
  const button = e.target.closest("button.meal");
  if (!button) return;
  const created = +button.dataset.created;
  openMeal(structuredClone(meals.find((m) => m.created === created)), false);
};

daySummary.onclick = () => openStatsSheet();
dayLogs.onclick = (e) => {
  const button = e.target.closest("button");
  if (button) openLogSheet(button.dataset.kind);
};

// ==========================================================================
// 15. ЖУРНАЛ ДНЯ (#log-sheet)
// ==========================================================================

let logKind = null;

const logTime = (hour) => {
  if (getDate(date) === getDate(new Date())) return Date.now();
  const d = startOfDay(date);
  d.setHours(hour);
  return d.getTime();
};

const logCurrent = (kind, key) =>
  ({
    water: () => dayWater(key) || null,
    sleep: () => daySleep(key),
    steps: () => daySteps(key),
    weight: () => dayWeight(key),
  })[kind]();

const openLogSheet = (kind) => {
  logKind = kind;
  const cfg = LOGS[kind];
  logTitle.textContent = `${S.logTitles[kind]} · ${getDateText(date)}`;
  logUnit.textContent = S.logUnits[kind];
  logValue.value = fmt(logCurrent(kind, getDate(date)), cfg.decimals);
  logValue.inputMode = cfg.decimals ? "decimal" : "numeric";
  logQuick.innerHTML = cfg.quick
    .map(
      (v) =>
        `<button class="tap" data-v="${v}">${cfg.add ? "+" : ""}${fmt(v)}</button>`,
    )
    .join("");
  openSheet(logSheet);
};

logValue.addEventListener("input", () => {
  const cfg = LOGS[logKind];
  if (cfg)
    logValue.value = normalizeNumber(logValue.value, cfg.max, cfg.decimals);
});

logQuick.onclick = (e) => {
  const button = e.target.closest("button");
  if (!button) return;
  const cfg = LOGS[logKind];
  const v = +button.dataset.v;
  const next = cfg.add ? (parseNumber(logValue.value) || 0) + v : v;
  logValue.value = fmt(Math.min(cfg.max, next), cfg.decimals);
};

const applyWaterLog = (key, value) => {
  const entries = dayEntries(log.water, key).sort((a, b) => b.date - a.date);
  const old = entries.reduce((s, e) => s + e.ml, 0);
  let diff = (value || 0) - old;
  if (diff > 0) log.water.push({ date: logTime(12), ml: diff });
  for (const e of entries) {
    if (diff >= 0) break;
    const d = Math.min(e.ml, -diff);
    e.ml -= d;
    diff += d;
  }
  log.water = log.water.filter((e) => e.ml > 0);
  saveWater();
};

const applyDailyLog = (entries, key, entry) => {
  const rest = entries.filter((e) => getDate(e.date) !== key);
  return entry ? [...rest, entry] : rest;
};

const applyWeightLog = (key, value) => {
  const target = morningWeight(dayEntries(log.weight, key));
  if (value == null)
    log.weight = log.weight.filter((e) => getDate(e.date) !== key);
  else if (target) target.weight = value;
  else log.weight.push({ date: logTime(8), weight: value });
  saveWeight();
  syncPersonWeight();
};

const syncPersonWeight = () => {
  const last = [...log.weight].sort((a, b) => a.date - b.date).at(-1);
  if (last) person.weight = last.weight;
  savePerson();
};

applyLog.onclick = () => {
  const key = getDate(date);
  const value = parseNumber(logValue.value);
  const day = startOfDay(date).getTime();

  if (logKind === "water") applyWaterLog(key, value);
  else if (logKind === "sleep") {
    log.sleep = applyDailyLog(
      log.sleep,
      key,
      value ? { date: day, hours: value } : null,
    );
    saveSleep();
  } else if (logKind === "steps") {
    log.activity = applyDailyLog(
      log.activity,
      key,
      value
        ? {
            date: day,
            steps: value,
            kcal: Math.round(value * STEP_KCAL * person.weight),
          }
        : null,
    );
    saveActivity();
  } else applyWeightLog(key, value || null);

  closeSheet();
  renderDiary();
};

closeLog.onclick = closeSheet;

// ==========================================================================
// 16. ДЕТАЛИ ДНЯ (#stats-sheet)
// ==========================================================================

const RING_LENGTH = 2 * Math.PI * 28;

const ringHtml = (value, goal, color, label, unit) => {
  const ratio = goal ? value / goal : 0;
  return `<div class="ring">
        <svg viewBox="0 0 64 64" aria-hidden="true">
            <circle class="track" cx="32" cy="32" r="28"></circle>
            <circle class="fill" cx="32" cy="32" r="28" transform="rotate(-90 32 32)"
                style="stroke:var(${ratio > 1.1 ? "--red" : color});stroke-dasharray:${RING_LENGTH * Math.min(1, ratio)} ${RING_LENGTH}"></circle>
        </svg>
        <div class="ring-value mono">${fmt(value)}</div>
        <div class="small help center">${label}<br>${fmt(goal)} ${unit}</div>
    </div>`;
};

const microEntries = (micro, factor = 1) =>
  MICRO_KEYS.map((k) => ({
    label: `${S.micro[k]}`,
    value:
      micro[k] == null ? null : ((micro[k] * factor) / MICRO_NORMALS[k]) * 100,
  }));

const microBarsHtml = (entries) =>
  entries
    .map(
      ({ label, value }) => `
    <div class="h-col">
        <div class="h-label">${label}</div>
        <div class="h-value" style="--count:${value == null ? 0 : Math.min(150, value)};--total:150">
            ${value == null ? "" : '<div class="h-bar" style="--color:var(--accent)"></div>'}
            <span class="h-number ${value == null ? "help" : ""}">${value == null ? "—" : `${fmt(value)}%`}</span>
        </div>
    </div>`,
    )
    .join("");

const openStatsSheet = () => {
  const key = getDate(date);
  const s = daySum(key);
  const g = person.goals;
  statsSheetTitle.textContent = getDateText(date);

  dayRings.innerHTML =
    ringHtml(s.kcal, g.kcal, "--accent", S.kcal, S.kcalUnit) +
    ringHtml(s.protein, g.protein, "--c1", S.protein, S.g) +
    ringHtml(s.fat, g.fat, "--c2", S.fat, S.g) +
    ringHtml(s.carbs, g.carbs, "--c3", S.carbs, S.g);

  dayMicro.innerHTML = microBarsHtml(microEntries(s.micro));

  const list = dayMeals(key);
  dayMealShares.innerHTML = list.length
    ? list
        .map((m) => {
          const kcal = sumItems(m.items).kcal;
          return `<div class="row gap-10 small">
            <span class="mono help">${getTimeText(m.eaten)}</span>
            <span>${S.mealTypes[m.type]}</span>
            <span class="mono right">${fmt(kcal)} ${S.kcalUnit}</span>
            <span class="mono help share">${s.kcal ? fmt((kcal / s.kcal) * 100) : 0}%</span>
        </div>`;
        })
        .join("")
    : `<div class="empty">${S.noRecords}</div>`;

  openSheet(statsSheet);
};

// ==========================================================================
// 17. ПРИЕМ ПИЩИ
// ==========================================================================

let meal = null;
let mealTags = new Set();
let originalPhotoId = null;
let addedPhotos = [];
let quickTab = "recent";
let typeTouched = false;

const autoType = (eaten) => {
  const h = new Date(eaten).getHours();
  if (h >= 5 && h <= 10) return "breakfast";
  if (h >= 11 && h <= 15) return "lunch";
  if (h >= 16 && h <= 20) return "dinner";
  return "snack";
};

const newMeal = () => {
  const now = new Date();
  const eaten = new Date(date);
  eaten.setHours(now.getHours(), now.getMinutes(), 0, 0);
  return {
    eaten: eaten.getTime(),
    type: autoType(eaten),
    items: [],
    tags: [],
    photoId: null,
    note: "",
  };
};

const openMeal = (m, isNew) => {
  meal = m;
  mealTags = new Set(meal.tags);
  originalPhotoId = meal.photoId;
  addedPhotos = [];
  quickTab = "recent";
  typeTouched = !isNew;

  mealText.value = "";
  clearText.classList.add("hidden");
  mealNote.value = meal.note;
  noteBlock.open = !!meal.note;
  mealDelete.classList.toggle("hidden", !meal.created);

  renderPage("meal", isNew);
  renderMeal();
};

const renderMealHeader = () => {
  mealDate.textContent = getDateText(meal.eaten);
  mealTime.textContent = getTimeText(meal.eaten);
  mealType.textContent = S.mealTypes[meal.type];
};

const renderMeal = () => {
  renderMealHeader();
  renderPhoto(mealPhoto, meal.photoId);
  renderQuickPicks();
  renderItems();
  renderMealTags();
};

mealType.onclick = () => {
  typeTouched = true;
  meal.type =
    MEAL_TYPES[(MEAL_TYPES.indexOf(meal.type) + 1) % MEAL_TYPES.length];
  renderMealHeader();
};

mealDate.onclick = () => openWhenPicker(toDay);
mealTime.onclick = () => openWhenPicker(toHour);

/* --- Текст и парсинг --- */

const applyParse = () => {
  const parsed = parseMeal(mealText.value);
  const old = meal.items.filter((i) => i.fragment != null);
  const keep = meal.items.filter((i) => i.fragment == null);
  const used = new Set();

  const next = parsed.map((item) => {
    const same = old.find((o) => !used.has(o) && o.fragment === item.fragment);
    if (!same) return item;
    used.add(same);
    return same;
  });

  meal.items = [...keep, ...next];
  renderItems();
};

const parseLater = debounce(applyParse, 400);

mealText.addEventListener("input", () => {
  clearText.classList.toggle("hidden", !mealText.value);
  parseLater();
});

mealText.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    parseLater.flush();
    mealText.blur();
  }
});

clearText.onclick = () => {
  mealText.value = "";
  clearText.classList.add("hidden");
  parseLater.flush();
  mealText.focus();
};

/* --- Голос --- */

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!Recognition) iconVoice.classList.add("hidden");

iconVoice.onclick = () => {
  // Защита от двойного тапа: не запускаем второе распознавание
  if (iconVoice.classList.contains("listening")) return;

  const recognition = new Recognition();
  recognition.lang = S.locale;
  recognition.interimResults = false;
  recognition.onresult = (e) => {
    const text = e.results[0][0].transcript;
    const current = mealText.value.trim();
    mealText.value = current ? `${current}, ${text}` : text;
    clearText.classList.remove("hidden");
    parseLater.flush();
  };
  recognition.onerror = () => iconVoice.classList.remove("listening");
  recognition.onend = () => iconVoice.classList.remove("listening");
  iconVoice.classList.add("listening");
  recognition.start();
};

/* --- Фото --- */

iconPhoto.onclick = () => photoInput.click();

photoInput.onchange = async () => {
  const file = photoInput.files[0];
  photoInput.value = "";
  if (!file || !meal) return;
  const id = await addPhoto(file);
  if (!meal) return;
  if (id == null) return showMessage(S.photoError);
  if (addedPhotos.includes(meal.photoId)) deletePhoto(meal.photoId);
  addedPhotos.push(id);
  meal.photoId = id;
  renderPhoto(mealPhoto, id);
};

mealPhoto.onclick = (e) => {
  if (!e.target.closest(".photo-remove")) return;
  if (addedPhotos.includes(meal.photoId)) deletePhoto(meal.photoId);
  meal.photoId = null;
  renderPhoto(mealPhoto, null);
};

/* --- Быстрые подсказки --- */

const recentPicks = () =>
  recents
    .map((r) => ({ food: findFood(r.foodId), grams: r.grams }))
    .filter((p) => p.food && !p.food.archived)
    .slice(0, 10);

const frequentPicks = () =>
  [...getFrequency().entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => findFood(id))
    .filter((f) => f && !f.archived)
    .slice(0, 10)
    .map((food) => ({ food, grams: food.servingGrams || DEFAULT_SERVING }));

const renderQuickPicks = () => {
  const lists = { recent: recentPicks(), frequent: frequentPicks() };
  quickPicks.classList.toggle(
    "hidden",
    !lists.recent.length && !lists.frequent.length,
  );
  if (!lists[quickTab].length)
    quickTab = lists.recent.length ? "recent" : "frequent";

  quickPicks.innerHTML =
    segmentHtml(
      "tab",
      [
        { value: "recent", label: S.recent },
        { value: "frequent", label: S.frequent },
      ],
      quickTab,
    ) +
    `<div class="chips">${lists[quickTab]
      .map(
        ({ food, grams }) =>
          `<button class="tap chip" data-id="${food.id}" data-grams="${grams}">${clean(foodName(food))}
            <span class="help mono">${grams} ${S.g}</span></button>`,
      )
      .join("")}</div>`;
};

quickPicks.onclick = (e) => {
  const button = e.target.closest("button");
  if (!button) return;
  if (button.dataset.tab) {
    quickTab = button.dataset.tab;
    return renderQuickPicks();
  }
  addItem(findFood(+button.dataset.id), +button.dataset.grams, quickTab);
};

/* --- Позиции --- */

const addItem = (food, grams, source) => {
  meal.items.push(makeItem(food, grams, source));
  renderItems();
};

const dotColor = (item) => {
  if (isProblem(item)) return "--red";
  if (item.confirmed || item.confidence >= 0.8) return "--green";
  return "--yellow";
};

const macrosText = (n, f) =>
  `${S.protein[0]} ${fmt(n.protein * f)} · ${S.fat[0]} ${fmt(n.fat * f)} · ${S.carbs[0]} ${fmt(n.carbs * f)}`;

const itemHtml = (item, i) => {
  const n = item.nutrition;
  const f = item.grams / 100;
  const dot =
    item.source === "parse"
      ? `<span class="dot" style="--dot:var(${dotColor(item)})"></span>`
      : "";
  const info = n
    ? `<span>${fmt(n.kcal * f)} ${S.kcalUnit}</span><span>${macrosText(n, f)}</span>`
    : `<span class="red">${S.notFound}</span>`;
  return `<div class="card-item ${isProblem(item) ? "bad" : ""}" data-i="${i}" role="button" tabindex="0">
        <div class="row gap-10">
            ${dot}
            <div class="name">${clean(item.name)}</div>
            <div class="grams mono">${item.grams} ${S.g}</div>
        </div>
        <div class="row small help mono between">${info}</div>
        ${healthbar(item.healthScore)}
    </div>`;
};

const renderItems = () => {
  const s = sumItems(meal.items);
  mealItems.innerHTML =
    meal.items.map(itemHtml).join("") +
    (meal.items.length
      ? `<div class="total small mono">${S.total} ${fmt(s.kcal)} ${S.kcalUnit} · ${macrosText(s, 1)}</div>`
      : "");
  renderCta();
};

mealItems.onclick = (e) => {
  const card = e.target.closest(".card-item");
  if (card) openPortion(+card.dataset.i);
};

mealItems.onkeydown = (e) => {
  const card = e.target.closest(".card-item");
  if (card && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    openPortion(+card.dataset.i);
  }
};

/* --- Теги --- */

const renderMealTags = () => {
  const list = [...tags, ...[...mealTags].filter((t) => !tags.includes(t))];
  tagButtons.innerHTML = list
    .map(
      (tag) =>
        `<button class="tap ${mealTags.has(tag) ? "selected" : ""}">${clean(tag)}</button>`,
    )
    .join("");
  [...tagButtons.children].forEach((el, i) => (el.dataset.tag = list[i]));
};

// Общий обработчик выбора тегов для приема пищи и редактора продукта
const bindTagChips = (container, getSet) =>
  container.addEventListener("click", (e) => {
    const button = e.target.closest("button");
    if (!button) return;
    const tag = button.dataset.tag;
    const set = getSet();
    if (set.has(tag)) set.delete(tag);
    else set.add(tag);
    button.classList.toggle("selected");
  });

bindTagChips(tagButtons, () => mealTags);

/* --- Заметка --- */

mealNote.addEventListener(
  "input",
  debounce(() => {
    if (meal) meal.note = mealNote.value;
  }, 300),
);

/* --- CTA --- */

const renderCta = () => {
  const n = meal.items.filter(isProblem).length;
  confirmButton.disabled = !meal.items.length;
  confirmButton.setAttribute("aria-label", n ? S.checkItems(n) : S.confirm);
};

const stripFragment = ({ fragment, ...item }) => item;

const saveMeal = () => {
  meal.items = meal.items.map(stripFragment);
  meal.tags = [...mealTags];
  meal.note = mealNote.value.trim();

  if (meal.created) {
    const i = meals.findIndex((m) => m.created === meal.created);
    meals[i] = meal;
  } else {
    meal.created = Date.now();
    meals.push(meal);
  }

  saveMeals();
  updateRecents(meal.items);
  if (originalPhotoId != null && originalPhotoId !== meal.photoId)
    deletePhoto(originalPhotoId);

  date = new Date(meal.eaten);
  meal = null;
  mealText.value = "";
  toDiaryPage();
};

confirmButton.onclick = () => {
  const i = meal.items.findIndex(isProblem);
  if (i < 0) return saveMeal();
  const card = mealItems.querySelector(`[data-i="${i}"]`);
  card.scrollIntoView({ behavior: "smooth", block: "center" });
  card.classList.add("flash");
  setTimeout(() => card.classList.remove("flash"), 1000);
};

cancelButton.onclick = () => {
  addedPhotos.forEach(deletePhoto);
  meal = null;
  toDiaryPage();
};

mealDelete.onclick = () =>
  showModal(S.deleteMealQuestion, () => {
    meals = meals.filter((m) => m.created !== meal.created);
    saveMeals();
    addedPhotos.forEach(deletePhoto);
    if (originalPhotoId != null) deletePhoto(originalPhotoId);
    meal = null;
    toDiaryPage();
  });

// ==========================================================================
// 18. ПОИСК (#search-sheet)
// ==========================================================================

let searchContext = { type: "meal" };
let searchTab = "all";

const SEARCH_TABS = ["all", "product", "dish", "recipe", "favorites"];

const openSearch = (type, options = {}) => {
  searchContext = { type, ...options };
  searchTab = options.tab || "all";
  searchInput.value = options.query || "";
  searchCreate.classList.toggle("hidden", type !== "meal");
  renderSearchTabs();
  renderSearchResults();
  openSheet(searchSheet);
  setTimeout(() => searchInput.focus(), 250);
};

const renderSearchTabs = () => {
  searchTabs.innerHTML = SEARCH_TABS.map(
    (tab) =>
      `<button class="tap chip ${tab === searchTab ? "selected" : ""}" data-tab="${tab}">${S.searchTabs[tab]}</button>`,
  ).join("");
};

const searchPool = () => {
  let pool = activeFoods();
  if (searchTab === "favorites")
    pool = pool.filter((f) => favorites.includes(f.id));
  else if (searchTab !== "all") pool = pool.filter((f) => f.kind === searchTab);
  if (searchContext.type === "ingredient" && dish?.editing)
    pool = pool.filter((f) => f.id !== dish.editing.id);
  return pool;
};

const searchFoods = (query) => {
  const pool = searchPool();
  if (!query.trim()) {
    return pool
      .sort(
        (a, b) =>
          favorites.includes(b.id) - favorites.includes(a.id) ||
          foodName(a).localeCompare(foodName(b), S.locale),
      )
      .slice(0, 50);
  }
  return rankFoods(query, pool)
    .slice(0, 50)
    .map((m) => m.food);
};

const resultHtml = (f) => {
  const fav = favorites.includes(f.id);
  const edit =
    f.custom && searchContext.type === "meal"
      ? `<button class="icon-button" data-act="edit" aria-label="${S.edit}"><svg class="tool"><use href="sprite.svg#edit"></use></svg></button>`
      : "";
  return `<div class="result" data-id="${f.id}" role="button" tabindex="0">
        <div class="col grow">
            <span>${clean(foodName(f))}</span>
            <span class="small help mono">${fmt(f.nutrition.kcal)} ${S.kcalPer100}</span>
            ${healthbar(f.healthScore)}
        </div>
        <button class="icon-button" data-act="fav" aria-label="${S.favorites}" aria-pressed="${fav}">
            <svg class="tool ${fav ? "starred" : ""}"><use href="sprite.svg#${fav ? "star-filled" : "star"}"></use></svg>
        </button>
        ${edit}
    </div>`;
};

const renderSearchResults = () => {
  const list = searchFoods(searchInput.value);
  searchResults.innerHTML = list.length
    ? list.map(resultHtml).join("")
    : `<div class="empty">${S.nothingFound}</div>`;
  searchCreate.textContent = searchInput.value.trim()
    ? `${S.create} «${searchInput.value.trim()}»`
    : S.create;
};

searchInput.addEventListener("input", debounce(renderSearchResults, 150));

searchClear.onclick = () => {
  searchInput.value = "";
  renderSearchResults();
  searchInput.focus();
};

searchTabs.onclick = (e) => {
  const button = e.target.closest("button");
  if (!button) return;
  searchTab = button.dataset.tab;
  renderSearchTabs();
  renderSearchResults();
};

const toggleFavorite = (id) => {
  favorites = favorites.includes(id)
    ? favorites.filter((x) => x !== id)
    : [...favorites, id];
  saveFavorites();
};

const pickFood = (food) => {
  const { type, index } = searchContext;
  closeSheet();

  if (type === "ingredient") {
    dish.ingredients.push({
      foodId: food.id,
      grams: food.servingGrams || DEFAULT_SERVING,
    });
    renderIngredients();
    return updateDish();
  }

  if (type === "replace") {
    const old = meal.items[index];
    meal.items[index] = {
      ...makeItem(food, old.grams, "search"),
      fragment: old.fragment,
    };
  } else {
    meal.items.push(
      makeItem(
        food,
        food.servingGrams || DEFAULT_SERVING,
        searchTab === "favorites" ? "favorite" : "search",
      ),
    );
  }
  renderItems();
};

searchResults.onclick = (e) => {
  const row = e.target.closest(".result");
  if (!row) return;
  const food = findFood(+row.dataset.id);
  const act = e.target.closest("button")?.dataset.act;

  if (act === "fav") {
    toggleFavorite(food.id);
    return renderSearchResults();
  }
  if (act === "edit") {
    closeSheet();
    return openDishPage({ food, action: { type: "edit" } });
  }
  pickFood(food);
};

searchResults.onkeydown = (e) => {
  const row = e.target.closest(".result");
  if (row && e.target === row && e.key === "Enter")
    pickFood(findFood(+row.dataset.id));
};

searchCreate.onclick = () => {
  const name = searchInput.value.trim();
  closeSheet();
  openDishPage({ name, action: { type: "add" } });
};

searchCancel.onclick = closeSheet;
iconSearch.onclick = () => openSearch("meal");
iconStar.onclick = () => openSearch("meal", { tab: "favorites" });

// ==========================================================================
// 19. ПОРЦИЯ (#portion-sheet)
// ==========================================================================

let portionIndex = null;

const portionItem = () => meal.items[portionIndex];

const renderPortionInfo = () => {
  const item = portionItem();
  const grams = parseNumber(portionGrams.value) || 0;
  const n = item.nutrition;
  if (!n) {
    portionInfo.innerHTML = "";
    return;
  }
  const f = grams / 100;
  const micro = item.micro
    ? microEntries(item.micro, f)
        .filter((e) => e.value)
        .sort((a, b) => b.value - a.value)
        .slice(0, 5)
    : [];
  portionInfo.innerHTML = `
        <div class="center mono">${fmt(n.kcal * f)} ${S.kcalUnit}</div>
        <div class="center small help mono">${macrosText(n, f)}</div>
        ${healthbar(item.healthScore)}
        ${micro.length ? `<div class="h-list">${microBarsHtml(micro)}</div>` : ""}`;
};

const openPortion = (i) => {
  portionIndex = i;
  const item = portionItem();
  const food = findFood(item.foodId);

  portionTitle.textContent = item.name;
  portionNote.textContent = item.foodId == null ? S.notFound : "";
  portionGrams.value = String(item.grams);

  const quick = [...QUICK_GRAMS];
  const serving = food?.servingGrams;
  portionQuick.innerHTML =
    quick
      .map((g) => `<button class="tap chip" data-g="${g}">${g}</button>`)
      .join("") +
    (serving && !quick.includes(serving)
      ? `<button class="tap chip" data-g="${serving}">${S.servingButton(serving)}</button>`
      : "");

  portionCreate.classList.toggle("hidden", item.foodId != null);
  portionConfirmItem.classList.toggle(
    "hidden",
    !(
      item.source === "parse" &&
      item.confidence < 0.8 &&
      !item.confirmed &&
      item.foodId != null
    ),
  );

  renderPortionInfo();
  openSheet(portionSheet);
};

maskNumber(portionGrams, MAX_GRAMS, 0);
portionGrams.addEventListener("input", renderPortionInfo);

portionQuick.onclick = (e) => {
  const button = e.target.closest("button");
  if (!button) return;
  portionGrams.value = button.dataset.g;
  renderPortionInfo();
};

const savePortion = (confirmed) => {
  const item = portionItem();
  item.grams = Math.max(1, parseNumber(portionGrams.value) || item.grams);
  if (confirmed) item.confirmed = true;
  closeSheet();
  renderItems();
};

portionConfirm.onclick = () => savePortion(false);
portionConfirmItem.onclick = () => savePortion(true);

portionDelete.onclick = () => {
  meal.items.splice(portionIndex, 1);
  closeSheet();
  renderItems();
};

portionReplace.onclick = () => {
  const item = portionItem();
  openSearch("replace", { index: portionIndex, query: item.name });
};

portionCreate.onclick = () => {
  const index = portionIndex;
  const name = portionItem().name;
  closeSheet();
  openDishPage({ name, action: { type: "replace", index } });
};

// ==========================================================================
// 20. РЕДАКТОР ТЕГОВ (#tags-sheet)
// ==========================================================================

const openTagEditor = () => {
  tagActions.innerHTML = tags
    .map((tag) => `<button class="tap red">${clean(tag)}</button>`)
    .join("");
  [...tagActions.children].forEach((el, i) => (el.dataset.tag = tags[i]));
  tagInput.value = "";
  openSheet(tagsSheet);
};

const applyTagEditor = () => {
  tags = [...tagActions.children].map((el) => el.dataset.tag);
  saveTags();
  closeSheet();
  renderMealTags();
};

editTagsButton.onclick = openTagEditor;
closeTags.onclick = closeSheet;
applyTags.onclick = applyTagEditor;

createTagButton.onclick = (e) => {
  e.preventDefault();
  const value = tagInput.value.trim();
  if (!value || [...tagActions.children].some((el) => el.dataset.tag === value))
    return;

  const button = document.createElement("BUTTON");
  button.className = "tap red";
  button.textContent = value;
  button.dataset.tag = value;

  tagInput.value = "";
  tagInput.focus();

  tagActions.appendChild(button);
};

tagActions.onclick = (e) => {
  const button = e.target.closest("button");
  if (!button) return;
  tagInput.value = button.dataset.tag;
  button.remove();
};

// ==========================================================================
// 21. ПИКЕР ДАТЫ/ВРЕМЕНИ (#when-picker)
// ==========================================================================

const CX = 125,
  CY = 125,
  R_OUT = 100,
  R_IN = 70,
  HAND_RADIUS = 16;

const MINUTE_LABELS = [
  "00",
  "05",
  "10",
  "15",
  "20",
  "25",
  "30",
  "35",
  "40",
  "45",
  "50",
  "55",
];
const HOUR_LABELS_AM = [
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
];
const HOUR_LABELS_PM = [
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "20",
  "21",
  "22",
  "23",
];

let add = null;
let update = null;
let whenDate = new Date();
let whenMonth = new Date();
let hour = 0;
let minute = 0;

const setDay = () => (dayButton.textContent = getDateText(whenDate));
const setHour = () => (hourButton.textContent = pad(hour));
const setMinute = () => (minuteButton.textContent = pad(minute));

const updateHand = (angle, radius) => {
  const x = CX + radius * Math.cos(angle);
  const y = CY + radius * Math.sin(angle);
  hand.style.left = `${x - HAND_RADIUS}px`;
  hand.style.top = `${y - HAND_RADIUS}px`;
  line.style.width = `${radius}px`;
  line.style.transform = `rotate(${angle}rad)`;
  white.style.clipPath = `circle(${HAND_RADIUS}px at ${x}px ${y}px)`;
};

const createTicks = (labels, radius) =>
  labels
    .map((label, i) => {
      const angle = (i / 6 - 0.5) * Math.PI;
      const x = 50 + radius * Math.cos(angle);
      const y = 50 + radius * Math.sin(angle);
      return `<div class="tick" style="left:${x}%;top:${y}%">${label}</div>`;
    })
    .join("");

const getMinute = (angle) => (Math.round((30 * angle) / Math.PI) + 75) % 60;
const getHour = (angle) => (Math.round((6 * angle) / Math.PI) + 15) % 12;

const clockPoint = (e) => {
  const rect = clock.getBoundingClientRect();
  return { x: e.clientX - rect.left - CX, y: e.clientY - rect.top - CY };
};

const updateMinute = (e) => {
  const { x, y } = clockPoint(e);
  const angle = Math.atan2(y, x);
  updateHand(angle, R_OUT);
  minute = getMinute(angle);
  setMinute();
};

const updateHour = (e) => {
  const { x, y } = clockPoint(e);
  const angle = Math.atan2(y, x);
  const pm = 4 * (x * x + y * y) < (R_IN + R_OUT) ** 2;
  updateHand(angle, pm ? R_IN : R_OUT);
  hour = getHour(angle) + 12 * pm;
  setHour();
};

const selectWhen = (button) =>
  [dayButton, hourButton, minuteButton].forEach((b) =>
    b.classList.toggle("selected", b === button),
  );

const toMinute = () => {
  whenCalendar.style.display = "none";
  clock.style.display = "block";
  white.innerHTML = black.innerHTML = createTicks(MINUTE_LABELS, 40);
  updateHand((minute / 30 - 0.5) * Math.PI, R_OUT);
  update = updateMinute;
  add = addMinute;
  selectWhen(minuteButton);
};

const toHour = () => {
  whenCalendar.style.display = "none";
  clock.style.display = "block";
  white.innerHTML = black.innerHTML =
    createTicks(HOUR_LABELS_AM, 40) + createTicks(HOUR_LABELS_PM, 28);
  updateHand((hour / 6 - 0.5) * Math.PI, hour >= 12 ? R_IN : R_OUT);
  update = updateHour;
  add = addHour;
  selectWhen(hourButton);
};

const toDay = () => {
  clock.style.display = "none";
  whenCalendar.style.display = "block";
  selectWhen(dayButton);
  add = addMonth;
  update = null;
  whenMonth = new Date(whenDate);
  whenMonth.setDate(1);
  renderWhenCalendar();
};

const renderWhenCalendar = () => {
  const y = whenMonth.getFullYear();
  const m = whenMonth.getMonth();
  const first = (new Date(y, m, 1).getDay() + 6) % 7;
  const last = new Date(y, m + 1, 0).getDate();
  const t = getDate(new Date());
  const s = getDate(whenDate);

  const getDayType = (n) => {
    const d = getDate(new Date(y, m, n));
    if (d === s) return "selected";
    if (d === t) return "today";
    if (d > t) return "future";
    return "";
  };

  let days = '<span class="empty"></span>'.repeat(first);
  for (let i = 1; i <= last; i++)
    days += `<button class="${getDayType(i)}">${i}</button>`;

  whenDays.innerHTML = days;
};

const openWhenPicker = (to) => {
  whenDate = new Date(meal.eaten);
  hour = whenDate.getHours();
  minute = whenDate.getMinutes();

  setDay();
  setHour();
  setMinute();

  to();
  openSheet(whenPicker);
};

const applyWhenPicker = () => {
  const eaten = new Date(whenDate);
  eaten.setHours(hour, minute, 0, 0);
  meal.eaten = eaten.getTime();
  if (!typeTouched) meal.type = autoType(meal.eaten);
  renderMealHeader();
  closeSheet();
};

const addMinute = (d) => {
  minute = (minute + 60 + d) % 60;
  updateHand((minute / 30 - 0.5) * Math.PI, R_OUT);
  setMinute();
};

const addHour = (d) => {
  hour = (hour + 24 + d) % 24;
  updateHand((hour / 6 - 0.5) * Math.PI, hour >= 12 ? R_IN : R_OUT);
  setHour();
};

const addMonth = (d) => {
  whenMonth.setMonth(whenMonth.getMonth() + d);
  renderWhenCalendar();
};

dayButton.onclick = toDay;
hourButton.onclick = toHour;
minuteButton.onclick = toMinute;

$("when-prev").onclick = () => add(-1);
$("when-next").onclick = () => add(1);

whenDays.onclick = (e) => {
  const button = e.target.closest("button");
  if (!button) return;
  whenDate = new Date(
    whenMonth.getFullYear(),
    whenMonth.getMonth(),
    +button.textContent,
  );
  setDay();
  toHour();
};

clock.addEventListener("pointerdown", (e) => {
  hand.setPointerCapture(e.pointerId);
  update(e);
});

clock.addEventListener("pointermove", (e) => {
  if (hand.hasPointerCapture(e.pointerId)) update(e);
});

clock.addEventListener("pointerup", (e) => {
  if (!hand.hasPointerCapture(e.pointerId)) return;
  update(e);
  hand.releasePointerCapture(e.pointerId);
  if (update === updateHour) toMinute();
});

clock.addEventListener("pointercancel", (e) => {
  if (hand.hasPointerCapture(e.pointerId))
    hand.releasePointerCapture(e.pointerId);
});

closeWhen.onclick = closeSheet;
applyWhen.onclick = applyWhenPicker;

// ==========================================================================
// 22. ПРОДУКТ / БЛЮДО / РЕЦЕПТ (#dish-page)
// ==========================================================================

let dish = null;

const nextFoodId = () => Math.max(0, ...foods.map((f) => f.id)) + 1;

const DISH_LIMITS = {
  kcal: [900, 1],
  protein: [100, 1],
  fat: [100, 1],
  carbs: [100, 1],
  fiber: [100, 1],
  sugar: [100, 1],
  salt: [100, 2],
  satFat: [100, 1],
};
const PREFILLED = ["fiber", "sugar", "salt", "satFat"];

const openDishPage = ({ food = null, name = "", action }) => {
  dish = {
    editing: food,
    action,
    kind: food?.kind || "product",
    basis: "100",
    ingredients: food ? food.ingredients.map((i) => ({ ...i })) : [],
    micro: food?.micro || null,
    refName: null,
    autoTags: food ? [...food.tags] : autoTags(name),
    tags: new Set(food ? food.tags : autoTags(name)),
    photoId: food?.photoId ?? null,
    originalPhotoId: food?.photoId ?? null,
    addedPhotos: [],
  };

  dishName.value = food ? foodName(food) : name;
  Object.entries(dishInputs).forEach(([k, input]) => {
    input.value = food ? fmt(food.nutrition[k], DISH_LIMITS[k][1]) : "";
    delete input.dataset.auto;
  });
  dishServing.value = food ? String(food.servingGrams) : "";
  delete dishServing.dataset.auto;
  dishYield.value = food?.yieldGrams ? String(food.yieldGrams) : "";
  dishMicro.classList.add("hidden");
  toggleMicro.textContent = S.showMicro;
  dishArchive.classList.toggle("hidden", !food);

  setSegment(dishKind, dish.kind, "kind");
  setSegment(dishBasis, dish.basis, "basis");

  renderPage("dish", false);
  renderDishKind();
  renderIngredients();
  renderDishTags();
  renderPhoto(dishPhoto, dish.photoId);
  if (!food && name) matchRef();
  updateDish();
};

const closeDishPage = (food) => {
  const action = dish.action;
  dish = null;
  renderPage("meal", false);

  if (food && action.type === "add")
    meal.items.push(makeItem(food, food.servingGrams, "manual"));
  if (food && action.type === "replace") {
    const old = meal.items[action.index];
    meal.items[action.index] = {
      ...makeItem(food, old.grams, "manual"),
      fragment: old.fragment,
    };
  }
  renderMeal();
};

const renderDishKind = () => {
  const recipe = dish.kind === "recipe";
  dishBasis.classList.toggle("hidden", recipe);
  dishYieldField.classList.toggle("hidden", !recipe);
  ingredientsBlock.classList.toggle("hidden", !recipe);
  Object.values(dishInputs).forEach((input) => (input.readOnly = recipe));
};

onSegment(dishKind, "kind", (kind) => {
  dish.kind = kind;
  renderDishKind();
  if (kind !== "recipe") matchRef();
  updateDish();
});

onSegment(dishBasis, "basis", (basis) => {
  dish.basis = basis;
  updateDish();
});

/* --- Подбор микронутриентов и порции из REFS --- */

const prefill = (input, value, decimals) => {
  if (input.value !== "" && !input.dataset.auto) return;
  input.value = fmt(value, decimals);
  input.dataset.auto = "1";
};

const matchRef = () => {
  const match = matchFood(dishName.value, REFS);
  dish.refName = match ? foodName(match.food) : null;
  if (!dish.editing || match) dish.micro = match?.food.micro || null;

  if (match) {
    const f = match.food;
    prefill(dishServing, f.servingGrams, 0);
    PREFILLED.forEach((k) =>
      prefill(dishInputs[k], f.nutrition[k], DISH_LIMITS[k][1]),
    );
  }
  updateDish();
};

const matchRefLater = debounce(() => {
  if (dish && dish.kind !== "recipe") matchRef();
}, 400);

dishName.addEventListener("input", () => {
  dish.autoTags = autoTags(dishName.value);
  dish.tags = new Set(dish.autoTags);
  renderDishTags();
  matchRefLater();
  updateDish();
});

Object.entries(dishInputs).forEach(([k, input]) => {
  const [max, decimals] = DISH_LIMITS[k];
  maskNumber(input, max, decimals);
  input.addEventListener("input", () => {
    delete input.dataset.auto;
    updateDish();
  });
});

[dishServing, dishYield].forEach((input) => {
  maskNumber(input, MAX_GRAMS, 0);
  input.addEventListener("input", () => {
    delete input.dataset.auto;
    updateDish();
  });
});

/* --- Чтение и проверка формы --- */

const readDish = () => {
  const name = dishName.value.trim();
  const serving = parseNumber(dishServing.value);

  if (dish.kind === "recipe") {
    const yieldGrams = parseNumber(dishYield.value);
    const r = computeFromIngredients(dish.ingredients, yieldGrams);
    const out = yieldGrams || r.grams;
    return {
      valid: !!name && dish.ingredients.length > 0 && r.grams > 0,
      nutrition: r.nutrition,
      micro: r.micro,
      servingGrams: serving || out || DEFAULT_SERVING,
      yieldGrams: out || null,
      recipe: r,
    };
  }

  const values = Object.fromEntries(
    NUTRIENT_KEYS.map((k) => [k, parseNumber(dishInputs[k].value)]),
  );
  const base = dish.basis === "serving" ? serving : 100;
  const nutrition = Object.fromEntries(
    NUTRIENT_KEYS.map((k) => [
      k,
      base > 0 ? ((values[k] || 0) / base) * 100 : 0,
    ]),
  );
  return {
    valid:
      !!name &&
      values.kcal != null &&
      base > 0 &&
      nutrition.protein + nutrition.fat + nutrition.carbs <= 100,
    nutrition,
    micro: dish.micro,
    servingGrams: serving || DEFAULT_SERVING,
    yieldGrams: null,
  };
};

const updateDish = () => {
  if (!dish) return;
  const r = readDish();

  if (dish.kind === "recipe") {
    Object.entries(dishInputs).forEach(([k, input]) => {
      input.value = fmt(r.nutrition[k], DISH_LIMITS[k][1]);
    });
    const t = r.recipe.totals;
    ingredientsTotal.textContent = r.recipe.grams
      ? `${fmt(r.recipe.grams)} ${S.g} · ${fmt(t.kcal)} ${S.kcalUnit} · ${macrosText(t, 1)}`
      : "";
    renderIngredientKcal();
  }
  dishServing.placeholder = String(
    dish.kind === "recipe" && r.yieldGrams ? r.yieldGrams : 100,
  );

  dishSave.disabled = !r.valid;
  dishMicroSource.textContent =
    dish.kind !== "recipe" && dish.refName ? S.microFrom(dish.refName) : "";
  const factor = r.servingGrams / 100;
  dishMicroBars.innerHTML = `<div class="h-list">${microBarsHtml(microEntries(r.micro || emptyMicro(), factor))}</div>`;
};

toggleMicro.onclick = () => {
  const hidden = dishMicro.classList.toggle("hidden");
  toggleMicro.textContent = hidden ? S.showMicro : S.hideMicro;
};

/* --- Ингредиенты --- */

const renderIngredients = () => {
  ingredientsList.innerHTML = dish.ingredients
    .map(({ foodId, grams }, i) => {
      const f = findFood(foodId);
      return `<div class="ingredient row gap-10" data-i="${i}">
            <span class="grow">${clean(f ? foodName(f) : "?")}</span>
            <input class="input grams-input mono" inputmode="numeric" value="${grams}" aria-label="${S.g}">
            <span class="help small">${S.g}</span>
            <span class="kcal small mono help"></span>
            <button class="icon-button" data-act="remove" aria-label="${S.delete}">
                <svg class="tool"><use href="sprite.svg#close"></use></svg>
            </button>
        </div>`;
    })
    .join("");
  renderIngredientKcal();
};

const renderIngredientKcal = () => {
  ingredientsList.querySelectorAll(".ingredient").forEach((row) => {
    const { foodId, grams } = dish.ingredients[+row.dataset.i];
    const f = findFood(foodId);
    row.querySelector(".kcal").textContent = f
      ? `${fmt((f.nutrition.kcal * grams) / 100)} ${S.kcalUnit}`
      : "";
  });
};

ingredientsList.addEventListener("input", (e) => {
  const input = e.target.closest(".grams-input");
  if (!input) return;
  input.value = normalizeNumber(input.value, MAX_GRAMS, 0);
  dish.ingredients[+input.closest(".ingredient").dataset.i].grams =
    parseNumber(input.value) || 0;
  updateDish();
});

ingredientsList.onclick = (e) => {
  const button = e.target.closest('[data-act="remove"]');
  if (!button) return;
  dish.ingredients.splice(+button.closest(".ingredient").dataset.i, 1);
  renderIngredients();
  updateDish();
};

addIngredient.onclick = () => openSearch("ingredient");

/* --- Теги и фото --- */

const renderDishTags = () => {
  dishTags.innerHTML = dish.autoTags
    .map(
      (tag) =>
        `<button class="tap ${dish.tags.has(tag) ? "selected" : ""}">${clean(tag)}</button>`,
    )
    .join("");
  [...dishTags.children].forEach(
    (el, i) => (el.dataset.tag = dish.autoTags[i]),
  );
};

bindTagChips(dishTags, () => dish.tags);

dishPhotoButton.onclick = () => dishPhotoInput.click();

dishPhotoInput.onchange = async () => {
  const file = dishPhotoInput.files[0];
  dishPhotoInput.value = "";
  if (!file || !dish) return;
  const id = await addPhoto(file);
  if (!dish) return;
  if (id == null) return showMessage(S.photoError);
  if (dish.addedPhotos.includes(dish.photoId)) deletePhoto(dish.photoId);
  dish.addedPhotos.push(id);
  dish.photoId = id;
  renderPhoto(dishPhoto, id);
};

dishPhoto.onclick = (e) => {
  if (!e.target.closest(".photo-remove")) return;
  if (dish.addedPhotos.includes(dish.photoId)) deletePhoto(dish.photoId);
  dish.photoId = null;
  renderPhoto(dishPhoto, null);
};

/* --- Сохранение --- */

dishSave.onclick = () => {
  const r = readDish();
  if (!r.valid) return;

  const food = {
    id: dish.editing ? dish.editing.id : nextFoodId(),
    kind: dish.kind,
    ru: dishName.value.trim(),
    aliases: [],
    nutrition: r.nutrition,
    micro: r.micro,
    ingredients:
      dish.kind === "recipe" ? dish.ingredients.filter((i) => i.grams > 0) : [],
    yieldGrams: dish.kind === "recipe" ? r.yieldGrams : null,
    servingGrams: Math.round(r.servingGrams),
    pieceGrams: null,
    healthScore: computeHealth(r.nutrition, r.micro),
    tags: [...dish.tags],
    photoId: dish.photoId,
    custom: true,
    archived: false,
  };

  const i = foods.findIndex((f) => f.id === food.id);
  if (i >= 0) foods[i] = food;
  else foods.push(food);
  saveFoods();

  if (dish.originalPhotoId != null && dish.originalPhotoId !== food.photoId)
    deletePhoto(dish.originalPhotoId);
  closeDishPage(food);
};

dishCancel.onclick = () => {
  dish.addedPhotos.forEach(deletePhoto);
  closeDishPage(null);
};

dishArchive.onclick = () =>
  showModal(S.deleteFoodQuestion, () => {
    const i = foods.findIndex((f) => f.id === dish.editing.id);
    foods[i] = { ...foods[i], archived: true };
    saveFoods();
    favorites = favorites.filter((id) => id !== foods[i].id);
    saveFavorites();
    dish.addedPhotos.forEach(deletePhoto);
    closeDishPage(null);
  });

// ==========================================================================
// 23. ПРОФИЛЬ
// ==========================================================================

let sex = DEFAULT_PERSON.sex;
let activity = DEFAULT_PERSON.activity;
let weightGoal = DEFAULT_PERSON.weightGoal;

const birthdate = { digits: "", cursor: 0 };

const renderPerson = () => {
  personButton.lastElementChild.innerHTML = `
        <span>${person.sex ? S.male : S.female}</span>
        <span class="help">${person.age} ${S.y}</span> •
        <span class="help">${fmt(person.height)} ${S.cm}</span> •
        <span class="help">${fmt(person.weight, 1)} ${S.kg}</span>`;

  const g = person.goals;
  const row = (label, value) =>
    `<div class="row"><span class="help">${label}</span><span class="right mono">${value}</span></div>`;
  goalsList.innerHTML =
    row(S.kcal, `${fmt(g.kcal)} ${S.kcalUnit}`) +
    row(
      `${S.protein} / ${S.fat} / ${S.carbs}`,
      `${fmt(g.protein)} / ${fmt(g.fat)} / ${fmt(g.carbs)} ${S.g}`,
    ) +
    row(S.fiber, `${fmt(g.fiber)} ${S.g}`) +
    row(`${S.sugar}, ${S.max}`, `${fmt(g.sugar)} ${S.g}`) +
    row(`${S.salt}, ${S.max}`, `${fmt(g.salt)} ${S.g}`) +
    row(S.water, `${fmt(g.water / 1000, 1)} ${S.l}`);
};

const openPersonPicker = () => {
  if (person.birthdate) {
    const s = String(person.birthdate);
    birthdate.digits = s.slice(6, 8) + s.slice(4, 6) + s.slice(0, 4);
    birthdate.cursor = birthdate.digits.length;
    birthdateInput.value = formatDate();
  } else {
    birthdate.digits = "";
    birthdate.cursor = 0;
    birthdateInput.value = "";
  }

  sex = person.sex;
  activity = person.activity;
  weightGoal = person.weightGoal;
  setSegment(sexInput, sex ? "male" : "female", "sex");
  setSegment(activityInput, activity, "activity");
  setSegment(goalInput, weightGoal, "goal");

  heightInput.value = fmt(person.height, 0);
  weightInput.value = fmt(person.weight, 1);

  openSheet(personPicker);
};

const applyPersonPicker = () => {
  person.birthdate = validDate()
    ? +(
        birthdate.digits.slice(4, 8) +
        birthdate.digits.slice(2, 4) +
        birthdate.digits.slice(0, 2)
      )
    : null;
  person.sex = sex;
  person.activity = activity;
  person.weightGoal = weightGoal;
  person.height = parseNumber(heightInput.value) || person.height;

  const weight = parseNumber(weightInput.value);
  if (weight && weight !== person.weight) {
    log.weight.push({ date: Date.now(), weight });
    saveWeight();
    person.weight = weight;
  }

  savePerson();
  closeSheet();
  renderPerson();
};

personButton.onclick = openPersonPicker;
closePerson.onclick = closeSheet;
applyPerson.onclick = applyPersonPicker;

onSegment(sexInput, "sex", (v) => (sex = v === "male"));
onSegment(activityInput, "activity", (v) => (activity = +v));
onSegment(goalInput, "goal", (v) => (weightGoal = v));

maskNumber(heightInput, 250, 0);
maskNumber(weightInput, 500, 1);

/* --- Дата рождения (как в Poop Tracker) --- */

const YY = new Date().getFullYear() % 100;

const formatDate = () => {
  if (!birthdate.digits) return "";
  const d =
    birthdate.digits.slice(0, 2) + (birthdate.digits.length >= 2 ? "." : "");
  const m =
    birthdate.digits.slice(2, 4) + (birthdate.digits.length >= 4 ? "." : "");
  const y = birthdate.digits.slice(4);
  return d + m + y;
};

const normalize = () => {
  if (birthdate.cursor < birthdate.digits.length)
    birthdate.digits = birthdate.digits.slice(0, birthdate.cursor);

  if (+birthdate.digits[0] > 3) birthdate.digits = "0" + birthdate.digits;

  if (birthdate.digits.length >= 2) {
    const d = +birthdate.digits.slice(0, 2);
    if (d > 31) birthdate.digits = "0" + birthdate.digits;
    else if (d === 0) birthdate.digits = "01" + birthdate.digits.slice(2);
  }

  if (birthdate.digits.length >= 3 && +birthdate.digits[2] > 1)
    birthdate.digits =
      birthdate.digits.slice(0, 2) + "0" + birthdate.digits.slice(2);

  if (birthdate.digits.length >= 4) {
    const d = birthdate.digits.slice(0, 2);
    const m = +birthdate.digits.slice(2, 4);
    if (m > 12) birthdate.digits = d + "0" + birthdate.digits.slice(2);
    else if (m === 0) birthdate.digits = d + "01" + birthdate.digits.slice(4);
  }

  if (birthdate.digits.length >= 6) {
    const y = birthdate.digits.slice(4, 6);
    if (y !== "19" && y !== "20") {
      birthdate.digits =
        birthdate.digits.slice(0, 4) + (+y <= YY ? "20" : "19") + y;
    }
  }

  birthdate.digits = birthdate.digits.slice(0, 8);
  birthdate.cursor = birthdate.digits.length;
};

const setValue = () => {
  birthdateInput.value = formatDate();
  let p = birthdate.cursor;
  if (birthdate.cursor >= 2) p++;
  if (birthdate.cursor >= 4) p++;
  p = Math.min(p, birthdateInput.value.length);
  birthdateInput.setSelectionRange(p, p);
};

const rawPosition = (p) =>
  birthdateInput.value.slice(0, p).replace(/\D/g, "").length;

birthdateInput.addEventListener("beforeinput", (e) => {
  if (e.inputType === "insertText" && e.data === ".") {
    e.preventDefault();
    if (birthdate.cursor === 1) {
      birthdate.digits = "0" + birthdate.digits;
      birthdate.cursor = 2;
      setValue();
    } else if (birthdate.cursor === 3) {
      birthdate.digits =
        birthdate.digits.slice(0, 2) + "0" + birthdate.digits.slice(2);
      birthdate.cursor = 4;
      setValue();
    }
    return;
  }

  if (e.inputType === "insertText" || e.inputType === "insertFromPaste") {
    e.preventDefault();
    const p = (e.data || "").replace(/\D/g, "");
    if (!p || birthdate.cursor >= 8) return;

    birthdate.digits =
      birthdate.digits.slice(0, birthdate.cursor) +
      p +
      birthdate.digits.slice(birthdate.cursor);
    birthdate.cursor += p.length;
    normalize();
    setValue();
    return;
  }

  if (e.inputType === "deleteContentBackward") {
    e.preventDefault();
    if (!birthdate.cursor) return;

    if (birthdate.cursor === 8 && birthdate.digits.length === 8) {
      const y = birthdate.digits.slice(4);
      if (y.slice(0, 2) !== "19" && y.slice(0, 2) !== "20") {
        birthdate.digits = birthdate.digits.slice(0, 4) + y.slice(2);
        birthdate.cursor = 6;
        setValue();
        return;
      }
    }

    birthdate.digits =
      birthdate.digits.slice(0, birthdate.cursor - 1) +
      birthdate.digits.slice(birthdate.cursor);
    birthdate.cursor--;
    normalize();
    setValue();
  }
});

birthdateInput.addEventListener("click", () => {
  birthdate.cursor = rawPosition(birthdateInput.selectionStart);
});

birthdateInput.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") {
    e.preventDefault();
    birthdate.cursor = Math.max(0, birthdate.cursor - 1);
    setValue();
  }
  if (e.key === "ArrowRight") {
    e.preventDefault();
    birthdate.cursor = Math.min(8, birthdate.cursor + 1);
    setValue();
  }
});

birthdateInput.addEventListener("paste", (e) => {
  e.preventDefault();
  const value = e.clipboardData.getData("text").trim();
  const parts = value.split(/[.\-/\s]+/);

  if (parts.length >= 3) {
    let [d, m, y] = parts;
    d = d.replace(/\D/g, "");
    m = m.replace(/\D/g, "");
    y = y.replace(/\D/g, "");

    if (d.length === 1) d = "0" + d;
    if (m.length === 1) m = "0" + m;

    if (y.length === 1) y = "200" + y;
    else if (y.length === 2) y = (+y <= YY ? "20" : "19") + y;
    else y = y.slice(0, 4);

    birthdate.digits = (d + m + y).slice(0, 8);
  } else {
    birthdate.digits = value.replace(/\D/g, "").slice(0, 8);
    normalize();
  }

  birthdate.cursor = birthdate.digits.length;
  setValue();
});

const validDate = () => {
  if (birthdate.digits.length !== 8) return false;

  const d = +birthdate.digits.slice(0, 2);
  const m = +birthdate.digits.slice(2, 4);
  const y = +birthdate.digits.slice(4, 8);
  const value = new Date(y, m - 1, d);

  return (
    value.getFullYear() === y &&
    value.getMonth() === m - 1 &&
    value.getDate() === d &&
    value <= new Date()
  );
};

/* --- Экспорт, импорт, сброс --- */

exportButton.onclick = exportData;
importButton.onclick = () => importInput.click();

importInput.onchange = async () => {
  const file = importInput.files[0];
  importInput.value = "";
  if (!file) return;
  let data = null;
  try {
    data = JSON.parse(await file.text());
  } catch {
    data = null;
  }
  if (!validImport(data)) return showMessage(S.importError);
  showModal(S.importQuestion, () => importData(data));
};

resetButton.onclick = () => showModal(S.resetQuestion, resetData);

// ==========================================================================
// 24. СТАТИСТИКА: ПЕРИОД И БАКЕТЫ
// ==========================================================================

let period = WEEK;
let currentDate = new Date();
let nutrientMode = "sum";
let lag = 0;
let triggerX = "sleep";
let triggerY = "kcal";
let microMode = "radar";

const getRange = (d, p) => {
  d = startOfDay(d);
  if (p === DAY) return [d, addDays(d, 1)];
  if (p === WEEK) {
    const start = getMonday(d);
    return [start, addDays(start, 7)];
  }
  const start = getMonday(new Date(d.getFullYear(), d.getMonth(), 1));
  const end = addDays(
    getMonday(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
    7,
  );
  return [start, end];
};

const getBuckets = (start, end, p) => {
  const buckets = [];
  if (p === DAY) {
    for (let h = 0; h < 24; h += 6) {
      const s = new Date(start);
      s.setHours(h);
      const e = new Date(start);
      e.setHours(h + 6);
      buckets.push({
        label: String(h),
        title: `${pad(h)}:00–${pad(h + 6)}:00`,
        start: s,
        end: e,
      });
    }
  } else if (p === WEEK) {
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      buckets.push({
        label: S.wds[i],
        title: `${S.wds[i]}, ${getDateText(d)}`,
        start: d,
        end: addDays(start, i + 1),
      });
    }
  } else {
    for (let s = new Date(start); s < end; s = addDays(s, 7)) {
      buckets.push({
        label: String(s.getDate()),
        title: `${getDateText(s)} — ${getDateText(addDays(s, 6))}`,
        start: new Date(s),
        end: addDays(s, 7),
      });
    }
  }
  return buckets;
};

const renderRange = () => {
  const [start, end] = getRange(currentDate, period);
  if (period === DAY) rangeLabel.textContent = getDateText(start);
  else if (period === WEEK) {
    rangeLabel.innerHTML = `<span>${getDateText(start)}</span><span>—</span><span>${getDateText(addDays(end, -1))}</span>`;
  } else
    rangeLabel.textContent = `${S.months[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
};

const shiftRange = (direction) => {
  if (period === DAY) currentDate = addDays(currentDate, direction);
  else if (period === WEEK) currentDate = addDays(currentDate, direction * 7);
  else
    currentDate = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + direction,
      1,
    );
  renderRange();
};

/* --- Агрегирование --- */

// Дни бакета, которые уже наступили
const pastDays = (start, end) => {
  const days = [];
  const limit = startOfDay(new Date());
  for (let d = startOfDay(start); d < end && d <= limit; d = addDays(d, 1))
    days.push(d);
  return days;
};

const DAY_SUM_KEYS = [
  "kcal",
  "protein",
  "fat",
  "carbs",
  "fiber",
  "sugar",
  "salt",
  "satFat",
];

const daySummaryOf = (list) => {
  // Группируем позиции по типам приема за один проход, без повторных фильтраций
  const all = [];
  const byType = {};
  for (const m of list) {
    all.push(...m.items);
    (byType[m.type] ??= []).push(...m.items);
  }
  const s = sumItems(all);
  return {
    ...Object.fromEntries(DAY_SUM_KEYS.map((k) => [k, s[k]])),
    health: s.healthScore,
    count: list.length,
    ...Object.fromEntries(
      MEAL_TYPES.map((t) => [t, byType[t] ? sumItems(byType[t]).kcal : 0]),
    ),
  };
};

const SUMMARY_KEYS = [...NUTRIENT_KEYS, "health", "count", ...MEAL_TYPES];

const averageSummaries = (list) => {
  if (!list.length) return null;
  const r = {};
  SUMMARY_KEYS.forEach((k) => {
    const values = list.map((x) => x[k]).filter((v) => v != null);
    r[k] = values.length
      ? values.reduce((a, v) => a + v, 0) / values.length
      : null;
  });
  return r;
};

// День/неделя/месяц на уровне дней: средний день с записями
const aggregateDays = (b) =>
  averageSummaries(
    pastDays(b.start, b.end)
      .map((d) => dayMeals(getDate(d)))
      .filter((list) => list.length)
      .map(daySummaryOf),
  );

const aggregate = (b) => {
  if (b.start > new Date()) return null;
  if (period !== DAY) return aggregateDays(b);
  const list = meals.filter((m) => m.eaten >= b.start && m.eaten < b.end);
  return list.length ? daySummaryOf(list) : null;
};

const aggregateWater = (b) => {
  if (b.start > new Date()) return null;
  if (period === DAY) {
    return log.water
      .filter((e) => e.date >= b.start && e.date < b.end)
      .reduce((s, e) => s + e.ml, 0);
  }
  const values = pastDays(b.start, b.end)
    .map((d) => dayWater(getDate(d)))
    .filter((v) => v > 0);
  return values.length
    ? values.reduce((a, v) => a + v, 0) / values.length
    : null;
};

const cumulative = (values, buckets) => {
  let acc = 0;
  return values.map((v, i) => {
    if (buckets[i].start > new Date()) return null;
    acc += v || 0;
    return acc;
  });
};

const inNorm = (key) => {
  if (!dayMeals(key).length) return false;
  const ratio = daySum(key).kcal / person.goals.kcal;
  return ratio >= 0.8 && ratio <= 1.1;
};

const getStreaks = () => {
  const keys = [...getDayIndex().keys()];
  if (!keys.length) return { current: 0, best: 0 };
  const first = startOfDay(
    Math.min(...dayMeals(Math.min(...keys)).map((m) => m.eaten)),
  );
  let best = 0,
    run = 0;
  for (let d = first; d <= today; d = addDays(d, 1)) {
    run = inNorm(getDate(d)) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  let current = 0;
  let d = inNorm(getDate(new Date())) ? new Date() : addDays(new Date(), -1);
  while (inNorm(getDate(d))) {
    current++;
    d = addDays(d, -1);
  }
  return { current, best };
};

// ==========================================================================
// 25. СТАТИСТИКА: УНИВЕРСАЛЬНЫЕ РЕНДЕРЫ (SVG)
// ==========================================================================

const CHART_HEIGHT = 200;
const PAD = { l: 48, r: 10, t: 12, b: 24 };
const chartTips = new Map();

const empty = (id) => {
  $(id).innerHTML = `<div class="empty">${S.noData}</div>`;
};

const niceStep = (range) => {
  const raw = range / 4;
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => s >= raw) || p * 10;
};

const scaleY = (min, max) => {
  const step = niceStep(max - min);
  const lo = Math.floor(min / step) * step;
  const hi = Math.max(lo + step, Math.ceil(max / step) * step);
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(6));
  return { lo, hi, ticks };
};

const tickFormat = (ticks) => {
  const max = Math.max(...ticks.map(Math.abs));
  return (v) => (max >= 10000 ? `${fmt(v / 1000)}k` : fmt(v, max < 10 ? 1 : 0));
};

const frame = (id, height = CHART_HEIGHT) => {
  const el = $(id);
  const w = Math.max(260, el.clientWidth || 320);
  const plot = { x0: PAD.l, x1: w - PAD.r, y0: height - PAD.b, y1: PAD.t };
  return { el, w, h: height, plot };
};

const gridHtml = (plot, { ticks }, y) => {
  const text = tickFormat(ticks);
  return ticks
    .map(
      (v) => `
        <line class="grid" x1="${plot.x0}" x2="${plot.x1}" y1="${y(v)}" y2="${y(v)}"></line>
        <text class="tick" x="${plot.x0 - 6}" y="${y(v) + 4}" text-anchor="end">${text(v)}</text>`,
    )
    .join("");
};

const xLabelsHtml = (buckets, x, plot) =>
  buckets
    .map(
      (b, i) =>
        `<text class="tick" x="${x(i)}" y="${plot.y0 + 16}" text-anchor="middle">${clean(b.label)}</text>`,
    )
    .join("");

const legendHtml = (entries) =>
  entries.length < 2
    ? ""
    : `<div class="legend">${entries
        .map(
          ({ label, color, kind }) =>
            `<span class="legend-item"><i class="key ${kind || "rect"}" style="--color:var(${color})"></i>${clean(label)}</span>`,
        )
        .join("")}</div>`;

const normalLine = (plot, y, value) =>
  value == null
    ? ""
    : `<line class="normal" x1="${plot.x0}" x2="${plot.x1}" y1="${y(value)}" y2="${y(value)}"></line>`;

// Подсказка: заголовок и строки {label, value, color}
const setTips = (id, tips) => chartTips.set(id, tips);

const hitRects = (id, n, x, plot, slot) =>
  Array.from(
    { length: n },
    (_, i) =>
      `<rect class="hit" data-tip="${id}:${i}" x="${x(i) - slot / 2}" y="${plot.y1}" width="${slot}" height="${plot.y0 - plot.y1}"></rect>`,
  ).join("");

const barPath = (x, y, w, h) => {
  if (h <= 0) return "";
  const r = Math.min(4, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
};

const svg = (w, h, body) =>
  `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">${body}</svg>`;

const renderLine = (
  id,
  buckets,
  series,
  {
    normal = null,
    normalLabel = S.norm,
    min = null,
    unit = "",
    decimals = 0,
  } = {},
) => {
  const values = series.flatMap((s) => s.values).filter((v) => v != null);
  if (!values.length) return empty(id);

  const { el, w, h, plot } = frame(id);
  const lo = min === "auto" ? Math.min(...values) : 0;
  const hiRaw = Math.max(...values, normal ?? 0);
  const scale =
    min === "auto"
      ? scaleY(
          lo - Math.max(0.5, (hiRaw - lo) * 0.2),
          hiRaw + Math.max(0.5, (hiRaw - lo) * 0.2),
        )
      : scaleY(0, hiRaw * 1.08 || 1);
  const slot = (plot.x1 - plot.x0) / buckets.length;
  const x = (i) => plot.x0 + slot * (i + 0.5);
  const y = (v) =>
    plot.y0 - ((v - scale.lo) / (scale.hi - scale.lo)) * (plot.y0 - plot.y1);

  const paths = series
    .map((s) => {
      let d = "";
      let open = false;
      const dots = [];
      s.values.forEach((v, i) => {
        if (v == null) {
          open = false;
          return;
        }
        d += `${open ? "L" : "M"}${x(i)},${y(v)}`;
        const isolated = s.values[i - 1] == null && s.values[i + 1] == null;
        if (
          !s.thin &&
          (isolated || i === s.values.length - 1 || s.values[i + 1] == null)
        )
          dots.push(i);
        open = true;
      });
      return (
        `<path class="series ${s.dash ? "dash" : ""} ${s.thin ? "thin" : ""}" d="${d}" style="stroke:var(${s.color})"></path>` +
        dots
          .map(
            (i) =>
              `<circle class="dot" cx="${x(i)}" cy="${y(s.values[i])}" r="4" style="fill:var(${s.color})"></circle>`,
          )
          .join("")
      );
    })
    .join("");

  setTips(
    id,
    buckets.map((b, i) => ({
      title: b.title || b.label,
      rows: [
        ...series
          .filter((s) => s.values[i] != null)
          .map((s) => ({
            label: s.label,
            value: `${fmt(s.values[i], decimals)} ${unit}`,
            color: s.color,
          })),
        ...(normal != null
          ? [
              {
                label: normalLabel,
                value: `${fmt(normal, decimals)} ${unit}`,
                color: "--help",
              },
            ]
          : []),
      ],
    })),
  );

  el.innerHTML =
    svg(
      w,
      h,
      gridHtml(plot, scale, y) +
        normalLine(plot, y, normal) +
        paths +
        xLabelsHtml(buckets, x, plot) +
        hitRects(id, buckets.length, x, plot, slot),
    ) +
    legendHtml([
      ...series.map((s) => ({
        label: s.label,
        color: s.color,
        kind: s.dash ? "dash" : "line",
      })),
      ...(normal != null && series.length
        ? [{ label: normalLabel, color: "--help", kind: "dash" }]
        : []),
    ]);
};

const renderStacked = (
  id,
  buckets,
  keys,
  data,
  { normal = null, colors, labels, unit = "" },
) => {
  const totals = data.map((row) =>
    row ? keys.reduce((s, k) => s + (row[k] || 0), 0) : 0,
  );
  if (!totals.some((v) => v > 0)) return empty(id);

  const { el, w, h, plot } = frame(id);
  const scale = scaleY(0, Math.max(...totals, normal ?? 0) * 1.08);
  const slot = (plot.x1 - plot.x0) / buckets.length;
  const bw = Math.min(24, slot * 0.6);
  const x = (i) => plot.x0 + slot * (i + 0.5);
  const y = (v) =>
    plot.y0 - ((v - scale.lo) / (scale.hi - scale.lo)) * (plot.y0 - plot.y1);

  const bars = data
    .map((row, i) => {
      if (!row) return "";
      let acc = 0;
      const parts = keys
        .map((k) => ({ k, v: row[k] || 0 }))
        .filter((p) => p.v > 0);
      return parts
        .map((p, j) => {
          const top = y(acc + p.v);
          const bottom = y(acc);
          acc += p.v;
          const height = Math.max(0, bottom - top - (j > 0 ? 2 : 0));
          const x0 = x(i) - bw / 2;
          return j === parts.length - 1
            ? `<path d="${barPath(x0, top, bw, height)}" style="fill:var(${colors[p.k]})"></path>`
            : `<rect x="${x0}" y="${top}" width="${bw}" height="${height}" style="fill:var(${colors[p.k]})"></rect>`;
        })
        .join("");
    })
    .join("");

  setTips(
    id,
    buckets.map((b, i) => ({
      title: b.title || b.label,
      rows: keys.map((k) => ({
        label: labels[k],
        value: data[i] ? `${fmt(data[i][k])} ${unit}` : "—",
        color: colors[k],
      })),
    })),
  );

  el.innerHTML =
    svg(
      w,
      h,
      gridHtml(plot, scale, y) +
        bars +
        normalLine(plot, y, normal) +
        xLabelsHtml(buckets, x, plot) +
        hitRects(id, buckets.length, x, plot, slot),
    ) +
    legendHtml([
      ...keys.map((k) => ({ label: labels[k], color: colors[k] })),
      ...(normal != null
        ? [{ label: S.norm, color: "--help", kind: "dash" }]
        : []),
    ]);
};

const renderVBars = (
  id,
  buckets,
  series,
  {
    normal = null,
    unit = "",
    decimals = 0,
    height = CHART_HEIGHT,
    legend = null,
  } = {},
) => {
  const values = series
    .flatMap((s) => s.values)
    .filter((v) => v != null && v !== 0);
  if (!values.length) return empty(id);

  const { el, w, h, plot } = frame(id, height);
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values, normal ?? 0);
  const scale = scaleY(lo * 1.08, hi * 1.08 || 1);
  const slot = (plot.x1 - plot.x0) / buckets.length;
  const bw = Math.min(24, (slot * 0.6) / series.length);
  const x = (i) => plot.x0 + slot * (i + 0.5);
  const y = (v) =>
    plot.y0 - ((v - scale.lo) / (scale.hi - scale.lo)) * (plot.y0 - plot.y1);

  const bars = series
    .map((s, j) =>
      s.values
        .map((v, i) => {
          if (v == null || v === 0) return "";
          const color = typeof s.color === "function" ? s.color(v) : s.color;
          const x0 =
            x(i) -
            (bw * series.length) / 2 -
            (series.length - 1) +
            j * (bw + 2);
          const top = y(Math.max(0, v));
          const height = Math.abs(y(v) - y(0));
          if (v > 0)
            return `<path d="${barPath(x0, top, bw, height)}" style="fill:var(${color})"></path>`;
          const r = Math.min(4, height, bw / 2);
          const yb = y(0) + height;
          return `<path d="M${x0},${y(0)}V${yb - r}Q${x0},${yb} ${x0 + r},${yb}H${x0 + bw - r}Q${x0 + bw},${yb} ${x0 + bw},${yb - r}V${y(0)}Z" style="fill:var(${color})"></path>`;
        })
        .join(""),
    )
    .join("");

  const zero =
    lo < 0
      ? `<line class="axis" x1="${plot.x0}" x2="${plot.x1}" y1="${y(0)}" y2="${y(0)}"></line>`
      : "";

  setTips(
    id,
    buckets.map((b, i) => ({
      title: b.title || b.label,
      rows: [
        ...series
          .filter((s) => s.values[i] != null)
          .map((s) => ({
            label: s.label,
            value: `${s.values[i] > 0 && lo < 0 ? "+" : ""}${fmt(s.values[i], decimals)} ${unit}`,
            color:
              typeof s.color === "function" ? s.color(s.values[i]) : s.color,
          })),
        ...(normal != null
          ? [
              {
                label: S.norm,
                value: `${fmt(normal, decimals)} ${unit}`,
                color: "--help",
              },
            ]
          : []),
      ],
    })),
  );

  el.innerHTML =
    svg(
      w,
      h,
      gridHtml(plot, scale, y) +
        zero +
        bars +
        normalLine(plot, y, normal) +
        xLabelsHtml(buckets, x, plot) +
        hitRects(id, buckets.length, x, plot, slot),
    ) +
    legendHtml(
      legend || series.map((s) => ({ label: s.label, color: s.color })),
    );
};

const renderHList = (id, entries) => {
  const el = $(id);
  if (!entries.length) return empty(id);
  const total = Math.max(...entries.map((e) => e.value));
  el.innerHTML = `<div class="h-list" style="--total:${total}">${entries
    .map(
      ({ label, value, text }) => `
        <div class="h-col">
            <div class="h-label">${clean(label)}</div>
            <div class="h-value" style="--count:${value}">
                <div class="h-bar" style="--color:var(--accent)"></div>
                <span class="h-number">${text}</span>
            </div>
        </div>`,
    )
    .join("")}</div>`;
};

const renderKPI = (id, value, label, sub) => {
  if (value == null) return empty(id);
  $(id).innerHTML = `<div class="kpi">
        <div class="kpi-value">${value}</div>
        <div class="help">${label}</div>
        <div class="small help">${sub}</div>
    </div>`;
};

const renderScatter = (
  id,
  points,
  { xLabel, yLabel, xUnit = "", yUnit = "" },
) => {
  if (points.length < 2) return empty(id);

  const { el, w, h, plot } = frame(id, CHART_HEIGHT + 16);
  plot.y0 -= 16;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const sx = scaleY(
    Math.min(...xs),
    Math.max(...xs) + (Math.max(...xs) === Math.min(...xs) ? 1 : 0),
  );
  const yPad = Math.max(0.5, (Math.max(...ys) - Math.min(...ys)) * 0.15);
  const yMin = Math.min(...ys);
  const sy = scaleY(
    yMin >= 0 ? Math.max(0, yMin - yPad) : yMin - yPad,
    Math.max(...ys) + yPad,
  );
  const x = (v) =>
    plot.x0 + ((v - sx.lo) / (sx.hi - sx.lo)) * (plot.x1 - plot.x0);
  const y = (v) =>
    plot.y0 - ((v - sy.lo) / (sy.hi - sy.lo)) * (plot.y0 - plot.y1);

  // Подписи оси X прореживаются, чтобы не наезжать друг на друга
  const xText = tickFormat(sx.ticks);
  const labelWidth = Math.max(...sx.ticks.map((v) => xText(v).length)) * 7 + 12;
  const every = Math.ceil((labelWidth * sx.ticks.length) / (plot.x1 - plot.x0));
  const xTicks = sx.ticks
    .map((v, i) => {
      if (i % every) return "";
      const anchor =
        i === 0 ? "start" : i === sx.ticks.length - 1 ? "end" : "middle";
      return `<text class="tick" x="${x(v)}" y="${plot.y0 + 18}" text-anchor="${anchor}">${xText(v)}</text>`;
    })
    .join("");
  const trend = linearRegression(points);
  const trendLine = trend
    ? `<line class="trend" x1="${x(sx.lo)}" x2="${x(sx.hi)}" y1="${y(trend.a + trend.b * sx.lo)}" y2="${y(trend.a + trend.b * sx.hi)}"></line>`
    : "";

  setTips(
    id,
    points.map((p) => ({
      title: p.label,
      rows: [
        { label: xLabel, value: `${fmt(p.x, 1)} ${xUnit}`, color: "--accent" },
        { label: yLabel, value: `${fmt(p.y, 1)} ${yUnit}`, color: "--accent" },
      ],
    })),
  );

  el.innerHTML = svg(
    w,
    h,
    `<defs><clipPath id="${id}-clip"><rect x="${plot.x0}" y="${plot.y1}" width="${plot.x1 - plot.x0}" height="${plot.y0 - plot.y1}"></rect></clipPath></defs>` +
      gridHtml(plot, sy, y) +
      xTicks +
      `<g clip-path="url(#${id}-clip)">${trendLine}</g>` +
      points
        .map(
          (
            p,
            i,
          ) => `<circle class="dot" cx="${x(p.x)}" cy="${y(p.y)}" r="4" style="fill:var(--accent)"></circle>
            <circle class="hit" data-tip="${id}:${i}" cx="${x(p.x)}" cy="${y(p.y)}" r="12"></circle>`,
        )
        .join("") +
      `<text class="axis-label" x="${plot.x1}" y="${h - 2}" text-anchor="end">${clean(xLabel)}</text>` +
      `<text class="axis-label" x="${plot.x0}" y="${plot.y1 - 2}" text-anchor="start">${clean(yLabel)}</text>`,
  );
};

const renderHeatmap = (id, matrix, max) => {
  if (!max) return empty(id);
  const el = $(id);
  const w = Math.max(260, el.clientWidth || 320);
  const left = 36;
  const cell = (w - left - 4) / 24;
  const ch = 18;
  const h = 7 * (ch + 2) + 20;

  const cells = matrix
    .map((row, d) =>
      row
        .map((v, hr) => {
          const alpha = v ? Math.max(0.12, v / max) : 0;
          return `<rect class="cell ${v ? "" : "zero"}" x="${left + hr * cell}" y="${d * (ch + 2)}" width="${cell - 2}" height="${ch}" rx="2"
            style="${v ? `fill:var(--accent);fill-opacity:${alpha}` : ""}" data-tip="${id}:${d * 24 + hr}"></rect>`;
        })
        .join(""),
    )
    .join("");

  const rows = S.wds
    .map(
      (w, d) =>
        `<text class="tick" x="${left - 6}" y="${d * (ch + 2) + 13}" text-anchor="end">${w}</text>`,
    )
    .join("");
  const cols = [0, 6, 12, 18]
    .map(
      (hr) =>
        `<text class="tick" x="${left + hr * cell}" y="${h - 4}" text-anchor="start">${hr}</text>`,
    )
    .join("");

  setTips(
    id,
    matrix.flatMap((row, d) =>
      row.map((v, hr) => ({
        title: `${S.wds[d]} ${pad(hr)}:00`,
        rows: [
          {
            label: S.kcal,
            value: `${fmt(v)} ${S.kcalUnit}`,
            color: "--accent",
          },
        ],
      })),
    ),
  );

  el.innerHTML = svg(w, h, cells + rows + cols);
};

const renderRadar = (id, axes, values) => {
  if (!values.some((v) => v > 0)) return empty(id);
  const el = $(id);
  const w = Math.max(260, el.clientWidth || 320);
  const h = 300;
  const cx = w / 2,
    cy = h / 2;
  const R = Math.min(w, h) / 2 - 36;
  const MAX = 150;
  const n = axes.length;
  const point = (i, v, extra = 0) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    const r = (R * Math.min(MAX, v)) / MAX + extra;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const ring = (v) => axes.map((_, i) => point(i, v).join(",")).join(" ");

  const grid =
    [50, 150]
      .map((v) => `<polygon class="grid-poly" points="${ring(v)}"></polygon>`)
      .join("") +
    `<polygon class="normal-poly" points="${ring(100)}"></polygon>` +
    axes
      .map((_, i) => {
        const [x, y] = point(i, MAX);
        return `<line class="grid" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}"></line>`;
      })
      .join("");

  const labels = axes
    .map((label, i) => {
      const [x, y] = point(i, MAX, 18);
      const anchor = Math.abs(x - cx) < 4 ? "middle" : x > cx ? "start" : "end";
      return `<text class="tick" x="${x}" y="${y + 4}" text-anchor="${anchor}">${clean(label)}</text>`;
    })
    .join("");

  const shape =
    `<polygon class="radar-shape" points="${values.map((v, i) => point(i, v || 0).join(",")).join(" ")}"></polygon>` +
    values
      .map((v, i) => {
        const [x, y] = point(i, v || 0);
        return `<circle class="dot" cx="${x}" cy="${y}" r="4" style="fill:var(--accent)"></circle>
                <circle class="hit" data-tip="${id}:${i}" cx="${x}" cy="${y}" r="12"></circle>`;
      })
      .join("");

  setTips(
    id,
    axes.map((label, i) => ({
      title: label,
      rows: [
        {
          label: S.normPercent,
          value: values[i] == null ? "—" : `${fmt(values[i])}%`,
          color: "--accent",
        },
      ],
    })),
  );

  el.innerHTML = svg(w, h, grid + labels + shape);
};

/* --- Подсказка --- */

const showTip = (target, x, y) => {
  const [id, i] = target.dataset.tip.split(":");
  const tip = chartTips.get(id)?.[+i];
  if (!tip) return;
  chartTip.replaceChildren();
  const title = document.createElement("div");
  title.className = "tip-title";
  title.textContent = tip.title;
  chartTip.appendChild(title);
  tip.rows.forEach((r) => {
    const row = document.createElement("div");
    row.className = "tip-row";
    const key = document.createElement("i");
    key.style.setProperty("--color", `var(${r.color})`);
    const value = document.createElement("b");
    value.textContent = r.value;
    const label = document.createElement("span");
    label.textContent = r.label;
    row.append(key, value, label);
    chartTip.appendChild(row);
  });
  chartTip.hidden = false;
  const rect = chartTip.getBoundingClientRect();
  chartTip.style.left = `${Math.min(window.innerWidth - rect.width - 8, Math.max(8, x - rect.width / 2))}px`;
  chartTip.style.top = `${Math.max(8, y - rect.height - 16)}px`;
  document
    .querySelectorAll(".hovered")
    .forEach((el) => el.classList.remove("hovered"));
  target.classList.add("hovered");
};

const hideTip = () => {
  chartTip.hidden = true;
  document
    .querySelectorAll(".hovered")
    .forEach((el) => el.classList.remove("hovered"));
};

pages.stats.addEventListener("pointerover", (e) => {
  const target = e.target.closest("[data-tip]");
  if (target) showTip(target, e.clientX, e.clientY);
});
pages.stats.addEventListener("pointerout", (e) => {
  if (e.target.closest("[data-tip]") && e.pointerType === "mouse") hideTip();
});
pages.stats.addEventListener("pointerdown", (e) => {
  if (!e.target.closest("[data-tip]")) hideTip();
});
window.addEventListener("scroll", hideTip, { passive: true });

// ==========================================================================
// 26. СТАТИСТИКА: 15 ГРАФИКОВ
// ==========================================================================

const setChartValue = (id, text) => {
  const el = $(id).closest(".card").querySelector(".value");
  if (el) el.textContent = text ? `— ${text}` : "";
};

const average = (values) => {
  const list = values.filter((v) => v != null);
  return list.length ? list.reduce((a, v) => a + v, 0) / list.length : null;
};

const MACRO_COLORS = { protein: "--c1", fat: "--c2", carbs: "--c3" };
const MEAL_COLORS = {
  breakfast: "--c1",
  lunch: "--c2",
  dinner: "--c3",
  snack: "--c4",
};
const NUTRIENT_CHARTS = ["fiber", "sugar", "salt", "satFat"];

const renderStats = () => {
  hideTip();
  const [start, end] = getRange(currentDate, period);
  const buckets = getBuckets(start, end, period);
  const sums = buckets.map(aggregate);
  const g = person.goals;
  const days = pastDays(start, end);
  const logged = days.filter((d) => dayMeals(getDate(d)).length);
  const rangeMeals = meals.filter(
    (m) => m.eaten >= start && m.eaten < end && m.eaten <= Date.now(),
  );
  const field = (k) => sums.map((s) => s?.[k] ?? null);
  const showNormal = period !== DAY;
  const dayBuckets =
    period === DAY ? [{ label: getDateText(start), start, end }] : buckets;

  /* 1. Калории */
  const kcal =
    period === DAY ? cumulative(field("kcal"), buckets) : field("kcal");
  const kcalSeries = [{ values: kcal, color: "--accent", label: S.fact }];
  if (period === WEEK) {
    kcalSeries.push({
      label: S.avg7,
      color: "--c2",
      thin: true,
      values: buckets.map((b) =>
        b.start > new Date()
          ? null
          : average(
              pastDays(addDays(b.start, -6), b.end).map((d) =>
                dayMeals(getDate(d)).length ? daySum(getDate(d)).kcal : null,
              ),
            ),
      ),
    });
  }
  renderLine("kcal-chart", buckets, kcalSeries, {
    normal: g.kcal,
    unit: S.kcalUnit,
  });
  setChartValue(
    "kcal-chart",
    logged.length
      ? `${fmt(average(logged.map((d) => daySum(getDate(d)).kcal)))} ${S.kcalUnit}/${S.dayShort}`
      : "",
  );

  /* 2. БЖУ */
  renderStacked("macros-chart", buckets, ["protein", "fat", "carbs"], sums, {
    normal: showNormal ? g.protein + g.fat + g.carbs : null,
    colors: MACRO_COLORS,
    labels: { protein: S.protein, fat: S.fat, carbs: S.carbs },
    unit: S.g,
  });

  /* 3. Баланс */
  const daySums = dayBuckets.map(aggregateDays);
  renderVBars(
    "balance-chart",
    dayBuckets,
    [
      {
        label: S.kcalDeviation,
        values: daySums.map((s) => (s ? s.kcal - g.kcal : null)),
        color: (v) => (v > 0 ? "--c4" : "--c2"),
      },
      {
        label: S.macroImbalance,
        values: daySums.map((s) =>
          s
            ? Object.entries(KCAL_PER_GRAM).reduce(
                (acc, [k, f]) => acc + Math.abs(s[k] - g[k]) * f,
                0,
              )
            : null,
        ),
        color: "--c1",
      },
    ],
    {
      unit: S.kcalUnit,
      legend: [
        { label: S.kcalOver, color: "--c4" },
        { label: S.kcalUnder, color: "--c2" },
        { label: S.macroImbalance, color: "--c1" },
      ],
    },
  );

  /* 4. По приемам пищи */
  renderStacked("mealtype-chart", buckets, MEAL_TYPES, sums, {
    colors: MEAL_COLORS,
    labels: S.mealTypes,
    unit: S.kcalUnit,
  });

  /* 5. Вода */
  const water = buckets.map(aggregateWater);
  renderLine(
    "water-chart",
    buckets,
    [
      {
        values: period === DAY ? cumulative(water, buckets) : water,
        color: "--blue",
        label: S.water,
      },
    ],
    { normal: g.water, unit: S.ml },
  );

  /* 6. Калории по тегам */
  const tagKcal = new Map();
  rangeMeals.forEach((m) => {
    const k = sumItems(m.items).kcal;
    m.tags.forEach((t) => tagKcal.set(t, (tagKcal.get(t) || 0) + k));
  });
  renderHList(
    "tags-kcal-chart",
    [...tagKcal.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([label, value]) => ({
        label,
        value,
        text: `${fmt(value)} ${S.kcalUnit}`,
      })),
  );

  /* 7. Дни недели */
  const weekdays = S.wds.map((label, i) => {
    const list = logged
      .filter((d) => weekdayIndex(d) === i)
      .map((d) => daySummaryOf(dayMeals(getDate(d))));
    return {
      label,
      count: average(list.map((s) => s.count)),
      kcal: average(list.map((s) => s.kcal)),
    };
  });
  renderVBars(
    "weekday-count",
    weekdays,
    [
      {
        values: weekdays.map((d) => d.count),
        color: "--c2",
        label: S.mealsCount,
      },
    ],
    { decimals: 1, height: 140 },
  );
  renderVBars(
    "weekday-kcal",
    weekdays,
    [{ values: weekdays.map((d) => d.kcal), color: "--accent", label: S.kcal }],
    { unit: S.kcalUnit, height: 140 },
  );

  /* 8. Полезность */
  const allItems = rangeMeals.flatMap((m) => m.items);
  const healthAvg = sumItems(allItems).healthScore;
  renderLine(
    "health-chart",
    buckets,
    [{ values: field("health"), color: "--health-high", label: S.healthScore }],
    { normal: healthAvg, normalLabel: S.average, unit: "" },
  );
  setChartValue("health-chart", healthAvg == null ? "" : fmt(healthAvg));

  /* 9. Приверженность */
  const fromDay = logged.length ? Math.min(...[...getDayIndex().keys()]) : null;
  const counted = days.filter((d) => fromDay != null && getDate(d) >= fromDay);
  const streak = getStreaks();
  renderKPI(
    "streak-chart",
    counted.length
      ? `${fmt((counted.filter((d) => inNorm(getDate(d))).length / counted.length) * 100)}%`
      : null,
    S.daysInNorm,
    S.streakText(streak.current, streak.best),
  );

  /* 10. Клетчатка, сахар, соль, насыщенные жиры */
  NUTRIENT_CHARTS.forEach((k) => {
    const pct = nutrientMode === "pct";
    const values = field(k).map((v) =>
      v == null ? null : pct ? (v / g[k]) * 100 : v,
    );
    renderVBars(
      `nutrient-${k}`,
      buckets,
      [{ values, color: "--c2", label: S[k] }],
      {
        normal: showNormal ? (pct ? 100 : g[k]) : null,
        unit: pct ? "%" : S.g,
        decimals: pct ? 0 : 1,
        height: 120,
      },
    );
  });

  /* 11. Вес */
  const weights = buckets.map((b) => {
    if (period === DAY)
      return average(
        log.weight
          .filter((e) => e.date >= b.start && e.date < b.end)
          .map((e) => e.weight),
      );
    return average(pastDays(b.start, b.end).map((d) => dayWeight(getDate(d))));
  });
  const weightPoints = weights
    .map((y, x) => ({ x, y }))
    .filter((p) => p.y != null);
  const trend = linearRegression(weightPoints);
  const [first, last] = [weightPoints[0]?.x, weightPoints.at(-1)?.x];
  renderLine(
    "weight-chart",
    buckets,
    [
      { values: weights, color: "--accent", label: S.weight },
      ...(trend
        ? [
            {
              values: buckets.map((_, i) =>
                i >= first && i <= last ? trend.a + trend.b * i : null,
              ),
              color: "--help",
              dash: true,
              thin: true,
              label: S.trend,
            },
          ]
        : []),
    ],
    { min: "auto", unit: S.kg, decimals: 1 },
  );
  const known = weights.filter((v) => v != null);
  setChartValue(
    "weight-chart",
    known.length >= 2
      ? `${known.at(-1) - known[0] > 0 ? "+" : ""}${fmt(known.at(-1) - known[0], 1)} ${S.kg}`
      : "",
  );

  /* 12. Вес и калории */
  renderScatter(
    "weight-kcal-scatter",
    days
      .map((d) => {
        const w = dayWeight(getDate(d));
        const k = getDate(addDays(d, -lag));
        if (w == null || !dayMeals(k).length) return null;
        return { x: daySum(k).kcal, y: w, label: getDateText(d) };
      })
      .filter(Boolean),
    { xLabel: S.kcal, yLabel: S.weight, xUnit: S.kcalUnit, yUnit: S.kg },
  );

  /* 13. Триггеры */
  renderScatter(
    "trigger-scatter",
    days
      .map((d) => {
        const key = getDate(d);
        const xv = triggerX === "sleep" ? daySleep(key) : daySteps(key);
        if (xv == null || !dayMeals(key).length) return null;
        const s = daySum(key);
        return {
          x: xv,
          y: triggerY === "kcal" ? s.kcal : s.sugar,
          label: getDateText(d),
        };
      })
      .filter(Boolean),
    {
      xLabel: triggerX === "sleep" ? S.sleepHours : S.steps,
      yLabel: triggerY === "kcal" ? S.kcal : S.sugar,
      xUnit: triggerX === "sleep" ? S.h : "",
      yUnit: triggerY === "kcal" ? S.kcalUnit : S.g,
    },
  );

  /* 14. Часы × дни */
  const matrix = Array.from({ length: 7 }, () => Array(24).fill(0));
  rangeMeals.forEach((m) => {
    const d = new Date(m.eaten);
    matrix[weekdayIndex(d)][d.getHours()] += sumItems(m.items).kcal;
  });
  renderHeatmap("hour-heatmap", matrix, Math.max(...matrix.flat()));

  /* 15. Микронутриенты */
  const micro = Object.fromEntries(
    MICRO_KEYS.map((k) => {
      const values = logged
        .map((d) => daySum(getDate(d)).micro[k])
        .filter((v) => v != null);
      return [
        k,
        values.length
          ? (values.reduce((a, v) => a + v, 0) /
              logged.length /
              MICRO_NORMALS[k]) *
            100
          : null,
      ];
    }),
  );
  if (microMode === "radar") {
    renderRadar(
      "micro-chart",
      MICRO_KEYS.map((k) => S[k]),
      MICRO_KEYS.map((k) => micro[k]),
    );
  } else if (!logged.length) {
    empty("micro-chart");
  } else {
    $("micro-chart").innerHTML =
      `<div class="h-list">${microBarsHtml(MICRO_KEYS.map((k) => ({ label: S[k], value: micro[k] })))}</div>`;
  }
};

/* --- Переключатели --- */

rangeArea.addEventListener("click", (e) => {
  const button = e.target.closest("button");
  if (!button) return;
  shiftRange(+button.dataset.add);
  renderStats();
});

let activePeriod = null;

periodArea.onclick = (e) => {
  const button = e.target.closest("button");
  if (!button || button === activePeriod) return;

  activePeriod.classList.remove("active");
  activePeriod = button;
  activePeriod.classList.add("active");
  periodArea.firstElementChild.style.transform = `translateX(${activePeriod.dataset.i * 100}%)`;

  period = +button.dataset.i;
  currentDate = new Date();
  renderRange();
  renderStats();
};

onSegment($("nutrient-mode"), "mode", (v) => {
  nutrientMode = v;
  renderStats();
});
onSegment($("lag"), "lag", (v) => {
  lag = +v;
  renderStats();
});
onSegment($("trigger-x"), "x", (v) => {
  triggerX = v;
  renderStats();
});
onSegment($("trigger-y"), "y", (v) => {
  triggerY = v;
  renderStats();
});
onSegment($("micro-mode"), "mode", (v) => {
  microMode = v;
  renderStats();
});

let lastWidth = window.innerWidth;
window.addEventListener(
  "resize",
  debounce(() => {
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    if (page === pages.stats) renderStats();
  }, 200),
);

// ==========================================================================
// 27. ИНИЦИАЛИЗАЦИЯ
// ==========================================================================

document.querySelectorAll("input:not([type=file])").forEach((input) => {
  input.setAttribute("readonly", "true");
  input.addEventListener("focus", () => input.removeAttribute("readonly"));
});

(() => {
  setLanguage();
  migrate();
  prepareRefs();
  loadAll();

  page = pages.diary;
  link = navLinks.diary;
  activePeriod = periodArea.querySelector(".active");

  renderDiary();

  openPhotoStore().then((db) => {
    if (!db) return;
    gcPhotos();
    syncPhotos();
  });
  window.addEventListener("online", syncPhotos);

  // today заморожен при загрузке: обновляем при возврате на вкладку (смена суток)
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    const now = new Date();
    if (getDate(now) === getDate(today)) return;
    today = now;
    calendarPages = {};
    if (page === pages.diary) renderDiary();
  });
})();
