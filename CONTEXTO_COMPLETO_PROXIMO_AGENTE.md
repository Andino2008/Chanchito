# MANUAL DE ARQUITECTURA, MECÁNICAS Y CONTEXTO MAESTRO (v2.2)
> **Directorio del Proyecto:** `C:\experimentoweb`  
> **Versión Actual:** `v2.2` (HUD Minimalista Flotante, Arena Completa, Habitaciones Personalizadas y 75 Reliquias)  
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
   - `script.js` se carga **cuarto**: contiene el motor central, física vectorial, clases de armas, entidades, enemigos, jefes, salas, generador de mazmorras y la clase `Game`.

---

## 2. ESTRUCTURA Y MAPA DE ARCHIVOS DEL PROYECTO

```
C:\experimentoweb\
├── index.html                   # Shell HTML5, capas del HUD flotante, modal TAB, menú de pausa y CSS completo.
├── combat.js                    # Módulo desacoplado de combate visceral (COMBAT_CONFIG y CombatSystem).
├── evolutions.js                # Módulo desacoplado de evoluciones de armas (EVOLUTION_DEFS y EvolutionManager).
├── relics.js                    # Catálogo maestro de las 75 reliquias, ItemManager y sistema de Hooks.
├── script.js                    # Motor central, Game Loop, entidades, armas, jefes, salas, Input y UIManager.
├── CONTEXTO_PROYECTO.md         # Documento de contexto y registro histórico de versiones.
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
