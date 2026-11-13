/**
 * ============================================================================
 * EVENTS.JS - SALAS DE DESAFÍO, MONOLITOS DE HORDAS Y ALTARES DE SANGRE (v2.5)
 * ============================================================================
 * Dota a las incursiones de eventos de alto riesgo y alta recompensa:
 *  1. Monolito de Desafío (ChallengeMonolith):
 *     - Bloquea las puertas y desata 2 oleadas de élites rabiosos.
 *     - Al sobrevivir, otorga el Cofre del Gran Campeón (Oro masivo, Gemas y Reliquia).
 *  2. Altar del Pacto de Sangre (BloodPactAltar):
 *     - Sacrifica 20 HP por un +35% de Daño de Ataque permanente para toda la partida.
 *
 * REGLA INVIOLABLE: Cero llamadas de texto a Canvas API.
 * ============================================================================
 */

var BaseEntity = window.BaseEntity || (typeof Entity !== 'undefined' ? Entity : class {
  constructor(x = 0, y = 0, radius = 10, color = '#ffffff') {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.color = color;
    this.markedForDeletion = false;
  }
  update(dt) {}
  draw(ctx) {}
});
window.BaseEntity = BaseEntity;

/**
 * Cofre del Gran Campeón (ChampionChest)
 * Recompensa gloriosa al superar el Monolito de Desafío de Élites.
 */
var ChampionChest = class ChampionChest extends BaseEntity {
  constructor(x, y) {
    super(x, y, 24, '#eab308');
    this.opened = false;
    this.pulseTimer = 0;
  }

  update(dt, player, room) {
    this.pulseTimer += dt * 3.5;
    if (this.opened || !player || !room) return;

    // Obstáculo físico: el jugador no puede atravesar el cofre
    const d = Math.hypot(player.x - this.x, player.y - this.y);
    const minDist = this.radius + player.radius;
    if (d < minDist) {
      const overlap = minDist - d;
      if (d > 0.0001) {
        player.x += ((player.x - this.x) / d) * overlap;
        player.y += ((player.y - this.y) / d) * overlap;
      } else {
        player.x += minDist;
      }
    }
  }

  open(player, room) {
    if (this.opened) return;
    this.opened = true;

    // 1. Economía masiva (50 Oro + 25 Gemas directas)
    player.coins = (player.coins || 0) + 50;
    if (window.metaProgression) {
      window.metaProgression.addShards(25);
    }
    if (player.ui) {
      player.ui.updateCoins(player.coins);
      player.ui.updateShards();
    }

    // 2. Pedestal de Reliquia Suprema garantizado en la sala
    const PedestalClass = window.ItemPedestal || (typeof ItemPedestal !== 'undefined' ? ItemPedestal : null);
    if (PedestalClass && room && room.pedestals) {
      room.pedestals.push(new PedestalClass(this.x, this.y - 45));
    } else if (player.itemManager) {
      player.itemManager.grantRandomRelic();
    }

    // 3. Spawns físicos de botín en el suelo (2 Monedas grandes, 2 Gemas del Vacío, 1 Corazón)
    const CoinClass = window.Coin || (typeof Coin !== 'undefined' ? Coin : null);
    const VoidGemClass = window.VoidGem || (typeof VoidGem !== 'undefined' ? VoidGem : null);
    const HeartClass = window.HeartItem || (typeof HeartItem !== 'undefined' ? HeartItem : null);

    if (room) {
      if (CoinClass && room.coins) {
        room.coins.push(new CoinClass(this.x - 28, this.y + 16));
        room.coins.push(new CoinClass(this.x + 28, this.y + 16));
      }
      if (VoidGemClass && room.coins) {
        room.coins.push(new VoidGemClass(this.x - 14, this.y + 24, 2));
        room.coins.push(new VoidGemClass(this.x + 14, this.y + 24, 2));
      }
      if (HeartClass && room.hearts) {
        room.hearts.push(new HeartClass(this.x, this.y + 30));
      }
    }

    // 4. Game Juice, Sonidos y Sacudida
    if (typeof soundManager !== 'undefined' && soundManager) {
      soundManager.playProcedural('pedestal', { volume: 1.0 });
      soundManager.playProcedural('coin', { volume: 0.9 });
      soundManager.playProcedural('key', { volume: 0.8 });
    }

    if (window.activeGameInstance) {
      window.activeGameInstance.triggerScreenShake(7, 0.25);
    }

    if (player.ui) {
      player.ui.showToast('🏆 ¡COFRE DEL CAMPEÓN! +50 Oro, +25 Gemas y Reliquia Suprema');
      player.ui.spawnFloatingText('★ BOTÍN DEL GRAN CAMPEÓN ★', '#facc15', this.x, this.y - 30);
      player.ui.spawnFloatingText('+50 🪙 | +25 💎', '#fbbf24', this.x, this.y - 50);
    }

    // 5. Explosión de partículas doradas y arcanas
    if (room && typeof room.spawnParticle === 'function') {
      for (let i = 0; i < 40; i++) {
        const ang = (i * Math.PI * 2) / 40;
        const spd = 100 + Math.random() * 160;
        room.spawnParticle(this.x, this.y, Math.cos(ang) * spd, Math.sin(ang) * spd, 5, '#facc15', 0.8);
        room.spawnParticle(this.x, this.y, Math.cos(ang) * (spd * 0.7), Math.sin(ang) * (spd * 0.7), 4, '#c084fc', 0.7);
      }
    }
  }

  draw(ctx) {
    ctx.save();
    const floatY = this.opened ? 0 : Math.sin(this.pulseTimer) * 3;

    // Resplandor dorado circular en el suelo
    ctx.beginPath();
    ctx.arc(this.x, this.y + floatY, this.radius + 12, 0, Math.PI * 2);
    ctx.fillStyle = this.opened ? 'rgba(234, 179, 8, 0.12)' : 'rgba(234, 179, 8, 0.30)';
    ctx.fill();

    // Cuerpo del cofre de campeón
    ctx.fillStyle = '#854d0e';
    ctx.strokeStyle = this.opened ? '#ca8a04' : '#fef08a';
    ctx.lineWidth = 3;
    ctx.fillRect(this.x - 22, this.y - 14 + floatY, 44, 28);
    ctx.strokeRect(this.x - 22, this.y - 14 + floatY, 44, 28);

    // Decoración de herrajes dorados
    ctx.fillStyle = '#facc15';
    ctx.fillRect(this.x - 18, this.y - 14 + floatY, 6, 28);
    ctx.fillRect(this.x + 12, this.y - 14 + floatY, 6, 28);

    if (this.opened) {
      // Tapa abierta hacia arriba con tesoro brillando
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(this.x - 20, this.y - 24, 40, 10);
      ctx.strokeRect(this.x - 20, this.y - 24, 40, 10);

      // Resplandor interior
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(this.x - 12, this.y - 10, 24, 8);
    } else {
      // Corona ornamental dorada en la cerradura
      ctx.beginPath();
      ctx.moveTo(this.x - 7, this.y - 2 + floatY);
      ctx.lineTo(this.x - 5, this.y - 8 + floatY);
      ctx.lineTo(this.x, this.y - 4 + floatY);
      ctx.lineTo(this.x + 5, this.y - 8 + floatY);
      ctx.lineTo(this.x + 7, this.y - 2 + floatY);
      ctx.closePath();
      ctx.fillStyle = '#fde047';
      ctx.fill();
      ctx.strokeStyle = '#a16207';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Cerrojo dorado
      ctx.fillStyle = '#facc15';
      ctx.fillRect(this.x - 5, this.y - 2 + floatY, 10, 8);
      ctx.fillStyle = '#451a03';
      ctx.fillRect(this.x - 2, this.y + floatY, 4, 4);
    }

    ctx.restore();
  }
};

/**
 * Monolito de Desafío de Hordas Élite (ChallengeMonolith)
 * Permite desatar 2 oleadas de élites reales con botín supremo.
 */
var ChallengeMonolith = class ChallengeMonolith extends BaseEntity {
  constructor(x, y) {
    super(x, y, 26, '#dc2626');
    this.isActive = false;
    this.completed = false;
    this.wave = 0; // 0: Inactivo, 1: Ola 1, 2: Ola 2, 3: Victoria
    this.state = 'IDLE'; // 'IDLE', 'PRE_WAVE_1', 'WAVE_1', 'BREATHER_W2', 'PRE_WAVE_2', 'WAVE_2', 'COMPLETED'
    this.timer = 0;
    this.waveEnemies = [];
    this.spawnPortals = []; // { x, y, timer, maxTimer, radius, color }
    this.pulseTimer = 0;
  }

  update(dt, player, room) {
    this.pulseTimer += dt * 4;
    if (this.completed || !player || !room) return;

    // Obstáculo físico: colisión sólida para no atravesar el monolito
    const d = Math.hypot(player.x - this.x, player.y - this.y);
    const minDist = this.radius + player.radius;
    if (d < minDist) {
      const overlap = minDist - d;
      if (d > 0.0001) {
        player.x += ((player.x - this.x) / d) * overlap;
        player.y += ((player.y - this.y) / d) * overlap;
      } else {
        player.x += minDist;
      }
    }

    // Actualizar marcadores visuales de portales de teletransporte
    for (const portal of this.spawnPortals) {
      portal.timer -= dt;
      portal.pulse = (portal.pulse || 0) + dt * 8;
    }
    this.spawnPortals = this.spawnPortals.filter(p => p.timer > 0);

    if (!this.isActive) return;

    // Control de máquina de estados del Desafío
    if (this.state === 'PRE_WAVE_1') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.spawnWave1(room, player);
      }
    } else if (this.state === 'WAVE_1') {
      // Filtrar enemigos vivos de la Ola 1
      this.waveEnemies = this.waveEnemies.filter(e => !e.markedForDeletion && e.hp > 0 && room.enemies.includes(e));
      if (this.waveEnemies.length === 0) {
        // Ola 1 derrotada! Dar un respiro de 1.4s antes de la Ola 2
        this.state = 'BREATHER_W2';
        this.timer = 1.4;
        if (player.ui) {
          player.ui.showToast('⚔️ ¡OLA 1 SUPERADA! Prepárate para los Colosos del Abismo...');
          player.ui.spawnFloatingText('★ OLA 1 SUPERADA ★', '#facc15', this.x, this.y - 35);
        }
        if (typeof soundManager !== 'undefined' && soundManager) {
          soundManager.playProcedural('pedestal', { volume: 0.8 });
        }
        if (window.activeGameInstance) {
          window.activeGameInstance.triggerScreenShake(6, 0.2);
        }
      }
    } else if (this.state === 'BREATHER_W2') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = 'PRE_WAVE_2';
        this.timer = 0.9;
        this.prepareWave2Portals(room, player);
      }
    } else if (this.state === 'PRE_WAVE_2') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.spawnWave2(room, player);
      }
    } else if (this.state === 'WAVE_2') {
      // Filtrar enemigos vivos de la Ola 2
      this.waveEnemies = this.waveEnemies.filter(e => !e.markedForDeletion && e.hp > 0 && room.enemies.includes(e));
      // También asegurarse de que si había enemigos previos de la sala, deban ser derrotados
      const livingRoomEnemies = room.enemies.filter(e => !e.markedForDeletion && e.hp > 0);
      if (this.waveEnemies.length === 0 && livingRoomEnemies.length === 0) {
        this.completeChallenge(room, player);
      }
    }
  }

  interact(player, room) {
    if (this.completed || this.isActive) return;
    this.activate(room, player);
  }

  activate(room, player) {
    this.isActive = true;
    this.wave = 1;
    this.state = 'PRE_WAVE_1';
    this.timer = 0.9; // 0.9s de anticipación con portales visuales

    // 1. Sellar las puertas de la habitación
    room.cleared = false;

    // 2. Banner y sonido
    if (player.ui) {
      player.ui.showToast('⚔️ ¡DESAFÍO DE HORDAS ÉLITE INICIADO! Sobrevive a 2 Oleadas de Campeones');
      player.ui.spawnFloatingText('⚔️ ¡DESAFÍO DE ÉLITES! ⚔️', '#ef4444', this.x, this.y - 35);
    }
    if (typeof soundManager !== 'undefined' && soundManager) {
      soundManager.playProcedural('hurt', { volume: 0.9 });
    }
    if (window.activeGameInstance) {
      window.activeGameInstance.triggerScreenShake(12, 0.45);
    }

    // 3. Partículas iniciales en el monolito
    for (let i = 0; i < 30; i++) {
      const ang = (i * Math.PI * 2) / 30;
      const spd = 80 + Math.random() * 120;
      room.spawnParticle(this.x, this.y, Math.cos(ang) * spd, Math.sin(ang) * spd, 5, '#ef4444', 0.6);
    }

    // 4. Preparar portales de invocación de la Ola 1
    this.prepareWave1Portals(room, player);
  }

  getSafeArenaSpawns(room, count) {
    const b = room.bounds || { left: 100, right: 800, top: 100, bottom: 600, centerX: 450, centerY: 350 };
    const pad = 90;
    const candidates = [
      { x: b.left + pad, y: b.top + pad },
      { x: b.right - pad, y: b.top + pad },
      { x: b.left + pad, y: b.bottom - pad },
      { x: b.right - pad, y: b.bottom - pad },
      { x: b.centerX - 160, y: b.centerY },
      { x: b.centerX + 160, y: b.centerY }
    ];
    return candidates.slice(0, count);
  }

  prepareWave1Portals(room, player) {
    const spawns = this.getSafeArenaSpawns(room, 4);
    this.spawnPortals = spawns.map(pos => ({
      x: pos.x,
      y: pos.y,
      timer: 0.9,
      maxTimer: 0.9,
      radius: 26,
      color: '#ef4444'
    }));
  }

  spawnWave1(room, player) {
    this.state = 'WAVE_1';
    this.waveEnemies = [];

    const EliteClass = window.EliteEnemy || (typeof EliteEnemy !== 'undefined' ? EliteEnemy : null);
    const ChargerClass = window.ChargerEnemy || (typeof ChargerEnemy !== 'undefined' ? ChargerEnemy : null);
    const ShooterClass = window.ShooterEnemy || (typeof ShooterEnemy !== 'undefined' ? ShooterEnemy : null);
    const FallbackClass = window.Enemy || (typeof Enemy !== 'undefined' ? Enemy : null);

    const spawns = this.getSafeArenaSpawns(room, 4);
    const sec = room.sectionNumber || 1;
    const lvl = room.levelNumber || 1;

    // 2 Élites Reales con corona y stats multiplicadas
    if (EliteClass) {
      const e1 = new EliteClass(spawns[0].x, spawns[0].y, sec, lvl);
      const e2 = new EliteClass(spawns[1].x, spawns[1].y, sec, lvl);
      e1.speed = Math.min(320, e1.speed * 1.15);
      e2.speed = Math.min(320, e2.speed * 1.15);
      room.enemies.push(e1, e2);
      this.waveEnemies.push(e1, e2);
    } else if (FallbackClass) {
      const e1 = new FallbackClass(spawns[0].x, spawns[0].y, sec, lvl, 'ERRATIC');
      const e2 = new FallbackClass(spawns[1].x, spawns[1].y, sec, lvl, 'ERRATIC');
      room.enemies.push(e1, e2);
      this.waveEnemies.push(e1, e2);
    }

    // 1 Charger Enemy (Embestidor rápido)
    if (ChargerClass) {
      const c = new ChargerClass(spawns[2].x, spawns[2].y, sec, lvl);
      c.speed = Math.min(340, c.speed * 1.2);
      room.enemies.push(c);
      this.waveEnemies.push(c);
    }

    // 1 Shooter Enemy (Francotirador de apoyo)
    if (ShooterClass) {
      const s = new ShooterClass(spawns[3].x, spawns[3].y, sec, lvl);
      room.enemies.push(s);
      this.waveEnemies.push(s);
    }

    // Ajuste dinámico de BrotherEye a cada enemigo de la horda
    if (typeof BrotherEye !== 'undefined' && BrotherEye.enabled) {
      for (const mob of this.waveEnemies) {
        BrotherEye.tuneSpawnedEnemy(mob);
      }
    }

    // Sacudida, sonido y partículas de teletransporte
    if (window.activeGameInstance) {
      window.activeGameInstance.triggerScreenShake(8, 0.3);
    }
    if (typeof soundManager !== 'undefined' && soundManager) {
      soundManager.playProcedural('break_rock', { volume: 0.85 });
    }

    for (const pos of spawns) {
      for (let i = 0; i < 15; i++) {
        const ang = Math.random() * Math.PI * 2;
        room.spawnParticle(pos.x, pos.y, Math.cos(ang) * 110, Math.sin(ang) * 110, 4.5, '#ef4444', 0.5);
      }
    }
  }

  prepareWave2Portals(room, player) {
    if (player && player.ui) {
      player.ui.showToast('⚠️ ¡OLA FINAL! 2 Colosos Élite y Acechadores emergen');
      player.ui.spawnFloatingText('⚠️ ¡COLOSOS ÉLITE! ⚠️', '#dc2626', this.x, this.y - 35);
    }
    const b = room.bounds || { left: 100, right: 800, top: 100, bottom: 600, centerX: 450, centerY: 350 };
    const spawns = [
      { x: b.centerX - 140, y: b.centerY },
      { x: b.centerX + 140, y: b.centerY },
      { x: b.centerX, y: b.top + 80 },
      { x: b.centerX, y: b.bottom - 80 }
    ];
    this.spawnPortals = spawns.map(pos => ({
      x: pos.x,
      y: pos.y,
      timer: 0.9,
      maxTimer: 0.9,
      radius: 32,
      color: '#a855f7'
    }));
  }

  spawnWave2(room, player) {
    this.wave = 2;
    this.state = 'WAVE_2';
    this.waveEnemies = [];

    const EliteClass = window.EliteEnemy || (typeof EliteEnemy !== 'undefined' ? EliteEnemy : null);
    const FlyerClass = window.FlyerEnemy || (typeof FlyerEnemy !== 'undefined' ? FlyerEnemy : null);
    const SplitterClass = window.SplitterEnemy || (typeof SplitterEnemy !== 'undefined' ? SplitterEnemy : null);
    const FallbackClass = window.Enemy || (typeof Enemy !== 'undefined' ? Enemy : null);

    const b = room.bounds || { left: 100, right: 800, top: 100, bottom: 600, centerX: 450, centerY: 350 };
    const spawns = [
      { x: b.centerX - 140, y: b.centerY },
      { x: b.centerX + 140, y: b.centerY },
      { x: b.centerX, y: b.top + 80 },
      { x: b.centerX, y: b.bottom - 80 }
    ];
    const sec = room.sectionNumber || 1;
    const lvl = room.levelNumber || 1;

    // 2 Colosos Élite Titan (radio 24, +60% HP, corona dorada)
    if (EliteClass) {
      const boss1 = new EliteClass(spawns[0].x, spawns[0].y, sec, lvl);
      const boss2 = new EliteClass(spawns[1].x, spawns[1].y, sec, lvl);
      boss1.radius = 24;
      boss1.maxHp = Math.round(boss1.maxHp * 1.6);
      boss1.hp = boss1.maxHp;
      boss1.color = '#7e22ce';

      boss2.radius = 24;
      boss2.maxHp = Math.round(boss2.maxHp * 1.6);
      boss2.hp = boss2.maxHp;
      boss2.color = '#7e22ce';

      room.enemies.push(boss1, boss2);
      this.waveEnemies.push(boss1, boss2);
    } else if (FallbackClass) {
      const boss1 = new FallbackClass(spawns[0].x, spawns[0].y, sec, lvl, 'ERRATIC');
      const boss2 = new FallbackClass(spawns[1].x, spawns[1].y, sec, lvl, 'ERRATIC');
      room.enemies.push(boss1, boss2);
      this.waveEnemies.push(boss1, boss2);
    }

    // 2 Apoyos ágiles (Flyer o Splitter)
    if (FlyerClass) {
      const f1 = new FlyerClass(spawns[2].x, spawns[2].y, sec, lvl);
      room.enemies.push(f1);
      this.waveEnemies.push(f1);
    }
    if (SplitterClass) {
      const s1 = new SplitterClass(spawns[3].x, spawns[3].y, sec, lvl, false);
      room.enemies.push(s1);
      this.waveEnemies.push(s1);
    }

    // Ajuste dinámico de BrotherEye a la ola final
    if (typeof BrotherEye !== 'undefined' && BrotherEye.enabled) {
      for (const mob of this.waveEnemies) {
        BrotherEye.tuneSpawnedEnemy(mob);
      }
    }

    // Tremor de pantalla y sonido de impacto brutal
    if (window.activeGameInstance) {
      window.activeGameInstance.triggerScreenShake(14, 0.45);
    }
    if (typeof soundManager !== 'undefined' && soundManager) {
      soundManager.playProcedural('explosion', { volume: 0.9 });
    }

    for (const pos of spawns) {
      for (let i = 0; i < 20; i++) {
        const ang = Math.random() * Math.PI * 2;
        room.spawnParticle(pos.x, pos.y, Math.cos(ang) * 130, Math.sin(ang) * 130, 5, '#a855f7', 0.6);
      }
    }
  }

  completeChallenge(room, player) {
    this.completed = true;
    this.isActive = false;
    this.state = 'COMPLETED';
    this.wave = 3;

    // 1. Desbloquear las puertas de la habitación
    room.cleared = true;

    // 2. Spawnear Cofre del Gran Campeón en el centro
    room.hazards = room.hazards.filter(h => h !== this);
    const chest = new ChampionChest(this.x, this.y);
    room.hazards.push(chest);

    // 3. Notificar a BrotherEye, Arquetipos y Auto-Guardado
    if (typeof BrotherEye !== 'undefined' && BrotherEye.enabled) {
      BrotherEye.onRoomExited(room, player, true);
    }
    if (window.PIG_ARCHETYPES && player && player.archetype && window.PIG_ARCHETYPES[player.archetype]?.onRoomCleared) {
      window.PIG_ARCHETYPES[player.archetype].onRoomCleared(player, room);
    }
    if (window.RunSaveManager && window.activeGameInstance) {
      window.RunSaveManager.save(window.activeGameInstance);
    }

    // 4. Banner de victoria y Game Juice
    if (player && player.ui) {
      player.ui.showToast('👑 ¡DESAFÍO SUPERADO! Abre el Cofre del Gran Campeón [E]');
      player.ui.spawnFloatingText('👑 ¡DESAFÍO SUPERADO! 👑', '#facc15', this.x, this.y - 35);
      player.ui.updateRoomInfo(room, window.activeGameInstance ? window.activeGameInstance.currentFloor : null);
    }

    if (window.activeGameInstance) {
      window.activeGameInstance.triggerScreenShake(10, 0.4);
    }
    if (typeof soundManager !== 'undefined' && soundManager) {
      soundManager.playProcedural('pedestal', { volume: 1.0 });
      soundManager.playProcedural('coin', { volume: 0.8 });
    }

    // 5. Celebración visual con fuegos artificiales de partículas
    for (let i = 0; i < 45; i++) {
      const ang = (i * Math.PI * 2) / 45;
      const spd = 120 + Math.random() * 180;
      room.spawnParticle(this.x, this.y, Math.cos(ang) * spd, Math.sin(ang) * spd, 5.5, '#fbbf24', 0.8);
      room.spawnParticle(this.x, this.y, Math.cos(ang) * (spd * 0.6), Math.sin(ang) * (spd * 0.6), 4.5, '#ef4444', 0.8);
    }
  }

  draw(ctx) {
    if (this.completed) return;
    ctx.save();
    const floatY = Math.sin(this.pulseTimer) * 4;

    // Dibujar portales de invocación que se estén cargando
    for (const portal of this.spawnPortals) {
      const progress = 1 - Math.max(0, portal.timer / portal.maxTimer);
      const pulse = Math.sin(portal.pulse || 0) * 3;
      const r = (portal.radius * progress) + pulse;

      ctx.beginPath();
      ctx.arc(portal.x, portal.y, Math.max(4, r), 0, Math.PI * 2);
      ctx.strokeStyle = portal.color || '#ef4444';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(portal.x, portal.y, Math.max(2, r * 0.5), 0, Math.PI * 2);
      ctx.fillStyle = portal.color || '#ef4444';
      ctx.globalAlpha = 0.25 * progress;
      ctx.fill();
      ctx.globalAlpha = 1.0;
    }

    // Aura carmesí alrededor del monolito
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius + 14, 0, Math.PI * 2);
    ctx.fillStyle = this.isActive ? 'rgba(239, 68, 68, 0.35)' : 'rgba(220, 38, 38, 0.18)';
    ctx.fill();

    // Columna de obsidiana
    ctx.fillStyle = '#1e1b4b';
    ctx.strokeStyle = this.isActive ? '#ef4444' : '#f87171';
    ctx.lineWidth = 3;
    ctx.fillRect(this.x - 16, this.y - 30 + floatY, 32, 60);
    ctx.strokeRect(this.x - 16, this.y - 30 + floatY, 32, 60);

    // Ojo rúnico central
    ctx.beginPath();
    ctx.arc(this.x, this.y + floatY, 7, 0, Math.PI * 2);
    ctx.fillStyle = this.isActive ? '#facc15' : '#ef4444';
    ctx.fill();

    // Anillo exterior de runas cuando está activo
    if (this.isActive) {
      ctx.beginPath();
      ctx.arc(this.x, this.y + floatY, 18, 0, Math.PI * 2);
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  }
};

/**
 * Altar del Pacto de Sangre (BloodPactAltar)
 */
var BloodPactAltar = class BloodPactAltar extends BaseEntity {
  constructor(x, y) {
    super(x, y, 28, '#991b1b');
    this.consumed = false;
    this.pulseTimer = 0;
  }

  update(dt, player, room) {
    this.pulseTimer += dt * 3.5;
    if (this.consumed || !player || !room) return;
    // Estado de espera para interacción voluntaria [E] o click.
    // Ya no se auto-sacrifica al pasar corriendo.
  }

  activate(player, room) {
    if (this.consumed || !player || !room) return;

    if (player.hp > 20) {
      this.consumed = true;
      // Cobrar el tributo de sangre (20 HP)
      player.takeDamage(20, room, { isProjectile: false });

      // Otorgar buff permanente de +35% Daño sobre la base persistente de la run
      player.shopDamageMultiplier = Number(((player.shopDamageMultiplier || 1.0) * 1.35).toFixed(2));
      if (player.itemManager) {
        player.itemManager.applyPassiveStats();
      } else {
        player.damageMultiplier = Number(((player.damageMultiplier || 1.0) * 1.35).toFixed(2));
      }

      if (typeof soundManager !== 'undefined' && soundManager) {
        soundManager.playProcedural('hurt');
      }
      if (player.ui) {
        player.ui.showToast('🩸 ¡PACTO DE SANGRE CONSUMADO! Sacrificaste 20 HP por +35% Daño Permanente');
        player.ui.spawnFloatingText('+35% DAÑO PERMANENTE', '#ef4444', this.x, this.y - 30);
        player.ui.updateHealth(player);
        player.ui.updateStats(player);
      }

      if (window.CombatSystem) {
        window.CombatSystem.triggerScreenShake(15, 0.5);
      }

      for (let i = 0; i < 30; i++) {
        const ang = (i * Math.PI * 2) / 30;
        const spd = 90 + Math.random() * 140;
        room.spawnParticle(this.x, this.y, Math.cos(ang) * spd, Math.sin(ang) * spd, 5, '#dc2626', 0.65);
      }
    } else if (player.ui) {
      if (typeof soundManager !== 'undefined' && soundManager) {
        soundManager.playProcedural('hurt');
      }
      player.ui.showToast('⚠️ ¡VIDA INSUFICIENTE! Necesitas más de 20 HP para sellar el pacto');
      player.ui.spawnFloatingText('⚠️ VIDA INSUFICIENTE', '#ef4444', this.x, this.y - 25);
    }
  }

  interact(player, room) {
    this.activate(player, room);
  }

  draw(ctx) {
    if (this.consumed) return;
    ctx.save();
    const floatY = Math.sin(this.pulseTimer) * 3;

    // Aura oscura y carmesí
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius + 12, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(153, 27, 27, 0.28)';
    ctx.fill();

    // Pedestal de sangre
    ctx.fillStyle = '#450a0a';
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3;
    ctx.fillRect(this.x - 22, this.y - 12 + floatY, 44, 24);
    ctx.strokeRect(this.x - 22, this.y - 12 + floatY, 44, 24);

    // Cáliz flotante
    ctx.beginPath();
    ctx.arc(this.x, this.y - 18 + floatY, 10, 0, Math.PI);
    ctx.fillStyle = '#dc2626';
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

window.ChallengeMonolith = ChallengeMonolith;
window.ChampionChest = ChampionChest;
window.BloodPactAltar = BloodPactAltar;
