// Тесты чистой логики Food Diary. Запуск: node tests/logic.test.mjs
// foods.js, data.js и script.js загружаются в node:vm как в браузере; DOM заменен заглушкой.

import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = name => fs.readFileSync(path.join(root, name), 'utf8');

/* --- DOM-заглушка: любое свойство — снова заглушка, записанные значения читаются обратно --- */

const makeStub = () => {
    const values = new Map();
    const target = function () {
    };
    return new Proxy(target, {
        get(_, prop) {
            if (prop === Symbol.toPrimitive) return () => '';
            if (prop === Symbol.iterator) return function* () {
            };
            if (prop === 'then') return undefined;
            if (!values.has(prop)) values.set(prop, makeStub());
            return values.get(prop);
        },
        set(_, prop, value) {
            values.set(prop, value);
            return true;
        },
        apply: () => makeStub(),
        construct: () => makeStub()
    });
};

const storage = new Map();
const context = {
    console, setTimeout, clearTimeout, structuredClone, URL, Blob,
    document: makeStub(),
    navigator: {language: 'ru-RU', onLine: false},
    localStorage: {
        getItem: k => storage.has(k) ? storage.get(k) : null,
        setItem: (k, v) => storage.set(k, String(v)),
        removeItem: k => storage.delete(k)
    },
    scrollTo() {
    },
    addEventListener() {
    },
    innerWidth: 400
};
context.window = context;
vm.createContext(context);

let initError = null;
for (const file of ['foods.js', 'data.js', 'script.js']) {
    try {
        vm.runInContext(source(file), context, {filename: file});
    } catch (e) {
        if (file !== 'script.js') throw e;
        initError = e;
    }
}

const run = code => {
    const json = vm.runInContext(`JSON.stringify(${code})`, context);
    return json === undefined ? undefined : JSON.parse(json);
};

/* --- Мини-раннер --- */

let passed = 0;
const failed = [];
const test = (name, fn) => {
    try {
        fn();
        passed++;
    } catch (e) {
        failed.push(name);
        console.log(`✗ ${name}\n  ${e.message.split('\n').join('\n  ')}`);
    }
};

/* --- Загрузка и данные --- */

test('script.js инициализируется без ошибок', () => {
    assert.equal(initError, null, initError?.stack);
});

test('ключи ru и en совпадают', () => {
    const keys = (o, prefix = '') => Object.entries(o).flatMap(([k, v]) =>
        v && typeof v === 'object' && !Array.isArray(v) ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]).sort();
    const {ru, en} = context.TRANSLATIONS;
    assert.deepEqual(keys(ru), keys(en));
});

test('все data-i18n ключи из index.html есть в обоих языках', () => {
    const html = source('index.html');
    const used = [...html.matchAll(/data-i18n(?:-placeholder|-aria-label|-title)?="([^"]+)"/g)].map(m => m[1]);
    for (const lang of ['ru', 'en']) {
        for (const key of used) {
            const value = key.split('.').reduce((o, k) => o?.[k], context.TRANSLATIONS[lang]);
            assert.equal(typeof value, 'string', `${lang}: ${key}`);
        }
    }
});

test('все $(id) из script.js существуют в index.html и id не повторяются', () => {
    const html = source('index.html');
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    assert.deepEqual(dupes, []);
    const used = [...source('script.js').matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]);
    const missing = [...new Set(used)].filter(id => !ids.includes(id));
    assert.deepEqual(missing, []);
});

test('в script.js нет русских строк вне словаря парсера', () => {
    let code = source('script.js');
    const from = code.indexOf('// 6. ПРОДУКТЫ И ПОИСК');
    const to = code.indexOf('// 8. ЧИСЛОВЫЕ МАСКИ');
    code = code.slice(0, from) + code.slice(to);
    code = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
    const lines = code.split('\n').filter(l => /[а-яё]/i.test(l) && !l.includes('console.warn'));
    assert.deepEqual(lines, []);
});

test('REFS: уникальные ID < 1 000 000, корректные КБЖУ', () => {
    const refs = run('REFS');
    assert.ok(refs.length >= 100, `всего ${refs.length}`);
    const ids = refs.map(f => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const f of refs) {
        const n = f.nutrition;
assert.ok(f.id > 0 && f.id < 1000000, f.ru);
        assert.ok(['product', 'dish'].includes(f.kind), f.ru);
        assert.ok(f.en && f.aliases.length && f.servingGrams > 0, f.ru);
        assert.equal(Object.keys(f.micro).length, 13, f.ru);
        assert.ok(n.protein + n.fat + n.carbs <= 100.5, `${f.ru}: Б+Ж+У > 100`);
        assert.ok(n.sugar <= n.carbs + 0.01 && n.satFat <= n.fat + 0.01 && n.fiber <= n.carbs + 0.01, `${f.ru}: части больше целого`);
        const energy = 4 * n.protein + 9 * n.fat + 4 * n.carbs;
        // Алкоголь даёт калории сверх БЖУ: kcal выше расчетной — норма
        assert.ok(Math.abs(energy - n.kcal) <= Math.max(25, n.kcal * 0.2) || n.kcal > energy, `${f.ru}: ${n.kcal} ккал vs ${energy.toFixed(0)} по БЖУ`);
        assert.ok(Number.isInteger(f.healthScore) && f.healthScore >= 0 && f.healthScore <= 100, f.ru);
    }
});

/* --- Утилиты --- */

test('getDate возвращает настоящий YYYYMMDD', () => {
    assert.equal(run('getDate(new Date(2026, 0, 5))'), 20260105);
    assert.equal(run('getDate(new Date(2026, 11, 31, 23, 59))'), 20261231);
});

test('autoType по часам', () => {
    const at = h => run(`autoType(new Date(2026, 9, 9, ${h}, 30).getTime())`);
    assert.deepEqual([4, 5, 10, 11, 15, 16, 20, 21, 23].map(at),
        [0, 1, 1, 2, 2, 3, 3, 0, 0]);
});

test('normalizeNumber', () => {
    const n = (v, max, d) => run(`normalizeNumber(${JSON.stringify(v)}, ${max}, ${d})`);
    assert.equal(n('12,345', 500, 1), '12,3');
    assert.equal(n('600', 500, 0), '60');
    assert.equal(n('0005', 100, 0), '5');
    assert.equal(n('1.2.3', 100, 1), '1,2');
    assert.equal(n('70.5', 500, 0), '70');
    assert.equal(n('abc', 500, 1), '');
});

test('nextFoodId: пользовательский диапазон', () => {
    assert.equal(run('nextFoodId()'), 1000000);
    vm.runInContext('foods = [{id: 1000003}, {id: 1000001}]', context);
    assert.equal(run('nextFoodId()'), 1000004);
    vm.runInContext('foods = []', context);
});

test('nextPhotoId растет и не пересекается с food ID', () => {
    const [a, b] = run('[nextPhotoId(), nextPhotoId()]');
    assert.ok(a >= 1e12 && b > a);
});

/* --- Поиск --- */

test('normalizeWord сводит словоформы', () => {
    const w = s => run(`normalizeWord(${JSON.stringify(s)})`);
    assert.equal(w('гречка'), w('гречки'));
    assert.equal(w('гречка'), w('гречку'));
    assert.equal(w('молоко'), w('молоком'));
    assert.equal(w('яйцо'), w('яйца'));
    assert.equal(w('банан'), w('бананов'));
    assert.equal(w('сыр'), 'сыр');
    assert.equal(w('Ёжик'), w('ежики'));
    assert.equal(w('bananas'), 'banana');
    assert.equal(w('tomatoes'), 'tomato');
    assert.equal(w('apples'), w('apple'));
});

test('matchFood: уверенность по таблице', () => {
    const m = q => run(`(r => r && [r.food.id, r.confidence])(matchFood(${JSON.stringify(q)}))`);
    assert.deepEqual(m('Гречка отварная'), [1, 1]);
    assert.deepEqual(m('гречка отварная'), [1, 0.9]);
    assert.deepEqual(m('гречки'), [1, 0.9]);
    assert.deepEqual(m('гречкаа'), [1, 0.7]);
    assert.deepEqual(m('чечев'), [33, 0.5]);
    assert.deepEqual(m('сыр'), [75, 1]);
    assert.deepEqual(m('сок'), [134, 1]);
    assert.deepEqual(m('banana'), [41, 1]);
    assert.equal(m('абракадабра'), null);
});

test('matchFood: короткие слова не путаются', () => {
    const m = q => run(`(r => r && r.food.id)(matchFood(${JSON.stringify(q)}))`);
    assert.notEqual(m('сыр'), 134);
    assert.equal(m('сор'), null);
    assert.equal(m('сырр'), 75);
});

/* --- Парсер --- */

const parse = text => run(`parseMeal(${JSON.stringify(text)}).map(i => [i.foodId, i.grams, i.source, i.confidence])`);

test('парсер: «гречка 200г» и «200 г гречки»', () => {
    assert.deepEqual(parse('гречка 200г'), [[1, 200, 'parse', 1]]);
    assert.deepEqual(parse('200 г гречки'), [[1, 200, 'parse', 0.9]]);
});

test('парсер: кг, стакан, ложки, штуки, ч.л.', () => {
    assert.deepEqual(parse('0.2кг риса').map(i => i.slice(0, 2)), [[2, 200]]);
    assert.deepEqual(parse('стакан молока').map(i => i.slice(0, 2)), [[70, 200]]);
    assert.deepEqual(parse('2 ложки сахара').map(i => i.slice(0, 2)), [[114, 30]]);
    assert.deepEqual(parse('2 яйца').map(i => i.slice(0, 2)), [[80, 110]]);
    assert.deepEqual(parse('яйцо 2 шт').map(i => i.slice(0, 2)), [[80, 110]]);
    assert.deepEqual(parse('ч.л. сахара').map(i => i.slice(0, 2)), [[114, 5]]);
    assert.deepEqual(parse('1,5 л кефира').map(i => i.slice(0, 2)), [[71, 1500]]);
});

test('парсер: десятичная запятая не делит фрагмент', () => {
    assert.deepEqual(parse('50,5 г сыра').map(i => i.slice(0, 2)), [[75, 51]]);
    assert.deepEqual(parse('сыр 50.5 г').map(i => i.slice(0, 2)), [[75, 51]]);
});

test('парсер: разделители , и с +', () => {
    assert.deepEqual(parse('кофе с молоком, банан').map(i => i.slice(0, 2)), [[131, 250], [41, 120]]);
    assert.deepEqual(parse('гречка 200 г и котлета').map(i => i[0]), [1, 155]);
    assert.deepEqual(parse('хлеб + масло сливочное').map(i => i[0]), [6, 77]);
    assert.deepEqual(parse('чай; яблоко').map(i => i[0]), [133, 40]);
});

test('парсер: без количества — порция продукта', () => {
    assert.deepEqual(parse('борщ').map(i => i.slice(0, 2)), [[150, 300]]);
});

test('парсер: не найдено → foodId null, confidence 0.3', () => {
    const [item] = run('parseMeal("абракадабра 150 г")');
    assert.equal(item.foodId, null);
    assert.equal(item.nutrition, null);
    assert.equal(item.confidence, 0.3);
    assert.equal(item.grams, 150);
    assert.equal(item.name, 'Абракадабра');
    assert.equal(run('isProblem(parseMeal("абракадабра")[0])'), true);
});

test('парсер: английский ввод', () => {
    assert.deepEqual(parse('2 eggs, coffee').map(i => i.slice(0, 2)), [[80, 110], [130, 200]]);
    assert.deepEqual(parse('rice 150 g').map(i => i.slice(0, 2)), [[2, 150]]);
});

test('парсер: снимок nutrition и fragment', () => {
    const [item] = run('parseMeal("Банан")');
    assert.equal(item.fragment, 'банан');
    assert.equal(item.nutrition.kcal, 89);
    assert.ok(item.micro && item.healthScore != null);
});

/* --- Расчеты --- */

test('computeHealth: калибровка шкалы', () => {
    const h = id => run(`REFS.find(f => f.id === ${id}).healthScore`);
    const scores = {
        chocolate: h(116), cake: h(119), chips: h(123), pizza: h(162), cola: h(136), bread: h(6),
        apple: h(40), buckwheat: h(1), oatmeal: h(3), salmon: h(100), chicken: h(90), broccoli: h(20)
    };
    console.log('  healthScore:', JSON.stringify(scores));
    assert.ok(scores.chocolate <= 10 && scores.cake <= 10);
    assert.ok(scores.chips < 45 && scores.pizza < 45 && scores.cola < 45);
    assert.ok(scores.apple > scores.chips && scores.apple >= 50);
    assert.ok(scores.broccoli >= 75 && scores.chicken >= 70 && scores.salmon >= 70);
    assert.ok(scores.buckwheat > scores.bread);
});

test('computeGoals: Миффлин-Сан Жеор', () => {
    const g = run('computeGoals({sex: true, age: 30, height: 175, weight: 70, activity: 1.375, weightGoal: "maintain"})');
    assert.ok(Math.abs(g.kcal - 2267.03) < 0.1);
    assert.equal(g.protein, 112);
    assert.ok(Math.abs(g.fat - 2267.03 * 0.3 / 9) < 0.01);
    assert.ok(Math.abs(g.carbs - (g.kcal - 448 - g.fat * 9) / 4) < 0.01);
    assert.equal(g.water, 2100);
    const low = run('computeGoals({sex: false, age: 80, height: 150, weight: 40, activity: 1.2, weightGoal: "lose"})');
    assert.equal(low.kcal, 1200);
    assert.ok(low.carbs >= 0);
});

test('getAge из YYYYMMDD', () => {
    const now = new Date();
    const y = now.getFullYear();
    assert.equal(run(`getAge(${(y - 20) * 10000 + 101})`), 20);
    assert.equal(run('getAge(null)'), 30);
});

test('sumItems: суммы и полезность, взвешенная по ккал', () => {
    const s = run(`sumItems([
        {grams: 200, nutrition: {kcal: 100, protein: 10, fat: 0, carbs: 0, fiber: 0, sugar: 0, salt: 0, satFat: 0}, micro: {vitaminC: 10}, healthScore: 80},
        {grams: 100, nutrition: {kcal: 200, protein: 0, fat: 10, carbs: 0, fiber: 0, sugar: 0, salt: 0, satFat: 0}, micro: null, healthScore: 20},
        {grams: 50, nutrition: null, micro: null, healthScore: null}
    ])`);
    assert.equal(s.grams, 350);
    assert.equal(s.kcal, 400);
    assert.equal(s.protein, 20);
    assert.equal(s.micro.vitaminC, 20);
    assert.equal(s.micro.iron, null);
    assert.equal(s.healthScore, 50);
});

test('computeFromIngredients: КБЖУ на 100 г от выхода', () => {
    const r = run('computeFromIngredients([{foodId: 1, grams: 100}, {foodId: 77, grams: 10}], 220)');
    assert.equal(r.grams, 110);
    assert.ok(Math.abs(r.nutrition.kcal - 163.7 / 220 * 100) < 0.01);
    // totals — абсолютные суммы: 92 ккал гречки + 71.7 сливочного масла (10 г)
    assert.ok(Math.abs(r.totals.kcal - 163.7) < 0.01);
    const raw = run('computeFromIngredients([{foodId: 1, grams: 100}, {foodId: 77, grams: 10}], null)');
    assert.ok(Math.abs(raw.nutrition.kcal - 163.7 / 110 * 100) < 0.01);
});

test('morningWeight: последнее до 12:00, иначе первое', () => {
    const t = (h, w) => `{date: new Date(2026, 9, 9, ${h}).getTime(), weight: ${w}}`;
    assert.equal(run(`morningWeight([${t(7, 70)}, ${t(9, 70.5)}, ${t(20, 71)}]).weight`), 70.5);
    assert.equal(run(`morningWeight([${t(20, 71)}, ${t(15, 72)}]).weight`), 72);
});

test('linearRegression', () => {
    assert.deepEqual(run('linearRegression([{x: 0, y: 1}, {x: 1, y: 3}, {x: 2, y: 5}])'), {a: 1, b: 2});
    assert.equal(run('linearRegression([{x: 1, y: 1}])'), null);
});

test('getRange и getBuckets', () => {
    const r = (d, p) => run(`getRange(new Date(${d}), ${p}).map(getDate)`);
    assert.deepEqual(r('2026, 9, 8', 'DAY'), [20261008, 20261009]);
    assert.deepEqual(r('2026, 9, 8', 'WEEK'), [20261005, 20261012]);
    assert.deepEqual(r('2026, 9, 8', 'MONTH'), [20260928, 20261102]);
    const n = (d, p) => run(`(([s, e]) => getBuckets(s, e, ${p}).map(b => b.label))(getRange(new Date(${d}), ${p}))`);
    assert.deepEqual(n('2026, 9, 8', 'DAY'), ['0', '6', '12', '18']);
    assert.equal(n('2026, 9, 8', 'WEEK').length, 7);
    assert.deepEqual(n('2026, 9, 8', 'MONTH'), ['28', '5', '12', '19', '26']);
});

test('updateRecents: без дублей, новые первыми, <= 50', () => {
    vm.runInContext(`recents = Array.from({length: 50}, (_, i) => ({foodId: i + 1000, grams: 1, ts: 0}));
        updateRecents([{foodId: 1005, grams: 77}, {foodId: null, grams: 5}, {foodId: 1, grams: 100}])`, context);
    const recents = run('recents');
    assert.equal(recents.length, 50);
    assert.deepEqual(recents.slice(0, 2).map(r => [r.foodId, r.grams]), [[1, 100], [1005, 77]]);
    assert.equal(recents.filter(r => r.foodId === 1005).length, 1);
});

test('validImport отбрасывает чужие и новые файлы', () => {
    const base = `{app: 'food-diary', schemaVersion: 1, person: {}, meals: [], foods: [], weight: [], water: [], sleep: [], activity: [], tags: [], favorites: [], recents: []}`;
    assert.equal(run(`!!validImport(${base})`), true);
    assert.equal(run(`!!validImport({...${base}, app: 'other'})`), false);
    assert.equal(run(`!!validImport({...${base}, schemaVersion: 2})`), false);
    assert.equal(run(`!!validImport({...${base}, meals: [{created: 1}]})`), false);
    assert.equal(run('!!validImport(null)'), false);
});

console.log(`\n${passed} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
