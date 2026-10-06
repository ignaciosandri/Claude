// Persistencia en localStorage con valores por defecto.
// Script clásico (no módulo) para que la app funcione abriendo index.html directo desde el disco.
var Store = (function () {
  "use strict";

  const KEY = "gastos:v1";

  const PAYMENT_METHODS = ["Efectivo", "Débito", "Crédito", "Transferencia", "Billetera virtual"];

  const DEFAULT_CATEGORIES = [
    ["supermercado", "Supermercado", "🛒", "expense"],
    ["comida", "Comida afuera", "🍔", "expense"],
    ["transporte", "Transporte", "🚌", "expense"],
    ["vivienda", "Vivienda", "🏠", "expense"],
    ["servicios", "Servicios", "💡", "expense"],
    ["salud", "Salud", "💊", "expense"],
    ["entretenimiento", "Entretenimiento", "🎬", "expense"],
    ["ropa", "Ropa", "👕", "expense"],
    ["educacion", "Educación", "📚", "expense"],
    ["suscripciones", "Suscripciones", "📺", "expense"],
    ["otros", "Otros", "📦", "expense"],
    ["sueldo", "Sueldo", "💼", "income"],
    ["freelance", "Freelance", "💻", "income"],
    ["inversiones", "Inversiones", "📈", "income"],
    ["otros-ingresos", "Otros ingresos", "💰", "income"],
  ].map(([id, name, icon, type]) => ({ id, name, icon, type }));

  function defaultState() {
    return {
      transactions: [],
      categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
      budgets: {},
      recurring: [],
      settings: { currency: "ARS", locale: "es-AR", theme: "auto" },
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultState();
      const data = JSON.parse(raw);
      const base = defaultState();
      return { ...base, ...data, settings: { ...base.settings, ...data.settings } };
    } catch {
      return defaultState();
    }
  }

  function save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch {
      return false;
    }
  }

  function isValidBackup(data) {
    return (
      data &&
      Array.isArray(data.transactions) &&
      Array.isArray(data.categories) &&
      typeof data.budgets === "object"
    );
  }

  return { PAYMENT_METHODS, defaultState, load, save, isValidBackup };
})();
