# TBOI Companion

App acompañante de The Binding of Isaac: Repentance(+): consulta rápida de
items, trinkets, cartas, pills, personajes y sinergias mientras jugás.

## Estructura

```
tboi/
  app/
    index.html          # la app (buscador + filtros)
    app.js
    style.css
  data/
    items.json         # 719 items (activated + passive) — tboi.com
    trinkets.json       # 188 trinkets — tboi.com
    cards-runes.json    # 97 cartas de tarot/baraja, runas y soul stones — tboi.com
    pills.json          # 50 pills, efecto normal + horse pill — wiki.gg
    characters.json      # 34 personajes (17 normales + 17 tainted) — wiki.gg
    synergies.json        # 406 combos de sinergia entre 28 items de tears — tboi.com
    routes.json           # 4 rutas: Mother, Beast/Dogma, Hush, Delirium — wiki.gg
    marks.json             # 22 marcas de completación (13 base + 9 tainted) — wiki.gg
    starting-items.json    # ítems/trinkets/cartas iniciales de los 17 personajes base — wiki.gg
    unlocks.json          # pendiente
```

## Usar la app

Es HTML/JS puro, sin build ni dependencias. Busca por nombre en todas las
categorías a la vez (o filtrá por categoría/quality con los chips), tocá
un resultado para expandirlo y ver descripción, tags y sinergias conocidas.

Secciones especiales (guardan progreso personal en `localStorage` del
navegador, no en el repo):
- **Marcas**: checklist de marcas de completación por personaje + sorteo
  de runs pendientes.
- **Build**: elegí un personaje (precarga sus ítems iniciales), agregá
  ítems a medida que jugás y la app te muestra las sinergias conocidas
  entre lo que llevás.

**Necesita servirse por HTTP** (no `file://`) porque carga los JSON con
`fetch`. Opciones:

- **GitHub Pages** (recomendado para usar desde el celu): activar Pages en
  la config del repo, rama `main`, carpeta raíz. Quedaría en
  `https://s-car1.github.io/C/tboi/app/`. Agregalo a la pantalla de inicio
  del iPhone para que abra como una app.
- **Local**, para probar: `python3 -m http.server 8000` parado en `tboi/`
  y entrar a `http://localhost:8000/app/`.

Un archivo JSON por categoría de dato del juego. Cada archivo es un array plano
de objetos con un schema fijo (ver abajo). Esto permite:

- Cargar solo la categoría que necesita cada vista de la app (sin parsear un JSON gigante).
- Filtrar/ordenar en el cliente sin backend (ej. `items.filter(i => i.quality === 4)`).
- Reemplazar el contenido de un archivo por tu propia fuente de verdad sin tocar el resto.

## Códigos (`code`)

Cada entrada de cada categoría tiene un `code` único con prefijo por tipo —
sirve como clave global para referenciar cualquier entidad desde cualquier
parte de la app (notas, checklist, sync entre dispositivos) sin ambigüedad
entre categorías (ej. item id 1 vs trinket id 1):

| Prefijo | Categoría   | Ejemplo |
|---------|-------------|---------|
| `C`     | items (coleccionables) | `C001`–`C719` |
| `T`     | trinkets    | `T001`–`T188` |
| `K`     | cards-runes (kartas)   | `K001`–`K097` |
| `P`     | pills       | `P00`–`P49` |
| `PJ`    | characters (personajes) | `PJ01`–`PJ34` |
| `U`     | unlocks (a futuro) | — |
| `R`     | routes      | `R01`–`R04` |

Para items/trinkets/cards/pills el número del `code` es el `id` real del
juego con padding. Characters no tiene ID nativo en el juego, así que el
número es un orden secuencial propio.

## Schemas

### `items.json`

```jsonc
{
  "code": "C001",               // string, ID global único (ver tabla de códigos)
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

Mismo schema que `items.json` (`code` con prefijo `T`; sin `pool`/`type`
consistentes, muchos vienen null).

### `cards-runes.json`

```jsonc
{
  "code": "K001",
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
  "code": "P00",
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
  "code": "PJ01",
  "name": "Isaac",
  "tainted": false,
  "unlock_requirement": "None; unlocked by default"
}
```

### `routes.json`

```jsonc
{
  "code": "R01",
  "name": "Mother",
  "portrait": "icons/routes/mother_portrait.png", // string|null
  "summary": "Boss único de Corpse II...",
  "steps": [
    {
      "text": "Descripción del paso",
      "image": "icons/routes/corpse_room.jpg",   // opcional
      "image_caption": "Corpse, el piso alternativo al Womb" // opcional
    }
  ]
}
```

Pasos ordenados para llegar a un boss/evento especial (rutas alternas).
Las imágenes son screenshots reales de wiki.gg (mapas de piso, retratos de
boss), no capturas paso a paso de "hacé click acá" — la wiki no tiene ese
tipo de contenido ilustrado, así que se usó lo más cercano y preciso
disponible (texto verificado contra las páginas oficiales de cada piso/boss).

### `marks.json`

```jsonc
{
  "code": "M01",
  "name": "Heart",
  "boss": "Mom's Heart or It Lives!",
  "tainted": false,           // true = aplica a personajes tainted (set MT01-MT09)
  "unlocks": {
    "Isaac": "Lost Baby",      // nombre de personaje (matchea characters.json) -> item que desbloquea
    "Magdalene": "Cute Baby",
    // ... uno por cada personaje del mismo grupo (base o tainted)
  }
}
```

13 marcas para los 17 personajes base (`M01`-`M13`) + 9 marcas para los 17
tainted (`MT01`-`MT09`) = 22 definiciones × sus personajes aplicables. El
**progreso del usuario** (qué marca ya tiene con qué personaje) no vive acá
— se guarda en el navegador (`localStorage`, clave `tboi_marks_progress_v1`),
como pares `"<character.code>:<mark.code>": true`. Si cambiás de dispositivo
o borrás datos del navegador, se pierde (ver sync pendiente más abajo).

En la app, la sección **Marcas** muestra un checklist expandible por
personaje y un botón "Sortear run pendiente" que elige al azar una
combinación personaje+marca que todavía no esté marcada como completa,
mostrando el boss objetivo y el ítem que desbloquea.

### `starting-items.json`

```jsonc
{
  "character_code": "PJ08",
  "character_name": "Azazel",
  "starting_items": [
    { "type": "card", "code": "K001", "name": "O - The Fool" }
  ],
  "note": "También empieza con vuelo y un Brimstone de corto alcance innatos (no son ítems recogibles)."
}
```

Ítems/trinkets/cartas con los que arranca cada uno de los 17 personajes
base (no cubre variantes tainted todavía). `note` describe mecánicas
innatas que no son ítems recogibles (ej. el garrote de The Forgotten) o
casos especiales (Eden es aleatorio, Isaac no tiene ítem inicial propio
pese a la creencia común). Usado por la sección **Build** de la app para
precargar el punto de partida al elegir personaje.

### `synergies.json`

```jsonc
{
  "item_a_code": "C002",
  "item_a_name": "The Inner Eye",
  "item_b_code": "C002",
  "item_b_name": "The Inner Eye",
  "text": "Taking multiple Inner Eye items will give +3 tears per item taken..."
}
```

Matriz de sinergias entre pares de items, extraída de la herramienta
interactiva de tboi.com/afterbirth-synergies (selecciona 2 items y muestra
el texto de su interacción). **Cobertura limitada**: son 406 combos entre
solo 28 items — los que más modifican el tipo/forma de las lágrimas
(Brimstone, Tech, Ipecac, Monstro's Lung, Ludovico, etc.), que es donde las
sinergias son más impredecibles y vale la pena consultarlas. No cubre items
de Repentance ni la mayoría de items pasivos simples (esos no tienen
interacciones "raras" que documentar). Cuando `item_a_code == item_b_code`,
describe qué pasa al tener 2 copias del mismo item.

Para uso en la app: al consultar un item, buscar en este archivo por
`item_a_code` o `item_b_code` igual a su `code` para listar todas sus
sinergias conocidas.

Ordenado por `id` ascendente donde aplica. `id`/`quality` son enteros (no
strings) para permitir comparaciones/filtros numéricos directos.

## Fuentes

- **items.json, trinkets.json, cards-runes.json, synergies.json**: scrapeados
  de [tboi.com](https://www.tboi.com) (Platinum God — Isaac Cheat Sheet),
  vía HTML parseado directamente (sin protección anti-bot), el 2026-07-31.
- **pills.json, characters.json, routes.json, marks.json, starting-items.json**: scrapeados de
  [bindingofisaacrebirth.wiki.gg](https://bindingofisaacrebirth.wiki.gg)
  vía la API de MediaWiki (`action=parse`), el 2026-07-31.

Estos son la capa de datos "genérica" — la fuente de verdad del usuario
(bases propias) tiene prioridad sobre esto cuando ambas existan.

## Pendiente

- `unlocks.json` (achievements/desbloqueables generales) — a definir si se
  scrapea de la wiki o se carga a mano desde la base propia del usuario.
- Mecanismo de sync entre 3 dispositivos (JSON export/import u otro, a definir).
- Posible scraper propio y actualizado de wiki.gg, construido dentro de
  Claude Code, para refrescar estos datos automáticamente en el futuro.
