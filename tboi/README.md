# TBOI Companion — Datos

Datos base para la app acompañante de The Binding of Isaac: Repentance(+).

## Estructura

```
tboi/
  data/
    items.json         # 719 items (activated + passive), scrapeado de wiki.gg
    trinkets.json       # pendiente
    cards-runes.json    # pendiente
    pills.json          # pendiente
    characters.json      # pendiente
    unlocks.json         # pendiente (desbloqueables)
    routes.json          # pendiente (Mother, Beast, Delirium, Hush)
```

Un archivo JSON por categoría de dato del juego. Cada archivo es un array plano
de objetos con un schema fijo (ver abajo). Esto permite:

- Cargar solo la categoría que necesita cada vista de la app (sin parsear un JSON gigante).
- Filtrar/ordenar en el cliente sin backend (ej. `items.filter(i => i.quality === 4)`).
- Reemplazar el contenido de un archivo por tu propia fuente de verdad sin tocar el resto.

## Schema: `items.json`

```jsonc
{
  "name": "The Sad Onion",   // string
  "id": 1,                    // int, collectible ID del juego
  "type": "passive",          // "passive" | "activated"
  "quote": "Tears up",        // string, descripción corta
  "description": "+0.7 tears.", // string, descripción completa
  "quality": 3                 // int 0-4
}
```

Ordenado por `id` ascendente. `id` y `quality` son enteros (no strings) para
permitir comparaciones/filtros numéricos directos.

## Fuente

Scrapeado de [bindingofisaacrebirth.wiki.gg](https://bindingofisaacrebirth.wiki.gg/wiki/Items)
vía la API de MediaWiki (`action=parse`) el 2026-07-31. Es la capa de datos
"genérica" — la fuente de verdad del usuario (bases propias) tiene prioridad
sobre esto cuando ambas existan.

## Pendiente

- Poblar `trinkets.json`, `cards-runes.json`, `pills.json`, `characters.json`.
- `unlocks.json` y `routes.json` (Mother, Beast, Delirium, Hush) — a definir
  si se scrapean o se cargan a mano desde la base propia del usuario.
- Mecanismo de sync entre 3 dispositivos (JSON export/import u otro, a definir).
