// Lógica pura del tracker: sin DOM ni localStorage, para poder testearla con node:test.
// Script clásico (no módulo) para que la app funcione abriendo index.html directo desde el disco.
var Logic = (function () {
  "use strict";

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function monthKey(date) {
    return String(date).slice(0, 7);
  }

  function todayISO(now = new Date()) {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function addMonths(key, n) {
    const [y, m] = key.split("-").map(Number);
    const total = y * 12 + (m - 1) + n;
    const ny = Math.floor(total / 12);
    const nm = (total % 12) + 1;
    return `${ny}-${String(nm).padStart(2, "0")}`;
  }

  function daysInMonth(key) {
    const [y, m] = key.split("-").map(Number);
    return new Date(y, m, 0).getDate();
  }

  function filterTransactions(txs, { month, type, categoryId, method, query } = {}) {
    const q = (query || "").trim().toLowerCase();
    return txs
      .filter((t) => !month || monthKey(t.date) === month)
      .filter((t) => !type || t.type === type)
      .filter((t) => !categoryId || t.categoryId === categoryId)
      .filter((t) => !method || t.method === method)
      .filter((t) => !q || (t.description || "").toLowerCase().includes(q))
      .sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));
  }

  function summarize(txs) {
    let income = 0;
    let expense = 0;
    for (const t of txs) {
      if (t.type === "income") income += t.amount;
      else expense += t.amount;
    }
    const balance = income - expense;
    const savingsRate = income > 0 ? balance / income : null;
    return { income, expense, balance, savingsRate };
  }

  function byCategory(txs, categories, type = "expense") {
    const totals = new Map();
    for (const t of txs) {
      if (t.type !== type) continue;
      totals.set(t.categoryId, (totals.get(t.categoryId) || 0) + t.amount);
    }
    const grand = [...totals.values()].reduce((a, b) => a + b, 0);
    return [...totals.entries()]
      .map(([id, total]) => ({
        category: categories.find((c) => c.id === id) || { id, name: "Sin categoría", icon: "❔" },
        total,
        share: grand ? total / grand : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }

  function monthlySeries(txs, endMonth, count = 6) {
    const months = [];
    for (let i = count - 1; i >= 0; i--) months.push(addMonths(endMonth, -i));
    const map = new Map(months.map((m) => [m, { month: m, income: 0, expense: 0 }]));
    for (const t of txs) {
      const row = map.get(monthKey(t.date));
      if (!row) continue;
      if (t.type === "income") row.income += t.amount;
      else row.expense += t.amount;
    }
    return months.map((m) => map.get(m));
  }

  function budgetStatus(txs, budgets, categories, month) {
    const spent = new Map();
    for (const t of txs) {
      if (t.type !== "expense" || monthKey(t.date) !== month) continue;
      spent.set(t.categoryId, (spent.get(t.categoryId) || 0) + t.amount);
    }
    return Object.entries(budgets)
      .filter(([, limit]) => limit > 0)
      .map(([id, limit]) => {
        const s = spent.get(id) || 0;
        const pct = s / limit;
        const status = pct >= 1 ? "over" : pct >= 0.8 ? "warning" : "ok";
        return { category: categories.find((c) => c.id === id), limit, spent: s, pct, status };
      })
      .filter((b) => b.category)
      .sort((a, b) => b.pct - a.pct);
  }

  // Proyección del gasto del mes en curso: los gastos recurrentes (fijos) cuentan una vez
  // y sólo el gasto variable se extrapola. Antes del día 7 hay muy pocos datos.
  function projectMonth(monthTxs, month, today) {
    if (monthKey(today) !== month) return null;
    const day = Number(today.slice(8, 10));
    if (day < 7) return null;
    let fixed = 0;
    let variable = 0;
    for (const t of monthTxs) {
      if (t.type !== "expense") continue;
      if (t.recurringId) fixed += t.amount;
      else variable += t.amount;
    }
    return fixed + (variable / day) * daysInMonth(month);
  }

  function insights(txs, categories, month, today) {
    const out = [];
    const curTxs = filterTransactions(txs, { month });
    const cur = summarize(curTxs);
    const prev = summarize(filterTransactions(txs, { month: addMonths(month, -1) }));

    if (prev.expense > 0 && cur.expense > 0) {
      const diff = (cur.expense - prev.expense) / prev.expense;
      if (Math.abs(diff) >= 0.05) {
        out.push({
          kind: diff > 0 ? "up" : "down",
          text: `Gastaste ${Math.round(Math.abs(diff) * 100)}% ${diff > 0 ? "más" : "menos"} que el mes anterior.`,
        });
      }
    }

    const cats = byCategory(curTxs, categories);
    if (cats.length) {
      const top = cats[0];
      out.push({
        kind: "info",
        text: `Tu mayor gasto es ${top.category.icon} ${top.category.name} (${Math.round(top.share * 100)}% del total).`,
      });
    }

    const projection = projectMonth(curTxs, month, today);
    if (projection && cur.income > 0 && projection > cur.income) {
      out.push({ kind: "up", text: "A este ritmo, vas a gastar más de lo que ingresó este mes." });
    }

    if (cur.savingsRate !== null && cur.savingsRate >= 0.2) {
      out.push({ kind: "down", text: `Vas ahorrando el ${Math.round(cur.savingsRate * 100)}% de tus ingresos. ¡Bien ahí!` });
    }
    return out;
  }

  // Genera los movimientos de las recurrencias que vencieron hasta hoy.
  function generateRecurring(recurring, today) {
    const current = monthKey(today);
    const todayDay = Number(today.slice(8, 10));
    const newTxs = [];
    const updated = recurring.map((r) => {
      let m = r.lastMonth ? addMonths(r.lastMonth, 1) : r.startMonth;
      let last = r.lastMonth;
      while (m <= current) {
        const day = Math.min(r.day, daysInMonth(m));
        if (m === current && todayDay < day) break;
        newTxs.push({
          id: uid(),
          type: r.type,
          amount: r.amount,
          categoryId: r.categoryId,
          description: r.description,
          method: r.method,
          date: `${m}-${String(day).padStart(2, "0")}`,
          recurringId: r.id,
          createdAt: Date.now(),
        });
        last = m;
        m = addMonths(m, 1);
      }
      return { ...r, lastMonth: last };
    });
    return { newTxs, recurring: updated };
  }

  // ---------- CSV ----------

  const CSV_HEADER = ["fecha", "tipo", "categoria", "descripcion", "medio", "monto"];

  function csvCell(v) {
    const s = String(v ?? "");
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function toCSV(txs, categories) {
    const rows = [CSV_HEADER.join(",")];
    for (const t of [...txs].sort((a, b) => (a.date < b.date ? -1 : 1))) {
      const cat = categories.find((c) => c.id === t.categoryId);
      rows.push(
        [t.date, t.type === "income" ? "ingreso" : "gasto", cat?.name || "", t.description, t.method, t.amount]
          .map(csvCell)
          .join(","),
      );
    }
    return rows.join("\n");
  }

  function splitCSVLine(line) {
    const cells = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') quoted = false;
        else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ",") {
        cells.push(cur);
        cur = "";
      } else cur += ch;
    }
    cells.push(cur);
    return cells;
  }

  function parseCSV(text) {
    const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
    if (!lines.length) return [];
    const header = splitCSVLine(lines[0]).map((h) => h.trim().toLowerCase());
    const idx = Object.fromEntries(CSV_HEADER.map((h) => [h, header.indexOf(h)]));
    if (idx.fecha < 0 || idx.monto < 0) throw new Error("El CSV necesita al menos las columnas 'fecha' y 'monto'.");
    return lines.slice(1).map((line, i) => {
      const c = splitCSVLine(line);
      const amount = Number(String(c[idx.monto]).replace(/[^\d.,-]/g, "").replace(",", "."));
      const date = (c[idx.fecha] || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(amount)) {
        throw new Error(`Fila ${i + 2} inválida: se espera fecha AAAA-MM-DD y un monto numérico.`);
      }
      const tipo = idx.tipo >= 0 ? (c[idx.tipo] || "").trim().toLowerCase() : "gasto";
      return {
        date,
        type: tipo.startsWith("ing") || tipo === "income" ? "income" : "expense",
        categoryName: idx.categoria >= 0 ? (c[idx.categoria] || "").trim() : "",
        description: idx.descripcion >= 0 ? (c[idx.descripcion] || "").trim() : "",
        method: idx.medio >= 0 ? (c[idx.medio] || "").trim() : "",
        amount: Math.abs(amount),
      };
    });
  }

  // Asigna categorías a filas importadas, creando las que no existan.
  function resolveImport(rows, categories) {
    const cats = [...categories];
    const newCategories = [];
    const txs = rows.map((r) => {
      const name = r.categoryName || (r.type === "income" ? "Otros ingresos" : "Otros");
      let cat = cats.find((c) => c.type === r.type && c.name.toLowerCase() === name.toLowerCase());
      if (!cat) {
        cat = { id: uid(), name, icon: r.type === "income" ? "💰" : "📦", type: r.type };
        cats.push(cat);
        newCategories.push(cat);
      }
      return {
        id: uid(),
        type: r.type,
        amount: r.amount,
        categoryId: cat.id,
        description: r.description,
        method: r.method,
        date: r.date,
        createdAt: Date.now(),
      };
    });
    return { txs, newCategories };
  }

  return { uid, monthKey, todayISO, addMonths, daysInMonth, filterTransactions, summarize, byCategory, monthlySeries, budgetStatus, projectMonth, insights, generateRecurring, toCSV, parseCSV, resolveImport };
})();
