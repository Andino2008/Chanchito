/**
 * ============================================================================
 * SISTEMA MODULAR DE COMBATE, MOVILIDAD VISCERAL Y GAME JUICE (`combat.js` - v2.2)
 * ============================================================================
 * Diseñado con arquitectura desacoplada para facilitar la futura transición
 * 1:1 a un motor gráfico profesional (Godot Engine / Unity C#).
 *
 * Módulos contenidos:
 *  1. COMBAT_CONFIG: Parámetros numéricos y físicas de combate 100% configurables.
 *  2. CombatSystem: Controlador de animación, I-Frames, corte de proyectiles,
 *     parry reflectivo, hit-stop reactivo y screen-shake direccional.
 * ============================================================================
 */

const COMBAT_CONFIG = {
  // --- Cancelación de Animaciones y Dash (Hades Style) ---
  DASH_DURATION: 0.18,              // Duración activa del dash en segundos
  DASH_I_FRAMES: 0.28,              // Tiempo total de invulnerabilidad (i-frames)
  DASH_SPEED_MULT: 2.45,            // Multiplicador de velocidad de traslación
  DASH_KNOCKBACK_FORCE: 340,        // Empuje físico a enemigos al atravesarlos
  DASH_CANCEL_ATTACK: true,         // Cancela instantáneamente swings de espada y carga láser

  // --- Corte y Desvío de Balas Melee ---
  SWORD_CAN_SLICE_BULLETS: true,    // En cualquier tajo corta/destruye proyectiles comunes
  SWORD_CAN_PARRY_BULLETS: true,    // En modo Parry refleja balas como lanzas eléctricas
  SLICE_HIT_STOP: 0.032,            // Pausa congelada (segundos) al rebanar una bala
  PARRY_HIT_STOP: 0.055,            // Pausa congelada al clavar un parry perfecto
  MELEE_HIT_STOP_LIGHT: 0.028,      // Hit-stop al golpear enemigos en modo rápido
  MELEE_HIT_STOP_HEAVY: 0.055,      // Hit-stop al impactar tajo pesado o golpe crítico

  // --- Screen Shake Jugoso ---
  SHAKE_SLICE: { intensity: 2.4, duration: 0.09 },
  SHAKE_PARRY: { intensity: 4.8, duration: 0.16 },
  SHAKE_HEAVY_HIT: { intensity: 5.2, duration: 0.15 },
  SHAKE_DASH: { intensity: 1.4, duration: 0.06 },

  // --- Partículas y Efectos de Impacto ---
  SLICE_SPARK_COUNT: 7,
  PARRY_SPARK_COUNT: 12,
  DASH_DUST_COUNT: 8,
};

class CombatSystem {
  /**
   * Intenta ejecutar un impulso evasivo (Dash) con cancelación instantánea de animación.
   * @param {Player} player
   * @param {InputManager} input
   * @param {Room} room
   * @param {object} aimState
   * @param {object} moveVec
   * @returns {boolean} true si el dash se ejecutó con éxito
   */
  static handlePlayerDash(player, input, room, aimState, moveVec) {
    if (!input.consumeDodgeTrigger()) return false;
    if (player.dodgeCharges <= 0 || player.dodgeActiveTimer > 0) return false;

    // 1. Gastar carga y configurar recarga inteligente
    player.dodgeCharges -= 1;
    if (player.dodgeCharges === 0) {
      player.dodgeCooldownTimer = player.dodgeCooldownEmpty;
    } else if (player.dodgeCooldownTimer <= 0) {
      player.dodgeCooldownTimer = player.dodgeCooldownSingle;
    }

    // 2. ANIMATION CANCELING: cortar al milisegundo cualquier swing o carga de arma
    if (COMBAT_CONFIG.DASH_CANCEL_ATTACK && player.currentWeapon) {
      if (typeof player.currentWeapon.cancel === 'function') {
        player.currentWeapon.cancel();
      }
    }

    // 3. Activar I-Frames y estado evasivo
    player.dodgeActiveTimer = COMBAT_CONFIG.DASH_DURATION;
    player.invulnerableTimer = Math.max(player.invulnerableTimer, COMBAT_CONFIG.DASH_I_FRAMES);

    // Dirección del dash: prioriza la dirección del movimiento (WASD); si está quieto, hacia el cursor
    player.dodgeDir = (moveVec && moveVec.length > 0)
      ? { x: moveVec.x, y: moveVec.y }
      : { x: aimState.aimX, y: aimState.aimY };

    // 4. Game Juice: partículas y screen-shake sutil de propulsión
    if (room && typeof room.spawnParticle === 'function') {
      room.spawnParticle(player.x, player.y, '#93c5fd', COMBAT_CONFIG.DASH_DUST_COUNT);
      room.spawnParticle(player.x, player.y, '#ffffff', 4);
    }
    if (window.activeGameInstance) {
      window.activeGameInstance.triggerScreenShake(
        COMBAT_CONFIG.SHAKE_DASH.intensity,
        COMBAT_CONFIG.SHAKE_DASH.duration
      );
    }
    if (typeof soundManager !== 'undefined' && soundManager) {
      soundManager.playProcedural('dash', { volume: 0.45 });
    }

    if (window.PIG_ARCHETYPES && player.archetype && window.PIG_ARCHETYPES[player.archetype]?.onDodge) {
      window.PIG_ARCHETYPES[player.archetype].onDodge(player, room);
    }
    if (player.ui) player.ui.updateStats(player);
    return true;
  }

  /**
   * Empuja a los enemigos en la trayectoria del dash para no quedar atrapado dentro de hitboxes.
   * @param {Player} player
   * @param {Room} room
   * @param {number} dt
   */
  static processDashEnemyDisplacement(player, room, dt) {
    if (player.dodgeActiveTimer <= 0 || !room || !room.enemies) return;
    for (const enemy of room.enemies) {
      if (enemy.markedForDeletion || enemy.isBurrowed) continue;
      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      const dist = Math.hypot(dx, dy);
      const combinedRadius = player.radius + enemy.radius + 6;
      if (dist < combinedRadius && dist > 0) {
        const pushDirX = dx / dist;
        const pushDirY = dy / dist;
        enemy.x += pushDirX * COMBAT_CONFIG.DASH_KNOCKBACK_FORCE * dt;
        enemy.y += pushDirY * COMBAT_CONFIG.DASH_KNOCKBACK_FORCE * dt;
      }
    }
  }

  /**
   * Resuelve el corte o parry de proyectiles enemigos con la Espada Melee.
   *  - En Modo Parry (Mode 0): Refleja balas como lanzas eléctricas de alta velocidad.
   *  - En Modo Tajo Pesado (Mode 1): Slices y destruye completamente las balas con chispas metálicas.
   * @param {LongSwordWeapon} sword
   * @param {Player} player
   * @param {Room} room
   * @param {object} aimState
   */
  static processSwordProjectileInteractions(sword, player, room, aimState) {
    if (!room.enemyProjectiles || room.enemyProjectiles.length === 0) return;
    const isParryMode = sword.mode === 0;

    for (const ep of room.enemyProjectiles) {
      if (ep.markedForDeletion || sword.parriedProjectiles.has(ep)) continue;

      const dx = ep.x - player.x;
      const dy = ep.y - player.y;
      const dist = Math.hypot(dx, dy);

      if (dist <= sword.reach + ep.radius + 12) {
        const angleToProj = Math.atan2(dy, dx);
        const diff = Math.abs(MathUtils.angleDiff(angleToProj, sword.swingCenterAngle));

        if (diff <= sword.arcAngle / 2 || dist <= player.radius + ep.radius + 14) {
          sword.parriedProjectiles.add(ep);
          ep.markedForDeletion = true;

          if (isParryMode) {
            // --- MODO PARRY: REFLEJO ELÉCTRICO DEVIL MAY CRY / HADES ---
            const refDirX = Math.cos(aimState.aimAngle);
            const refDirY = Math.sin(aimState.aimAngle);
            const refDmg = Math.round(62 * player.damageMultiplier);
            const reflectedProj = new Projectile(
              ep.x,
              ep.y,
              refDirX,
              refDirY,
              720,
              refDmg,
              8,
              'LIGHTNING',
              2
            );
            reflectedProj.piercing = true;
            reflectedProj.maxPierces = 3;
            reflectedProj.color = '#38bdf8';
            reflectedProj.borderColor = '#ffffff';
            room.projectiles.push(reflectedProj);
            player.itemManager.onShoot(reflectedProj, room);

            // Sinergia Parry del Dios del Trueno
            if ((player.synergyManager && player.synergyManager.has('THUNDER_GOD_PARRY')) || (window.synergyEngine && window.synergyEngine.has('THUNDER_GOD_PARRY'))) {
              for (const en of room.enemies) {
                if (en.markedForDeletion || en.isBurrowed) continue;
                en.takeDamage(Math.round(52 * player.damageMultiplier), 0, 0, 'LIGHTNING');
                en.applyElementalEffect('LIGHTNING', room, 2);
                room.spawnParticle(en.x, en.y, '#38bdf8', 7);
                room.spawnParticle(en.x, en.y, '#ffffff', 5);
              }
            }

            // Game juice: Parry audiovisual
            if (typeof soundManager !== 'undefined' && soundManager) {
              soundManager.playProcedural('crit', { volume: 0.85 });
            }
            room.spawnParticle(ep.x, ep.y, '#38bdf8', COMBAT_CONFIG.PARRY_SPARK_COUNT);
            room.spawnParticle(ep.x, ep.y, '#ffffff', 8);

            if (window.activeGameInstance) {
              window.activeGameInstance.triggerScreenShake(
                COMBAT_CONFIG.SHAKE_PARRY.intensity,
                COMBAT_CONFIG.SHAKE_PARRY.duration
              );
              window.activeGameInstance.triggerHitStop(COMBAT_CONFIG.PARRY_HIT_STOP);
            }
          } else {
            // --- MODO TAJO PESADO / ESPADAZO ESTÁNDAR: CORTE DESTRUCTOR DE BALAS ---
            if (typeof soundManager !== 'undefined' && soundManager) {
              soundManager.playProcedural('crit', { volume: 0.55 });
            }
            room.spawnParticle(ep.x, ep.y, '#f8fafc', COMBAT_CONFIG.SLICE_SPARK_COUNT);
            room.spawnParticle(ep.x, ep.y, '#cbd5e1', 4);

            if (window.activeGameInstance) {
              window.activeGameInstance.triggerScreenShake(
                COMBAT_CONFIG.SHAKE_SLICE.intensity,
                COMBAT_CONFIG.SHAKE_SLICE.duration
              );
              window.activeGameInstance.triggerHitStop(COMBAT_CONFIG.SLICE_HIT_STOP);
            }
          }
        }
      }
    }
  }

  /**
   * Resuelve el impacto melee contra enemigos con cálculo de retroceso y hit-stop con peso.
   * @param {LongSwordWeapon} sword
   * @param {Player} player
   * @param {Room} room
   * @param {Entity} enemy
   * @param {object} aimState
   */
  static processSwordEnemyImpact(sword, player, room, enemy, aimState) {
    const isParryMode = sword.mode === 0;
    const isCrit = player.critChance > 0 && Math.random() < player.critChance;

    if (enemy.isGuarding && typeof enemy.onGuardedHit === 'function') {
      enemy.onGuardedHit(player, room, player);
      return;
    }

    const dx = enemy.x - player.x;
    const dy = enemy.y - player.y;
    const norm = MathUtils.normalize(dx, dy);

    const baseDmg = isParryMode ? 30 : 95;
    let finalDmg = Math.round(baseDmg * player.damageMultiplier);
    if (isCrit) {
      finalDmg *= 2.0;
      room.spawnParticle(enemy.x, enemy.y, '#fef08a', 8);
    }

    const pushForce = isParryMode ? 240 : 480;
    const dealt = enemy.takeDamage(
      finalDmg,
      norm.x * pushForce,
      norm.y * pushForce,
      sword.currentSwingElement
    );

    if (sword.currentSwingElement !== 'NONE' && !enemy.markedForDeletion) {
      enemy.applyElementalEffect(
        sword.currentSwingElement,
        room,
        sword.currentSwingElementLevel
      );
    }

    const attackContext = {
      isMelee: true,
      element: sword.currentSwingElement,
      damage: dealt,
      x: enemy.x,
      y: enemy.y
    };
    player.itemManager.onHit(attackContext, enemy, room, dealt);
    if (isCrit) {
      player.itemManager.onCrit(enemy);
    }

    // Game juice en impacto
    if (window.activeGameInstance) {
      const shakeCfg = isParryMode ? COMBAT_CONFIG.SHAKE_SLICE : COMBAT_CONFIG.SHAKE_HEAVY_HIT;
      const hitStopDuration = isCrit
        ? COMBAT_CONFIG.MELEE_HIT_STOP_HEAVY
        : (isParryMode ? COMBAT_CONFIG.MELEE_HIT_STOP_LIGHT : COMBAT_CONFIG.MELEE_HIT_STOP_HEAVY);

      window.activeGameInstance.triggerScreenShake(shakeCfg.intensity, shakeCfg.duration);
      window.activeGameInstance.triggerHitStop(hitStopDuration);
    }
  }
}

// Exponer en el entorno global para fácil acceso y depuración
window.COMBAT_CONFIG = COMBAT_CONFIG;

// Métodos estáticos de conveniencia para efectos viscerales globales
CombatSystem.triggerScreenShake = function(intensity = 10, duration = 0.3) {
  if (window.activeGameInstance && typeof window.activeGameInstance.triggerScreenShake === 'function') {
    window.activeGameInstance.triggerScreenShake(intensity, duration);
  }
};

CombatSystem.triggerHitStop = function(duration = 0.05) {
  if (window.activeGameInstance && typeof window.activeGameInstance.triggerHitStop === 'function') {
    window.activeGameInstance.triggerHitStop(duration);
  }
};

window.CombatSystem = CombatSystem;
