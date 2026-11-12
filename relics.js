/**
 * ============================================================================
 * SISTEMA MODULAR DE RELIQUIAS Y GESTOR DE HOOKS (`relics.js` - v2.1)
 * ============================================================================
 * Incluye las 75 Reliquias del juego (25 Base + 25 Expansión I + 25 Expansión II)
 * integradas bajo la misma arquitectura de Hooks (`ItemManager`) y RNG barajado con
 * algoritmo Fisher-Yates + Web Crypto API para garantizar orden 100% aleatorio.
 *
 * Hooks soportados por `ItemManager`:
 *  - onPickup(state, player, itemManager)
 *  - applyPassiveStats(stats, state, player, itemManager)
 *  - onShoot(projectile, state, player, room)
 *  - onHit(projectile, enemy, state, player, room, damageDealt)
 *  - onKill(enemy, state, player, room, itemManager)
 *  - onBossKill(boss, state, player, room, itemManager)
 *  - onEnemySpawn(enemy, state, player, room)
 *  - onRoomStart(room, state, player)
 *  - onLevelStart(state, player)
 *  - onUpgradeChosen(upgradeType, state, player, itemManager)
 *  - onHeal(healContext, state, player)
 *  - onUpdate(dt, state, player, room)
 *  - onDamageTaken(damageContext, state, player, room)
 *  - onDeath(state, player, room, itemManager)
 *  - onDraw(ctx, state, player, room)
 * ============================================================================
 */

const RELIC_CATALOG = {
  // ==========================================================================
  // CATÁLOGO BASE (Reliquias #01 - #25)
  // ==========================================================================

  // 1. Balas rebotantes
  BOUNCING_BULLETS: {
    id: 'BOUNCING_BULLETS',
    name: 'Balas rebotantes',
    short: 'REB',
    color: '#38bdf8',
    description: 'Rebotan en paredes y golpean varias veces.',
    hooks: {
      onShoot(projectile) {
        projectile.bouncesLeft = (projectile.bouncesLeft || 0) + 2;
      },
    },
  },

  // 2. Balas penetrantes
  PIERCING_BULLETS: {
    id: 'PIERCING_BULLETS',
    name: 'Balas penetrantes',
    short: 'PEN',
    color: '#60a5fa',
    description: 'Atraviesan enemigos sin destruirse.',
    hooks: {
      onShoot(projectile) {
        projectile.piercing = true;
      },
    },
  },

  // 3. Munición pesada
  HEAVY_AMMO: {
    id: 'HEAVY_AMMO',
    name: 'Munición pesada',
    short: 'PES',
    color: '#f97316',
    description: '-40% velocidad de ataque, +100% daño.',
    hooks: {
      applyPassiveStats(stats) {
        stats.attackSpeedMultiplier *= 0.6;
        stats.damageMultiplier *= 2.0;
      },
    },
  },

  // 4. Gatillo nervioso
  NERVOUS_TRIGGER: {
    id: 'NERVOUS_TRIGGER',
    name: 'Gatillo nervioso',
    short: 'GAT',
    color: '#facc15',
    description: '+60% velocidad de ataque, -35% daño.',
    hooks: {
      applyPassiveStats(stats) {
        stats.attackSpeedMultiplier *= 1.6;
        stats.damageMultiplier *= 0.65;
      },
    },
  },

  // 5. Sobrecarga
  OVERLOAD: {
    id: 'OVERLOAD',
    name: 'Sobrecarga',
    short: 'SOB',
    color: '#fbbf24',
    description: 'Cada 15 disparos, dispara ráfaga de 8 proyectiles.',
    initState: () => ({ shotCount: 0 }),
    hooks: {
      onShoot(projectile, state, player, room) {
        if (projectile.isBonusProjectile) return;
        state.shotCount += 1;
        if (state.shotCount >= 15) {
          state.shotCount = 0;
          for (let i = 0; i < 8; i++) {
            const angle = (Math.PI * 2 * i) / 8;
            const burstProj = new Projectile(
              player.x,
              player.y,
              Math.cos(angle),
              Math.sin(angle),
              480,
              Math.round(projectile.damage * 0.75),
              6,
              projectile.element,
              projectile.elementLevel
            );
            burstProj.isBonusProjectile = true;
            room.projectiles.push(burstProj);
          }
        }
      },
    },
  },

  // 6. Dispersor
  SPREADER: {
    id: 'SPREADER',
    name: 'Dispersor',
    short: 'DSP',
    color: '#34d399',
    description: '3 proyectiles en abanico (65% de daño cada uno).',
    hooks: {
      onShoot(projectile, state, player, room) {
        if (projectile.isBonusProjectile) return;
        projectile.damage = Math.max(1, Math.round(projectile.damage * 0.65));
        const baseAngle = Math.atan2(projectile.vy, projectile.vx);
        const speed = Math.hypot(projectile.vx, projectile.vy);
        for (const offset of [-0.22, 0.22]) {
          const ang = baseAngle + offset;
          const extra = new Projectile(
            projectile.x,
            projectile.y,
            Math.cos(ang),
            Math.sin(ang),
            speed,
            projectile.damage,
            projectile.radius,
            projectile.element,
            projectile.elementLevel
          );
          extra.isBonusProjectile = true;
          extra.piercing = projectile.piercing;
          extra.bouncesLeft = projectile.bouncesLeft;
          room.projectiles.push(extra);
        }
      },
    },
  },

  // 7. Ojo cazador
  HUNTER_EYE: {
    id: 'HUNTER_EYE',
    name: 'Ojo cazador',
    short: 'OJO',
    color: '#a3e635',
    description: 'Proyectiles curvan ligeramente hacia el enemigo cercano (soft-homing).',
    hooks: {
      onShoot(projectile) {
        projectile.homingStrength = 3.2;
      },
    },
  },

  // 8. Punto débil
  WEAK_SPOT: {
    id: 'WEAK_SPOT',
    name: 'Punto débil',
    short: 'CRT',
    color: '#ef4444',
    description: '15% de prob. de daño x3.',
    hooks: {
      onHit(projectile, enemy, state, player, room, damageDealt) {
        if (Math.random() < 0.15 && !enemy.markedForDeletion) {
          enemy.takeDamage(damageDealt * 2, 0, 0, projectile ? projectile.element : 'NONE');
          room.spawnParticle(enemy.x, enemy.y, 0, -60, 6, '#ef4444', 0.45);
        }
      },
    },
  },

  // 9. Pólvora inestable
  UNSTABLE_POWDER: {
    id: 'UNSTABLE_POWDER',
    name: 'Pólvora inestable',
    short: 'POL',
    color: '#fb923c',
    description: 'Explotan al impactar (daño en área).',
    hooks: {
      onHit(projectile, enemy, state, player, room, damageDealt) {
        const blastRadius = 68;
        room.spawnParticle(enemy.x, enemy.y, 0, 0, 18, '#fb923c', 0.3);
        for (const other of room.enemies) {
          if (other === enemy || other.markedForDeletion) continue;
          if (
            MathUtils.circleCollision(enemy.x, enemy.y, blastRadius, other.x, other.y, other.radius)
          ) {
            other.takeDamage(damageDealt * 0.4, 0, 0, 'FIRE');
          }
        }
      },
    },
  },

  // 10. Veneno persistente
  PERSISTENT_POISON: {
    id: 'PERSISTENT_POISON',
    name: 'Veneno persistente',
    short: 'VEN',
    color: '#4ade80',
    description: '30% prob. al impactar de aplicar DoT (4s).',
    hooks: {
      onHit(projectile, enemy, state, player, room) {
        if (Math.random() < 0.3 && !enemy.markedForDeletion) {
          enemy.applyElementalEffect('FIRE', room, 1);
          room.spawnParticle(enemy.x, enemy.y, 0, -35, 5, '#4ade80', 0.45);
        }
      },
    },
  },

  // 11. Corazón vampírico
  VAMPIRIC_HEART: {
    id: 'VAMPIRIC_HEART',
    name: 'Corazón vampírico',
    short: 'VAM',
    color: '#e11d48',
    description: '2% de robo de vida (capado en ataques de área).',
    hooks: {
      onHit(projectile, enemy, state, player, room, damageDealt) {
        const rawHeal = Math.max(0.25, damageDealt * 0.02);
        const cappedHeal = Math.min(2.5, rawHeal);
        if (player.hp < player.maxHp) {
          player.heal(cappedHeal);
          room.spawnParticle(player.x, player.y, 0, -45, 4, '#fb7185', 0.4);
        }
      },
    },
  },

  // 12. Segunda piel
  SECOND_SKIN: {
    id: 'SECOND_SKIN',
    name: 'Segunda piel',
    short: 'ESC',
    color: '#93c5fd',
    description: 'Escudo de 1 golpe (20s cooldown).',
    initState: () => ({ cooldown: 0, ready: true }),
    hooks: {
      onUpdate(dt, state, player) {
        if (!state.ready) {
          state.cooldown -= dt;
          if (state.cooldown <= 0) {
            state.cooldown = 0;
            state.ready = true;
            if (player.ui) player.ui.updateHealth(player);
          }
        }
      },
      onDamageTaken(damageContext, state, player, room) {
        if (state.ready && damageContext.amount > 0) {
          damageContext.amount = 0;
          state.ready = false;
          state.cooldown = 20.0;
          player.invulnerableTimer = 0.8;
          room.spawnParticle(player.x, player.y, 0, 0, 22, '#93c5fd', 0.45);
          if (player.ui) player.ui.updateHealth(player);
        }
      },
      onDraw(ctx, state, player) {
        if (state.ready) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(player.x, player.y, player.radius + 6, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(147, 197, 253, 0.75)';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.restore();
        }
      },
    },
  },

  // 13. Botas del fugitivo
  FUGITIVE_BOOTS: {
    id: 'FUGITIVE_BOOTS',
    name: 'Botas del fugitivo',
    short: 'BOT',
    color: '#2dd4bf',
    description: '+20% velocidad de movimiento.',
    hooks: {
      applyPassiveStats(stats) {
        stats.speed *= 1.2;
      },
    },
  },

  // 14. Último recurso
  LAST_RESORT: {
    id: 'LAST_RESORT',
    name: 'Último recurso',
    short: 'ULT',
    color: '#f43f5e',
    description: 'Al caer debajo de 25% HP, explosión de área con knockback (30s cooldown).',
    initState: () => ({ cooldown: 0, blastVisualTimer: 0 }),
    hooks: {
      onUpdate(dt, state) {
        if (state.cooldown > 0) state.cooldown = Math.max(0, state.cooldown - dt);
        if (state.blastVisualTimer > 0)
          state.blastVisualTimer = Math.max(0, state.blastVisualTimer - dt);
      },
      onDamageTaken(damageContext, state, player, room) {
        const projectedHp = player.hp - damageContext.amount;
        if (state.cooldown <= 0 && projectedHp > 0 && projectedHp <= player.maxHp * 0.25) {
          state.cooldown = 30.0;
          state.blastVisualTimer = 0.45;
          const blastRadius = 210;

          for (const enemy of room.enemies) {
            if (enemy.markedForDeletion) continue;
            const dx = enemy.x - player.x;
            const dy = enemy.y - player.y;
            const dist = Math.hypot(dx, dy);
            if (dist <= blastRadius + enemy.radius) {
              const norm = MathUtils.normalize(dx, dy);
              enemy.takeDamage(95 * player.damageMultiplier, norm.x * 520, norm.y * 520, 'FIRE');
            }
          }

          for (let i = 0; i < 20; i++) {
            const ang = (Math.PI * 2 * i) / 20;
            room.spawnParticle(
              player.x,
              player.y,
              Math.cos(ang) * 240,
              Math.sin(ang) * 240,
              6,
              '#f43f5e',
              0.55
            );
          }
        }
      },
      onDraw(ctx, state, player) {
        if (state.blastVisualTimer > 0) {
          const progress = 1 - state.blastVisualTimer / 0.45;
          ctx.save();
          ctx.beginPath();
          ctx.arc(player.x, player.y, 30 + progress * 180, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(244, 63, 94, ${1 - progress})`;
          ctx.lineWidth = 6 * (1 - progress);
          ctx.stroke();
          ctx.restore();
        }
      },
    },
  },

  // 15. Imán de almas
  SOUL_MAGNET: {
    id: 'SOUL_MAGNET',
    name: 'Imán de almas',
    short: 'IMA',
    color: '#c084fc',
    description: '+Radio de recolección (para drops/monedas).',
    hooks: {
      applyPassiveStats(stats) {
        stats.coinMagnetMultiplier *= 2.5;
      },
    },
  },

  // 16. Calavera maldita
  CURSED_SKULL: {
    id: 'CURSED_SKULL',
    name: 'Calavera maldita',
    short: 'CAL',
    color: '#f87171',
    description: '+30% daño infligido, +20% daño recibido.',
    hooks: {
      applyPassiveStats(stats) {
        stats.damageMultiplier *= 1.3;
        stats.damageTakenMultiplier *= 1.2;
      },
      onDamageTaken(damageContext) {
        damageContext.amount = Math.round(damageContext.amount * 1.2);
      },
    },
  },

  // 17. Arco voltaico
  VOLTAIC_ARC: {
    id: 'VOLTAIC_ARC',
    name: 'Arco voltaico',
    short: 'ARC',
    color: '#fde047',
    description: 'Cada 6 impactos, un rayo salta a 3 enemigos.',
    initState: () => ({ hitCount: 0 }),
    hooks: {
      onHit(projectile, enemy, state, player, room, damageDealt) {
        state.hitCount += 1;
        if (state.hitCount >= 6) {
          state.hitCount = 0;
          const targets = room.enemies.filter((e) => !e.markedForDeletion).slice(0, 3);
          for (const t of targets) {
            t.takeDamage(damageDealt * 0.75, 0, 0, 'ELECTRIC');
            room.spawnParticle(t.x, t.y, 0, -50, 6, '#fde047', 0.4);
          }
        }
      },
    },
  },

  // 18. Satélites
  SATELLITES: {
    id: 'SATELLITES',
    name: 'Satélites',
    short: 'SAT',
    color: '#38bdf8',
    description: '2 hitbox orbitales continuas alrededor del jugador.',
    initState: () => ({
      angle: 0,
      orbitRadius: 52,
      satRadius: 9,
      positions: [],
      hitCooldowns: new Map(),
    }),
    hooks: {
      onUpdate(dt, state, player, room) {
        state.angle = (state.angle + dt * 5.2) % (Math.PI * 2);

        for (const [enemy, cd] of state.hitCooldowns.entries()) {
          if (cd - dt <= 0 || enemy.markedForDeletion) state.hitCooldowns.delete(enemy);
          else state.hitCooldowns.set(enemy, cd - dt);
        }

        state.positions = [];
        for (let i = 0; i < 2; i++) {
          const a = state.angle + i * Math.PI;
          const sx = player.x + Math.cos(a) * state.orbitRadius;
          const sy = player.y + Math.sin(a) * state.orbitRadius;
          state.positions.push({ x: sx, y: sy });

          for (const enemy of room.enemies) {
            if (enemy.markedForDeletion || state.hitCooldowns.has(enemy)) continue;
            if (
              MathUtils.circleCollision(sx, sy, state.satRadius, enemy.x, enemy.y, enemy.radius)
            ) {
              const push = MathUtils.normalize(enemy.x - sx, enemy.y - sy);
              const satDmg = Math.round(16 * player.damageMultiplier);
              enemy.takeDamage(satDmg, push.x * 95, push.y * 95, 'ELECTRIC');
              state.hitCooldowns.set(enemy, 0.22);
            }
          }
        }
      },
      onDraw(ctx, state) {
        if (!state.positions) return;
        ctx.save();
        for (const pos of state.positions) {
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, state.satRadius, 0, Math.PI * 2);
          ctx.fillStyle = '#38bdf8';
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#e0f2fe';
          ctx.stroke();
        }
        ctx.restore();
      },
    },
  },

  // 19. Furia terminal
  TERMINAL_FURY: {
    id: 'TERMINAL_FURY',
    name: 'Furia terminal',
    short: 'FUR',
    color: '#ef4444',
    description: '+5% vel. ataque por cada 10% de HP faltante.',
    hooks: {
      applyPassiveStats(stats, state, player) {
        const missingRatio = Math.max(0, (player.maxHp - player.hp) / player.maxHp);
        const stacks = Math.floor(missingRatio * 10);
        stats.attackSpeedMultiplier *= 1 + stacks * 0.05;
      },
    },
  },

  // 20. Arena del tiempo
  SANDS_OF_TIME: {
    id: 'SANDS_OF_TIME',
    name: 'Arena del tiempo',
    short: 'ARE',
    color: '#fcd34d',
    description: 'Cada 30s, enemigos -50% velocidad por 3s.',
    initState: () => ({ timer: 30.0, activeSlowTimer: 0 }),
    hooks: {
      onUpdate(dt, state, player, room) {
        state.timer -= dt;
        if (state.timer <= 0) {
          state.timer = 30.0;
          state.activeSlowTimer = 3.0;
        }
        if (state.activeSlowTimer > 0) {
          state.activeSlowTimer -= dt;
          for (const enemy of room.enemies) {
            enemy.vx *= 0.5;
            enemy.vy *= 0.5;
          }
        }
      },
    },
  },

  // 21. Codicia maldita
  CURSED_GREED: {
    id: 'CURSED_GREED',
    name: 'Codicia maldita',
    short: 'COD',
    color: '#eab308',
    description: '+50% drops/monedas, +20% spawn de enemigos.',
    hooks: {
      applyPassiveStats(stats) {
        stats.extraCoinChance += 0.5;
        stats.enemySpawnMultiplier *= 1.2;
      },
    },
  },

  // 22. Esporas mutantes
  MUTANT_SPORES: {
    id: 'MUTANT_SPORES',
    name: 'Esporas mutantes',
    short: 'ESP',
    color: '#a855f7',
    description: 'Buff temporal aleatorio al cambiar de nivel.',
    hooks: {
      applyPassiveStats(stats) {
        stats.damageMultiplier *= 1.12;
        stats.speed *= 1.08;
      },
    },
  },

  // 23. Espejo roto
  BROKEN_MIRROR: {
    id: 'BROKEN_MIRROR',
    name: 'Espejo roto',
    short: 'MIR',
    color: '#e2e8f0',
    description: '10% de prob. de que el proyectil se divida en 2 menores al impactar.',
    hooks: {
      onHit(projectile, enemy, state, player, room) {
        if (!projectile || projectile.isBonusProjectile) return;
        if (Math.random() < 0.1) {
          const baseAngle = Math.atan2(projectile.vy, projectile.vx);
          for (const offset of [-0.5, 0.5]) {
            const ang = baseAngle + offset;
            const shard = new Projectile(
              enemy.x,
              enemy.y,
              Math.cos(ang),
              Math.sin(ang),
              440,
              Math.max(1, Math.round(projectile.damage * 0.5)),
              5,
              projectile.element,
              projectile.elementLevel
            );
            shard.isBonusProjectile = true;
            shard.hitEnemies.add(enemy);
            room.projectiles.push(shard);
          }
        }
      },
    },
  },

  // 24. Singularidad
  SINGULARITY: {
    id: 'SINGULARITY',
    name: 'Singularidad',
    short: 'SNG',
    color: '#8b5cf6',
    description: 'Cada 12s, crea un agujero negro que atrae enemigos (2s) y explota.',
    initState: () => ({ timer: 12.0, blackHole: null }),
    hooks: {
      onUpdate(dt, state, player, room) {
        if (!state.blackHole) {
          state.timer -= dt;
          if (state.timer <= 0 && room.enemies.length > 0) {
            state.timer = 12.0;
            state.blackHole = {
              x: ROOM_BOUNDS.centerX,
              y: ROOM_BOUNDS.centerY,
              duration: 2.0,
            };
          }
        } else {
          state.blackHole.duration -= dt;
          for (const enemy of room.enemies) {
            if (enemy.markedForDeletion || enemy.isBurrowed) continue;
            const pull = MathUtils.normalize(
              state.blackHole.x - enemy.x,
              state.blackHole.y - enemy.y
            );
            const pullMult = enemy.isBoss ? 0.22 : 1.0;
            enemy.x += pull.x * 165 * pullMult * dt;
            enemy.y += pull.y * 165 * pullMult * dt;
          }
          if (state.blackHole.duration <= 0) {
            for (const enemy of room.enemies) {
              if (enemy.markedForDeletion) continue;
              const d = Math.hypot(enemy.x - state.blackHole.x, enemy.y - state.blackHole.y);
              if (d <= 150) {
                enemy.takeDamage(65 * player.damageMultiplier, 0, 0, 'MIRACLE');
              }
            }
            room.spawnParticle(state.blackHole.x, state.blackHole.y, 0, 0, 26, '#8b5cf6', 0.45);
            state.blackHole = null;
          }
        }
      },
      onDraw(ctx, state) {
        if (state.blackHole) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(state.blackHole.x, state.blackHole.y, 28, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#8b5cf6';
          ctx.stroke();
          ctx.restore();
        }
      },
    },
  },

  // 25. Corona del apocalipsis
  APOCALYPSE_CROWN: {
    id: 'APOCALYPSE_CROWN',
    name: 'Corona del apocalipsis',
    short: 'APOC',
    color: '#f59e0b',
    description: '+3% daño por objeto pasivo poseído, +2% spawn de enemigos por objeto.',
    hooks: {
      applyPassiveStats(stats, state, player, itemManager) {
        const count = itemManager.ownedRelics.length;
        stats.damageMultiplier *= 1 + count * 0.03;
        stats.enemySpawnMultiplier *= 1 + count * 0.02;
      },
    },
  },

  // ==========================================================================
  // RELIQUIAS #26 - #50
  // ==========================================================================

  // 26. Daga del usurpador
  USURPER_DAGGER: {
    id: 'USURPER_DAGGER',
    name: 'Daga del usurpador',
    short: 'DAG',
    color: '#ec4899',
    description: 'Matar un enemigo de élite aumenta tu daño 2% (Máx 10 acumulaciones).',
    initState: () => ({ stacks: 0 }),
    hooks: {
      onKill(enemy, state, player, room, itemManager) {
        if (enemy.isElite && state.stacks < 10) {
          state.stacks += 1;
          itemManager.applyPassiveStats();
        }
      },
      applyPassiveStats(stats, state) {
        stats.damageMultiplier *= 1 + state.stacks * 0.02;
      },
    },
  },

  // 27. Reloj de la agonía
  AGONY_CLOCK: {
    id: 'AGONY_CLOCK',
    name: 'Reloj de la agonía',
    short: 'AGO',
    color: '#8b5cf6',
    description: '+1% daño por segundo atacando al mismo enemigo (Máx 25%).',
    initState: () => ({ currentTarget: null, timeOnTarget: 0 }),
    hooks: {
      onUpdate(dt, state) {
        if (state.currentTarget && !state.currentTarget.markedForDeletion) {
          state.timeOnTarget = Math.min(25, state.timeOnTarget + dt);
        } else {
          state.currentTarget = null;
          state.timeOnTarget = 0;
        }
      },
      onHit(projectile, enemy, state, player, room, damageDealt) {
        if (state.currentTarget !== enemy) {
          state.currentTarget = enemy;
          state.timeOnTarget = 0;
        }
        const bonusDmg = Math.floor(damageDealt * (state.timeOnTarget * 0.01));
        if (bonusDmg > 0 && !enemy.markedForDeletion) {
          enemy.takeDamage(bonusDmg, 0, 0, 'TRUE_DAMAGE');
        }
      },
    },
  },

  // 28. Prisma fracturado
  FRACTURED_PRISM: {
    id: 'FRACTURED_PRISM',
    name: 'Prisma fracturado',
    short: 'PRI',
    color: '#a78bfa',
    description: 'Cada 5to impacto se divide en 3 fragmentos (50% de daño).',
    initState: () => ({ hitCount: 0 }),
    hooks: {
      onHit(projectile, enemy, state, player, room) {
        if (!projectile || projectile.isBonusProjectile) return;
        state.hitCount += 1;
        if (state.hitCount >= 5) {
          state.hitCount = 0;
          const baseAngle = Math.atan2(projectile.vy, projectile.vx);
          for (const offset of [-0.4, 0, 0.4]) {
            const ang = baseAngle + offset;
            const fragment = new Projectile(
              enemy.x,
              enemy.y,
              Math.cos(ang),
              Math.sin(ang),
              400,
              Math.max(1, Math.round(projectile.damage * 0.5)),
              Math.max(4, Math.round(projectile.radius * 0.8)),
              projectile.element,
              projectile.elementLevel
            );
            fragment.isBonusProjectile = true;
            fragment.hitEnemies.add(enemy);
            room.projectiles.push(fragment);
          }
        }
      },
    },
  },

  // 29. Corazón de singularidad
  SINGULARITY_HEART: {
    id: 'SINGULARITY_HEART',
    name: 'Corazón de singularidad',
    short: 'CSN',
    color: '#6366f1',
    description: 'Cada 20 muertes, el próximo élite queda atrapado en gravedad (2s).',
    initState: () => ({ killCount: 0, trapReady: false, activeTrap: null }),
    hooks: {
      onKill(enemy, state) {
        if (!state.trapReady) {
          state.killCount += 1;
          if (state.killCount >= 20) {
            state.trapReady = true;
            state.killCount = 0;
          }
        }
      },
      onEnemySpawn(enemy, state, player) {
        if (state.trapReady && enemy.isElite) {
          state.trapReady = false;
          state.activeTrap = {
            x: enemy.x,
            y: enemy.y,
            timer: 2.0,
            radius: 150,
            damage: player.damageMultiplier * 50,
          };
        }
      },
      onUpdate(dt, state, player, room) {
        if (!state.activeTrap) return;
        state.activeTrap.timer -= dt;
        for (const enemy of room.enemies) {
          if (enemy.markedForDeletion) continue;
          const dist = Math.hypot(enemy.x - state.activeTrap.x, enemy.y - state.activeTrap.y);
          if (dist <= state.activeTrap.radius) {
            const pull = MathUtils.normalize(
              state.activeTrap.x - enemy.x,
              state.activeTrap.y - enemy.y
            );
            enemy.x += pull.x * 220 * dt;
            enemy.y += pull.y * 220 * dt;
          }
        }
        if (state.activeTrap.timer <= 0) {
          for (const enemy of room.enemies) {
            if (enemy.markedForDeletion) continue;
            const dist = Math.hypot(enemy.x - state.activeTrap.x, enemy.y - state.activeTrap.y);
            if (dist <= state.activeTrap.radius) {
              enemy.takeDamage(state.activeTrap.damage, 0, 0, 'MIRACLE');
            }
          }
          room.spawnParticle(state.activeTrap.x, state.activeTrap.y, 0, 0, 24, '#6366f1', 0.45);
          state.activeTrap = null;
        }
      },
      onDraw(ctx, state) {
        if (!state.activeTrap) return;
        ctx.save();
        ctx.beginPath();
        ctx.arc(state.activeTrap.x, state.activeTrap.y, state.activeTrap.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(99, 102, 241, 0.16)';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#818cf8';
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.restore();
      },
    },
  },

  // 30. Moneda del verdugo
  EXECUTIONER_COIN: {
    id: 'EXECUTIONER_COIN',
    name: 'Moneda del verdugo',
    short: 'VER',
    color: '#d97706',
    description: 'Daño extra a enemigos con <20% de vida (+50% normales, +20% jefes).',
    hooks: {
      onHit(projectile, enemy, state, player, room, damageDealt) {
        if (enemy.markedForDeletion) return;
        const hpRatio = enemy.hp / enemy.maxHp;
        if (hpRatio < 0.2) {
          const multiplier = enemy.isBoss ? 0.2 : 0.5;
          enemy.takeDamage(damageDealt * multiplier, 0, 0, 'TRUE_DAMAGE');
        }
      },
    },
  },

  // II. Reliquias defensivas

  // 31. Escudo de los condenados
  SHIELD_OF_DAMNED: {
    id: 'SHIELD_OF_DAMNED',
    name: 'Escudo de los condenados',
    short: 'CON',
    color: '#94a3b8',
    description: 'Al recibir daño: -10% daño recibido por 2s (Máx 5). Se pierde tras 5s sin daño.',
    initState: () => ({ stacks: 0, stackTimer: 0, noDamageTimer: 0 }),
    hooks: {
      onUpdate(dt, state, player) {
        if (state.stacks > 0) {
          state.stackTimer -= dt;
          state.noDamageTimer += dt;
          if (state.stackTimer <= 0 || state.noDamageTimer >= 5.0) {
            state.stacks = 0;
            state.noDamageTimer = 0;
            player.itemManager.applyPassiveStats();
          }
        }
      },
      onDamageTaken(damageContext, state) {
        if (damageContext.amount > 0) {
          damageContext.amount = Math.max(
            1,
            Math.round(damageContext.amount * (1 - state.stacks * 0.1))
          );
          state.stacks = Math.min(5, state.stacks + 1);
          state.stackTimer = 2.0;
          state.noDamageTimer = 0;
        }
      },
      applyPassiveStats(stats, state) {
        stats.damageTakenMultiplier *= 1 - state.stacks * 0.1;
      },
    },
  },

  // 32. Espejo del mártir
  MARTYR_MIRROR: {
    id: 'MARTYR_MIRROR',
    name: 'Espejo del mártir',
    short: 'MRM',
    color: '#bae6fd',
    description: 'Refleja el primer proyectil enemigo hacia su origen (150% daño base) cada 15s.',
    initState: () => ({ cooldown: 0 }),
    hooks: {
      onUpdate(dt, state) {
        if (state.cooldown > 0) state.cooldown = Math.max(0, state.cooldown - dt);
      },
      onDamageTaken(damageContext, state, player, room) {
        if (state.cooldown <= 0 && damageContext.isProjectile) {
          damageContext.amount = 0;
          state.cooldown = 15.0;

          const norm = MathUtils.normalize(
            -(damageContext.vx || 1),
            -(damageContext.vy || 0)
          );
          const dirX = norm.length > 0 ? norm.x : 1;
          const dirY = norm.length > 0 ? norm.y : 0;
          const reflected = new Projectile(
            player.x,
            player.y,
            dirX,
            dirY,
            520,
            Math.round(38 * player.damageMultiplier),
            8,
            'MIRACLE',
            1
          );
          reflected.isBonusProjectile = true;
          room.projectiles.push(reflected);
          room.spawnParticle(player.x, player.y, 0, 0, 16, '#bae6fd', 0.45);
        }
      },
    },
  },

  // 33. Último latido
  LAST_BEAT: {
    id: 'LAST_BEAT',
    name: 'Último latido',
    short: 'LAT',
    color: '#fda4af',
    description: 'El primer golpe letal del nivel te deja a 1 HP y te hace invulnerable 1.5s.',
    initState: () => ({ usedThisLevel: false }),
    hooks: {
      onLevelStart(state) {
        state.usedThisLevel = false;
      },
      onDamageTaken(damageContext, state, player, room) {
        if (!state.usedThisLevel && player.hp - damageContext.amount <= 0) {
          damageContext.amount = Math.max(0, player.hp - 1);
          player.invulnerableTimer = 1.5;
          state.usedThisLevel = true;
          if (room) {
            room.spawnParticle(player.x, player.y, 0, 0, 24, '#fda4af', 0.55);
          }
          if (player.ui) {
            player.ui.showToast('¡ÚLTIMO LATIDO ACTIVADO! Sobreviviste con 1 HP (1.5s Invulnerable)');
          }
        }
      },
    },
  },

  // 34. Pluma del exilio
  EXILE_FEATHER: {
    id: 'EXILE_FEATHER',
    name: 'Pluma del exilio',
    short: 'EXI',
    color: '#d9f99d',
    description: '20% prob. de teletransporte corto seguro al recibir daño (4s cooldown).',
    initState: () => ({ cooldown: 0 }),
    hooks: {
      onUpdate(dt, state) {
        if (state.cooldown > 0) state.cooldown = Math.max(0, state.cooldown - dt);
      },
      onDamageTaken(damageContext, state, player, room) {
        if (state.cooldown <= 0 && Math.random() < 0.2 && damageContext.amount > 0 && room) {
          state.cooldown = 4.0;
          const safePos = room.getRandomSafePosition(player.x, player.y, 200);
          room.spawnParticle(player.x, player.y, 0, 0, 20, '#d9f99d', 0.4);
          player.x = safePos.x;
          player.y = safePos.y;
          room.spawnParticle(player.x, player.y, 0, 0, 20, '#d9f99d', 0.4);
        }
      },
    },
  },

  // 35. Amuleto de la deuda
  DEBT_AMULET: {
    id: 'DEBT_AMULET',
    name: 'Amuleto de la deuda',
    short: 'DEU',
    color: '#94a3b8',
    description: 'Acumula 30% del daño recibido. Se libera en explosión al matar un élite.',
    initState: () => ({ storedEnergy: 0 }),
    hooks: {
      onDamageTaken(damageContext, state) {
        if (damageContext.amount > 0) {
          state.storedEnergy += damageContext.amount * 0.3;
        }
      },
      onKill(enemy, state, player, room) {
        if (enemy.isElite && state.storedEnergy > 0) {
          const blastDmg = Math.min(state.storedEnergy * 4, 350 * player.damageMultiplier);
          for (const target of room.enemies) {
            if (target.markedForDeletion) continue;
            const dist = Math.hypot(target.x - player.x, target.y - player.y);
            if (dist < 250) {
              target.takeDamage(blastDmg, 0, 0, 'MIRACLE');
            }
          }
          room.spawnParticle(player.x, player.y, 0, 0, 30, '#94a3b8', 0.5);
          state.storedEnergy = 0;
        }
      },
    },
  },

  // III. Reliquias que alteran las reglas

  // 36. Reloj sin agujas
  TIMELESS_CLOCK: {
    id: 'TIMELESS_CLOCK',
    name: 'Reloj sin agujas',
    short: 'SAJ',
    color: '#cbd5e1',
    description: 'Al entrar a una sala nueva o cambiar de nivel, congela enemigos por 2s.',
    initState: () => ({ freezeTimer: 0 }),
    hooks: {
      onRoomStart(room, state) {
        if (!room.cleared && room.enemies.length > 0) {
          state.freezeTimer = 2.0;
        }
      },
      onLevelStart(state) {
        state.freezeTimer = 2.0;
      },
      onUpdate(dt, state, player, room) {
        if (state.freezeTimer > 0) {
          state.freezeTimer = Math.max(0, state.freezeTimer - dt);
          for (const enemy of room.enemies) {
            if (enemy.isBoss) {
              if (state.freezeTimer > 1.35) {
                enemy.vx *= 0.45;
                enemy.vy *= 0.45;
              }
            } else {
              enemy.vx = 0;
              enemy.vy = 0;
            }
          }
        }
      },
    },
  },

  // 37. Dado del hereje
  HERETIC_DICE: {
    id: 'HERETIC_DICE',
    name: 'Dado del hereje',
    short: 'DAD',
    color: '#dc2626',
    description: 'Cada 30s, una estadística aleatoria sube +50% y otra baja -25% por 8s.',
    initState: () => ({ timer: 30.0, activeTimer: 0, buffStat: null, debuffStat: null }),
    hooks: {
      onUpdate(dt, state, player) {
        if (state.activeTimer > 0) {
          state.activeTimer -= dt;
          if (state.activeTimer <= 0) {
            state.activeTimer = 0;
            state.buffStat = null;
            state.debuffStat = null;
            player.itemManager.applyPassiveStats();
          }
        } else {
          state.timer -= dt;
          if (state.timer <= 0) {
            state.timer = 30.0;
            state.activeTimer = 8.0;
            const statPool = ['speed', 'damageMultiplier', 'attackSpeedMultiplier'];
            state.buffStat = statPool[Math.floor(Math.random() * statPool.length)];
            const remaining = statPool.filter((s) => s !== state.buffStat);
            state.debuffStat = remaining[Math.floor(Math.random() * remaining.length)];
            player.itemManager.applyPassiveStats();
          }
        }
      },
      applyPassiveStats(stats, state) {
        if (state.activeTimer > 0) {
          if (state.buffStat) stats[state.buffStat] *= 1.5;
          if (state.debuffStat) stats[state.debuffStat] *= 0.75;
        }
      },
    },
  },

  // 38. Puerta diminuta
  TINY_DOOR: {
    id: 'TINY_DOOR',
    name: 'Puerta diminuta',
    short: 'PUE',
    color: '#0ea5e9',
    description: 'Cada 30s en combate te teletransporta a una posición segura con 0.5s invuln.',
    initState: () => ({ timer: 30.0 }),
    hooks: {
      onUpdate(dt, state, player, room) {
        if (room.enemies.length === 0) return;
        state.timer -= dt;
        if (state.timer <= 0) {
          state.timer = 30.0;
          const safePos = room.getRandomSafePosition(player.x, player.y, 220);
          room.spawnParticle(player.x, player.y, 0, 0, 20, '#0ea5e9', 0.45);
          player.x = safePos.x;
          player.y = safePos.y;
          player.invulnerableTimer = Math.max(player.invulnerableTimer, 0.5);
          room.spawnParticle(player.x, player.y, 0, 0, 20, '#0ea5e9', 0.45);
        }
      },
    },
  },

  // 39. Rey de ceniza
  ASH_KING: {
    id: 'ASH_KING',
    name: 'Rey de ceniza',
    short: 'CEN',
    color: '#a1a1aa',
    description: 'Si hay < 5 enemigos normales, ganan +20% Vel pero sueltan +75% Monedas.',
    hooks: {
      onUpdate(dt, state, player, room) {
        const normalEnemies = room.enemies.filter(
          (e) => !e.isBoss && !e.isElite && !e.markedForDeletion
        );
        if (normalEnemies.length > 0 && normalEnemies.length < 5) {
          for (const enemy of normalEnemies) {
            enemy.vx *= 1.2;
            enemy.vy *= 1.2;
            enemy.ashKingBoosted = true;
          }
        }
      },
      onKill(enemy, state, player, room) {
        if (enemy.ashKingBoosted && Math.random() < 0.75) {
          room.coins.push(new Coin(enemy.x + 8, enemy.y + 8));
        }
      },
    },
  },

  // 40. Ojo de la repetición
  REPETITION_EYE: {
    id: 'REPETITION_EYE',
    name: 'Ojo de la repetición',
    short: 'REP',
    color: '#f472b6',
    description: 'Cada 12s, tu próximo disparo repite una ráfaga eco al 60% de daño.',
    initState: () => ({ timer: 12.0, ready: false, pendingEcho: null }),
    hooks: {
      onUpdate(dt, state, player, room) {
        if (!state.ready) {
          state.timer -= dt;
          if (state.timer <= 0) {
            state.ready = true;
            state.timer = 12.0;
          }
        }
        if (state.pendingEcho) {
          state.pendingEcho.delay -= dt;
          if (state.pendingEcho.delay <= 0) {
            const p = state.pendingEcho;
            state.pendingEcho = null;
            const clone = new Projectile(
              player.x,
              player.y,
              p.dirX,
              p.dirY,
              p.speed,
              p.damage,
              p.radius,
              p.element,
              p.elementLevel
            );
            clone.isBonusProjectile = true;
            room.projectiles.push(clone);
          }
        }
      },
      onShoot(projectile, state) {
        if (state.ready && !projectile.isBonusProjectile) {
          state.ready = false;
          const norm = MathUtils.normalize(projectile.vx, projectile.vy);
          state.pendingEcho = {
            delay: 0.15,
            dirX: norm.x,
            dirY: norm.y,
            speed: norm.length || 520,
            damage: Math.max(1, Math.round(projectile.damage * 0.6)),
            radius: projectile.radius,
            element: projectile.element,
            elementLevel: projectile.elementLevel,
          };
        }
      },
    },
  },

  // IV. Reliquias de riesgo y recompensa

  // 41. Corona del usurpador
  USURPER_CROWN: {
    id: 'USURPER_CROWN',
    name: 'Corona del usurpador',
    short: 'CRU',
    color: '#fbbf24',
    description: '+35% daño, -20% vida máxima. Matar jefe sin daño los últimos 10s da Reliquia.',
    initState: () => ({ noHitTimer: 0 }),
    hooks: {
      applyPassiveStats(stats) {
        stats.damageMultiplier *= 1.35;
        stats.maxHp *= 0.8;
      },
      onUpdate(dt, state, player, room) {
        if (room.type === 'BOSS' && !room.cleared) {
          state.noHitTimer += dt;
        }
      },
      onDamageTaken(damageContext, state, player, room) {
        if (room && room.type === 'BOSS' && damageContext.amount > 0) {
          state.noHitTimer = 0;
        }
      },
      onBossKill(boss, state, player, room, itemManager) {
        if (state.noHitTimer >= 10.0) {
          itemManager.grantRandomRelic();
        }
        state.noHitTimer = 0;
      },
    },
  },

  // 42. Cáliz de sangre
  BLOOD_CHALICE: {
    id: 'BLOOD_CHALICE',
    name: 'Cáliz de sangre',
    short: 'SGR',
    color: '#ef4444',
    description: 'Anula curación normal. Cada 25 muertes recuperás 8% de vida máxima.',
    initState: () => ({ killCount: 0 }),
    hooks: {
      onHeal(healContext) {
        if (!healContext.isBloodChalice) {
          healContext.amount = 0;
        }
      },
      onKill(enemy, state, player) {
        state.killCount += 1;
        if (state.killCount >= 25) {
          state.killCount = 0;
          const healAmount = player.maxHp * 0.08;
          player.heal(healAmount, true);
        }
      },
    },
  },

  // 43. Cráneo de la avaricia
  GREED_SKULL: {
    id: 'GREED_SKULL',
    name: 'Cráneo de la avaricia',
    short: 'AVA',
    color: '#fef08a',
    description: 'Élites +30% HP y +20% Daño, pero otorgan +3 monedas extra al morir.',
    hooks: {
      onEnemySpawn(enemy) {
        if (enemy.isElite) {
          enemy.maxHp = Math.round(enemy.maxHp * 1.3);
          enemy.hp = enemy.maxHp;
          enemy.contactDamage = Math.round(enemy.contactDamage * 1.2);
        }
      },
      onKill(enemy, state, player, room) {
        if (enemy.isElite) {
          for (let i = 0; i < 3; i++) {
            room.coins.push(new Coin(enemy.x + (i - 1) * 12, enemy.y));
          }
        }
      },
    },
  },

  // 44. Máscara del insomne
  INSOMNIAC_MASK: {
    id: 'INSOMNIAC_MASK',
    name: 'Máscara del insomne',
    short: 'INS',
    color: '#cbd5e1',
    description: 'Aumenta el daño hasta +30% tras 20s sin recibir golpes. Se reinicia al ser herido.',
    initState: () => ({ cleanTime: 0, lastSec: 0 }),
    hooks: {
      onUpdate(dt, state, player) {
        if (state.cleanTime < 20.0) {
          state.cleanTime = Math.min(20.0, state.cleanTime + dt);
          const sec = Math.floor(state.cleanTime);
          if (sec !== state.lastSec) {
            state.lastSec = sec;
            player.itemManager.applyPassiveStats();
          }
        }
      },
      onDamageTaken(damageContext, state, player) {
        if (damageContext.amount > 0) {
          state.cleanTime = 0;
          state.lastSec = 0;
          player.itemManager.applyPassiveStats();
        }
      },
      applyPassiveStats(stats, state) {
        const bonus = (state.cleanTime / 20.0) * 0.3;
        stats.damageMultiplier *= 1 + bonus;
      },
    },
  },

  // 45. Vela funeraria
  FUNERAL_CANDLE: {
    id: 'FUNERAL_CANDLE',
    name: 'Vela funeraria',
    short: 'VEL',
    color: '#fde047',
    description: 'Drena HP lentamente (nunca baja de 1 HP), pero otorga +25% Daño y +25% Monedas.',
    hooks: {
      applyPassiveStats(stats) {
        stats.damageMultiplier *= 1.25;
        stats.extraCoinChance += 0.25;
      },
      onUpdate(dt, state, player) {
        const prevCeil = Math.ceil(player.hp);
        const drainPerSecond = player.maxHp * 0.0025;
        if (player.hp > 1) {
          player.hp = Math.max(1, player.hp - drainPerSecond * dt);
          if (Math.ceil(player.hp) !== prevCeil && player.ui) {
            player.ui.updateHealth(player);
          }
        }
      },
    },
  },

  // V. Reliquias legendarias y extrañas

  // 46. El ojo de los mil finales
  THOUSAND_ENDS_EYE: {
    id: 'THOUSAND_ENDS_EYE',
    name: 'El ojo de los mil finales',
    short: 'FIN',
    color: '#3b82f6',
    description: 'Cada jefe derrotado otorga una mejora permanente aleatoria (+DMG, +Vel o +HP).',
    initState: () => ({ permanentBuffs: { dmg: 0, speed: 0, hp: 0 } }),
    hooks: {
      onBossKill(boss, state, player, room, itemManager) {
        const rnd = Math.random();
        if (rnd < 0.33) state.permanentBuffs.dmg += 0.1;
        else if (rnd < 0.66) state.permanentBuffs.speed += 0.05;
        else state.permanentBuffs.hp += 20;
        itemManager.applyPassiveStats();
      },
      applyPassiveStats(stats, state) {
        stats.damageMultiplier *= 1 + state.permanentBuffs.dmg;
        stats.speed *= 1 + state.permanentBuffs.speed;
        stats.maxHp += state.permanentBuffs.hp;
      },
    },
  },

  // 47. Familiar de ultratumba
  GHOST_FAMILIAR: {
    id: 'GHOST_FAMILIAR',
    name: 'Familiar de ultratumba',
    short: 'FAM',
    color: '#a3e635',
    description: 'Cráneo flotante que dispara cada 2s. Su daño escala +5% por reliquia poseída.',
    initState: () => ({ timer: 1.2 }),
    hooks: {
      onUpdate(dt, state, player, room) {
        state.timer -= dt;
        if (state.timer <= 0 && room.enemies.length > 0) {
          state.timer = 2.0;
          const target = room.enemies.find((e) => !e.markedForDeletion);
          if (!target) return;
          const norm = MathUtils.normalize(target.x - player.x, target.y - (player.y - 26));
          const relicBonus = 1 + player.itemManager.ownedRelics.length * 0.05;
          const dmg = Math.round(18 * player.damageMultiplier * relicBonus);
          const proj = new Projectile(
            player.x - 16,
            player.y - 26,
            norm.x,
            norm.y,
            390,
            dmg,
            5,
            'MIRACLE',
            1
          );
          proj.isBonusProjectile = true;
          room.projectiles.push(proj);
        }
      },
      onDraw(ctx, state, player) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(player.x - 16, player.y - 26, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#a3e635';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#ecfccb';
        ctx.stroke();
        ctx.restore();
      },
    },
  },

  // 48. Llave de lo imposible
  IMPOSSIBLE_KEY: {
    id: 'IMPOSSIBLE_KEY',
    name: 'Llave de lo imposible',
    short: 'LLV',
    color: '#e879f9',
    description: 'Al derrotar al jefe del nivel, invoca un Cofre de Reliquia secreto adicional.',
    hooks: {
      onBossKill(boss, state, player, room) {
        room.relicChests.push(
          new RelicChest(ROOM_BOUNDS.centerX, ROOM_BOUNDS.centerY - 85)
        );
      },
    },
  },

  // 49. Corazón del dios muerto
  DEAD_GOD_HEART: {
    id: 'DEAD_GOD_HEART',
    name: 'Corazón del dios muerto',
    short: 'DIO',
    color: '#c084fc',
    description: 'Cada 10s, tu impacto inflige un 5% adicional de la vida actual del enemigo.',
    initState: () => ({ cooldown: 0, ready: true }),
    hooks: {
      onUpdate(dt, state) {
        if (!state.ready) {
          state.cooldown -= dt;
          if (state.cooldown <= 0) {
            state.ready = true;
            state.cooldown = 0;
          }
        }
      },
      onHit(projectile, enemy, state, player) {
        if (state.ready && !enemy.markedForDeletion) {
          state.ready = false;
          state.cooldown = 10.0;
          let extra = enemy.hp * 0.05;
          if (enemy.isBoss) extra = Math.min(extra, player.damageMultiplier * 200);
          enemy.takeDamage(extra, 0, 0, 'TRUE_DAMAGE');
        }
      },
    },
  },

  // 50. La reliquia que no debería existir
  GLITCHED_RELIC: {
    id: 'GLITCHED_RELIC',
    name: 'La reliquia que no debería existir',
    short: '???',
    color: '#ffffff',
    description: 'Sacrifica tus reliquias previas y muta su poder (+15% DMG, +10% Vel.Atq por c/u).',
    initState: () => ({ powerLevel: 1 }),
    hooks: {
      onPickup(state, player, itemManager) {
        const sacrificedCount = Math.max(
          1,
          itemManager.ownedRelics.reduce((acc, r) => acc + (r.level || 1), 0) - 1
        );
        state.powerLevel = sacrificedCount;

        const selfRelic = itemManager.ownedMap
          ? itemManager.ownedMap.get('GLITCHED_RELIC') || {
              ...RELIC_CATALOG.GLITCHED_RELIC,
              level: 1,
            }
          : { ...RELIC_CATALOG.GLITCHED_RELIC, level: 1 };
        itemManager.ownedRelics = [selfRelic];
        itemManager.ownedSet.clear();
        itemManager.ownedSet.add('GLITCHED_RELIC');
        if (itemManager.ownedMap) {
          itemManager.ownedMap.clear();
          itemManager.ownedMap.set('GLITCHED_RELIC', selfRelic);
        }

        for (const hookName of Object.keys(itemManager.hookSubscribers)) {
          itemManager.hookSubscribers[hookName] = itemManager.hookSubscribers[hookName].filter(
            (sub) => sub.relic.id === 'GLITCHED_RELIC'
          );
        }

        if (typeof BrotherEye !== 'undefined' && BrotherEye.enabled && typeof BrotherEye.recordRelicSacrifice === 'function') {
          BrotherEye.recordRelicSacrifice(sacrificedCount);
        }

        if (player.ui) {
          player.ui.showToast(
            `¡LA RELIQUIA PROHIBIDA CONSUMIÓ ${sacrificedCount} OBJETO(S)! Poder mutado x${sacrificedCount}`
          );
        }
      },
      applyPassiveStats(stats, state) {
        stats.damageMultiplier *= 1 + state.powerLevel * 0.15;
        stats.attackSpeedMultiplier *= 1 + state.powerLevel * 0.1;
        stats.speed *= 1 + state.powerLevel * 0.05;
      },
      onHit(projectile, enemy, state) {
        if (!enemy.markedForDeletion && Math.random() < 0.05 * state.powerLevel) {
          enemy.takeDamage(180 * state.powerLevel, 0, 0, 'TRUE_DAMAGE');
        }
      },
    },
  },

  // ==========================================================================
  // RELIQUIAS #51 - #75 (EXPANSIÓN v2.1 - INTEGRADAS AL MOTOR)
  // ==========================================================================

  // 51. Corona del avaro
  GREED_CROWN: {
    id: 'GREED_CROWN',
    name: 'Corona del avaro',
    short: 'AVR',
    color: '#facc15',
    description: 'Por cada 10 monedas obtenés un 2% de daño adicional. Máximo: 30%.',
    hooks: {
      applyPassiveStats(stats, state, player) {
        const coins = player.coins || player.gold || 0;
        const bonus = Math.min(0.3, Math.floor(coins / 10) * 0.02);
        stats.damageMultiplier *= 1 + bonus;
      },
    },
  },

  // 52. Hongo mutante
  MUTANT_MUSHROOM: {
    id: 'MUTANT_MUSHROOM',
    name: 'Hongo mutante',
    short: 'MUT',
    color: '#a3e635',
    description: 'Aumenta tu tamaño un 20% y tu vida máxima un 25%, pero reduce tu velocidad un 10%.',
    hooks: {
      onPickup(state, player) {
        player.sizeMultiplier = (player.sizeMultiplier || 1) * 1.2;
      },
      applyPassiveStats(stats) {
        stats.sizeMultiplier *= 1.2;
        stats.maxHp *= 1.25;
        stats.speed *= 0.9;
      },
    },
  },

  // 53. Munición fantasma
  GHOST_AMMO: {
    id: 'GHOST_AMMO',
    name: 'Munición fantasma',
    short: 'GHO',
    color: '#c4b5fd',
    description: 'Tus proyectiles tienen un 20% de probabilidad de atravesar enemigos sin desaparecer.',
    hooks: {
      onShoot(projectile) {
        if (Math.random() < 0.2) {
          projectile.piercing = true;
          projectile.ghostPiercing = true;
        }
      },
    },
  },

  // 54. Corazón congelado
  FROZEN_HEART: {
    id: 'FROZEN_HEART',
    name: 'Corazón congelado',
    short: 'FRZ',
    color: '#67e8f9',
    description: 'Al recibir daño, congelás a los enemigos cercanos durante 1,5 segundos. Enfriamiento: 12 segundos.',
    initState: () => ({ cooldown: 0 }),
    hooks: {
      onUpdate(dt, state) {
        state.cooldown = Math.max(0, state.cooldown - dt);
      },
      onDamageTaken(damageContext, state, player, room) {
        if (state.cooldown > 0 || !room || !room.enemies) return;

        state.cooldown = 12;
        const radius = 180;

        for (const enemy of room.enemies) {
          if (enemy.markedForDeletion) continue;

          const dx = enemy.x - player.x;
          const dy = enemy.y - player.y;

          if (Math.hypot(dx, dy) <= radius) {
            if (enemy.isBoss) {
              enemy.applyElementalEffect?.('ICE', room, 1);
            } else {
              if (typeof enemy.setFrozen === 'function') {
                enemy.setFrozen(1.5);
              } else {
                enemy.applyElementalEffect?.('ICE', room, 1);
              }
              enemy.frozen = true;
              enemy.freezeTimer = Math.max(enemy.freezeTimer || 0, 1.5);
            }
          }
        }

        room.spawnParticle?.(player.x, player.y, '#67e8f9', 24);
      },
    },
  },

  // 55. Dado de la fortuna
  LUCKY_DICE: {
    id: 'LUCKY_DICE',
    name: 'Dado de la fortuna',
    short: 'LKD',
    color: '#f9a8d4',
    description: 'Al subir de nivel, tenés un 15% de probabilidad de recibir una cuarta opción de mejora en la Tienda.',
    initState: () => ({ bonusChoices: 0 }),
    hooks: {
      onLevelStart(state, player) {
        if (Math.random() < 0.15) {
          state.bonusChoices++;
          player.extraUpgradeChoices = (player.extraUpgradeChoices || 0) + 1;
          player.ui?.showToast?.('¡DADO DE LA FORTUNA! 4ta opción de mejora añadida en la Tienda.');
        }
      },
    },
  },

  // 56. Bendición olímpica
  OLYMPIAN_BLESSING: {
    id: 'OLYMPIAN_BLESSING',
    name: 'Bendición olímpica',
    short: 'OLI',
    color: '#fbbf24',
    description: 'Cada 30 segundos, tu siguiente ataque recibe un efecto elemental aleatorio (+50% daño elemental).',
    initState: () => ({ timer: 30, ready: false }),
    hooks: {
      onUpdate(dt, state) {
        if (state.ready) return;

        state.timer -= dt;
        if (state.timer <= 0) {
          state.ready = true;
          state.timer = 0;
        }
      },
      onShoot(projectile, state, player) {
        if (!state.ready || projectile.isBonusProjectile) return;

        const elements = ['FIRE', 'ICE', 'ELECTRIC', 'POISON', 'BLEED', 'MIRACLE'];
        const element = elements[Math.floor(Math.random() * elements.length)];

        projectile.elementalEffect = element;
        projectile.element = element;
        projectile.elementLevel = Math.max(1, player.getElementLevel ? player.getElementLevel(element) : 1);
        projectile.elementalDamage = Math.round(projectile.damage * 0.5);

        state.ready = false;
        state.timer = 30;

        player.ui?.showToast?.(`¡BENDICIÓN OLÍMPICA: ${element}!`);
      },
    },
  },

  // 57. Venganza divina
  DIVINE_REVENGE: {
    id: 'DIVINE_REVENGE',
    name: 'Venganza divina',
    short: 'DIV',
    color: '#fcd34d',
    description: 'Al recibir daño, liberás una explosión que daña a todos los enemigos cercanos.',
    hooks: {
      onDamageTaken(damageContext, state, player, room) {
        if (!room || !room.enemies) return;

        const radius = 150;
        const damage = 35 * (player.damageMultiplier || 1);

        for (const enemy of room.enemies) {
          if (enemy.markedForDeletion) continue;

          const distance = Math.hypot(enemy.x - player.x, enemy.y - player.y);
          if (distance <= radius) {
            enemy.takeDamage(damage, 0, 0, 'DIVINE_REVENGE');
          }
        }

        room.spawnParticle?.(player.x, player.y, '#fcd34d', 28);
      },
    },
  },

  // 58. Puño del titán
  TITANS_FIST: {
    id: 'TITANS_FIST',
    name: 'Puño del titán',
    short: 'TIT',
    color: '#fb923c',
    description: 'Cada 10 enemigos eliminados sin recibir daño, tu próximo impacto inflige el triple de daño.',
    initState: () => ({
      killStreak: 0,
      empowered: false,
    }),
    hooks: {
      onKill(enemy, state) {
        state.killStreak++;
        if (state.killStreak >= 10) {
          state.killStreak = 0;
          state.empowered = true;
        }
      },
      onDamageTaken(damageContext, state) {
        if (damageContext.amount > 0) {
          state.killStreak = 0;
        }
      },
      onShoot(projectile, state, player) {
        if (!state.empowered || projectile.isBonusProjectile) return;

        projectile.damage *= 3;
        projectile.radius = Math.round(projectile.radius * 1.35);
        state.empowered = false;

        player.ui?.showToast?.('¡PUÑO DEL TITÁN (Daño x3)!');
      },
    },
  },

  // 59. Pergamino ancestral
  ANCIENT_SCROLL: {
    id: 'ANCIENT_SCROLL',
    name: 'Pergamino ancestral',
    short: 'PER',
    color: '#d6a56d',
    description: 'Cada mejora elegida aumenta permanentemente un 1% la experiencia y poder obtenidos. Máximo: 30%.',
    initState: () => ({ experienceBonus: 0 }),
    hooks: {
      onUpgradeChosen(state, player) {
        state.experienceBonus = Math.min(0.3, state.experienceBonus + 0.01);
        player.experienceMultiplier = 1 + state.experienceBonus;
        player.itemManager?.applyPassiveStats();
      },
      applyPassiveStats(stats, state) {
        if (state.experienceBonus > 0) {
          stats.damageMultiplier *= 1 + state.experienceBonus;
          stats.extraCoinChance += state.experienceBonus;
        }
      },
    },
  },

  // 60. Pluma del fénix
  PHOENIX_FEATHER: {
    id: 'PHOENIX_FEATHER',
    name: 'Pluma del fénix',
    short: 'FEN',
    color: '#fb7185',
    description: 'Al morir, revivís una vez con el 30% de tu vida máxima y dañás a los enemigos cercanos.',
    initState: () => ({ used: false }),
    hooks: {
      onDeath(state, player, room) {
        if (state.used) return false;

        state.used = true;

        player.hp = Math.max(1, Math.floor(player.maxHp * 0.3));
        player.isDead = false;
        player.dead = false;
        player.invulnerabilityTimer = 2.0;
        player.invulnerableTimer = 2.0;

        if (room && room.enemies) {
          const radius = 200;
          const damage = 100 * (player.damageMultiplier || 1);

          for (const enemy of room.enemies) {
            if (enemy.markedForDeletion) continue;

            if (Math.hypot(enemy.x - player.x, enemy.y - player.y) <= radius) {
              enemy.takeDamage(damage, 0, 0, 'PHOENIX_EXPLOSION');
            }
          }
        }

        room?.spawnParticle?.(player.x, player.y, '#fb7185', 36);
        player.ui?.updateHealth?.(player);
        player.ui?.showToast?.('¡EL FÉNIX RENACE! (30% HP restaurado + 2s Invulnerable)');
        return true;
      },
    },
  },

  // 61. Protocolo de misiles
  MISSILE_PROTOCOL: {
    id: 'MISSILE_PROTOCOL',
    name: 'Protocolo de misiles',
    short: 'MIS',
    color: '#f97316',
    description: 'Cada impacto tiene un 8% de probabilidad de lanzar un misil teledirigido que inflige el 200% del daño base. Enfriamiento interno: 0,5 segundos.',
    initState: () => ({ cooldown: 0 }),
    hooks: {
      onUpdate(dt, state) {
        state.cooldown = Math.max(0, state.cooldown - dt);
      },
      onHit(projectile, enemy, state, player, room, damageDealt) {
        if (state.cooldown > 0 || enemy.markedForDeletion) return;
        if (Math.random() >= 0.08) return;

        state.cooldown = 0.5;
        if (!room || !room.projectiles) return;

        const target =
          !enemy.markedForDeletion && enemy.hp > 0
            ? enemy
            : room.enemies.find((e) => !e.markedForDeletion);
        if (!target) return;

        const baseDmg = projectile && projectile.damage ? projectile.damage : damageDealt || 24;
        const missile = {
          x: player.x,
          y: player.y,
          damage: Math.round(baseDmg * 2),
          speed: 500,
          radius: 7,
          homingStrength: 1,
          target,
          isMissile: true,
          isBonusProjectile: true,
          owner: player,
          markedForDeletion: false,
          angle: 0,
          update(dt, currentRoom) {
            if (!this.target || this.target.markedForDeletion) {
              const nextTarget =
                currentRoom && currentRoom.enemies
                  ? currentRoom.enemies.find((e) => !e.markedForDeletion)
                  : null;
              if (!nextTarget) {
                this.markedForDeletion = true;
                return;
              }
              this.target = nextTarget;
            }

            const dx = this.target.x - this.x;
            const dy = this.target.y - this.y;
            const distance = Math.hypot(dx, dy) || 1;
            this.angle = Math.atan2(dy, dx);

            this.x += (dx / distance) * this.speed * dt;
            this.y += (dy / distance) * this.speed * dt;

            if (distance < 15 + (this.target.radius || 15)) {
              this.target.takeDamage(this.damage, (dx / distance) * 180, (dy / distance) * 180, 'MISSILE');
              currentRoom?.spawnParticle?.(this.x, this.y, '#f97316', 12);
              this.markedForDeletion = true;
            }
          },
          draw(ctx) {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.angle);
            ctx.fillStyle = '#f97316';
            ctx.strokeStyle = '#fef08a';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(10, 0);
            ctx.lineTo(-7, -5);
            ctx.lineTo(-4, 0);
            ctx.lineTo(-7, 5);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          },
        };

        room.projectiles.push(missile);
      },
    },
  },

  // 62. Inyector de adrenalina
  ADRENALINE_INJECTOR: {
    id: 'ADRENALINE_INJECTOR',
    name: 'Inyector de adrenalina',
    short: 'ADR',
    color: '#f43f5e',
    description: 'Aumenta tu velocidad de ataque un 15%. El efecto se acumula hasta tres veces.',
    initState: () => ({ stacks: 1 }),
    hooks: {
      onPickup(state) {
        state.stacks = Math.min(3, state.stacks || 1);
      },
      applyPassiveStats(stats, state, player, itemManager) {
        const relicObj = itemManager?.ownedMap?.get('ADRENALINE_INJECTOR');
        const effectiveStacks = Math.min(3, Math.max(state.stacks || 1, relicObj?.level || 1));
        stats.attackSpeedMultiplier *= 1 + 0.15 * effectiveStacks;
      },
    },
  },

  // 63. Estandarte de guerra
  WAR_BANNER: {
    id: 'WAR_BANNER',
    name: 'Estandarte de guerra',
    short: 'EST',
    color: '#ef4444',
    description: 'Al subir de nivel o iniciar sala de combate, creás un círculo de poder durante 10 segundos (+25% daño y velocidad de ataque).',
    initState: () => ({
      active: false,
      timer: 0,
      radius: 180,
      x: 480,
      y: 320,
      bonusActive: false,
    }),
    hooks: {
      onLevelStart(state, player) {
        state.active = true;
        state.timer = 10;
        state.x = player.x;
        state.y = player.y;
      },
      onRoomStart(room, state, player) {
        if (!room.cleared && room.enemies.length > 0) {
          state.active = true;
          state.timer = 10;
          state.x = player.x;
          state.y = player.y;
        }
      },
      onUpdate(dt, state, player) {
        if (!state.active) return;

        state.timer -= dt;
        const prevBonus = state.bonusActive;

        if (state.timer <= 0) {
          state.active = false;
          state.timer = 0;
          state.bonusActive = false;
          if (prevBonus) player.itemManager?.applyPassiveStats();
          return;
        }

        const inside = Math.hypot(player.x - state.x, player.y - state.y) <= state.radius;
        state.bonusActive = inside;
        if (state.bonusActive !== prevBonus) {
          player.itemManager?.applyPassiveStats();
        }
      },
      applyPassiveStats(stats, state) {
        if (state.active && state.bonusActive) {
          stats.damageMultiplier *= 1.25;
          stats.attackSpeedMultiplier *= 1.25;
        }
      },
      onDraw(ctx, state) {
        if (!state.active) return;

        ctx.save();
        ctx.beginPath();
        ctx.arc(state.x, state.y, state.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.10)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.65)';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
      },
    },
  },

  // 64. Lentes de precisión
  PRECISION_GLASSES: {
    id: 'PRECISION_GLASSES',
    name: 'Lentes de precisión',
    short: 'LEN',
    color: '#f87171',
    description: 'Aumentan tu probabilidad de golpe crítico (Daño x2) un 10%. Se pueden acumular.',
    hooks: {
      applyPassiveStats(stats) {
        stats.critChance = (stats.critChance || 0) + 0.1;
      },
    },
  },

  // 65. Pluma lunar
  MOON_FEATHER: {
    id: 'MOON_FEATHER',
    name: 'Pluma lunar',
    short: 'LUN',
    color: '#a5b4fc',
    description: 'Obtenés un impulso de evasión adicional ([SHIFT] / [F]). Suma +1 carga a tu capacidad máxima de esquiva (hasta 3 cargas).',
    hooks: {
      onPickup(state, player) {
        player.maxDodgeCharges = (player.maxDodgeCharges || 2) + 1;
        player.dodgeCharges = Math.min(
          player.maxDodgeCharges,
          (player.dodgeCharges || 2) + 1
        );
      },
      applyPassiveStats(stats, state, player) {
        if ((player.maxDodgeCharges || 2) < 3) {
          player.maxDodgeCharges = 3;
        }
      },
    },
  },

  // 66. Brújula del destino
  DESTINY_COMPASS: {
    id: 'DESTINY_COMPASS',
    name: 'Brújula del destino',
    short: 'BRU',
    color: '#38bdf8',
    description: 'Al cambiar de nivel, alterna entre dos rutas bendecidas: Ruta de la Experiencia (+50% Oro) y Ruta de las Reliquias (+50% Élites).',
    initState: () => ({ routesGenerated: 0 }),
    hooks: {
      onLevelStart(state, player) {
        state.routesGenerated++;

        player.availableRoutes = [
          {
            id: 'EXPERIENCE_ROUTE',
            name: 'Ruta de la experiencia',
            experienceMultiplier: 1.5,
            relicChanceMultiplier: 1,
          },
          {
            id: 'RELIC_ROUTE',
            name: 'Ruta de las reliquias',
            experienceMultiplier: 1,
            relicChanceMultiplier: 1.5,
          },
        ];

        const activeRoute = player.availableRoutes[state.routesGenerated % 2];
        player.activeDestinyRoute = activeRoute;
        player.experienceMultiplier = activeRoute.experienceMultiplier;
        player.relicChanceMultiplier = activeRoute.relicChanceMultiplier;
        player.itemManager?.applyPassiveStats();

        player.ui?.showToast?.(
          `¡BRÚJULA DEL DESTINO: ${activeRoute.name.toUpperCase()} ACTIVA!`
        );
      },
      applyPassiveStats(stats, state, player) {
        if (player.activeDestinyRoute?.id === 'EXPERIENCE_ROUTE') {
          stats.extraCoinChance += 0.35;
        }
      },
    },
  },

  // 67. Libro de los sacrificios
  SACRIFICE_BOOK: {
    id: 'SACRIFICE_BOOK',
    name: 'Libro de los sacrificios',
    short: 'SAC',
    color: '#a78bfa',
    description: 'Al derrotar a un jefe, sacrificás una fracción de salud máxima (-10 HP base) para invocar una Reliquia adicional.',
    initState: () => ({ bossKills: 0 }),
    hooks: {
      onBossKill(boss, state, player, room, itemManager) {
        state.bossKills++;

        player.pendingSacrifice = {
          title: 'Libro de los sacrificios',
          description: 'Sacrificá una mejora permanente para obtener una reliquia de mayor rareza.',
          options: {
            sacrificeUpgrade: true,
            rewardRelic: true,
            rarityBonus: 1,
          },
        };

        if (player.baseMaxHp > 60) {
          player.baseMaxHp = Math.max(60, player.baseMaxHp - 10);
        }
        itemManager?.grantRandomRelic();
        player.ui?.showToast?.('¡El Libro de los sacrificios aceptó tu ofrenda (-10 HP Máx -> +1 Reliquia)!');
      },
    },
  },

  // 68. Arena acelerada
  ACCELERATED_SAND: {
    id: 'ACCELERATED_SAND',
    name: 'Arena acelerada',
    short: 'AAC',
    color: '#fcd34d',
    description: 'Cada enemigo eliminado reduce en 0,2 segundos el enfriamiento de tus habilidades y reliquias. Máximo: 2 segundos por activación.',
    initState: () => ({ reduction: 0 }),
    hooks: {
      onKill(enemy, state, player, room, itemManager) {
        state.reduction = Math.min(2, state.reduction + 0.2);

        player.skillCooldownReduction = Math.min(
          2,
          (player.skillCooldownReduction || 0) + 0.2
        );

        if (player.dodgeCooldownTimer > 0) {
          player.dodgeCooldownTimer = Math.max(0, player.dodgeCooldownTimer - 0.2);
        }

        if (itemManager && itemManager.relicStates) {
          for (const [id, rState] of itemManager.relicStates.entries()) {
            if (id === 'ACCELERATED_SAND' || !rState) continue;
            if (typeof rState.cooldown === 'number' && rState.cooldown > 0) {
              rState.cooldown = Math.max(0, rState.cooldown - 0.2);
            }
            if (typeof rState.timer === 'number' && rState.timer > 0.2 && !rState.ready) {
              rState.timer = Math.max(0.1, rState.timer - 0.2);
            }
          }
        }
      },
    },
  },

  // 69. Cáliz de la abundancia
  CHALICE_OF_ABUNDANCE: {
    id: 'CHALICE_OF_ABUNDANCE',
    name: 'Cáliz de la abundancia',
    short: 'CAB',
    color: '#fbbf24',
    description: 'Los enemigos normales tienen un 5% de probabilidad de soltar entre 5 y 10 monedas adicionales al morir.',
    hooks: {
      onKill(enemy, state, player, room) {
        if (enemy.isBoss || enemy.isElite) return;
        if (Math.random() >= 0.05) return;

        const amount = 5 + Math.floor(Math.random() * 6);
        if (room && typeof room.spawnCoin === 'function') {
          room.spawnCoin(enemy.x, enemy.y, amount);
        } else if (player && typeof player.addCoins === 'function') {
          player.addCoins(amount);
        }
      },
    },
  },

  // 70. Marca del cazador
  HUNTERS_MARK: {
    id: 'HUNTERS_MARK',
    name: 'Marca del cazador',
    short: 'MAR',
    color: '#f97316',
    description: 'Al dañar a un enemigo de élite, lo marcás durante 5 segundos. Mientras está marcado, recibe un 25% más de daño.',
    hooks: {
      onHit(projectile, enemy) {
        if (!enemy.isElite || enemy.markedForDeletion) return;

        enemy.huntersMarkTimer = 5;
        enemy.huntersMarkDamageMultiplier = 1.25;
        enemy.isMarkedByHunter = true;
      },
      onUpdate(dt, state, player, room) {
        if (!room?.enemies) return;

        for (const enemy of room.enemies) {
          if (!enemy.isMarkedByHunter) continue;

          enemy.huntersMarkTimer -= dt;
          if (enemy.huntersMarkTimer <= 0) {
            enemy.huntersMarkTimer = 0;
            enemy.huntersMarkDamageMultiplier = 1;
            enemy.isMarkedByHunter = false;
          }
        }
      },
      onDraw(ctx, state, player, room) {
        if (!room?.enemies) return;

        for (const enemy of room.enemies) {
          if (!enemy.isMarkedByHunter || enemy.markedForDeletion) continue;

          ctx.save();
          ctx.strokeStyle = '#f97316';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(enemy.x, enemy.y, (enemy.radius || 15) + 8, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      },
    },
  },

  // 71. Núcleo regenerativo
  REGENERATIVE_CORE: {
    id: 'REGENERATIVE_CORE',
    name: 'Núcleo regenerativo',
    short: 'NUC',
    color: '#4ade80',
    description: 'Si pasás 8 segundos sin recibir daño, recuperás un 3% de tu vida máxima cada 2 segundos.',
    initState: () => ({
      timeWithoutDamage: 0,
      regenTimer: 0,
    }),
    hooks: {
      onDamageTaken(damageContext, state) {
        if (damageContext.amount > 0) {
          state.timeWithoutDamage = 0;
          state.regenTimer = 0;
        }
      },
      onUpdate(dt, state, player) {
        state.timeWithoutDamage += dt;
        if (state.timeWithoutDamage < 8) return;

        state.regenTimer += dt;
        if (state.regenTimer >= 2) {
          state.regenTimer -= 2;
          const healAmount = player.maxHp * 0.03;
          if (typeof player.heal === 'function') {
            player.heal(healAmount);
          } else {
            player.hp = Math.min(player.maxHp, player.hp + healAmount);
            player.ui?.updateHealth?.(player);
          }
        }
      },
    },
  },

  // 72. Granada tóxica
  TOXIC_GRENADE: {
    id: 'TOXIC_GRENADE',
    name: 'Granada tóxica',
    short: 'GRA',
    color: '#84cc16',
    description: 'Cada 15 enemigos eliminados, el siguiente enemigo que matás deja una nube venenosa durante 5 segundos.',
    initState: () => ({
      kills: 0,
      cloudReady: false,
    }),
    hooks: {
      onKill(enemy, state, player, room) {
        state.kills++;

        if (state.kills >= 15) {
          state.kills = 0;
          state.cloudReady = true;
          return;
        }

        if (!state.cloudReady) return;
        state.cloudReady = false;

        room?.spawnPoisonCloud?.(enemy.x, enemy.y, {
          duration: 5,
          radius: 100,
          damagePerSecond: 15 * (player.damageMultiplier || 1),
        });
      },
    },
  },

  // 73. Orbe de duplicación
  DUPLICATION_ORB: {
    id: 'DUPLICATION_ORB',
    name: 'Orbe de duplicación',
    short: 'ORB',
    color: '#c084fc',
    description: 'Cada 25 segundos, duplicás el próximo proyectil que disparás. Ambos conservan los efectos del disparo original.',
    initState: () => ({
      timer: 25,
      ready: false,
    }),
    hooks: {
      onUpdate(dt, state) {
        if (state.ready) return;

        state.timer -= dt;
        if (state.timer <= 0) {
          state.ready = true;
          state.timer = 0;
        }
      },
      onShoot(projectile, state, player, room) {
        if (!state.ready || !room?.projectiles || projectile.isBonusProjectile) return;

        const vx = projectile.velocityX || projectile.vx || 1;
        const vy = projectile.velocityY || projectile.vy || 0;
        const angle = Math.atan2(vy, vx);
        const spread = 0.12;
        const speed = projectile.speed || Math.hypot(vx, vy) || 480;

        const duplicate = new Projectile(
          projectile.x,
          projectile.y,
          Math.cos(angle + spread),
          Math.sin(angle + spread),
          speed,
          projectile.damage,
          projectile.radius,
          projectile.element,
          projectile.elementLevel
        );
        duplicate.isBonusProjectile = true;
        duplicate.duplicated = true;
        duplicate.piercing = projectile.piercing;
        duplicate.ghostPiercing = projectile.ghostPiercing;
        duplicate.bouncesLeft = projectile.bouncesLeft;
        duplicate.homingStrength = projectile.homingStrength;
        duplicate.elementalDamage = projectile.elementalDamage || 0;

        room.projectiles.push(duplicate);

        state.ready = false;
        state.timer = 25;

        player.ui?.showToast?.('¡ORBE DE DUPLICACIÓN!');
      },
    },
  },

  // 74. Cronómetro de combate
  COMBAT_STOPWATCH: {
    id: 'COMBAT_STOPWATCH',
    name: 'Cronómetro de combate',
    short: 'CRO',
    color: '#38bdf8',
    description: 'Por cada enemigo eliminado en menos de 2 segundos desde que aparece, obtenés un 1% de velocidad durante 5 segundos (Máx: 20 acumulaciones).',
    initState: () => ({
      spawnTimes: new WeakMap(),
      speedStacks: 0,
      timer: 0,
    }),
    hooks: {
      onEnemySpawn(enemy, state) {
        state.spawnTimes.set(enemy, 0);
      },
      onUpdate(dt, state, player, room) {
        if (room?.enemies) {
          for (const enemy of room.enemies) {
            if (state.spawnTimes.has(enemy)) {
              state.spawnTimes.set(enemy, state.spawnTimes.get(enemy) + dt);
            }
          }
        }

        if (state.speedStacks > 0) {
          state.timer -= dt;
          if (state.timer <= 0) {
            state.speedStacks = 0;
            state.timer = 0;
            player.itemManager?.applyPassiveStats();
          }
        }
      },
      onKill(enemy, state, player) {
        const spawnTime = state.spawnTimes.get(enemy);
        if (spawnTime === undefined || spawnTime > 2) return;

        state.speedStacks = Math.min(20, state.speedStacks + 1);
        state.timer = 5;
        player.speedBonus = 1 + state.speedStacks * 0.01;
        player.itemManager?.applyPassiveStats();
      },
      applyPassiveStats(stats, state) {
        stats.speed *= 1 + (state.speedStacks || 0) * 0.01;
      },
    },
  },

  // 75. Máscara del inmortal
  IMMORTALS_MASK: {
    id: 'IMMORTALS_MASK',
    name: 'Máscara del inmortal',
    short: 'INM',
    color: '#e879f9',
    description: 'Cada jefe derrotado sin recibir daño te otorga una carga. Cada carga aumenta tu daño un 5%. Máximo: 5 cargas.',
    initState: () => ({
      charges: 0,
      bossFightClean: true,
    }),
    hooks: {
      onEnemySpawn(enemy, state) {
        if (enemy.isBoss) {
          state.bossFightClean = true;
        }
      },
      onDamageTaken(damageContext, state) {
        if (damageContext.amount > 0) {
          state.bossFightClean = false;
        }
      },
      onBossKill(boss, state, player, room, itemManager) {
        if (!state.bossFightClean) return;

        state.charges = Math.min(5, state.charges + 1);
        itemManager?.applyPassiveStats();

        player.ui?.showToast?.(
          `¡EJECUCIÓN PERFECTA! Cargas: ${state.charges}/5`
        );
      },
      applyPassiveStats(stats, state) {
        stats.damageMultiplier *= 1 + (state.charges || 0) * 0.05;
      },
    },
  },
};

const RELIC_KEYS = Object.keys(RELIC_CATALOG);

/**
 * Función auxiliar para registrar nuevas reliquias dinámicamente si se agregan por fuera.
 */
function registerRelic(relicDefinition) {
  if (!relicDefinition || !relicDefinition.id) return;
  RELIC_CATALOG[relicDefinition.id] = relicDefinition;
  if (!RELIC_KEYS.includes(relicDefinition.id)) {
    RELIC_KEYS.push(relicDefinition.id);
  }
}


/**
 * Gestor Modular de Reliquias (`ItemManager` - v2.1):
 *  - Basado en Hooks / Patrón Observer sin límite máximo (cap) en el inventario.
 *  - Si el RNG de un cofre lanza una Reliquia que el jugador ya posee, sube de nivel (`relic.level++`).
 *  - Fórmula Genérica en Hooks: Escala matemáticamente el efecto de cualquier reliquia según
 *    `Efectividad = BaseValue * (1 + (relic.level * 0.20))` (aumentando daño/bonos pasivos,
 *    reduciendo cooldowns o subiendo probabilidades de activación con cap al 100%).
 */
class ItemManager {
  constructor(player) {
    this.player = player;
    this.ownedRelics = [];
    this.ownedSet = new Set();
    this.ownedMap = new Map();
    this.relicStates = new Map();

    // Mazo barajado aleatoriamente con Fisher-Yates
    this.shuffledDeck = ItemManager.shuffleArray(RELIC_KEYS);

    this.hookSubscribers = {
      onPickup: [],
      applyPassiveStats: [],
      onShoot: [],
      onHit: [],
      onKill: [],
      onBossKill: [],
      onEnemySpawn: [],
      onRoomStart: [],
      onLevelStart: [],
      onUpgradeChosen: [],
      onHeal: [],
      onUpdate: [],
      onDamageTaken: [],
      onDeath: [],
      onDraw: [],
    };
  }

  /**
   * Baraja un array mediante Fisher-Yates usando `crypto.getRandomValues` (con fallback a `Math.random`)
   * para evitar cualquier patrón predecible o secuencial.
   */
  static shuffleArray(sourceArray) {
    const arr = [...sourceArray];
    for (let i = arr.length - 1; i > 0; i--) {
      let rand = Math.random();
      if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
        const buf = new Uint32Array(1);
        window.crypto.getRandomValues(buf);
        rand = buf[0] / (0xffffffff + 1);
      }
      const j = Math.floor(rand * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  /**
   * Fórmula Genérica de Escalado de Reliquias (v2.0+):
   * `Efectividad = BaseValue * (1 + (relic.level * 0.20))` cuando la reliquia tiene stacks.
   */
  getRelicEffectiveness(relic) {
    if (!relic) return 1.0;
    const lvl = relic.level || 1;
    return lvl > 1 ? 1 + lvl * 0.2 : 1.0;
  }

  /**
   * Ejecuta un hook escalando temporalmente `Math.random` por `effectiveness`, de modo que
   * cualquier chequeo de probabilidad `if (Math.random() < prob)` escale automáticamente a
   * `min(1.0, prob * effectiveness)` (capeado al 100%) sin alterar índices de arrays.
   */
  withScaledProbability(effectiveness, callback) {
    if (effectiveness <= 1.0) {
      return callback();
    }
    const originalRandom = Math.random;
    Math.random = () => originalRandom() / effectiveness;
    try {
      return callback();
    } finally {
      Math.random = originalRandom;
    }
  }

  /**
   * Vacía por completo el inventario de Reliquias (utilizado por el Altar del Cuerpo en `NexusRoom`).
   */
  clearAllRelics() {
    this.ownedRelics = [];
    this.ownedSet.clear();
    this.ownedMap.clear();
    this.relicStates.clear();
    for (const hookName of Object.keys(this.hookSubscribers)) {
      this.hookSubscribers[hookName] = [];
    }
    this.applyPassiveStats();
    if (this.player.ui) {
      this.player.ui.updateRelics(this.ownedRelics, null);
    }
  }

  /**
   * Comprueba si el jugador posee una reliquia específica por su ID.
   * @param {string} relicId
   * @returns {boolean}
   */
  hasRelic(relicId) {
    return Boolean(this.ownedSet && this.ownedSet.has(relicId));
  }

  /**
   * Obtiene la instancia de una reliquia por su ID si el jugador la posee.
   * @param {string} relicId
   * @returns {object|null}
   */
  getRelic(relicId) {
    return (this.ownedMap && this.ownedMap.get(relicId)) || null;
  }

  /**
   * Elimina una reliquia del inventario, desuscribe todos sus hooks y recalcula pasivas.
   * @param {string} relicId
   * @returns {boolean} true si fue eliminada exitosamente
   */
  removeRelic(relicId) {
    if (!this.ownedSet || !this.ownedSet.has(relicId)) return false;

    this.ownedSet.delete(relicId);
    this.ownedMap.delete(relicId);
    this.relicStates.delete(relicId);
    this.ownedRelics = this.ownedRelics.filter(r => r && r.id !== relicId && r.key !== relicId);

    for (const hookName of Object.keys(this.hookSubscribers)) {
      this.hookSubscribers[hookName] = this.hookSubscribers[hookName].filter(
        sub => sub && sub.relic && sub.relic.id !== relicId && sub.relic.key !== relicId
      );
    }

    this.applyPassiveStats();
    if (this.player.ui) {
      this.player.ui.updateRelics(this.ownedRelics, null);
    }
    return true;
  }

  /**
   * Añade una reliquia por su ID o incrementa su nivel (`relic.level++`) si el jugador ya la posee.
   */
  addRelic(relicId) {
    const relicDef = RELIC_CATALOG[relicId];
    if (!relicDef) return null;

    let relicInstance = this.ownedMap.get(relicId);

    if (!relicInstance) {
      relicInstance = {
        ...relicDef,
        level: 1,
        justStacked: false,
      };
      this.ownedSet.add(relicId);
      this.ownedMap.set(relicId, relicInstance);
      this.ownedRelics.push(relicInstance);

      const initialState = relicDef.initState ? relicDef.initState() : {};
      initialState.level = 1;
      this.relicStates.set(relicId, initialState);

      if (relicDef.hooks) {
        for (const hookName of Object.keys(this.hookSubscribers)) {
          if (typeof relicDef.hooks[hookName] === 'function') {
            this.hookSubscribers[hookName].push({
              relic: relicInstance,
              fn: relicDef.hooks[hookName],
              state: initialState,
            });
          }
        }
        if (typeof relicDef.hooks.onPickup === 'function') {
          relicDef.hooks.onPickup(initialState, this.player, this);
        }
      }
    } else {
      // Escalado Infinito de Reliquias (v2.0+): si ya la posee, sube de nivel (`relic.level++`)
      relicInstance.level += 1;
      relicInstance.justStacked = true;
      const existingState = this.relicStates.get(relicId);
      if (existingState) {
        existingState.level = relicInstance.level;
        if (relicId === 'GLITCHED_RELIC') {
          existingState.powerLevel = (existingState.powerLevel || 1) + 1;
        }
        if (relicId === 'PHOENIX_FEATHER') {
          existingState.used = false;
        }
        if (typeof relicDef.hooks?.onPickup === 'function') {
          relicDef.hooks.onPickup(existingState, this.player, this);
        }
      }
    }

    const isRestoringSave = Boolean(typeof window !== 'undefined' && window.RunSaveManager && window.RunSaveManager.isRestoring);
    if (!isRestoringSave && typeof BrotherEye !== 'undefined' && BrotherEye.enabled && typeof BrotherEye.recordRelicGained === 'function') {
      BrotherEye.recordRelicGained(relicId, 1);
    }

    this.applyPassiveStats();
    if (this.player.ui) {
      this.player.ui.updateRelics(this.ownedRelics, relicInstance);
    }
    return relicInstance;
  }

  /**
   * Extrae una reliquia aleatoria sin límite máximo (cap) en el inventario.
   * Si lanza una reliquia que el jugador ya posee, `addRelic` incrementa su `relic.level++`.
   */
  grantRandomRelic() {
    // Mezcla criptográfica Fisher-Yates de todo el catálogo (permite obtener tanto nuevas como repetidas para subir nivel)
    let chosenKey;
    if (this.ownedRelics.length > 0 && Math.random() < 0.32) {
      const ownedPool = ItemManager.shuffleArray(Array.from(this.ownedMap.keys()));
      chosenKey = ownedPool[0];
    } else {
      this.shuffledDeck = ItemManager.shuffleArray(RELIC_KEYS);
      chosenKey = this.shuffledDeck[0];
    }
    return this.addRelic(chosenKey);
  }

  /**
   * Aplica estadísticas pasivas escalando matemáticamente el efecto de cada reliquia
   * mediante `Efectividad = BaseValue * (1 + (relic.level * 0.20))`.
   */
  applyPassiveStats() {
    const stats = {
      maxHp: this.player.baseMaxHp,
      speed: this.player.baseSpeed,
      damageMultiplier: this.player.shopDamageMultiplier,
      attackSpeedMultiplier: this.player.shopAttackSpeedMultiplier,
      damageTakenMultiplier: 1.0,
      coinMagnetMultiplier: 1.0,
      extraCoinChance: 0.0,
      enemySpawnMultiplier: 1.0,
      critChance: this.player.baseCritChance || 0.0,
      sizeMultiplier: 1.0,
    };

    for (const sub of this.hookSubscribers.applyPassiveStats) {
      const eff = this.getRelicEffectiveness(sub.relic);
      if (eff <= 1.0) {
        sub.fn(stats, sub.state, this.player, this);
      } else {
        const snapshot = { ...stats };
        const probe = { ...stats };
        sub.fn(probe, sub.state, this.player, this);

        // Escalar bonos multiplicativos según `Efectividad = BaseDelta * (1 + relic.level * 0.20)`
        const multKeys = [
          'speed',
          'damageMultiplier',
          'attackSpeedMultiplier',
          'coinMagnetMultiplier',
          'sizeMultiplier',
        ];
        for (const k of multKeys) {
          if (snapshot[k] > 0) {
            const ratio = probe[k] / snapshot[k];
            if (ratio > 1.0) {
              stats[k] = snapshot[k] * (1 + (ratio - 1.0) * eff);
            } else if (ratio < 1.0) {
              stats[k] = probe[k];
            }
          }
        }

        // Escalar mitigación o penalización de daño recibido y spawn
        stats.damageTakenMultiplier = probe.damageTakenMultiplier;
        stats.enemySpawnMultiplier = probe.enemySpawnMultiplier;

        // Escalar bonos aditivos (`maxHp`, `extraCoinChance`, `critChance`)
        const hpDelta = probe.maxHp - snapshot.maxHp;
        stats.maxHp =
          hpDelta > 0 ? snapshot.maxHp + hpDelta * eff : probe.maxHp;

        const coinDelta = probe.extraCoinChance - snapshot.extraCoinChance;
        stats.extraCoinChance =
          coinDelta > 0 ? Math.min(1.0, snapshot.extraCoinChance + coinDelta * eff) : probe.extraCoinChance;

        const critDelta = probe.critChance - snapshot.critChance;
        stats.critChance =
          critDelta > 0 ? Math.min(1.0, snapshot.critChance + critDelta * eff) : probe.critChance;
      }
    }

    if ((this.player.adrenalineTimer || 0) > 0) {
      const combatCfg = typeof COMBAT_CONFIG !== 'undefined' ? COMBAT_CONFIG : null;
      const spdBonus = combatCfg ? (combatCfg.PERFECT_DODGE_SPEED_BONUS || 0.25) : 0.25;
      const aspdBonus = combatCfg ? (combatCfg.PERFECT_DODGE_ASPD_BONUS || 0.20) : 0.20;
      stats.speed *= 1 + spdBonus;
      stats.attackSpeedMultiplier *= 1 + aspdBonus;
    }

    this.player.maxHp = Math.max(1, Math.round(stats.maxHp));
    this.player.hp = Math.min(this.player.hp, this.player.maxHp);
    this.player.speed = stats.speed;
    const keyDamageBonus = Math.min(0.25, (this.player.keys || 0) * 0.008);
    this.player.damageMultiplier = Number((stats.damageMultiplier * (1 + keyDamageBonus)).toFixed(2));
    this.player.attackSpeedMultiplier = Number(
      Math.max(0.25, stats.attackSpeedMultiplier).toFixed(2)
    );
    this.player.coinMagnetMultiplier = stats.coinMagnetMultiplier;
    this.player.extraCoinChance = stats.extraCoinChance;
    this.player.enemySpawnMultiplier = stats.enemySpawnMultiplier;
    this.player.critChance = Math.min(1.0, Number(stats.critChance.toFixed(2)));
    this.player.sizeMultiplier = Number(stats.sizeMultiplier.toFixed(2));
    this.player.radius = Math.max(
      10,
      Math.round((this.player.baseRadius || 18) * this.player.sizeMultiplier)
    );

    if (this.player.ui) {
      this.player.ui.updateStats(this.player);
      this.player.ui.updateHealth(this.player);
    }
  }

  onShoot(projectile, room) {
    for (const sub of this.hookSubscribers.onShoot) {
      const eff = this.getRelicEffectiveness(sub.relic);
      const prevBounces = projectile.bouncesLeft || 0;
      const prevHoming = projectile.homingStrength || 0;
      const prevProjCount = room && room.projectiles ? room.projectiles.length : 0;

      this.withScaledProbability(eff, () => {
        sub.fn(projectile, sub.state, this.player, room);
      });

      if (eff > 1.0) {
        if ((projectile.bouncesLeft || 0) > prevBounces) {
          const added = projectile.bouncesLeft - prevBounces;
          projectile.bouncesLeft = prevBounces + Math.round(added * eff);
        }
        if ((projectile.homingStrength || 0) > prevHoming) {
          const addedHoming = projectile.homingStrength - prevHoming;
          projectile.homingStrength = prevHoming + addedHoming * eff;
        }
        if (room && room.projectiles && room.projectiles.length > prevProjCount) {
          for (let i = prevProjCount; i < room.projectiles.length; i++) {
            room.projectiles[i].damage = Math.max(
              1,
              Math.round(room.projectiles[i].damage * eff)
            );
          }
        }
      }
    }
  }

  onHit(projectile, enemy, room, damageDealt) {
    for (const sub of this.hookSubscribers.onHit) {
      const eff = this.getRelicEffectiveness(sub.relic);
      const scaledDamageDealt = damageDealt * eff;
      this.withScaledProbability(eff, () => {
        sub.fn(projectile, enemy, sub.state, this.player, room, scaledDamageDealt);
      });
    }
  }

  onKill(enemy, room) {
    for (const sub of this.hookSubscribers.onKill) {
      const eff = this.getRelicEffectiveness(sub.relic);
      this.withScaledProbability(eff, () => {
        sub.fn(enemy, sub.state, this.player, room, this);
      });
    }
  }

  onBossKill(boss, room) {
    for (const sub of this.hookSubscribers.onBossKill) {
      const eff = this.getRelicEffectiveness(sub.relic);
      this.withScaledProbability(eff, () => {
        sub.fn(boss, sub.state, this.player, room, this);
      });
    }
  }

  onEnemySpawn(enemy, room) {
    for (const sub of this.hookSubscribers.onEnemySpawn) {
      const eff = this.getRelicEffectiveness(sub.relic);
      this.withScaledProbability(eff, () => {
        sub.fn(enemy, sub.state, this.player, room);
      });
    }
  }

  onRoomStart(room) {
    for (const sub of this.hookSubscribers.onRoomStart) {
      const eff = this.getRelicEffectiveness(sub.relic);
      this.withScaledProbability(eff, () => {
        sub.fn(room, sub.state, this.player);
      });
      if (eff > 1.0 && sub.state && typeof sub.state.freezeTimer === 'number' && sub.state.freezeTimer > 0) {
        sub.state.freezeTimer *= eff;
      }
    }
    if (!room.enemySpawnHooksFired) {
      room.enemySpawnHooksFired = true;
      for (const enemy of room.enemies) {
        if (!enemy.markedForDeletion) {
          this.onEnemySpawn(enemy, room);
        }
      }
    }
  }

  onLevelStart() {
    for (const sub of this.hookSubscribers.onLevelStart) {
      const eff = this.getRelicEffectiveness(sub.relic);
      this.withScaledProbability(eff, () => {
        sub.fn(sub.state, this.player);
      });
    }
  }

  onUpgradeChosen(upgradeType) {
    for (const sub of this.hookSubscribers.onUpgradeChosen) {
      const eff = this.getRelicEffectiveness(sub.relic);
      this.withScaledProbability(eff, () => {
        sub.fn(upgradeType, sub.state, this.player, this);
      });
    }
  }

  onHeal(healContext) {
    for (const sub of this.hookSubscribers.onHeal) {
      sub.fn(healContext, sub.state, this.player);
    }
  }

  onUpdate(deltaTime, room) {
    for (const sub of this.hookSubscribers.onUpdate) {
      const eff = this.getRelicEffectiveness(sub.relic);
      // Reduce cooldowns y acelera efectos periódicos según `Efectividad = Base * (1 + relic.level * 0.20)`
      const scaledDt = deltaTime * eff;
      this.withScaledProbability(eff, () => {
        sub.fn(scaledDt, sub.state, this.player, room);
      });
    }
  }

  onDamageTaken(damageContext, room) {
    for (const sub of this.hookSubscribers.onDamageTaken) {
      const eff = this.getRelicEffectiveness(sub.relic);
      this.withScaledProbability(eff, () => {
        sub.fn(damageContext, sub.state, this.player, room);
      });
    }
  }

  onDeath(room) {
    let revived = false;
    for (const sub of this.hookSubscribers.onDeath) {
      const result = sub.fn(sub.state, this.player, room, this);
      if (result === true) {
        revived = true;
        break;
      }
    }
    return revived;
  }

  onDraw(ctx, room) {
    for (const sub of this.hookSubscribers.onDraw) {
      sub.fn(ctx, sub.state, this.player, room);
    }
  }
}
