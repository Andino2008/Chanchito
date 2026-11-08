/**
 * ============================================================================
 * EVENTS.JS - SALAS DE DESAFÍO, MONOLITOS DE HORDAS Y ALTARES DE SANGRE (v2.5)
 * ============================================================================
 * Dota a las incursiones de eventos de alto riesgo y alta recompensa:
 *  1. Monolito de Desafío (ChallengeMonolith):
 *     - Bloquea las puertas y desata 2 oleadas de élites rabiosos.
 *     - Al sobrevivir, otorga el Cofre del Gran Campeón (Oro masivo, Gemas y Reliquia).
 *  2. Altar del Pacto de Sangre (BloodPactAltar):
 *     - Sacrifica 25 HP por un +35% de Daño de Ataque permanente para toda la partida.
 *  3. Mímico de las Sombras (MimicChest):
 *     - Cofres trampa sorpresa que al morir entregan doble botín (2 Llaves + Reliquia).
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
 */
var ChampionChest = class ChampionChest extends BaseEntity {
  constructor(x, y) {
    super(x, y, 22, '#eab308');
    this.opened = false;
    this.pulseTimer = 0;
  }

  update(dt, player, room) {
    this.pulseTimer += dt * 3.5;
    if (this.opened || !player || !room) return;

    const d = Math.hypot(player.x - this.x, player.y - this.y);
    if (d <= this.radius + player.radius + 15) {
      const input = (player && player.input) || (window.activeGameInstance ? window.activeGameInstance.input : null);
    const pressedE = Boolean(input && input.keys && (input.keys.has('KeyE') || input.keys.has('Space')));
    if (pressedE || d <= this.radius + player.radius) {
        this.opened = true;

        // 1. Recompensa masiva de economía
        player.addCoins(45);
        if (window.metaprogressionManager) {
          window.metaprogressionManager.addGems(20);
        }

        // 2. Generar Pedestal de Reliquia garantizado
        if (typeof RelicPedestal !== 'undefined') {
          const relic = player.itemManager.drawRandomRelic();
          if (relic) {
            room.relicPedestals.push(new RelicPedestal(this.x, this.y, relic));
          }
        }

        // 3. Efectos y notificación
        if (player.ui) {
          player.ui.showToast('🏆 ¡COFRE DEL CAMPEÓN! +45 Oro, +20 Gemas y Reliquia Suprema');
        }

        for (let i = 0; i < 28; i++) {
          const ang = (i * Math.PI * 2) / 28;
          const spd = 80 + Math.random() * 120;
          room.spawnParticle(this.x, this.y, Math.cos(ang) * spd, Math.sin(ang) * spd, 4.5, '#facc15', 0.6);
        }
      }
    }
  }

  draw(ctx) {
    if (this.opened) return;
    ctx.save();
    const floatY = Math.sin(this.pulseTimer) * 3;

    // Resplandor dorado
    ctx.beginPath();
    ctx.arc(this.x, this.y + floatY, this.radius + 10, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(234, 179, 8, 0.22)';
    ctx.fill();

    // Cuerpo del cofre de campeón
    ctx.fillStyle = '#854d0e';
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 3;
    ctx.fillRect(this.x - 20, this.y - 14 + floatY, 40, 28);
    ctx.strokeRect(this.x - 20, this.y - 14 + floatY, 40, 28);

    // Corona superior
    ctx.fillStyle = '#eab308';
    ctx.fillRect(this.x - 8, this.y - 20 + floatY, 16, 6);
    ctx.restore();
  }
}

/**
 * Monolito de Desafío de Hordas (ChallengeMonolith)
 */
var ChallengeMonolith = class ChallengeMonolith extends BaseEntity {
  constructor(x, y) {
    super(x, y, 26, '#dc2626');
    this.isActive = false;
    this.completed = false;
    this.wave = 0; // 0: Listo, 1: Ola 1, 2: Ola 2, 3: Completado
    this.waveCheckTimer = 1.0;
    this.pulseTimer = 0;
  }

  update(dt, player, room) {
    this.pulseTimer += dt * 4;
    if (this.completed || !player || !room) return;

    if (!this.isActive) {
      // Estado de espera para interacción voluntaria [E] o click.
      // Ya no se auto-activa al pasar caminando para evitar combates accidentales.
    } else {
      // Combate activo: vigilar oleadas
      this.waveCheckTimer -= dt;
      if (this.waveCheckTimer <= 0) {
        this.waveCheckTimer = 0.5;

        const livingEnemies = room.enemies.filter(e => !e.markedForDeletion);
        if (livingEnemies.length === 0) {
          if (this.wave === 1) {
            // Iniciar Ola 2
            this.spawnWave2(room);
          } else if (this.wave === 2) {
            // Completado con éxito
            this.completeChallenge(room, player);
          }
        }
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
    this.waveCheckTimer = 1.0;

    // 1. Sellar las puertas de la sala
    room.cleared = false;

    // 2. Banner / Toast
    if (player.ui) {
      player.ui.showToast('⚔️ ¡DESAFÍO DE HORDAS INICIADO! Sobrevive a 2 oleadas de élites');
    }

    // 3. Sacudida de pantalla
    if (window.CombatSystem) {
      window.CombatSystem.triggerScreenShake(12, 0.4);
    }

    // 4. Spawn Ola 1 (4 Élites ágiles)
    this.spawnWave1(room);
  }

  spawnWave1(room) {
    if (!room) return;
    const bounds = room.bounds || { left: 100, right: 800, top: 100, bottom: 600 };
    const spawns = [
      { x: bounds.left + 80, y: bounds.top + 80 },
      { x: bounds.right - 80, y: bounds.top + 80 },
      { x: bounds.left + 80, y: bounds.bottom - 80 },
      { x: bounds.right - 80, y: bounds.bottom - 80 }
    ];

    for (const pos of spawns) {
      if (typeof FastMeleeEnemy !== 'undefined') {
        const mob = new FastMeleeEnemy(pos.x, pos.y, room.sectionNumber || 1, room.levelNumber || 1);
        mob.speed = Math.min(260, mob.speed * 1.25);
        room.enemies.push(mob);
      }
      for (let i = 0; i < 8; i++) {
        const ang = Math.random() * Math.PI * 2;
        room.spawnParticle(pos.x, pos.y, Math.cos(ang) * 90, Math.sin(ang) * 90, 4, '#ef4444', 0.4);
      }
    }
  }

  spawnWave2(room) {
    this.wave = 2;
    if (window.activeGameInstance && window.activeGameInstance.player && window.activeGameInstance.player.ui) {
      window.activeGameInstance.player.ui.showToast('⚠️ ¡OLA FINAL! 2 Campeones Colosales ingresan a la arena');
    }

    const bounds = room.bounds || { left: 100, right: 800, top: 100, bottom: 600 };
    const spawns = [
      { x: bounds.centerX - 120, y: bounds.centerY },
      { x: bounds.centerX + 120, y: bounds.centerY }
    ];

    for (const pos of spawns) {
      if (typeof TankEnemy !== 'undefined') {
        const mob = new TankEnemy(pos.x, pos.y, room.sectionNumber || 1, room.levelNumber || 1);
        mob.maxHp = Math.round(mob.maxHp * 1.4);
        mob.hp = mob.maxHp;
        room.enemies.push(mob);
      }
      for (let i = 0; i < 14; i++) {
        const ang = Math.random() * Math.PI * 2;
        room.spawnParticle(pos.x, pos.y, Math.cos(ang) * 120, Math.sin(ang) * 120, 5, '#dc2626', 0.5);
      }
    }
  }

  completeChallenge(room, player) {
    this.completed = true;
    this.isActive = false;

    // 1. Desbloquear las puertas
    room.cleared = true;

    // 2. Spawnear Cofre del Gran Campeón en el centro
    room.hazards = room.hazards.filter(h => h !== this);
    room.hazards.push(new ChampionChest(this.x, this.y));

    // 3. Toast de Victoria
    if (player && player.ui) {
      player.ui.showToast('👑 ¡DESAFÍO SUPERADO! Abre el Cofre del Campeón [E]');
    }

    // 4. Celebración visual
    for (let i = 0; i < 36; i++) {
      const ang = (i * Math.PI * 2) / 36;
      const spd = 100 + Math.random() * 160;
      room.spawnParticle(this.x, this.y, Math.cos(ang) * spd, Math.sin(ang) * spd, 5.5, '#fbbf24', 0.7);
    }
  }

  draw(ctx) {
    if (this.completed) return;
    ctx.save();
    const floatY = Math.sin(this.pulseTimer) * 4;

    // Aura carmesí
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
    ctx.restore();
  }
}

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

      // Otorgar buff permanente de +35% Daño
      player.damageMultiplier = (player.damageMultiplier || 1.0) * 1.35;

      if (typeof soundManager !== 'undefined' && soundManager) {
        soundManager.playProcedural('hurt');
      }
      if (player.ui) {
        player.ui.showToast('🩸 ¡PACTO DE SANGRE CONSUMADO! Sacrificaste 20 HP por +35% Daño Permanente');
        player.ui.spawnFloatingText('+35% DAÑO PERMANENTE', '#ef4444', this.x, this.y - 30);
        player.ui.updateHealth(player);
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
