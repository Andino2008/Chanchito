/**
 * ============================================================================
 * BOSS_PHASES.JS - SISTEMA CINEMÁTICO DE FASES Y MECÁNICAS DE JEFES (v2.5)
 * ============================================================================
 * Transforma los combates contra Jefes en duelos mecánicos, dinámicos y tácticos
 * inspirados en Hades y Enter the Gungeon:
 *  1. Phase Break Cinemático al 50% de HP:
 *     - Hit-stop de 0.35s + sacudida de pantalla épica.
 *     - Onda expansiva de rechazo que dispersa balas y repele al jugador con seguridad.
 *     - 1.2s de invulnerabilidad mientras el Jefe ruge y muta a su Fase 2.
 *     - Banner cinemático en HTML ('¡FASE 2: PROTOCOLO DE EXTERMINIO!').
 *     - SFX procedural sintetizado con Web Audio API (rugido y onda de poder).
 *  2. Ataques Mecánicos de Fase 2 que Premian la Movilidad y el Dash:
 *     - Goliat: Shockwaves sísmicos expansivos que el jugador DEBE atravesar con Dash I-Frames.
 *     - Némesis: Espiral Danmaku Lotus de 28 proyectiles y clone señuelo.
 *     - Abismo: Géiseres oscuros telegrafiados y vórtice de succión abisal.
 *     - Serafín: Columnas de Juicio Divino y salvas de lanzas radiantes guiadas.
 *  3. Barra de Jefe Encolerizada en HTML (#boss-panel.phase-2-enrage).
 *  4. Escalado Anti-Esponja de Daño: -22% de HP total para combates rápidos de pura adrenalina.
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
 * Expande un anillo concéntrico de energía. Si el jugador lo toca mientras
 * NO está en I-Frames de Dash o Parry, recibe daño y knockback.
 */
var BossShockwaveHazard = class BossShockwaveHazard extends BaseEntity {
  constructor(x, y, color = '#ef4444', expansionSpeed = 340, maxRadius = 420, damage = 18) {
    super(x, y, 16, color);
    this.currentRadius = 18;
    this.expansionSpeed = expansionSpeed;
    this.maxRadius = maxRadius;
    this.ringThickness = 18;
    this.damage = damage;
    this.hasHitPlayer = false;
    this.lifeTime = maxRadius / expansionSpeed + 0.2;
    this.pulseAngle = 0;
  }

  update(dt, player, room) {
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
      if (diff <= this.ringThickness + player.radius * 0.8) {
        // Verificar si el jugador está en I-Frames por Dash o Parry
        const isDashing = player.combatSystem && player.combatSystem.isInvulnerable();
        const isParrying = player.currentWeapon && player.currentWeapon.isParrying;
        const isGrace = player.invulnerableTimer > 0 || player.roomTransitionGrace > 0;

        if (isDashing || isParrying) {
          // ¡Evasión perfecta! Efecto visual de chispas doradas y sin daño
          this.hasHitPlayer = true;
          if (room) {
            for (let i = 0; i < 8; i++) {
              const ang = Math.random() * Math.PI * 2;
              room.spawnParticle(player.x, player.y, Math.cos(ang) * 120, Math.sin(ang) * 120, 3.5, '#38bdf8', 0.3);
            }
          }
        } else if (!isGrace) {
          this.hasHitPlayer = true;
          player.takeDamage(this.damage, room, { isProjectile: false });
          const push = MathUtils.normalize(player.x - this.x, player.y - this.y);
          player.x = MathUtils.clamp(player.x + push.x * 45, (room ? room.bounds.left : 100) + player.radius, (room ? room.bounds.right : 800) - player.radius);
          player.y = MathUtils.clamp(player.y + push.y * 45, (room ? room.bounds.top : 100) + player.radius, (room ? room.bounds.bottom : 600) - player.radius);
        }
      }
    }
  }

  draw(ctx) {
    const room = window.activeGameInstance ? window.activeGameInstance.currentRoom : null;
    const b = room ? room.bounds : null;
    ctx.save();
    if (b) {
      ctx.beginPath();
      ctx.rect(b.left, b.top, b.width, b.height);
      ctx.clip();
    }
    const alpha = Math.max(0.15, 1 - (this.currentRadius / this.maxRadius));
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.currentRadius, 0, Math.PI * 2);
    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.ringThickness;
    ctx.globalAlpha = alpha * 0.75;
    ctx.stroke();

    // Línea interior brillante
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.currentRadius, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.globalAlpha = alpha;
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Entidad de Géiser Abisal Telegrafiado (AbyssalGeyserHazard)
 * Muestra un círculo telegrafiado que se llena, y luego estalla en una erupción de sombra.
 */
var AbyssalGeyserHazard = class AbyssalGeyserHazard extends BaseEntity {
  constructor(x, y, radius = 55, telegraphDuration = 0.95, activeDuration = 1.4, damage = 22) {
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
        // Explosión inicial de partículas
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

      // Generar humo oscuro continuo
      if (room && Math.random() < 0.4) {
        room.spawnParticle(this.x + (Math.random() - 0.5) * this.radius, this.y + (Math.random() - 0.5) * this.radius, (Math.random() - 0.5) * 30, -50 - Math.random() * 40, 5, '#86198f', 0.4);
      }

      // Daño por contacto continuo cada 0.35s si el jugador se para dentro
      if (player && this.hitCooldown <= 0) {
        const d = Math.hypot(player.x - this.x, player.y - this.y);
        if (d <= this.radius + player.radius) {
          this.hitCooldown = 0.35;
          player.takeDamage(this.damage, room);
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
      ctx.fillStyle = 'rgba(192, 38, 211, 0.18)';
      ctx.fill();
      ctx.strokeStyle = '#c026d3';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Círculo concéntrico que se expande
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius * prog, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(232, 121, 249, 0.35)';
      ctx.fill();
    } else {
      // Erupción oscura activa
      const alpha = Math.min(1, this.activeTimer / 0.4);
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = 
gba(112, 26, 117, );
      ctx.fill();
      ctx.strokeStyle = 
gba(244, 114, 182, );
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    ctx.restore();
  }
}

/**
 * Pilar de Juicio Divino Telegrafiado (CelestialJudgmentPillar)
 * Marca un haz de luz vertical en la sala, detona tras 0.85s y castiga el área.
 */
var CelestialJudgmentPillar = class CelestialJudgmentPillar extends BaseEntity {
  constructor(x, y, width = 60, height = 550, telegraphDuration = 0.85, damage = 26) {
    super(x, y, width / 2, '#fbbf24');
    this.width = width;
    this.height = height;
    this.telegraphDuration = telegraphDuration;
    this.timer = telegraphDuration;
    this.state = 'CHARGE'; // 'CHARGE' -> 'STRIKE' -> 'DONE'
    this.strikeDuration = 0.3;
    this.damage = damage;
    this.hasDamaged = false;
  }

  update(dt, player, room) {
    if (this.state === 'CHARGE') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = 'STRIKE';
        this.timer = this.strikeDuration;
        if (room) {
          for (let i = 0; i < 20; i++) {
            room.spawnParticle(this.x + (Math.random() - 0.5) * this.width, this.y + (Math.random() - 0.5) * this.height, (Math.random() - 0.5) * 160, (Math.random() - 0.5) * 160, 4, '#fef08a', 0.4);
          }
        }
      }
    } else if (this.state === 'STRIKE') {
      this.timer -= dt;
      if (!this.hasDamaged && player) {
        const halfW = this.width / 2;
        const halfH = this.height / 2;
        if (player.x >= this.x - halfW && player.x <= this.x + halfW &&
            player.y >= this.y - halfH && player.y <= this.y + halfH) {
          this.hasDamaged = true;
          player.takeDamage(this.damage, room);
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
      const prog = 1 - (this.timer / this.telegraphDuration);
      ctx.fillStyle = 
gba(251, 191, 36, );
      ctx.fillRect(this.x - halfW, this.y - halfH, this.width, this.height);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(this.x - halfW, this.y - halfH, this.width, this.height);
      ctx.setLineDash([]);
    } else if (this.state === 'STRIKE') {
      ctx.fillStyle = 'rgba(254, 240, 138, 0.85)';
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
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      // Oscilador de graves (sub-bass drop)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(32, now + 0.8);
      gain.gain.setValueAtTime(0.4, now);
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
      gain2.gain.setValueAtTime(0.25, now + 0.1);
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
      'GOLIAT': 'Despliega Ondas de Choque Sísmicas. ¡Atraviésalas usando el Dash [SHIFT] con I-Frames!',
      'NÉMESIS': 'Canaliza el Danmaku Lotus y Clones de Vacío. ¡Mantente en movimiento circular!',
      'ABISMO': 'Erupción de Géiseres Oscuros y Vórtice de Succión. ¡Aléjate de las grietas!',
      'SERAFÍN': 'Invoca Columnas de Juicio Celestial y Lanzas Divinas. ¡Observa los telegrafiados!'
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

    // 1. Invulnerabilidad temporal de transformación
    boss.invulnerableTimer = 1.25;

    // 2. Hit-Stop y Sacudida de Pantalla visceral
    if (window.CombatSystem) {
      window.CombatSystem.triggerHitStop(0.38);
      window.CombatSystem.triggerScreenShake(24, 0.75);
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

    // 6. Onda expansiva de empuje de seguridad (repele al jugador y limpia proyectiles)
    if (room) {
      // Dispersar proyectiles enemigos cercanos al jefe
      if (room.enemyProjectiles) {
        room.enemyProjectiles = room.enemyProjectiles.filter(p => {
          const d = Math.hypot(p.x - boss.x, p.y - boss.y);
          return d > 240;
        });
      }

      // Spawn de onda de choque visual
      room.hazards.push(new BossShockwaveHazard(boss.x, boss.y, boss.color || '#ef4444', 360, 520, 16));

      // Empujar suavemente al jugador si está pegado al boss para no castigarlo injustamente
      if (player) {
        const d = Math.hypot(player.x - boss.x, player.y - boss.y);
        if (d < 180) {
          const norm = MathUtils.normalize(player.x - boss.x, player.y - boss.y);
          player.x = MathUtils.clamp(boss.x + norm.x * 200, room.bounds.left + player.radius, room.bounds.right - player.radius);
          player.y = MathUtils.clamp(boss.y + norm.y * 200, room.bounds.top + player.radius, room.bounds.bottom - player.radius);
        }
      }

      // Explosión de partículas épicas
      for (let i = 0; i < 32; i++) {
        const ang = (i * Math.PI * 2) / 32;
        const spd = 120 + Math.random() * 180;
        room.spawnParticle(boss.x, boss.y, Math.cos(ang) * spd, Math.sin(ang) * spd, 6, boss.color || '#f43f5e', 0.65);
      }
    }
  }

  /**
   * Renderiza el aura de furia en Canvas alrededor del Jefe cuando está en Fase 2
   */
  drawEnrageAura(ctx, boss) {
    if (!boss || boss.phase !== 2 || boss.markedForDeletion) return;
    ctx.save();
    const time = Date.now() * 0.005;
    const pulse = Math.sin(time) * 6;
    const auraRadius = boss.radius + 12 + pulse;

    // Anillo de fuego pulsante
    ctx.beginPath();
    ctx.arc(boss.x, boss.y, auraRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.55)';
    ctx.lineWidth = 4;
    ctx.setLineDash([8, 6]);
    ctx.stroke();

    // Resplandor interior
    const grad = ctx.createRadialGradient(boss.x, boss.y, boss.radius * 0.5, boss.x, boss.y, auraRadius + 8);
    grad.addColorStop(0, 'rgba(220, 38, 38, 0)');
    grad.addColorStop(1, 'rgba(239, 68, 68, 0.28)');
    ctx.beginPath();
    ctx.arc(boss.x, boss.y, auraRadius + 8, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
  }

  /**
   * Ajuste de Vida Anti-Esponja de Daño (-22% HP) para combates ágiles y memorables
   */
  tuneBossHp(boss) {
    if (!boss || boss.hpTuned) return;
    boss.hpTuned = true;
    const tunedMax = Math.round(boss.maxHp * 0.78);
    const ratio = boss.hp / boss.maxHp;
    boss.maxHp = tunedMax;
    boss.hp = Math.round(tunedMax * ratio);
  }
}

// Instancia global
window.bossPhaseManager = new BossPhaseManager();
window.BossShockwaveHazard = BossShockwaveHazard;
window.AbyssalGeyserHazard = AbyssalGeyserHazard;
window.CelestialJudgmentPillar = CelestialJudgmentPillar;
