# TBOI Companion — Datos

Datos base para la app acompañante de The Binding of Isaac: Repentance(+).

## Estructura

```
tboi/
  data/
    items.json         # 719 items (activated + passive) — tboi.com
    trinkets.json       # 188 trinkets — tboi.com
    cards-runes.json    # 97 cartas de tarot/baraja, runas y soul stones — tboi.com
    pills.json          # 50 pills, efecto normal + horse pill — wiki.gg
    characters.json      # 34 personajes (17 normales + 17 tainted) — wiki.gg
    unlocks.json         # pendiente
    routes.json          # pendiente (Mother, Beast, Delirium, Hush)
```

Un archivo JSON por categoría de dato del juego. Cada archivo es un array plano
de objetos con un schema fijo (ver abajo). Esto permite:

- Cargar solo la categoría que necesita cada vista de la app (sin parsear un JSON gigante).
- Filtrar/ordenar en el cliente sin backend (ej. `items.filter(i => i.quality === 4)`).
- Reemplazar el contenido de un archivo por tu propia fuente de verdad sin tocar el resto.

## Schemas

### `items.json`

```jsonc
{
  "name": "The Sad Onion",     // string
  "id": 1,                      // int, collectible ID del juego
  "dlc": "Rebirth",             // "Rebirth" | "Afterbirth" | "Afterbirth+" | "Repentance"
  "quote": "Tears up",          // string, descripción corta
  "description": "+0.7 Tears Up", // string, descripción/efecto
  "type": "Passive",            // string|null, ej. "Passive", "Active", "Passive, Tear Modifier"
  "pool": "Item Room",          // string|null, item pool donde aparece
  "quality": 3,                 // int 0-4
  "tags": ["item room", "green", "cry"] // string[]
}
```

### `trinkets.json`

Mismo schema que `items.json` (sin `pool`/`type` consistentes, muchos vienen null).

### `cards-runes.json`

```jsonc
{
  "name": "O - The Fool",
  "id": 1,
  "quote": "Where your journey begins",
  "description": "Teleports the player to the first room...",
  "quality": null,             // no aplica a la mayoría
  "tags": ["tarot", "card", "green"],
  "kind": "tarot"               // "tarot" | "playing_card" | "rune" | "soul_stone" | "special_card"
}
```

### `pills.json`

```jsonc
{
  "id": 0,
  "name": "Bad Gas",
  "polarity": "N",              // "N" | "+" | "-"
  "class": "1",                 // clase visual de la pastilla en pantalla
  "effect": "Isaac farts...",
  "horse_pill_effect": "The poison affects all enemies in the room."
}
```

### `characters.json`

```jsonc
{
  "name": "Isaac",
  "tainted": false,
  "unlock_requirement": "None; unlocked by default"
}
```

Ordenado por `id` ascendente donde aplica. `id`/`quality` son enteros (no
strings) para permitir comparaciones/filtros numéricos directos.

## Fuentes

- **items.json, trinkets.json, cards-runes.json**: scrapeados de
  [tboi.com](https://www.tboi.com) (Platinum God — Isaac Cheat Sheet),
  vía HTML parseado directamente (sin protección anti-bot), el 2026-07-31.
- **pills.json, characters.json**: scrapeados de
  [bindingofisaacrebirth.wiki.gg](https://bindingofisaacrebirth.wiki.gg)
  vía la API de MediaWiki (`action=parse`), el 2026-07-31.

Estos son la capa de datos "genérica" — la fuente de verdad del usuario
(bases propias) tiene prioridad sobre esto cuando ambas existan.

## Pendiente

- `unlocks.json` (achievements/desbloqueables generales) y `routes.json`
  (Mother, Beast, Delirium, Hush) — a definir si se scrapean de la wiki o
  se cargan a mano desde la base propia del usuario.
- Mecanismo de sync entre 3 dispositivos (JSON export/import u otro, a definir).
- Posible scraper propio y actualizado de wiki.gg, construido dentro de
  Claude Code, para refrescar estos datos automáticamente en el futuro.
