/**
 * ============================================================================
 * BROTHEREYE.JS - SISTEMA JUDICIAL DE DIFICULTAD ADAPTATIVA (v3.3 GLOBAL LEDGER)
 * ============================================================================
 * Arquitectura de Tribunal Interno ("El Debate") en 3 Capas de Memoria:
 *
 *  1. ESTADOS DE RECONOCIMIENTO (-1 al 3) [Micro-Memoria de Sala]:
 *     - ESTADO -1 (GLOBAL_CLOCK): Reloj global, contador de salas, muertes y
 *       Presión Acumulada ("Calor Judicial").
 *     - ESTADO 0  (INITIALIZE): Foto base de la run (HP, Escudo, DPS, Reliquias).
 *     - ESTADO 1  (ROOM_ENTER): Aplica la sentencia previa (Cantidad, HP Enemigo,
 *       Daño, Velocidad, Élites, Emboscada Némesis y Contramedidas) e inicia reloj.
 *     - ESTADO 2  (MIDPOINT 50%): Foto forense al caer el 50% de enemigos.
 *     - ESTADO 3  (ROOM_COMPLETE 100%): Acta final de Tiempo, % Tanque perdido,
 *       DTPS real, KPS y Slowdown.
 *
 *  2. ESTADO 4 - EL DEBATE JUDICIAL + TABLA DE DIRECTIVAS GLOBALES:
 *     - BROTHER EYE (El Fiscal Sádico) vs JUSTICE EYE (El Abogado Defensor)
 *       evaluando sala actual, calor acumulado, memoria corta y Directivas del
 *       Expediente Global, seguido por TIRADA DE DADOS (Factor Caos).
 *
 *  3. MEMORIA A CORTO PLAZO (shortTermMemory):
 *     - Registra spam de proyectil/rayo/melee, parry, dirección fija de dash y
 *       camping. Se BORRA cada N = 4 salas o al cambiar de Nivel.
 *
 *  4. EXPEDIENTE GLOBAL DEL JUGADOR (globalLedger — Biografía Event-Driven):
 *     - Cero consultas por frame: capturado por eventos exactos (cambios de arma,
 *       daño recibido, bajas, eventos al límite <=22% HP, promedio en salas/jefes,
 *       total histórico de reliquias inmune a Reliquia Prohibida / NG+, dashes).
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

  var SESSION_DEATHS_KEY = 'chanchito_judicial_deaths_v3';

  // ==========================================================================
  // PARÁMETROS CONFIGURABLES DEL TRIBUNAL Y MEMORIA DE CORTO PLAZO
  // ==========================================================================
  var EYE_CONFIG = {
    ENABLED_BY_DEFAULT: true,

    // Pesos de la métrica clásica R (mantenida para telemetría comparativa)
    WEIGHTS: {
      S_SURVIVAL: 0.30,
      P_POWER: 0.20,
      V_SPEED: 0.20,
      E_EFFICIENCY: 0.20,
      G_PROGRESSION: 0.10
    },
    EXPECTED_PERFORMANCE_R: 65.0,

    BENCHMARKS: {
      EXPECTED_ROOM_SECONDS: 11.5, // Tiempo base esperado de una sala de combate equilibrada
      EXPECTED_BOSS_SECONDS: 24.0, // Tiempo base esperado de una sala de Jefe
      EXPECTED_KPS: 0.55,
      EXPECTED_RELICS_PER_MIN: 0.8
    },

    // Tabla de Telemetría a Corto Plazo (Reset cada N salas o cambio de nivel)
    SHORT_TERM_MEMORY: {
      RESET_INTERVAL_ROOMS: 4,     // Borrón y cuenta nueva cada 4 salas o al cambiar de nivel
      MIN_ACTIONS_FOR_PATTERN: 7,  // Mínimo de acciones ofensivas para diagnosticar spam
      MIN_DASHES_FOR_PATTERN: 5,   // Mínimo de dashes para diagnosticar dirección fija
      DOMINANT_RATIO: 0.74,        // >74% en una sola acción/dirección = táctica repetida
      CAMPING_RATIO: 0.62,         // >62% del tiempo quieto en combate = camping
      PATTERN_PENALTY_SCORE: 18    // Agravante temporal en el debate
    },

    // Límites del Tribunal (ahora incluye HP enemigo y promoción Élite)
    LIMITS: {
      // Cantidad de enemigos
      COUNT_MIN: 0.65,
      COUNT_MAX_NORMAL: 1.85,
      COUNT_MAX_MAXIMA: 2.45,
      COUNT_MAX_CURSE: 2.60,

      // Vida de enemigos comunes/élites (evita que mueran en 0.8s en sala 25+)
      HP_MIN: 0.82,
      HP_MAX_NORMAL: 2.10,
      HP_MAX_MAXIMA: 3.20,
      HP_MAX_CURSE: 2.85,

      // Daño enemigo
      DMG_MIN: 0.72,
      DMG_MAX_NORMAL: 1.50,
      DMG_MAX_MAXIMA: 1.85,
      DMG_MAX_CURSE: 1.90,

      // Velocidad enemiga (contenida para nunca superar al jugador base = 270 px/s)
      SPD_MIN: 0.88,
      SPD_MAX_NORMAL: 1.07,
      SPD_MAX_MAXIMA: 1.10,
      SPD_MAX_CURSE: 1.12
    },

    // Tirada de Dados (Factor Caos)
    CHAOS_DICE: {
      BLESSING_MAX_ROLL: 10,       // d100 <= 10 => 10% Bendición Divina
      CURSE_MIN_ROLL: 90,          // d100 >= 90 => 11% Maldición del Tribunal
      TURBULENCE_MIN: 0.84,        // Oscilación aleatoria del veredicto
      TURBULENCE_MAX: 1.22
    },

    MAX_HISTORY_LOG: 120
  };

  // ==========================================================================
  // UTILIDADES INTERNAS
  // ==========================================================================
  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function getMaxHeatForDepth(roomsCleared) {
    if (roomsCleared >= 24) return 100;
    if (roomsCleared >= 18) return 80;
    if (roomsCleared >= 12) return 62;
    if (roomsCleared >= 6) return 42;
    return 24;
  }

  function rollDiceRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function loadSessionDeaths() {
    try {
      if (typeof sessionStorage !== 'undefined') {
        var raw = sessionStorage.getItem(SESSION_DEATHS_KEY);
        var parsed = parseInt(raw, 10);
        if (!isNaN(parsed) && parsed >= 0) return parsed;
      }
    } catch (_) { /* noop */ }
    return 0;
  }

  function saveSessionDeaths(count) {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(SESSION_DEATHS_KEY, String(count));
      }
    } catch (_) { /* noop */ }
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
    var bonus = player.extraProjectiles || player.bonusProjectiles || 0;
    return Math.max(1, 1 + bonus);
  }

  function computePlayerDpsPower(player) {
    if (!player) return 1.0;
    var dmg = player.damageMultiplier || 1.0;
    var aspd = player.attackSpeedMultiplier || 1.0;
    var extraProj = Math.min(6, player.extraProjectiles || player.bonusProjectiles || 0);
    var evoBonus = (player.activeEvolutions && player.activeEvolutions.size)
      ? player.activeEvolutions.size * 0.25
      : 0;
    var synBonus = (typeof window !== 'undefined' && window.synergyEngine && window.synergyEngine.activeSynergies)
      ? window.synergyEngine.activeSynergies.size * 0.18
      : 0;
    return Math.max(0.5, dmg * aspd * (1.0 + extraProj * 0.42) + evoBonus + synBonus);
  }

  function createEmptyShortTermMemory(reason) {
    return {
      roomsSinceReset: 0,
      resetIntervalRooms: EYE_CONFIG.SHORT_TERM_MEMORY.RESET_INTERVAL_ROOMS,
      lastResetReason: reason || 'INIT',
      justClearedMemory: false,
      actions: {
        projectileShots: 0,
        beamShots: 0,
        meleeSwings: 0,
        parrySuccess: 0,
        dashes: 0,
        perfectDodges: 0
      },
      dodgeDirs: {
        LEFT: 0,
        RIGHT: 0,
        UP: 0,
        DOWN: 0
      },
      weaponModes: {},
      combatTimeTotal: 0.0,
      campingTime: 0.0,
      detectedPatterns: [],
      dominantPatternLabel: 'VARIADO',
      countermeasurePlan: 'Ninguna (juego balanceado)',
      penaltyScore: 0
    };
  }

  // ==========================================================================
  // 3RA CAPA: EXPEDIENTE GLOBAL DEL JUGADOR (BIOGRAFÍA EVENT-DRIVEN + DIRECTIVAS)
  // ==========================================================================
  var SPAWNABLE_NEMESIS_MAP = {
    ShooterEnemy: 'ShooterEnemy',
    ChargerEnemy: 'ChargerEnemy',
    FlyerEnemy: 'FlyerEnemy',
    SplitterEnemy: 'SplitterEnemy',
    EliteEnemy: 'EliteEnemy',
    Enemy: 'Enemy'
  };

  function normalizeArchetype(rawName) {
    if (!rawName || typeof rawName !== 'string') return null;
    if (SPAWNABLE_NEMESIS_MAP[rawName]) return SPAWNABLE_NEMESIS_MAP[rawName];
    if (rawName.indexOf('Boss') !== -1) return rawName;
    if (rawName === 'WormEnemy' || rawName === 'ShadowReplicaEnemy') return rawName;
    if (rawName === 'Hazard') return 'Hazard';
    return rawName;
  }

  function createEmptyGlobalLedger(prevLedger, isNgPlusCarry) {
    if (isNgPlusCarry && prevLedger) {
      return {
        weaponSwitchCount: prevLedger.weaponSwitchCount || 0,
        weaponUsageById: Object.assign({}, prevLedger.weaponUsageById || {}),
        offenseTotals: Object.assign(
          { projectileShots: 0, beamShots: 0, meleeSwings: 0, parrySuccess: 0 },
          prevLedger.offenseTotals || {}
        ),
        totalDamageReceived: prevLedger.totalDamageReceived || 0,
        totalEnemiesKilled: prevLedger.totalEnemiesKilled || 0,
        nearDeathCount: prevLedger.nearDeathCount || 0,
        nemesisByArchetype: Object.assign({}, prevLedger.nemesisByArchetype || {}),
        nemesisArchetype: prevLedger.nemesisArchetype || null,
        nemesisSpawnArchetype: prevLedger.nemesisSpawnArchetype || null,
        bossKillTimes: Array.isArray(prevLedger.bossKillTimes) ? prevLedger.bossKillTimes.slice() : [],
        avgBossKillTime: prevLedger.avgBossKillTime || 0,
        roomClearTimes: Array.isArray(prevLedger.roomClearTimes) ? prevLedger.roomClearTimes.slice() : [],
        avgRoomClearTime: prevLedger.avgRoomClearTime || 0,
        totalRelicsEverGained: prevLedger.totalRelicsEverGained || 0,
        forbiddenSacrificesCount: prevLedger.forbiddenSacrificesCount || 0,
        totalDashesUsed: prevLedger.totalDashesUsed || 0,
        totalPerfectDodges: prevLedger.totalPerfectDodges || 0,
        ngPlusCyclesCarried: (prevLedger.ngPlusCyclesCarried || 0) + 1
      };
    }

    return {
      weaponSwitchCount: 0,
      weaponUsageById: {},
      offenseTotals: {
        projectileShots: 0,
        beamShots: 0,
        meleeSwings: 0,
        parrySuccess: 0
      },
      totalDamageReceived: 0,
      totalEnemiesKilled: 0,
      nearDeathCount: 0,
      nemesisByArchetype: {},
      nemesisArchetype: null,
      nemesisSpawnArchetype: null,
      bossKillTimes: [],
      avgBossKillTime: 0,
      roomClearTimes: [],
      avgRoomClearTime: 0,
      totalRelicsEverGained: 0,
      forbiddenSacrificesCount: 0,
      totalDashesUsed: 0,
      totalPerfectDodges: 0,
      ngPlusCyclesCarried: 0
    };
  }

  function recomputeNemesisFromLedger(ledger) {
    if (!ledger || !ledger.nemesisByArchetype) return;
    var map = ledger.nemesisByArchetype;
    var topAny = null;
    var topAnyScore = 0;
    var topSpawnable = null;
    var topSpawnableScore = 0;

    var keys = Object.keys(map);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var val = map[k] || 0;
      if (val > topAnyScore) {
        topAnyScore = val;
        topAny = k;
      }
      if (SPAWNABLE_NEMESIS_MAP[k] && val > topSpawnableScore) {
        topSpawnableScore = val;
        topSpawnable = SPAWNABLE_NEMESIS_MAP[k];
      }
    }

    ledger.nemesisArchetype = topAnyScore > 0 ? topAny : null;
    ledger.nemesisSpawnArchetype = topSpawnableScore > 0 ? topSpawnable : null;
  }

  function computeAverage(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return 0;
    var sum = 0;
    for (var i = 0; i < arr.length; i++) sum += arr[i];
    return Number((sum / arr.length).toFixed(2));
  }

  /**
   * Tabla Declarativa de Directivas Globales (Evaluada 1 vez por sala en Estado 4).
   * Evita un if/else gigante por frame y combina Precisión Judicial + Mutadores Caóticos.
   */
  var GLOBAL_DIRECTIVES_TABLE = [
    {
      id: 'PODER_DEVORADO',
      label: 'Poder Devorado',
      tone: 'FISCAL',
      match: function (ctx) {
        return ctx.ledger.totalRelicsEverGained >= 7 && ctx.currentRelics <= 2;
      },
      apply: function (ctx) {
        ctx.prosecutorBonus += 26;
        ctx.eliteBonus += 0.14;
        ctx.curseThresholdShift += 4;
        ctx.prosecutorReasons.push(
          'Directiva PODER_DEVORADO (' + ctx.ledger.totalRelicsEverGained + ' reliquias históricas / ' + ctx.currentRelics + ' actuales, +26)'
        );
      }
    },
    {
      id: 'MONJE_UNA_ARMA',
      label: 'Monje de 1 Arma',
      tone: 'CAOS',
      match: function (ctx) {
        return ctx.roomsCleared >= 8 && ctx.ledger.weaponSwitchCount === 0;
      },
      apply: function (ctx) {
        ctx.prosecutorBonus += 12;
        ctx.prosecutorReasons.push(
          'Directiva MONJE_UNA_ARMA (0 cambios de arma en ' + ctx.roomsCleared + ' salas, +12)'
        );
        var ot = ctx.ledger.offenseTotals || {};
        var p = ot.projectileShots || 0;
        var b = ot.beamShots || 0;
        var m = ot.meleeSwings || 0;
        if (m > p && m > b) ctx.directiveCounterPattern = 'SPAM_MELEE';
        else if (b > p && b > m) ctx.directiveCounterPattern = 'SPAM_RAYO';
        else ctx.directiveCounterPattern = 'SPAM_PROYECTILES';
      }
    },
    {
      id: 'MAESTRO_ARSENAL',
      label: 'Maestro de Arsenal',
      tone: 'FISCAL',
      match: function (ctx) {
        return (
          ctx.ledger.weaponSwitchCount >= 14 &&
          ctx.ledger.avgRoomClearTime > 0 &&
          ctx.ledger.avgRoomClearTime < 9.5
        );
      },
      apply: function (ctx) {
        ctx.prosecutorBonus += 16;
        ctx.countMultFloor = Math.max(ctx.countMultFloor, 1.25);
        ctx.prosecutorReasons.push(
          'Directiva MAESTRO_ARSENAL (' + ctx.ledger.weaponSwitchCount + ' swaps | ' + ctx.ledger.avgRoomClearTime + 's prom, +16)'
        );
      }
    },
    {
      id: 'VERDUGO_DE_JEFES',
      label: 'Verdugo de Jefes',
      tone: 'FISCAL',
      match: function (ctx) {
        return ctx.ledger.bossKillTimes.length >= 1 && ctx.ledger.avgBossKillTime > 0 && ctx.ledger.avgBossKillTime < 14.0;
      },
      apply: function (ctx) {
        ctx.prosecutorBonus += 18;
        ctx.bossTenacityFloor = Math.max(ctx.bossTenacityFloor, 1.38);
        ctx.prosecutorReasons.push(
          'Directiva VERDUGO_DE_JEFES (prom ' + ctx.ledger.avgBossKillTime + 's/jefe, +18 & Tenacidad Boss)'
        );
      }
    },
    {
      id: 'INTOCABLE',
      label: 'Cacería del Intocable',
      tone: 'CAOS',
      match: function (ctx) {
        return ctx.roomsCleared >= 10 && ctx.ledger.nearDeathCount === 0 && ctx.ledger.totalDamageReceived < 45;
      },
      apply: function (ctx) {
        ctx.prosecutorBonus += 22;
        ctx.minHeatFloor = Math.max(ctx.minHeatFloor, 45);
        ctx.curseThresholdShift += 8; // Duplica chance de MALDICION_TRIBUNAL en d100
        ctx.prosecutorReasons.push(
          'Directiva INTOCABLE (0 casi-muertes / ' + Math.round(ctx.ledger.totalDamageReceived) + ' dmg total, +22 & x2 Maldición)'
        );
      }
    },
    {
      id: 'SUPERVIVIENTE_CASTIGADO',
      label: 'Clemencia de Veterano',
      tone: 'DEFENSOR',
      match: function (ctx) {
        return (
          ctx.ledger.nearDeathCount >= 3 ||
          (ctx.roomsCleared >= 3 && (ctx.ledger.totalDamageReceived / Math.max(1, ctx.roomsCleared)) > 28)
        );
      },
      apply: function (ctx) {
        ctx.defenderBonus += 28;
        ctx.damageFactor *= 0.88;
        ctx.heartDropBonus += 0.12;
        ctx.defenderReasons.push(
          'Directiva SUPERVIVIENTE_CASTIGADO (' + ctx.ledger.nearDeathCount + ' casi-muertes, +28 & -12% dmg)'
        );
      }
    },
    {
      id: 'HIPER_MOVILIDAD',
      label: 'Contra Hiper-Dash',
      tone: 'FISCAL',
      match: function (ctx) {
        return ctx.roomsCleared >= 4 && (ctx.ledger.totalDashesUsed / Math.max(1, ctx.roomsCleared)) >= 9.0;
      },
      apply: function (ctx) {
        ctx.prosecutorBonus += 10;
        if (!ctx.directiveCounterPattern) ctx.directiveCounterPattern = 'SPAM_MELEE'; // Fuerza shooters contra hiper-movilidad sin subir velocidad
        ctx.prosecutorReasons.push(
          'Directiva HIPER_MOVILIDAD (' + (ctx.ledger.totalDashesUsed / ctx.roomsCleared).toFixed(1) + ' dashes/sala, +10)'
        );
      }
    },
    {
      id: 'NEMESIS_PERSONAL',
      label: 'Némesis Personal',
      tone: 'CAOS',
      match: function (ctx) {
        if (!ctx.ledger.nemesisSpawnArchetype || ctx.ledger.totalDamageReceived < 25) return false;
        var map = ctx.ledger.nemesisByArchetype || {};
        var nemScore = map[ctx.ledger.nemesisSpawnArchetype] || 0;
        return nemScore >= 25;
      },
      apply: function (ctx) {
        ctx.nemesisSpawnArchetype = ctx.ledger.nemesisSpawnArchetype;
        ctx.prosecutorReasons.push(
          'Directiva NEMESIS_PERSONAL [' + ctx.ledger.nemesisSpawnArchetype + '] lista para emboscada'
        );
      }
    }
  ];

  // ==========================================================================
  // MOTOR PRINCIPAL: TRIBUNAL ADAPTATIVO BROTHER EYE + JUSTICE EYE
  // ==========================================================================
  function BrotherEyeEngine() {
    this.enabled = EYE_CONFIG.ENABLED_BY_DEFAULT;
    this.version = '3.3.0-JUDICIAL-LEDGER';
    this.config = EYE_CONFIG;

    // ESTADO -1: Reloj Global, Salas Limpiadas, Muertes y Calor Acumulado
    this.globalClock = {
      active: false,
      elapsedSeconds: 0.0,
      resetReason: 'NONE',
      deathsCount: loadSessionDeaths(),
      roomsClearedCount: 0,
      bossesKilledCount: 0,
      baseHeatLevel: 0.0 // 0..100 presión acumulada de la run
    };

    // 3ra Capa: Expediente Global del Jugador (Biografía de toda la run + NG+)
    this.globalLedger = createEmptyGlobalLedger(null, false);
    this.activeGlobalDirectives = [];
    this.lastDirectiveOutcome = {
      bossTenacityFloor: 1.0,
      nemesisSpawnArchetype: null,
      directiveCounterPattern: null
    };

    // ESTADO 0: Foto Inicial
    this.state0_initial = {
      initialized: false,
      initialTime: 0.0,
      maxHp: 100,
      shield: 0,
      totalVitality: 100,
      speed: 250,
      damageMultiplier: 1.0,
      projectiles: 1,
      totalRelics: 0,
      potentialDpsBase: 1.0
    };

    // ESTADO 1: Entrada a Sala
    this.state1_enter = {
      activeInRoom: false,
      roomType: 'NORMAL',
      sectionNumber: 1,
      levelNumber: 1,
      globalTimeAtEntry: 0.0,
      roomClockSeconds: 0.0,
      entryHp: 100,
      entryShield: 0,
      entryVitality: 100,
      entryRelics: 0,
      entryDamageMult: 1.0,
      entryProjectiles: 1,
      entrySpeed: 250,
      entryDpsPower: 1.0,
      totalEnemiesInitial: 0,
      lastPlayerX: null,
      lastPlayerY: null,
      roomCombatTime: 0.0,
      roomCampingTime: 0.0
    };

    // ESTADO 2: Midpoint (50% enemigos muertos)
    this.state2_midpoint = {
      triggered: false,
      timeElapsedFirstHalf: 0.0,
      hpAtMidpoint: 100,
      shieldAtMidpoint: 0,
      vitalityAtMidpoint: 100,
      hpLostFirstHalf: 0,
      percentLostFirstHalf: 0.0,
      relicsAtMidpoint: 0,
      newRelicsAcquiredMid: 0,
      enemiesKilledFirstHalf: 0,
      enemiesRemainingMid: 0,
      kpsFirstHalf: 0.0,
      dtpsFirstHalf: 0.0
    };

    // ESTADO 3: Finalización de la Sala
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
      percentVitalityLost: 0.0,
      hpLostSecondHalf: 0,
      enemiesKilledSecondHalf: 0,
      kpsSecondHalf: 0.0,
      kpsTotal: 0.0,
      dtpsSecondHalf: 0.0,
      dtpsTotal: 0.0,
      combatSlowdownRatio: 1.0,
      campRatioInRoom: 0.0,
      potentialDpsSnapshot: 1.0
    };

    // Tabla de Telemetría a Corto Plazo (Reset periódico cada N salas o cambio de nivel)
    this.shortTermMemory = createEmptyShortTermMemory('INIT');

    // ESTADO 4: El Debate Judicial + Tirada de Dados
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

      // Datos explícitos del Tribunal Judicial
      courtDebate: {
        prosecutorScore: 0.0,          // BrotherEye (El Fiscal Sádico)
        prosecutorReasons: [],
        defenderScore: 0.0,            // JusticeEye (El Abogado Defensor)
        defenderReasons: [],
        debateMargin: 0.0,             // Fiscal - Defensor
        heatApplied: 0.0,              // Presión acumulada aplicada
        rawVerdictScore: 0.0,          // Margen + Calor
        effectiveVerdictScore: 0.0,    // Tras turbulencia de dados
        winner: 'EMPATE'               // 'BROTHER_EYE' | 'JUSTICE_EYE' | 'CAOS_DADOS' | 'EMPATE'
      },

      diceStats: {
        minPoint: 65.0,
        maxPoint: 65.0,
        spread: 0.0,
        noiseRoll: 0.5,
        chaosD100: 50,                 // Dado principal del Tribunal (1..100)
        turbulenceMult: 1.0,           // Factor turbulencia [0.84..1.22]
        chaosOutcome: 'DEBATE_NORMAL', // 'BENDICION_DIVINA' | 'MALDICION_TRIBUNAL' | 'DEBATE_NORMAL'
        lowNoiseTriggered: false       // Compatibilidad v2
      },

      godStreak: 0,
      regime: 'JUICIO_EQUILIBRADO',
      nextRoomModifiers: {
        enemyCountMultiplier: 1.0,
        enemyHpMultiplier: 1.0,
        enemyDamageMultiplier: 1.0,
        enemySpeedMultiplier: 1.0,
        elitePromotionChance: 0.0,
        reactionDelayOverride: null,
        heartDropBonus: 0.0
      }
    };

    this.roomHistory = [];
    this.onUpdateCallback = null;
  }

  BrotherEyeEngine.prototype.setEnabled = function (enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) {
      this.resetNeutralModifiers();
    }
  };

  BrotherEyeEngine.prototype.resetNeutralModifiers = function () {
    var mod = this.state4_adaptive.nextRoomModifiers;
    mod.enemyCountMultiplier = 1.0;
    mod.enemyHpMultiplier = 1.0;
    mod.enemyDamageMultiplier = 1.0;
    mod.enemySpeedMultiplier = 1.0;
    mod.elitePromotionChance = 0.0;
    mod.reactionDelayOverride = null;
    mod.heartDropBonus = 0.0;
    this.state4_adaptive.regime = 'JUICIO_EQUILIBRADO';
    this.state4_adaptive.godStreak = 0;
  };

  // ==========================================================================
  // ESTADO -1 & ESTADO 0: INITIALIZE Y CAMBIO DE NIVEL
  // ==========================================================================
  BrotherEyeEngine.prototype.initialize = function (player, reason) {
    if (!this.enabled) return;

    var maxHp = (player && player.maxHp) ? player.maxHp : 100;
    var shield = (player && player.shield) ? player.shield : 0;
    var speed = (player && player.speed) ? player.speed : 250;
    var dmg = (player && player.damageMultiplier) ? player.damageMultiplier : 1.0;
    var projs = getPlayerProjectileCount(player);
    var relics = getPlayerRelicCount(player);

    var isNgPlusCarry = (reason === 'NG_PLUS');
    var prevHeat = this.globalClock.baseHeatLevel || 0.0;
    this.globalClock.active = true;
    this.globalClock.elapsedSeconds = 0.0;
    this.globalClock.resetReason = reason || 'INIT';
    this.globalClock.roomsClearedCount = isNgPlusCarry ? this.globalClock.roomsClearedCount : 0;
    this.globalClock.bossesKilledCount = isNgPlusCarry ? this.globalClock.bossesKilledCount : 0;
    this.globalClock.baseHeatLevel = isNgPlusCarry ? Math.max(25, prevHeat * 0.7) : 0.0;

    this.state0_initial = {
      initialized: true,
      initialTime: 0.0,
      maxHp: maxHp,
      shield: shield,
      totalVitality: maxHp + shield,
      speed: speed,
      damageMultiplier: dmg,
      projectiles: projs,
      totalRelics: relics,
      potentialDpsBase: computePlayerDpsPower(player)
    };

    // Reinicia Expediente Global en run nueva; lo conserva y acumula en NG+
    this.globalLedger = createEmptyGlobalLedger(this.globalLedger, isNgPlusCarry);
    this.globalLedger.totalRelicsEverGained = Math.max(this.globalLedger.totalRelicsEverGained || 0, relics);
    this.activeGlobalDirectives = [];
    this.lastDirectiveOutcome = {
      bossTenacityFloor: 1.0,
      nemesisSpawnArchetype: null,
      directiveCounterPattern: null
    };

    this.resetShortTermMemory(reason || 'INIT');
    this.resetNeutralModifiers();
    if (!isNgPlusCarry) {
      this.roomHistory = [];
    }
  };

  BrotherEyeEngine.prototype.onPlayerDeath = function () {
    this.globalClock.active = false;
    this.globalClock.deathsCount += 1;
    saveSessionDeaths(this.globalClock.deathsCount);
    this.state1_enter.activeInRoom = false;
  };

  /**
   * Al pasar de nivel/piso, la memoria táctica a corto plazo hace "borrón y cuenta nueva"
   * para no arrastrar el encasillamiento de la zona anterior.
   */
  BrotherEyeEngine.prototype.onLevelTransition = function (section, level) {
    if (!this.enabled) return;
    this.resetShortTermMemory('NEW_LEVEL_S' + (section || '?') + 'N' + (level || '?'));
    // Pequeño respiro en el calor temporal (sin borrar la presión de run acumulada)
    this.globalClock.baseHeatLevel = Math.max(0, this.globalClock.baseHeatLevel - 4);
  };

  // ==========================================================================
  // HOOKS EVENT-DRIVEN DEL EXPEDIENTE GLOBAL (0 SOBRECARGA POR FRAME)
  // ==========================================================================
  BrotherEyeEngine.prototype.recordWeaponSwitch = function (fromIdx, toIdx, weaponId) {
    if (!this.enabled) return;
    if (fromIdx === toIdx) return;
    this.globalLedger.weaponSwitchCount += 1;
    if (weaponId) {
      this.globalLedger.weaponUsageById[weaponId] = this.globalLedger.weaponUsageById[weaponId] || 0;
    }
  };

  BrotherEyeEngine.prototype.recordRelicGained = function (relicId, countDelta) {
    if (!this.enabled) return;
    var delta = (typeof countDelta === 'number' && countDelta > 0) ? countDelta : 1;
    this.globalLedger.totalRelicsEverGained += delta;
  };

  BrotherEyeEngine.prototype.recordRelicSacrifice = function (sacrificedCount) {
    if (!this.enabled) return;
    var count = (typeof sacrificedCount === 'number' && sacrificedCount > 0) ? sacrificedCount : 1;
    this.globalLedger.forbiddenSacrificesCount += count;
    // Nota de diseño: totalRelicsEverGained JAMÁS se resta al sacrificar objetos.
  };

  BrotherEyeEngine.prototype.recordPlayerDamage = function (rawDamageApplied, hpAfter, maxHp, attackerArchetype, crossedNearDeath) {
    if (!this.enabled || typeof rawDamageApplied !== 'number' || rawDamageApplied <= 0) return;
    var ledger = this.globalLedger;
    ledger.totalDamageReceived = Number((ledger.totalDamageReceived + rawDamageApplied).toFixed(1));

    var arch = normalizeArchetype(attackerArchetype);
    if (arch) {
      ledger.nemesisByArchetype[arch] = (ledger.nemesisByArchetype[arch] || 0) + Math.round(rawDamageApplied);
    }

    if (crossedNearDeath) {
      ledger.nearDeathCount += 1;
      if (arch) {
        ledger.nemesisByArchetype[arch] = (ledger.nemesisByArchetype[arch] || 0) + 35;
      }
    }

    if (arch) {
      recomputeNemesisFromLedger(ledger);
    }
  };

  BrotherEyeEngine.prototype.recordEnemyKill = function (enemyArchetype, isBoss) {
    if (!this.enabled) return;
    this.globalLedger.totalEnemiesKilled += 1;
  };

  // ==========================================================================
  // TABLA DE TELEMETRÍA A CORTO PLAZO (REGISTRO DE PATRONES Y BORRADO)
  // ==========================================================================
  BrotherEyeEngine.prototype.resetShortTermMemory = function (reason) {
    this.shortTermMemory = createEmptyShortTermMemory(reason || 'CYCLE_RESET');
    this.shortTermMemory.justClearedMemory = (reason && reason !== 'INIT' && reason !== 'NEW_RUN_OR_R');
    if (typeof HiveMindSystem !== 'undefined' && HiveMindSystem && typeof HiveMindSystem.syncWithBrotherEyeReset === 'function') {
      HiveMindSystem.syncWithBrotherEyeReset(reason || 'CYCLE_RESET');
    }
  };

  /**
   * Registra una acción del jugador para detectar tácticas repetidas / spam:
   *  - category: 'PROJECTILE' | 'BEAM' | 'MELEE' | 'PARRY' | 'DASH' | 'PERFECT_DODGE'
   *  - detail: opcional (ej. { weaponId, modeId, dirX, dirY })
   */
  BrotherEyeEngine.prototype.recordAction = function (category, detail) {
    if (!this.enabled) return;
    var mem = this.shortTermMemory;
    var act = mem.actions;
    var ledger = this.globalLedger;
    var ot = ledger.offenseTotals;

    if (category === 'PROJECTILE') {
      act.projectileShots += 1;
      ot.projectileShots += 1;
    } else if (category === 'BEAM') {
      act.beamShots += 1;
      ot.beamShots += 1;
    } else if (category === 'MELEE') {
      act.meleeSwings += 1;
      ot.meleeSwings += 1;
    } else if (category === 'PARRY') {
      act.parrySuccess += 1;
      ot.parrySuccess += 1;
    } else if (category === 'PERFECT_DODGE') {
      act.perfectDodges += 1;
      ledger.totalPerfectDodges += 1;
    } else if (category === 'DASH') {
      act.dashes += 1;
      ledger.totalDashesUsed += 1;
      if (detail && typeof detail.dirX === 'number' && typeof detail.dirY === 'number') {
        var dx = detail.dirX;
        var dy = detail.dirY;
        if (Math.abs(dx) >= Math.abs(dy)) {
          if (dx >= 0) mem.dodgeDirs.RIGHT += 1;
          else mem.dodgeDirs.LEFT += 1;
        } else {
          if (dy >= 0) mem.dodgeDirs.DOWN += 1;
          else mem.dodgeDirs.UP += 1;
        }
      }
    }

    if (detail && detail.weaponKey) {
      mem.weaponModes[detail.weaponKey] = (mem.weaponModes[detail.weaponKey] || 0) + 1;
      var baseWeaponId = String(detail.weaponKey).split(':')[0] || 'UNKNOWN';
      ledger.weaponUsageById[baseWeaponId] = (ledger.weaponUsageById[baseWeaponId] || 0) + 1;
    }
  };

  /**
   * Analiza la tabla actual de acciones y determina qué patrón repetido está usando el jugador.
   */
  BrotherEyeEngine.prototype.analyzeShortTermPatterns = function () {
    var mem = this.shortTermMemory;
    var act = mem.actions;
    var cfg = EYE_CONFIG.SHORT_TERM_MEMORY;
    var patterns = [];
    var counterPlans = [];
    var penalty = 0;

    var totalOffense = act.projectileShots + act.beamShots + act.meleeSwings;
    if (totalOffense >= cfg.MIN_ACTIONS_FOR_PATTERN) {
      var projRatio = act.projectileShots / totalOffense;
      var beamRatio = act.beamShots / totalOffense;
      var meleeRatio = act.meleeSwings / totalOffense;

      if (projRatio >= cfg.DOMINANT_RATIO) {
        patterns.push('SPAM_PROYECTILES');
        counterPlans.push('Enemigos rápidos/Dashers para cerrar distancia');
        penalty += Math.round(cfg.PATTERN_PENALTY_SCORE * 0.75);
      } else if (beamRatio >= cfg.DOMINANT_RATIO) {
        patterns.push('SPAM_RAYO');
        counterPlans.push('Emboscadores móviles contra disparo fijo de rayo');
        penalty += Math.round(cfg.PATTERN_PENALTY_SCORE * 0.85);
      } else if (meleeRatio >= cfg.DOMINANT_RATIO) {
        if (act.parrySuccess >= 3) {
          patterns.push('ABUSO_PARRY');
          counterPlans.push('Splitters y tiradores múltiples para romper spam de Parry');
          penalty += cfg.PATTERN_PENALTY_SCORE;
        } else {
          patterns.push('SPAM_MELEE');
          counterPlans.push('Tiradores a distancia y voladores evasivos');
          penalty += Math.round(cfg.PATTERN_PENALTY_SCORE * 0.7);
        }
      }
    }

    if (act.dashes >= cfg.MIN_DASHES_FOR_PATTERN) {
      var dDirs = mem.dodgeDirs;
      var bestDir = 'RIGHT';
      var bestCount = 0;
      var keys = ['LEFT', 'RIGHT', 'UP', 'DOWN'];
      for (var i = 0; i < keys.length; i++) {
        if (dDirs[keys[i]] > bestCount) {
          bestCount = dDirs[keys[i]];
          bestDir = keys[i];
        }
      }
      var dashRatio = bestCount / act.dashes;
      if (dashRatio >= cfg.DOMINANT_RATIO) {
        patterns.push('ESQUIVA_PREDECIBLE_' + bestDir);
        counterPlans.push('Flanqueador posicionado en flanco ' + bestDir);
        penalty += 10;
      }
    }

    if (mem.combatTimeTotal >= 3.0) {
      var campRatio = mem.campingTime / mem.combatTimeTotal;
      if (campRatio >= cfg.CAMPING_RATIO) {
        patterns.push('CAMPING_ESTATICO');
        counterPlans.push('Acoso aéreo y disparos forzados por inmovilidad');
        penalty += 12;
      }
    }

    mem.detectedPatterns = patterns;
    mem.penaltyScore = penalty;
    mem.dominantPatternLabel = patterns.length > 0 ? patterns.join(' + ') : 'ESTILO VARIADO';
    mem.countermeasurePlan = counterPlans.length > 0
      ? counterPlans.join(' | ')
      : 'Ninguna (estrategia limpia)';

    return mem;
  };

  // ==========================================================================
  // ESTADO 1: ROOM_ENTER (Aplicación de Sentencia + Contramedidas)
  // ==========================================================================
  BrotherEyeEngine.prototype.ROOM_ENTER = function (room, player) {
    if (!this.enabled || !room) return;

    if (!this.state0_initial.initialized && player) {
      this.initialize(player, 'AUTO_FIRST_ROOM');
    }

    if (!room.cleared && room.enemies && room.enemies.length > 0 && !room.brotherEyeAdapted) {
      this.applyAdaptationToRoom(room, player);
    }

    var livingEnemies = room.enemies
      ? room.enemies.filter(function (e) { return !e.markedForDeletion; }).length
      : 0;

    var hp = (player && typeof player.hp === 'number') ? player.hp : 100;
    var shield = (player && typeof player.shield === 'number') ? player.shield : 0;

    this.state1_enter = {
      activeInRoom: livingEnemies > 0 && !room.cleared,
      roomType: room.type || 'NORMAL',
      sectionNumber: room.sectionNumber || 1,
      levelNumber: room.levelNumber || 1,
      globalTimeAtEntry: this.globalClock.elapsedSeconds,
      roomClockSeconds: 0.0,
      entryHp: Number(hp.toFixed(1)),
      entryShield: Number(shield.toFixed(1)),
      entryVitality: Number((hp + shield).toFixed(1)),
      entryRelics: getPlayerRelicCount(player),
      entryDamageMult: (player && player.damageMultiplier) ? player.damageMultiplier : 1.0,
      entryProjectiles: getPlayerProjectileCount(player),
      entrySpeed: (player && player.speed) ? player.speed : 250,
      entryDpsPower: computePlayerDpsPower(player),
      totalEnemiesInitial: livingEnemies,
      lastPlayerX: player ? player.x : null,
      lastPlayerY: player ? player.y : null,
      roomCombatTime: 0.0,
      roomCampingTime: 0.0
    };

    this.state2_midpoint.triggered = false;
    this.state3_complete.completed = false;
  };

  BrotherEyeEngine.prototype.onRoomEntered = function (room, player) {
    this.ROOM_ENTER(room, player);
  };

  /**
   * Ejecuta físicamente la sentencia judicial sobre la sala entrante:
   *  - Cantidad de enemigos
   *  - Vida de enemigos comunes/élites (`enemyHpMultiplier`)
   *  - Promoción a Élite (`elitePromotionChance`)
   *  - Daño, Velocidad y retardo de reacción
   *  - Contramedidas de la Tabla a Corto Plazo
   */
  BrotherEyeEngine.prototype.applyAdaptationToRoom = function (room, player) {
    if (!room || !room.enemies || room.brotherEyeAdapted) return;
    room.brotherEyeAdapted = true;

    var mod = this.state4_adaptive.nextRoomModifiers;
    var regime = this.state4_adaptive.regime;
    var isBossRoom = room.type === 'BOSS' || room.enemies.some(function (e) { return e.isBoss; });

    var patterns = (this.shortTermMemory.detectedPatterns || []).slice();
    var dirOut = this.lastDirectiveOutcome || {};
    if (dirOut.directiveCounterPattern && patterns.indexOf(dirOut.directiveCounterPattern) === -1) {
      patterns.push(dirOut.directiveCounterPattern);
    }

    var useNemesisAmbush = (
      !isBossRoom &&
      dirOut.nemesisSpawnArchetype &&
      (regime === 'MALDICION_TRIBUNAL' || regime === 'SENTENCIA_MAXIMA')
    );

    // A. Ajustar CANTIDAD en salas de combate (no clonar Jefes)
    if (!isBossRoom && (Math.abs(mod.enemyCountMultiplier - 1.0) > 0.03 || regime !== 'JUICIO_EQUILIBRADO')) {
      var baseCount = room.enemies.length;
      var targetCount = Math.max(1, Math.round(baseCount * mod.enemyCountMultiplier));

      if (regime === 'ACOMPAÑAR_BUILD' || regime === 'ACUSACION_FISCAL') {
        targetCount = Math.max(baseCount + 1, Math.ceil(baseCount * mod.enemyCountMultiplier));
      } else if (regime === 'PIES_EN_LA_TIERRA' || regime === 'SENTENCIA_MAXIMA' || regime === 'MALDICION_TRIBUNAL') {
        targetCount = Math.max(baseCount + 2, Math.ceil(baseCount * mod.enemyCountMultiplier));
      } else if ((regime === 'ALIVIO' || regime === 'CLEMENCIA_DEFENSOR' || regime === 'BENDICION_DIVINA') && baseCount > 1) {
        targetCount = Math.min(baseCount - 1, Math.floor(baseCount * mod.enemyCountMultiplier));
      }

      var diff = targetCount - baseCount;
      if (diff > 0 && typeof room.getSafeSpawnPosition === 'function' && room.bounds) {
        var b = room.bounds;
        var margin = Math.min(90, Math.min(b.width, b.height) * 0.22);
        var px = player ? player.x : b.centerX;
        var py = player ? player.y : b.centerY;

        for (var i = 0; i < diff; i++) {
          var pos = room.getSafeSpawnPosition(b.left + margin, b.right - margin, b.top + margin, b.bottom - margin, 35, 210);

          // Si detectamos esquiva predecible en una dirección fija, el 1er refuerzo flanquea ese costado
          if (i === 0 && player && patterns.length > 0) {
            var flankPos = this.getCounterFlankPosition(patterns, player, b, margin, room);
            if (flankPos) pos = flankPos;
          }

          if (Math.hypot(pos.x - px, pos.y - py) < 175) {
            pos.x = b.centerX + (Math.random() - 0.5) * 140;
            pos.y = b.centerY + (Math.random() - 0.5) * 140;
          }

          var newEnemy = null;
          // Directiva NEMESIS_PERSONAL: los primeros 2 refuerzos son del arquetipo que más daño causó al jugador
          if (useNemesisAmbush && i < 2) {
            newEnemy = this.createEnemyByArchetype(
              dirOut.nemesisSpawnArchetype,
              pos.x,
              pos.y,
              room.sectionNumber || 1,
              room.levelNumber || 1
            );
          }
          if (!newEnemy) {
            newEnemy = this.createCounterEnemyForRoom(
              pos.x,
              pos.y,
              room.sectionNumber || 1,
              room.levelNumber || 1,
              patterns
            );
          }
          if (newEnemy) {
            newEnemy.reactionDelay = (mod.reactionDelayOverride !== null) ? mod.reactionDelayOverride : 0.30;
            room.enemies.push(newEnemy);
          }
        }
      } else if (diff < 0 && room.enemies.length > 1) {
        var toRemove = Math.min(room.enemies.length - 1, Math.abs(diff));
        for (var r = room.enemies.length - 1; r >= 0 && toRemove > 0; r--) {
          if (!room.enemies[r].isBoss && !room.enemies[r].isElite) {
            room.enemies.splice(r, 1);
            toRemove--;
          }
        }
      }
    }

    // B. Promoción de Élites si el Fiscal dictó presión o salió Maldición
    if (!isBossRoom && (mod.elitePromotionChance || 0) > 0 && typeof EliteEnemy !== 'undefined') {
      var currentElites = room.enemies.filter(function (e) { return e.isElite; }).length;
      var maxExtraElites = (room.type === 'HARD' || regime === 'MALDICION_TRIBUNAL' || regime === 'SENTENCIA_MAXIMA') ? 3 : 2;
      for (var p = 0; p < room.enemies.length && currentElites < maxExtraElites; p++) {
        var candidate = room.enemies[p];
        if (!candidate.isBoss && !candidate.isElite && Math.random() < mod.elitePromotionChance) {
          var promoted = new EliteEnemy(
            candidate.x,
            candidate.y,
            room.sectionNumber || 1,
            room.levelNumber || 1
          );
          promoted.reactionDelay = candidate.reactionDelay || 0.28;
          room.enemies[p] = promoted;
          currentElites++;
        }
      }
    }

    // C. Escalar Jefe orgánicamente en Salas de Boss
    if (isBossRoom && player) {
      this.tuneBossForPlayerBuild(room, player);
    }

    // D. Aplicar HP, Daño y Velocidad a TODOS los enemigos de la sala
    for (var j = 0; j < room.enemies.length; j++) {
      this.tuneSpawnedEnemy(room.enemies[j]);
    }

    // E. Notificación sutil en HUD en veredictos extremos o emboscada Némesis
    if (player && player.ui && typeof player.ui.showToast === 'function') {
      if (useNemesisAmbush && regime === 'MALDICION_TRIBUNAL') {
        player.ui.showToast('💀 [NÉMESIS DEL TRIBUNAL] ¡Maldición con emboscada de ' + dirOut.nemesisSpawnArchetype + '!');
      } else if (regime === 'MALDICION_TRIBUNAL') {
        player.ui.showToast('💀 [DADOS DEL CAOS] ¡MALDICIÓN DEL TRIBUNAL! Horda masiva sin piedad');
      } else if (regime === 'BENDICION_DIVINA') {
        player.ui.showToast('✨ [DADOS DEL CAOS] ¡BENDICIÓN DIVINA! El Tribunal concede tregua y curación');
      } else if (regime === 'SENTENCIA_MAXIMA' || regime === 'PIES_EN_LA_TIERRA') {
        player.ui.showToast('👁️ [BROTHER EYE] Sentencia Máxima dictada: ¡Enemigos reforzados!');
      } else if (regime === 'CLEMENCIA_DEFENSOR') {
        player.ui.showToast('🛡️ [JUSTICE EYE] Recurso de amparo aprobado: Presión reducida');
      }
    }
  };

  BrotherEyeEngine.prototype.createEnemyByArchetype = function (archetype, x, y, section, level) {
    if (archetype === 'ShooterEnemy' && typeof ShooterEnemy !== 'undefined') return new ShooterEnemy(x, y, section, level);
    if (archetype === 'ChargerEnemy' && typeof ChargerEnemy !== 'undefined') return new ChargerEnemy(x, y, section, level);
    if (archetype === 'FlyerEnemy' && typeof FlyerEnemy !== 'undefined') return new FlyerEnemy(x, y, section, level);
    if (archetype === 'SplitterEnemy' && typeof SplitterEnemy !== 'undefined') return new SplitterEnemy(x, y, section, level, false);
    if (archetype === 'EliteEnemy' && typeof EliteEnemy !== 'undefined') return new EliteEnemy(x, y, section, level);
    if (typeof Enemy !== 'undefined') return new Enemy(x, y, section, level, 'DASHER');
    return null;
  };

  BrotherEyeEngine.prototype.getCounterFlankPosition = function (patterns, player, bounds, margin, room) {
    var dir = null;
    for (var i = 0; i < patterns.length; i++) {
      if (patterns[i].indexOf('ESQUIVA_PREDECIBLE_') === 0) {
        dir = patterns[i].replace('ESQUIVA_PREDECIBLE_', '');
        break;
      }
    }
    if (!dir) return null;

    var ox = 0;
    var oy = 0;
    if (dir === 'LEFT') ox = -240;
    else if (dir === 'RIGHT') ox = 240;
    else if (dir === 'UP') oy = -220;
    else if (dir === 'DOWN') oy = 220;

    var tx = clamp(player.x + ox, bounds.left + margin, bounds.right - margin);
    var ty = clamp(player.y + oy, bounds.top + margin, bounds.bottom - margin);
    if (typeof room.getWalkablePosition === 'function') {
      return room.getWalkablePosition(tx, ty, 20);
    }
    return { x: tx, y: ty };
  };

  /**
   * Instancia refuerzos eligiendo arquetipos según las contramedidas detectadas
   * por la Tabla a Corto Plazo (o mix equilibrado si no hay abuso).
   */
  BrotherEyeEngine.prototype.createCounterEnemyForRoom = function (x, y, section, level, patterns) {
    patterns = patterns || [];
    var hasAntiRanged = patterns.indexOf('SPAM_PROYECTILES') !== -1 || patterns.indexOf('SPAM_RAYO') !== -1;
    var hasAntiMelee = patterns.indexOf('ABUSO_PARRY') !== -1 || patterns.indexOf('SPAM_MELEE') !== -1;
    var hasAntiCamp = patterns.indexOf('CAMPING_ESTATICO') !== -1;

    var roll = Math.random();
    if (hasAntiRanged) {
      if (roll < 0.45 && typeof ChargerEnemy !== 'undefined') return new ChargerEnemy(x, y, section, level);
      if (roll < 0.80 && typeof Enemy !== 'undefined') return new Enemy(x, y, section, level, 'DASHER');
    } else if (hasAntiMelee) {
      if (roll < 0.48 && typeof ShooterEnemy !== 'undefined') return new ShooterEnemy(x, y, section, level);
      if (roll < 0.80 && typeof SplitterEnemy !== 'undefined') return new SplitterEnemy(x, y, section, level, false);
    } else if (hasAntiCamp) {
      if (roll < 0.45 && typeof ShooterEnemy !== 'undefined') return new ShooterEnemy(x, y, section, level);
      if (roll < 0.85 && typeof FlyerEnemy !== 'undefined') return new FlyerEnemy(x, y, section, level);
    }

    return this.createExtraEnemyForRoom(x, y, section, level);
  };

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
   * Calibra la vitalidad de un Jefe según el poder ofensivo acumulado del jugador
   * y la sentencia judicial (retrocompatible con los regímenes clásicos).
   */
  BrotherEyeEngine.prototype.tuneBossForPlayerBuild = function (room, player) {
    if (!this.enabled || !room || !room.enemies || !player) return;

    var regime = this.state4_adaptive.regime;
    var dpsPowerIndex = computePlayerDpsPower(player);
    var hpFromCourt = (this.state4_adaptive.nextRoomModifiers && this.state4_adaptive.nextRoomModifiers.enemyHpMultiplier) || 1.0;
    var bossHpMult = 1.0;

    if (regime === 'SENTENCIA_MAXIMA' || regime === 'PIES_EN_LA_TIERRA' || regime === 'MALDICION_TRIBUNAL') {
      bossHpMult = clamp(1.35 + Math.max(0, dpsPowerIndex - 1.3) * 0.22, 1.35, 2.40);
    } else if (regime === 'ACUSACION_FISCAL' || regime === 'ACOMPAÑAR_BUILD') {
      bossHpMult = clamp(1.18 + Math.max(0, dpsPowerIndex - 1.3) * 0.16, 1.18, 1.95);
    } else if (regime !== 'CLEMENCIA_DEFENSOR' && regime !== 'BENDICION_DIVINA' && regime !== 'ALIVIO') {
      if (dpsPowerIndex >= 1.7) {
        bossHpMult = clamp(1.0 + (dpsPowerIndex - 1.7) * 0.20, 1.08, 1.70);
      }
    }

    bossHpMult = Math.max(bossHpMult, Math.min(2.3, hpFromCourt * 0.85));

    // Directiva VERDUGO_DE_JEFES: aunque venga de Bendición o Juicio Equilibrado, el Jefe tiene tenacidad mínima
    var dirOut = this.lastDirectiveOutcome || {};
    if (dirOut.bossTenacityFloor && dirOut.bossTenacityFloor > bossHpMult) {
      bossHpMult = dirOut.bossTenacityFloor;
    }

    if (bossHpMult <= 1.01) return;

    for (var i = 0; i < room.enemies.length; i++) {
      var boss = room.enemies[i];
      if (!boss || !boss.isBoss || boss.markedForDeletion) continue;
      if (typeof boss._baseBossMaxHp !== 'number') {
        boss._baseBossMaxHp = boss.maxHp;
      }
      var prevMax = boss.maxHp || boss._baseBossMaxHp;
      var hpRatio = prevMax > 0 ? clamp(boss.hp / prevMax, 0, 1) : 1;
      boss.maxHp = Math.round(boss._baseBossMaxHp * bossHpMult);
      boss.hp = Math.max(1, Math.round(boss.maxHp * hpRatio));
      boss.eyeBossPowerMult = Number(bossHpMult.toFixed(2));
    }

    // Si VERDUGO_DE_JEFES + NEMESIS_PERSONAL están activas y el Jefe entró solo, suma 1 escolta Némesis
    if (dirOut.bossTenacityFloor >= 1.35 && dirOut.nemesisSpawnArchetype && room.enemies.length === 1 && room.bounds) {
      var rb = room.bounds;
      var escort = this.createEnemyByArchetype(
        dirOut.nemesisSpawnArchetype,
        rb.centerX + (Math.random() < 0.5 ? -180 : 180),
        rb.centerY - 120,
        room.sectionNumber || 1,
        room.levelNumber || 1
      );
      if (escort) {
        escort.reactionDelay = 0.55;
        room.enemies.push(escort);
      }
    }
  };

  /**
   * Ajusta HP (en enemigos no-Boss), Daño y Velocidad de un enemigo individual.
   */
  BrotherEyeEngine.prototype.tuneSpawnedEnemy = function (enemy) {
    if (!this.enabled || !enemy) return;

    var mod = this.state4_adaptive.nextRoomModifiers;

    if (typeof enemy._baseMaxHp !== 'number' && typeof enemy.maxHp === 'number') {
      enemy._baseMaxHp = enemy.maxHp;
    }
    if (typeof enemy._baseContactDamage !== 'number' && typeof enemy.contactDamage === 'number') {
      enemy._baseContactDamage = enemy.contactDamage;
    }
    if (typeof enemy._baseSpeed !== 'number' && typeof enemy.speed === 'number') {
      enemy._baseSpeed = enemy.speed;
    }

    // 1. Escalar Vida en enemigos comunes / élites (Los jefes usan tuneBossForPlayerBuild)
    var hpMult = mod.enemyHpMultiplier || 1.0;
    if (!enemy.isBoss && typeof enemy._baseMaxHp === 'number' && Math.abs(hpMult - 1.0) > 0.02) {
      var prevMax = enemy.maxHp || enemy._baseMaxHp;
      var ratio = prevMax > 0 ? clamp(enemy.hp / prevMax, 0, 1) : 1;
      enemy.maxHp = Math.max(8, Math.round(enemy._baseMaxHp * hpMult));
      enemy.hp = Math.max(1, Math.round(enemy.maxHp * ratio));
    }

    // 2. Escalar Daño (con tope justo en Boss para evitar one-shots absurdos)
    var effectiveDmgMult = enemy.isBoss ? Math.min(1.38, mod.enemyDamageMultiplier) : mod.enemyDamageMultiplier;
    if (typeof enemy._baseContactDamage === 'number') {
      enemy.contactDamage = Math.max(1, Math.round(enemy._baseContactDamage * effectiveDmgMult));
    }
    enemy.eyeDamageMultiplier = effectiveDmgMult;

    // 3. Escalar Velocidad respetando TOPES GLOBALES estrictos (nunca superar al jugador)
    if (typeof enemy._baseSpeed === 'number') {
      var caps = (typeof CONFIG !== 'undefined' && CONFIG.ENEMY_SPEED_CAPS)
        ? CONFIG.ENEMY_SPEED_CAPS
        : { COMMON: 215, FLYER: 225, ELITE: 235, BOSS_WALK_P2: 240 };
      var maxAllowedSpeed = caps.COMMON;
      if (enemy.isBoss) {
        maxAllowedSpeed = caps.BOSS_WALK_P2;
      } else if (enemy.isElite) {
        maxAllowedSpeed = caps.ELITE;
      } else if (enemy.isFlying) {
        maxAllowedSpeed = caps.FLYER;
      }
      enemy.speed = clamp(Math.round(enemy._baseSpeed * mod.enemySpeedMultiplier), 45, maxAllowedSpeed);
    }

    // 4. Retardo de reacción más agresivo si hay sentencia alta
    if (mod.reactionDelayOverride !== null && typeof enemy.reactionDelay === 'number') {
      enemy.reactionDelay = Math.min(enemy.reactionDelay, mod.reactionDelayOverride);
    }
  };

  // ==========================================================================
  // ESTADO 2: MIDPOINT (Evaluación al 50% de enemigos + Muestreo de Camping)
  // ==========================================================================
  BrotherEyeEngine.prototype.onRoomTick = function (dt, room, player) {
    if (!this.enabled || typeof dt !== 'number' || dt <= 0) return;

    if (this.globalClock.active) {
      this.globalClock.elapsedSeconds += dt;
    }

    if (!this.state1_enter.activeInRoom || !room) return;

    if (room.cleared) {
      if (!this.state3_complete.completed) {
        this.ROOM_COMPLETE(room, player, true);
      }
      return;
    }

    this.state1_enter.roomClockSeconds += dt;

    // Muestrear si el jugador está prácticamente inmóvil (camping) durante el combate
    if (player) {
      if (this.state1_enter.lastPlayerX !== null) {
        var movedDist = Math.hypot(player.x - this.state1_enter.lastPlayerX, player.y - this.state1_enter.lastPlayerY);
        var moveSpeedNow = movedDist / Math.max(0.001, dt);
        this.state1_enter.roomCombatTime += dt;
        this.shortTermMemory.combatTimeTotal += dt;
        if (moveSpeedNow < 42) {
          this.state1_enter.roomCampingTime += dt;
          this.shortTermMemory.campingTime += dt;
        }
      }
      this.state1_enter.lastPlayerX = player.x;
      this.state1_enter.lastPlayerY = player.y;
    }

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

  BrotherEyeEngine.prototype.MIDPOINT = function (room, player, livingCountOverride) {
    if (!this.enabled || this.state2_midpoint.triggered) return;

    var s1 = this.state1_enter;
    var living = (typeof livingCountOverride === 'number')
      ? livingCountOverride
      : (room && room.enemies ? room.enemies.filter(function (e) { return !e.markedForDeletion; }).length : 0);

    var currentHp = (player && typeof player.hp === 'number') ? player.hp : s1.entryHp;
    var currentShield = (player && typeof player.shield === 'number') ? player.shield : 0;
    var currentVitality = Number((currentHp + currentShield).toFixed(1));
    var currentRelics = getPlayerRelicCount(player);

    var elapsedFirstHalf = Math.max(0.15, s1.roomClockSeconds);
    var hpLostFirstHalf = Number(Math.max(0, s1.entryVitality - currentVitality).toFixed(1));
    var killedFirstHalf = Math.max(1, s1.totalEnemiesInitial - living);

    this.state2_midpoint = {
      triggered: true,
      timeElapsedFirstHalf: elapsedFirstHalf,
      hpAtMidpoint: currentHp,
      shieldAtMidpoint: currentShield,
      vitalityAtMidpoint: currentVitality,
      hpLostFirstHalf: hpLostFirstHalf,
      percentLostFirstHalf: s1.entryVitality > 0 ? (hpLostFirstHalf / s1.entryVitality) : 0,
      relicsAtMidpoint: currentRelics,
      newRelicsAcquiredMid: Math.max(0, currentRelics - s1.entryRelics),
      enemiesKilledFirstHalf: killedFirstHalf,
      enemiesRemainingMid: living,
      kpsFirstHalf: killedFirstHalf / elapsedFirstHalf,
      dtpsFirstHalf: hpLostFirstHalf / elapsedFirstHalf
    };
  };

  // ==========================================================================
  // ESTADO 3: ROOM_COMPLETE (Acta Forense Final)
  // ==========================================================================
  BrotherEyeEngine.prototype.ROOM_COMPLETE = function (room, player, clearedStatus) {
    if (!this.enabled || !this.state1_enter.activeInRoom || this.state3_complete.completed) return;

    var isCleared = (clearedStatus !== undefined) ? Boolean(clearedStatus) : Boolean(room && room.cleared);
    if (!isCleared) {
      this.state1_enter.activeInRoom = false;
      return;
    }

    if (!this.state2_midpoint.triggered) {
      this.MIDPOINT(room, player, 0);
    }

    var s1 = this.state1_enter;
    var s2 = this.state2_midpoint;

    var finalHp = (player && typeof player.hp === 'number') ? player.hp : s1.entryHp;
    var finalShield = (player && typeof player.shield === 'number') ? player.shield : 0;
    var finalVitality = Number((finalHp + finalShield).toFixed(1));
    var finalRelics = getPlayerRelicCount(player);

    var totalTime = Math.max(0.25, s1.roomClockSeconds);
    var secondHalfTime = Math.max(0.15, totalTime - s2.timeElapsedFirstHalf);

    var totalDamageTaken = Number(Math.max(0, s1.entryVitality - finalVitality).toFixed(1));
    var percentVitalityLost = s1.entryVitality > 0 ? clamp(totalDamageTaken / s1.entryVitality, 0, 1) : 0;
    var hpLostSecondHalf = Math.max(0, s2.vitalityAtMidpoint - finalVitality);
    var killedSecondHalf = Math.max(0, s1.totalEnemiesInitial - s2.enemiesKilledFirstHalf);

    var kpsSecondHalf = killedSecondHalf > 0 ? (killedSecondHalf / secondHalfTime) : s2.kpsFirstHalf;
    var kpsTotal = s1.totalEnemiesInitial / totalTime;

    var dtpsSecondHalf = hpLostSecondHalf / secondHalfTime;
    var dtpsTotal = totalDamageTaken / totalTime;
    var slowdownRatio = kpsSecondHalf / Math.max(0.05, s2.kpsFirstHalf);
    var campRatioInRoom = s1.roomCombatTime > 0 ? (s1.roomCampingTime / s1.roomCombatTime) : 0;

    this.globalClock.roomsClearedCount += 1;
    if (s1.roomType === 'BOSS') {
      this.globalClock.bossesKilledCount += 1;
      this.globalLedger.bossKillTimes.push(Number(totalTime.toFixed(2)));
      this.globalLedger.avgBossKillTime = computeAverage(this.globalLedger.bossKillTimes);
    } else if (s1.totalEnemiesInitial > 0 && s1.roomType !== 'EMPTY' && s1.roomType !== 'TREASURE' && s1.roomType !== 'SHOP') {
      this.globalLedger.roomClearTimes.push(Number(totalTime.toFixed(2)));
      this.globalLedger.avgRoomClearTime = computeAverage(this.globalLedger.roomClearTimes);
    }

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
      percentVitalityLost: Number(percentVitalityLost.toFixed(3)),
      hpLostSecondHalf: hpLostSecondHalf,
      enemiesKilledSecondHalf: killedSecondHalf,
      kpsSecondHalf: kpsSecondHalf,
      kpsTotal: kpsTotal,
      dtpsSecondHalf: dtpsSecondHalf,
      dtpsTotal: dtpsTotal,
      combatSlowdownRatio: slowdownRatio,
      campRatioInRoom: Number(campRatioInRoom.toFixed(2)),
      potentialDpsSnapshot: Number(computePlayerDpsPower(player).toFixed(2))
    };

    this.state1_enter.activeInRoom = false;
    this.DIFFICULTY_UPDATE(room, player);
  };

  BrotherEyeEngine.prototype.onRoomExited = function (room, player, clearedStatus) {
    this.ROOM_COMPLETE(room, player, clearedStatus);
  };

  /**
   * Evalúa la Tabla Declarativa de Directivas Globales (3ra Capa) una sola vez
   * al cerrar cada sala en Estado 4. Cero costo por frame.
   */
  BrotherEyeEngine.prototype.evaluateGlobalDirectives = function (s3) {
    var ctx = {
      ledger: this.globalLedger,
      roomsCleared: this.globalClock.roomsClearedCount,
      currentRelics: s3 ? s3.finalRelics : 0,
      prosecutorBonus: 0,
      prosecutorReasons: [],
      defenderBonus: 0,
      defenderReasons: [],
      eliteBonus: 0,
      curseThresholdShift: 0,
      minHeatFloor: 0,
      countMultFloor: 1.0,
      bossTenacityFloor: 1.0,
      damageFactor: 1.0,
      heartDropBonus: 0.0,
      nemesisSpawnArchetype: null,
      directiveCounterPattern: null,
      activeDirectives: []
    };

    for (var i = 0; i < GLOBAL_DIRECTIVES_TABLE.length; i++) {
      var rule = GLOBAL_DIRECTIVES_TABLE[i];
      if (rule.match(ctx)) {
        rule.apply(ctx);
        ctx.activeDirectives.push({
          id: rule.id,
          label: rule.label,
          tone: rule.tone
        });
      }
    }

    return ctx;
  };

  // ==========================================================================
  // ESTADO 4A: ALGORITMO DEL FISCAL SÁDICO (BROTHER EYE)
  // ==========================================================================
  BrotherEyeEngine.prototype.evaluateProsecutor_BrotherEye = function (s0, s1, s2, s3, mem, player) {
    var score = 0.0;
    var reasons = [];
    var roomsCleared = this.globalClock.roomsClearedCount;

    // 1. Velocidad de evaporación de sala (sin tope artificial en 100!)
    var isBoss = s1.roomType === 'BOSS';
    var expectedTime = isBoss
      ? EYE_CONFIG.BENCHMARKS.EXPECTED_BOSS_SECONDS
      : (EYE_CONFIG.BENCHMARKS.EXPECTED_ROOM_SECONDS + Math.max(0, s1.totalEnemiesInitial - 6) * 0.65);
    var speedRatio = expectedTime / Math.max(0.45, s3.totalTimeEmployed);

    if (speedRatio >= 1.15) {
      var speedPts = clamp(Math.pow(speedRatio, 0.80) * 26.0, 12, 92);
      score += speedPts;
      reasons.push('Evaporó ' + s1.roomType + ' en ' + s3.totalTimeEmployed.toFixed(2) + 's (+' + Math.round(speedPts) + ')');
      if (isBoss && s3.totalTimeEmployed < 12.0) {
        score += 24;
        var bossHeatCap = getMaxHeatForDepth(roomsCleared);
        this.globalClock.baseHeatLevel = clamp(this.globalClock.baseHeatLevel + 6, 0, bossHeatCap);
        reasons.push('Jefe derretido <12s (+24 & +6 Calor)');
      }
    }

    // 2. Intocabilidad Relativa (% de Vitalidad perdida vs tanque total -> arregla paradoja DTPS)
    var lostPct = s3.percentVitalityLost;
    if (lostPct <= 0.005) {
      score += 46;
      reasons.push('Sala Perfecta 0% daño (+46)');
    } else if (lostPct <= 0.05) {
      score += 36;
      reasons.push('Intocable (solo ' + (lostPct * 100).toFixed(1) + '% vit perdida, +36)');
    } else if (lostPct <= 0.12) {
      score += 20;
      reasons.push('Rasguño leve (' + (lostPct * 100).toFixed(1) + '%, +20)');
    }

    // 3. Reliquias históricas acumuladas y profundidad post-12 / post-25 salas
    // (Inmune a Reliquia Prohibida o Altar del Cuerpo NG+ que vacían el inventario visible)
    var effectiveRelicsNow = Math.max(s3.finalRelics, this.globalLedger ? (this.globalLedger.totalRelicsEverGained || 0) : 0);
    var relicsGained = Math.max(0, effectiveRelicsNow - s0.totalRelics);
    var dpsPower = s3.potentialDpsSnapshot || computePlayerDpsPower(player);
    if (relicsGained >= 3 || dpsPower >= 2.2) {
      var wealthPts = clamp((relicsGained * 2.8) + Math.max(0, dpsPower - 1.5) * 8.5, 0, 44);
      if (wealthPts >= 6) {
        score += wealthPts;
        reasons.push(relicsGained + ' reliquias / DPS x' + dpsPower.toFixed(1) + ' (+' + Math.round(wealthPts) + ')');
      }
    }

    // Escalamiento progresivo más allá de 12, 20 y 25+ habitaciones (resolver crítica del testeo)
    if (roomsCleared >= 10) {
      var roomDepthPts = 0;
      if (roomsCleared >= 25) {
        roomDepthPts = 28 + Math.min(40, (roomsCleared - 25) * 2.2);
      } else if (roomsCleared >= 18) {
        roomDepthPts = 14 + (roomsCleared - 18) * 2.0;
      } else {
        roomDepthPts = (roomsCleared - 10) * 1.6;
      }
      score += roomDepthPts;
      reasons.push('Profundidad Sala #' + roomsCleared + ' (+' + Math.round(roomDepthPts) + ')');
    }

    // 4. Agravante de Memoria a Corto Plazo (Si repitió táctica trampa en la ventana actual)
    if (mem.penaltyScore > 0 && mem.detectedPatterns.length > 0) {
      score += mem.penaltyScore;
      reasons.push('Patrón repetido [' + mem.dominantPatternLabel + '] (+' + mem.penaltyScore + ')');
    }

    return {
      score: Number(score.toFixed(1)),
      reasons: reasons
    };
  };

  // ==========================================================================
  // ESTADO 4B: ALGORITMO DEL ABOGADO DEFENSOR (JUSTICE EYE)
  // ==========================================================================
  BrotherEyeEngine.prototype.evaluateDefender_JusticeEye = function (s0, s1, s2, s3, player) {
    var score = 0.0;
    var reasons = [];
    var maxHp = (player && player.maxHp) ? player.maxHp : s0.maxHp;
    var hpRatio = maxHp > 0 ? clamp(s3.finalHp / maxHp, 0, 1) : 1.0;
    var lostPct = s3.percentVitalityLost;
    var roomsCleared = this.globalClock.roomsClearedCount;

    // 1. Recurso de Amparo por Peligro de Muerte o Sangría Real
    if (hpRatio <= 0.25 || s3.finalVitality <= 35) {
      var critPts = 92 + (1.0 - hpRatio) * 25;
      score += critPts;
      reasons.push('¡Peligro Crítico ' + Math.round(hpRatio * 100) + '% HP! (+' + Math.round(critPts) + ')');
    } else if (hpRatio <= 0.45) {
      var warnPts = 42 + (0.45 - hpRatio) * 110;
      score += warnPts;
      reasons.push('HP comprometido ' + Math.round(hpRatio * 100) + '% (+' + Math.round(warnPts) + ')');
    }

    if (lostPct >= 0.22) {
      var bleedPts = clamp((lostPct - 0.10) * 215, 22, 115);
      score += bleedPts;
      reasons.push('Perdió ' + Math.round(lostPct * 100) + '% de vitalidad en sala (+' + Math.round(bleedPts) + ')');
    }

    // 2. Auditoría de Daño Potencial vs Piso (Protección contra Mal RNG)
    var dpsPower = s3.potentialDpsSnapshot || computePlayerDpsPower(player);
    var expectedDpsForDepth = 1.0 + (roomsCleared / 10.0) * 0.42;
    var powerGap = expectedDpsForDepth - dpsPower;
    if (powerGap > 0.25) {
      var rngPts = clamp(powerGap * 28.0, 10, 56);
      score += rngPts;
      reasons.push('Mal RNG: DPS x' + dpsPower.toFixed(2) + ' < esperado x' + expectedDpsForDepth.toFixed(2) + ' (+' + Math.round(rngPts) + ')');
    }

    // 3. Fatiga de Combate y Tiempo Alto de Sala
    if (s3.totalTimeEmployed >= 14.5 || s3.combatSlowdownRatio < 0.65) {
      var fatiguePts = clamp((Math.max(0, s3.totalTimeEmployed - 12.0) * 2.2) + (s3.combatSlowdownRatio < 0.65 ? 18 : 0), 8, 42);
      score += fatiguePts;
      reasons.push('Combate lento/agotador (' + s3.totalTimeEmployed.toFixed(1) + 's, +' + Math.round(fatiguePts) + ')');
    }

    // 4. Escudo ausente en pisos altos
    if (s3.finalShield <= 0 && roomsCleared >= 8 && hpRatio < 0.75) {
      score += 14;
      reasons.push('Sin escudo protector (+14)');
    }

    // 5. Historial de Muertes de la Sesión
    if (this.globalClock.deathsCount > 0) {
      var deathWeight = dpsPower > 3.5 ? 4 : 9;
      var deathPts = clamp(this.globalClock.deathsCount * deathWeight, 5, 28);
      score += deathPts;
      reasons.push('Historial ' + this.globalClock.deathsCount + ' muerte(s) (+' + Math.round(deathPts) + ')');
    }

    return {
      score: Number(score.toFixed(1)),
      reasons: reasons,
      hpRatio: hpRatio
    };
  };

  // ==========================================================================
  // ESTADO 4: EL DEBATE JUDICIAL + DIRECTIVAS GLOBALES + TIRADA DE DADOS
  // ==========================================================================
  BrotherEyeEngine.prototype.DIFFICULTY_UPDATE = function (room, player) {
    var s0 = this.state0_initial;
    var s1 = this.state1_enter;
    var s2 = this.state2_midpoint;
    var s3 = this.state3_complete;
    var w = EYE_CONFIG.WEIGHTS;

    // 0. Analizar tabla de telemetría a corto plazo + Tabla Declarativa de Directivas Globales
    this.shortTermMemory.roomsSinceReset += 1;
    var mem = this.analyzeShortTermPatterns();
    var directives = this.evaluateGlobalDirectives(s3);
    this.activeGlobalDirectives = directives.activeDirectives;
    this.lastDirectiveOutcome = {
      bossTenacityFloor: directives.bossTenacityFloor,
      nemesisSpawnArchetype: directives.nemesisSpawnArchetype,
      directiveCounterPattern: directives.directiveCounterPattern
    };

    // 1. Indicadores clásicos S, P, V, E, G
    var maxHp = (player && player.maxHp) ? player.maxHp : s0.maxHp;
    var hpRatio = maxHp > 0 ? clamp(s3.finalHp / maxHp, 0, 1) : 1.0;
    var retentionRatio = s1.entryVitality > 0 ? clamp(s3.finalVitality / s1.entryVitality, 0, 1.2) : 1.0;
    var S_score = clamp((retentionRatio * 60.0 + hpRatio * 40.0), 0, 100);

    var dpsPower = s3.potentialDpsSnapshot || computePlayerDpsPower(player);
    var P_score = clamp(32.0 + dpsPower * 24.0, 0, 100);

    var expectedKps = s1.roomType === 'BOSS' ? 0.05 : EYE_CONFIG.BENCHMARKS.EXPECTED_KPS;
    var kpsRatio = s3.kpsTotal / Math.max(0.01, expectedKps);
    var V_score = clamp(kpsRatio * 62.0 - (s3.combatSlowdownRatio < 0.65 ? (0.65 - s3.combatSlowdownRatio) * 20.0 : 0), 10, 100);

    var E_score = clamp(100.0 * Math.exp(-3.4 * s3.percentVitalityLost), 0, 100);

    var effectiveRelicsTotal = Math.max(s3.finalRelics, this.globalLedger ? (this.globalLedger.totalRelicsEverGained || 0) : 0);
    var relicsGained = Math.max(0, effectiveRelicsTotal - s0.totalRelics);
    var speedGrowth = ((player && player.speed) ? player.speed : s0.speed) / Math.max(50, s0.speed);
    var runMinutes = Math.max(0.5, this.globalClock.elapsedSeconds / 60.0);
    var relicPace = (relicsGained + 1) / (runMinutes * EYE_CONFIG.BENCHMARKS.EXPECTED_RELICS_PER_MIN + 1);
    var G_score = clamp((relicPace * 52.0) + (speedGrowth * 16.0) + (s3.newRelicsTotalInRoom * 10.0), 0, 100);

    var R = (w.S_SURVIVAL * S_score) +
            (w.P_POWER * P_score) +
            (w.V_SPEED * V_score) +
            (w.E_EFFICIENCY * E_score) +
            (w.G_PROGRESSION * G_score);
    var expectedR = EYE_CONFIG.EXPECTED_PERFORMANCE_R;
    var delta = R - expectedR;

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

    // 2. EL DEBATE: Fiscal vs Defensor (+ Directivas del Expediente Global)
    var prosecution = this.evaluateProsecutor_BrotherEye(s0, s1, s2, s3, mem, player);
    var defense = this.evaluateDefender_JusticeEye(s0, s1, s2, s3, player);

    if (directives.prosecutorBonus > 0) {
      prosecution.score = Number((prosecution.score + directives.prosecutorBonus).toFixed(1));
      prosecution.reasons = prosecution.reasons.concat(directives.prosecutorReasons);
    } else if (directives.prosecutorReasons.length > 0) {
      prosecution.reasons = prosecution.reasons.concat(directives.prosecutorReasons);
    }

    if (directives.defenderBonus > 0) {
      defense.score = Number((defense.score + directives.defenderBonus).toFixed(1));
      defense.reasons = defense.reasons.concat(directives.defenderReasons);
    }

    var debateMargin = prosecution.score - defense.score;

    // Actualizar Calor Judicial Acumulado con techo gradual según profundidad de salas
    var heatCapForDepth = getMaxHeatForDepth(this.globalClock.roomsClearedCount);
    if (debateMargin >= 18.0 && s3.percentVitalityLost < 0.30) {
      var heatGain = 3.5 + Math.min(6.5, (debateMargin - 18.0) * 0.06);
      if (this.globalClock.roomsClearedCount >= 20) heatGain *= 1.35;
      this.globalClock.baseHeatLevel = clamp(this.globalClock.baseHeatLevel + heatGain, 0, heatCapForDepth);
    } else if (debateMargin <= -15.0 || s3.percentVitalityLost >= 0.35) {
      var heatCool = 6.5 + Math.min(14.0, Math.abs(debateMargin) * 0.14 + (s3.percentVitalityLost >= 0.35 ? 5.0 : 0));
      this.globalClock.baseHeatLevel = clamp(this.globalClock.baseHeatLevel - heatCool, 0, heatCapForDepth);
    }

    if (directives.minHeatFloor > 0 && this.globalClock.baseHeatLevel < directives.minHeatFloor) {
      this.globalClock.baseHeatLevel = Math.min(heatCapForDepth, directives.minHeatFloor);
    }

    var heatApplied = this.globalClock.baseHeatLevel * 0.65;
    var rawVerdict = debateMargin + heatApplied;

    // 3. TIRADA DE DADOS (FACTOR CAOS + sesgo de Directivas como INTOCABLE / PODER_DEVORADO)
    var noiseDice = Math.random();
    var chaosD100 = Math.floor(noiseDice * 100) + 1; // 1..100
    var turbulenceMult = Number(rollDiceRange(EYE_CONFIG.CHAOS_DICE.TURBULENCE_MIN, EYE_CONFIG.CHAOS_DICE.TURBULENCE_MAX).toFixed(3));
    var effectiveVerdict = rawVerdict >= 0 ? (rawVerdict * turbulenceMult) : (rawVerdict / Math.max(0.85, turbulenceMult));

    if (prosecution.score - defense.score >= 30) {
      this.state4_adaptive.godStreak += 1;
    } else if (defense.score > prosecution.score + 10) {
      this.state4_adaptive.godStreak = 0;
    }

    var chaosOutcome = 'DEBATE_NORMAL';
    var regime = 'JUICIO_EQUILIBRADO';
    var winner = 'EMPATE';

    var cCfg = EYE_CONFIG.CHAOS_DICE;
    var isCriticalHealthEmergency = (defense.hpRatio < 0.22 && s3.finalShield <= 0);
    var effectiveCurseMinRoll = Math.max(72, cCfg.CURSE_MIN_ROLL - (directives.curseThresholdShift || 0));

    if (chaosD100 <= cCfg.BLESSING_MAX_ROLL) {
      chaosOutcome = 'BENDICION_DIVINA';
      regime = 'BENDICION_DIVINA';
      winner = 'CAOS_DADOS';
    } else if (chaosD100 >= effectiveCurseMinRoll && !isCriticalHealthEmergency) {
      chaosOutcome = 'MALDICION_TRIBUNAL';
      regime = 'MALDICION_TRIBUNAL';
      winner = 'CAOS_DADOS';
    } else if (effectiveVerdict <= -18.0) {
      regime = 'CLEMENCIA_DEFENSOR';
      winner = 'JUSTICE_EYE';
    } else if (effectiveVerdict >= 64.0) {
      regime = 'SENTENCIA_MAXIMA';
      winner = 'BROTHER_EYE';
    } else if (effectiveVerdict >= 20.0) {
      regime = 'ACUSACION_FISCAL';
      winner = 'BROTHER_EYE';
    } else {
      regime = 'JUICIO_EQUILIBRADO';
      winner = debateMargin >= 0 ? 'BROTHER_EYE (Leve)' : 'JUSTICE_EYE (Leve)';
    }

    // 4. TRADUCIR VEREDICTO A MODIFICADORES FÍSICOS DE LA PRÓXIMA SALA
    var lim = EYE_CONFIG.LIMITS;
    var nextMod = this.state4_adaptive.nextRoomModifiers;
    var depthCurve = clamp(0.35 + (this.globalClock.roomsClearedCount / 24.0) * 0.65, 0.35, 1.0);
    var depthExtra = clamp(Math.max(0, this.globalClock.roomsClearedCount - 20) * 0.035, 0, 0.55);

    if (regime === 'BENDICION_DIVINA') {
      nextMod.enemyCountMultiplier = Number(rollDiceRange(0.65, 0.80).toFixed(2));
      nextMod.enemyHpMultiplier = 0.85;
      nextMod.enemyDamageMultiplier = 0.75;
      nextMod.enemySpeedMultiplier = 0.90;
      nextMod.elitePromotionChance = 0.0;
      nextMod.reactionDelayOverride = 0.40;
      nextMod.heartDropBonus = 0.25;

    } else if (regime === 'MALDICION_TRIBUNAL') {
      var curseIntensity = rollDiceRange(0.75, 1.0) * depthCurve;
      nextMod.enemyCountMultiplier = Number(clamp(1.45 + (lim.COUNT_MAX_CURSE - 1.45) * curseIntensity + depthExtra * 0.4, 1.45, 2.75).toFixed(2));
      nextMod.enemyHpMultiplier = Number(clamp(1.35 + (lim.HP_MAX_CURSE - 1.35) * curseIntensity + depthExtra * 0.6, 1.35, 3.30).toFixed(2));
      nextMod.enemyDamageMultiplier = Number(clamp(1.25 + (lim.DMG_MAX_CURSE - 1.25) * curseIntensity, 1.25, lim.DMG_MAX_CURSE).toFixed(2));
      nextMod.enemySpeedMultiplier = Number(clamp(1.06 + (lim.SPD_MAX_CURSE - 1.06) * curseIntensity, 1.05, lim.SPD_MAX_CURSE).toFixed(2));
      nextMod.elitePromotionChance = Number((0.18 + 0.16 * depthCurve).toFixed(2));
      nextMod.reactionDelayOverride = 0.16;
      nextMod.heartDropBonus = -0.05;

    } else if (regime === 'CLEMENCIA_DEFENSOR') {
      var reliefNorm = clamp(Math.abs(effectiveVerdict) / 95.0, 0.15, 1.0);
      nextMod.enemyCountMultiplier = Number(clamp(1.0 - (1.0 - lim.COUNT_MIN) * reliefNorm, lim.COUNT_MIN, 0.92).toFixed(2));
      nextMod.enemyHpMultiplier = Number(clamp(1.0 - (1.0 - lim.HP_MIN) * reliefNorm, lim.HP_MIN, 0.95).toFixed(2));
      nextMod.enemyDamageMultiplier = Number(clamp(1.0 - (1.0 - lim.DMG_MIN) * reliefNorm, lim.DMG_MIN, 0.92).toFixed(2));
      nextMod.enemySpeedMultiplier = Number(clamp(1.0 - (1.0 - lim.SPD_MIN) * reliefNorm, lim.SPD_MIN, 0.97).toFixed(2));
      nextMod.elitePromotionChance = 0.0;
      nextMod.reactionDelayOverride = 0.35;
      nextMod.heartDropBonus = Number((0.12 + 0.14 * reliefNorm).toFixed(2));

    } else if (regime === 'SENTENCIA_MAXIMA') {
      var maxNorm = clamp((effectiveVerdict - 64.0) / 85.0, 0.25, 1.0) * depthCurve;
      nextMod.enemyCountMultiplier = Number(clamp(1.38 + (lim.COUNT_MAX_MAXIMA - 1.38) * maxNorm + depthExtra * 0.45, 1.38, 2.65).toFixed(2));
      nextMod.enemyHpMultiplier = Number(clamp(1.40 + (lim.HP_MAX_MAXIMA - 1.40) * maxNorm + depthExtra * 0.85, 1.40, 3.60).toFixed(2));
      nextMod.enemyDamageMultiplier = Number(clamp(1.22 + (lim.DMG_MAX_MAXIMA - 1.22) * maxNorm, 1.22, lim.DMG_MAX_MAXIMA).toFixed(2));
      nextMod.enemySpeedMultiplier = Number(clamp(1.05 + (lim.SPD_MAX_MAXIMA - 1.05) * maxNorm, 1.04, lim.SPD_MAX_MAXIMA).toFixed(2));
      nextMod.elitePromotionChance = Number(clamp(0.12 + maxNorm * 0.26, 0.12, 0.40).toFixed(2));
      nextMod.reactionDelayOverride = 0.18;
      nextMod.heartDropBonus = -0.04;

    } else if (regime === 'ACUSACION_FISCAL') {
      var fiscNorm = clamp((effectiveVerdict - 20.0) / 44.0, 0.15, 1.0) * depthCurve;
      nextMod.enemyCountMultiplier = Number(clamp(1.16 + (lim.COUNT_MAX_NORMAL - 1.16) * fiscNorm + depthExtra * 0.25, 1.16, 2.05).toFixed(2));
      nextMod.enemyHpMultiplier = Number(clamp(1.15 + (lim.HP_MAX_NORMAL - 1.15) * fiscNorm + depthExtra * 0.45, 1.15, 2.40).toFixed(2));
      nextMod.enemyDamageMultiplier = Number(clamp(1.10 + (lim.DMG_MAX_NORMAL - 1.10) * fiscNorm, 1.10, lim.DMG_MAX_NORMAL).toFixed(2));
      nextMod.enemySpeedMultiplier = Number(clamp(1.03 + (lim.SPD_MAX_NORMAL - 1.03) * fiscNorm, 1.02, lim.SPD_MAX_NORMAL).toFixed(2));
      nextMod.elitePromotionChance = Number((0.06 + fiscNorm * 0.14).toFixed(2));
      nextMod.reactionDelayOverride = 0.22;
      nextMod.heartDropBonus = 0.0;

    } else {
      // JUICIO_EQUILIBRADO
      var micro = (noiseDice - 0.5) * 0.16;
      nextMod.enemyCountMultiplier = Number(clamp(1.04 + micro, 0.94, 1.20).toFixed(2));
      nextMod.enemyHpMultiplier = Number(clamp(1.05 + micro * 0.9 + depthExtra * 0.2, 0.95, 1.28).toFixed(2));
      nextMod.enemyDamageMultiplier = Number(clamp(1.02 + micro * 0.7, 0.94, 1.14).toFixed(2));
      nextMod.enemySpeedMultiplier = Number(clamp(1.01 + micro * 0.4, 0.96, 1.07).toFixed(2));
      nextMod.elitePromotionChance = 0.0;
      nextMod.reactionDelayOverride = null;
      nextMod.heartDropBonus = 0.0;
    }

    // Aplicar mutadores finos de las Directivas Globales
    if (regime !== 'BENDICION_DIVINA' && regime !== 'CLEMENCIA_DEFENSOR') {
      if (directives.eliteBonus > 0) {
        nextMod.elitePromotionChance = Number(clamp(nextMod.elitePromotionChance + directives.eliteBonus, 0, 0.50).toFixed(2));
      }
      if (directives.countMultFloor > nextMod.enemyCountMultiplier) {
        nextMod.enemyCountMultiplier = Number(directives.countMultFloor.toFixed(2));
      }
    }
    if (directives.damageFactor < 1.0) {
      nextMod.enemyDamageMultiplier = Number(clamp(nextMod.enemyDamageMultiplier * directives.damageFactor, lim.DMG_MIN, lim.DMG_MAX_CURSE).toFixed(2));
    }
    if (directives.heartDropBonus > 0) {
      nextMod.heartDropBonus = Number(clamp(nextMod.heartDropBonus + directives.heartDropBonus, -0.05, 0.40).toFixed(2));
    }

    // 5. GUARDAR ESTADO 4 COMPLETO
    this.state4_adaptive.indicators = {
      S_survival: Number(S_score.toFixed(1)),
      P_power: Number(P_score.toFixed(1)),
      V_speed: Number(V_score.toFixed(1)),
      E_efficiency: Number(E_score.toFixed(1)),
      G_progression: Number(G_score.toFixed(1))
    };
    this.state4_adaptive.performanceR = Number(R.toFixed(2));
    this.state4_adaptive.delta = Number(delta.toFixed(2));

    this.state4_adaptive.courtDebate = {
      prosecutorScore: prosecution.score,
      prosecutorReasons: prosecution.reasons,
      defenderScore: defense.score,
      defenderReasons: defense.reasons,
      debateMargin: Number(debateMargin.toFixed(1)),
      heatApplied: Number(heatApplied.toFixed(1)),
      rawVerdictScore: Number(rawVerdict.toFixed(1)),
      effectiveVerdictScore: Number(effectiveVerdict.toFixed(1)),
      winner: winner
    };

    this.state4_adaptive.diceStats = {
      minPoint: Number(minPoint.toFixed(1)),
      maxPoint: Number(maxPoint.toFixed(1)),
      spread: Number(spread.toFixed(1)),
      noiseRoll: Number(noiseDice.toFixed(3)),
      chaosD100: chaosD100,
      turbulenceMult: turbulenceMult,
      chaosOutcome: chaosOutcome,
      lowNoiseTriggered: (regime === 'SENTENCIA_MAXIMA' || regime === 'MALDICION_TRIBUNAL')
    };
    this.state4_adaptive.regime = regime;

    // Snapshot del historial antes de un posible borrado de memoria a corto plazo
    var memSnapshot = {
      roomsSinceReset: mem.roomsSinceReset,
      resetInterval: mem.resetIntervalRooms,
      patternLabel: mem.dominantPatternLabel,
      willResetNow: mem.roomsSinceReset >= mem.resetIntervalRooms
    };

    this.roomHistory.push({
      globalTime: Number(this.globalClock.elapsedSeconds.toFixed(1)),
      roomNumber: this.globalClock.roomsClearedCount,
      roomType: s1.roomType,
      roomTime: Number(s3.totalTimeEmployed.toFixed(2)),
      dtps: Number(s3.dtpsTotal.toFixed(2)),
      percentLost: Number((s3.percentVitalityLost * 100).toFixed(1)),
      R: this.state4_adaptive.performanceR,
      delta: this.state4_adaptive.delta,
      prosecutorScore: prosecution.score,
      defenderScore: defense.score,
      chaosD100: chaosD100,
      regime: regime,
      directives: directives.activeDirectives.map(function (d) { return d.id; }),
      memoryNote: memSnapshot.patternLabel + (memSnapshot.willResetNow ? ' [BORRÓN Y CUENTA NUEVA]' : ''),
      nextModifiers: {
        count: nextMod.enemyCountMultiplier,
        hp: nextMod.enemyHpMultiplier,
        damage: nextMod.enemyDamageMultiplier,
        speed: nextMod.enemySpeedMultiplier,
        elite: nextMod.elitePromotionChance
      }
    });
    if (this.roomHistory.length > EYE_CONFIG.MAX_HISTORY_LOG) {
      this.roomHistory.shift();
    }

    // 6. BORRADO PERIÓDICO DE MEMORIA A CORTO PLAZO CADA N SALAS
    if (this.shortTermMemory.roomsSinceReset >= EYE_CONFIG.SHORT_TERM_MEMORY.RESET_INTERVAL_ROOMS) {
      this.resetShortTermMemory('CYCLE_' + EYE_CONFIG.SHORT_TERM_MEMORY.RESET_INTERVAL_ROOMS + '_ROOMS');
    }

    if (typeof this.onUpdateCallback === 'function') {
      this.onUpdateCallback(this.getStatus());
    }
  };

  // ==========================================================================
  // PERSISTENCIA EN RUNSAVEMANAGER (SERIALIZACIÓN COMPLETA DEL EXPEDIENTE)
  // ==========================================================================
  BrotherEyeEngine.prototype.exportSaveState = function () {
    return {
      globalClock: Object.assign({}, this.globalClock),
      state0_initial: Object.assign({}, this.state0_initial),
      globalLedger: createEmptyGlobalLedger(this.globalLedger, true),
      shortTermMemory: this.shortTermMemory,
      state4_adaptive: this.state4_adaptive,
      activeGlobalDirectives: Array.isArray(this.activeGlobalDirectives) ? this.activeGlobalDirectives.slice() : [],
      lastDirectiveOutcome: Object.assign({}, this.lastDirectiveOutcome),
      roomHistory: Array.isArray(this.roomHistory) ? this.roomHistory.slice(-EYE_CONFIG.MAX_HISTORY_LOG) : []
    };
  };

  BrotherEyeEngine.prototype.importSaveState = function (saved) {
    if (!saved || typeof saved !== 'object') return false;
    if (saved.globalClock) {
      this.globalClock = Object.assign(this.globalClock, saved.globalClock);
    }
    if (saved.state0_initial) {
      this.state0_initial = Object.assign(this.state0_initial, saved.state0_initial);
    }
    if (saved.globalLedger) {
      // Preservar ngPlusCyclesCarried exacto sin incrementarlo al recargar save
      var exactCycles = saved.globalLedger.ngPlusCyclesCarried || 0;
      this.globalLedger = createEmptyGlobalLedger(saved.globalLedger, true);
      this.globalLedger.ngPlusCyclesCarried = exactCycles;
    }
    if (saved.shortTermMemory) {
      this.shortTermMemory = Object.assign(createEmptyShortTermMemory('RESTORED'), saved.shortTermMemory);
    }
    if (saved.state4_adaptive) {
      this.state4_adaptive = Object.assign(this.state4_adaptive, saved.state4_adaptive);
    }
    if (Array.isArray(saved.activeGlobalDirectives)) {
      this.activeGlobalDirectives = saved.activeGlobalDirectives.slice();
    }
    if (saved.lastDirectiveOutcome) {
      this.lastDirectiveOutcome = Object.assign(this.lastDirectiveOutcome, saved.lastDirectiveOutcome);
    }
    if (Array.isArray(saved.roomHistory)) {
      this.roomHistory = saved.roomHistory.slice();
    }
    return true;
  };

  // ==========================================================================
  // GETTERS Y TELEMETRÍA PARA EL MOTOR DEL JUEGO Y CONSOLA [F2]
  // ==========================================================================
  BrotherEyeEngine.prototype.getAdaptiveSpawnMultiplier = function () {
    return this.enabled ? this.state4_adaptive.nextRoomModifiers.enemyCountMultiplier : 1.0;
  };

  BrotherEyeEngine.prototype.getEnemyHpMultiplier = function () {
    return this.enabled ? (this.state4_adaptive.nextRoomModifiers.enemyHpMultiplier || 1.0) : 1.0;
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
      shortTermMemory: this.shortTermMemory,
      globalLedger: this.globalLedger,
      activeGlobalDirectives: this.activeGlobalDirectives || [],
      summary: {
        R: s4.performanceR,
        expectedR: s4.expectedR,
        delta: s4.delta,
        regime: s4.regime,
        winner: s4.courtDebate.winner,
        prosecutorScore: s4.courtDebate.prosecutorScore,
        defenderScore: s4.courtDebate.defenderScore,
        baseHeatLevel: Number(this.globalClock.baseHeatLevel.toFixed(1)),
        chaosD100: s4.diceStats.chaosD100,
        godStreak: s4.godStreak,
        nextCountMult: s4.nextRoomModifiers.enemyCountMultiplier,
        nextHpMult: s4.nextRoomModifiers.enemyHpMultiplier,
        nextDamageMult: s4.nextRoomModifiers.enemyDamageMultiplier,
        nextSpeedMult: s4.nextRoomModifiers.enemySpeedMultiplier,
        nextEliteChance: s4.nextRoomModifiers.elitePromotionChance
      }
    };
  };

  return new BrotherEyeEngine();
}));
