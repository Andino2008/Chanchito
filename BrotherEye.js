/**
 * ============================================================================
 * BROTHEREYE.JS - SISTEMA DE DIFICULTAD ADAPTATIVA INTELIGENTE (DDA)
 * ============================================================================
 * "Brother Eye te observa... calibra el abismo a tu medida."
 *
 * Módulo 100% desacoplado e independiente.
 * Si el usuario o el juego decide apagarlo, basta con no invocar sus métodos o
 * poner `BrotherEye.enabled = false`.
 *
 * Filosofía del Algoritmo:
 * En lugar de aplicar escalados rígidos e infinitos por código duro en cada sala
 * o piso (que generan curvas frustrantes o aburridas), Brother Eye analiza en
 * tiempo real el rendimiento y la fluidez del jugador entre la ENTRADA y SALIDA
 * de cada habitación:
 *
 * Factores de Análisis por Habitación:
 *  1. Tiempo de Despeje (Clear Time vs. Target Benchmark):
 *     - Si limpia una sala en tiempo récord (< target), su nivel de maestría sube.
 *     - Si tarda mucho más de lo esperado (> 1.8x target), el juego le está costando.
 *  2. Preservación de Salud (Damage Taken):
 *     - Si sale intacto (0 daño recibido), es una "Limpieza Perfecta" (Dominio).
 *     - Si pierde >40% de su HP en una sola sala, está en riesgo crítico de muerte.
 *  3. Precisión y Eficiencia (Hit Ratio / Proyectiles):
 *     - Ratio de disparos acertados frente a proyectiles disparados.
 *  4. Ventana de Estrés Dinámico (Dynamic Tension Score):
 *     - Brother Eye calcula un "Tension Level" entre 0.0 (jugador sufriendo) y 1.0 (jugador imparable).
 *
 * Moduladores Adaptativos Emitidos (Adaptive Factors):
 *  - spawnRateMultiplier: ajusta la densidad de horda (0.8x a 1.35x).
 *  - enemyHpFactor: micro-ajuste de salud de enemigos (0.85x a 1.25x).
 *  - enemySpeedFactor: micro-ajuste de velocidad para permitir kiteo justo (0.9x a 1.15x).
 *  - eliteProbabilityBonus: probabilidad de enemigos élite.
 *  - recoveryDropBonus: si el jugador está sufriendo, aumenta ligeramente la caída de corazones.
 *
 * REGLA INVIOLABLE: Cero llamadas de texto a Canvas API (metodos directos de dibujo de fuentes).
 * Toda telemetría opcional se expone mediante datos DOM o métodos limpios.
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

  // Configuraciones y umbrales base del algoritmo
  var EYE_CONFIG = {
    ENABLED_BY_DEFAULT: true,
    MAX_HISTORY_ROOMS: 12,       // Ventana de análisis de las últimas N salas
    BASE_TARGET_ROOM_TIME: 14.0, // Segundos esperados para despejar una sala estándar
    HARD_ROOM_TIME_MULT: 1.45,   // Multiplicador de tiempo para salas difíciles
    MIN_TENSION: 0.0,
    MAX_TENSION: 1.0,
    INITIAL_TENSION: 0.5,        // Comienza en equilibrio perfecto (50%)
    
    // Suavizado del cambio de tensión (Lerp) para evitar picos bruscos injustos
    TENSION_SMOOTHING: 0.35,

    // Límites de seguridad de los modificadores adaptativos
    LIMITS: {
      MIN_SPAWN_MULT: 0.75,
      MAX_SPAWN_MULT: 1.35,
      MIN_HP_MULT: 0.85,
      MAX_HP_MULT: 1.25,
      MIN_SPEED_MULT: 0.90,
      MAX_SPEED_MULT: 1.15,
      MIN_DROP_HEART_BONUS: -0.05,
      MAX_DROP_HEART_BONUS: 0.20
    }
  };

  /**
   * Registro de Telemetría de una Habitación
   */
  function RoomTelemetry(roomIndex, roomType) {
    this.roomIndex = roomIndex;
    this.roomType = roomType || 'NORMAL';
    this.startTime = 0;
    this.endTime = 0;
    this.duration = 0;
    this.hpAtEntry = 100;
    this.hpAtExit = 100;
    this.damageTaken = 0;
    this.shotsFiredAtEntry = 0;
    this.shotsFiredAtExit = 0;
    this.enemiesInitialCount = 0;
    this.cleared = false;
    this.isFlawless = false;
    this.struggleDetected = false;
  }

  /**
   * Núcleo del Algoritmo Brother Eye
   */
  function BrotherEyeEngine() {
    this.enabled = EYE_CONFIG.ENABLED_BY_DEFAULT;
    this.version = '1.0.0';
    
    // Métricas del estado actual del jugador
    this.currentTension = EYE_CONFIG.INITIAL_TENSION;
    this.targetTension = EYE_CONFIG.INITIAL_TENSION;
    
    // Modificadores adaptativos calculados
    this.modifiers = {
      spawnMultiplier: 1.0,
      enemyHpMultiplier: 1.0,
      enemySpeedMultiplier: 1.0,
      eliteChanceMultiplier: 1.0,
      heartDropBonus: 0.0
    };

    // Historial y estado de la sala actual
    this.currentRoomTelemetry = null;
    this.history = [];
    this.roomCounter = 0;

    // Estadísticas acumuladas de la sesión
    this.sessionStats = {
      totalRoomsRecorded: 0,
      flawlessRooms: 0,
      criticalStruggles: 0,
      avgClearTime: EYE_CONFIG.BASE_TARGET_ROOM_TIME
    };

    // Callback opcional de telemetría para depuración o UI
    this.onTensionChanged = null;
  }

  /**
   * Habilita o deshabilita el algoritmo de adaptación dinámica
   */
  BrotherEyeEngine.prototype.setEnabled = function (boolState) {
    this.enabled = Boolean(boolState);
    if (!this.enabled) {
      this.resetModifiers();
    }
  };

  /**
   * Restablece los modificadores a los valores por defecto sin sesgo
   */
  BrotherEyeEngine.prototype.resetModifiers = function () {
    this.modifiers.spawnMultiplier = 1.0;
    this.modifiers.enemyHpMultiplier = 1.0;
    this.modifiers.enemySpeedMultiplier = 1.0;
    this.modifiers.eliteChanceMultiplier = 1.0;
    this.modifiers.heartDropBonus = 0.0;
    this.currentTension = EYE_CONFIG.INITIAL_TENSION;
    this.targetTension = EYE_CONFIG.INITIAL_TENSION;
  };

  /**
   * Evento: Invocado al INGRESAR a una nueva habitación
   */
  BrotherEyeEngine.prototype.onRoomEntered = function (room, player) {
    if (!this.enabled || !room) return;

    this.roomCounter++;
    var t = new RoomTelemetry(this.roomCounter, room.type);
    t.startTime = performance.now();
    t.hpAtEntry = (player && player.hp) ? player.hp : 100;
    t.enemiesInitialCount = (room.enemies) ? room.enemies.length : 0;
    t.shotsFiredAtEntry = (player && player.stats && player.stats.shotsFired) ? player.stats.shotsFired : 0;

    this.currentRoomTelemetry = t;
  };

  /**
   * Evento: Invocado al DESPEJAR o ABANDONAR la habitación (Salida)
   */
  BrotherEyeEngine.prototype.onRoomExited = function (room, player, clearedStatus) {
    if (!this.enabled || !this.currentRoomTelemetry) return;

    var t = this.currentRoomTelemetry;
    t.endTime = performance.now();
    t.duration = Math.max(0.1, (t.endTime - t.startTime) / 1000.0);
    t.hpAtExit = (player && player.hp) ? player.hp : t.hpAtEntry;
    t.damageTaken = Math.max(0, t.hpAtEntry - t.hpAtExit);
    t.shotsFiredAtExit = (player && player.stats && player.stats.shotsFired) ? player.stats.shotsFired : t.shotsFiredAtEntry;
    t.cleared = Boolean(clearedStatus !== undefined ? clearedStatus : (room && room.cleared));

    // Determinar si fue limpieza perfecta o sufrimiento
    if (t.damageTaken === 0 && t.cleared && t.enemiesInitialCount > 0) {
      t.isFlawless = true;
      this.sessionStats.flawlessRooms++;
    }

    var maxHp = (player && player.maxHp) ? player.maxHp : 100;
    if (t.damageTaken >= maxHp * 0.35 || t.hpAtExit < maxHp * 0.25) {
      t.struggleDetected = true;
      this.sessionStats.criticalStruggles++;
    }

    // Agregar a historial rodante
    this.history.push(t);
    if (this.history.length > EYE_CONFIG.MAX_HISTORY_ROOMS) {
      this.history.shift();
    }
    this.sessionStats.totalRoomsRecorded++;

    // Recalcular la tensión y los moduladores
    this.evaluateAdaptation(room, player);
    this.currentRoomTelemetry = null;
  };

  /**
   * Núcleo Matemático: Evalúa el desempeño y calcula la nueva Tensión
   */
  BrotherEyeEngine.prototype.evaluateAdaptation = function (room, player) {
    if (this.history.length === 0) return;

    var latest = this.history[this.history.length - 1];
    var benchmark = EYE_CONFIG.BASE_TARGET_ROOM_TIME;
    if (latest.roomType === 'HARD') benchmark *= EYE_CONFIG.HARD_ROOM_TIME_MULT;
    if (latest.roomType === 'BOSS') benchmark *= 2.5;

    // 1. Factor de Velocidad (Time Score):
    // Ratio < 1.0 => Más rápido que el promedio (sube dificultad)
    // Ratio > 1.0 => Más lento que el promedio (baja dificultad)
    var timeRatio = latest.duration / benchmark;
    var timeTensionDelta = 0;
    if (timeRatio < 0.65) {
      // Limpieza ultrarrápida: Jugador arrasando
      timeTensionDelta = +0.18;
    } else if (timeRatio < 0.90) {
      // Buen ritmo
      timeTensionDelta = +0.08;
    } else if (timeRatio > 1.70) {
      // Tardó demasiado: está atascado o sufriendo
      timeTensionDelta = -0.15;
    } else if (timeRatio > 1.30) {
      timeTensionDelta = -0.06;
    }

    // 2. Factor de Supervivencia y Daño (Health Score):
    var healthTensionDelta = 0;
    if (latest.isFlawless) {
      // Sin un solo rasguño
      healthTensionDelta = +0.15;
    } else if (latest.struggleDetected) {
      // Recibió castigo severo: aliviar presión
      healthTensionDelta = -0.22;
    } else if (latest.damageTaken > 0) {
      healthTensionDelta = -0.04;
    }

    // 3. Modulación por Estado Actual del Jugador:
    var playerHpRatio = (player && player.maxHp) ? (player.hp / player.maxHp) : 1.0;
    var emergencyBias = 0;
    if (playerHpRatio <= 0.25) {
      // Estado agonizante: Brother Eye entra en modo asistencia sutil
      emergencyBias = -0.15;
    } else if (playerHpRatio >= 0.85 && latest.isFlawless) {
      // Jugador con vida al tope dominando
      emergencyBias = +0.05;
    }

    // Calcular Target Tension
    var rawDelta = timeTensionDelta + healthTensionDelta + emergencyBias;
    this.targetTension = Math.max(EYE_CONFIG.MIN_TENSION, Math.min(EYE_CONFIG.MAX_TENSION, this.currentTension + rawDelta));

    // Suavizado (Lerp) para evitar transiciones toscas
    this.currentTension += (this.targetTension - this.currentTension) * EYE_CONFIG.TENSION_SMOOTHING;
    this.currentTension = Math.max(0.0, Math.min(1.0, this.currentTension));

    // 4. Mapear Tensión [0.0 ... 1.0] a Modificadores del Juego:
    // Tensión 0.5 = 1.0x (Dificultad normal balanceada)
    // Tensión 1.0 = Máxima hostilidad (Más spawns, bichos ágiles)
    // Tensión 0.0 = Alivio (Menos spawns, bichos con menos HP, más drops de cura)
    var factor = (this.currentTension - 0.5) * 2; // Rango [-1.0 ... +1.0]

    var lim = EYE_CONFIG.LIMITS;
    if (factor >= 0) {
      // Escalando hacia arriba
      this.modifiers.spawnMultiplier = 1.0 + factor * (lim.MAX_SPAWN_MULT - 1.0);
      this.modifiers.enemyHpMultiplier = 1.0 + factor * (lim.MAX_HP_MULT - 1.0);
      this.modifiers.enemySpeedMultiplier = 1.0 + factor * (lim.MAX_SPEED_MULT - 1.0);
      this.modifiers.eliteChanceMultiplier = 1.0 + factor * 0.5;
      this.modifiers.heartDropBonus = factor * lim.MIN_DROP_HEART_BONUS; // Ligeramente menos curas gratis
    } else {
      // Aliviando presión (factor negativo)
      var absF = Math.abs(factor);
      this.modifiers.spawnMultiplier = 1.0 - absF * (1.0 - lim.MIN_SPAWN_MULT);
      this.modifiers.enemyHpMultiplier = 1.0 - absF * (1.0 - lim.MIN_HP_MULT);
      this.modifiers.enemySpeedMultiplier = 1.0 - absF * (1.0 - lim.MIN_SPEED_MULT);
      this.modifiers.eliteChanceMultiplier = Math.max(0.2, 1.0 - absF * 0.6);
      this.modifiers.heartDropBonus = absF * lim.MAX_DROP_HEART_BONUS; // Mayor drop de socorro
    }

    if (typeof this.onTensionChanged === 'function') {
      this.onTensionChanged(this.currentTension, this.modifiers);
    }
  };

  /**
   * Modifica en tiempo de spawn un enemigo individual si Brother Eye está activo
   */
  BrotherEyeEngine.prototype.tuneSpawnedEnemy = function (enemy) {
    if (!this.enabled || !enemy) return;

    if (this.modifiers.enemyHpMultiplier !== 1.0) {
      enemy.maxHp = Math.max(1, Math.round(enemy.maxHp * this.modifiers.enemyHpMultiplier));
      enemy.hp = enemy.maxHp;
    }
    if (this.modifiers.enemySpeedMultiplier !== 1.0) {
      enemy.speed = Math.max(40, Math.round(enemy.speed * this.modifiers.enemySpeedMultiplier));
    }
  };

  /**
   * Obtiene el multiplicador de spawn adaptativo para la generación de salas
   */
  BrotherEyeEngine.prototype.getAdaptiveSpawnMultiplier = function () {
    return this.enabled ? this.modifiers.spawnMultiplier : 1.0;
  };

  /**
   * Obtiene la bonificación adaptativa de drop de vida
   */
  BrotherEyeEngine.prototype.getHeartDropBonus = function () {
    return this.enabled ? this.modifiers.heartDropBonus : 0.0;
  };

  /**
   * Diagnóstico legible de estado para depuración o modo de prueba
   */
  BrotherEyeEngine.prototype.getStatus = function () {
    return {
      enabled: this.enabled,
      tensionPercent: Math.round(this.currentTension * 100),
      evaluation: this.currentTension > 0.75 ? 'DOMINANDO (ALTA PRESIÓN)' : (this.currentTension < 0.35 ? 'EN PELIGRO (ALIVIO ASISTIDO)' : 'EQUILIBRIO NATURAL'),
      spawnMult: Number(this.modifiers.spawnMultiplier.toFixed(2)),
      hpMult: Number(this.modifiers.enemyHpMultiplier.toFixed(2)),
      speedMult: Number(this.modifiers.enemySpeedMultiplier.toFixed(2)),
      totalRooms: this.sessionStats.totalRoomsRecorded,
      flawless: this.sessionStats.flawlessRooms,
      struggles: this.sessionStats.criticalStruggles
    };
  };

  return new BrotherEyeEngine();
}));
