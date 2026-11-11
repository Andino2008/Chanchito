/**
 * ============================================================================
 * WEAPONS.JS - ARQUITECTURA MODULAR DE ARMAS "PLUG & PLAY" (v3.1)
 * ============================================================================
 * Archivo central e independiente para crear, configurar y registrar armas
 * sin tener que modificar `script.js`, `synergies.js`, `evolutions.js`,
 * `boss_phases.js`, `combat.js` ni `mobile_controls.js`.
 *
 * ----------------------------------------------------------------------------
 * CÓMO AGREGAR UN ARMA NUEVA EN 1 SOLO PASO:
 * ----------------------------------------------------------------------------
 * Copia un bloque `WeaponSystem.register({ ... })` al final de este archivo.
 *
 * Campos principales:
 *   - id:          Identificador único en MAYÚSCULAS (ej: 'MI_ARMA_NUEVA')
 *   - name:        Nombre visible en el HUD
 *   - symbol:      Emoji / ícono que muestra el HUD al equiparla
 *   - description: Descripción corta
 *   - starter:     `true` = el jugador arranca la partida con ella
 *                  `false` = arma extra/desbloqueable (equipable desde [F2] o eventos)
 *   - tags:        Etiquetas para activar reliquias, sinergias y evoluciones
 *                  automáticamente:
 *                    'PROJECTILE' -> Activa explosiones, meteoritos, rebotes y evos de proyectil
 *                    'BEAM'       -> Activa fisuras de hielo y evoluciones de rayo
 *                    'MELEE'      -> Activa hit-stop, corte de balas y ondas eléctricas
 *                    'PARRY'      -> Habilita sinergias de Parry
 *   - modes:       Lista de 1, 2 o más modos alternables con [ESPACIO] o el botón móvil:
 *                    type: 'PROJECTILE_FAN' | 'MELEE_ARC' | 'HITSCAN_BEAM' | 'CUSTOM'
 *   - drawWeapon:  (Opcional) Función para dibujar el arma en la mano del cerdito (0 fillText!)
 *   - evolutions:  (Opcional) Evoluciones propias al alcanzar Nivel 3 de un elemento
 * ============================================================================
 */

(function (root) {
  'use strict';

  const WEAPON_REGISTRY = new Map();
  const WEAPON_ORDER = [];

  // ==========================================================================
  // 1. UTILIDADES COMPARTIDAS DE SONIDO, CRÍTICOS, PROYECTILES Y EVOLUCIONES
  // ==========================================================================
  const WeaponHelper = {
    playSound(soundSpec) {
      if (!soundSpec || typeof soundManager === 'undefined' || !soundManager) return;
      if (typeof soundSpec === 'string') {
        soundManager.play(soundSpec, { volume: 0.75 });
      } else if (soundSpec.procedural) {
        soundManager.playProcedural(soundSpec.procedural, soundSpec.options || {});
      } else if (soundSpec.name) {
        soundManager.play(soundSpec.name, soundSpec.options || {});
      }
    },

    triggerFeedback(shake, hitStop) {
      const game = root.activeGameInstance;
      if (!game) return;
      if (shake && typeof game.triggerScreenShake === 'function') {
        game.triggerScreenShake(shake.intensity || 2.0, shake.duration || 0.08);
      }
      if (hitStop && typeof game.triggerHitStop === 'function') {
        game.triggerHitStop(hitStop);
      }
    },

    getRoomBounds(room) {
      if (room && room.bounds) return room.bounds;
      if (typeof ROOM_BOUNDS !== 'undefined') return ROOM_BOUNDS;
      return { left: 48, right: 912, top: 48, bottom: 592, centerX: 480, centerY: 320 };
    },

    /**
     * Motor 1: Disparo de proyectiles (Ráfagas, Orbes, Escopetas en abanico o Anillos 360°).
     */
    fireProjectilePattern(weapon, player, room, aimState, modeCfg) {
      if (!room || typeof Projectile === 'undefined') return;

      const baseCd = modeCfg.cooldown || 0.25;
      const baseDmg = modeCfg.damage || 20;
      const atkSpd = Math.max(0.1, player.attackSpeedMultiplier || 1);
      const dmgMult = player.damageMultiplier || 1;

      weapon.timer = baseCd / atkSpd;
      const effectiveDamage = Math.round(baseDmg * dmgMult);

      this.playSound(modeCfg.sound);
      this.triggerFeedback(modeCfg.screenShake, modeCfg.hitStop);

      const basePellets = modeCfg.pellets || 1;
      const bonusPellets = player.extraProjectiles || 0;
      const totalProjectiles = basePellets + bonusPellets;
      const spawnDist = player.radius + (modeCfg.spawnOffset !== undefined ? modeCfg.spawnOffset : 10);

      const activeEvo = typeof EvolutionManager !== 'undefined'
        ? EvolutionManager.getActiveEvolution(player, weapon)
        : null;

      for (let i = 0; i < totalProjectiles; i++) {
        let shotAngle;
        if (modeCfg.radial) {
          shotAngle = aimState.aimAngle + (i * Math.PI * 2) / Math.max(1, totalProjectiles);
        } else if (typeof modeCfg.spreadArc === 'number' && totalProjectiles > 1) {
          const t = i / (totalProjectiles - 1) - 0.5;
          shotAngle = aimState.aimAngle + t * modeCfg.spreadArc;
        } else {
          const step = modeCfg.spreadStep !== undefined ? modeCfg.spreadStep : 0.14;
          shotAngle = aimState.aimAngle + (i - (totalProjectiles - 1) / 2) * step;
        }

        if (modeCfg.randomSpread) {
          shotAngle += (Math.random() - 0.5) * modeCfg.randomSpread;
        }

        const dirX = Math.cos(shotAngle);
        const dirY = Math.sin(shotAngle);
        const startX = player.x + dirX * spawnDist;
        const startY = player.y + dirY * spawnDist;

        const rolledElement = player.rollElementForAttack();
        const elemLevel = player.getElementLevel(rolledElement);
        const speed = typeof modeCfg.speed === 'object'
          ? (modeCfg.speed.min + Math.random() * (modeCfg.speed.max - modeCfg.speed.min))
          : (modeCfg.speed || 560);

        const proj = new Projectile(
          startX,
          startY,
          dirX,
          dirY,
          speed,
          effectiveDamage,
          modeCfg.radius || 6.5,
          rolledElement,
          elemLevel
        );

        proj.lifeTime = modeCfg.lifeTime || 0.65;
        if (modeCfg.piercing) {
          proj.piercing = true;
          proj.maxPierces = modeCfg.maxPierces !== undefined ? modeCfg.maxPierces : 3;
        }
        if (modeCfg.bounces) {
          proj.bouncesLeft = modeCfg.bounces;
        }
        if (modeCfg.homingStrength) {
          proj.homingStrength = modeCfg.homingStrength;
        }
        if (modeCfg.isHeavyOrb) {
          proj.isHeavyOrb = true;
        }
        if (rolledElement === 'NONE' && modeCfg.color) {
          proj.color = modeCfg.color;
          if (modeCfg.borderColor) proj.borderColor = modeCfg.borderColor;
        }

        if (activeEvo) {
          proj.evolutionId = activeEvo.id;
          proj.color = activeEvo.color;
          proj.borderColor = '#ffffff';
          if (activeEvo.id === 'NAPALM_CLUSTER') {
            proj.damage = Math.round(effectiveDamage * (modeCfg.isHeavyOrb ? 1.35 : 1.25));
          }
        }

        if (typeof modeCfg.onCreateProjectile === 'function') {
          modeCfg.onCreateProjectile(proj, player, room, aimState, i, totalProjectiles);
        }

        room.projectiles.push(proj);
        if (player.itemManager && typeof player.itemManager.onShoot === 'function') {
          player.itemManager.onShoot(proj, room);
        }
      }
    },

    /**
     * Motor 2: Ataque Cuerpo a Cuerpo en Arco (Espadas, Guadañas, Martillos, Lanzas).
     * Integrado con `CombatSystem` (Hit-Stop, Corte de balas y Parry reflectivo).
     */
    updateMeleePattern(weapon, dt, player, room, aimState, modeCfg) {
      if (weapon.cooldownTimer > 0) weapon.cooldownTimer -= dt;

      const baseCooldown = modeCfg.cooldown || 0.35;
      const baseDuration = modeCfg.swingDuration || 0.14;
      const baseReach = modeCfg.reach || 100;
      const baseDamage = modeCfg.damage || 35;
      const arcAngle = modeCfg.arcAngle || Math.PI * 0.78;
      const atkSpd = Math.max(0.1, player.attackSpeedMultiplier || 1);
      const effectiveCooldown = baseCooldown / atkSpd;
      const effectiveDamage = Math.round(baseDamage * (player.damageMultiplier || 1));

      if (aimState.isAttacking && weapon.cooldownTimer <= 0 && weapon.swingTimer <= 0) {
        weapon.swingDuration = Math.max(0.07, baseDuration / atkSpd);
        weapon.swingTimer = weapon.swingDuration;
        weapon.cooldownTimer = effectiveCooldown;
        weapon.reach = baseReach;
        weapon.arcAngle = arcAngle;
        weapon.swingCenterAngle = aimState.aimAngle;
        weapon.currentSwingElement = player.rollElementForAttack();
        weapon.currentSwingElementLevel = player.getElementLevel(weapon.currentSwingElement);
        weapon.hitEnemies.clear();
        weapon.parriedProjectiles.clear();

        this.playSound(modeCfg.sound);

        if (typeof EvolutionManager !== 'undefined') {
          EvolutionManager.onSwordSwing(weapon, player, room, aimState);
        }

        if (typeof modeCfg.onSwingStart === 'function') {
          modeCfg.onSwingStart(weapon, player, room, aimState, effectiveDamage);
        }

        // Ondas de corte extra cuando el jugador tiene +1 Proyectil
        if (modeCfg.spawnWavesOnExtraProjectiles && (player.extraProjectiles || 0) > 0 && typeof Projectile !== 'undefined') {
          const count = player.extraProjectiles;
          const waveCfg = typeof modeCfg.spawnWavesOnExtraProjectiles === 'object'
            ? modeCfg.spawnWavesOnExtraProjectiles
            : {};
          const spreadStep = waveCfg.spreadStep || 0.22;
          for (let i = 0; i < count; i++) {
            const offset = (i - (count - 1) / 2) * spreadStep;
            const angle = aimState.aimAngle + offset;
            const dx = Math.cos(angle);
            const dy = Math.sin(angle);
            const waveElement = player.rollElementForAttack();
            const waveLevel = player.getElementLevel(waveElement);
            const waveProj = new Projectile(
              player.x + dx * (player.radius + 12),
              player.y + dy * (player.radius + 12),
              dx,
              dy,
              waveCfg.speed || 480,
              Math.round(effectiveDamage * (waveCfg.damageMult || 0.55)),
              waveCfg.radius || 9,
              waveElement,
              waveLevel
            );
            waveProj.lifeTime = waveCfg.lifeTime || 0.65;
            waveProj.piercing = true;
            waveProj.maxPierces = waveCfg.maxPierces || 2;
            room.projectiles.push(waveProj);
            if (player.itemManager) player.itemManager.onShoot(waveProj, room);
          }
        }
      }

      if (weapon.swingTimer > 0) {
        weapon.swingTimer -= dt;
        weapon.swingCenterAngle = aimState.aimAngle;

        // 1. Interacción con proyectiles enemigos (Parry o Corte)
        if (modeCfg.canParry || modeCfg.sliceProjectiles !== false) {
          if (typeof CombatSystem !== 'undefined') {
            CombatSystem.processSwordProjectileInteractions(weapon, player, room, aimState);
          } else if (modeCfg.canParry && room.enemyProjectiles && room.enemyProjectiles.length > 0) {
            for (const ep of room.enemyProjectiles) {
              if (ep.markedForDeletion || weapon.parriedProjectiles.has(ep)) continue;
              const dist = Math.hypot(ep.x - player.x, ep.y - player.y);
              if (dist <= weapon.reach + ep.radius + 10) {
                ep.markedForDeletion = true;
                weapon.parriedProjectiles.add(ep);
              }
            }
          }
        }

        // 2. Impactos Melee contra enemigos
        for (const enemy of room.enemies) {
          if (enemy.markedForDeletion || enemy.isBurrowed || weapon.hitEnemies.has(enemy)) continue;

          const dx = enemy.x - player.x;
          const dy = enemy.y - player.y;
          const dist = Math.hypot(dx, dy);

          if (dist <= weapon.reach + enemy.radius) {
            const angleToEnemy = Math.atan2(dy, dx);
            const diff = Math.abs(MathUtils.angleDiff(angleToEnemy, weapon.swingCenterAngle));

            if (diff <= weapon.arcAngle / 2 || dist <= player.radius + enemy.radius + 8) {
              weapon.hitEnemies.add(enemy);
              if (typeof CombatSystem !== 'undefined') {
                CombatSystem.processSwordEnemyImpact(weapon, player, room, enemy, aimState);
              } else {
                enemy.takeDamage(effectiveDamage, 0, 0, weapon.currentSwingElement);
              }
              if (typeof modeCfg.onHitEnemy === 'function') {
                modeCfg.onHitEnemy(weapon, player, room, enemy, effectiveDamage);
              }
            }
          }
        }
      }
    },

    /**
     * Motor 3: Rayo / Láser Hitscan (con Carga o Disparo Instantáneo de Pulso).
     */
    updateBeamPattern(weapon, dt, player, room, aimState, modeCfg) {
      if (weapon.cooldownTimer > 0) weapon.cooldownTimer -= dt;

      for (let i = weapon.activeBeams.length - 1; i >= 0; i--) {
        weapon.activeBeams[i].timer -= dt;
        if (weapon.activeBeams[i].timer <= 0) {
          weapon.activeBeams.splice(i, 1);
        }
      }

      const chargeTime = modeCfg.chargeTime || 0;
      const atkSpd = Math.max(0.1, player.attackSpeedMultiplier || 1);

      if (chargeTime > 0) {
        const maxCharge = Math.max(0.25, chargeTime / atkSpd);
        if (aimState.isAttacking && weapon.cooldownTimer <= 0) {
          weapon.currentCharge += dt;
          if (weapon.currentCharge >= maxCharge) {
            this.fireHitscanBeams(weapon, player, room, aimState, modeCfg);
            weapon.currentCharge = 0;
            weapon.cooldownTimer = (modeCfg.cooldown || 0.35) / atkSpd;
          }
        } else if (weapon.currentCharge > 0 && !aimState.isAttacking) {
          weapon.currentCharge = 0;
        }
      } else {
        weapon.currentCharge = 0;
        const pulseCd = (modeCfg.cooldown || 0.28) / atkSpd;
        if (aimState.isAttacking && weapon.cooldownTimer <= 0) {
          this.fireHitscanBeams(weapon, player, room, aimState, modeCfg);
          weapon.cooldownTimer = pulseCd;
        }
      }
    },

    fireHitscanBeams(weapon, player, room, aimState, modeCfg) {
      this.playSound(modeCfg.sound);
      this.triggerFeedback(modeCfg.screenShake, modeCfg.hitStop);

      const beamCount = (modeCfg.beams || 1) + (player.extraProjectiles || 0);
      const spreadStep = modeCfg.spreadStep !== undefined ? modeCfg.spreadStep : 0.12;
      const effectiveDamage = Math.round((modeCfg.damage || 100) * (player.damageMultiplier || 1));
      const beamHalfWidth = modeCfg.halfWidth || 16;
      const beamLength = modeCfg.beamLength || weapon.beamMaxLength || 1450;
      const knockback = modeCfg.knockback !== undefined ? modeCfg.knockback : 300;
      const beamDuration = modeCfg.beamDuration || 0.25;
      const rb = this.getRoomBounds(room);

      for (let i = 0; i < beamCount; i++) {
        const angleOffset = (i - (beamCount - 1) / 2) * spreadStep;
        const angle = aimState.aimAngle + angleOffset;
        const dirX = Math.cos(angle);
        const dirY = Math.sin(angle);

        const startX = player.x + dirX * (player.radius + 6);
        const startY = player.y + dirY * (player.radius + 6);
        const wallHit = MathUtils.getRayWallIntersection(startX, startY, dirX, dirY, beamLength, rb);
        const endX = wallHit.x;
        const endY = wallHit.y;

        const beamElement = player.rollElementForAttack();
        const beamElemLevel = player.getElementLevel(beamElement);
        const elemCfg = (typeof ELEMENTS !== 'undefined' && ELEMENTS[beamElement])
          ? ELEMENTS[beamElement]
          : { color: modeCfg.defaultColor || '#d946ef' };

        for (const enemy of room.enemies) {
          if (enemy.markedForDeletion || enemy.isBurrowed) continue;

          const distToBeam = MathUtils.pointToSegmentDistance(
            enemy.x,
            enemy.y,
            startX,
            startY,
            endX,
            endY
          );

          if (distToBeam <= enemy.radius + beamHalfWidth) {
            if (enemy.isGuarding && typeof enemy.onGuardedHit === 'function') {
              enemy.onGuardedHit(player, room, player);
              continue;
            }
            let laserHitDamage = effectiveDamage;
            if (player.critChance > 0 && Math.random() < player.critChance) {
              laserHitDamage *= 2.0;
              room.spawnParticle(enemy.x, enemy.y, '#fef08a', modeCfg.chargeTime > 0 ? 8 : 5);
            }
            const dealt = enemy.takeDamage(laserHitDamage, dirX * knockback, dirY * knockback, beamElement);
            if (beamElement !== 'NONE' && !enemy.markedForDeletion) {
              enemy.applyElementalEffect(beamElement, room, beamElemLevel);
            }
            const attackContext = { isLaser: true, element: beamElement, damage: dealt, x: enemy.x, y: enemy.y };
            if (player.itemManager) {
              player.itemManager.onHit(attackContext, enemy, room, dealt);
            }
          }
        }

        const beamColor = beamElement === 'NONE'
          ? (modeCfg.defaultColor || '#d946ef')
          : elemCfg.color;

        const beamEntry = {
          x1: startX,
          y1: startY,
          x2: endX,
          y2: endY,
          color: beamColor,
          halfWidth: beamHalfWidth,
          timer: beamDuration,
          maxTimer: beamDuration
        };

        if (modeCfg.triggerEvolutionHook && typeof EvolutionManager !== 'undefined') {
          EvolutionManager.onLaserFired(weapon, player, room, aimState, beamEntry);
        }
        if (typeof modeCfg.onBeamFired === 'function') {
          modeCfg.onBeamFired(weapon, player, room, aimState, beamEntry);
        }

        weapon.activeBeams.push(beamEntry);

        const sparkCount = modeCfg.wallSparkCount !== undefined ? modeCfg.wallSparkCount : 6;
        if (wallHit.hitWall && room && typeof room.spawnParticle === 'function' && sparkCount > 0) {
          for (let sp = 0; sp < sparkCount; sp++) {
            const sparkAng = Math.atan2(-dirY, -dirX) + (Math.random() - 0.5) * 1.5;
            const sparkSpd = 80 + Math.random() * 130;
            room.spawnParticle(
              endX,
              endY,
              Math.cos(sparkAng) * sparkSpd,
              Math.sin(sparkAng) * sparkSpd,
              modeCfg.chargeTime > 0 ? 4 : 3,
              beamColor || '#f0abfc',
              0.24
            );
          }
        }
      }
    },

    drawActiveBeams(ctx, weapon, player, aimState, modeCfg) {
      ctx.save();

      if (modeCfg && modeCfg.chargeTime > 0 && weapon.currentCharge > 0) {
        const maxCharge = weapon.getEffectiveMaxCharge(player);
        const ratio = MathUtils.clamp(weapon.currentCharge / maxCharge, 0, 1);
        const beamCount = (modeCfg.beams || 1) + (player.extraProjectiles || 0);
        const spreadStep = modeCfg.spreadStep !== undefined ? modeCfg.spreadStep : 0.12;
        const beamLength = modeCfg.beamLength || weapon.beamMaxLength || 1450;
        const room = root.activeGameInstance ? root.activeGameInstance.currentRoom : null;
        const rb = this.getRoomBounds(room);

        for (let i = 0; i < beamCount; i++) {
          const angleOffset = (i - (beamCount - 1) / 2) * spreadStep;
          const angle = aimState.aimAngle + angleOffset;
          const dirX = Math.cos(angle);
          const dirY = Math.sin(angle);

          const startX = player.x + dirX * (player.radius + 4);
          const startY = player.y + dirY * (player.radius + 4);
          const wallHit = MathUtils.getRayWallIntersection(startX, startY, dirX, dirY, beamLength, rb);

          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(wallHit.x, wallHit.y);
          ctx.strokeStyle = `${modeCfg.chargeColor || 'rgba(232, 121, 249, '}${0.2 + ratio * 0.7})`;
          ctx.lineWidth = 1 + ratio * 6;
          ctx.setLineDash([8, 6]);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.beginPath();
          ctx.arc(startX, startY, 4 + ratio * 12, 0, Math.PI * 2);
          ctx.fillStyle = modeCfg.chargeCoreColor || '#f0abfc';
          ctx.fill();
        }

        const barW = 44;
        const barH = 6;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(player.x - barW / 2, player.y - player.radius - 18, barW, barH);
        ctx.fillStyle = modeCfg.chargeBarColor || '#e879f9';
        ctx.fillRect(player.x - barW / 2, player.y - player.radius - 18, barW * ratio, barH);
      }

      for (const beam of weapon.activeBeams) {
        const alpha = beam.timer / beam.maxTimer;
        const hw = beam.halfWidth || 16;

        ctx.beginPath();
        ctx.moveTo(beam.x1, beam.y1);
        ctx.lineTo(beam.x2, beam.y2);
        ctx.strokeStyle = beam.color;
        ctx.globalAlpha = alpha * 0.75;
        ctx.lineWidth = hw * 2 * alpha;
        ctx.lineCap = 'round';
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(beam.x1, beam.y1);
        ctx.lineTo(beam.x2, beam.y2);
        ctx.strokeStyle = '#ffffff';
        ctx.globalAlpha = alpha;
        ctx.lineWidth = Math.max(2, hw * 0.65 * alpha);
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      ctx.restore();
    },

    drawMeleeDefault(ctx, weapon, player, aimState, modeCfg) {
      const isParry = Boolean(modeCfg && modeCfg.canParry);
      if (weapon.swingTimer <= 0) {
        ctx.save();
        ctx.translate(player.x, player.y);
        ctx.rotate(aimState.aimAngle + 0.45);
        ctx.fillStyle = isParry ? '#38bdf8' : (modeCfg.idleColor || '#cbd5e1');
        ctx.fillRect(player.radius, -2, isParry ? 22 : 28, isParry ? 4 : 5);
        ctx.restore();
        return;
      }

      const elemCfg = (typeof ELEMENTS !== 'undefined' && ELEMENTS[weapon.currentSwingElement])
        ? ELEMENTS[weapon.currentSwingElement]
        : { color: '#f8fafc' };
      const progress = 1 - weapon.swingTimer / weapon.swingDuration;
      const startAngle = weapon.swingCenterAngle - weapon.arcAngle / 2;
      const endAngle = weapon.swingCenterAngle + weapon.arcAngle / 2;
      const currentBladeAngle = startAngle + (endAngle - startAngle) * progress;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      ctx.arc(player.x, player.y, weapon.reach, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = isParry
        ? 'rgba(56, 189, 248, 0.25)'
        : weapon.currentSwingElement === 'NONE'
        ? 'rgba(226, 232, 240, 0.32)'
        : `${elemCfg.color}44`;
      ctx.fill();
      ctx.lineWidth = isParry ? 2.5 : 3;
      ctx.strokeStyle = isParry ? '#38bdf8' : elemCfg.color;
      ctx.stroke();

      ctx.translate(player.x, player.y);
      ctx.rotate(currentBladeAngle);
      ctx.fillStyle = isParry ? '#7dd3fc' : elemCfg.color;
      ctx.fillRect(player.radius - 4, isParry ? -3 : -5, weapon.reach - player.radius + 4, isParry ? 6 : 10);
      ctx.fillStyle = isParry ? '#0284c7' : '#f59e0b';
      ctx.fillRect(player.radius - 6, isParry ? -7 : -10, 6, isParry ? 14 : 20);
      ctx.restore();
    }
  };

  // ==========================================================================
  // 2. CLASE BASE Y CLASE UNIVERSAL `ModularWeapon`
  // ==========================================================================
  class Weapon {
    constructor(name, description) {
      this.name = name || 'Arma';
      this.description = description || '';
      this.symbol = '⚔️';
      this.tags = [];
      this.mode = 0;
    }

    hasTag(tag) {
      if (!tag || !Array.isArray(this.tags)) return false;
      const upper = String(tag).toUpperCase();
      return this.tags.some((t) => String(t).toUpperCase() === upper);
    }

    isParrying() {
      return false;
    }

    getModeBadge() {
      return '[ESPACIO] MODO: NORMAL';
    }

    getShortModeLabel() {
      return 'NORMAL';
    }

    cancel() {}
    update(dt, player, room, aimState) {}
    draw(ctx, player, aimState) {}
  }

  class ModularWeapon extends Weapon {
    constructor(def) {
      super(def.name, def.description);
      this.id = def.id;
      this.def = def;
      this.symbol = def.symbol || '🔫';
      this.tags = Array.isArray(def.tags) ? def.tags.slice() : [];
      this.modes = Array.isArray(def.modes) && def.modes.length > 0
        ? def.modes
        : [{ id: 'DEFAULT', badge: '[ESPACIO] MODO: NORMAL', shortLabel: 'NORMAL', type: 'PROJECTILE_FAN' }];
      this.mode = 0;

      // Estado de ataque unificado (compatible con Proyectiles, Melee y Láser)
      this.timer = 0;
      this.cooldownTimer = 0;
      this.swingTimer = 0;
      this.swingDuration = 0.14;
      this.reach = 98;
      this.arcAngle = Math.PI * 0.76;
      this.swingCenterAngle = 0;
      this.currentSwingElement = 'NONE';
      this.currentSwingElementLevel = 1;
      this.hitEnemies = new Set();
      this.parriedProjectiles = new Set();

      // Estado para armas tipo BEAM
      this.currentCharge = 0;
      this.baseMaxCharge = 0.92;
      this.beamMaxLength = 1450;
      this.activeBeams = [];
      for (const m of this.modes) {
        if (m.type === 'HITSCAN_BEAM') {
          if (m.chargeTime) this.baseMaxCharge = m.chargeTime;
          if (m.beamLength) this.beamMaxLength = Math.max(this.beamMaxLength, m.beamLength);
        }
      }
    }

    getModeConfig(index = this.mode) {
      return this.modes[index] || this.modes[0];
    }

    get currentMode() {
      return this.getShortModeLabel();
    }

    toggleMode() {
      if (this.modes.length > 1) {
        this.mode = (this.mode + 1) % this.modes.length;
      }
      this.currentCharge = 0;
      if (typeof this.def.onToggleMode === 'function') {
        this.def.onToggleMode(this);
      }
      return this.mode;
    }

    getModeBadge() {
      const cfg = this.getModeConfig();
      if (cfg && cfg.badge) return cfg.badge;
      return `[ESPACIO] MODO: ${this.getShortModeLabel()}`;
    }

    getShortModeLabel() {
      const cfg = this.getModeConfig();
      return (cfg && (cfg.shortLabel || cfg.id)) || 'NORMAL';
    }

    isModeParry() {
      const cfg = this.getModeConfig();
      return Boolean(cfg && cfg.canParry);
    }

    isParrying() {
      return this.isModeParry() && this.swingTimer > 0;
    }

    getActiveMeleeDamage() {
      const cfg = this.getModeConfig();
      return Number((cfg && cfg.damage) || 35);
    }

    getActiveMeleeKnockback() {
      const cfg = this.getModeConfig();
      if (cfg && typeof cfg.knockback === 'number') return cfg.knockback;
      return this.isModeParry() ? 240 : 480;
    }

    getEffectiveMaxCharge(player) {
      const cfg = this.getModeConfig();
      const base = (cfg && cfg.chargeTime) ? cfg.chargeTime : this.baseMaxCharge;
      const atkSpd = Math.max(0.1, (player && player.attackSpeedMultiplier) || 1);
      return Math.max(0.28, base / atkSpd);
    }

    cancel() {
      this.timer = 0;
      this.cooldownTimer = 0;
      this.swingTimer = 0;
      this.currentCharge = 0;
      this.hitEnemies.clear();
      this.parriedProjectiles.clear();
      if (typeof this.def.onCancel === 'function') {
        this.def.onCancel(this);
      }
    }

    update(dt, player, room, aimState) {
      const modeCfg = this.getModeConfig();
      if (!modeCfg) return;

      if (modeCfg.type === 'PROJECTILE_FAN') {
        if (this.timer > 0) this.timer -= dt;
        if (aimState.isAttacking && this.timer <= 0) {
          WeaponHelper.fireProjectilePattern(this, player, room, aimState, modeCfg);
        }
      } else if (modeCfg.type === 'MELEE_ARC') {
        WeaponHelper.updateMeleePattern(this, dt, player, room, aimState, modeCfg);
      } else if (modeCfg.type === 'HITSCAN_BEAM') {
        WeaponHelper.updateBeamPattern(this, dt, player, room, aimState, modeCfg);
      } else if (modeCfg.type === 'CUSTOM' && typeof modeCfg.onUpdate === 'function') {
        modeCfg.onUpdate(this, dt, player, room, aimState, modeCfg);
      }
    }

    draw(ctx, player, aimState) {
      const modeCfg = this.getModeConfig();

      if (modeCfg && modeCfg.type === 'CUSTOM' && typeof modeCfg.onDraw === 'function') {
        modeCfg.onDraw(ctx, this, player, aimState, modeCfg);
        return;
      }

      if (modeCfg && modeCfg.type === 'HITSCAN_BEAM') {
        WeaponHelper.drawActiveBeams(ctx, this, player, aimState, modeCfg);
      }

      if (typeof this.def.drawWeapon === 'function') {
        ctx.save();
        this.def.drawWeapon(ctx, player, aimState, modeCfg, this);
        ctx.restore();
        return;
      }

      if (modeCfg && modeCfg.type === 'MELEE_ARC') {
        WeaponHelper.drawMeleeDefault(ctx, this, player, aimState, modeCfg);
        return;
      }

      if (modeCfg && modeCfg.type === 'PROJECTILE_FAN') {
        ctx.save();
        ctx.translate(player.x, player.y);
        ctx.rotate(aimState.aimAngle);
        ctx.fillStyle = modeCfg.color || '#38bdf8';
        ctx.fillRect(player.radius - 2, -3.5, 14, 7);
        ctx.restore();
      }
    }
  }

  // ==========================================================================
  // 3. REGISTRO Y API PÚBLICA (`WeaponSystem`)
  // ==========================================================================
  const WeaponSystem = {
    register(def) {
      if (!def || !def.id) {
        throw new Error('WeaponSystem.register requiere un objeto con campo `id`.');
      }
      const normalizedId = String(def.id).toUpperCase();
      const entry = Object.assign({
        starter: true,
        symbol: '🔫',
        tags: [],
        modes: []
      }, def, { id: normalizedId });

      if (!WEAPON_REGISTRY.has(normalizedId)) {
        WEAPON_ORDER.push(normalizedId);
      }
      WEAPON_REGISTRY.set(normalizedId, entry);
      return entry;
    },

    getWeaponDef(idOrName) {
      if (!idOrName) return null;
      const upper = String(idOrName).toUpperCase();
      if (WEAPON_REGISTRY.has(upper)) return WEAPON_REGISTRY.get(upper);
      for (const id of WEAPON_ORDER) {
        const def = WEAPON_REGISTRY.get(id);
        if (def && def.name === idOrName) return def;
      }
      return null;
    },

    getAllWeaponDefs() {
      return WEAPON_ORDER.map((id) => WEAPON_REGISTRY.get(id)).filter(Boolean);
    },

    getStarterWeaponDefs() {
      return this.getAllWeaponDefs().filter((def) => def.starter !== false);
    },

    createWeapon(idOrName) {
      const def = this.getWeaponDef(idOrName);
      if (!def) return null;
      if (typeof def.factory === 'function') {
        return def.factory(def);
      }
      return new ModularWeapon(def);
    },

    createPlayerArsenal(player) {
      const starters = this.getStarterWeaponDefs();
      const weapons = [];
      for (const def of starters) {
        const instance = this.createWeapon(def.id);
        if (instance) weapons.push(instance);
      }
      return weapons;
    },

    /**
     * Equipa un arma adicional en tiempo real (desde cofres, eventos o Consola F2).
     * Si el jugador ya la tiene, cambia a ella sin duplicarla.
     */
    giveWeapon(player, idOrName, selectImmediately = true) {
      if (!player) return null;
      if (!Array.isArray(player.weapons)) player.weapons = [];
      const def = this.getWeaponDef(idOrName);
      if (!def) return null;

      const existingIdx = player.weapons.findIndex((w) => w.id === def.id || w.name === def.name);
      if (existingIdx >= 0) {
        if (selectImmediately && typeof player.selectWeapon === 'function') {
          player.selectWeapon(existingIdx);
        }
        return player.weapons[existingIdx];
      }

      const instance = this.createWeapon(def.id);
      if (!instance) return null;
      player.weapons.push(instance);
      const newIdx = player.weapons.length - 1;

      if (selectImmediately && typeof player.selectWeapon === 'function') {
        player.selectWeapon(newIdx);
      } else if (player.ui) {
        player.ui.updateStats(player);
      }

      if (player.ui) {
        player.ui.showToast(`${instance.symbol} ¡ARMA EQUIPADA: ${instance.name.toUpperCase()}! [Slot ${newIdx + 1}]`);
      }
      return instance;
    },

    weaponHasTag(weapon, tag) {
      if (!weapon || !tag) return false;
      const upper = String(tag).toUpperCase();
      if (typeof weapon.hasTag === 'function' && weapon.hasTag(upper)) {
        return true;
      }
      if (Array.isArray(weapon.tags) && weapon.tags.some((t) => String(t).toUpperCase() === upper)) {
        return true;
      }
      // Compatibilidad retroactiva si un arma legacy se instanció manualmente
      if (upper === 'BEAM' && (weapon.name === 'Rayo Láser' || (root.ChargeLaserWeapon && weapon instanceof root.ChargeLaserWeapon))) return true;
      if (upper === 'PROJECTILE' && (weapon.name === 'Pelotas' || (root.ProjectileWeapon && weapon instanceof root.ProjectileWeapon))) return true;
      if ((upper === 'MELEE' || upper === 'PARRY') && (weapon.name === 'Espada Larga' || (root.LongSwordWeapon && weapon instanceof root.LongSwordWeapon))) return true;
      return false;
    },

    isWeaponParrying(weapon) {
      if (!weapon) return false;
      if (typeof weapon.isParrying === 'function') {
        return weapon.isParrying();
      }
      return Boolean(weapon.mode === 0 && weapon.swingTimer > 0);
    }
  };

  // ==========================================================================
  // 4. CATÁLOGO DE ARMAS BASE + ARMAS DEMO LISTAS PARA USAR
  // ==========================================================================

  // --------------------------------------------------------------------------
  // ARMA #1: PELOTAS (Clásica)
  // --------------------------------------------------------------------------
  WeaponSystem.register({
    id: 'BALLS',
    name: 'Pelotas',
    symbol: '🔮',
    description: 'Dispara proyectiles continuos o grandes orbes de impacto',
    starter: true,
    tags: ['PROJECTILE'],
    modes: [
      {
        id: 'BURST',
        badge: '[ESPACIO] MODO: RÁFAGA',
        shortLabel: 'RÁFAGA',
        type: 'PROJECTILE_FAN',
        cooldown: 0.11,
        damage: 18,
        pellets: 1,
        spreadStep: 0.14,
        speed: 620,
        radius: 6.5,
        lifeTime: 0.44,
        spawnOffset: 8,
        sound: { name: 'pelotita', options: { volume: 0.65, pitchJitter: 0.05 } }
      },
      {
        id: 'HEAVY_ORB',
        badge: '[ESPACIO] MODO: ORBE PESADO',
        shortLabel: 'ORBE PESADO',
        type: 'PROJECTILE_FAN',
        cooldown: 0.42,
        damage: 55,
        pellets: 1,
        spreadStep: 0.18,
        speed: 390,
        radius: 18,
        lifeTime: 1.6,
        spawnOffset: 14,
        piercing: true,
        maxPierces: 3,
        isHeavyOrb: true,
        sound: { name: 'pelotita', options: { volume: 0.95, pitchJitter: 0.02, attenuation: 0.2 } },
        screenShake: { intensity: 2.0, duration: 0.09 }
      }
    ],
    drawWeapon(ctx, player, aimState, modeCfg, weapon) {
      ctx.translate(player.x, player.y);
      ctx.rotate(aimState.aimAngle);
      if (weapon.mode === 0) {
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(player.radius - 2, -3.5, 12, 7);
        ctx.fillStyle = '#f87171';
        ctx.fillRect(player.radius + 4, -2, 6, 4);
      } else {
        ctx.fillStyle = '#b91c1c';
        ctx.fillRect(player.radius - 2, -6, 14, 12);
        ctx.beginPath();
        ctx.arc(player.radius + 14, 0, 7, 0, Math.PI * 2);
        ctx.fillStyle = '#f87171';
        ctx.fill();
        ctx.strokeStyle = '#fca5a5';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  });

  // --------------------------------------------------------------------------
  // ARMA #2: RAYO LÁSER (Clásica)
  // --------------------------------------------------------------------------
  WeaponSystem.register({
    id: 'LASER',
    name: 'Rayo Láser',
    symbol: '⚡',
    description: 'Haz colosal de alta potencia o ráfagas rápidas de pulso',
    starter: true,
    tags: ['BEAM'],
    modes: [
      {
        id: 'MEGA_BEAM',
        badge: '[ESPACIO] MODO: MEGA HAZ',
        shortLabel: 'MEGA HAZ',
        type: 'HITSCAN_BEAM',
        chargeTime: 0.92,
        cooldown: 0.35,
        damage: 175,
        beamLength: 1450,
        halfWidth: 22,
        knockback: 380,
        beamDuration: 0.30,
        spreadStep: 0.12,
        defaultColor: '#d946ef',
        chargeColor: 'rgba(232, 121, 249, ',
        wallSparkCount: 8,
        triggerEvolutionHook: true,
        sound: { name: 'laser', options: { volume: 1.0, pitchJitter: 0.02, attenuation: 0.2 } },
        screenShake: { intensity: 5.5, duration: 0.22 },
        hitStop: 0.05
      },
      {
        id: 'PULSE_LASER',
        badge: '[ESPACIO] MODO: PULSO LÁSER',
        shortLabel: 'PULSO LÁSER',
        type: 'HITSCAN_BEAM',
        chargeTime: 0,
        cooldown: 0.28,
        damage: 38,
        beamLength: 540,
        halfWidth: 9,
        knockback: 180,
        beamDuration: 0.14,
        spreadStep: 0.15,
        defaultColor: '#38bdf8',
        wallSparkCount: 4,
        triggerEvolutionHook: false,
        sound: { name: 'laser', options: { volume: 0.75, pitchJitter: 0.08, attenuation: 0.4 } },
        screenShake: { intensity: 2.0, duration: 0.08 }
      }
    ]
  });

  // --------------------------------------------------------------------------
  // ARMA #3: ESPADA LARGA (Clásica)
  // --------------------------------------------------------------------------
  WeaponSystem.register({
    id: 'SWORD',
    name: 'Espada Larga',
    symbol: '⚔️',
    description: 'Parry deflector de proyectiles o tajo pesado devastador',
    starter: true,
    tags: ['MELEE', 'PARRY'],
    modes: [
      {
        id: 'PARRY',
        badge: '[ESPACIO] MODO: PARRY',
        shortLabel: 'PARRY',
        type: 'MELEE_ARC',
        cooldown: 0.28,
        swingDuration: 0.11,
        reach: 96,
        arcAngle: Math.PI * 0.72,
        damage: 30,
        knockback: 240,
        canParry: true,
        sliceProjectiles: true,
        spawnWavesOnExtraProjectiles: false,
        sound: { name: 'espada', options: { volume: 0.85, pitchJitter: 0.08 } }
      },
      {
        id: 'HEAVY_SLASH',
        badge: '[ESPACIO] MODO: TAJO PESADO',
        shortLabel: 'TAJO PESADO',
        type: 'MELEE_ARC',
        cooldown: 0.58,
        swingDuration: 0.20,
        reach: 118,
        arcAngle: Math.PI * 0.88,
        damage: 95,
        knockback: 480,
        canParry: false,
        sliceProjectiles: true,
        spawnWavesOnExtraProjectiles: true,
        sound: { name: 'espada', options: { volume: 0.85, pitchJitter: 0.02 } }
      }
    ]
  });

  // --------------------------------------------------------------------------
  // ARMA DEMO #4: ESCOPETA ABISAL (Pone `starter: true` si querés arrancar con ella)
  // --------------------------------------------------------------------------
  WeaponSystem.register({
    id: 'ABYSS_SHOTGUN',
    name: 'Escopeta Abisal',
    symbol: '💥',
    description: 'Abanico brutal de perdigones o posta perforante concentrada',
    starter: false,
    tags: ['PROJECTILE'],
    modes: [
      {
        id: 'BUCKSHOT',
        badge: '[ESPACIO] MODO: PERDIGONES',
        shortLabel: 'PERDIGONES',
        type: 'PROJECTILE_FAN',
        cooldown: 0.52,
        damage: 15,
        pellets: 6,
        spreadArc: 0.52,
        randomSpread: 0.05,
        speed: 680,
        radius: 5.5,
        lifeTime: 0.30,
        spawnOffset: 10,
        color: '#fb923c',
        borderColor: '#fef08a',
        sound: { name: 'pelotita', options: { volume: 0.9, pitchJitter: 0.04 } },
        screenShake: { intensity: 2.8, duration: 0.09 }
      },
      {
        id: 'ABYSS_SLUG',
        badge: '[ESPACIO] MODO: POSTA PESADA',
        shortLabel: 'POSTA',
        type: 'PROJECTILE_FAN',
        cooldown: 0.68,
        damage: 88,
        pellets: 1,
        spreadStep: 0.14,
        speed: 820,
        radius: 11,
        lifeTime: 0.78,
        spawnOffset: 12,
        piercing: true,
        maxPierces: 4,
        bounces: 1,
        color: '#f43f5e',
        borderColor: '#ffffff',
        sound: { name: 'pelotita', options: { volume: 1.0, pitchJitter: 0.02 } },
        screenShake: { intensity: 3.8, duration: 0.12 }
      }
    ],
    drawWeapon(ctx, player, aimState, modeCfg) {
      ctx.translate(player.x, player.y);
      ctx.rotate(aimState.aimAngle);
      ctx.fillStyle = '#334155';
      ctx.fillRect(player.radius - 2, -4.5, 18, 9);
      ctx.fillStyle = modeCfg.id === 'BUCKSHOT' ? '#fb923c' : '#f43f5e';
      ctx.fillRect(player.radius + 11, -3.5, 6, 7);
    }
  });

  // --------------------------------------------------------------------------
  // ARMA DEMO #5: CHAKRAM ESTELAR (Rebota en paredes y dispara en anillo 360°)
  // --------------------------------------------------------------------------
  WeaponSystem.register({
    id: 'STAR_CHAKRAM',
    name: 'Chakram Estelar',
    symbol: '🌀',
    description: 'Discos rebotantes con teledirigido o ráfaga radial 360°',
    starter: false,
    tags: ['PROJECTILE'],
    modes: [
      {
        id: 'RICOCHET_DISC',
        badge: '[ESPACIO] MODO: REBOTE GUIADO',
        shortLabel: 'REBOTE',
        type: 'PROJECTILE_FAN',
        cooldown: 0.30,
        damage: 34,
        pellets: 2,
        spreadStep: 0.22,
        speed: 520,
        radius: 9,
        lifeTime: 1.35,
        bounces: 2,
        homingStrength: 2.2,
        color: '#2dd4bf',
        borderColor: '#ffffff',
        sound: { name: 'pelotita', options: { volume: 0.7, pitchJitter: 0.08 } }
      },
      {
        id: 'NOVA_RING',
        badge: '[ESPACIO] MODO: ANILLO 360°',
        shortLabel: 'ANILLO 360°',
        type: 'PROJECTILE_FAN',
        cooldown: 0.65,
        damage: 26,
        pellets: 8,
        radial: true,
        speed: 440,
        radius: 8,
        lifeTime: 0.72,
        piercing: true,
        maxPierces: 2,
        color: '#c084fc',
        borderColor: '#f5d0fe',
        sound: { name: 'pelotita', options: { volume: 0.85, pitchJitter: 0.03 } },
        screenShake: { intensity: 2.2, duration: 0.08 }
      }
    ],
    drawWeapon(ctx, player, aimState, modeCfg) {
      ctx.translate(player.x, player.y);
      ctx.rotate(aimState.aimAngle);
      ctx.beginPath();
      ctx.arc(player.radius + 10, 0, 7, 0, Math.PI * 2);
      ctx.strokeStyle = modeCfg.color || '#2dd4bf';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
  });

  // ==========================================================================
  // 5. ALIAS RETROCOMPATIBLES DE LAS CLASES CLÁSICAS
  // ==========================================================================
  class ProjectileWeapon extends ModularWeapon {
    constructor() {
      super(WeaponSystem.getWeaponDef('BALLS'));
    }
  }
  class ChargeLaserWeapon extends ModularWeapon {
    constructor() {
      super(WeaponSystem.getWeaponDef('LASER'));
    }

    fireMegaLaser(player, room, aimState) {
      WeaponHelper.fireHitscanBeams(this, player, room, aimState, this.modes[0]);
    }

    firePulseLaser(player, room, aimState) {
      WeaponHelper.fireHitscanBeams(this, player, room, aimState, this.modes[1] || this.modes[0]);
    }
  }
  class LongSwordWeapon extends ModularWeapon {
    constructor() {
      super(WeaponSystem.getWeaponDef('SWORD'));
    }
  }

  // Exponer en entorno global
  root.Weapon = Weapon;
  root.ModularWeapon = ModularWeapon;
  root.WeaponHelper = WeaponHelper;
  root.WeaponSystem = WeaponSystem;
  root.ProjectileWeapon = ProjectileWeapon;
  root.ChargeLaserWeapon = ChargeLaserWeapon;
  root.LongSwordWeapon = LongSwordWeapon;
}(typeof self !== 'undefined' ? self : this));
