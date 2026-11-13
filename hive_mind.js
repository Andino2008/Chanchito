/**
 * ============================================================================
 * HIVE_MIND.JS - INTELIGENCIA ARTIFICIAL DE ENJAMBRE OPTIMIZADA (v3.5)
 * ============================================================================
 * Arquitectura de Mente Colmena desacoplada para máximo rendimiento en CPU
 * y combate táctico ordenado:
 *
 *  1. EL ORÁCULO GLOBAL (1 evaluación/frame):
 *     - Responde 20 preguntas booleanas generales y mide coordenadas vagas (3x3).
 *     - Conectado a BrotherEye & JusticeEye y a una tabla contextual de 4 salas.
 *  2. SUB-COLMENAS POR TIPO + RED INTER-COLMENA (cada 25% de bajas):
 *     - Sub-colmenas: MELEE, RANGED, CHARGER, ELITE, BOSS.
 *     - Hitos del 25% (75%, 50%, 25%, Último) actualizan tips tácticos compartidos.
 *  3. DESINCRONIZACIÓN POR FIBONACCI ([3, 5, 8, 1] frames):
 *     - Los chequeos locales de cada enemigo corren de forma escalonada.
 *  4. EXCEPCIÓN DE SINCRONÍA + DESTELLO ROJO + ÚLTIMO SOBREVIVIENTE AMARILLO:
 *     - Casos extremos rompen el ciclo Fibonacci con un destello rojo sutil y
 *       castigo asimétrico; si queda 1 solo enemigo, brilla amarillo con IA
 *       miedosa pero agresiva.
 *
 * REGLA INVIOLABLE: Cero llamadas a ctx.fillText / ctx.strokeText.
 * ============================================================================
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HiveMindSystem = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  var FIB_CYCLE = [3, 5, 8, 1];

  var SECTOR_NAMES = [
    ['NW', 'N', 'NE'],
    ['W', 'CENTER', 'E'],
    ['SW', 'S', 'SE']
  ];

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function createEmptyTable4Rooms(reason) {
    return {
      roomsTracked: 0,
      resetInterval: 4,
      lastResetReason: reason || 'INIT',
      hiveDamageTakenTotal: 0,
      hiveDamageDealtTotal: 0,
      playerExhaustionsCount: 0,
      extremeSyncTriggers: 0,
      roomsClearedWithNoDamageDealt: 0,
      blitzRoomsCount: 0,
      alertMultiplier: 1.0
    };
  }

  function createEmptyOracle() {
    return {
      roomTime: 0,
      initialEnemies: 0,
      livingEnemies: 0,
      aliveRatio: 1.0,
      killsInRoom: 0,
      lastMilestonePct: 100,
      timeSinceHiveDealtDmg: 0,
      timeSincePlayerDealtDmg: 99,
      playerStationaryTimer: 0,
      lastPlayerX: null,
      lastPlayerY: null,

      // Coordenadas vagas (3x3)
      sectorX: 1,
      sectorY: 1,
      sectorLabel: 'CENTER',
      playerMoveTrend: 'STATIC',
      playerDistZone: 'MID',

      // 20 Preguntas Booleanas del Oráculo Global
      q: {
        playerStaminaEmpty: false,        // 1
        playerStaminaLow: false,          // 2
        playerStationary: false,          // 3
        playerCornered: false,            // 4
        playerDealtDmgToHive: false,      // 5
        hiveDealtDmgToPlayer: false,      // 6
        noKillsYetStale: false,           // 7
        lowHiveDamageOutput: false,       // 8
        playerUsingMelee: false,          // 9
        playerUsingRangedOrBeam: false,   // 10
        playerDashingNow: false,          // 11
        playerHpCritical: false,          // 12
        playerRepeatingPattern4Rooms: false, // 13
        justiceClemencyActive: false,     // 14
        brotherEyeAggressive: false,      // 15
        vanguardSlotOpen: true,           // 16
        hiveAbove75Pct: true,             // 17
        hiveBelow50Pct: false,            // 18
        hiveBelow25Pct: false,            // 19
        isLastSurvivor: false             // 20
      },

      // Excepción de Sincronía (Casos Extremos)
      syncExceptionActive: false,
      syncExceptionReason: 'NINGUNO',
      syncPulseRemaining: 0,
      syncCooldownTimer: 0,
      redFlashTimer: 0,
      redFlashDuration: 0.30,
      lastExtremeKey: '',
      predictableDashAxis: null
    };
  }

  function HiveMindEngine() {
    this.oracle = createEmptyOracle();
    this.table4Rooms = createEmptyTable4Rooms('INIT');
    this.subHives = {
      MELEE: { count: 0, exhaustedCount: 0, vanguardCount: 0, maxVanguard: 2, directive: 'TURNOS_ROTATIVOS' },
      RANGED: { count: 0, exhaustedCount: 0, firingCount: 0, maxFiring: 2, directive: 'FUEGO_COBERTURA' },
      CHARGER: { count: 0, exhaustedCount: 0, activeCharges: 0, maxCharges: 1, directive: 'COLA_EMBESTIDA' },
      ELITE: { count: 0, exhaustedCount: 0, directive: 'PRESION_SARGENTO' },
      BOSS: { count: 0, exhaustedCount: 0, directive: 'PATRON_JEFE' }
    };
    this.interHiveNetwork = {
      milestonePct: 100,
      lastTip: 'Colmenas sincronizadas al 100%. Vanguardia rotativa activa.',
      rangedCooldownMult: 1.0,
      aggressionMult: 1.0,
      vanguardSlots: 2
    };
    this.stats = {
      totalTicks: 0,
      evaluatedTicks: 0,
      skippedTicks: 0,
      syncForcedTicks: 0
    };
    this.currentRoomRef = null;
    this._lastPlayerExhausted = false;
  }

  HiveMindEngine.prototype.resetTable4Rooms = function (reason) {
    this.table4Rooms = createEmptyTable4Rooms(reason || 'CYCLE_4_ROOMS');
  };

  HiveMindEngine.prototype.syncWithBrotherEyeReset = function (reason) {
    this.resetTable4Rooms(reason || 'BROTHER_EYE_SYNC');
  };

  HiveMindEngine.prototype.getHiveTypeForEnemy = function (enemy) {
    if (!enemy) return 'MELEE';
    if (enemy.isBoss) return 'BOSS';
    if (enemy.isElite) return 'ELITE';
    var cname = enemy.constructor ? enemy.constructor.name : '';
    if (cname === 'ChargerEnemy' || enemy.behaviorType === 'DASHER') return 'CHARGER';
    if (cname === 'ShooterEnemy' || cname === 'FlyerEnemy') return 'RANGED';
    return 'MELEE';
  };

  HiveMindEngine.prototype.initEnemyHiveState = function (enemy) {
    if (!enemy || enemy._hiveInitialized) return;
    enemy._hiveInitialized = true;
    enemy.hiveType = this.getHiveTypeForEnemy(enemy);
    enemy.fibIndex = Math.floor(Math.random() * FIB_CYCLE.length);
    enemy.fibCountdown = Math.floor(Math.random() * FIB_CYCLE[enemy.fibIndex]);
    enemy.hiveRole = 'VANGUARD';
    enemy.flankSign = Math.random() < 0.5 ? -1 : 1;
    enemy.isLastSurvivor = false;
    enemy.cachedSteering = {
      moveVx: 0,
      moveVy: 0,
      allowAttack: true,
      speedMult: 1.0,
      role: 'VANGUARD'
    };
  };

  HiveMindEngine.prototype.onRoomEntered = function (room, player) {
    this.currentRoomRef = room;
    this.oracle = createEmptyOracle();
    var enemies = (room && Array.isArray(room.enemies)) ? room.enemies : [];
    var living = 0;
    for (var i = 0; i < enemies.length; i++) {
      if (!enemies[i].markedForDeletion) {
        living++;
        this.initEnemyHiveState(enemies[i]);
      }
    }
    this.oracle.initialEnemies = living;
    this.oracle.livingEnemies = living;
    this.oracle.aliveRatio = 1.0;
    this.oracle.lastMilestonePct = 100;
    if (player) {
      this.oracle.lastPlayerX = player.x;
      this.oracle.lastPlayerY = player.y;
    }

    this.interHiveNetwork = {
      milestonePct: 100,
      lastTip: living > 0
        ? 'Colmenas activas (' + living + ' uds). Melee abre paso de a 2; Ranged cubre desde atrás.'
        : 'Sala pacífica sin hostiles.',
      rangedCooldownMult: 1.0,
      aggressionMult: 1.0,
      vanguardSlots: 2
    };

    // Sincronizar reinicio cada 4 salas con BrotherEye si corresponde
    if (typeof BrotherEye !== 'undefined' && BrotherEye.shortTermMemory) {
      if (BrotherEye.shortTermMemory.roomsSinceReset === 0 && this.table4Rooms.roomsTracked >= 4) {
        this.resetTable4Rooms('CYCLE_4_ROOMS');
      }
    }

    // Memoria agresiva de 4 salas: si el jugador viene invicto o haciendo blitz, la colmena entra en alerta alta
    var t4 = this.table4Rooms;
    var streakAlert = 1.0 + Math.min(0.28, (t4.roomsClearedWithNoDamageDealt || 0) * 0.08 + (t4.blitzRoomsCount || 0) * 0.06);
    t4.alertMultiplier = Number(streakAlert.toFixed(2));
    if (living > 0 && t4.roomsClearedWithNoDamageDealt >= 2) {
      this.interHiveNetwork.vanguardSlots = Math.max(this.interHiveNetwork.vanguardSlots, 3);
      this.interHiveNetwork.aggressionMult = Number(streakAlert.toFixed(2));
      this.interHiveNetwork.rangedCooldownMult = Number(Math.max(0.84, 1.0 - (streakAlert - 1.0) * 0.5).toFixed(2));
      this.interHiveNetwork.lastTip = 'ALERTA 4-SALAS (' + t4.roomsClearedWithNoDamageDealt + ' invictas): Cierre envolvente inmediato.';
      this.triggerSyncException('RUSH_SIN_DANO', 'Jugador invicto (' + t4.roomsClearedWithNoDamageDealt + ' salas)');
    }
  };

  HiveMindEngine.prototype.onRoomCleared = function (room) {
    if (!room || room !== this.currentRoomRef) return;
    this.table4Rooms.roomsTracked += 1;
    if (this.oracle.hiveDealtDmgToPlayer === false && this.oracle.initialEnemies > 0) {
      this.table4Rooms.roomsClearedWithNoDamageDealt += 1;
    }
    if (this.oracle.initialEnemies > 0 && this.oracle.roomTime <= 2.4) {
      this.table4Rooms.blitzRoomsCount = (this.table4Rooms.blitzRoomsCount || 0) + 1;
    }
    this.table4Rooms.alertMultiplier = Number((1.0 + Math.min(0.28, this.table4Rooms.roomsClearedWithNoDamageDealt * 0.08 + (this.table4Rooms.blitzRoomsCount || 0) * 0.06)).toFixed(2));
    if (this.table4Rooms.roomsTracked >= this.table4Rooms.resetInterval) {
      this.resetTable4Rooms('AUTO_4_ROOMS');
    }
  };

  HiveMindEngine.prototype.recordDamageToPlayer = function (amount) {
    if (!amount || amount <= 0) return;
    this.oracle.timeSinceHiveDealtDmg = 0;
    this.oracle.q.hiveDealtDmgToPlayer = true;
    this.table4Rooms.hiveDamageDealtTotal += amount;
  };

  HiveMindEngine.prototype.recordDamageToHive = function (amount) {
    if (!amount || amount <= 0) return;
    this.oracle.timeSincePlayerDealtDmg = 0;
    this.oracle.q.playerDealtDmgToHive = true;
    this.table4Rooms.hiveDamageTakenTotal += amount;
  };

  HiveMindEngine.prototype.recordEnemyKilled = function (room) {
    this.oracle.killsInRoom += 1;
    if (room && room === this.currentRoomRef) {
      this.evaluateInterHiveMilestone(room);
    }
  };

  HiveMindEngine.prototype.evaluateInterHiveMilestone = function (room) {
    if (!room || !Array.isArray(room.enemies) || this.oracle.initialEnemies <= 0) return;
    var living = 0;
    for (var i = 0; i < room.enemies.length; i++) {
      if (!room.enemies[i].markedForDeletion) living++;
    }
    var pct = Math.round((living / Math.max(1, this.oracle.initialEnemies)) * 100);
    var net = this.interHiveNetwork;

    if (living === 1 && this.oracle.initialEnemies >= 2 && net.milestonePct > 1) {
      net.milestonePct = 1;
      net.rangedCooldownMult = 0.78;
      net.aggressionMult = 1.16;
      net.vanguardSlots = 1;
      net.lastTip = 'RED FINAL (1 vivo): ¡Compañeros caídos! Último sobreviviente en modo evasivo-agresivo (aura amarilla).';
      return;
    }

    if (pct <= 25 && net.milestonePct > 25) {
      net.milestonePct = 25;
      net.rangedCooldownMult = 0.82;
      net.aggressionMult = 1.12;
      net.vanguardSlots = 3;
      net.lastTip = 'RED (25% vivo): Quedan pocas unidades — el de mayor estamina distrae de frente, tiradores aceleran ráfaga.';
    } else if (pct <= 50 && net.milestonePct > 50) {
      net.milestonePct = 50;
      net.rangedCooldownMult = 0.90;
      net.aggressionMult = 1.06;
      net.vanguardSlots = 2;
      net.lastTip = 'RED (50% vivo): Bajas moderadas — Chargers toman prioridad si el jugador dispara de lejos.';
    } else if (pct <= 75 && net.milestonePct > 75) {
      net.milestonePct = 75;
      net.rangedCooldownMult = 0.96;
      net.aggressionMult = 1.02;
      net.vanguardSlots = 2;
      net.lastTip = 'RED (75% vivo): Melee mantiene turnos de a 2; Ranged cubre flancos del sector ' + this.oracle.sectorLabel + '.';
    }
  };

  HiveMindEngine.prototype.triggerSyncException = function (reasonKey, reasonLabel) {
    var o = this.oracle;
    o.syncExceptionActive = true;
    o.syncExceptionReason = reasonLabel;
    o.syncPulseRemaining = 0.45;
    if (o.syncCooldownTimer <= 0 || o.lastExtremeKey !== reasonKey) {
      o.syncCooldownTimer = 4.2;
      o.lastExtremeKey = reasonKey;
      o.redFlashTimer = o.redFlashDuration;
      this.table4Rooms.extremeSyncTriggers += 1;
    }
  };

  /**
   * EL ORÁCULO GLOBAL: se ejecuta 1 sola vez por frame en Room.update().
   * Responde ~20 preguntas booleanas, calcula coordenadas vagas y coordina roles.
   */
  HiveMindEngine.prototype.updateOracle = function (dt, room, player) {
    if (!room || !player) return;
    if (this.currentRoomRef !== room) {
      this.onRoomEntered(room, player);
    }

    var o = this.oracle;
    var enemies = Array.isArray(room.enemies) ? room.enemies : [];
    var b = room.bounds || { left: 48, right: 912, top: 48, bottom: 592, width: 864, height: 544, centerX: 480, centerY: 320 };

    if (o.redFlashTimer > 0) o.redFlashTimer = Math.max(0, o.redFlashTimer - dt);
    if (o.syncCooldownTimer > 0) o.syncCooldownTimer = Math.max(0, o.syncCooldownTimer - dt);
    if (o.syncPulseRemaining > 0) {
      o.syncPulseRemaining = Math.max(0, o.syncPulseRemaining - dt);
      if (o.syncPulseRemaining === 0) o.syncExceptionActive = false;
    }

    if (room.cleared || enemies.length === 0) {
      o.livingEnemies = 0;
      o.q.isLastSurvivor = false;
      return;
    }

    o.roomTime += dt;
    o.timeSinceHiveDealtDmg += dt;
    o.timeSincePlayerDealtDmg += dt;

    // 1. Coordenadas vagas (grilla 3x3 + tendencia de movimiento)
    var relX = clamp((player.x - b.left) / Math.max(1, b.width), 0, 0.999);
    var relY = clamp((player.y - b.top) / Math.max(1, b.height), 0, 0.999);
    o.sectorX = Math.floor(relX * 3);
    o.sectorY = Math.floor(relY * 3);
    o.sectorLabel = SECTOR_NAMES[o.sectorY][o.sectorX];

    var movedDist = (o.lastPlayerX !== null) ? Math.hypot(player.x - o.lastPlayerX, player.y - o.lastPlayerY) : 0;
    var moveSpd = movedDist / Math.max(0.001, dt);
    if (moveSpd < 38) {
      o.playerStationaryTimer += dt;
      o.playerMoveTrend = 'STATIC';
    } else {
      o.playerStationaryTimer = 0;
      var mdx = player.x - o.lastPlayerX;
      var mdy = player.y - o.lastPlayerY;
      if (Math.abs(mdx) >= Math.abs(mdy)) {
        o.playerMoveTrend = mdx >= 0 ? 'RIGHT' : 'LEFT';
      } else {
        o.playerMoveTrend = mdy >= 0 ? 'DOWN' : 'UP';
      }
    }
    o.lastPlayerX = player.x;
    o.lastPlayerY = player.y;

    var centerDist = Math.hypot(player.x - b.centerX, player.y - b.centerY);
    o.playerDistZone = centerDist < 120 ? 'CENTER' : (centerDist < 240 ? 'MID' : 'EDGE');

    // 2. Conteo vivo y sub-colmenas en una sola pasada O(N)
    var sh = this.subHives;
    sh.MELEE.count = 0; sh.MELEE.exhaustedCount = 0; sh.MELEE.vanguardCount = 0;
    sh.RANGED.count = 0; sh.RANGED.exhaustedCount = 0; sh.RANGED.firingCount = 0;
    sh.CHARGER.count = 0; sh.CHARGER.exhaustedCount = 0; sh.CHARGER.activeCharges = 0;
    sh.ELITE.count = 0; sh.ELITE.exhaustedCount = 0;
    sh.BOSS.count = 0; sh.BOSS.exhaustedCount = 0;

    var living = 0;
    var hasBoss = false;
    var lastSurvivorCandidate = null;
    for (var i = 0; i < enemies.length; i++) {
      var en = enemies[i];
      if (en.markedForDeletion) continue;
      this.initEnemyHiveState(en);
      living++;
      lastSurvivorCandidate = en;
      if (en.isBoss) hasBoss = true;
      var h = sh[en.hiveType] || sh.MELEE;
      h.count += 1;
      if (en.isExhausted) h.exhaustedCount += 1;
      if (en.hiveRole === 'VANGUARD' && en.hiveType === 'MELEE') sh.MELEE.vanguardCount += 1;
    }

    o.livingEnemies = living;
    if (o.initialEnemies < living) o.initialEnemies = living;
    o.aliveRatio = o.initialEnemies > 0 ? (living / o.initialEnemies) : 1.0;

    // Verificar hitos del 25% también en tick (por si murió por hazard o splitter)
    this.evaluateInterHiveMilestone(room);

    // 3. Evaluar las 20 Preguntas Booleanas del Oráculo Global
    var q = o.q;
    var maxStam = Math.max(1, player.maxStamina || 100);
    var stamRatio = (typeof player.stamina === 'number' ? player.stamina : maxStam) / maxStam;
    var isPlayerExhausted = Boolean(player.isStaminaExhausted || (typeof player.stamina === 'number' && player.stamina <= 0));

    if (isPlayerExhausted && !this._lastPlayerExhausted) {
      this.table4Rooms.playerExhaustionsCount += 1;
    }
    this._lastPlayerExhausted = isPlayerExhausted;

    q.playerStaminaEmpty = isPlayerExhausted;                                         // 1
    q.playerStaminaLow = stamRatio < 0.36;                                            // 2
    q.playerStationary = o.playerStationaryTimer >= 0.55;                             // 3
    q.playerCornered = (o.sectorX !== 1 && o.sectorY !== 1);                          // 4
    q.playerDealtDmgToHive = o.timeSincePlayerDealtDmg <= 1.5;                        // 5
    q.hiveDealtDmgToPlayer = o.timeSinceHiveDealtDmg <= 2.5;                          // 6
    q.noKillsYetStale = (o.roomTime >= 3.6 && o.killsInRoom === 0 && !hasBoss);       // 7
    q.lowHiveDamageOutput = (o.roomTime >= 4.2 && o.timeSinceHiveDealtDmg >= 4.2);    // 8

    var curWeapon = player.currentWeapon;
    var isMeleeWpn = Boolean(curWeapon && Array.isArray(curWeapon.tags) && (curWeapon.tags.indexOf('MELEE') !== -1 || curWeapon.tags.indexOf('PARRY') !== -1));
    q.playerUsingMelee = isMeleeWpn;                                                  // 9
    q.playerUsingRangedOrBeam = !isMeleeWpn;                                          // 10
    q.playerDashingNow = Boolean(player.dodgeActiveTimer > 0 || player.dashIFrameTimer > 0); // 11
    q.playerHpCritical = (player.hp / Math.max(1, player.maxHp)) <= 0.28;             // 12

    var eyeStatus = (typeof BrotherEye !== 'undefined' && BrotherEye.enabled) ? BrotherEye.getStatus() : null;
    var eyeMem = (typeof BrotherEye !== 'undefined' && BrotherEye.shortTermMemory) ? BrotherEye.shortTermMemory : null;
    var eyeRegime = eyeStatus && eyeStatus.state4_Adaptive ? eyeStatus.state4_Adaptive.regime : 'JUICIO_EQUILIBRADO';

    var eyePatterns = (eyeMem && Array.isArray(eyeMem.detectedPatterns)) ? eyeMem.detectedPatterns : [];
    o.predictableDashAxis = null;
    for (var pIdx = 0; pIdx < eyePatterns.length; pIdx++) {
      if (eyePatterns[pIdx].indexOf('ESQUIVA_PREDECIBLE_') === 0) {
        o.predictableDashAxis = eyePatterns[pIdx].replace('ESQUIVA_PREDECIBLE_', '');
        break;
      }
    }

    q.playerRepeatingPattern4Rooms = eyePatterns.length > 0;                          // 13
    q.justiceClemencyActive = (eyeRegime === 'CLEMENCIA_DEFENSOR' || eyeRegime === 'BENDICION_DIVINA');                // 14
    q.brotherEyeAggressive = (eyeRegime === 'ACUSACION_FISCAL' || eyeRegime === 'SENTENCIA_MAXIMA' || eyeRegime === 'MALDICION_TRIBUNAL'); // 15

    var maxVan = q.justiceClemencyActive ? 1 : (q.brotherEyeAggressive ? 3 : this.interHiveNetwork.vanguardSlots);
    sh.MELEE.maxVanguard = maxVan;
    q.vanguardSlotOpen = sh.MELEE.vanguardCount < maxVan;                             // 16
    q.hiveAbove75Pct = o.aliveRatio > 0.75;                                           // 17
    q.hiveBelow50Pct = o.aliveRatio <= 0.50;                                          // 18
    q.hiveBelow25Pct = o.aliveRatio <= 0.25;                                          // 19
    q.isLastSurvivor = (living === 1 && o.initialEnemies >= 2 && !hasBoss);           // 20

    // Marcar al único sobreviviente para brillo amarillo + IA miedosa pero agresiva
    for (var j = 0; j < enemies.length; j++) {
      enemies[j].isLastSurvivor = Boolean(q.isLastSurvivor && enemies[j] === lastSurvivorCandidate);
    }

    // 4. Directivas dinámicas por sub-colmena
    sh.MELEE.directive = q.playerCornered ? 'TENAZA_ESQUINA' : (q.playerUsingRangedOrBeam ? 'CERCO_FLANCO' : 'TURNOS_ROTATIVOS');
    sh.RANGED.directive = (q.hiveBelow50Pct || o.predictableDashAxis) ? 'FUEGO_PREDICTIVO' : (q.playerUsingMelee ? 'MANTENER_DISTANCIA' : 'FUEGO_CRUZADO');
    sh.CHARGER.directive = (q.playerStationary || q.playerCornered || q.playerStaminaEmpty) ? 'EMBESTIDA_CASTIGO' : 'COLA_ESCALONADA';
    sh.ELITE.directive = q.playerStaminaEmpty ? 'EJECUCION_SIN_ESTAMINA' : 'PRESION_SARGENTO';
    sh.BOSS.directive = (q.playerStaminaLow || q.playerCornered) ? 'PRESION_VENTANA_CORTA' : 'PATRON_JEFE';

    // 5. Excepción de Sincronía (Casos Extremos -> incluye Blitz Rápido y Esquiva Predecible)
    var isBlitzMasacre = (o.initialEnemies >= 3 && o.roomTime <= 2.0 && o.aliveRatio <= 0.55 && !hasBoss);
    if (q.isLastSurvivor && o.lastExtremeKey !== 'LAST_SURVIVOR') {
      this.triggerSyncException('LAST_SURVIVOR', 'Último sobreviviente aislado');
    } else if (isBlitzMasacre && o.lastExtremeKey !== 'BLITZ_MASACRE') {
      this.triggerSyncException('BLITZ_MASACRE', 'Masacre relámpago (<2s)');
    } else if (q.playerStaminaEmpty && o.syncCooldownTimer <= 0) {
      this.triggerSyncException('STAMINA_EMPTY', 'Jugador sin estamina (Agotado)');
    } else if (o.predictableDashAxis && o.roomTime >= 0.4 && o.syncCooldownTimer <= 0) {
      this.triggerSyncException('PREDICTABLE_DODGE', 'Esquiva repetida (' + o.predictableDashAxis + ')');
    } else if (q.playerStationary && o.syncCooldownTimer <= 0) {
      this.triggerSyncException('PLAYER_STATIC', 'Jugador estático prolongado');
    } else if (q.noKillsYetStale && o.syncCooldownTimer <= 0) {
      this.triggerSyncException('NO_KILLS', 'Sin bajas en sala (3.6s+)');
    } else if (q.lowHiveDamageOutput && o.syncCooldownTimer <= 0) {
      this.triggerSyncException('LOW_DMG', 'Colmena sin daño suficiente (4.2s+)');
    }
  };

  /**
   * DESINCRONIZACIÓN POR FIBONACCI ([3, 5, 8, 1] frames) + EXCEPCIÓN DE SINCRONÍA.
   * Devuelve true si el enemigo debe recalcular su decisión táctica en este frame.
   */
  HiveMindEngine.prototype.shouldRunLocalCheck = function (enemy) {
    this.initEnemyHiveState(enemy);
    this.stats.totalTicks += 1;

    // Enemigo único sobreviviente o en Excepción de Sincronía (con estamina) rompe espera
    if (this.oracle.syncExceptionActive && !enemy.isExhausted) {
      enemy.fibCountdown = 0;
      this.stats.syncForcedTicks += 1;
      this.stats.evaluatedTicks += 1;
      return true;
    }

    if (enemy.fibCountdown > 0) {
      enemy.fibCountdown -= 1;
      this.stats.skippedTicks += 1;
      return false;
    }

    enemy.fibIndex = (enemy.fibIndex + 1) % FIB_CYCLE.length;
    enemy.fibCountdown = FIB_CYCLE[enemy.fibIndex];
    this.stats.evaluatedTicks += 1;
    return true;
  };

  /**
   * Calcula la orden táctica local para un enemigo leyendo al Oráculo Global y su Sub-Colmena.
   */
  HiveMindEngine.prototype.computeTacticalDirective = function (enemy, targetEntity, room, allEnemies) {
    this.initEnemyHiveState(enemy);
    var o = this.oracle;
    var q = o.q;
    var net = this.interHiveNetwork;
    var dx = targetEntity.x - enemy.x;
    var dy = targetEntity.y - enemy.y;
    var dist = Math.hypot(dx, dy) || 1;
    var toX = dx / dist;
    var toY = dy / dist;
    var perpX = -toY;
    var perpY = toX;

    var staminaRatio = (typeof enemy.maxStamina === 'number' && enemy.maxStamina > 0)
      ? (enemy.stamina / enemy.maxStamina)
      : 1.0;

    // Caso especial: ÚLTIMO SOBREVIVIENTE (brilla amarillo, IA miedosa pero agresiva)
    if (enemy.isLastSurvivor) {
      enemy.hiveRole = 'LAST_SURVIVOR';
      var skittishFear = (dist < 165) || enemy.isExhausted || (staminaRatio < 0.35);
      var zig = Math.sin((enemy.aiTimer || 0) * 9.5) * 0.72;
      var moveX, moveY;
      if (skittishFear) {
        // Miedoso: retrocede rápido + zig-zag lateral nervioso para no dejarse encerrar
        moveX = (-toX * 0.82 + perpX * enemy.flankSign * (0.75 + zig * 0.35));
        moveY = (-toY * 0.82 + perpY * enemy.flankSign * (0.75 + zig * 0.35));
      } else {
        // Agresivo: arremete en diagonal rápida
        moveX = (toX * 0.95 + perpX * enemy.flankSign * 0.55);
        moveY = (toY * 0.95 + perpY * enemy.flankSign * 0.55);
      }
      var nLen = Math.hypot(moveX, moveY) || 1;
      var spdMult = skittishFear ? 1.15 : 1.18;
      enemy.cachedSteering = {
        moveVx: (moveX / nLen) * enemy.speed * spdMult,
        moveVy: (moveY / nLen) * enemy.speed * spdMult,
        allowAttack: !enemy.isExhausted,
        speedMult: spdMult,
        role: 'LAST_SURVIVOR'
      };
      return enemy.cachedSteering;
    }

    // Si el enemigo está agotado (sin estamina), pasa a rol RECOVER: orbita/retrocede
    if (enemy.isExhausted) {
      enemy.hiveRole = 'RECOVER';
      var retreatWeight = dist < 190 ? -0.75 : 0.15;
      var rx = toX * retreatWeight + perpX * enemy.flankSign * 0.85;
      var ry = toY * retreatWeight + perpY * enemy.flankSign * 0.85;
      var rLen = Math.hypot(rx, ry) || 1;
      enemy.cachedSteering = {
        moveVx: (rx / rLen) * enemy.speed * 0.72,
        moveVy: (ry / rLen) * enemy.speed * 0.72,
        allowAttack: false,
        speedMult: 0.72,
        role: 'RECOVER'
      };
      return enemy.cachedSteering;
    }

    var aggro = net.aggressionMult * (this.table4Rooms.alertMultiplier || 1.0) * (q.justiceClemencyActive ? 0.88 : (q.brotherEyeAggressive ? 1.10 : 1.0));
    if (o.syncExceptionActive) aggro *= 1.16;

    // Asignación de roles por sub-colmena ("andá vos primero, yo flanqueo / cerramos esquina")
    if (enemy.hiveType === 'MELEE' || enemy.hiveType === 'ELITE') {
      if (q.vanguardSlotOpen || enemy.hiveRole === 'VANGUARD' || o.syncExceptionActive) {
        enemy.hiveRole = 'VANGUARD';
      } else {
        enemy.hiveRole = enemy.flankSign > 0 ? 'FLANK_RIGHT' : 'FLANK_LEFT';
      }

      // Mini-acelerón táctico de cierre (consume estamina) si el jugador está arrinconado o sin estamina
      if ((q.playerCornered || q.playerStaminaEmpty || o.syncExceptionActive) && dist > 65 && dist < 240 && enemy.stamina >= 30 && (!enemy.hiveLungeCooldown || enemy.hiveLungeCooldown <= 0)) {
        if (typeof enemy.consumeStamina === 'function') enemy.consumeStamina(18, 0.9);
        enemy.hiveLungeTimer = 0.28;
        enemy.hiveLungeCooldown = 2.6;
      }

      if (enemy.hiveRole === 'VANGUARD') {
        var weaveScale = q.playerUsingRangedOrBeam ? 0.88 : 0.55;
        var wave = Math.sin((enemy.aiTimer || 0) * (enemy.waveFrequency || 6)) * ((enemy.waveAmplitude || 120) * weaveScale);
        enemy.cachedSteering = {
          moveVx: toX * enemy.speed * aggro + perpX * wave,
          moveVy: toY * enemy.speed * aggro + perpY * wave,
          allowAttack: true,
          speedMult: aggro,
          role: enemy.hiveRole
        };
      } else {
        // Flanqueo hacia la dirección de esquiva predicha o cierre en tenaza si está arrinconado
        var flankAngle = enemy.flankSign * (q.playerCornered ? 0.85 : (dist > 170 ? 0.68 : 0.35));
        var fx = toX * Math.cos(flankAngle) - toY * Math.sin(flankAngle);
        var fy = toX * Math.sin(flankAngle) + toY * Math.cos(flankAngle);
        enemy.cachedSteering = {
          moveVx: fx * enemy.speed * 1.02 * aggro,
          moveVy: fy * enemy.speed * 1.02 * aggro,
          allowAttack: true,
          speedMult: 1.02 * aggro,
          role: enemy.hiveRole
        };
      }
    } else if (enemy.hiveType === 'RANGED') {
      enemy.hiveRole = 'SUPPORT_RANGED';
      var prefDist = enemy.preferredDistance || 295;
      var strafe = perpX * enemy.flankSign * 0.48;
      var strafeY = perpY * enemy.flankSign * 0.48;
      var radial = 0;
      if (dist < prefDist - 35) radial = -0.95;
      else if (dist > prefDist + 55) radial = 0.85;
      var mx = toX * radial + strafe;
      var my = toY * radial + strafeY;
      var mLen = Math.hypot(mx, my) || 1;
      var rSpd = (radial === 0 ? 0.55 : 0.95) * enemy.speed * aggro;
      enemy.cachedSteering = {
        moveVx: (mx / mLen) * rSpd,
        moveVy: (my / mLen) * rSpd,
        allowAttack: true,
        speedMult: aggro,
        role: enemy.hiveRole
      };
    } else if (enemy.hiveType === 'CHARGER') {
      enemy.hiveRole = q.playerStaminaEmpty || o.syncExceptionActive ? 'VANGUARD' : 'QUEUE_CHARGE';
      var cAngle = enemy.hiveRole === 'VANGUARD' ? 0 : enemy.flankSign * 0.32;
      var cx = toX * Math.cos(cAngle) - toY * Math.sin(cAngle);
      var cy = toX * Math.sin(cAngle) + toY * Math.cos(cAngle);
      enemy.cachedSteering = {
        moveVx: cx * enemy.speed * aggro,
        moveVy: cy * enemy.speed * aggro,
        allowAttack: true,
        speedMult: aggro,
        role: enemy.hiveRole
      };
    }

    return enemy.cachedSteering;
  };

  /**
   * Calcula un vector de disparo predictivo (lead shot) usando la tendencia del Oráculo
   * o la velocidad instantánea del jugador sin añadir carga pesada por enemigo.
   */
  HiveMindEngine.prototype.getPredictiveAim = function (shooter, player, projSpeed) {
    var dx = player.x - shooter.x;
    var dy = player.y - shooter.y;
    var dist = Math.hypot(dx, dy) || 1;
    var baseX = dx / dist;
    var baseY = dy / dist;

    var o = this.oracle;
    var useLead = o.syncExceptionActive || o.q.hiveBelow50Pct || shooter.isLastSurvivor || Boolean(o.predictableDashAxis);
    if (!useLead || dist < 70) {
      return { x: baseX, y: baseY };
    }

    var vx = typeof player.vx === 'number' ? player.vx : 0;
    var vy = typeof player.vy === 'number' ? player.vy : 0;
    if (vx === 0 && vy === 0 && o.predictableDashAxis) {
      if (o.predictableDashAxis === 'RIGHT') vx = 180;
      else if (o.predictableDashAxis === 'LEFT') vx = -180;
      else if (o.predictableDashAxis === 'DOWN') vy = 180;
      else if (o.predictableDashAxis === 'UP') vy = -180;
    }

    var travelT = clamp(dist / Math.max(120, projSpeed || 300), 0.05, 0.75);
    var leadWeight = o.syncExceptionActive ? 0.65 : 0.42;
    var predX = (player.x + vx * travelT * leadWeight) - shooter.x;
    var predY = (player.y + vy * travelT * leadWeight) - shooter.y;
    var pLen = Math.hypot(predX, predY) || 1;
    return { x: predX / pLen, y: predY / pLen };
  };

  /**
   * Factor de aceleración de enfriamiento para Jefes cuando la Colmena detecta presión alta.
   */
  HiveMindEngine.prototype.getBossPressureMult = function (boss) {
    if (!boss || boss.isExhausted) return 1.0;
    var o = this.oracle;
    var q = o.q;
    if (o.syncExceptionActive || q.playerStaminaEmpty || q.playerCornered || q.playerStaminaLow) {
      return 1.24;
    }
    return this.table4Rooms.alertMultiplier > 1.08 ? 1.10 : 1.0;
  };

  /**
   * Mini destello general de color rojo cuando salta una Excepción de Sincronía.
   * Sin texto en Canvas (cumple regla inviolable).
   */
  HiveMindEngine.prototype.drawOverlay = function (ctx, room) {
    if (!ctx || !room) return;
    var o = this.oracle;
    if (o.redFlashTimer > 0) {
      var b = room.bounds || { left: 48, top: 48, width: 864, height: 544 };
      var ratio = clamp(o.redFlashTimer / Math.max(0.01, o.redFlashDuration), 0, 1);
      ctx.save();
      ctx.fillStyle = 'rgba(220, 38, 38, ' + (0.16 * ratio).toFixed(3) + ')';
      ctx.fillRect(b.left, b.top, b.width, b.height);
      ctx.strokeStyle = 'rgba(248, 113, 113, ' + (0.75 * ratio).toFixed(3) + ')';
      ctx.lineWidth = 4;
      ctx.strokeRect(b.left + 2, b.top + 2, b.width - 4, b.height - 4);
      ctx.restore();
    }
  };

  HiveMindEngine.prototype.getTelemetry = function () {
    var total = Math.max(1, this.stats.totalTicks);
    var cpuSavedPct = Math.round((this.stats.skippedTicks / total) * 100);
    return {
      oracle: this.oracle,
      table4Rooms: this.table4Rooms,
      subHives: this.subHives,
      interHiveNetwork: this.interHiveNetwork,
      stats: {
        totalTicks: this.stats.totalTicks,
        evaluatedTicks: this.stats.evaluatedTicks,
        skippedTicks: this.stats.skippedTicks,
        syncForcedTicks: this.stats.syncForcedTicks,
        cpuSavedPct: cpuSavedPct
      }
    };
  };

  return new HiveMindEngine();
}));
