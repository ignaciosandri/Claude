import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// logic.js es un script clásico (para abrir index.html sin servidor): se evalúa y se toma el global.
const L = new Function(readFileSync(new URL("../js/logic.js", import.meta.url), "utf8") + "\nreturn Logic;")();

const cats = [
  { id: "super", name: "Supermercado", icon: "🛒", type: "expense" },
  { id: "comida", name: "Comida", icon: "🍔", type: "expense" },
  { id: "sueldo", name: "Sueldo", icon: "💼", type: "income" },
];
const tx = (date, type, categoryId, amount, description = "", createdAt = 0) =>
  ({ id: L.uid(), date, type, categoryId, amount, description, method: "Débito", createdAt });

const txs = [
  tx("2026-09-01", "income", "sueldo", 1000),
  tx("2026-09-05", "expense", "super", 300),
  tx("2026-10-01", "income", "sueldo", 1000),
  tx("2026-10-02", "expense", "super", 200, "Compra semanal"),
  tx("2026-10-03", "expense", "comida", 100, "Pizza"),
];

test("addMonths cruza años en ambos sentidos", () => {
  assert.equal(L.addMonths("2026-12", 1), "2027-01");
  assert.equal(L.addMonths("2026-01", -1), "2025-12");
  assert.equal(L.addMonths("2026-05", -17), "2024-12");
});

test("daysInMonth contempla bisiestos", () => {
  assert.equal(L.daysInMonth("2028-02"), 29);
  assert.equal(L.daysInMonth("2026-02"), 28);
});

test("filterTransactions filtra por mes, tipo y texto, ordenado desc", () => {
  const oct = L.filterTransactions(txs, { month: "2026-10" });
  assert.deepEqual(oct.map((t) => t.date), ["2026-10-03", "2026-10-02", "2026-10-01"]);
  assert.equal(L.filterTransactions(txs, { type: "income" }).length, 2);
  assert.equal(L.filterTransactions(txs, { query: "pizz" })[0].amount, 100);
});

test("summarize calcula balance y tasa de ahorro", () => {
  const s = L.summarize(L.filterTransactions(txs, { month: "2026-10" }));
  assert.deepEqual(s, { income: 1000, expense: 300, balance: 700, savingsRate: 0.7 });
  assert.equal(L.summarize([]).savingsRate, null);
});

test("byCategory agrupa y ordena por total", () => {
  const rows = L.byCategory(L.filterTransactions(txs, { month: "2026-10" }), cats);
  assert.deepEqual(rows.map((r) => [r.category.id, r.total]), [["super", 200], ["comida", 100]]);
  assert.ok(Math.abs(rows[0].share - 2 / 3) < 1e-9);
});

test("monthlySeries devuelve N meses con ceros donde no hay datos", () => {
  const s = L.monthlySeries(txs, "2026-10", 3);
  assert.deepEqual(s, [
    { month: "2026-08", income: 0, expense: 0 },
    { month: "2026-09", income: 1000, expense: 300 },
    { month: "2026-10", income: 1000, expense: 300 },
  ]);
});

test("budgetStatus marca ok / warning / over", () => {
  const b = L.budgetStatus(txs, { super: 220, comida: 500, sueldo: 0 }, cats, "2026-10");
  assert.deepEqual(b.map((x) => [x.category.id, x.status]), [["super", "warning"], ["comida", "ok"]]);
  const over = L.budgetStatus(txs, { super: 150 }, cats, "2026-10");
  assert.equal(over[0].status, "over");
});

test("projectMonth extrapola sólo el gasto variable del mes en curso", () => {
  const month = [
    tx("2026-10-02", "expense", "super", 100),
    { ...tx("2026-10-01", "expense", "super", 500), recurringId: "r1" },
    tx("2026-10-01", "income", "sueldo", 9999),
  ];
  assert.equal(L.projectMonth(month, "2026-10", "2026-10-10"), 500 + 310);
  assert.equal(L.projectMonth(month, "2026-09", "2026-10-10"), null);
  assert.equal(L.projectMonth(month, "2026-10", "2026-10-03"), null);
});

test("generateRecurring completa meses pendientes y respeta el día", () => {
  const rec = [{ id: "r1", type: "expense", amount: 50, categoryId: "super", description: "Gym",
    method: "Débito", day: 31, startMonth: "2026-07", lastMonth: "2026-07" }];
  const { newTxs, recurring } = L.generateRecurring(rec, "2026-10-06");
  // Agosto (31) y septiembre (30, ajustado). Octubre todavía no venció.
  assert.deepEqual(newTxs.map((t) => t.date), ["2026-08-31", "2026-09-30"]);
  assert.equal(recurring[0].lastMonth, "2026-09");
  assert.equal(L.generateRecurring(recurring, "2026-10-06").newTxs.length, 0);
  assert.equal(L.generateRecurring(recurring, "2026-10-31").newTxs.length, 1);
});

test("CSV ida y vuelta con comas y comillas", () => {
  const data = [tx("2026-10-02", "expense", "super", 1234.5, 'Compra "grande", mensual')];
  const csv = L.toCSV(data, cats);
  const rows = L.parseCSV(csv);
  assert.deepEqual(rows[0], {
    date: "2026-10-02", type: "expense", categoryName: "Supermercado",
    description: 'Compra "grande", mensual', method: "Débito", amount: 1234.5,
  });
});

test("parseCSV rechaza filas inválidas", () => {
  assert.throws(() => L.parseCSV("fecha,monto\n02/10/2026,100"), /Fila 2/);
  assert.throws(() => L.parseCSV("foo,bar\n1,2"), /columnas/);
});

test("resolveImport reutiliza categorías existentes y crea las nuevas", () => {
  const rows = L.parseCSV("fecha,tipo,categoria,monto\n2026-10-01,gasto,supermercado,10\n2026-10-01,gasto,Mascotas,20");
  const { txs: out, newCategories } = L.resolveImport(rows, cats);
  assert.equal(out[0].categoryId, "super");
  assert.equal(newCategories.length, 1);
  assert.equal(newCategories[0].name, "Mascotas");
  assert.equal(out[1].categoryId, newCategories[0].id);
});

test("insights compara contra el mes anterior", () => {
  const ins = L.insights(txs, cats, "2026-10", "2026-10-31");
  // Mismo gasto que septiembre: no hay alerta de variación.
  assert.ok(!ins.some((i) => i.text.includes("mes anterior")));
  assert.ok(ins.some((i) => i.text.includes("Supermercado")));
  assert.ok(ins.some((i) => i.text.includes("70%")));
});

test("insights avisa cuando el gasto sube respecto del mes anterior", () => {
  const more = [...txs, tx("2026-10-04", "expense", "comida", 300)];
  const ins = L.insights(more, cats, "2026-10", "2026-10-31");
  assert.ok(ins.some((i) => i.kind === "up" && i.text.includes("100% más")));
});

test("buildInstallments reparte el total y ajusta el redondeo en la última cuota", () => {
  const base = { type: "expense", amount: 1000, categoryId: "super", description: "Heladera", method: "Crédito", date: "2026-11-30" };
  const cuotas = L.buildInstallments(base, 3);
  assert.deepEqual(cuotas.map((t) => t.amount), [333.33, 333.33, 333.34]);
  assert.deepEqual(cuotas.map((t) => t.date), ["2026-11-30", "2026-12-30", "2027-01-30"]);
  assert.deepEqual(cuotas.map((t) => `${t.plan.n}/${t.plan.of}`), ["1/3", "2/3", "3/3"]);
  assert.equal(new Set(cuotas.map((t) => t.plan.id)).size, 1);
  assert.equal(new Set(cuotas.map((t) => t.id)).size, 3);
  // Día 31 en meses más cortos.
  const feb = L.buildInstallments({ ...base, date: "2027-01-31" }, 2);
  assert.deepEqual(feb.map((t) => t.date), ["2027-01-31", "2027-02-28"]);
});

test("installmentPlans y upcomingInstallments miran sólo lo que falta pagar", () => {
  const base = { type: "expense", categoryId: "super", description: "Tele", method: "Crédito" };
  const a = L.buildInstallments({ ...base, amount: 600, date: "2026-09-10" }, 6);
  const b = L.buildInstallments({ ...base, amount: 300, date: "2026-07-01" }, 3); // ya terminada
  const all = [...a, ...b, ...txs];
  const plans = L.installmentPlans(all, "2026-10-07");
  assert.equal(plans.length, 1);
  assert.deepEqual(
    { paid: plans[0].paid, of: plans[0].of, remaining: plans[0].remaining, next: plans[0].next },
    { paid: 1, of: 6, remaining: 500, next: "2026-10-10" },
  );
  const up = L.upcomingInstallments(all, "2026-10-07", 4);
  assert.deepEqual(up.map((m) => [m.month, m.total]), [["2026-11", 100], ["2026-12", 100], ["2027-01", 100], ["2027-02", 100]]);
});

test("las cuotas cuentan como gasto fijo en la proyección y se marcan en el CSV", () => {
  const cuotas = L.buildInstallments({ type: "expense", amount: 300, categoryId: "super", description: "Tele", method: "Crédito", date: "2026-10-01" }, 3);
  assert.equal(L.projectMonth([cuotas[0]], "2026-10", "2026-10-10"), 100);
  assert.match(L.toCSV(cuotas, cats), /Tele \(cuota 2\/3\)/);
});
