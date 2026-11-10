# MANUAL DE ARQUITECTURA, MECÁNICAS Y CONTEXTO MAESTRO (v2.2)
> **Directorio del Proyecto:** `C:\experimentoweb`  
> **Versión Actual:** `v2.8` (Edición Móvil/Tablet Twin-Stick Dinámico, Bucle de Monetización Ética, Arquetipos y 75 Reliquias)  
> **Tecnologías:** Vanilla JavaScript (ES6+), HTML5 Canvas 2D, CSS3 (Glassmorphism, Flexbox, Grid), Web Audio API / Audio HTML5.  
> **Dependencias Externas:** CERO frameworks, CERO librerías externas, CERO compiladores (Webpack, Vite o Babel). Ejecutable de forma inmediata abriendo `index.html` en cualquier navegador web moderno.

---

## 1. REGLAS ARQUITECTÓNICAS CRÍTICAS E INVIOLABLES
Para mantener la integridad, estabilidad y rendimiento del juego, cualquier agente o desarrollador futuro debe acatar estrictamente estas reglas:

1. **PROHIBICIÓN ABSOLUTA DE `ctx.fillText` EN EL CANVAS:**
   - Está **estrictamente prohibido** invocar `ctx.fillText` o `ctx.strokeText` sobre el canvas de juego.
   - **Todo el texto**, números, barras de salud, estadísticas, telemetría, textos flotantes de daño, diálogos, minimapa y avisos deben renderizarse **100% mediante elementos DOM HTML/CSS**.
   - El canvas (960x640) está reservado en su totalidad para el renderizado gráfico de entidades, partículas, proyectiles, sombras, telegrafiado de ataques y geometría del entorno.
2. **ACTUALIZACIÓN ORIENTADA A EVENTOS (EVENT-DRIVEN DOM HUD):**
   - Jamás actualizar cadenas o innerHTML del DOM en cada frame dentro de `requestAnimationFrame` o `Game.loop`.
   - Las manipulaciones del DOM están encapsuladas en `UIManager` y se ejecutan exclusivamente cuando ocurre un evento real del juego: impacto de daño (`takeDamage`), recarga o gasto de esquiva (`dodge`), recolección de monedas (`addCoins`), cambio de sala (`transitionToRoom`), adquisición de reliquia (`grantRelic`), cambio de arma (`selectWeapon`) o cambio de fase de jefe (`updateBossStatus`).
3. **GESTIÓN DE CAPAS Y EVENTOS DEL RATÓN (`pointer-events`):**
   - El contenedor flotante del HUD (`.hud-floating-layer`) tiene asignado `pointer-events: none`.
   - Solo los elementos verdaderamente interactivos (botones del menú de pausa, casillas inspeccionables del modal `TAB`, etc.) poseen `pointer-events: auto`.
   - Esto evita que los clics de disparo o arrastre del ratón queden bloqueados o interceptados por áreas transparentes del HUD.
4. **MATEMÁTICA Y PRECISIÓN DE COORDENADAS DEL RATÓN:**
   - La arena de combate se escala responsivamente en el viewport mediante CSS (`aspect-ratio: 960 / 640`), manteniendo siempre proporciones uniformes sin deformación ni estiramiento.
   - En `InputManager`, las coordenadas del cursor se transforman con:
     ```javascript
     const rect = canvas.getBoundingClientRect();
     const scaleX = canvas.width / rect.width;
     const scaleY = canvas.height / rect.height;
     this.mouse.x = (e.clientX - rect.left) * scaleX;
     this.mouse.y = (e.clientY - rect.top) * scaleY;
     ```
   - Esto asegura un apuntado y disparo pixel-perfect sin importar la resolución o escala del monitor del usuario.
5. **ORDEN ESTRICTO DE CARGA DE SCRIPTS EN `index.html`:**
   - `relics.js` se carga **primero**: define el catálogo `RELIC_CATALOG`, las claves `RELIC_KEYS` y la clase `ItemManager`.
   - `combat.js` se carga **segundo**: sistema modular de combate, `COMBAT_CONFIG`, cancelación de animaciones (Dash), corte de proyectiles y Game Juice.
   - `evolutions.js` se carga **tercero**: sistema modular de evolución mecánica de armas (EVOLUTION_DEFS y EvolutionManager estilo Vampire Survivors / Hades).
   - `transmutation.js` se carga **cuarto**: sistema modular de transmutación, reciclaje y forja de reliquias (TransmutationAnvil y TransmutationManager).
   - `script.js` se carga **quinto**: contiene el motor central, física vectorial, clases de armas, entidades, enemigos, jefes, salas, generador de mazmorras y la clase `Game`.

---

## 2. ESTRUCTURA Y MAPA DE ARCHIVOS DEL PROYECTO

```
C:\experimentoweb\
├── index.html                   # Shell de escritorio (PC), capas HUD, modal TAB, pausa y banner detector móvil.
├── index_mobile.html            # Shell dedicado Móvil y Tablet (Twin-Stick flotante, HUD ultra-limpio, fullscreen/landscape).
├── mobile_controls.js           # Módulo de controles táctiles: joysticks dinámicos 360°, auto-aim asistido y selector de altura.
├── mobile_features.js           # Bucle móvil ético: AdManager (simulador de anuncios), arquetipos, resurrección abisal y guardado.
├── dev_console.js               # Consola de diagnóstico, telemetría de BrotherEye y herramientas de rescate (tecla F2).
├── manifest.json                # PWA Web App Manifest (display fullscreen, orientation landscape).
├── icon-192.svg / icon-512.svg  # Iconos vectoriales de la PWA del cerdito.
├── combat.js                    # Módulo desacoplado de combate visceral (COMBAT_CONFIG y CombatSystem).
├── evolutions.js                # Módulo desacoplado de evoluciones de armas (EVOLUTION_DEFS y EvolutionManager).
├── transmutation.js             # Módulo desacoplado de reciclaje y forja de reliquias (Yunque Transmutador).
├── boss_phases.js               # Módulo desacoplado de fases cinemáticas y telegrafiado de Jefes (BossPhaseManager).
├── synergies.js                 # Módulo desacoplado de sinergias emergentes game-breaker (SynergyEngine).
├── events.js                    # Módulo desacoplado de salas de desafío, monolitos y altares de sangre.
├── BrotherEye.js                 # Módulo de Dificultad Adaptativa Inteligente (DDA) basado en telemetría de entrada/salida.
├── relics.js                    # Catálogo maestro de las 75 reliquias, ItemManager y sistema de Hooks.
├── script.js                    # Motor central, Game Loop, entidades, armas, jefes, salas, InputManager y UIManager.
├── CONTEXTO_COMPLETO_PROXIMO_AGENTE.md # Este documento maestro de arquitectura y contexto continuo.
├── cinematica/
│   ├── cinematica inicial.mp4   # Video de introducción narrativa que reproduce al inicio (salto con ENTER).
│   ├── foto del inicio del juego.jpg # Imagen de portada de alta resolución para el menú inicial.
│   └── Musica de intro.mp3      # Pista musical reproducida simultáneamente con el Menú Principal.
├── Before_the_Kingdom_Fades.mp3 # Soundtrack in-game (Tema orquestal).
├── Beneath_the_Forgotten_Sands.mp3 # Soundtrack in-game (Tema ambiental árido).
├── Echoes_of_the_Iron_Titan.mp3 # Soundtrack in-game (Tema industrial rítmico).
└── Liturgy_for_the_Sunken_King.mp3 # Soundtrack in-game (Tema ceremonial abisal).
```

---

## 3. MECÁNICAS DETALLADAS DEL JUGADOR (`Player` & `PlayerSpriteAnimator`)

### 3.1 Movimiento y Físicas
- Posición continua de coma flotante (`x, y`), vectores de velocidad (`vx, vy`).
- Velocidad base de desplazamiento: `270 px/s`, modificable por estadísticas pasivas de reliquias (`player.speed`).
- Fricción y desaceleración suave para un control responsivo y preciso con `W, A, S, D`.

### 3.2 Sistema de Esquiva Evasiva (Dash) Asimétrico
- **Cargas Disponibles:** 2 cargas instantáneas de base (`this.maxDodgeCharges = 2; this.dodgeCharges = 2;`).
- **Recarga Asimétrica:**
  - Si el jugador gasta una sola carga y aún le queda otra disponible, la carga gastada se recupera rápidamente en **1.5 segundos** (`dodgeCooldownSingle = 1.5s`).
  - Si el jugador agota consecutivamente ambas cargas (`dodgeCharges === 0`), sufre una penalización de recuperación de **2.5 segundos** (`dodgeCooldownEmpty = 2.5s`) para reactivar la primera carga.
- **Salto y Evasión sobre Abismos:**
  - Durante el dash (`dodgeActiveTimer = 0.18s`), el cerdito ejecuta un impulso balístico con elevación visual de salto calculada por:
    ```javascript
    const jumpElevation = -12 * Math.sin((this.dodgeActiveTimer / 0.18) * Math.PI);
    ```
  - Mientras el cerdito esté en el aire durante el dash, sobrevuela libremente sobre abismos (`RoomPit`) sin precipitarse al vacío. Solo cae si su dash finaliza exactamente sobre un foso o agujero.
- **Invulnerabilidad:**
  - El dash otorga **0.28 segundos de invulnerabilidad total** (`invulnerableTimer = 0.28s`), esquivando cualquier bala enemiga o proyectil en vuelo, y emite partículas cian fluorescentes (`#93c5fd`).

### 3.3 Texturas Procedurales y Sprite Animator del Chanchito
- Clase `PlayerSpriteAnimator`: renderiza un cerdito con sombras dinámicas, orejas, hocico, ojitos expresivos y cola enroscada mediante primitivas Canvas 2D (arcos, curvas de Bézier, degradados suaves).
- **4 Direcciones Cardinales:**
  - `abajo`: vista frontal con hocico redondeado y ojos curiosos.
  - `arriba`: vista dorsal con colita enroscada y orejas plegadas.
  - `izquierda` / `derecha`: vista lateral con perfil anatómico y patitas sincronizadas con el ciclo de marcha.
- **Ciclo de Caminata:** Oscilación rítmica con `Math.sin(animTimer * 14)` para emular el trote cómico del cerdito mientras corre.

---

## 4. SISTEMA DE COMBATE, ESTADÍSTICAS Y ARMAS

### 4.1 Armas Disponibles (Intercambiables con Teclas 1-4 o Q/E)
1. **Proyectiles Estándar (`ProjectileWeapon` - Ícono 🏹):**
   - Disparo a distancia con balística rápida hacia la posición del cursor.
   - Se beneficia directamente de `extraProjectiles` disparando en abanico con dispersión angular calculada simétricamente.
2. **Espada Larga (`LongSwordWeapon` - Ícono ⚔️):**
   - Barrido frontal en arco de 110 grados con gran daño físico y empuje masivo (*knockback*).
   - Bloquea y destruye proyectiles enemigos comunes que entren en contacto con el filo del acero.
3. **Sierras Orbitales (`OrbitalSawsWeapon` - Ícono 🪚):**
   - Hojas de sierra giratorias que orbitan permanentemente alrededor del jugador.
   - Infligen daño continuo por contacto a cualquier enemigo que intente acercarse al cuerpo a cuerpo.
4. **Láser Carga (`ChargeLaserWeapon` - Ícono ⚡):**
   - Disparo de haz penetrante de alta tecnología.
   - Requiere mantener presionado el botón de disparo para acumular energía; al soltar o completarse la carga, emite un haz colosal que atraviesa a todos los enemigos en su trayectoria.

### 4.2 Fórmulas de Estadísticas del Jugador
- **Daño Saliente:** `baseWeaponDamage * player.damageMultiplier * (isCrit ? 2.0 : 1.0)`.
- **Probabilidad Crítica (`player.critChance`):** Escala de 0.0 a 1.0. Los impactos críticos generan textos flotantes dorados y duplican el daño infligido.
- **Mitigación por Placas de Defensa:**
  ```javascript
  getDefenseMitigationMultiplier() {
    return 100 / (100 + Math.max(0, this.baseDefense));
  }
  ```
  - Evita invulnerabilidad absoluta mediante una asíntota hiperbólica: 50 defensa = 33% mitigación, 100 defensa = 50% mitigación.
- **Economía y Magnetismo de Monedas:** Las monedas de oro caídas por enemigos (`Coin`) son atraídas por un campo magnético vectorial hacia el jugador (`coinMagnetMultiplier`).

---

## 5. SISTEMA DE AFINIDADES ELEMENTALES

El juego incluye 6 afinidades elementales almacenadas en `player.elementalPool`:
1. **Fuego (🔥):** Inflige quemaduras periódicas de daño en el tiempo (*DoT*).
2. **Hielo (❄️):** Aplica ralentización de velocidad de movimiento y enfriamiento a los enemigos impactados.
3. **Rayo (⚡):** Desata arcos voltaicos en cadena que saltan entre los hostiles cercanos.
4. **Veneno (🧪):** Corrosión prolongada que reduce la resistencia enemiga.
5. **Tierra / Roca (🪨):** Genera fragmentación de metralla e impactos pesados.
6. **Milagro (✨):** Procs celestiales de regeneración de escudo y daño radiante.

- **Proc Chance:** 50% de probabilidad fija por impacto (`CONFIG.ELEMENTAL_PROC_CHANCE = 0.50`).
- **Nivel de Maestría:** Cada cofre elemental o mejora sube el nivel del elemento (`Lv. 1`, `Lv. 2`, etc.), aumentando el daño elemental en +20% por nivel adicional.
- **Visualización en HUD:** La afinidad primaria activa se muestra en una pastilla compacta pegada a la tarjeta del arma (`#hud-element-badge`) en la esquina inferior izquierda. En el menú `TAB`, se desglosan todos los elementos activos con sus niveles y bonificadores.

---

## 6. SISTEMA DE RELIQUIAS (75 RELIQUIAS) Y MOTOR DE HOOKS (`relics.js`)

### 6.1 Arquitectura Basada en Hooks
La clase `ItemManager` gestiona el inventario sin límite de capacidad y despacha eventos a cada reliquia activa:
- `onHit(target, projectile, damage)`: Invocado al impactar a un enemigo.
- `onKill(enemy)`: Invocado al aniquilar un hostil.
- `onDamageTaken(amount)`: Invocado cuando el cerdito sufre daño.
- `onDodge()`: Invocado al ejecutar exitosamente una esquiva evasiva.
- `onRoomClear(room)`: Invocado al eliminar al último enemigo de la sala.
- `onCrit(target)`: Invocado cuando ocurre un golpe crítico.
- `onWeaponSwitch(newWeapon)`: Invocado al alternar de arma.
- `applyPassiveStats()`: Recalcula y consolida los modificadores pasivos permanentes del jugador (salud máxima, velocidad, daño, armadura, probabilidad crítica, proyectiles extra).

### 6.2 Apilamiento (*Stacking*) de Reliquias
- Cada reliquia en posesión tiene un contador de nivel (`relic.level || 1`).
- Recoger una reliquia duplicada no satura casillas nuevas, sino que incrementa su stack (`x2`, `x3`, `x5`...), escalando su potencia y efectividad (+20% por stack).
- En el modal de `TAB`, las 75 casillas muestran su código corto (`CR1`, `REG`, etc.), borde del color de su rareza y el número de stack dorado en la esquina inferior.

---

## 7. GENERACIÓN PROCEDURAL DE MAZMORRAS Y SALAS PERSONALIZADAS

### 7.1 Tipología y Límites Dinámicos por Habitación (`room.bounds`)
Las salas ya no son rectángulos estáticos idénticos de 1200x650; cada sala genera sus propios límites transitables:
- `CORRIDOR_H`: Pasillo horizontal auténtico con altura comprimida a 280px (`top: 185, bottom: 465`).
- `CORRIDOR_V`: Pasillo vertical auténtico con ancho comprimido a 360px (`left: 420, right: 780`).
- `UPPER_PATH` / `LOWER_PATH`: Rutas con grandes abismos donde el sendero transitable discurre exclusivamente por la franja superior (`y = 180`) o inferior (`y = 470`).
- `CORNERS`, `CROSS_CHASM`, `TWIN_ISLANDS`, `OPEN`: Salas con fosos perimetrales, puentes interiores o terreno amplio.

### 7.2 Puertas Dinámicas Alineadas a los Caminos
- Las puertas **NO** están fijadas forzosamente en el centro muerto (`centerX: 600, centerY: 325`).
- Se posicionan en las bocas exactas de los caminos transitables:
  - En `UPPER_PATH`, las puertas Oeste y Este se ubican en `y = 180`.
  - En `LOWER_PATH`, las puertas Oeste y Este se ubican en `y = 470`.
  - En los pasillos `CORRIDOR_H` y `CORRIDOR_V`, las puertas se asientan directamente sobre los muros perimetrales de la sala estrecha.
- **Sincronización de Vecinos:** Al generarse el piso (`DungeonFloor.prototype.generate`), las habitaciones contiguas sincronizan y comparten las coordenadas de sus accesos activos.
- **Paso Seguro en Puertas:** `ensureDoorPassages()` despeja automáticamente un radio de seguridad de 55px alrededor de cada umbral activo, garantizando que jamás un abismo o foso bloquee el acceso a una puerta.

### 7.3 Generación Justa y Seguridad de Entrada
- **Distancia Mínima de Spawn (>= 210px):** Enemigos, fosos y trampas nunca se generan a menos de 210px de cualquier puerta activa.
- **Limpieza de Umbral (`transitionToRoom`):** Si algún enemigo se encontrase a menos de 220px del punto por donde ingresa el jugador, es relocalizado automáticamente hacia el fondo de la sala.
- **Retardo de Reacción Inicial (`reactionDelay = 0.25s`):** Al cruzar a una nueva habitación, los enemigos permanecen en pausa táctica durante 0.25 segundos mostrando un icono procedural de alerta `!` sobre sus cabezas, brindando al jugador un instante de lectura táctica antes de que comiencen a perseguir o disparar. Si el jugador ataca a un enemigo durante este retardo, este se activa de inmediato.

---

## 8. ENEMIGOS Y JEFES CON MÁQUINAS DE ESTADOS FINITAS (FSM)

### 8.1 Enemigos Básicos y Minijefes
- **Chaser (`Enemy`):** Hostil de persecución cuerpo a cuerpo.
- **Shooter (`ShooterEnemy`):** Enemigo táctico a distancia que mantiene separación y dispara proyectiles telegrafiados.
- **Splitter (`SplitterEnemy`):** Al morir, se divide en dos enemigos menores rápidos.
- **Worm (`WormEnemy`):** Criatura serpentina segmentada.
- **Elite (`EliteEnemy`):** Versión potenciada (+50% stats) rodeada de un halo blanco brillante; su derrota garantiza la aparición de un cofre de reliquia púrpura.

### 8.2 Los 4 Grandes Jefes Abisales
Cada sección culmina con un jefe diseñado con FSM estricta y Fase 2 al descender del 50% de su salud máxima:
1. **Goliat, El Último Bastión (Sección 1):**
   - *Fase 1:* Marcha frontal con ráfagas en abanico, martillo sísmico con telegrafiado de 1s y embestida de muralla recta. Posee escudo frontal con 80% de reducción de daño (obliga al jugador a flanquearlo por la espalda).
   - *Fase 2 (HP <= 50%):* Entra en frenesí, duplica su velocidad de embestida explosiva agrietando el suelo y ejecuta saltos invulnerables al centro de la arena con ondas expansivas anulares.
2. **Némesis, Señor del Vacío (Sección 2):**
   - *Fase 1:* Juicio ocular con proyectiles *soft-homing*, prisiones geométricas de barreras energéticas y lluvia de gravedad invertida.
   - *Fase 2 (HP <= 50%):* Invoca un clon oscuro idéntico (`NemesisDarkClone`) que replica sus ataques y genera escudos orbitales protectores.
3. **Abismo, El Devorador (Sección 3):**
   - *Fase 1:* Criatura subterránea colosal. Se sumerge excavando bajo tierra (invulnerable mientras se desplaza), emerge violentamente con telegrafiado sísmico y genera un vórtice de succión activa que arrastra al cerdito hacia sus fauces.
   - *Fase 2 (HP <= 50%):* Emboscada triple predictiva, genera suelo agrietado permanente y desata invocaciones de esbirros abisales.
4. **Serafín del Caos (Sección 4 - Jefe Final):**
   - *Fase 1:* Lanzas celestiales del juicio telegrafiada en 0.5s, plumas sacrílegas en espiral y guardia seráfica con contraataque inmediato si el jugador le dispara de frente.
   - *Fase 2 (HP <= 50%):* Combo de estocadas triangulares a doble velocidad y despliegue de 6 espadas suspendidas en el aire que convergen simultáneamente sobre la posición del jugador.

---

## 9. MODOS DE JUEGO, SISTEMA NG+ Y SALA DEL NEXO

1. **Modo Normal:**
   - Dificultad estándar balanceada para aprendizaje y recorrido progresivo (NG+ 0).
2. **Modo Mortal con Selector de Nivel NG+ (1 a 99):**
   - Configurable en el menú inicial mediante un control numérico (*stepper* `-` y `+`).
   - Los enemigos multiplican exponencialmente su salud y daño por `x(4 * NG+)`.
   - **Doble Drop:** Los cofres otorgan doble recompensa de reliquias.
   - **Kit de Inicio Abisal:** El jugador comienza con monedas y reliquias iniciales proporcionales a su nivel de NG+.
3. **Sala del Nexo (`NexusRoom`):**
   - Al derrotar al jefe de una sección en NG+ >= 1, el jugador ingresa a la cámara del nexo místico con 3 altares interactivos:
     - **Altar de la Mente (Izquierda):** Conserva todas las Reliquias y sus niveles, pero reinicia las estadísticas base a valores iniciales.
     - **Altar del Cuerpo (Derecha):** Conserva las estadísticas base súper altas acumuladas, pero vacía el inventario de reliquias.
     - **Altar del Abismo (NG+ >= 2):** Conserva absolutamente TODO (reliquias y estadísticas) y aumenta el nivel de NG+ para un desafío extremo.

---

## 10. REFACTORIZACIÓN COMPLETA DE UI Y HUD (v2.2)

### 10.1 Arena a Pantalla Completa y Escalado Dinámico
- Se eliminaron por completo las antiguas columnas laterales fijas de 310px y 330px.
- La arena de combate ocupa el **100vw x 100vh** de la pantalla, centrada mediante CSS:
  ```css
  .canvas-wrapper {
    position: relative;
    width: 100vw;
    height: 100vh;
    max-width: calc(100vh * (960 / 640));
    max-height: calc(100vw * (640 / 960));
    aspect-ratio: 960 / 640;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #090d16;
    box-shadow: 0 0 60px rgba(0, 0, 0, 0.95);
    overflow: hidden;
  }
  ```

### 10.2 Componentes del HUD Flotante en Pantalla de Combate
1. **Arriba a la Izquierda (`#hud-top-left`):**
   - Tarjeta translúcida con la Barra de HP (Integridad Vital), badge de estado de escudo y contador de Oro (`#coin-count`).
   - **Limpieza de Reliquias:** Las cajas de reliquias fueron retiradas por completo de este contenedor para no saturar la vista. Las reliquias se consultan exclusivamente con la tecla `TAB`.
2. **Arriba a la Derecha (`#hud-top-right`):**
   - **Minimapa DOM Minimalista (`#dom-minimap`):** Cuadrícula minimalista con nodos que reflejan la sala actual (brillo cian), salas visitadas, puertas cardinales, salas de élite, tienda y jefe.
   - **Telemetría de Sala:** Nombre de sala y distintivo de puertas abiertas/bloqueadas.
   - **Banner de Nivel y Versión (`#hud-level-banner`):** Despliega la versión, Sección, Nivel y NG+ activo, y **se desvanece suavemente a los 3.5 segundos** (`opacity: 0`), volviendo a aparecer brevemente al cambiar de piso o sección.
3. **Abajo a la Izquierda (`#hud-bottom`):**
   - Dock translúcido ultra-compacto (`background: rgba(8, 14, 26, 0.4); backdrop-filter: blur(6px)`), situado a `bottom: 14px; left: 14px;`.
   - Deja completamente libre el centro de la arena y la puerta sur.
   - Contiene:
     - **Cargas de Esquiva:** 2 pips luminosos cian (listos o recargando con pulsación suave).
     - **Arma Activa:** Ícono dinámico del arma equipada (🏹, ⚔️, 🪚, ⚡) y su nombre.
     - **Afinidad Elemental:** Distintivo adherido al arma con punto cromático y nivel de maestría.
4. **Notificación Flotante Superior (`#arena-toast`):**
   - Posicionada a `top: 80px; left: 50%; transform: translate(-50%, -10px);`.
   - **Comportamiento Auto-Desvanecible:** Inicia con `opacity: 0` (invisible sin ocupar espacio visual). Al invocarse `showToast(mensaje, duration = 3000)`, se anima a `opacity: 1`, permanece visible 3 segundos y se desvanece automáticamente a `opacity: 0`. Despejada del marco para no tapar la puerta norte.
5. **Barra de Salud de Jefe Contextual (Estilo Bloodborne / Souls):**
   - `#boss-panel`: Oculto por defecto (`display: none !important;`).
   - Solo se muestra al ingresar a una Cámara de Jefe activa (`room.type === 'BOSS'`).
   - Gran barra horizontal carmesí de 660px centrada en la parte superior, con línea divisoria dorada al 50% de HP (umbral de Fase 2), nombre imponente en tipografía dorada/blanca, indicador de fase (`FASE 1` / `FASE 2`), estado actual de la máquina FSM del jefe y nivel de defensa/mitigación activa. Desaparece al derrotar al jefe o salir de la sala.

### 10.3 Modal Táctico de Estadísticas y Catálogo Completo (Tecla `TAB`)
- Se activa manteniendo presionada la tecla **`TAB`** (`keydown` abre, `keyup` o `blur` cierra).
- **Cero Scroll Horizontal Global:** `overflow-x: hidden;` estricto en `.tab-modal`, `.tab-content-grid` y distribución `grid-template-columns: 280px minmax(0, 1fr)`.
- **Columna Izquierda:** Lista completa de estadísticas de combate en tiempo real (Multiplicador de daño, cadencia, proyectiles extra, crítico, velocidad, cargas de dash, armadura, magnetismo) y lista de afinidades elementales activas.
- **Columna Derecha:**
  - Catálogo completo de las 75 reliquias con casillas responsivas (`repeat(15, minmax(0, 1fr))`).
  - **Scroll Vertical Interno Independiente (`overflow-y: auto`):** Permite recorrer las reliquias sin desfasar el resto de la ventana ni la columna de estadísticas.
  - **Inspector Interactivo de Reliquias:** Muestra título, rareza y descripción completa con ajuste de texto garantizado (`word-wrap: break-word; white-space: normal`).

### 10.4 Menú de Pausa y Configuración (Tecla `ESC`)
- Presionar la tecla **`ESC`** pausa limpiamente la ejecución lógica del juego (`this.isPaused = true`), congelando físicas, proyectiles y animaciones sin desfasar `deltaTime`.
- Despliega un modal centrado con:
  - **Control Independiente de Audio:** Sliders de volumen para Música y Efectos SFX, botón de salto de pista y botón de silencio.
  - **Mapa de Controles:** Guía rápida de atajos de teclado.
  - **Botones de Acción:** "CONTINUAR [ESC]" y "REINICIAR INCURSIÓN [R]".

---

## 11. SISTEMA DE AUDIO Y EFECTOS DE SONIDO

1. **Gestor de Música (`MusicManager`):**
   - Pistas de combate en raíz: `Before_the_Kingdom_Fades.mp3`, `Beneath_the_Forgotten_Sands.mp3`, `Echoes_of_the_Iron_Titan.mp3`, `Liturgy_for_the_Sunken_King.mp3`.
   - Reproducción aleatoria no repetitiva: baraja la lista evitando que la misma canción suene dos veces seguidas.
   - Pista de introducción: `cinematica/Musica de intro.mp3`, sincronizada con el Menú Principal.
   - Control de volumen independiente sincronizado entre el menú principal y el menú de pausa.
2. **Gestor de Efectos (`SoundEffectManager`):**
   - Sonidos de disparo, impactos, explosiones, dash, apertura de cofres y golpes críticos.
   - **Atenuación Anti-Fatiga Auditiva:** Cuando un mismo efecto de sonido se repite en ráfagas cortas consecutivas, las repeticiones subsiguientes atenúan automáticamente su volumen para no saturar ni molestar al jugador.
   - Slider de volumen SFX independiente en menú y pausa.

---

## 12. CINEMÁTICA INICIAL Y ACTIVOS MULTIMEDIA

1. **Video de Introducción (`cinematica/cinematica inicial.mp4`):**
   - Se reproduce automáticamente al abrir la aplicación en el navegador.
   - Tecla **`ENTER`** o botón de salto permiten omitir la cinemática en cualquier momento, pasando inmediatamente al Menú Principal.
2. **Menú Principal de Portada:**
   - Fondo de alta resolución: `cinematica/foto del inicio del juego.jpg`.
   - Botón gigante animado "JUGAR", selector de Modo Normal y Modo Mortal con *stepper* de NG+ y sliders de volumen.

---

## 13. GUÍA DE VERIFICACIÓN Y HERRAMIENTAS PARA EL PRÓXIMO AGENTE

En la carpeta `<appDataDir>\brain\<conversation-id>\scratch\` se encuentran los scripts de verificación automatizada:
1. `verify_all.py`:
   - Verifica el balance de corchetes, llaves y paréntesis en `script.js` (debe ser `0`).
   - Verifica que existan **0 llamadas activas a `ctx.fillText`** (Inviolable).
2. `verify_ids.py`:
   - Verifica la presencia y consistencia de los 57 identificadores DOM requeridos por `UIManager` y los gestores de audio en `index.html`.

### Reglas de Oro al Ejecutar Comandos en Windows PowerShell:
- **Evitar comillas simples anidadas en comandos `-Command`**: PowerShell rompe la sintaxis cuando se anidan comillas dobles y simples en una sola línea. La forma más robusta es escribir scripts en archivos temporales `.py` y ejecutarlos mediante `python archivo.py`.
- **Codificación UTF-8 en Python**: Todo script de Python ejecutado en Windows debe incluir al inicio:
  ```python
  import sys
  sys.stdout.reconfigure(encoding='utf-8')
  ```
  Esto evita errores de `UnicodeEncodeError (charmap)` al procesar caracteres especiales o emojis (🏹, ⚔️, 🪚, ⚡, ★, etc.).

---
*Fin del Documento de Contexto Maestro v2.2. Este archivo es autosuficiente y provee toda la información técnica necesaria para continuar el desarrollo, balance o creación de nuevas características sin perder el hilo de las decisiones arquitectónicas previas.*

---

## 14. SISTEMAS MODULARES AVANZADOS (v2.5)

### 14.1 Fases Cinemáticas de Jefes y Telegrafiado (`boss_phases.js`)
* **Phase Break al 50% de HP:** Triggered en `Boss.takeDamage()`. Proporciona 1.2s de invulnerabilidad, sacudida de pantalla épica (`CombatSystem.triggerScreenShake(24, 0.75)`), hit-stop (0.38s), onda expansiva de empuje segura y banner cinemático en HTML (`#boss-cinematic-banner`).
* **Peligros Mecánicos Activos:**
  * `BossShockwaveHazard`: Anillo sísmico expansivo; evadible al 100% mediante I-Frames del Dash o Parry.
  * `AbyssalGeyserHazard`: Círculos de peligro telegrafiados que detonan en columnas oscuras persistentes.
  * `CelestialJudgmentPillar`: Columnas verticales de juicio divino que castigan la sala tras 0.85s.
* **Escalado Anti-Esponja:** Reducción del 22% del HP base de Jefes para garantizar duelos rápidos y rítmicos.

### 14.2 Motor de Sinergias Emergentes Game-Breaker (`synergies.js`)
* **Filosofía *The Binding of Isaac*:** Las sinergias mecánicas rompen el juego en combinaciones extravagantes:
  * `KINETIC_CHAOS`: +45% de daño por rebote en pared, tamaño agrandado y ondas de choque sísmicas.
  * `ABSOLUTE_ZERO`: El Láser congela enemigos por 2.2s y genera fisuras criogénicas que ralentizan proyectiles un 70%.
  * `VOLCANIC_SUPERNOVA`: Los proyectiles pesados detonan en un anillo de 6 meteoritos ardientes (`VolcanicMeteorProjectile`).
  * `THUNDER_GOD_PARRY`: Desviar proyectiles convoca relámpagos divinos sobre TODOS los enemigos de la sala y reinicia el Dash.
  * `PLASMA_VORTEX`: Las sierras absorben balas enemigas y disparan contraataques de plasma teledirigidos.
  * `GRAVITATIONAL_SINGULARITY`: Vórtice gravitatorio continuo (160px) que agrupa enemigos hacia los disparos.
  * `SHADOW_SWARM`: Enemigos caídos liberan almas espectrales aliadas (`ShadowSoulEntity`).
* **Banner en DOM:** `#synergy-unlock-banner` avisa en tiempo real con fanfarria de sintetizador.

### 14.3 Salas de Desafío y Eventos de Alto Riesgo (`events.js`)
* `ChallengeMonolith`: Monolito de hordas en salas de combate de élite (`HardRoom`). Al activarse con `[E]`, bloquea las puertas y genera 2 oleadas de enemigos élites y colosos. Al vencerlos, desbloquea las puertas y otorga el **Cofre del Gran Campeón** (`ChampionChest`) con +45 Oro, +20 Gemas y Reliquia de alto nivel.
* `BloodPactAltar`: Altar de sangre en `SanctuaryRoom`. Permite sacrificar 25 HP a cambio de un +35% de Daño de Ataque permanente para toda la partida.

### 14.4 Algoritmo de Dificultad Adaptativa por Estados (`BrotherEye.js` v2.0)
* **Arquitectura de Estados del Autor (`ESTADO -1` a `ESTADO 4`):**
  * **ESTADO -1 (`globalClock`):** Reloj interno continuo desde que el jugador entra por primera vez hasta que muere (`onPlayerDeath`). **Solo** se reinicia al empezar un `NG+` nuevo o al reiniciar la partida con `R` (`BrotherEye.initialize(player, reason)`).
  * **ESTADO 0 (`INITIALIZE`):** Registra Vida total (`maxHp`), Escudo (`shield`), Velocidad (`speed`), Proyectiles, Multiplicador de Daño y Cantidad total de reliquias (`ownedRelics.length`, solo cantidad).
  * **ESTADO 1 (`ROOM_ENTER`):** Aplica dinámicamente la adaptación calculada a la habitación entrante (`applyAdaptationToRoom`: modifica **cantidad de enemigos**, **daño enemigo** de contacto/proyectiles y un poco su **velocidad**), registra vida/escudo de entrada, enemigos iniciales y arranca el **segundo reloj** (`roomClockSeconds`).
  * **ESTADO 2 (`MIDPOINT` al 50% de enemigos):** Al caer el 50% de los enemigos en tiempo real (`onRoomTick`), registra vida actual, tiempo del segundo reloj en la primera mitad, vida perdida (`Vida_i - Vida_actual`), nuevas reliquias, enemigos abatidos por segundo (`kpsFirstHalf`) y daño recibido por segundo (`dtpsFirstHalf`).
  * **ESTADO 3 (`ROOM_COMPLETE`):** Al abatir el 100% de los enemigos, registra vida final, reliquias totales, tiempo total empleado, velocidad por intervalos (`combatSlowdownRatio`) y la métrica clave: **Daño Recibido por Segundo de Combate (`dtpsTotal`)**.
  * **ESTADO 4 (`DIFFICULTY_UPDATE`):**
    * Calcula 5 indicadores (0 a 100): Supervivencia ($S$, 30%), Potencia ($P$, 20%), Velocidad ($V$, 20%), Eficiencia/DTPS ($E$, 20%) y Progresión ($G$, 10%).
    * Ecuación maestra: $R = 0.30S + 0.20P + 0.20V + 0.20E + 0.10G$, comparada con $R_{\text{esperado}} = 65$ ($\Delta = R - 65$).
    * **Dados de Ruido y "Pies en la Tierra":** Tira dados en cada indicador para hallar `maxPoint` y `minPoint`, y un segundo dado de ruido (`noiseRoll`). Si el jugador lleva una build rota dominando varias salas (`godStreak >= 2`, modo `ACOMPAÑAR_BUILD` que suma horda sin inflar vida esponja) y sale el ruido más bajo, activa **`PIES_EN_LA_TIERRA`**, inyectando en la próxima sala un pico de cantidad (+45% a +65%), daño (+30% a +48%) y velocidad (+12% a +18%) para que no se confíe.

### 14.5 Rediseño Integral UX/UI - Regla de los 3 Segundos y Sistema Anti-Frustración (v2.5)
* **Filosofía Mobile / Quick-Play:** Diseñado para partidas ágiles de 5-10 minutos (esperando el colectivo o el médico), sin interfaces confusas ni textos truncados.
* **Cofres de Combate SIEMPRE GRATIS:** Los cofres de recompensa por limpiar salas, derrotar élites o jefes (`RelicChest`, `ChampionChest`) son **100% gratuitos**. Se eliminó definitivamente cualquier bloqueo por llave tras el combate.
* **Mecánica Anti-Runs Muertas (Forzado con Sangre):**
  * `LockedChest`: Si el jugador tiene llaves, abre con `1 Llave 🔑`. Si tiene `0 Llaves`, puede pulsar `[E]` para **Forzar el Candado (-15 HP ❤️)**. Nunca se queda mirando un cofre sin poder abrirlo.
  * `VaultChest` (Salas del Tesoro): Abre con `1 Llave 🔑`, `30 🪙 Oro`, o forzando con `-25 HP ❤️`.
* **Rediseño del Yunque Transmutador (`transmutation.js`):**
  * **CERO coste de llaves**: Las llaves ya no se usan en la forja.
  * **1 Uso Gratuito por Sala / Yunque**: El primer uso de Transmutar o Fundir es 100% libre de coste (`freeUses: 1`). Los reusos posteriores en el mismo yunque cuestan 25 Oro.
  * **Fundir Salvavidas:** Desarmar una reliquia indeseada otorga **+35 HP curados + 1 Llave 🔑 garantizada + 25 Oro 🪙**. Resuelve instantáneamente la falta de llaves o la poca salud en momentos críticos.
  * **Reforja de Maestría:** Subir +1 Nivel a una reliquia cuesta **30 🪙 Oro** (sin llaves).
  * **Tarjetas sin Acrónimos Crípticos:** Eliminadas las siglas de 3 letras ("INS", "PES", "CAL"). Se muestran iconos temáticos (⚔️, 🛡️, ❤️, ⚡, 🧪, ⏳, 🪶), títulos completos, nivel en estrellas y descripciones completas sin cortes (eliminado `-webkit-line-clamp: 2`).
* **Burbuja Flotante de Inspección / Prompt en el Mundo (`#world-interact-prompt`):**
  * Proyecta una burbuja glassmorphic translúcida sobre el canvas cuando el cerdito se acerca a menos de 65px de una entidad interactiva (`TransmutationAnvil`, `LockedChest`, `VaultChest`, `ShopItem`, `SanctuaryAltar`, `ChallengeMonolith`, `BloodPactAltar`).
  * Muestra la tecla `[E]`, el nombre del objeto, descripción y costo en tiempo real.
  * **Prioridad de Tecla `KeyE`:** Al presionar `E` cerca de un interactuable, se ejecuta la interacción prioritariamente y NO cambia de arma.
  * **Cero Compras / Activaciones Accidentales:** Caminar sobre altares, monolitos o tiendas ya no auto-compra ni activa eventos por colisión fortuita; requiere presionar `[E]` o hacer clic en el prompt.
* **Limpieza de Pantalla:** Se ocultó `#btn-sanctuary-quick` durante el combate activo (`display: none !important;`) para no saturar la pantalla con menús de meta-progreso durante la partida.


---

## 15. SISTEMA DE MONETIZACIÓN ÉTICA, BUCLE MÓVIL Y ARQUETIPOS (`mobile_features.js` v2.6)

Diseñado específicamente para el bucle de juego de **5 a 10 minutos** (esperando el colectivo o el médico), asegurando que el juego sea divertido, justo y libre de pay-to-win.

### 15.1 Simulador de Anuncios Recompensados Éticos (`AdManager`)
* **CERO Anuncios Invasivos:** Cero banners molestos, cero popups forzados en medio del gameplay. Todos los anuncios son **100% optativos**.
* **Simulador Modal Integrado (`#ad-simulator-modal`):**
  * Simula un anuncio breve de 5 segundos con barra de progreso fluida y descripción narrativa temática ("Sintonizando transmisión del abismo...").
  * Permite cancelar sin penalización (`ad-sim-btn-cancel`).
  * Otorga recompensas de alto valor: duplicar gemas al morir/ganar, giros gratuitos en el oráculo del santuario, o abrir un maletín de rescate.

### 15.2 Sistema de Arquetipos de Chanchitos (`PIG_ARCHETYPES`)
Personalidades y estilos de juego desbloqueables desde el Santuario:
1. **Classic Pig (Cerdito Aventurero):** Balance estándar (100 HP, 2 Dashes, sin modificadores negativos).
2. **Berserker Hog (Jabalí Furia Sangrienta):** +35% Daño base, +10% Velocidad, pero -20 Max HP y no puede equipar escudos pasivos.
3. **Cyber-Pig (Tecno-Cerdito Blindado):** Comienza con +40 Escudo de energía, regeneración pasiva de escudo cada 12s y Afinidad Eléctrica Lv.1.
4. **Golden Tycoon (Chanchito Magnate):** Inicia la run con 80 🪙 Oro y 3 🔑 Llaves; +25% de oro en cofres, pero las tiendas son un 15% más caras.
5. **Cinder Demon (Demonio de las Cenizas):** Fija Max HP en 65, pero otorga 3 cargas de Esquiva instantáneas, rastro de fuego ardiente y Afinidad Fuego Lv.1.

### 15.3 Resurrección Abisal de Emergencia (`ReviveManager`)
* **1 Sola Resurrección por Partida:** Al morir por primera vez, el juego pausa y abre `#revive-modal`.
* El jugador puede revivir mediante **Anuncio Simulado** o gastando **Gemas del Vacío** acumuladas.
* Al resucitar: restaura el **60% del HP máximo**, repele a todos los enemigos cercanos con una onda expansiva y otorga **3 segundos de invulnerabilidad total**.
* Una segunda muerte dispara el Game Over definitivo (`hasUsedAbyssalRevive = true`).

### 15.4 Guardado y Reanudación de Partida en Curso (`RunSaveManager`)
* Permite pausar y tocar "GUARDAR Y SALIR" (`btn-pause-save-quit`) para cerrar el navegador sin perder el progreso de una run.
* Guarda de forma atómica en `localStorage` (`roguelike_active_run_save`): HP, Escudo, Oro, Llaves, Gemas, Reliquias equipadas con sus niveles, Arma activa con su modo, y el Nivel / Sección actual.
* Al abrir el juego, el Menú Principal detecta la partida y muestra el botón dorado pulsante **`▶ CONTINUAR PARTIDA`** con el resumen de la run guardada.

---

## 16. CORRECCIÓN DE FÍSICAS, RENDERIZADO Y PREVENCIÓN DE BUGS VISUALES

Para evitar que regresen problemas históricos de renderizado y colisión en el motor Canvas:

1. **Screen-Shake Clamping Seguro en `Game.draw`:**
   * Cuando se produce un screen shake extremo (sacudida por explosiones de jefes o impactos críticos de 25+ píxeles), las coordenadas de renderizado del canvas se recalculan garantizando que nunca se produzcan artefactos de arrastre (*smearing*) ni que los bordes de la sala se "pinten" con estelas de partículas.
   * `ctx.clearRect(0, 0, canvas.width, canvas.height)` se ejecuta en cada ciclo de dibujado antes de aplicar la transformación de cámara.
2. **Corte Balístico de Mega Haz en Paredes (`MathUtils.getRayWallIntersection`):**
   * El Mega Láser (modo secundario del Rayo Láser) proyecta un rayo continuo que ahora se frena físicamente en el límite interior de la sala (`room.bounds`).
   * No atraviesa muros exteriores ni sangra colores sobre los bordes negros externos.
3. **Monolito de Combate Élite 100% Funcional (`events.js`):**
   * Se corrigió el bug histórico donde presionar el monolito no generaba enemigos y dejaba un cofre de la nada.
   * Ahora genera 2 oleadas completas de enemigos élites y colosos reales (`waveEnemies`), sella las 4 puertas de la sala con barrotes durante el combate (`cleared = false`), y solo al vencer a todos los enemigos genera el **Cofre del Campeón** y reabre las puertas.
4. **Candados y Puertas con Colisión Sólida Real:**
   * Los cofres bloqueados (`LockedChest`) y las puertas cerradas (`Door`) tienen colisión elástica sólida: el cerdito no puede atravesarlos ni "clipear" en las paredes.
   * Solo se abren deliberadamente al presionar `[E]` o forzarlos con sangre (`-15 HP`).

---

## 17. EDICIÓN MÓVIL Y TABLET DEDICADA (`index_mobile.html`, `mobile_controls.js`, `manifest.json` v2.8)

El juego cuenta con una versión móvil y tablet 100% nativa e independiente, desplegada públicamente en:
👉 **`https://andino2008.github.io/Chanchito/index_mobile.html`**

### 17.1 Arquitectura Twin-Stick Flotante Dinámica (360°)
* **Mitad Izquierda (0% - 50% de la pantalla) — Movimiento Dinámico:**
  * Zona táctil libre (`#mobile-zone-left`).
  * Donde sea que el jugador apoye su pulgar izquierdo (en celular o tablet), ahí mismo se ancla el joystick analógico `#mobile-stick-base-move`.
  * Deslizar mueve al cerdito suavemente en 360°. Al levantar el pulgar, el stick se desvanece y la velocidad se resetea a cero.
* **Mitad Derecha (50% - 100% de la pantalla) — Apuntado y Disparo Dinámico:**
  * Zona táctil libre (`#mobile-zone-right`).
  * **Cero botones rígidos**: Al igual que la izquierda, el joystick de apuntado `#mobile-stick-base-aim` se ancla automáticamente donde el pulgar derecho toca la pantalla.
  * **Auto-Aim Asistido Inteligente (Tap / Mantener sin arrastrar):** Si el jugador toca o mantiene el pulgar en el lugar (desplazamiento < 8px), el motor escanea la sala en busca del enemigo vivo más cercano y apunta/dispara automáticamente hacia él en tiempo real.
  * **Apuntado Manual 360° (Arrastrar):** Si el jugador desliza el pulgar más de 8px (zona muerta ultra-sensible), el apuntado pasa a ser 100% manual en el ángulo exacto del dedo.

### 17.2 Botones de Acción Chunky y Altamente Sensibles
Ubicados en la zona lateral derecha, con volumen generoso y respuesta instantánea:
* **`⚡ DASH` (`#btn-touch-dodge`):** Botón circular grande de 66px con borde neón reforzado y contador de cargas en tiempo real (`x2`). Tocarlo activa la esquiva y consume la carga atómicamente con vibración háptica (`navigator.vibrate(25)`).
* **`⚡ MODO` (`#btn-touch-mode`):** Botón amplio y acolchado en oro neón para alternar el modo secundario de disparo (`[ESPACIO]`).
* **`🔄 ARMA` (`#btn-touch-swap`):** Botón en púrpura neón para rotar al instante entre las armas desbloqueadas (`[Q/E]`).
* **`🖐️ INTERACTUAR` (`#btn-touch-interact`):** Botón contextual verde esmeralda que late e ilumina solo cuando el cerdito está cerca de un cofre, puerta, yunque o monolito, permitiendo abrirlo con un toque sin superponerse con ningún otro elemento.

### 17.3 Selector Rápido de Altura Ergonómica (`🕹️ ALTURA`)
* En la barra superior móvil (`#mobile-top-bar`) se encuentra el botón de ajuste ergonómico:
  * **`ALTURA: MEDIA` (Predeterminada):** Posiciona el cluster de botones a media altura vertical (`bottom: clamp(75px, 25vh, 220px)`), donde reposan naturalmente los pulgares al sostener el dispositivo con ambas manos.
  * **`ALTURA: ALTA (TABLET)`:** Eleva los controles hacia el centro vertical (`bottom: clamp(130px, 40vh, 360px)`), diseñado para tablets de 10" o 12" donde el agarre lateral es más elevado.
  * **`ALTURA: BAJA`:** Ubica los controles abajo en la esquina (`bottom: 14px`), ideal para jugar con una sola mano en celulares pequeños.
* La preferencia se guarda automáticamente en `localStorage` (`mobile_controls_height`).

### 17.4 Despeje Radical del HUD (Esquinas Superiores 100% Visibles)
* **Eliminación del Dock de Armas en Combate:** Se ocultó `#hud-bottom` en móvil (`display: none !important;`). Toda la información de armas y esquiva se encuentra en los botones táctiles y en el menú de pausa/mochila.
* **Micro-Barra de Vida y Recursos:** Pegada al borde superior izquierdo (`top: 4px; left: 4px;`), con una altura de tan solo 5px para la barra de vida, asegurando que **la esquina superior izquierda de la arena quede totalmente visible**.
* **Minimapa Micro-Radar Translúcido:** En el borde superior derecho (`top: 4px; right: 4px;`), con un tamaño de 65x38px y opacidad reducida al 45%, permitiendo ver a través de él para no perder de vista enemigos o proyectiles en la esquina superior derecha.
* **Ocultación de Telemetría:** Se ocultó el pill de telemetría de consola F2 en móvil.

### 17.5 Manejo de Orientación Horizontal (Landscape) y PWA
1. **Fullscreen & Orientation Gate:** Pantalla de bienvenida al cargar (`#mobile-fullscreen-entry`) que solicita pantalla completa y bloquea la orientación en horizontal (`screen.orientation.lock('landscape')`).
2. **Protector de Giro (`#mobile-rotate-overlay`):** Si el jugador gira el teléfono a posición vertical, se despliega una pantalla de aviso pidiendo girar el dispositivo y **pausa automáticamente la partida**.
3. **PWA Instalable:** Archivo `manifest.json` e iconos vectoriales `icon-192.svg` y `icon-512.svg` con `"display": "fullscreen"` y `"orientation": "landscape"`, permitiendo instalar el juego en la pantalla de inicio de Android y iOS como una app nativa sin barras de navegación.
4. **Detector en Versión de Escritorio:** En `index.html`, un banner flotante inteligente detecta si el usuario ingresó desde un celular y le ofrece pasar a `index_mobile.html` con un solo clic.

---
