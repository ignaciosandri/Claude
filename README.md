# 💸 Mis Gastos

Tracker de finanzas personales: gastos, ingresos, presupuestos y movimientos recurrentes.
HTML + CSS + JavaScript sin dependencias. Los datos se guardan en el navegador (`localStorage`).

## Instalarla como app de escritorio

La app es instalable (PWA): queda con su ícono, abre en su propia ventana, funciona sin internet
y se actualiza sola.

1. Publicala con GitHub Pages (una sola vez): en el repo, **Settings → Pages → Build and deployment**,
   *Source*: **Deploy from a branch**, rama `claude/personal-expense-tracker-2vvg6n`, carpeta `/ (root)` → **Save**.
2. Abrí **https://ignaciosandri.github.io/Claude/** con Chrome o Edge.
3. Tocá el ícono de instalar en la barra de direcciones (o **Ajustes → Instalar como app de escritorio**).

> Los datos se guardan por navegador y por dirección: lo que cargaste abriendo `index.html` desde el disco
> no aparece en la app instalada. Para pasarlos: **Ajustes → Backup JSON** en uno e **Importar** en el otro.

## Cómo usarla

**Opción fácil:** abrí `index.html` con doble clic (o clic derecho → *Abrir con* → tu navegador). No hace falta instalar nada.

**Con Node.js** (opcional):

```bash
npm start      # http://localhost:5173
npm test       # tests de la lógica (node:test)
```

**Desde VS Code:** clic derecho sobre `index.html` → *Reveal in File Explorer* y abrilo con el navegador,
o instalá la extensión *Live Server* y usá *Open with Live Server* (se recarga sola al guardar cambios).

Para probar rápido: **Ajustes → Cargar datos de ejemplo**.

## Qué tiene

- **Resumen mensual**: ingresos, gastos, balance, tasa de ahorro y proyección de gasto a fin de mes
  (los gastos fijos cuentan una vez y sólo el gasto variable se extrapola).
- **Insights automáticos**: comparación con el mes anterior, categoría con más gasto, alerta si vas a gastar más de lo que ingresó.
- **Gráficos**: ingresos vs. gastos de los últimos 6 meses (con tooltip) y gasto por categoría.
- **Movimientos**: alta/edición/borrado, agrupados por día, con búsqueda y filtros por tipo, categoría y medio de pago.
- **Compras en cuotas** con tarjeta de crédito: elegís 2 a 24 cuotas, cada cuota cae en su mes
  y el resumen muestra cuánto tenés comprometido en los próximos meses y qué compras siguen activas.
  Podés navegar a meses futuros para ver qué cuotas vienen.
- **Presupuestos** por categoría con aviso al 80% y al pasarse.
- **Recurrentes**: tildá “Repetir todos los meses” y se cargan solos (sueldo, alquiler, suscripciones…).
- **Categorías** editables (con emoji) para gastos e ingresos.
- **Exportar/importar** CSV (compatible con Excel/Sheets) y backup/restauración JSON.
- Multi-moneda (ARS, USD, EUR, UYU, CLP, MXN), modo oscuro, diseño mobile-first, atajo de teclado `N`.

## Estructura

```
index.html        UI
css/styles.css    estilos (tokens claro/oscuro)
js/logic.js       lógica pura y testeable (filtros, totales, presupuestos, recurrentes, CSV)
js/store.js       persistencia en localStorage
js/charts.js      gráficos SVG
js/app.js         render y eventos
tests/            tests de js/logic.js
server.js         servidor estático para desarrollo
manifest.webmanifest, sw.js, icons/   app instalable y uso sin conexión
```

## Roadmap sugerido

**Prioridad alta**
1. **Cuentas y saldos**: billeteras/cuentas (banco, efectivo, billetera virtual) con saldo y transferencias entre ellas.
2. ~~Compras en cuotas~~ ✅. Próximo paso: **fecha de cierre y vencimiento de la tarjeta** (que la primera cuota caiga en el resumen correcto) y varias tarjetas.
3. **Multi-moneda real (ARS/USD)**: guardar la moneda de cada movimiento y convertir con la cotización del día (oficial/MEP/blue).
4. ~~App instalable y offline~~ ✅. Próximo paso: recordatorio diario para cargar gastos.
5. **Sincronización y backup en la nube** (Supabase/Firebase) para usarla en varios dispositivos.

**Prioridad media**
6. **Metas de ahorro** (viaje, fondo de emergencia) con progreso y aporte mensual sugerido.
7. **Importar resúmenes del banco** (CSV/PDF) con categorización automática por reglas (“si dice UBER → Transporte”).
8. **Ajuste por inflación**: ver gastos en pesos constantes con el IPC para comparar meses de verdad.
9. **Etiquetas** además de categorías (#vacaciones, #regalos) y adjuntar foto del ticket.
10. **Informe anual** y comparación año contra año.

**Ideas extra**
11. Carga rápida por texto o voz (“café 3500 débito”) con IA.
12. Gastos compartidos (dividir con pareja o amigos, quién le debe a quién).
13. Detector de suscripciones olvidadas y gastos “hormiga”.
14. Alertas de vencimientos (servicios, tarjeta, impuestos).
