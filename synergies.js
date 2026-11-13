/**
 * ============================================================================
 * SYNERGIES.JS - MOTOR DE SINERGIAS EMERGENTES Y FUSIONES ROTAS (v2.5)
 * ============================================================================
 * Implementa la filosofía The Binding of Isaac: Combinar 2 o 3 ítems crea
 * abominaciones mecánicas que borran la pantalla y hacen sentir al jugador un dios.
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
 * Proyectil de Meteorito de Supernova (VolcanicMeteorProjectile)
 */
class VolcanicMeteorProjectile extends BaseEntity {
  constructor(x, y, vx, vy, damage = 22) {
    super(x, y, 7, '#f97316');
    this.vx = vx;
    this.vy = vy;
    this.damage = damage;
    this.lifeTime = 1.3;
  }

  update(dt, arg1, arg2) {
    const room = (arg1 && Array.isArray(arg1.enemies)) ? arg1 : ((arg2 && Array.isArray(arg2.enemies)) ? arg2 : null);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.lifeTime -= dt;

    if (this.lifeTime <= 0) {
      this.markedForDeletion = true;
      this.detonate(room);
      return;
    }

    const rb = (room && room.bounds) ? room.bounds : (typeof ROOM_BOUNDS !== 'undefined' ? ROOM_BOUNDS : null);
    if (rb && (this.x <= rb.left || this.x >= rb.right || this.y <= rb.top || this.y >= rb.bottom)) {
      this.markedForDeletion = true;
      this.detonate(room);
      return;
    }

    if (room && room.enemies) {
      for (const enemy of room.enemies) {
        if (enemy.markedForDeletion || (enemy.isBurrowed && enemy.isBurrowed === true)) continue;
        const d = Math.hypot(enemy.x - this.x, enemy.y - this.y);
        if (d <= enemy.radius + this.radius) {
          this.markedForDeletion = true;
          enemy.takeDamage(this.damage, this.vx * 0.2, this.vy * 0.2, 'FIRE');
          this.detonate(room);
          return;
        }
      }
    }
  }

  detonate(room) {
    if (!room) return;
    if (window.MagmaPuddleHazard && Array.isArray(room.hazards) && room.hazards.length < 18) {
      room.hazards.push(new window.MagmaPuddleHazard(this.x, this.y, 32, 12, 2.0));
    }
    if (typeof room.spawnParticle === 'function') {
      for (let i = 0; i < 6; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 40 + Math.random() * 80;
        room.spawnParticle(this.x, this.y, Math.cos(ang) * spd, Math.sin(ang) * spd, 3.5, '#ef4444', 0.4);
      }
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#f97316';
    ctx.fill();
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Alma Espectral de Sombra (ShadowSoulEntity)
 */
class ShadowSoulEntity extends BaseEntity {
  constructor(x, y, damage = 28) {
    super(x, y, 6, '#a855f7');
    this.damage = damage;
    this.speed = 360;
    this.lifeTime = 3.5;
  }

  update(dt, arg1, arg2) {
    const room = (arg1 && Array.isArray(arg1.enemies)) ? arg1 : ((arg2 && Array.isArray(arg2.enemies)) ? arg2 : null);
    this.lifeTime -= dt;
    if (this.lifeTime <= 0) {
      this.markedForDeletion = true;
      return;
    }

    if (room && room.enemies && room.enemies.length > 0) {
      let closest = null;
      let minDist = 99999;
      for (const e of room.enemies) {
        if (e.markedForDeletion || e.isBurrowed) continue;
        const d = Math.hypot(e.x - this.x, e.y - this.y);
        if (d < minDist) {
          minDist = d;
          closest = e;
        }
      }

      if (closest) {
        const norm = MathUtils.normalize(closest.x - this.x, closest.y - this.y);
        this.x += norm.x * this.speed * dt;
        this.y += norm.y * this.speed * dt;

        if (minDist <= closest.radius + this.radius) {
          closest.takeDamage(this.damage, norm.x * 40, norm.y * 40, 'DARK');
          this.markedForDeletion = true;
          for (let i = 0; i < 10; i++) {
            const ang = Math.random() * Math.PI * 2;
            room.spawnParticle(this.x, this.y, Math.cos(ang) * 90, Math.sin(ang) * 90, 4, '#c084fc', 0.4);
          }
          return;
        }
      }
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#9333ea';
    ctx.fill();
    ctx.strokeStyle = '#e9d5ff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Fisura criogénica de Sinergia Cero Absoluto (`ABSOLUTE_ZERO`).
 * Congela enemigos que pisan el área y ralentiza proyectiles enemigos un 70%.
 */
class CryoSynergyFissure extends BaseEntity {
  constructor(x, y, radius = 38, duration = 3.2) {
    super(x, y, radius, '#06b6d4');
    this.duration = duration;
    this.timer = duration;
    this.pulseAnim = 0;
  }

  update(dt, player, room) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.markedForDeletion = true;
      return;
    }
    this.pulseAnim += dt * 4;
    if (!room) return;

    if (room.enemyProjectiles) {
      for (const ep of room.enemyProjectiles) {
        if (!ep || ep.markedForDeletion || ep._cryoSlowed) continue;
        if (Math.hypot(ep.x - this.x, ep.y - this.y) <= this.radius + (ep.radius || 4)) {
          ep._cryoSlowed = true;
          ep.vx *= 0.30;
          ep.vy *= 0.30;
        }
      }
    }

    if (room.enemies) {
      for (const enemy of room.enemies) {
        if (!enemy || enemy.markedForDeletion || enemy.isBurrowed) continue;
        if (Math.hypot(enemy.x - this.x, enemy.y - this.y) <= this.radius + (enemy.radius || 12)) {
          if (typeof enemy.applyElementalEffect === 'function') {
            enemy.applyElementalEffect('ICE', room, 2);
          }
        }
      }
    }
  }

  draw(ctx) {
    const alpha = Math.max(0.2, Math.min(1, this.timer / 0.8));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(6, 182, 212, 0.25)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#67e8f9';
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(this.x - 10, this.y);
    ctx.lineTo(this.x + 10, this.y);
    ctx.moveTo(this.x, this.y - 10);
    ctx.lineTo(this.x, this.y + 10);
    ctx.strokeStyle = '#ecfeff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Catálogo Maestro de Sinergias Extremas
 */
var GAMEBREAKER_SYNERGIES = {
  KINETIC_CHAOS: {
    id: 'KINETIC_CHAOS',
    name: 'Caos Cinético',
    icon: '💥',
    desc: 'Los rebotes en pared otorgan +45% de daño acumulable, agrandan los proyectiles un 25% y detonan ondas de choque al 3er rebote.',
    check(player) {
      return Boolean(player && player.itemManager && (player.itemManager.hasRelic('BOUNCING_BULLETS') || player.itemManager.hasRelic('PIERCING_BULLETS')));
    }
  },
  ABSOLUTE_ZERO: {
    id: 'ABSOLUTE_ZERO',
    name: 'Cero Absoluto',
    icon: '❄️',
    desc: 'El Rayo Láser congela enemigos en seco (2.2s) y deja fisuras criogénicas que ralentizan proyectiles enemigos un 70%.',
    check(player) {
      const hasIce = Boolean(player && player.itemManager && (player.itemManager.hasRelic('FROZEN_HEART') || (player.elementalPool && (player.elementalPool.ICE || 0) > 0)));
      const isLaser = Boolean(player && player.currentWeapon && (typeof WeaponSystem !== 'undefined' ? WeaponSystem.weaponHasTag(player.currentWeapon, 'BEAM') : player.currentWeapon.name === 'Rayo Láser'));
      return hasIce && isLaser;
    }
  },
  VOLCANIC_SUPERNOVA: {
    id: 'VOLCANIC_SUPERNOVA',
    name: 'Supernova Volcánica',
    icon: '🌋',
    desc: 'Las pelotas de combate detonan al impacto liberando 6 meteoritos ardientes en anillo que dejan charcos de magma.',
    check(player) {
      const hasFire = Boolean(player && player.itemManager && (player.itemManager.hasRelic('UNSTABLE_POWDER') || player.itemManager.hasRelic('ASH_KING') || (player.elementalPool && (player.elementalPool.FIRE || 0) > 0)));
      const isBall = Boolean(player && player.currentWeapon && (typeof WeaponSystem !== 'undefined' ? WeaponSystem.weaponHasTag(player.currentWeapon, 'PROJECTILE') : player.currentWeapon.name === 'Pelotas'));
      return hasFire && isBall;
    }
  },
  THUNDER_GOD_PARRY: {
    id: 'THUNDER_GOD_PARRY',
    name: 'Parry del Dios del Trueno',
    icon: '⚡',
    desc: 'Desviar un proyectil con la Espada convoca un relámpago divino sobre TODOS los enemigos de la sala y resetea el Dash.',
    check(player) {
      const hasLight = Boolean(player && player.itemManager && (player.itemManager.hasRelic('VOLTAIC_ARC') || player.itemManager.hasRelic('DIVINE_REVENGE') || (player.elementalPool && (player.elementalPool.LIGHTNING || 0) > 0)));
      const isSword = Boolean(player && player.currentWeapon && (typeof WeaponSystem !== 'undefined' ? (WeaponSystem.weaponHasTag(player.currentWeapon, 'MELEE') || WeaponSystem.weaponHasTag(player.currentWeapon, 'PARRY')) : player.currentWeapon.name === 'Espada Larga'));
      return hasLight && isSword;
    }
  },
  PLASMA_VORTEX: {
    id: 'PLASMA_VORTEX',
    name: 'Vórtice de Plasma',
    icon: '🛡️',
    desc: 'Las sierras defensivas absorben proyectiles enemigos, expanden su radio de órbita un 40% y disparan contragolpes guiados.',
    check(player) {
      return Boolean(player && player.itemManager && (player.itemManager.hasRelic('SECOND_SKIN') || player.itemManager.hasRelic('SHIELD_OF_DAMNED')));
    }
  },
  GRAVITATIONAL_SINGULARITY: {
    id: 'GRAVITATIONAL_SINGULARITY',
    name: 'Singularidad Gravitacional',
    icon: '🌀',
    desc: 'Tus proyectiles en vuelo ejercen un vórtice gravitatorio de 160px que succiona a todos los enemigos y los agrupa.',
    check(player) {
      return Boolean(player && player.itemManager && (player.itemManager.hasRelic('SINGULARITY') || player.itemManager.hasRelic('SINGULARITY_HEART') || player.itemManager.hasRelic('HUNTER_EYE')));
    }
  },
  SHADOW_SWARM: {
    id: 'SHADOW_SWARM',
    name: 'Enjambre de Sombras',
    icon: '👻',
    desc: 'Cada enemigo aniquilado libera un espectro oscuro aliado que vuela y detona contra los enemigos supervivientes.',
    check(player) {
      return Boolean(
        player &&
        player.itemManager &&
        (
          player.itemManager.hasRelic('VAMPIRIC_HEART') ||
          player.itemManager.hasRelic('CURSED_SKULL') ||
          player.itemManager.hasRelic('GHOST_FAMILIAR')
        )
      );
    }
  }
};

/**
 * Gestor Maestro de Sinergias Emergentes (SynergyEngine)
 */
var SynergyEngine = class SynergyEngine {
  constructor() {
    this.activeSynergies = new Set();
    this.unlockedHistory = new Set();
    this.bannerTimeout = null;
    this.lastBeamFissureAt = 0;
  }

  reset() {
    this.activeSynergies.clear();
    this.unlockedHistory.clear();
    this.lastBeamFissureAt = 0;
    if (this.bannerTimeout) {
      clearTimeout(this.bannerTimeout);
      this.bannerTimeout = null;
    }
  }

  has(id) {
    return this.activeSynergies.has(id);
  }

  update(player, ui, room) {
    if (!player) return;

    for (const key in GAMEBREAKER_SYNERGIES) {
      const syn = GAMEBREAKER_SYNERGIES[key];
      const isActive = syn.check(player);

      if (isActive && !this.activeSynergies.has(key)) {
        this.activeSynergies.add(key);
        if (!this.unlockedHistory.has(key)) {
          this.unlockedHistory.add(key);
          this.notifySynergyUnlocked(syn);
        }
        if (ui && ui.updateSynergies) ui.updateSynergies(this);
      } else if (!isActive && this.activeSynergies.has(key)) {
        this.activeSynergies.delete(key);
        if (ui && ui.updateSynergies) ui.updateSynergies(this);
      }
    }
  }

  notifySynergyUnlocked(syn) {
    const banner = document.getElementById('synergy-unlock-banner');
    const name = document.getElementById('synergy-banner-name');
    const desc = document.getElementById('synergy-banner-desc');
    if (!banner || !name || !desc) return;

    name.textContent = (syn.icon || '⚡') + ' ¡' + syn.name.toUpperCase() + '!';
    desc.textContent = syn.desc;

    banner.classList.remove('hidden');
    banner.classList.add('visible');

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const now = ctx.currentTime;
        [440, 554, 659, 880].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.frequency.setValueAtTime(freq, now + idx * 0.08);
          gain.gain.setValueAtTime(0.2, now + idx * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.08 + 0.3);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + idx * 0.08);
          osc.stop(now + idx * 0.08 + 0.35);
        });
      }
    } catch (e) {}

    if (this.bannerTimeout) clearTimeout(this.bannerTimeout);
    this.bannerTimeout = setTimeout(() => {
      banner.classList.remove('visible');
      setTimeout(() => banner.classList.add('hidden'), 500);
    }, 3200);
  }

  /**
   * Hook: Ejecutado en cada frame sobre los proyectiles del jugador
   */
  onProjectileUpdate(proj, dt, room, player) {
    if (!proj || proj.markedForDeletion || !room) return;

    // 1. Singularidad Gravitacional
    if (this.has('GRAVITATIONAL_SINGULARITY')) {
      const suctionRadius = 155;
      const suctionForce = 130;
      if (room.enemies) {
        for (const e of room.enemies) {
          if (e.markedForDeletion || e.isBurrowed || e.isBoss) continue;
          const d = Math.hypot(proj.x - e.x, proj.y - e.y);
          if (d > 0 && d <= suctionRadius) {
            const pull = MathUtils.normalize(proj.x - e.x, proj.y - e.y);
            e.x += pull.x * suctionForce * dt;
            e.y += pull.y * suctionForce * dt;
          }
        }
      }
    }
  }

  /**
   * Hook: Ejecutado cuando un proyectil del jugador impacta a un enemigo
   */
  onProjectileHit(proj, enemy, room, player) {
    if (!proj || !enemy || !room) return;

    // 1. Supernova Volcánica (con límite de seguridad para evitar saturación de entidades)
    if (this.has('VOLCANIC_SUPERNOVA') && !(proj instanceof VolcanicMeteorProjectile) && !proj._supernovaSpawned) {
      proj._supernovaSpawned = true;
      if (room.projectiles && room.projectiles.length < 85) {
        const meteorCount = 6;
        for (let i = 0; i < meteorCount; i++) {
        const ang = (i * Math.PI * 2) / meteorCount + Math.random() * 0.2;
        const spd = 160 + Math.random() * 60;
        room.projectiles.push(new VolcanicMeteorProjectile(
          proj.x,
          proj.y,
          Math.cos(ang) * spd,
          Math.sin(ang) * spd,
          Math.round((proj.damage || 15) * 0.65)
        ));
        }
      }
    }
  }

  /**
   * Hook: Ejecutado cuando el jugador realiza un Parry exitoso con la espada
   */
  onParrySuccess(player, room) {
    if (!player || !room) return;

    // 1. Parry del Dios del Trueno
    if (this.has('THUNDER_GOD_PARRY')) {
      if (room.enemies) {
        for (const enemy of room.enemies) {
          if (enemy.markedForDeletion || enemy.isBurrowed) continue;
          enemy.takeDamage(45, 0, 0, 'LIGHTNING');
          for (let i = 0; i < 12; i++) {
            room.spawnParticle(enemy.x, enemy.y, (Math.random() - 0.5) * 140, (Math.random() - 0.5) * 140, 4, '#38bdf8', 0.4);
          }
        }
      }
      // Restaurar Estamina por completo e interrumpir el agotamiento inmediatamente (v3.5)
      player.stamina = player.maxStamina || 100;
      player.staminaRegenDelayTimer = 0;
      player.staminaAttackPenaltyTimer = 0;
      player.isStaminaExhausted = false;
      if (player.ui) player.ui.updateStats(player);
      // Sacudida de pantalla triunfal
      if (window.CombatSystem) {
        window.CombatSystem.triggerScreenShake(14, 0.4);
      }
    }
  }

  /**
   * Hook: Ejecutado cuando un enemigo es aniquilado
   */
  onEnemyKilled(enemy, room, player) {
    if (!enemy || !room) return;

    // 1. Enjambre de Sombras
    if (this.has('SHADOW_SWARM')) {
      room.projectiles.push(new ShadowSoulEntity(enemy.x, enemy.y, 28));
    }
  }

  /**
   * Hook: Ejecutado cuando un proyectil rebota en una pared (Caos Cinético)
   */
  onProjectileBounce(proj, room, player) {
    if (!proj || !this.has('KINETIC_CHAOS')) return;
    proj._kineticBounceCount = (proj._kineticBounceCount || 0) + 1;
    proj.damage = Math.min(9999, Math.round(proj.damage * 1.45));
    proj.radius = Math.min(24, proj.radius * 1.25);

    if (room) {
      room.spawnParticle(proj.x, proj.y, '#38bdf8', 6);
      room.spawnParticle(proj.x, proj.y, '#ffffff', 4);
      if (proj._kineticBounceCount % 3 === 0 && room.enemies) {
        const shockRadius = 95;
        const shockDmg = Math.max(10, Math.round(proj.damage * 0.75));
        for (const en of room.enemies) {
          if (!en || en.markedForDeletion || en.isBurrowed) continue;
          if (Math.hypot(en.x - proj.x, en.y - proj.y) <= shockRadius + (en.radius || 14)) {
            en.takeDamage(shockDmg, 0, 0, proj.element || 'NONE');
          }
        }
        for (let i = 0; i < 12; i++) {
          const ang = (Math.PI * 2 * i) / 12;
          room.spawnParticle(proj.x, proj.y, Math.cos(ang) * 160, Math.sin(ang) * 160, 4.5, '#38bdf8', 0.35);
        }
      }
    }
    if (typeof soundManager !== 'undefined' && soundManager) {
      soundManager.playProcedural('crit', { volume: 0.35 });
    }
  }

  /**
   * Hook: Ejecutado cuando el Rayo Láser impacta un enemigo (Cero Absoluto)
   */
  onBeamHit(player, enemy, hitX, hitY, room) {
    if (!enemy || !room || !this.has('ABSOLUTE_ZERO')) return;
    enemy.freezeTimer = Math.max(enemy.freezeTimer || 0, 2.2);
    if (typeof enemy.applyElementalEffect === 'function') {
      enemy.applyElementalEffect('ICE', room, 3);
    }

    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (room.hazards && now - this.lastBeamFissureAt >= 280) {
      const existingFissures = room.hazards.filter((h) => h instanceof CryoSynergyFissure && !h.markedForDeletion).length;
      if (existingFissures < 6) {
        this.lastBeamFissureAt = now;
        room.hazards.push(new CryoSynergyFissure(hitX, hitY, 38, 3.2));
      }
    }
  }
}

window.CryoSynergyFissure = CryoSynergyFissure;
window.synergyEngine = new SynergyEngine();
window.GAMEBREAKER_SYNERGIES = GAMEBREAKER_SYNERGIES;
window.SYNERGIES = GAMEBREAKER_SYNERGIES;
