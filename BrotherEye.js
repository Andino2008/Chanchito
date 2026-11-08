/**
 * ============================================================================
 * BROTHEREYE.JS - ALGORITMO DE DIFICULTAD ADAPTATIVA POR ESTADOS (v2.0)
 * ============================================================================
 * Arquitectura diseñada por el autor del proyecto:
 *
 *  - ESTADO -1 (GLOBAL_CLOCK):
 *      Reloj interno continuo desde que el jugador entra por primera vez hasta
 *      que muere. SOLO se reinicia si empieza un NG+ nuevo o reinicia con [R].
 *
 *  - ESTADO 0 (INITIALIZE — Registro Inicial):
 *      Anota Vida TOTAL, Escudo, Velocidad, Proyectiles, Daño base y Cantidad
 *      total de reliquias (solo el número). Registra el tiempo inicial.
 *
 *  - ESTADO 1 (ROOM_ENTER — Entrada a Habitación):
 *      Aplica la dificultad calculada a la sala entrante (Cantidad de enemigos,
 *      Daño enemigo y un poco su Velocidad). Toma la vida y escudo con la que
 *      entró, inicia el segundo reloj (tiempo de sala) y cuenta enemigos totales.
 *
 *  - ESTADO 2 (MIDPOINT — Evaluación Intermedia al 50% de enemigos):
 *      Cuando muere el 50% de los enemigos de la sala, el algoritmo se pregunta:
 *        1. "¿Cuánta vida tiene ahora?"
 *        2. "¿Cuánto tiempo pasó desde que entró a la sala?" (Segundo reloj)
 *        3. "¿Cuánta vida perdió?" (Vida_inicial - Vida_actual)
 *        4. "¿Tiene nuevas reliquias?"
 *        5. "¿Cuántos enemigos derrotó en este primer intervalo y qué DTPS tuvo?"
 *
 *  - ESTADO 3 (ROOM_COMPLETE — Finalización):
 *      Toma Vida final, Reliquias totales, Tiempo total empleado, Enemigos por
 *      intervalo y el Daño Recibido por Segundo de Combate (DTPS).
 *
 *  - ESTADO 4 (DIFFICULTY_UPDATE — Cálculo Adaptativo y Dados de Ruido):
 *      Calcula los 5 indicadores (0 a 100):
 *        S (Supervivencia: 30%), P (Potencia: 20%), V (Velocidad: 20%),
 *        E (Eficiencia DTPS: 20%), G (Progresión: 10%).
 *        R = 0.30*S + 0.20*P + 0.20*V + 0.20*E + 0.10*G
 *        Delta = R - R_esperado (65)
 *      Tira dados sobre cada pequeñez para hallar Punto Máximo y Punto Mínimo,
 *      y tira un segundo dado de Ruido Estocástico (donde el ruido más bajo
 *      detona el Subidón de "Pies en la Tierra" cuando el jugador viene confiado
 *      con una build rota).
 *
 * REGLA INVIOLABLE: Cero llamadas a métodos de dibujo de fuentes en Canvas.
 * ============================================================================
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BrotherEye = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  // ==========================================================================
  // PARÁMETROS CONFIGURABLES PARA EXPERIMENTAR
  // ==========================================================================
  var EYE_CONFIG = {
    ENABLED_BY_DEFAULT: true,

    // Pesos de la Ecuación Maestra: R = 0.30S + 0.20P + 0.20V + 0.20E + 0.10G
    WEIGHTS: {
      S_SURVIVAL: 0.30,    // Supervivencia: cuánta vida y escudo conservaste
      P_POWER: 0.20,       // Potencia: capacidad ofensiva acumulada (daño y proyectiles)
      V_SPEED: 0.20,       // Velocidad: qué tan rápido eliminaste enemigos por intervalo
      E_EFFICIENCY: 0.20,  // Eficiencia: daño recibido por segundo de combate (DTPS)
      G_PROGRESSION: 0.10  // Progresión: cuánto aumentó tu construcción (reliquias y vel. mov)
    },

    // Referencia esperada de rendimiento en una habitación (0 a 100)
    EXPECTED_PERFORMANCE_R: 65.0,

    // Benchmarks de referencia para normalizar a escala 0..100
    BENCHMARKS: {
      EXPECTED_KPS: 0.42,          // Enemigos derrotados por segundo esperados (~1 bicho cada 2.4s)
      CRITICAL_DTPS: 3.20,         // Daño por segundo considerado crítico/masacre
      EXPECTED_RELICS_PER_MIN: 0.8 // Ritmo esperado de obtención de reliquias
    },

    // Límites de los modificadores aplicados a la PRÓXIMA SALA
    LIMITS: {
      // Cantidad de enemigos (Spawn Count Multiplier)
      COUNT_MIN: 0.65,             // Hasta -35% enemigos si está sufriendo mucho
      COUNT_MAX_NORMAL: 1.35,      // Hasta +35% acompañando una build fuerte
      COUNT_MAX_SPIKE: 1.65,       // Hasta +65% en sala de "Pies en la Tierra" (Subidón)

      // Daño de los enemigos (Contacto y Proyectiles)
      DMG_MIN: 0.75,               // Hasta -25% daño enemigo si el jugador sufre
      DMG_MAX_NORMAL: 1.20,        // Hasta +20% daño acompañando build
      DMG_MAX_SPIKE: 1.48,         // Hasta +48% daño en el Subidón de "Pies en la Tierra"

      // Velocidad de los enemigos (Un poco, para no romper las físicas de esquiva)
      SPD_MIN: 0.88,               // Hasta -12% velocidad enemiga
      SPD_MAX_NORMAL: 1.10,        // Hasta +10% velocidad acompañando build
      SPD_MAX_SPIKE: 1.18          // Hasta +18% velocidad en el Subidón
    },

    // Configuración de "Pies en la Tierra" (Acompañar builds rotas sin aburrir)
    GOD_STREAK: {
      R_THRESHOLD: 76.0,           // Si R >= 76, el jugador está dominando cómodamente
      MIN_STREAK_FOR_SPIKE: 2,     // Dejarlo ser un Dios al menos 2 salas antes de poder castigar su confianza
      BASE_LOW_NOISE_TRIGGER: 0.22,// El 22% más bajo del dado de ruido dispara el subidón
      STREAK_BONUS_CHANCE: 0.20    // +20% de probabilidad extra por cada sala seguida en modo Dios
    },

    MAX_HISTORY_LOG: 20
  };

  // ==========================================================================
  // UTILIDADES MATEMÁTICAS INTERNAS
  // ==========================================================================
  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function rollDiceRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function getPlayerRelicCount(player) {
    if (!player || !player.itemManager) return 0;
    if (Array.isArray(player.itemManager.ownedRelics)) {
      return player.itemManager.ownedRelics.length;
    }
    if (player.itemManager.ownedSet && typeof player.itemManager.ownedSet.size === 'number') {
      return player.itemManager.ownedSet.size;
    }
    return 0;
  }

  function getPlayerProjectileCount(player) {
    if (!player) return 1;
    var bonus = player.bonusProjectiles || 0;
    return Math.max(1, 1 + bonus);
  }

  // ==========================================================================
  // MOTOR PRINCIPAL: BROTHER EYE
  // ==========================================================================
  function BrotherEyeEngine() {
    this.enabled = EYE_CONFIG.ENABLED_BY_DEFAULT;
    this.version = '2.0.0-STATES';
    this.config = EYE_CONFIG;

    // ------------------------------------------------------------------------
    // ESTADO -1: Reloj Interno Global (Desde inicio de partida hasta muerte)
    // Solo reinicia en NG+ nuevo o al reiniciar con la tecla R.
    // ------------------------------------------------------------------------
    this.globalClock = {
      active: false,
      elapsedSeconds: 0.0,
      resetReason: 'NONE',
      deathsCount: 0
    };

    // ------------------------------------------------------------------------
    // ESTADO 0: INITIALIZE (Registro Inicial de la Partida / Ciclo)
    // ------------------------------------------------------------------------
    this.state0_initial = {
      initialized: false,
      initialTime: 0.0,
      maxHp: 100,
      shield: 0,
      totalVitality: 100,
      speed: 250,
      damageMultiplier: 1.0,
      projectiles: 1,
      totalRelics: 0
    };

    // ------------------------------------------------------------------------
    // ESTADO 1: ROOM_ENTER (Registro al entrar a la habitación + Segundo Reloj)
    // ------------------------------------------------------------------------
    this.state1_enter = {
      activeInRoom: false,
      roomType: 'NORMAL',
      globalTimeAtEntry: 0.0,
      roomClockSeconds: 0.0, // Segundo reloj exclusivo de la habitación
      entryHp: 100,
      entryShield: 0,
      entryVitality: 100,
      entryRelics: 0,
      entryDamageMult: 1.0,
      entryProjectiles: 1,
      entrySpeed: 250,
      totalEnemiesInitial: 0
    };

    // ------------------------------------------------------------------------
    // ESTADO 2: MIDPOINT (Evaluación al matar el 50% de los enemigos)
    // ------------------------------------------------------------------------
    this.state2_midpoint = {
      triggered: false,
      timeElapsedFirstHalf: 0.0,
      hpAtMidpoint: 100,
      shieldAtMidpoint: 0,
      vitalityAtMidpoint: 100,
      hpLostFirstHalf: 0,
      relicsAtMidpoint: 0,
      newRelicsAcquiredMid: 0,
      enemiesKilledFirstHalf: 0,
      enemiesRemainingMid: 0,
      kpsFirstHalf: 0.0,  // Enemigos derrotados por segundo en la 1ra mitad
      dtpsFirstHalf: 0.0  // Daño recibido por segundo en la 1ra mitad
    };

    // ------------------------------------------------------------------------
    // ESTADO 3: ROOM_COMPLETE (Finalización de la habitación)
    // ------------------------------------------------------------------------
    this.state3_complete = {
      completed: false,
      finalHp: 100,
      finalShield: 0,
      finalVitality: 100,
      finalRelics: 0,
      newRelicsTotalInRoom: 0,
      totalTimeEmployed: 0.0,
      timeElapsedSecondHalf: 0.0,
      totalDamageTaken: 0,
      hpLostSecondHalf: 0,
      enemiesKilledSecondHalf: 0,
      kpsSecondHalf: 0.0,      // Enemigos derrotados por segundo en la 2da mitad
      kpsTotal: 0.0,           // Enemigos derrotados por segundo en toda la sala
      dtpsSecondHalf: 0.0,     // Daño recibido por segundo en la 2da mitad
      dtpsTotal: 0.0,          // Daño recibido por segundo total (Métrica clave)
      combatSlowdownRatio: 1.0 // < 1.0 indica que la 2da mitad se volvió más lenta
    };

    // ------------------------------------------------------------------------
    // ESTADO 4: DIFFICULTY_UPDATE (Indicadores, Dados, Ruido y Modificadores)
    // ------------------------------------------------------------------------
    this.state4_adaptive = {
      indicators: {
        S_survival: 65,
        P_power: 65,
        V_speed: 65,
        E_efficiency: 65,
        G_progression: 65
      },
      performanceR: 65.0,
      expectedR: EYE_CONFIG.EXPECTED_PERFORMANCE_R,
      delta: 0.0,
      diceStats: {
        minPoint: 65.0,
        maxPoint: 65.0,
        spread: 0.0,
        noiseRoll: 0.5,        // Dado de ruido [0.0 ... 1.0]; el más bajo activa el subidón
        lowNoiseTriggered: false
      },
      godStreak: 0,            // Cuántas salas seguidas lleva el jugador en modo Dios
      regime: 'EQUILIBRIO',    // 'ALIVIO' | 'EQUILIBRIO' | 'ACOMPAÑAR_BUILD' | 'PIES_EN_LA_TIERRA'
      nextRoomModifiers: {
        enemyCountMultiplier: 1.0,
        enemyDamageMultiplier: 1.0,
        enemySpeedMultiplier: 1.0,
        heartDropBonus: 0.0
      }
    };

    this.roomHistory = [];
    this.onUpdateCallback = null;
  }

  /**
   * Activa o desactiva BrotherEye por completo.
   * Si se desactiva, devuelve todos los multiplicadores a 1.0 neutro.
   */
  BrotherEyeEngine.prototype.setEnabled = function (enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) {
      this.resetNeutralModifiers();
    }
  };

  BrotherEyeEngine.prototype.resetNeutralModifiers = function () {
    var mod = this.state4_adaptive.nextRoomModifiers;
    mod.enemyCountMultiplier = 1.0;
    mod.enemyDamageMultiplier = 1.0;
    mod.enemySpeedMultiplier = 1.0;
    mod.heartDropBonus = 0.0;
    this.state4_adaptive.regime = 'EQUILIBRIO';
    this.state4_adaptive.godStreak = 0;
  };

  // ==========================================================================
  // ESTADO -1 & ESTADO 0: INITIALIZE
  // ==========================================================================
  /**
   * Inicializa/Reinicia el Reloj Interno Global (ESTADO -1) y toma el
   * Registro Inicial del jugador (ESTADO 0).
   * Solo debe llamarse al iniciar partida, reiniciar con [R] o empezar un NG+.
   */
  BrotherEyeEngine.prototype.initialize = function (player, reason) {
    if (!this.enabled) return;

    // ESTADO -1: Reiniciar reloj interno global únicamente en R / Nuevo Juego / NG+
    this.globalClock.active = true;
    this.globalClock.elapsedSeconds = 0.0;
    this.globalClock.resetReason = reason || 'INIT';

    // ESTADO 0: Registro inicial de las estadísticas base del jugador
    var maxHp = (player && player.maxHp) ? player.maxHp : 100;
    var shield = (player && player.shield) ? player.shield : 0;
    var speed = (player && player.speed) ? player.speed : 250;
    var dmg = (player && player.damageMultiplier) ? player.damageMultiplier : 1.0;
    var projs = getPlayerProjectileCount(player);
    var relics = getPlayerRelicCount(player);

    this.state0_initial = {
      initialized: true,
      initialTime: 0.0,
      maxHp: maxHp,
      shield: shield,
      totalVitality: maxHp + shield,
      speed: speed,
      damageMultiplier: dmg,
      projectiles: projs,
      totalRelics: relics
    };

    this.resetNeutralModifiers();
    this.roomHistory = [];
  };

  /**
   * Detiene el Reloj Global (ESTADO -1) cuando el jugador muere.
   */
  BrotherEyeEngine.prototype.onPlayerDeath = function () {
    this.globalClock.active = false;
    this.globalClock.deathsCount += 1;
    this.state1_enter.activeInRoom = false;
  };

  // ==========================================================================
  // ESTADO 1: ROOM_ENTER (Entrada a Habitación y Aplicación a la Sala)
  // ==========================================================================
  /**
   * Se ejecuta cuando el jugador entra a una habitación.
   *  1. Si la sala tiene enemigos y aún no fue calibrada, aplica los
   *     modificadores de Cantidad, Daño y Velocidad calculados en el Estado 4 previo.
   *  2. Registra Tiempo inicial, Vida inicial, Escudo, Reliquias y Enemigos totales.
   */
  BrotherEyeEngine.prototype.ROOM_ENTER = function (room, player) {
    if (!this.enabled || !room) return;

    if (!this.state0_initial.initialized && player) {
      this.initialize(player, 'AUTO_FIRST_ROOM');
    }

    // 1. Aplicar modificadores adaptativos a la sala entrante (si es de combate y no fue adaptada)
    if (!room.cleared && room.enemies && room.enemies.length > 0 && !room.brotherEyeAdapted) {
      this.applyAdaptationToRoom(room, player);
    }

    var livingEnemies = room.enemies
      ? room.enemies.filter(function (e) { return !e.markedForDeletion; }).length
      : 0;

    var hp = (player && typeof player.hp === 'number') ? player.hp : 100;
    var shield = (player && typeof player.shield === 'number') ? player.shield : 0;

    // 2. Registrar ESTADO 1
    this.state1_enter = {
      activeInRoom: livingEnemies > 0 && !room.cleared,
      roomType: room.type || 'NORMAL',
      globalTimeAtEntry: this.globalClock.elapsedSeconds,
      roomClockSeconds: 0.0, // Segundo reloj arranca en 0
      entryHp: hp,
      entryShield: shield,
      entryVitality: hp + shield,
      entryRelics: getPlayerRelicCount(player),
      entryDamageMult: (player && player.damageMultiplier) ? player.damageMultiplier : 1.0,
      entryProjectiles: getPlayerProjectileCount(player),
      entrySpeed: (player && player.speed) ? player.speed : 250,
      totalEnemiesInitial: livingEnemies
    };

    // Preparar ESTADO 2 (Midpoint) y ESTADO 3 (Complete)
    this.state2_midpoint.triggered = false;
    this.state3_complete.completed = false;
  };

  // Alias de compatibilidad con el hook existente en script.js
  BrotherEyeEngine.prototype.onRoomEntered = function (room, player) {
    this.ROOM_ENTER(room, player);
  };

  /**
   * Aplica físicamente el subidón o la bajada de dificultad a la sala actual:
   *  - Modifica la cantidad de enemigos (agregando o quitando en posiciones seguras).
   *  - Escala el daño de los enemigos (contacto y proyectiles).
   *  - Escala un poco la velocidad de movimiento de los enemigos.
   */
  BrotherEyeEngine.prototype.applyAdaptationToRoom = function (room, player) {
    if (!room || !room.enemies || room.brotherEyeAdapted) return;
    room.brotherEyeAdapted = true;

    var mod = this.state4_adaptive.nextRoomModifiers;
    var isBossRoom = room.type === 'BOSS' || room.enemies.some(function (e) { return e.isBoss; });

    // A. Ajustar CANTIDAD de enemigos (solo en salas de combate normales/difíciles, no clonar al Boss)
    var regime = this.state4_adaptive.regime;
    if (!isBossRoom && (Math.abs(mod.enemyCountMultiplier - 1.0) > 0.03 || regime !== 'EQUILIBRIO')) {
      var baseCount = room.enemies.length;
      var targetCount = Math.max(1, Math.round(baseCount * mod.enemyCountMultiplier));
      if (regime === 'ACOMPAÑAR_BUILD') {
        targetCount = Math.max(baseCount + 1, Math.ceil(baseCount * mod.enemyCountMultiplier));
      } else if (regime === 'PIES_EN_LA_TIERRA') {
        targetCount = Math.max(baseCount + 2, Math.ceil(baseCount * mod.enemyCountMultiplier));
      } else if (regime === 'ALIVIO' && baseCount > 1) {
        targetCount = Math.min(baseCount - 1, Math.floor(baseCount * mod.enemyCountMultiplier));
      }
      var diff = targetCount - baseCount;

      if (diff > 0 && typeof room.getSafeSpawnPosition === 'function' && room.bounds) {
        // Subidón de cantidad: spawnear enemigos adicionales lejos de la puerta donde está el jugador
        var b = room.bounds;
        var margin = Math.min(90, Math.min(b.width, b.height) * 0.22);
        var px = player ? player.x : b.centerX;
        var py = player ? player.y : b.centerY;

        for (var i = 0; i < diff; i++) {
          var pos = room.getSafeSpawnPosition(b.left + margin, b.right - margin, b.top + margin, b.bottom - margin, 35, 220);
          // Garantizar distancia de seguridad respecto al jugador
          if (Math.hypot(pos.x - px, pos.y - py) < 190) {
            pos.x = b.centerX + (Math.random() - 0.5) * 120;
            pos.y = b.centerY + (Math.random() - 0.5) * 120;
          }

          var newEnemy = this.createExtraEnemyForRoom(pos.x, pos.y, room.sectionNumber || 1, room.levelNumber || 1);
          if (newEnemy) {
            newEnemy.reactionDelay = 0.35;
            room.enemies.push(newEnemy);
          }
        }
      } else if (diff < 0 && room.enemies.length > 1) {
        // Bajada de cantidad: retirar enemigos normales excedentes (sin borrar élites ni jefes)
        var toRemove = Math.min(room.enemies.length - 1, Math.abs(diff));
        for (var r = room.enemies.length - 1; r >= 0 && toRemove > 0; r--) {
          if (!room.enemies[r].isBoss && !room.enemies[r].isElite) {
            room.enemies.splice(r, 1);
            toRemove--;
          }
        }
      }
    }

    // B. Ajustar DAÑO y VELOCIDAD de todos los enemigos de la sala
    for (var j = 0; j < room.enemies.length; j++) {
      this.tuneSpawnedEnemy(room.enemies[j]);
    }

    // Si es una sala de "Pies en la Tierra", avisar sutilmente en el HUD si existe UI
    if (this.state4_adaptive.regime === 'PIES_EN_LA_TIERRA' && player && player.ui && typeof player.ui.showToast === 'function') {
      player.ui.showToast('👁️ [BROTHER EYE] Pico de hostilidad detectado: ¡No te confíes!');
    }
  };

  /**
   * Instancia un enemigo extra acorde al piso cuando BrotherEye sube la cantidad de horda.
   */
  BrotherEyeEngine.prototype.createExtraEnemyForRoom = function (x, y, section, level) {
    var roll = Math.random();
    if (roll < 0.25 && typeof ShooterEnemy !== 'undefined') {
      return new ShooterEnemy(x, y, section, level);
    } else if (roll < 0.45 && typeof SplitterEnemy !== 'undefined') {
      return new SplitterEnemy(x, y, section, level, false);
    } else if (roll < 0.68 && typeof FlyerEnemy !== 'undefined') {
      return new FlyerEnemy(x, y, section, level);
    } else if (roll < 0.85 && typeof ChargerEnemy !== 'undefined') {
      return new ChargerEnemy(x, y, section, level);
    } else if (typeof Enemy !== 'undefined') {
      var behavior = Math.random() < 0.5 ? 'ERRATIC' : 'DASHER';
      return new Enemy(x, y, section, level, behavior);
    }
    return null;
  };

  /**
   * Ajusta el daño y la velocidad de un enemigo individual según el Estado 4 actual.
   * Nota: NO infla la vida de forma artificial para no arruinar las builds rotas.
   */
  BrotherEyeEngine.prototype.tuneSpawnedEnemy = function (enemy) {
    if (!this.enabled || !enemy) return;

    var mod = this.state4_adaptive.nextRoomModifiers;

    // Guardar stats originales en la primera pasada para poder recalibrar al entrar a la sala real
    if (typeof enemy._baseContactDamage !== 'number' && typeof enemy.contactDamage === 'number') {
      enemy._baseContactDamage = enemy.contactDamage;
    }
    if (typeof enemy._baseSpeed !== 'number' && typeof enemy.speed === 'number') {
      enemy._baseSpeed = enemy.speed;
    }

    // 1. Escalar Daño de Contacto y guardar multiplicador para sus proyectiles
    if (typeof enemy._baseContactDamage === 'number') {
      enemy.contactDamage = Math.max(1, Math.round(enemy._baseContactDamage * mod.enemyDamageMultiplier));
    }
    enemy.eyeDamageMultiplier = mod.enemyDamageMultiplier;

    // 2. Escalar un poco su Velocidad (respetando topes de maniobrabilidad)
    if (typeof enemy._baseSpeed === 'number') {
      var maxAllowedSpeed = enemy.isBoss ? 300 : 320;
      enemy.speed = clamp(Math.round(enemy._baseSpeed * mod.enemySpeedMultiplier), 45, maxAllowedSpeed);
    }
  };

  // ==========================================================================
  // ESTADO 2: MIDPOINT (Evaluación Intermedia al 50% de enemigos derrotados)
  // ==========================================================================
  /**
   * Actualiza en cada frame el Reloj Global (ESTADO -1), el Segundo Reloj de
   * la sala y verifica si se alcanzó el 50% de enemigos derrotados (ESTADO 2).
   */
  BrotherEyeEngine.prototype.onRoomTick = function (dt, room, player) {
    if (!this.enabled || typeof dt !== 'number' || dt <= 0) return;

    // 1. Avanzar ESTADO -1 (Reloj Interno Global)
    if (this.globalClock.active) {
      this.globalClock.elapsedSeconds += dt;
    }

    // 2. Si estamos en combate activo dentro de una habitación, avanzar Segundo Reloj
    if (!this.state1_enter.activeInRoom || !room) return;

    if (room.cleared) {
      if (!this.state3_complete.completed) {
        this.ROOM_COMPLETE(room, player, true);
      }
      return;
    }

    this.state1_enter.roomClockSeconds += dt;

    // 3. Verificar condición de ESTADO 2 (MIDPOINT: 50% de enemigos muertos) y ESTADO 3 (100% muertos)
    if (this.state1_enter.totalEnemiesInitial > 0) {
      var livingCount = 0;
      if (room.enemies) {
        for (var i = 0; i < room.enemies.length; i++) {
          if (!room.enemies[i].markedForDeletion) livingCount++;
        }
      }

      var halfThreshold = Math.floor(this.state1_enter.totalEnemiesInitial * 0.5);
      if (!this.state2_midpoint.triggered && livingCount <= halfThreshold) {
        this.MIDPOINT(room, player, livingCount);
      }

      if (livingCount === 0 && !this.state3_complete.completed) {
        this.ROOM_COMPLETE(room, player, true);
      }
    }
  };

  /**
   * Ejecuta las preguntas del ESTADO 2 cuando cae el 50% de los enemigos:
   *  - "¿Cuánta vida tiene ahora?"
   *  - "¿Cuánto tiempo pasó desde que entró a la sala?" (Segundo reloj)
   *  - "¿Cuánta vida perdió?" (Vida_i - Vida_actual)
   *  - "¿Tiene nuevas reliquias?"
   *  - "¿Cuántos enemigos derrotó en este primer intervalo y qué DTPS tuvo?"
   */
  BrotherEyeEngine.prototype.MIDPOINT = function (room, player, livingCountOverride) {
    if (!this.enabled || this.state2_midpoint.triggered) return;

    var s1 = this.state1_enter;
    var living = (typeof livingCountOverride === 'number')
      ? livingCountOverride
      : (room && room.enemies ? room.enemies.filter(function (e) { return !e.markedForDeletion; }).length : 0);

    var currentHp = (player && typeof player.hp === 'number') ? player.hp : s1.entryHp;
    var currentShield = (player && typeof player.shield === 'number') ? player.shield : 0;
    var currentVitality = currentHp + currentShield;
    var currentRelics = getPlayerRelicCount(player);

    var elapsedFirstHalf = Math.max(0.15, s1.roomClockSeconds);
    var hpLostFirstHalf = Math.max(0, s1.entryVitality - currentVitality);
    var killedFirstHalf = Math.max(1, s1.totalEnemiesInitial - living);

    this.state2_midpoint = {
      triggered: true,
      timeElapsedFirstHalf: elapsedFirstHalf,
      hpAtMidpoint: currentHp,
      shieldAtMidpoint: currentShield,
      vitalityAtMidpoint: currentVitality,
      hpLostFirstHalf: hpLostFirstHalf,
      relicsAtMidpoint: currentRelics,
      newRelicsAcquiredMid: Math.max(0, currentRelics - s1.entryRelics),
      enemiesKilledFirstHalf: killedFirstHalf,
      enemiesRemainingMid: living,
      kpsFirstHalf: killedFirstHalf / elapsedFirstHalf,
      dtpsFirstHalf: hpLostFirstHalf / elapsedFirstHalf
    };
  };

  // ==========================================================================
  // ESTADO 3: ROOM_COMPLETE (Finalización de la Habitación)
  // ==========================================================================
  /**
   * Se activa cuando el jugador termina la habitación.
   * Registra Vida final, Reliquias totales, Tiempo empleado, DTPS (Daño recibido
   * por segundo de combate) y velocidad por intervalo, y dispara DIFFICULTY_UPDATE.
   */
  BrotherEyeEngine.prototype.ROOM_COMPLETE = function (room, player, clearedStatus) {
    if (!this.enabled || !this.state1_enter.activeInRoom || this.state3_complete.completed) return;

    var isCleared = (clearedStatus !== undefined) ? Boolean(clearedStatus) : Boolean(room && room.cleared);
    if (!isCleared) {
      // Si salió de la sala sin haberla completado (ej. teletransporte especial), cerramos el seguimiento sin recalcular
      this.state1_enter.activeInRoom = false;
      return;
    }

    // Si la sala tenía 1 solo enemigo y pasó de 100% a 0% en un golpe, registrar Midpoint sintético
    if (!this.state2_midpoint.triggered) {
      this.MIDPOINT(room, player, 0);
    }

    var s1 = this.state1_enter;
    var s2 = this.state2_midpoint;

    var finalHp = (player && typeof player.hp === 'number') ? player.hp : s1.entryHp;
    var finalShield = (player && typeof player.shield === 'number') ? player.shield : 0;
    var finalVitality = finalHp + finalShield;
    var finalRelics = getPlayerRelicCount(player);

    var totalTime = Math.max(0.25, s1.roomClockSeconds);
    var secondHalfTime = Math.max(0.15, totalTime - s2.timeElapsedFirstHalf);

    var totalDamageTaken = Math.max(0, s1.entryVitality - finalVitality);
    var hpLostSecondHalf = Math.max(0, s2.vitalityAtMidpoint - finalVitality);

    var killedSecondHalf = Math.max(0, s1.totalEnemiesInitial - s2.enemiesKilledFirstHalf);

    var kpsSecondHalf = killedSecondHalf > 0 ? (killedSecondHalf / secondHalfTime) : s2.kpsFirstHalf;
    var kpsTotal = s1.totalEnemiesInitial / totalTime;

    var dtpsSecondHalf = hpLostSecondHalf / secondHalfTime;
    var dtpsTotal = totalDamageTaken / totalTime; // Métrica clave: Daño recibido por segundo

    var slowdownRatio = kpsSecondHalf / Math.max(0.05, s2.kpsFirstHalf);

    this.state3_complete = {
      completed: true,
      finalHp: finalHp,
      finalShield: finalShield,
      finalVitality: finalVitality,
      finalRelics: finalRelics,
      newRelicsTotalInRoom: Math.max(0, finalRelics - s1.entryRelics),
      totalTimeEmployed: totalTime,
      timeElapsedSecondHalf: secondHalfTime,
      totalDamageTaken: totalDamageTaken,
      hpLostSecondHalf: hpLostSecondHalf,
      enemiesKilledSecondHalf: killedSecondHalf,
      kpsSecondHalf: kpsSecondHalf,
      kpsTotal: kpsTotal,
      dtpsSecondHalf: dtpsSecondHalf,
      dtpsTotal: dtpsTotal,
      combatSlowdownRatio: slowdownRatio
    };

    this.state1_enter.activeInRoom = false;

    // Pasar inmediatamente al ESTADO 4: Cálculo Adaptativo
    this.DIFFICULTY_UPDATE(room, player);
  };

  // Alias de compatibilidad con el hook en script.js
  BrotherEyeEngine.prototype.onRoomExited = function (room, player, clearedStatus) {
    this.ROOM_COMPLETE(room, player, clearedStatus);
  };

  // ==========================================================================
  // ESTADO 4: DIFFICULTY_UPDATE (Cálculo Adaptativo, Dados y "Pies en la Tierra")
  // ==========================================================================
  /**
   * Calcula los 5 indicadores (S, P, V, E, G), la ecuación R, el Delta respecto
   * a 65, tira los dados de variación y ruido estocástico, y define la dificultad
   * de la próxima habitación.
   */
  BrotherEyeEngine.prototype.DIFFICULTY_UPDATE = function (room, player) {
    var s0 = this.state0_initial;
    var s1 = this.state1_enter;
    var s2 = this.state2_midpoint;
    var s3 = this.state3_complete;
    var w = EYE_CONFIG.WEIGHTS;

    var maxHp = (player && player.maxHp) ? player.maxHp : s0.maxHp;

    // ------------------------------------------------------------------------
    // 1. INDICADOR S — SUPERVIVENCIA (Peso 30%): Cuánta vida y escudo conservaste
    // ------------------------------------------------------------------------
    var retentionRatio = s1.entryVitality > 0 ? (s3.finalVitality / s1.entryVitality) : 1.0;
    var healthPoolRatio = maxHp > 0 ? (s3.finalVitality / maxHp) : 1.0;
    // Combinamos cuánto conservó de lo que trajo a la sala (65%) y cuán lleno está su tanque total (35%)
    var S_score = clamp((retentionRatio * 65.0 + healthPoolRatio * 35.0), 0, 100);

    // ------------------------------------------------------------------------
    // 2. INDICADOR P — POTENCIA (Peso 20%): Capacidad ofensiva acumulada
    // ------------------------------------------------------------------------
    var currentDmg = (player && player.damageMultiplier) ? player.damageMultiplier : 1.0;
    var currentProjs = getPlayerProjectileCount(player);
    var dmgGrowth = currentDmg / Math.max(0.5, s0.damageMultiplier);
    var projGrowth = currentProjs / Math.max(1, s0.projectiles);
    var rawPowerIndex = (dmgGrowth * 0.65) + (projGrowth * 0.35);
    // En 1.0x base da ~60 puntos; conforme sube daño y proyectiles escala hacia 100
    var P_score = clamp(35.0 + rawPowerIndex * 28.0, 0, 100);

    // ------------------------------------------------------------------------
    // 3. INDICADOR V — VELOCIDAD (Peso 20%): Qué tan rápido eliminaste enemigos
    // ------------------------------------------------------------------------
    var expectedKps = EYE_CONFIG.BENCHMARKS.EXPECTED_KPS;
    if (s1.roomType === 'BOSS') expectedKps = 0.04; // En jefe es 1 solo gran objetivo
    var kpsRatio = s3.kpsTotal / Math.max(0.01, expectedKps);
    var baseV = clamp(kpsRatio * 65.0, 10, 100);
    // Si en el segundo intervalo (50% -> 100%) el combate se volvió muy lento (< 0.65 del 1er tramo), penaliza V
    var slowdownPenalty = s3.combatSlowdownRatio < 0.65 ? (0.65 - s3.combatSlowdownRatio) * 25.0 : 0.0;
    var V_score = clamp(baseV - slowdownPenalty, 0, 100);

    // ------------------------------------------------------------------------
    // 4. INDICADOR E — EFICIENCIA (Peso 20%): Daño recibido por segundo (DTPS)
    // ------------------------------------------------------------------------
    // Ejemplo del autor:
    //  - Jugador A: 30s y pierde 5 HP  -> DTPS = 0.166 -> E alto (~88)
    //  - Jugador B: 30s y pierde 70 HP -> DTPS = 2.333 -> E muy bajo (~16)
    var dtps = s3.dtpsTotal;
    // También ponderamos si el primer tramo (0->50%) tuvo un pico de DTPS brutal
    var peakDtps = Math.max(dtps, s2.dtpsFirstHalf * 0.85);
    var E_score = 100.0 * Math.exp(-0.55 * peakDtps) - (s3.totalDamageTaken * 0.35);
    E_score = clamp(E_score, 0, 100);

    // ------------------------------------------------------------------------
    // 5. INDICADOR G — PROGRESIÓN (Peso 10%): Cuánto aumentó tu construcción
    // ------------------------------------------------------------------------
    var relicsGainedSinceStart = Math.max(0, s3.finalRelics - s0.totalRelics);
    var speedGrowth = ((player && player.speed) ? player.speed : s0.speed) / Math.max(50, s0.speed);
    var runMinutes = Math.max(0.5, this.globalClock.elapsedSeconds / 60.0);
    var expectedRelicsNow = runMinutes * EYE_CONFIG.BENCHMARKS.EXPECTED_RELICS_PER_MIN;
    var relicPace = (relicsGainedSinceStart + 1) / (expectedRelicsNow + 1);
    var G_score = clamp((relicPace * 55.0) + (speedGrowth * 15.0) + (s3.newRelicsTotalInRoom * 10.0), 0, 100);

    // ------------------------------------------------------------------------
    // ECUACIÓN PONDERADA MAESTRA: R = 0.30S + 0.20P + 0.20V + 0.20E + 0.10G
    // ------------------------------------------------------------------------
    var R = (w.S_SURVIVAL * S_score) +
            (w.P_POWER * P_score) +
            (w.V_SPEED * V_score) +
            (w.E_EFFICIENCY * E_score) +
            (w.G_PROGRESSION * G_score);

    var expectedR = EYE_CONFIG.EXPECTED_PERFORMANCE_R; // 65.0
    var delta = R - expectedR;

    // ------------------------------------------------------------------------
    // TIRADA DE DADOS Y RUIDO ESTOCÁSTICO
    // "Tira un dado, hace un promedio en cada pequeñez, saca el punto máximo,
    //  el punto mínimo, y tira otro dado para dar con un poco de ruido.
    //  El ruido más bajo es el subidón de dificultad."
    // ------------------------------------------------------------------------
    var noisySamples = [
      S_score + rollDiceRange(-4, 4),
      P_score + rollDiceRange(-4, 4),
      V_score + rollDiceRange(-4, 4),
      E_score + rollDiceRange(-4, 4),
      G_score + rollDiceRange(-4, 4)
    ];

    var minPoint = Math.min.apply(null, noisySamples);
    var maxPoint = Math.max.apply(null, noisySamples);
    var spread = maxPoint - minPoint;

    // Segundo Dado: Dado de Ruido [0.00 ... 1.00]
    var noiseDice = Math.random();

    // Evaluar racha de "Jugador Dios" (Build Rota)
    var gCfg = EYE_CONFIG.GOD_STREAK;
    if (R >= gCfg.R_THRESHOLD) {
      this.state4_adaptive.godStreak += 1;
    } else if (R < expectedR - 8.0) {
      this.state4_adaptive.godStreak = 0;
    }

    // Umbral para que el ruido más bajo detone la sala de "Pies en la Tierra":
    // Solo puede ocurrir si el jugador viene dominando (godStreak >= MIN_STREAK_FOR_SPIKE)
    var effectiveSpikeChance = gCfg.BASE_LOW_NOISE_TRIGGER +
      Math.max(0, this.state4_adaptive.godStreak - gCfg.MIN_STREAK_FOR_SPIKE) * gCfg.STREAK_BONUS_CHANCE;

    var lowNoiseSpikeTriggered = (this.state4_adaptive.godStreak >= gCfg.MIN_STREAK_FOR_SPIKE) &&
                                 (noiseDice <= effectiveSpikeChance);

    // ------------------------------------------------------------------------
    // CÁLCULO DE LOS NUEVOS MODIFICADORES (Cantidad, Daño y un poco Velocidad)
    // ------------------------------------------------------------------------
    var lim = EYE_CONFIG.LIMITS;
    var nextMod = this.state4_adaptive.nextRoomModifiers;
    var regime = 'EQUILIBRIO';

    if (lowNoiseSpikeTriggered) {
      // ¡SUBIDÓN "PIES EN LA TIERRA"!
      // El jugador lleva varias salas paseándose como un Dios y el dado sacó el ruido más bajo.
      regime = 'PIES_EN_LA_TIERRA';
      var spikeIntensity = clamp(0.65 + (1.0 - noiseDice) * 0.35, 0.65, 1.0);

      nextMod.enemyCountMultiplier = Number((1.0 + (lim.COUNT_MAX_SPIKE - 1.0) * spikeIntensity).toFixed(2));
      nextMod.enemyDamageMultiplier = Number((1.0 + (lim.DMG_MAX_SPIKE - 1.0) * spikeIntensity).toFixed(2));
      nextMod.enemySpeedMultiplier = Number((1.0 + (lim.SPD_MAX_SPIKE - 1.0) * spikeIntensity).toFixed(2));
      nextMod.heartDropBonus = -0.04;

      // Reiniciar racha tras mandar el subidón para que después vuelva a disfrutar su build
      this.state4_adaptive.godStreak = 0;

    } else if (delta > 8.0) {
      // MODO "ACOMPAÑAR BUILD ROTA":
      // El jugador está fuerte: le damos más enemigos para que se divierta masacrando,
      // con un leve ajuste de daño y velocidad sin volver el juego injusto.
      regime = 'ACOMPAÑAR_BUILD';
      var normUp = clamp(delta / 35.0, 0.15, 1.0);
      var jitterUp = rollDiceRange(0.88, 1.12);

      nextMod.enemyCountMultiplier = Number(clamp(1.0 + (lim.COUNT_MAX_NORMAL - 1.0) * normUp * jitterUp, 1.05, lim.COUNT_MAX_NORMAL).toFixed(2));
      nextMod.enemyDamageMultiplier = Number(clamp(1.0 + (lim.DMG_MAX_NORMAL - 1.0) * normUp * 0.85, 1.02, lim.DMG_MAX_NORMAL).toFixed(2));
      nextMod.enemySpeedMultiplier = Number(clamp(1.0 + (lim.SPD_MAX_NORMAL - 1.0) * normUp * 0.75, 1.01, lim.SPD_MAX_NORMAL).toFixed(2));
      nextMod.heartDropBonus = 0.0;

    } else if (delta < -10.0) {
      // MODO "ALIVIO / BAJADA DE DIFICULTAD":
      // El jugador recibió mucho DTPS o tardó demasiado: bajamos cantidad, daño y velocidad.
      regime = 'ALIVIO';
      var normDown = clamp(Math.abs(delta) / 35.0, 0.15, 1.0);
      var jitterDown = rollDiceRange(0.90, 1.10);

      nextMod.enemyCountMultiplier = Number(clamp(1.0 - (1.0 - lim.COUNT_MIN) * normDown * jitterDown, lim.COUNT_MIN, 0.95).toFixed(2));
      nextMod.enemyDamageMultiplier = Number(clamp(1.0 - (1.0 - lim.DMG_MIN) * normDown, lim.DMG_MIN, 0.95).toFixed(2));
      nextMod.enemySpeedMultiplier = Number(clamp(1.0 - (1.0 - lim.SPD_MIN) * normDown, lim.SPD_MIN, 0.98).toFixed(2));
      nextMod.heartDropBonus = Number((0.15 * normDown).toFixed(2));

    } else {
      // MODO "EQUILIBRIO NATURAL" (R cercano a 65):
      regime = 'EQUILIBRIO';
      var microNoise = (noiseDice - 0.5) * 0.14; // Pequeña brisa aleatoria [-7% a +7%]
      nextMod.enemyCountMultiplier = Number(clamp(1.0 + microNoise, 0.92, 1.12).toFixed(2));
      nextMod.enemyDamageMultiplier = Number(clamp(1.0 + microNoise * 0.8, 0.94, 1.10).toFixed(2));
      nextMod.enemySpeedMultiplier = Number(clamp(1.0 + microNoise * 0.5, 0.96, 1.05).toFixed(2));
      nextMod.heartDropBonus = 0.0;
    }

    // Guardar estado 4 completo
    this.state4_adaptive.indicators = {
      S_survival: Number(S_score.toFixed(1)),
      P_power: Number(P_score.toFixed(1)),
      V_speed: Number(V_score.toFixed(1)),
      E_efficiency: Number(E_score.toFixed(1)),
      G_progression: Number(G_score.toFixed(1))
    };
    this.state4_adaptive.performanceR = Number(R.toFixed(2));
    this.state4_adaptive.delta = Number(delta.toFixed(2));
    this.state4_adaptive.diceStats = {
      minPoint: Number(minPoint.toFixed(1)),
      maxPoint: Number(maxPoint.toFixed(1)),
      spread: Number(spread.toFixed(1)),
      noiseRoll: Number(noiseDice.toFixed(3)),
      lowNoiseTriggered: lowNoiseSpikeTriggered
    };
    this.state4_adaptive.regime = regime;

    // Guardar registro en el historial
    this.roomHistory.push({
      globalTime: Number(this.globalClock.elapsedSeconds.toFixed(1)),
      roomType: s1.roomType,
      roomTime: Number(s3.totalTimeEmployed.toFixed(2)),
      dtps: Number(s3.dtpsTotal.toFixed(2)),
      R: this.state4_adaptive.performanceR,
      delta: this.state4_adaptive.delta,
      regime: regime,
      nextModifiers: {
        count: nextMod.enemyCountMultiplier,
        damage: nextMod.enemyDamageMultiplier,
        speed: nextMod.enemySpeedMultiplier
      }
    });
    if (this.roomHistory.length > EYE_CONFIG.MAX_HISTORY_LOG) {
      this.roomHistory.shift();
    }

    if (typeof this.onUpdateCallback === 'function') {
      this.onUpdateCallback(this.getStatus());
    }
  };

  // ==========================================================================
  // GETTERS Y TELEMETRÍA PARA EL MOTOR DEL JUEGO
  // ==========================================================================
  BrotherEyeEngine.prototype.getAdaptiveSpawnMultiplier = function () {
    return this.enabled ? this.state4_adaptive.nextRoomModifiers.enemyCountMultiplier : 1.0;
  };

  BrotherEyeEngine.prototype.getEnemyDamageMultiplier = function () {
    return this.enabled ? this.state4_adaptive.nextRoomModifiers.enemyDamageMultiplier : 1.0;
  };

  BrotherEyeEngine.prototype.getEnemySpeedMultiplier = function () {
    return this.enabled ? this.state4_adaptive.nextRoomModifiers.enemySpeedMultiplier : 1.0;
  };

  BrotherEyeEngine.prototype.getHeartDropBonus = function () {
    return this.enabled ? this.state4_adaptive.nextRoomModifiers.heartDropBonus : 0.0;
  };

  /**
   * Devuelve una radiografía completa de todos los Estados (-1 al 4) para
   * inspección en consola o UI futura.
   */
  BrotherEyeEngine.prototype.getStatus = function () {
    var s4 = this.state4_adaptive;
    return {
      enabled: this.enabled,
      version: this.version,
      stateMinus1_GlobalClock: this.globalClock,
      state0_Initial: this.state0_initial,
      state1_Enter: this.state1_enter,
      state2_Midpoint: this.state2_midpoint,
      state3_Complete: this.state3_complete,
      state4_Adaptive: s4,
      summary: {
        R: s4.performanceR,
        expectedR: s4.expectedR,
        delta: s4.delta,
        regime: s4.regime,
        godStreak: s4.godStreak,
        nextCountMult: s4.nextRoomModifiers.enemyCountMultiplier,
        nextDamageMult: s4.nextRoomModifiers.enemyDamageMultiplier,
        nextSpeedMult: s4.nextRoomModifiers.enemySpeedMultiplier
      }
    };
  };

  return new BrotherEyeEngine();
}));
