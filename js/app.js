(function () {
"use strict";

const L = Logic;
const { load, save, defaultState, isValidBackup, PAYMENT_METHODS } = Store;
const { renderMonthlyChart, renderCategoryBars, monthLabel } = Charts;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let state = load();
const today = L.todayISO();
let month = L.monthKey(today);
let tab = "resumen";
let editingId = null;
const MAX_FUTURE_MONTHS = 24; // para ver cuotas que vienen

// ---------- helpers ----------

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function fmt(n) {
  return new Intl.NumberFormat(state.settings.locale, {
    style: "currency",
    currency: state.settings.currency,
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" });
}

const cat = (id) => state.categories.find((c) => c.id === id) || { name: "Sin categoría", icon: "❔" };

function persist() {
  if (!save(state)) toast("No se pudo guardar (¿almacenamiento lleno?)");
  render();
}

let toastTimer;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2600);
}

const tooltip = {
  show(e, html) {
    const el = $("#tooltip");
    el.innerHTML = html;
    el.hidden = false;
    const x = Math.min(e.clientX + 12, window.innerWidth - el.offsetWidth - 8);
    el.style.left = `${x}px`;
    el.style.top = `${e.clientY - el.offsetHeight - 10}px`;
  },
  hide() {
    $("#tooltip").hidden = true;
  },
};

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

function txItem(t, { showDate = false } = {}) {
  const c = cat(t.categoryId);
  const sign = t.type === "income" ? "+" : "−";
  return `
    <li class="tx" data-id="${t.id}" tabindex="0" role="button" aria-label="Editar ${esc(t.description || c.name)}">
      <span class="tx-icon">${c.icon}</span>
      <span class="tx-main">
        <span class="tx-desc">${esc(t.description || c.name)}${t.recurringId ? ' <span class="badge" title="Recurrente">↻</span>' : ""}${t.plan ? ` <span class="badge plan" title="Cuota ${t.plan.n} de ${t.plan.of}">${t.plan.n}/${t.plan.of}</span>` : ""}</span>
        <span class="tx-meta">${esc(c.name)}${t.method ? " · " + esc(t.method) : ""}${showDate ? " · " + fmtDate(t.date) : ""}</span>
      </span>
      <span class="tx-amount ${t.type}">${sign}${fmt(t.amount)}</span>
    </li>`;
}

// ---------- render ----------

function render() {
  applyTheme();
  $("#month-label").textContent = monthLabel(month, true);
  $("#next-month").disabled = month >= L.addMonths(L.monthKey(today), MAX_FUTURE_MONTHS);
  $$(".tabs [role=tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
  $$(".tab-panel").forEach((p) => (p.hidden = p.id !== `tab-${tab}`));
  ({ resumen: renderSummary, movimientos: renderTransactions, presupuestos: renderBudgets, ajustes: renderSettings })[tab]();
}

function renderSummary() {
  const monthTxs = L.filterTransactions(state.transactions, { month });
  const s = L.summarize(monthTxs);
  $("#kpi-income").textContent = fmt(s.income);
  $("#kpi-expense").textContent = fmt(s.expense);
  const bal = $("#kpi-balance");
  bal.textContent = fmt(s.balance);
  bal.className = s.balance < 0 ? "neg" : "";
  $("#kpi-savings").textContent = s.savingsRate === null ? "—" : `${Math.round(s.savingsRate * 100)}%`;
  const proj = L.projectMonth(monthTxs, month, today);
  $("#kpi-projection").textContent = proj ? `Proyección del mes: ${fmt(Math.round(proj))}` : "";

  const ins = L.insights(state.transactions, state.categories, month, today);
  const icon = { up: "▲", down: "▼", info: "●" };
  $("#insights").innerHTML = ins.map((i) => `<li class="${i.kind}"><span aria-hidden="true">${icon[i.kind]}</span> ${esc(i.text)}</li>`).join("");

  renderMonthlyChart($("#monthly-chart"), L.monthlySeries(state.transactions, month, 6), fmt, tooltip);
  renderCategoryBars($("#category-bars"), L.byCategory(monthTxs, state.categories), fmt, esc);

  renderInstallments();

  const recent = monthTxs.slice(0, 6);
  $("#recent-list").innerHTML = recent.length
    ? recent.map((t) => txItem(t, { showDate: true })).join("")
    : `<li class="empty">Sin movimientos en ${monthLabel(month, true)}. Tocá ＋ para cargar el primero.</li>`;
}

function renderInstallments() {
  const plans = L.installmentPlans(state.transactions, today);
  $("#installments-card").hidden = !plans.length;
  if (!plans.length) return;

  const totalPending = plans.reduce((a, p) => a + p.remaining, 0);
  $("#installments-total").textContent = `Total a pagar: ${fmt(totalPending)}`;

  const months = L.upcomingInstallments(state.transactions, today, 6);
  const max = Math.max(...months.map((m) => m.total), 1);
  $("#installments-months").innerHTML = months
    .map((m) => `<div class="cat-row">
        <span class="cat-name">${monthLabel(m.month)}</span>
        <span class="cat-track"><span class="cat-fill" style="width:${(m.total / max) * 100}%"></span></span>
        <span class="cat-value">${fmt(m.total)}</span>
      </div>`)
    .join("");

  $("#installments-plans").innerHTML = plans
    .map((p) => {
      const c = cat(p.categoryId);
      const next = state.transactions.find((t) => t.plan?.id === p.id && t.date === p.next);
      return `<li class="tx" data-id="${next.id}" tabindex="0" role="button" aria-label="Editar ${esc(p.description || c.name)}">
        <span class="tx-icon">${c.icon}</span>
        <span class="tx-main">
          <span class="tx-desc">${esc(p.description || c.name)}</span>
          <span class="tx-meta">${p.paid}/${p.of} pagas · total ${fmt(p.total)}</span>
          <span class="plan-progress"><span style="width:${(p.paid / p.of) * 100}%"></span></span>
        </span>
        <span class="tx-amount">${fmt(p.remaining)}<small class="amount-label">resta</small></span>
      </li>`;
    })
    .join("");
}

function fillSelect(sel, options, value, placeholder) {
  sel.innerHTML = (placeholder ? `<option value="">${placeholder}</option>` : "") +
    options.map(([v, label]) => `<option value="${esc(v)}">${esc(label)}</option>`).join("");
  sel.value = value ?? "";
}

function renderTransactions() {
  const fc = $("#f-category");
  fillSelect(fc, state.categories.map((c) => [c.id, `${c.icon} ${c.name}`]), fc.value, "Todas las categorías");
  const fm = $("#f-method");
  fillSelect(fm, PAYMENT_METHODS.map((m) => [m, m]), fm.value, "Todos los medios");

  const txs = L.filterTransactions(state.transactions, {
    month,
    type: $("#f-type").value,
    categoryId: fc.value,
    method: fm.value,
    query: $("#f-query").value,
  });
  const s = L.summarize(txs);
  $("#filter-summary").textContent = `${txs.length} movimiento${txs.length === 1 ? "" : "s"} · Ingresos ${fmt(s.income)} · Gastos ${fmt(s.expense)}`;

  const groups = new Map();
  for (const t of txs) groups.set(t.date, [...(groups.get(t.date) || []), t]);
  $("#tx-groups").innerHTML = txs.length
    ? [...groups.entries()]
        .map(([date, list]) => {
          const day = L.summarize(list);
          return `<div class="day-group">
            <div class="day-head"><span>${fmtDate(date)}</span><span>${day.expense ? "−" + fmt(day.expense) : ""}</span></div>
            <ul class="tx-list">${list.map((t) => txItem(t)).join("")}</ul>
          </div>`;
        })
        .join("")
    : `<p class="empty">No hay movimientos que coincidan.</p>`;
}

function renderBudgets() {
  const status = L.budgetStatus(state.transactions, state.budgets, state.categories, month);
  const byId = Object.fromEntries(status.map((b) => [b.category.id, b]));
  const totalLimit = status.reduce((a, b) => a + b.limit, 0);
  const totalSpent = status.reduce((a, b) => a + b.spent, 0);
  $("#budget-total").innerHTML = totalLimit
    ? `Presupuestado: <strong>${fmt(totalLimit)}</strong> · Gastado: <strong>${fmt(totalSpent)}</strong> · Disponible: <strong class="${totalLimit - totalSpent < 0 ? "neg" : ""}">${fmt(totalLimit - totalSpent)}</strong>`
    : "";

  const label = { ok: "✓ En regla", warning: "⚠ Cerca del tope", over: "✕ Excedido" };
  $("#budget-list").innerHTML = state.categories
    .filter((c) => c.type === "expense")
    .map((c) => {
      const b = byId[c.id];
      const pct = b ? Math.min(b.pct, 1) * 100 : 0;
      return `<div class="budget-row">
        <span class="cat-name">${c.icon} ${esc(c.name)}</span>
        <input type="number" min="0" step="100" inputmode="decimal" placeholder="Sin tope" aria-label="Tope para ${esc(c.name)}"
          data-budget="${c.id}" value="${state.budgets[c.id] || ""}">
        ${b ? `<div class="budget-bar"><span class="budget-fill ${b.status}" style="width:${pct}%"></span></div>
        <span class="budget-info"><span class="status ${b.status}">${label[b.status]}</span> ${fmt(b.spent)} de ${fmt(b.limit)} (${Math.round(b.pct * 100)}%)</span>` : ""}
      </div>`;
    })
    .join("");
}

function renderSettings() {
  $("#s-currency").value = state.settings.currency;
  $("#s-theme").value = state.settings.theme;
  const used = new Set(state.transactions.map((t) => t.categoryId));
  $("#cat-list").innerHTML = state.categories
    .map((c) => `<span class="chip ${c.type}">${c.icon} ${esc(c.name)}
      <button class="chip-x" data-del-cat="${c.id}" aria-label="Eliminar ${esc(c.name)}" title="${used.has(c.id) ? "Tiene movimientos: se pasarán a Otros" : "Eliminar"}">×</button></span>`)
    .join("");
  $("#recurring-list").innerHTML = state.recurring.length
    ? state.recurring
        .map((r) => {
          const c = cat(r.categoryId);
          return `<li class="tx static">
            <span class="tx-icon">${c.icon}</span>
            <span class="tx-main"><span class="tx-desc">${esc(r.description || c.name)}</span>
            <span class="tx-meta">Día ${r.day} de cada mes · ${esc(c.name)}</span></span>
            <span class="tx-amount ${r.type}">${fmt(r.amount)}</span>
            <button class="chip-x" data-del-rec="${r.id}" aria-label="Dejar de repetir">×</button>
          </li>`;
        })
        .join("")
    : `<li class="empty">No hay movimientos recurrentes.</li>`;
}

function applyTheme() {
  const t = state.settings.theme;
  if (t === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = t;
}

// ---------- formulario de movimiento ----------

function fillCategoryOptions(type, selected) {
  const sel = $("#tx-form [name=categoryId]");
  fillSelect(sel, state.categories.filter((c) => c.type === type).map((c) => [c.id, `${c.icon} ${c.name}`]), selected);
  if (!sel.value && sel.options.length) sel.selectedIndex = 0;
}

function installmentsEnabled() {
  const f = $("#tx-form");
  return f.type.value === "expense" && f.method.value === "Crédito";
}

function updateInstallmentsUI() {
  const f = $("#tx-form");
  const enabled = installmentsEnabled();
  const n = enabled ? Number(f.installments.value) : 1;
  $("#installments-field").hidden = !enabled;
  $("#repeat-field").hidden = n > 1;
  const amount = Number(f.amount.value);
  $("#installments-hint").textContent = n > 1 && amount > 0 && f.date.value
    ? `${n} cuotas de ${fmt(Math.round((amount / n) * 100) / 100)} · la primera en ${monthLabel(L.monthKey(f.date.value), true).toLowerCase()}`
    : "";
}

function openForm(tx = null) {
  const form = $("#tx-form");
  form.reset();
  editingId = tx?.id || null;
  const type = tx?.type || "expense";
  form.type.value = type;
  // Una compra en cuotas se edita entera: monto total, fecha de compra y cantidad de cuotas.
  form.amount.value = tx?.plan ? tx.plan.total : tx?.amount ?? "";
  form.date.value = tx?.plan ? tx.plan.date : tx?.date || (month === L.monthKey(today) ? today : `${month}-01`);
  form.description.value = tx?.description || "";
  fillSelect(form.method, PAYMENT_METHODS.map((m) => [m, m]), tx?.method || "Débito");
  fillCategoryOptions(type, tx?.categoryId);
  form.repeat.checked = Boolean(tx?.recurringId && state.recurring.some((r) => r.id === tx.recurringId));
  form.installments.value = String(tx?.plan?.of || 1);
  updateInstallmentsUI();
  $("#tx-title").textContent = tx?.plan ? "Editar compra en cuotas" : tx ? "Editar movimiento" : "Nuevo movimiento";
  $("#tx-delete").hidden = !tx;
  $("#tx-dialog").showModal();
}

function submitForm() {
  const f = $("#tx-form");
  const amount = Number(f.amount.value);
  if (!(amount > 0)) return toast("Ingresá un monto válido");
  const data = {
    type: f.type.value,
    amount: Math.round(amount * 100) / 100,
    date: f.date.value,
    categoryId: f.categoryId.value,
    description: f.description.value.trim(),
    method: f.method.value,
  };

  const n = installmentsEnabled() ? Number(f.installments.value) : 1;
  let old = editingId ? state.transactions.find((t) => t.id === editingId) : null;

  if (old?.plan) {
    state.transactions = state.transactions.filter((t) => t.plan?.id !== old.plan.id);
    old = null;
  }
  if (n > 1) {
    if (old) {
      state.transactions = state.transactions.filter((t) => t.id !== old.id);
      state.recurring = state.recurring.filter((r) => r.id !== old.recurringId);
    }
    state.transactions.push(...L.buildInstallments(data, n));
    $("#tx-dialog").close();
    persist();
    toast(`Compra en ${n} cuotas guardada`);
    return;
  }

  let tx;
  if (old) {
    tx = old;
    Object.assign(tx, data);
  } else {
    tx = { id: L.uid(), createdAt: Date.now(), ...data };
    state.transactions.push(tx);
  }

  const existing = state.recurring.find((r) => r.id === tx.recurringId);
  if (f.repeat.checked) {
    const rec = {
      type: data.type,
      amount: data.amount,
      categoryId: data.categoryId,
      description: data.description,
      method: data.method,
      day: Number(data.date.slice(8, 10)),
    };
    if (existing) Object.assign(existing, rec);
    else {
      const r = { id: L.uid(), ...rec, startMonth: L.monthKey(data.date), lastMonth: L.monthKey(data.date) };
      state.recurring.push(r);
      tx.recurringId = r.id;
    }
  } else if (existing) {
    state.recurring = state.recurring.filter((r) => r !== existing);
  }

  runRecurring();
  $("#tx-dialog").close();
  persist();
  toast(editingId ? "Movimiento actualizado" : "Movimiento guardado");
}

function runRecurring() {
  const { newTxs, recurring } = L.generateRecurring(state.recurring, today);
  state.recurring = recurring;
  if (newTxs.length) state.transactions.push(...newTxs);
  return newTxs.length;
}

// ---------- datos de ejemplo ----------

function demoData() {
  const s = defaultState();
  s.settings = { ...state.settings };
  const rand = (min, max) => Math.round((min + Math.random() * (max - min)) / 10) * 10;
  const add = (date, type, categoryId, amount, description, method) =>
    s.transactions.push({ id: L.uid(), createdAt: Date.now(), date, type, categoryId, amount, description, method });
  const cur = L.monthKey(today);
  // Los fijos se cargan como recurrentes, así la demo también muestra esa función.
  const start = L.addMonths(cur, -3);
  const rec = (type, categoryId, amount, description, method, day) =>
    s.recurring.push({ id: L.uid(), type, categoryId, amount, description, method, day, startMonth: start, lastMonth: null });
  rec("income", "sueldo", 1200000, "Sueldo", "Transferencia", 1);
  rec("expense", "vivienda", 450000, "Alquiler", "Transferencia", 2);
  rec("expense", "suscripciones", 15000, "Streaming", "Crédito", 5);
  for (let i = 3; i >= 0; i--) {
    const m = L.addMonths(cur, -i);
    // Lo que caiga después de hoy se descarta abajo, así el mes en curso queda realista.
    const lastDay = L.daysInMonth(m);
    const d = (n) => `${m}-${String(Math.max(1, Math.min(n, lastDay))).padStart(2, "0")}`;
    if (i % 2 === 0) add(d(15), "income", "freelance", rand(150000, 300000), "Proyecto web", "Transferencia");
    add(d(10), "expense", "servicios", rand(40000, 70000), "Luz, gas e internet", "Débito");
    for (let w = 0; w < 4; w++) add(d(3 + w * 7), "expense", "supermercado", rand(45000, 90000), "Compra semanal", "Débito");
    for (let k = 0; k < 5; k++) add(d(rand(1, 280) / 10), "expense", "comida", rand(8000, 30000), "Salida", "Billetera virtual");
    add(d(8), "expense", "transporte", rand(20000, 40000), "Carga SUBE", "Billetera virtual");
    if (i !== 1) add(d(20), "expense", "entretenimiento", rand(15000, 50000), "Cine / recitales", "Crédito");
    if (i === 2) add(d(18), "expense", "ropa", 95000, "Zapatillas", "Crédito");
    if (i === 0) add(d(12), "expense", "salud", 32000, "Farmacia", "Débito");
  }
  s.transactions = s.transactions.filter((t) => t.date <= today);
  const plan = (monthsAgo, amount, count, categoryId, description) =>
    s.transactions.push(...L.buildInstallments(
      { type: "expense", amount, categoryId, description, method: "Crédito", date: `${L.addMonths(cur, -monthsAgo)}-04` },
      count,
    ));
  plan(2, 900000, 6, "vivienda", "Heladera");
  plan(0, 1440000, 12, "educacion", "Notebook");
  plan(1, 180000, 3, "ropa", "Campera");
  s.budgets = { supermercado: 300000, comida: 100000, entretenimiento: 40000, transporte: 35000 };
  return s;
}

// ---------- eventos ----------

$$(".tabs [role=tab]").forEach((b) => b.addEventListener("click", () => ((tab = b.dataset.tab), render())));
$$("[data-goto]").forEach((b) => b.addEventListener("click", () => ((tab = b.dataset.goto), render())));

$("#prev-month").addEventListener("click", () => ((month = L.addMonths(month, -1)), render()));
$("#next-month").addEventListener("click", () => ((month = L.addMonths(month, 1)), render()));

$("#theme-toggle").addEventListener("click", () => {
  const dark = state.settings.theme === "dark" ||
    (state.settings.theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  state.settings.theme = dark ? "light" : "dark";
  persist();
});

$("#add-btn").addEventListener("click", () => openForm());
document.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "n" && !e.ctrlKey && !e.metaKey && !e.altKey &&
      !["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName) && !$("#tx-dialog").open) {
    e.preventDefault();
    openForm();
  }
});

// Abrir un movimiento para editarlo (click o Enter).
document.addEventListener("click", (e) => {
  const li = e.target.closest(".tx[data-id]");
  if (li) openForm(state.transactions.find((t) => t.id === li.dataset.id));
});
document.addEventListener("keydown", (e) => {
  const li = e.target.closest?.(".tx[data-id]");
  if (li && e.key === "Enter") openForm(state.transactions.find((t) => t.id === li.dataset.id));
});

$$("#tx-form [name=type]").forEach((r) => r.addEventListener("change", () => fillCategoryOptions(r.value)));
["type", "method", "installments", "amount", "date"].forEach((name) =>
  $$(`#tx-form [name=${name}]`).forEach((el) => el.addEventListener(name === "amount" ? "input" : "change", updateInstallmentsUI)),
);
$("#tx-form").addEventListener("submit", (e) => {
  e.preventDefault();
  submitForm();
});
$("#tx-cancel").addEventListener("click", () => $("#tx-dialog").close());
$("#tx-delete").addEventListener("click", () => {
  const tx = state.transactions.find((t) => t.id === editingId);
  if (tx?.plan) {
    if (!confirm(`¿Eliminar la compra completa (${tx.plan.of} cuotas)?`)) return;
    state.transactions = state.transactions.filter((t) => t.plan?.id !== tx.plan.id);
  } else {
    if (!confirm("¿Eliminar este movimiento?")) return;
    state.transactions = state.transactions.filter((t) => t.id !== editingId);
  }
  $("#tx-dialog").close();
  persist();
  toast("Movimiento eliminado");
});

["#f-query", "#f-type", "#f-category", "#f-method"].forEach((s) =>
  $(s).addEventListener(s === "#f-query" ? "input" : "change", renderTransactions),
);

$("#budget-list").addEventListener("change", (e) => {
  const id = e.target.dataset.budget;
  if (!id) return;
  const v = Number(e.target.value);
  if (v > 0) state.budgets[id] = v;
  else delete state.budgets[id];
  persist();
});

$("#s-currency").addEventListener("change", (e) => ((state.settings.currency = e.target.value), persist()));
$("#s-theme").addEventListener("change", (e) => ((state.settings.theme = e.target.value), persist()));

$("#cat-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("#cat-name").value.trim();
  const type = $("#cat-type").value;
  if (!name) return;
  if (state.categories.some((c) => c.type === type && c.name.toLowerCase() === name.toLowerCase())) {
    return toast("Ya existe esa categoría");
  }
  state.categories.push({ id: L.uid(), name, icon: $("#cat-icon").value.trim() || "🏷️", type });
  e.target.reset();
  persist();
});

$("#cat-list").addEventListener("click", (e) => {
  const id = e.target.dataset.delCat;
  if (!id) return;
  const c = cat(id);
  const fallback = c.type === "income" ? "otros-ingresos" : "otros";
  if (id === fallback) return toast(`“${c.name}” no se puede eliminar`);
  if (!confirm(`¿Eliminar la categoría “${c.name}”? Sus movimientos pasarán a “${cat(fallback).name}”.`)) return;
  state.transactions.forEach((t) => t.categoryId === id && (t.categoryId = fallback));
  state.recurring.forEach((r) => r.categoryId === id && (r.categoryId = fallback));
  state.categories = state.categories.filter((x) => x.id !== id);
  delete state.budgets[id];
  persist();
});

$("#recurring-list").addEventListener("click", (e) => {
  const id = e.target.dataset.delRec;
  if (!id || !confirm("¿Dejar de repetir este movimiento? Los ya cargados se mantienen.")) return;
  state.recurring = state.recurring.filter((r) => r.id !== id);
  persist();
});

$("#export-csv").addEventListener("click", () =>
  download(`gastos-${today}.csv`, "﻿" + L.toCSV(state.transactions, state.categories), "text/csv;charset=utf-8"),
);
$("#export-json").addEventListener("click", () =>
  download(`gastos-backup-${today}.json`, JSON.stringify(state, null, 2), "application/json"),
);

$("#import-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const text = (await file.text()).replace(/^﻿/, "");
    if (file.name.endsWith(".json")) {
      const data = JSON.parse(text);
      if (!isValidBackup(data)) throw new Error("El archivo no parece un backup de Mis Gastos.");
      if (!confirm("Esto reemplaza todos tus datos actuales por los del backup. ¿Continuar?")) return;
      state = { ...defaultState(), ...data, settings: { ...defaultState().settings, ...data.settings } };
      toast("Backup restaurado");
    } else {
      const { txs, newCategories } = L.resolveImport(L.parseCSV(text), state.categories);
      state.categories.push(...newCategories);
      state.transactions.push(...txs);
      toast(`Se importaron ${txs.length} movimientos`);
    }
    persist();
  } catch (err) {
    toast(err.message || "No se pudo importar el archivo");
  }
});

$("#load-demo").addEventListener("click", () => {
  if (state.transactions.length && !confirm("Esto reemplaza tus datos por datos de ejemplo. ¿Continuar?")) return;
  state = demoData();
  runRecurring();
  month = L.monthKey(today);
  persist();
  toast("Datos de ejemplo cargados");
});

$("#clear-all").addEventListener("click", () => {
  if (!confirm("¿Borrar TODOS los datos? No se puede deshacer.")) return;
  state = { ...defaultState(), settings: state.settings };
  persist();
});

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => tab === "resumen" && renderSummary(), 150);
});

// ---------- app instalable (PWA) ----------

// Sólo funciona servida por http(s); abriendo index.html desde el disco se omite.
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

let installPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e;
  $("#install-box").hidden = false;
});
$("#install-app").addEventListener("click", async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  $("#install-box").hidden = true;
});
window.addEventListener("appinstalled", () => toast("¡App instalada! Ya la tenés en tu escritorio."));

// ---------- inicio ----------

if (runRecurring()) save(state);
render();
})();
