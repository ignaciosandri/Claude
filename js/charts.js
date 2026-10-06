// Gráficos en SVG/HTML a mano, sin librerías.

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function monthLabel(key, long = false) {
  const [y, m] = key.split("-").map(Number);
  if (long) {
    const name = new Date(y, m - 1, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  return `${MONTHS[m - 1]} ${String(y).slice(2)}`;
}

function niceMax(v) {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

function compact(n) {
  return new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

// Columnas agrupadas ingresos vs. gastos por mes, con tooltip por barra.
export function renderMonthlyChart(container, series, fmt, tooltip) {
  // El viewBox sigue el ancho real para que los textos no se achiquen en pantallas chicas.
  const W = Math.max(280, Math.round(container.clientWidth || 640));
  const H = 240;
  const pad = { t: 12, r: 8, b: 28, l: 44 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const max = niceMax(Math.max(...series.flatMap((s) => [s.income, s.expense]), 0));
  const y = (v) => pad.t + ih - (v / max) * ih;
  const group = iw / series.length;
  const bw = Math.min(22, group / 3);

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Ingresos y gastos por mes">`;
  for (const t of ticks) {
    svg += `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}"/>`;
    svg += `<text class="axis" x="${pad.l - 6}" y="${y(t) + 4}" text-anchor="end">${compact(t)}</text>`;
  }

  series.forEach((s, i) => {
    const cx = pad.l + group * i + group / 2;
    svg += `<text class="axis" x="${cx}" y="${H - 8}" text-anchor="middle">${monthLabel(s.month)}</text>`;
    [
      ["income", s.income, cx - bw - 1],
      ["expense", s.expense, cx + 1],
    ].forEach(([kind, v, x]) => {
      const h = Math.max(0, pad.t + ih - y(v));
      const r = Math.min(4, h / 2, bw / 2);
      const top = y(v);
      const base = pad.t + ih;
      // Barra con extremo superior redondeado anclada a la base.
      const d = h > 0
        ? `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${base} Z`
        : "";
      svg += `<path class="bar ${kind}" d="${d}"/>`;
      svg += `<rect class="hit" x="${x - 2}" y="${pad.t}" width="${bw + 4}" height="${ih}" data-i="${i}" data-k="${kind}"/>`;
    });
  });
  svg += `<line class="baseline" x1="${pad.l}" x2="${W - pad.r}" y1="${pad.t + ih}" y2="${pad.t + ih}"/>`;
  svg += "</svg>";
  container.innerHTML = svg;

  container.querySelectorAll(".hit").forEach((el) => {
    const s = series[Number(el.dataset.i)];
    const label = el.dataset.k === "income" ? "Ingresos" : "Gastos";
    const value = el.dataset.k === "income" ? s.income : s.expense;
    const show = (e) => tooltip.show(e, `<strong>${monthLabel(s.month, true)}</strong><br>${label}: ${fmt(value)}`);
    el.addEventListener("pointermove", show);
    el.addEventListener("pointerleave", tooltip.hide);
  });
}

// Barras horizontales por categoría (una sola serie: la etiqueta identifica la categoría).
export function renderCategoryBars(container, rows, fmt, esc) {
  if (!rows.length) {
    container.innerHTML = `<p class="empty">Todavía no hay gastos este mes.</p>`;
    return;
  }
  const max = rows[0].total;
  container.innerHTML = rows
    .map(
      (r) => `
      <div class="cat-row" title="${esc(r.category.name)}: ${fmt(r.total)}">
        <span class="cat-name">${r.category.icon} ${esc(r.category.name)}</span>
        <span class="cat-track"><span class="cat-fill" style="width:${(r.total / max) * 100}%"></span></span>
        <span class="cat-value">${fmt(r.total)} <small>${Math.round(r.share * 100)}%</small></span>
      </div>`,
    )
    .join("");
}
