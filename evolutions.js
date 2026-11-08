/**
 * ============================================================================
 * SISTEMA MODULAR DE EVOLUCIÓN MECÁNICA DE ARMAS (`evolutions.js` - v2.3)
 * ============================================================================
 * Inspirado en Vampire Survivors y Hades. Transforma las armas base en variantes
 * legendarias con comportamientos visuales y físicos completamente nuevos
 * al alcanzar Nivel 3 en su afinidad elemental correspondiente.
 *
 * Módulos contenidos:
 *  1. EVOLUTION_DEFS: Catálogo de 9 evoluciones mecánicas legendarias.
 *  2. MagmaPuddleHazard: Entidad de charco de magma ardiente persistente.
 *  3. StormWaveProjectile: Media luna de choque cortante eléctrica para la espada.
 *  4. CryoShardProjectile: Esquirla afilada de ventisca liberada en explosiones.
 *  5. EvolutionManager: Gestor central de activación, transmutación y hooks.
 * ============================================================================
 */

const EVOLUTION_DEFS = {
  // ==========================================================================
  // EVOLUCIONES DE PELOTAS (`ProjectileWeapon`)
  // ==========================================================================
  NAPALM_CLUSTER: {
    id: 'NAPALM_CLUSTER',
    weaponName: 'Pelotas',
    element: 'FIRE',
    requiredLevel: 3,
    title: 'Lanzagranadas de Napalm',
    symbol: '🌋',
    color: '#f97316',
    desc: 'Los proyectiles detonan en racimos de magma y dejan charcos de fuego persistente (3.5s).',
  },
  TESLA_ORB: {
    id: 'TESLA_ORB',
    weaponName: 'Pelotas',
    element: 'ELECTRIC',
    requiredLevel: 3,
    title: 'Bobina de Tesla Errante',
    symbol: '⚡',
    color: '#facc15',
    desc: 'Dispara orbes electromagnéticos que descargan relámpagos continuos a todos los enemigos cercanos.',
  },
  BLIZZARD_BURST: {
    id: 'BLIZZARD_BURST',
    weaponName: 'Pelotas',
    element: 'ICE',
    requiredLevel: 3,
    title: 'Supernova de Ventisca',
    symbol: '❄️',
    color: '#38bdf8',
    desc: 'Los impactos congelan en área y dispersan una corona de 8 esquirlas de hielo afiladas.',
  },

  // ==========================================================================
  // EVOLUCIONES DE RAYO LÁSER (`ChargeLaserWeapon`)
  // ==========================================================================
  ZERO_ABSOLUTE_BEAM: {
    id: 'ZERO_ABSOLUTE_BEAM',
    weaponName: 'Rayo Láser',
    element: 'ICE',
    requiredLevel: 3,
    title: 'Haz de Cero Absoluto',
    symbol: '🧊',
    color: '#06b6d4',
    desc: 'Haz glacial continuo que petrifica enemigos en hielo sólido y abre fisuras congeladas.',
  },
  THERMONUCLEAR_RAY: {
    id: 'THERMONUCLEAR_RAY',
    weaponName: 'Rayo Láser',
    element: 'FIRE',
    requiredLevel: 3,
    title: 'Haz Solar Termonuclear',
    symbol: '☀️',
    color: '#ff4500',
    desc: 'Rayo colosal de plasma que funde defensas, deja estelas solares y triplica el área de impacto.',
  },
  ION_SPLITTER: {
    id: 'ION_SPLITTER',
    weaponName: 'Rayo Láser',
    element: 'ELECTRIC',
    requiredLevel: 3,
    title: 'Cañón de Dispersión Iónica',
    symbol: '🔬',
    color: '#a855f7',
    desc: 'Al impactar a cualquier objetivo, ramifica 4 haces ionizados que rebotan hacia otros enemigos.',
  },

  // ==========================================================================
  // EVOLUCIONES DE ESPADA LARGA (`LongSwordWeapon`)
  // ==========================================================================
  STORM_DIVINE_BLADE: {
    id: 'STORM_DIVINE_BLADE',
    weaponName: 'Espada Larga',
    element: 'ELECTRIC',
    requiredLevel: 3,
    title: 'Filo de Tormenta Divina',
    symbol: '⚡',
    color: '#38bdf8',
    desc: 'Cada espadazo desata una media luna eléctrica que cruza la pantalla entera atravesando salas.',
  },
  PHOENIX_CLEAVE: {
    id: 'PHOENIX_CLEAVE',
    weaponName: 'Espada Larga',
    element: 'FIRE',
    requiredLevel: 3,
    title: 'Mandoble del Fénix Solar',
    symbol: '🔥',
    color: '#f97316',
    desc: 'Desata conos abrasadores de fuego solar; enemigos eliminados detonan en supernovas en cadena.',
  },
  VORPAL_CARMINE: {
    id: 'VORPAL_CARMINE',
    weaponName: 'Espada Larga',
    element: 'BLEED',
    requiredLevel: 3,
    title: 'Cuchilla Vorpal Carmesí',
    symbol: '🩸',
    color: '#be123c',
    desc: 'Cortes que desgarran en hemorragia masiva y extraen esencia vital (+1 HP al golpear 3+ enemigos).',
  }
};

/**
 * Charco de Magma Ardiente persistente generado por el Lanzagranadas de Napalm.
 */
// Clase base defensiva desacoplada para evitar dependencias de orden de carga
var BaseEntity = window.BaseEntity || (typeof Entity !== 'undefined' ? Entity : class {
  constructor(x, y, radius, color) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.color = color;
    this.vx = 0;
    this.vy = 0;
    this.markedForDeletion = false;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }
});
window.BaseEntity = BaseEntity;

class MagmaPuddleHazard extends BaseEntity {
  constructor(x, y, radius = 38, dps = 28, duration = 3.5) {
    super(x, y, radius, '#ea580c');
    this.dps = dps;
    this.duration = duration;
    this.timer = duration;
    this.tickTimer = 0;
    this.pulseAnim = Math.random() * Math.PI * 2;
  }

  update(dt, player, room) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.markedForDeletion = true;
      return;
    }

    this.pulseAnim += dt * 4;
    this.tickTimer -= dt;

    // Daña a los enemigos dentro del charco de magma cada 0.22s
    if (this.tickTimer <= 0 && room && room.enemies) {
      this.tickTimer = 0.22;
      const tickDmg = Math.max(2, Math.round(this.dps * 0.22));

      for (const enemy of room.enemies) {
        if (enemy.markedForDeletion || enemy.isBurrowed) continue;
        const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
        if (dist <= this.radius + enemy.radius) {
          enemy.takeDamage(tickDmg, 0, 0, 'FIRE');
          enemy.applyElementalEffect('FIRE', room, 3);
          if (room.spawnParticle) {
            room.spawnParticle(enemy.x, enemy.y, '#f97316', 3);
          }
        }
      }
    }

    // Pequeñas chispas y humo ascendente
    if (Math.random() < 0.25 && room && room.spawnParticle) {
      const rx = this.x + (Math.random() - 0.5) * this.radius * 1.5;
      const ry = this.y + (Math.random() - 0.5) * this.radius * 1.5;
      room.spawnParticle(rx, ry, '#fbbf24', 1);
    }
  }

  draw(ctx) {
    ctx.save();
    const pulse = Math.sin(this.pulseAnim) * 2;
    const r = Math.max(8, this.radius + pulse);

    // Fondo de lava incandescente
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(234, 88, 12, 0.45)';
    ctx.fill();

    // Núcleo caliente
    ctx.beginPath();
    ctx.arc(this.x, this.y, r * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(251, 191, 36, 0.7)';
    ctx.fill();

    // Borde de roca fundida
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(249, 115, 22, 0.8)';
    ctx.stroke();

    ctx.restore();
  }
}

/**
 * Fisura glacial dejada por el Haz de Cero Absoluto.
 */
class CryoFissureHazard extends BaseEntity {
  constructor(x, y, radius = 32, duration = 3.0) {
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

    this.pulseAnim += dt * 3;

    // Ralentiza y congela enemigos
    if (room && room.enemies) {
      for (const enemy of room.enemies) {
        if (enemy.markedForDeletion || enemy.isBurrowed) continue;
        const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
        if (dist <= this.radius + enemy.radius) {
          enemy.applyElementalEffect('ICE', room, 3);
          if (typeof enemy.freezeTimer === 'number') {
            enemy.freezeTimer = Math.max(enemy.freezeTimer, 0.4);
          }
        }
      }
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(6, 182, 212, 0.28)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#bae6fd';
    ctx.stroke();

    // Cristales de hielo
    ctx.beginPath();
    ctx.moveTo(this.x - 8, this.y);
    ctx.lineTo(this.x + 8, this.y);
    ctx.moveTo(this.x, this.y - 8);
    ctx.lineTo(this.x, this.y + 8);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Proyectil de Media Luna Eléctrica desatado por el Filo de Tormenta Divina.
 */
class StormWaveProjectile extends BaseEntity {
  constructor(x, y, dirX, dirY, damage = 65, playerRef = null) {
    super(x, y, 26, '#38bdf8');
    this.vx = dirX * 680;
    this.vy = dirY * 680;
    this.damage = damage;
    this.lifeTime = 1.1; // Cruza la pantalla entera
    this.piercing = true;
    this.maxPierces = 999;
    this.hitEnemies = new Set();
    this.angle = Math.atan2(dirY, dirX);
    this.playerRef = playerRef;
  }

  update(dt, player, room) {
    this.lifeTime -= dt;
    if (this.lifeTime <= 0) {
      this.markedForDeletion = true;
      return;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (room && room.enemies) {
      for (const enemy of room.enemies) {
        if (enemy.markedForDeletion || enemy.isBurrowed || this.hitEnemies.has(enemy)) continue;
        const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
        if (dist <= this.radius + enemy.radius) {
          this.hitEnemies.add(enemy);
          enemy.takeDamage(this.damage, this.vx * 0.15, this.vy * 0.15, 'ELECTRIC');
          enemy.applyElementalEffect('ELECTRIC', room, 3);

          if (room.spawnParticle) {
            room.spawnParticle(enemy.x, enemy.y, '#38bdf8', 6);
            room.spawnParticle(enemy.x, enemy.y, '#ffffff', 4);
          }
          if (typeof soundManager !== 'undefined' && soundManager) {
            soundManager.playProcedural('crit', { volume: 0.35, pitchJitter: 0.1 });
          }
        }
      }
    }

    // Estela de chispas
    if (Math.random() < 0.4 && room && room.spawnParticle) {
      room.spawnParticle(this.x, this.y, '#67e8f9', 2);
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    // Media luna creciente radiante
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, -Math.PI * 0.45, Math.PI * 0.45, false);
    ctx.quadraticCurveTo(this.radius * 0.35, 0, 0, -Math.PI * 0.45);
    ctx.fillStyle = '#38bdf8';
    ctx.fill();

    // Brillo interior blanco
    ctx.beginPath();
    ctx.arc(0, 0, this.radius * 0.75, -Math.PI * 0.35, Math.PI * 0.35, false);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.restore();
  }
}

/**
 * Esquirla afilada de hielo expulsada en corona radial por la Supernova de Ventisca.
 */
class CryoShardProjectile extends BaseEntity {
  constructor(x, y, dirX, dirY, damage = 22) {
    super(x, y, 6, '#bae6fd');
    this.vx = dirX * 560;
    this.vy = dirY * 560;
    this.damage = damage;
    this.lifeTime = 0.55;
    this.bouncesLeft = 1;
    this.angle = Math.atan2(dirY, dirX);
  }

  update(dt, player, room) {
    this.lifeTime -= dt;
    if (this.lifeTime <= 0) {
      this.markedForDeletion = true;
      return;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Rebote simple en muros de la sala
    if (room && typeof ROOM_BOUNDS !== 'undefined') {
      if (this.x < ROOM_BOUNDS.left || this.x > ROOM_BOUNDS.right) {
        if (this.bouncesLeft > 0) {
          this.vx = -this.vx;
          this.bouncesLeft--;
        } else {
          this.markedForDeletion = true;
        }
      }
      if (this.y < ROOM_BOUNDS.top || this.y > ROOM_BOUNDS.bottom) {
        if (this.bouncesLeft > 0) {
          this.vy = -this.vy;
          this.bouncesLeft--;
        } else {
          this.markedForDeletion = true;
        }
      }
    }

    if (room && room.enemies) {
      for (const enemy of room.enemies) {
        if (enemy.markedForDeletion || enemy.isBurrowed) continue;
        const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
        if (dist <= this.radius + enemy.radius) {
          enemy.takeDamage(this.damage, this.vx * 0.1, this.vy * 0.1, 'ICE');
          enemy.applyElementalEffect('ICE', room, 2);
          this.markedForDeletion = true;
          if (room.spawnParticle) {
            room.spawnParticle(enemy.x, enemy.y, '#38bdf8', 4);
          }
          break;
        }
      }
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-6, -4);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-6, 4);
    ctx.closePath();
    ctx.fillStyle = '#bae6fd';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();
  }
}

/**
 * Gestor Central de Evoluciones de Armas.
 */
class EvolutionManager {
  /**
   * Obtiene la evolución activa para un arma específica si el jugador cumple los requisitos de afinidad.
   * @param {Player} player
   * @param {string} weaponName
   * @returns {object|null}
   */
  static getActiveEvolution(player, weaponName) {
    if (!player || !player.elementalPool) return null;

    for (const key in EVOLUTION_DEFS) {
      const evo = EVOLUTION_DEFS[key];
      if (evo.weaponName === weaponName) {
        const currentLvl = player.elementalPool[evo.element] || 0;
        if (currentLvl >= evo.requiredLevel) {
          return evo;
        }
      }
    }
    return null;
  }

  /**
   * Comprueba si el jugador acaba de desbloquear una nueva evolución y desata la fanfarria audiovisual.
   * @param {Player} player
   * @param {Room} room
   * @param {UIManager} ui
   */
  static checkEvolutions(player, room, ui) {
    if (!player || !player.elementalPool) return;
    if (!player.unlockedEvolutions) {
      player.unlockedEvolutions = new Set();
    }

    for (const key in EVOLUTION_DEFS) {
      const evo = EVOLUTION_DEFS[key];
      const currentLvl = player.elementalPool[evo.element] || 0;

      if (currentLvl >= evo.requiredLevel && !player.unlockedEvolutions.has(evo.id)) {
        player.unlockedEvolutions.add(evo.id);

        if (ui) {
          ui.showToast(`🌟 ¡ARMA EVOLUCIONADA: ${evo.title.toUpperCase()}! 🌟`);
          ui.updateStats(player);
        }
        if (typeof soundManager !== 'undefined' && soundManager) {
          soundManager.playProcedural('pedestal', { volume: 0.95 });
        }
        if (room && typeof room.spawnParticle === 'function') {
          room.spawnParticle(player.x, player.y, evo.color, 16);
          room.spawnParticle(player.x, player.y, '#ffffff', 10);
        }
        if (window.activeGameInstance) {
          window.activeGameInstance.triggerScreenShake(4.0, 0.16);
          window.activeGameInstance.triggerHitStop(0.04);
        }
      }
    }
  }

  /**
   * Hook ejecutado cuando un proyectil de arma evolutiva impacta o detona.
   * @param {Projectile} proj
   * @param {Entity} enemy
   * @param {Room} room
   * @param {Player} player
   */
  static onProjectileDetonate(proj, enemy, room, player) {
    if (!proj || !room) return;

    if (proj.evolutionId === 'NAPALM_CLUSTER') {
      // 1. Spawnea el charco de magma persistente
      room.hazards.push(new MagmaPuddleHazard(proj.x, proj.y, 42, 34, 3.5));

      // 2. Explosión radial de chispas ardientes
      if (room.spawnParticle) {
        room.spawnParticle(proj.x, proj.y, '#f97316', 10);
        room.spawnParticle(proj.x, proj.y, '#fbbf24', 6);
      }
      if (typeof soundManager !== 'undefined' && soundManager) {
        soundManager.playProcedural('break_rock', { volume: 0.45, pitchJitter: 0.15 });
      }
    } else if (proj.evolutionId === 'BLIZZARD_BURST') {
      // 1. Explosión de ventisca: 8 esquirlas radiales
      const shardCount = 8;
      const dmg = Math.round(24 * (player ? player.damageMultiplier : 1.0));
      for (let i = 0; i < shardCount; i++) {
        const ang = (i * Math.PI * 2) / shardCount;
        const dx = Math.cos(ang);
        const dy = Math.sin(ang);
        room.projectiles.push(new CryoShardProjectile(proj.x, proj.y, dx, dy, dmg));
      }

      if (room.spawnParticle) {
        room.spawnParticle(proj.x, proj.y, '#38bdf8', 12);
        room.spawnParticle(proj.x, proj.y, '#ffffff', 6);
      }
      if (typeof soundManager !== 'undefined' && soundManager) {
        soundManager.playProcedural('crit', { volume: 0.5, pitchJitter: 0.1 });
      }
    }
  }

  /**
   * Hook ejecutado cada vez que la Espada Larga inicia un swing.
   * @param {LongSwordWeapon} sword
   * @param {Player} player
   * @param {Room} room
   * @param {object} aimState
   */
  static onSwordSwing(sword, player, room, aimState) {
    if (!sword || !player || !room) return;
    const evo = EvolutionManager.getActiveEvolution(player, 'Espada Larga');
    if (!evo) return;

    if (evo.id === 'STORM_DIVINE_BLADE') {
      // Lanza media luna de choque eléctrica cortante gigante
      const dirX = Math.cos(aimState.aimAngle);
      const dirY = Math.sin(aimState.aimAngle);
      const spawnX = player.x + dirX * (player.radius + 18);
      const spawnY = player.y + dirY * (player.radius + 18);
      const dmg = Math.round(65 * player.damageMultiplier);

      const wave = new StormWaveProjectile(spawnX, spawnY, dirX, dirY, dmg, player);
      room.projectiles.push(wave);

      if (room.spawnParticle) {
        room.spawnParticle(spawnX, spawnY, '#38bdf8', 8);
      }
      if (window.activeGameInstance) {
        window.activeGameInstance.triggerScreenShake(2.5, 0.1);
      }
    } else if (evo.id === 'PHOENIX_CLEAVE') {
      // Cono abrasador de fuego solar
      if (room.spawnParticle) {
        const dirX = Math.cos(aimState.aimAngle);
        const dirY = Math.sin(aimState.aimAngle);
        for (let i = 0; i < 10; i++) {
          const spread = (Math.random() - 0.5) * 0.7;
          const a = aimState.aimAngle + spread;
          room.spawnParticle(
            player.x + Math.cos(a) * (player.radius + 20),
            player.y + Math.sin(a) * (player.radius + 20),
            '#f97316',
            2
          );
        }
      }
    }
  }

  /**
   * Hook ejecutado cuando el Rayo Láser dispara en modo Mega Haz.
   * @param {ChargeLaserWeapon} laser
   * @param {Player} player
   * @param {Room} room
   * @param {object} aimState
   * @param {object} beamDef
   */
  static onLaserFired(laser, player, room, aimState, beamDef) {
    if (!laser || !player || !room) return;
    const evo = EvolutionManager.getActiveEvolution(player, 'Rayo Láser');
    if (!evo) return;

    if (evo.id === 'ZERO_ABSOLUTE_BEAM') {
      // Abre fisuras de hielo a lo largo del rayo
      const steps = 7;
      const dx = (beamDef.x2 - beamDef.x1) / steps;
      const dy = (beamDef.y2 - beamDef.y1) / steps;
      for (let i = 1; i <= steps; i++) {
        const fx = beamDef.x1 + dx * i;
        const fy = beamDef.y1 + dy * i;
        room.hazards.push(new CryoFissureHazard(fx, fy, 28, 3.0));
      }
    } else if (evo.id === 'THERMONUCLEAR_RAY') {
      // Amplía el ancho y añade partículas de fusión
      beamDef.halfWidth *= 1.8;
      beamDef.color = '#ff4500';
      if (window.activeGameInstance) {
        window.activeGameInstance.triggerScreenShake(7.0, 0.28);
      }
    } else if (evo.id === 'ION_SPLITTER') {
      // Genera 4 arcos voltaicos en busca de enemigos
      if (room.enemies && room.enemies.length > 0) {
        for (let i = 0; i < Math.min(4, room.enemies.length); i++) {
          const en = room.enemies[i];
          if (en.markedForDeletion || en.isBurrowed) continue;
          en.takeDamage(Math.round(45 * player.damageMultiplier), 0, 0, 'ELECTRIC');
          en.applyElementalEffect('ELECTRIC', room, 3);
          if (room.spawnParticle) {
            room.spawnParticle(en.x, en.y, '#c084fc', 6);
          }
        }
      }
    }
  }
}

// Exponer en el entorno global
window.EVOLUTION_DEFS = EVOLUTION_DEFS;
window.EvolutionManager = EvolutionManager;
window.MagmaPuddleHazard = MagmaPuddleHazard;
window.CryoFissureHazard = CryoFissureHazard;
window.StormWaveProjectile = StormWaveProjectile;
window.CryoShardProjectile = CryoShardProjectile;
