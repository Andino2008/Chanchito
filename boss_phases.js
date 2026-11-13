/**
 * ============================================================================
 * BOSS_PHASES.JS - SISTEMA CINEMÁTICO DE FASES Y MECÁNICAS DE JEFES (v2.9)
 * ============================================================================
 * Transforma los combates contra Jefes en duelos mecánicos, dinámicos y tácticos
 * inspirados en Hades y Enter the Gungeon:
 *  1. Phase Break Cinemático al 50% de HP (Phase Gate duro):
 *     - Hit-stop de 0.35s + sacudida de pantalla épica.
 *     - Onda expansiva atravesable con Dash (Perfect Dodge) + limpieza de balas.
 *     - 1.25s de invulnerabilidad + purga de CC mientras ruge y muta a Fase 2.
 *     - Banner cinemático en HTML y SFX procedural con Web Audio API.
 *  2. Ataques Mecánicos Legibles con Reparación Visual Completa:
 *     - BossShockwaveHazard (anillo cian/carmesí saltable con Perfect Dodge).
 *     - AbyssalGeyserHazard (telegrafiado magenta nítido sin errores de sintaxis).
 *     - CelestialJudgmentPillar (haz convergente ámbar/blanco nítido).
 *  3. Balance de Salud de Jefes v2.9 (+15% Base en reemplazo del recorte -22%).
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
 * Entidad de Onda de Choque Sísmica (BossShockwaveHazard)
 * Expande un anillo concéntrico de energía. Si el jugador lo atraviesa
 * en I-Frames de Dash o Parry, activa Perfect Dodge; si no, recibe daño.
 */
var BossShockwaveHazard = class BossShockwaveHazard extends BaseEntity {
  constructor(x, y, color = '#38bdf8', expansionSpeed = 320, maxRadius = 460, damage = 18, startDelay = 0) {
    super(x, y, 16, color);
    this.startDelay = Math.max(0, startDelay || 0);
    this.currentRadius = 18;
    this.expansionSpeed = expansionSpeed;
    this.maxRadius = maxRadius;
    this.ringThickness = 16;
    this.damage = damage;
    this.hasHitPlayer = false;
    this.lifeTime = maxRadius / Math.max(60, expansionSpeed) + 0.25 + this.startDelay;
    this.pulseAngle = 0;
  }

  update(dt, player, room) {
    if (this.startDelay > 0) {
      this.startDelay -= dt;
      this.lifeTime -= dt;
      return;
    }
    this.currentRadius += this.expansionSpeed * dt;
    this.pulseAngle += dt * 10;
    this.lifeTime -= dt;

    if (this.currentRadius >= this.maxRadius || this.lifeTime <= 0) {
      this.markedForDeletion = true;
      return;
    }

    if (!this.hasHitPlayer && player) {
      const dist = Math.hypot(player.x - this.x, player.y - this.y);
      const diff = Math.abs(dist - this.currentRadius);
      if (diff <= this.ringThickness + player.radius * 0.72) {
        const isDashing = (typeof CombatSystem !== 'undefined' && typeof CombatSystem.isPlayerDashing === 'function')
          ? CombatSystem.isPlayerDashing(player)
          : (player.dodgeActiveTimer > 0 || (player.dashIFrameTimer || 0) > 0);
        const isParrying = (typeof WeaponSystem !== 'undefined')
          ? WeaponSystem.isWeaponParrying(player.currentWeapon)
          : Boolean(
              player.currentWeapon &&
              player.currentWeapon.mode === 0 &&
              player.currentWeapon.swingTimer > 0
            );
        const isGrace = player.invulnerableTimer > 0 || player.roomTransitionGrace > 0;

        if (isDashing || isParrying) {
          this.hasHitPlayer = true;
          if (typeof CombatSystem !== 'undefined' && typeof CombatSystem.triggerPerfectDodge === 'function') {
            CombatSystem.triggerPerfectDodge(player, room, player.x, player.y, '⚡ ONDA EVADIDA');
          } else if (room) {
            for (let i = 0; i < 8; i++) {
              const ang = Math.random() * Math.PI * 2;
              room.spawnParticle(player.x, player.y, Math.cos(ang) * 120, Math.sin(ang) * 120, 3.5, '#38bdf8', 0.3);
            }
          }
        } else if (!isGrace) {
          this.hasHitPlayer = true;
          player.takeDamage(this.damage, room, { isProjectile: false, sourceArchetype: 'GoliatBoss' });
          const push = MathUtils.normalize(player.x - this.x, player.y - this.y);
          player.x = MathUtils.clamp(player.x + push.x * 40, (room ? room.bounds.left : 100) + player.radius, (room ? room.bounds.right : 800) - player.radius);
          player.y = MathUtils.clamp(player.y + push.y * 40, (room ? room.bounds.top : 100) + player.radius, (room ? room.bounds.bottom : 600) - player.radius);
        }
      }
    }
  }

  draw(ctx) {
    if (this.startDelay > 0) return;
    const room = window.activeGameInstance ? window.activeGameInstance.currentRoom : null;
    const b = room ? room.bounds : null;
    ctx.save();
    if (b) {
      ctx.beginPath();
      ctx.rect(b.left, b.top, b.width, b.height);
      ctx.clip();
    }
    const alpha = Math.max(0.18, 1 - (this.currentRadius / this.maxRadius));

    // Halo exterior del anillo
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.currentRadius, 0, Math.PI * 2);
    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.ringThickness;
    ctx.globalAlpha = alpha * 0.65;
    ctx.stroke();

    // Línea interior blanca de alto contraste (comunica patrón saltable con Dash)
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.currentRadius, 0, Math.PI * 2);
    ctx.strokeStyle = '#e0f2fe';
    ctx.lineWidth = 3.5;
    ctx.globalAlpha = alpha;
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Entidad de Géiser Abisal Telegrafiado (AbyssalGeyserHazard)
 * Muestra un círculo telegrafiado nítido que se llena, y luego estalla en erupción.
 */
var AbyssalGeyserHazard = class AbyssalGeyserHazard extends BaseEntity {
  constructor(x, y, radius = 52, telegraphDuration = 1.05, activeDuration = 1.35, damage = 22) {
    super(x, y, radius, '#701a75');
    this.telegraphDuration = telegraphDuration;
    this.telegraphTimer = telegraphDuration;
    this.activeDuration = activeDuration;
    this.activeTimer = activeDuration;
    this.damage = damage;
    this.state = 'TELEGRAPH'; // 'TELEGRAPH' -> 'ERUPTING'
    this.hitCooldown = 0;
  }

  update(dt, player, room) {
    if (this.state === 'TELEGRAPH') {
      this.telegraphTimer -= dt;
      if (this.telegraphTimer <= 0) {
        this.state = 'ERUPTING';
        if (typeof soundManager !== 'undefined' && soundManager) {
          soundManager.playProcedural('boss_slam', { volume: 0.35 });
        }
        if (room) {
          for (let i = 0; i < 16; i++) {
            const ang = Math.random() * Math.PI * 2;
            const spd = 60 + Math.random() * 120;
            room.spawnParticle(this.x, this.y, Math.cos(ang) * spd, Math.sin(ang) * spd, 4.5, '#d946ef', 0.5);
          }
        }
      }
    } else if (this.state === 'ERUPTING') {
      this.activeTimer -= dt;
      this.hitCooldown -= dt;

      if (this.activeTimer <= 0) {
        this.markedForDeletion = true;
        return;
      }

      if (room && Math.random() < 0.4) {
        room.spawnParticle(
          this.x + (Math.random() - 0.5) * this.radius,
          this.y + (Math.random() - 0.5) * this.radius,
          (Math.random() - 0.5) * 30,
          -50 - Math.random() * 40,
          5,
          '#86198f',
          0.4
        );
      }

      if (player && this.hitCooldown <= 0) {
        const d = Math.hypot(player.x - this.x, player.y - this.y);
        if (d <= this.radius + player.radius * 0.85) {
          const isDashing = typeof CombatSystem !== 'undefined' && CombatSystem.isPlayerDashing(player);
          if (!isDashing) {
            this.hitCooldown = 0.4;
            player.takeDamage(this.damage, room, { sourceArchetype: 'AbismoBoss' });
          }
        }
      }
    }
  }

  draw(ctx) {
    ctx.save();
    if (this.state === 'TELEGRAPH') {
      const prog = 1 - Math.max(0, this.telegraphTimer / this.telegraphDuration);
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(192, 38, 211, 0.16)';
      ctx.fill();
      ctx.strokeStyle = prog > 0.8 ? '#ffffff' : '#e879f9';
      ctx.lineWidth = prog > 0.8 ? 3.5 : 2.5;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Círculo concéntrico que crece hasta tocar el borde (marca exacta de detonación)
      ctx.beginPath();
      ctx.arc(this.x, this.y, Math.max(4, this.radius * prog), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(232, 121, 249, ${(0.22 + prog * 0.25).toFixed(2)})`;
      ctx.fill();
    } else {
      const alpha = Math.max(0, Math.min(1, this.activeTimer / 0.4));
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(112, 26, 117, ${(alpha * 0.68).toFixed(2)})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(244, 114, 182, ${alpha.toFixed(2)})`;
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    ctx.restore();
  }
}

/**
 * Pilar de Juicio Divino Telegrafiado (CelestialJudgmentPillar)
 * Marca un haz vertical en la sala con barra interior convergente y destello blanco previo.
 */
var CelestialJudgmentPillar = class CelestialJudgmentPillar extends BaseEntity {
  constructor(x, y, width = 64, height = 550, telegraphDuration = 0.95, damage = 24) {
    super(x, y, width / 2, '#fbbf24');
    this.width = width;
    this.height = height;
    this.telegraphDuration = telegraphDuration;
    this.timer = telegraphDuration;
    this.state = 'CHARGE'; // 'CHARGE' -> 'STRIKE' -> 'DONE'
    this.strikeDuration = 0.32;
    this.damage = damage;
    this.hasDamaged = false;
  }

  update(dt, player, room) {
    if (this.state === 'CHARGE') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = 'STRIKE';
        this.timer = this.strikeDuration;
        if (typeof soundManager !== 'undefined' && soundManager) {
          soundManager.playProcedural('boss_slam', { volume: 0.45 });
        }
        if (room) {
          for (let i = 0; i < 20; i++) {
            room.spawnParticle(
              this.x + (Math.random() - 0.5) * this.width,
              this.y + (Math.random() - 0.5) * this.height,
              (Math.random() - 0.5) * 160,
              (Math.random() - 0.5) * 160,
              4,
              '#fef08a',
              0.4
            );
          }
        }
      }
    } else if (this.state === 'STRIKE') {
      this.timer -= dt;
      if (!this.hasDamaged && player) {
        const halfW = this.width / 2;
        const halfH = this.height / 2;
        if (
          player.x >= this.x - halfW && player.x <= this.x + halfW &&
          player.y >= this.y - halfH && player.y <= this.y + halfH
        ) {
          const isDashing = typeof CombatSystem !== 'undefined' && CombatSystem.isPlayerDashing(player);
          if (isDashing) {
            this.hasDamaged = true;
            CombatSystem.triggerPerfectDodge(player, room, player.x, player.y, '⚡ JUICIO EVADIDO');
          } else {
            this.hasDamaged = true;
            player.takeDamage(this.damage, room, { sourceArchetype: 'SerafinBoss' });
          }
        }
      }
      if (this.timer <= 0) {
        this.markedForDeletion = true;
      }
    }
  }

  draw(ctx) {
    ctx.save();
    const halfW = this.width / 2;
    const halfH = this.height / 2;
    if (this.state === 'CHARGE') {
      const prog = Math.max(0, Math.min(1, 1 - (this.timer / this.telegraphDuration)));
      ctx.fillStyle = `rgba(251, 191, 36, ${(0.14 + prog * 0.28).toFixed(2)})`;
      ctx.fillRect(this.x - halfW, this.y - halfH, this.width, this.height);

      // Barra central creciente hacia el borde para marcar el momento exacto de detonación
      const innerW = Math.max(4, this.width * prog);
      ctx.fillStyle = prog > 0.8 ? 'rgba(255, 255, 255, 0.45)' : 'rgba(254, 240, 138, 0.32)';
      ctx.fillRect(this.x - innerW / 2, this.y - halfH, innerW, this.height);

      ctx.strokeStyle = prog > 0.8 ? '#ffffff' : '#f59e0b';
      ctx.lineWidth = prog > 0.8 ? 3.5 : 2;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(this.x - halfW, this.y - halfH, this.width, this.height);
      ctx.setLineDash([]);
    } else if (this.state === 'STRIKE') {
      const fade = Math.max(0.2, this.timer / this.strikeDuration);
      ctx.fillStyle = `rgba(254, 240, 138, ${(0.85 * fade).toFixed(2)})`;
      ctx.fillRect(this.x - halfW, this.y - halfH, this.width, this.height);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.strokeRect(this.x - halfW, this.y - halfH, this.width, this.height);
    }
    ctx.restore();
  }
}

/**
 * Gestor Maestro de Fases de Jefes (BossPhaseManager)
 */
var BossPhaseManager = class BossPhaseManager {
  constructor() {
    this.bannerTimeout = null;
    this.activeBossEnraged = false;
  }

  /**
   * Genera efectos de audio procedurales para la transición a Fase 2 (Rugido y pulso subsónico)
   */
  playPhaseShiftAudio() {
    try {
      let ctx = (typeof soundManager !== 'undefined' && soundManager && soundManager.audioCtx)
        ? soundManager.audioCtx
        : null;
      if (!ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        ctx = new AudioCtx();
      }
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      const now = ctx.currentTime;

      // Oscilador de graves (sub-bass drop)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(32, now + 0.8);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.85);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.9);

      // Oscilador agudo de resonancia (alarma mística)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(320, now + 0.1);
      osc2.frequency.exponentialRampToValueAtTime(880, now + 0.5);
      osc2.frequency.exponentialRampToValueAtTime(120, now + 0.9);
      gain2.gain.setValueAtTime(0.22, now + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.9);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.1);
      osc2.stop(now + 0.95);
    } catch (e) {
      // Ignorar si el navegador bloquea audio antes de interacción
    }
  }

  /**
   * Muestra el banner cinemático HTML en pantalla completa durante la transición
   */
  showCinematicBanner(boss) {
    const banner = document.getElementById('boss-cinematic-banner');
    const title = document.getElementById('boss-banner-title');
    const desc = document.getElementById('boss-banner-desc');
    if (!banner || !title || !desc) return;

    const bossDescriptions = {
      'GOLIAT': '¡Sin escudo frontal! Carga dashes explosivos y salta con Ondas Sísmicas (atraviésalas con Dash).',
      'NÉMESIS': 'Escudos orbitales con respiración táctica y Clon Oscuro. ¡Aprovecha las aperturas!',
      'ABISMO': 'Emboscada Triple bajo tierra y Géiseres Oscuros. ¡Esquiva las marcas antes de golpear!',
      'SERAFÍN': 'Combo Triangular telegrafiado y 6 Espadas Rítmicas. ¡Lee el haz y castiga su pausa!'
    };

    const bossKey = Object.keys(bossDescriptions).find(k => (boss.bossTitle || '').toUpperCase().includes(k)) || 'GOLIAT';
    title.textContent = '¡FASE 2: FURIA DE ' + (boss.bossTitle || 'JEFE') + '!';
    desc.textContent = bossDescriptions[bossKey];

    banner.classList.remove('hidden');
    banner.classList.add('visible');

    if (this.bannerTimeout) clearTimeout(this.bannerTimeout);
    this.bannerTimeout = setTimeout(() => {
      banner.classList.remove('visible');
      setTimeout(() => banner.classList.add('hidden'), 500);
    }, 2800);
  }

  /**
   * Dispara el Phase Break cinemático y mecánico cuando el Jefe alcanza <= 50% HP
   */
  triggerPhaseShift(boss, room, player) {
    if (!boss || boss.phaseBreakTriggered) return;
    boss.phaseBreakTriggered = true;
    this.activeBossEnraged = true;

    // 1. Invulnerabilidad temporal de transformación y limpieza de CC paralizante
    boss.invulnerableTimer = 1.25;
    boss.freezeMeter = 0;
    boss.isStaggered = false;
    boss.staggerVulnerableMult = 1.0;
    if (Array.isArray(boss.activeEffects)) {
      boss.activeEffects = boss.activeEffects.filter(
        (eff) => eff.type !== 'ELECTRIC' && eff.type !== 'ICE' && eff.type !== 'MIRACLE' && eff.type !== 'BOSS_SLOW'
      );
    }

    // 2. Hit-Stop y Sacudida de Pantalla visceral
    if (window.CombatSystem) {
      window.CombatSystem.triggerHitStop(0.32);
      window.CombatSystem.triggerScreenShake(20, 0.65);
    }

    // 3. Audio cinemático
    this.playPhaseShiftAudio();

    // 4. Banner HTML
    this.showCinematicBanner(boss);

    // 5. Estilizar la barra de salud del Jefe en HTML
    const bossPanel = document.getElementById('boss-panel');
    if (bossPanel) {
      bossPanel.classList.add('phase-2-enrage');
    }

    // 6. Limpiar balas cercanas y lanzar onda de rechazo atravesable con Dash
    if (room) {
      if (room.enemyProjectiles) {
        room.enemyProjectiles = room.enemyProjectiles.filter(p => {
          const d = Math.hypot(p.x - boss.x, p.y - boss.y);
          return d > 420;
        });
      }

      room.hazards.push(new BossShockwaveHazard(boss.x, boss.y, '#38bdf8', 310, 520, 14));

      // Empujar suavemente al jugador si está pegado al jefe para darle margen de lectura
      if (player) {
        const d = Math.hypot(player.x - boss.x, player.y - boss.y);
        if (d < 190) {
          const norm = MathUtils.normalize(player.x - boss.x, player.y - boss.y);
          player.x = MathUtils.clamp(boss.x + norm.x * 210, room.bounds.left + player.radius, room.bounds.right - player.radius);
          player.y = MathUtils.clamp(boss.y + norm.y * 210, room.bounds.top + player.radius, room.bounds.bottom - player.radius);
        }
      }

      for (let i = 0; i < 32; i++) {
        const ang = (i * Math.PI * 2) / 32;
        const spd = 120 + Math.random() * 180;
        room.spawnParticle(boss.x, boss.y, Math.cos(ang) * spd, Math.sin(ang) * spd, 6, boss.color || '#f43f5e', 0.65);
      }
    }
  }

  /**
   * Renderiza el aura de furia o vulnerabilidad en Canvas alrededor del Jefe
   */
  drawEnrageAura(ctx, boss) {
    if (!boss || boss.markedForDeletion) return;

    // Indicador de Fatiga / Stagger ("Ventana de Castigo +25% Daño")
    if (boss.isStaggered) {
      ctx.save();
      const time = Date.now() * 0.008;
      const r = boss.radius + 14;
      ctx.beginPath();
      ctx.arc(boss.x, boss.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.72)';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 6]);
      ctx.stroke();
      ctx.setLineDash([]);

      // 3 rombos cian girando sobre el jefe fatigado (0 ctx.fillText)
      for (let i = 0; i < 3; i++) {
        const ang = time + (i * Math.PI * 2) / 3;
        const sx = boss.x + Math.cos(ang) * 20;
        const sy = boss.y - boss.radius - 20 + Math.sin(ang * 2) * 3;
        ctx.beginPath();
        ctx.moveTo(sx, sy - 4);
        ctx.lineTo(sx + 4, sy);
        ctx.lineTo(sx, sy + 4);
        ctx.lineTo(sx - 4, sy);
        ctx.closePath();
        ctx.fillStyle = '#38bdf8';
        ctx.fill();
      }
      ctx.restore();
      return;
    }

    if (boss.phase !== 2) return;
    ctx.save();
    const time = Date.now() * 0.005;
    const pulse = Math.sin(time) * 5;
    const auraRadius = boss.radius + 12 + pulse;

    // Aura sutil de Fase 2 (sin opacar telegrafiados naranja/cian)
    ctx.beginPath();
    ctx.arc(boss.x, boss.y, auraRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.42)';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.stroke();

    const grad = ctx.createRadialGradient(boss.x, boss.y, boss.radius * 0.5, boss.x, boss.y, auraRadius + 8);
    grad.addColorStop(0, 'rgba(220, 38, 38, 0)');
    grad.addColorStop(1, 'rgba(239, 68, 68, 0.18)');
    ctx.beginPath();
    ctx.arc(boss.x, boss.y, auraRadius + 8, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
  }

  /**
   * Calibración de Salud de Jefes v2.9:
   * Elimina el recorte previo (-22%) y refuerza +15% el tanque base para duelos reales de dos fases.
   */
  tuneBossHp(boss) {
    if (!boss || boss.hpTuned) return;
    boss.hpTuned = true;
    const tunedMax = Math.round(boss.maxHp * 1.15);
    const ratio = boss.maxHp > 0 ? (boss.hp / boss.maxHp) : 1;
    boss.maxHp = tunedMax;
    boss.hp = Math.round(tunedMax * ratio);
  }
}

// Instancia global
window.bossPhaseManager = new BossPhaseManager();
window.BossShockwaveHazard = BossShockwaveHazard;
window.AbyssalGeyserHazard = AbyssalGeyserHazard;
window.CelestialJudgmentPillar = CelestialJudgmentPillar;
