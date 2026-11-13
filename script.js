/**
 * ============================================================================
 * ROGUELIKE 2D MVP v2.1 - ESTILO THE BINDING OF ISAAC
 * Arquitectura: POO Polimórfica, Espacio de Coordenadas Continuas (Flotantes + deltaTime)
 * Nuevas Mecánicas v2.1 (Expansión a 75 Reliquias y Nuevas Mecánicas Base):
 *  - Catálogo Unificado de 75 Reliquias (`relics.js`) con Hooks `onUpgradeChosen` y `onDeath`.
 *  - Sistema de Golpe Crítico (`critChance`), Escala de Tamaño (`sizeMultiplier`) e Impulso
 *    Evasivo con Cargas (`[SHIFT]` / `[F]`, compatible con `MOON_FEATHER` y `ACCELERATED_SAND`).
 *  - Nubes Tóxicas (`spawnPoisonCloud`), Lluvia de Monedas (`spawnCoin`), 4ta Opción de Tienda
 *    (`LUCKY_DICE`), Marca del Cazador (`HUNTERS_MARK`) y Resurrección Fénix (`PHOENIX_FEATHER`).
 * ============================================================================
 */

// Variable global de Ciclo Infinito New Game+ (inicia en 0; NG+1 => 1, NG+2 => 2, etc.)
let ngPlusLevel = 0;
let isMortalMode = false;
let initialNgPlusLevel = 0;

// ----------------------------------------------------------------------------
// 1. CONSTANTES DE CONFIGURACIÓN, DIMENSIONES Y ELEMENTOS
// ----------------------------------------------------------------------------
const CONFIG = {
  VERSION: 'v2.1',
  CANVAS_WIDTH: 960,
  CANVAS_HEIGHT: 640,
  WALL_THICKNESS: 48,
  DOOR_WIDTH: 96,

  TOTAL_SECTIONS: 4,
  LEVELS_PER_SECTION: 4,
  ROOMS_PER_FLOOR: 12,

  BASE_ENEMIES_PER_ROOM: 8,
  ENEMY_FLOOR_SCALING: 0.15,
  ENEMY_HP_MULTIPLIER: 1.75,

  // Probabilidad de que una sala spawnee un Minijefe `EliteEnemy` (v1.5)
  ELITE_SPAWN_CHANCE: 0.32,
  ELITE_HP_MULT: 1.5, // x1.5 de Vida Máxima
  ELITE_SPEED_MULT: 1.25, // x1.25 de Velocidad de Movimiento (balanceado y justo)

  // Topes globales absolutos de velocidad de caminata (Player baseSpeed = 270 px/s)
  ENEMY_SPEED_CAPS: {
    COMMON: 215,
    FLYER: 225,
    SPLITTER_MINI: 225,
    ELITE: 235,
    BERSERK_MAX: 242,
    BOSS_WALK_P1: 220,
    BOSS_WALK_P2: 240,
    ABISMO_BURROW: 255,
  },

  SECTION_2_BASE_DEFENSE: 25,
  ELEMENTAL_RESIST_MULT: 0.2,
  ELEMENTAL_WEAK_MULT: 1.5,

  ELEMENT_EXTRA_LEVEL_BONUS: 0.2,
  ELEMENTAL_PROC_CHANCE: 0.55,

  MAX_PARTICLES: 65,
  MAX_DELTA_TIME: 0.05,
};

const ROOM_BOUNDS = {
  left: CONFIG.WALL_THICKNESS,
  right: CONFIG.CANVAS_WIDTH - CONFIG.WALL_THICKNESS,
  top: CONFIG.WALL_THICKNESS,
  bottom: CONFIG.CANVAS_HEIGHT - CONFIG.WALL_THICKNESS,
  centerX: CONFIG.CANVAS_WIDTH / 2,
  centerY: CONFIG.CANVAS_HEIGHT / 2,
};

const DIRECTIONS = {
  N: { key: 'N', opposite: 'S', dx: 0, dy: -1 },
  S: { key: 'S', opposite: 'N', dx: 0, dy: 1 },
  E: { key: 'E', opposite: 'W', dx: 1, dy: 0 },
  W: { key: 'W', opposite: 'E', dx: -1, dy: 0 },
};

const ELEMENTS = {
  NONE: { id: 'NONE', name: 'Normal', short: 'NRM', color: '#f8fafc', border: '#94a3b8' },
  FIRE: { id: 'FIRE', name: 'Fuego', short: 'FUE', color: '#ef4444', border: '#fca5a5' },
  BLEED: { id: 'BLEED', name: 'Sangrado', short: 'SAN', color: '#be123c', border: '#fda4af' },
  ELECTRIC: { id: 'ELECTRIC', name: 'Electricidad', short: 'ELE', color: '#facc15', border: '#fef08a' },
  ICE: { id: 'ICE', name: 'Hielo', short: 'HIE', color: '#38bdf8', border: '#bae6fd' },
  MIRACLE: { id: 'MIRACLE', name: 'Milagro', short: 'MIL', color: '#e879f9', border: '#fde047' },
  POISON: { id: 'POISON', name: 'Veneno', short: 'VEN', color: '#22c55e', border: '#86efac' },
};

const ELEMENT_KEYS = ['FIRE', 'BLEED', 'ELECTRIC', 'ICE', 'MIRACLE'];

const ELEMENTAL_PROFILES = [
  { resist: 'FIRE', weak: 'ICE' },
  { resist: 'ICE', weak: 'ELECTRIC' },
  { resist: 'ELECTRIC', weak: 'BLEED' },
  { resist: 'BLEED', weak: 'FIRE' },
  { resist: 'MIRACLE', weak: 'FIRE' },
];

// ----------------------------------------------------------------------------
// 2. UTILIDADES MATEMÁTICAS Y GEOMÉTRICAS (MOTOR CONTINUO)
// ----------------------------------------------------------------------------
class MathUtils {
  static normalize(x, y) {
    const length = Math.hypot(x, y);
    if (length === 0) return { x: 0, y: 0, length: 0 };
    return { x: x / length, y: y / length, length };
  }

  static circleCollision(x1, y1, r1, x2, y2, r2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const minDist = r1 + r2;
    return dx * dx + dy * dy <= minDist * minDist;
  }

  static pointToSegmentDistance(px, py, x1, y1, x2, y2) {
    const vx = x2 - x1;
    const vy = y2 - y1;
    const wx = px - x1;
    const wy = py - y1;

    const lenSq = vx * vx + vy * vy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);

    let t = (wx * vx + wy * vy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const projX = x1 + t * vx;
    const projY = y1 + t * vy;
    return Math.hypot(px - projX, py - projY);
  }

  static angleDiff(a, b) {
    let diff = ((a - b + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    return diff;
  }

  static clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  static circleAABBCollision(cx, cy, r, rx, ry, rw, rh) {
    const closestX = Math.max(rx, Math.min(cx, rx + rw));
    const closestY = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - closestX;
    const dy = cy - closestY;
    return dx * dx + dy * dy < r * r;
  }

  static getRayWallIntersection(startX, startY, dirX, dirY, maxDist, bounds) {
    let tMin = maxDist;
    if (dirX > 0.0001) {
      const t = (bounds.right - startX) / dirX;
      if (t > 0 && t < tMin) tMin = t;
    } else if (dirX < -0.0001) {
      const t = (bounds.left - startX) / dirX;
      if (t > 0 && t < tMin) tMin = t;
    }
    if (dirY > 0.0001) {
      const t = (bounds.bottom - startY) / dirY;
      if (t > 0 && t < tMin) tMin = t;
    } else if (dirY < -0.0001) {
      const t = (bounds.top - startY) / dirY;
      if (t > 0 && t < tMin) tMin = t;
    }
    return {
      x: startX + dirX * tMin,
      y: startY + dirY * tMin,
      dist: tMin,
      hitWall: tMin < maxDist,
    };
  }
}

// ----------------------------------------------------------------------------
// 3. GESTOR DE ENTRADA (TECLADO Y MOUSE)
// ----------------------------------------------------------------------------
class InputManager {
  constructor(canvas, onWeaponSelect, onRestart, onTogglePause, onToggleWeaponMode) {
    this.canvas = canvas;
    this.keys = new Set();
    this.dodgeTriggered = false;
    this.mouse = {
      x: ROOM_BOUNDS.centerX,
      y: ROOM_BOUNDS.centerY,
      isDown: false,
      active: false,
    };

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);

      if (/^Digit[1-9]$/.test(e.code)) {
        const slotIdx = parseInt(e.code.replace('Digit', ''), 10) - 1;
        onWeaponSelect(slotIdx);
      }
      if (e.code === 'KeyQ') onWeaponSelect('prev');
      if (e.code === 'KeyE') {
        if (window.activeGameInstance && window.activeGameInstance.tryInteract()) {
          e.preventDefault();
          return;
        }
        onWeaponSelect('next');
      }
      if (e.code === 'KeyR') onRestart();
      if ((e.code === 'Space' || e.key === ' ') && !e.repeat) {
        e.preventDefault();
        if (onToggleWeaponMode) onToggleWeaponMode();
      }
      if (['ShiftLeft', 'ShiftRight', 'KeyF'].includes(e.code) && !e.repeat) {
        this.dodgeTriggered = true;
      }

      if (e.code === 'Tab') {
        e.preventDefault();
        const tabOverlay = document.getElementById('tab-overlay');
        if (tabOverlay) tabOverlay.classList.remove('hidden');
      }

      if (e.code === 'Escape') {
        e.preventDefault();
        if (onTogglePause) onTogglePause();
      }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (onWeaponSelect) {
        onWeaponSelect(e.deltaY > 0 ? 'next' : 'prev');
      }
    }, { passive: false });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'Tab') {
        e.preventDefault();
        const tabOverlay = document.getElementById('tab-overlay');
        if (tabOverlay) tabOverlay.classList.add('hidden');
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      this.mouse.x = (e.clientX - rect.left) * scaleX;
      this.mouse.y = (e.clientY - rect.top) * scaleY;
      this.mouse.active = true;
    });

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouse.isDown = true;
        this.mouse.active = true;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.mouse.isDown = false;
      }
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.isDown = false;
      this.dodgeTriggered = false;
      const tabOverlay = document.getElementById('tab-overlay');
      if (tabOverlay) tabOverlay.classList.add('hidden');
    });
  }

  consumeDodgeTrigger() {
    if (window.mobileTouchControls && window.mobileTouchControls.dodgeRequested) {
      window.mobileTouchControls.dodgeRequested = false;
      return true;
    }
    if (this.dodgeTriggered) {
      this.dodgeTriggered = false;
      return true;
    }
    return false;
  }

  getMovementVector() {
    if (window.mobileTouchControls && window.mobileTouchControls.active && window.mobileTouchControls.moveVector) {
      const mv = window.mobileTouchControls.moveVector;
      if (mv.length > 0 || mv.x !== 0 || mv.y !== 0) {
        return mv;
      }
    }
    let mx = 0;
    let my = 0;
    if (this.keys.has('KeyW')) my -= 1;
    if (this.keys.has('KeyS')) my += 1;
    if (this.keys.has('KeyA')) mx -= 1;
    if (this.keys.has('KeyD')) mx += 1;
    return MathUtils.normalize(mx, my);
  }

  getAimAndAttackState(player) {
    if (window.mobileTouchControls && window.mobileTouchControls.active && window.mobileTouchControls.aimState && window.mobileTouchControls.aimState.active) {
      return {
        aimX: window.mobileTouchControls.aimState.aimX,
        aimY: window.mobileTouchControls.aimState.aimY,
        aimAngle: window.mobileTouchControls.aimState.aimAngle,
        isAttacking: Boolean(window.mobileTouchControls.aimState.isAttacking),
      };
    }

    let ax = 0;
    let ay = 0;
    if (this.keys.has('ArrowUp')) ay -= 1;
    if (this.keys.has('ArrowDown')) ay += 1;
    if (this.keys.has('ArrowLeft')) ax -= 1;
    if (this.keys.has('ArrowRight')) ax += 1;

    if (ax !== 0 || ay !== 0) {
      const norm = MathUtils.normalize(ax, ay);
      return {
        aimX: norm.x,
        aimY: norm.y,
        aimAngle: Math.atan2(norm.y, norm.x),
        isAttacking: true,
      };
    }

    const dx = this.mouse.x - player.x;
    const dy = this.mouse.y - player.y;
    const norm = MathUtils.normalize(dx, dy);
    const aimX = norm.length > 0 ? norm.x : 1;
    const aimY = norm.length > 0 ? norm.y : 0;

    return {
      aimX,
      aimY,
      aimAngle: Math.atan2(aimY, aimX),
      isAttacking: this.mouse.isDown,
    };
  }
}

// ----------------------------------------------------------------------------
// 4. SISTEMA DE RELIQUIAS EXTERNO (`relics.js`)
// ----------------------------------------------------------------------------
// El catálogo `RELIC_CATALOG`, `RELIC_KEYS`, `registerRelic()` y la clase
// `ItemManager` se cargan desde el archivo dedicado `relics.js`.


// ----------------------------------------------------------------------------
// 5. ENTIDADES BASE, COFRE ELEMENTAL, COFRE DE RELIQUIA, MONEDAS Y PROYECTILES
// ----------------------------------------------------------------------------
class Entity {
  constructor(x, y, radius, color) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.radius = radius;
    this.color = color;
    this.markedForDeletion = false;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  draw(ctx) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.restore();
  }
}

class Particle {
  constructor(x, y, vx, vy, radius, color, lifeTime = 0.55) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.radius = radius;
    this.color = color;
    this.lifeTime = lifeTime;
    this.maxLife = lifeTime;
  }

  update(dt, room = null) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= Math.pow(0.08, dt);
    this.vy *= Math.pow(0.08, dt);
    this.lifeTime -= dt;

    const b = room ? room.bounds : null;
    if (b) {
      if (this.x < b.left - 24 || this.x > b.right + 24 || this.y < b.top - 24 || this.y > b.bottom + 24) {
        this.lifeTime = 0;
      }
    }
  }

  draw(ctx) {
    const alpha = Math.max(0, this.lifeTime / this.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * alpha, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.restore();
  }
}

/**
 * Cofre Elemental (Primera Sala de cada nivel)
 * Al colisionar con el jugador, otorga o sube de nivel un elemento y notifica al DOM (`UIManager`).
 */
class Chest extends Entity {
  constructor(x, y) {
    super(x, y, 22, '#d97706');
    this.opened = false;
    this.openAnimTimer = 0;
    this.grantedElement = null;
    this.grantedLevel = 1;
  }

  update(dt, player, room) {
    this.pulseTimer = (this.pulseTimer || 0) + dt * 4;
    if (room && typeof room.isPointInPit === 'function' && room.isPointInPit(this.x, this.y, this.radius)) {
      const safe = room.getWalkablePosition(this.x, this.y, this.radius);
      this.x = safe.x;
      this.y = safe.y;
    }
    if (this.opened) {
      if (this.openAnimTimer > 0) this.openAnimTimer -= dt;
      return;
    }

    if (MathUtils.circleCollision(this.x, this.y, this.radius, player.x, player.y, player.radius)) {
      this.openChest(player, room);
    }
  }

  openChest(player, room) {
    this.opened = true;
    this.openAnimTimer = 2.6;

    const chosenKey = ELEMENT_KEYS[Math.floor(Math.random() * ELEMENT_KEYS.length)];
    const newLevel = player.addOrUpgradeElement(chosenKey);

    this.grantedElement = ELEMENTS[chosenKey];
    this.grantedLevel = newLevel;

    if (player.ui) {
      const upTag = newLevel > 1 ? `¡SUBE A Lv. ${newLevel}!` : `(Lv. 1)`;
      player.ui.showToast(`COFRE ELEMENTAL: ¡${this.grantedElement.name.toUpperCase()} ${upTag}!`);
    }

    // Propuesta C: En NG+, el Cofre Elemental también otorga 1 reliquia adicional
    if (ngPlusLevel >= 1) {
      const extraRelic = player.itemManager.grantRandomRelic();
      if (extraRelic && player.ui) {
        player.ui.spawnFloatingText(`★ ${extraRelic.name.toUpperCase()}`, extraRelic.color, this.x, this.y - 25);
      }
    }

    for (let i = 0; i < 18; i++) {
      const angle = (Math.PI * 2 * i) / 18 + Math.random() * 0.2;
      const speed = 90 + Math.random() * 140;
      room.spawnParticle(
        this.x,
        this.y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        5,
        this.grantedElement.color,
        0.7
      );
    }
  }

  draw(ctx) {
    ctx.save();
    const w = 40;
    const h = 30;

    if (this.opened && this.grantedElement) {
      const pulseRadius = 32 + Math.sin(this.openAnimTimer * 8) * 5;
      ctx.beginPath();
      ctx.arc(this.x, this.y, pulseRadius, 0, Math.PI * 2);
      ctx.fillStyle = this.grantedElement.color;
      ctx.globalAlpha = 0.22;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = this.opened
      ? this.grantedElement
        ? this.grantedElement.color
        : '#fbbf24'
      : '#b45309';
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 2.5;
    ctx.fillRect(this.x - w / 2, this.y - h / 2, w, h);
    ctx.strokeRect(this.x - w / 2, this.y - h / 2, w, h);

    ctx.fillStyle = '#fef08a';
    ctx.fillRect(this.x - w / 2, this.y - 3, w, 6);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(this.x - 4, this.y - 5, 8, 10);

    // Gema elemental geométrica flotante al abrirse (Cero ctx.fillText)
    if (this.opened && this.grantedElement) {
      const floatY = Math.min(18, (2.6 - Math.max(0, this.openAnimTimer)) * 8);
      const gy = this.y - h / 2 - 14 - floatY;
      ctx.beginPath();
      ctx.moveTo(this.x, gy - 9);
      ctx.lineTo(this.x + 9, gy);
      ctx.lineTo(this.x, gy + 9);
      ctx.lineTo(this.x - 9, gy);
      ctx.closePath();
      ctx.fillStyle = this.grantedElement.color;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    }

    ctx.restore();
  }
}

/**
 * Cofre de Reliquia (`RelicChest` - v2.1)
 * Instanciado en las coordenadas donde muere un `EliteEnemy`.
 * Al colisionar con el jugador:
 *  - Si `ngPlusLevel >= 1`: otorga DOS reliquias simultáneas (Doble Drop NG+) con tiradas independientes.
 *  - Si `ngPlusLevel === 0`: otorga UNA reliquia estándar.
 *  - Retroalimentación con texto flotante DOM y toasts de alerta táctica.
 */
class RelicChest extends Entity {
  constructor(x, y) {
    super(x, y, 22, '#9333ea');
    this.opened = false;
    this.openAnimTimer = 0;
    this.pulseTimer = 0;
    this.isLocked = false; // Recompensas de combate SIEMPRE 100% gratis
    this.grantedRelics = [];
    this.grantedRelic = null;
  }

  update(dt, player, room) {
    this.pulseTimer += dt * 5;
    if (room && typeof room.isPointInPit === 'function' && room.isPointInPit(this.x, this.y, this.radius)) {
      const safe = room.getWalkablePosition(this.x, this.y, this.radius);
      this.x = safe.x;
      this.y = safe.y;
    }
    if (this.opened) {
      if (this.openAnimTimer > 0) this.openAnimTimer -= dt;
      return;
    }

    if (MathUtils.circleCollision(this.x, this.y, this.radius, player.x, player.y, player.radius)) {
      this.openChest(player, room);
    }
  }

  openChest(player, room) {
    if (this.opened) return;
    this.opened = true;
    this.openAnimTimer = 3.2;

    // Buff de Cofres en NG+: 2 tiradas independientes de RNG si ngPlusLevel >= 1
    this.grantedRelics = [];
    const pulls = ngPlusLevel >= 1 ? 2 : 1;
    for (let p = 0; p < pulls; p++) {
      const relic = player.itemManager.grantRandomRelic();
      if (relic) {
        this.grantedRelics.push(relic);
      }
    }
    this.grantedRelic = this.grantedRelics[0] || null;

    if (player.ui) {
      if (pulls === 2 && this.grantedRelics.length === 2) {
        const r1 = this.grantedRelics[0];
        const r2 = this.grantedRelics[1];
        player.ui.showToast(
          `★ [DOBLE DROP NG+] RELIQUIAS OBTENIDAS: ${r1.name.toUpperCase()} & ${r2.name.toUpperCase()}`
        );
        // Feedback visual con texto flotante DOM para ambas mejoras
        player.ui.spawnFloatingText(`★ ${r1.name.toUpperCase()}`, r1.color, this.x - 22, this.y - 20);
        player.ui.spawnFloatingText(`★ ${r2.name.toUpperCase()}`, r2.color, this.x + 22, this.y - 44);
      } else if (this.grantedRelic) {
        const lvl = this.grantedRelic.level || 1;
        if (lvl > 1) {
          player.ui.showToast(
            `★ RELIQUIA SUBIÓ DE NIVEL (x${lvl}): ${this.grantedRelic.name.toUpperCase()} [Efectividad x${(1 + lvl * 0.2).toFixed(2)}]`
          );
        } else {
          player.ui.showToast(
            `★ RELIQUIA OBTENIDA: ${this.grantedRelic.name.toUpperCase()} (${this.grantedRelic.description})`
          );
        }
        player.ui.spawnFloatingText(`★ ${this.grantedRelic.name.toUpperCase()}`, this.grantedRelic.color, this.x, this.y - 24);
      }
    }

    // Emisión de partículas radiales según las reliquias concedidas
    this.grantedRelics.forEach((relic, idx) => {
      for (let i = 0; i < 18; i++) {
        const angle = (Math.PI * 2 * i) / 18 + idx * 0.25;
        const speed = 100 + Math.random() * 140;
        room.spawnParticle(
          this.x,
          this.y,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          5.5,
          relic.color || '#e879f9',
          0.75
        );
      }
    });
  }

  draw(ctx) {
    ctx.save();
    const w = 42;
    const h = 32;

    const glowRadius = 30 + Math.sin(this.pulseTimer) * 4;
    ctx.beginPath();
    ctx.arc(this.x, this.y, glowRadius, 0, Math.PI * 2);
    ctx.fillStyle = this.opened && this.grantedRelic ? this.grantedRelic.color : '#a855f7';
    ctx.globalAlpha = 0.25;
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = this.opened
      ? this.grantedRelic
        ? this.grantedRelic.color
        : '#c084fc'
      : '#6b21a8';
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2.8;
    ctx.fillRect(this.x - w / 2, this.y - h / 2, w, h);
    ctx.strokeRect(this.x - w / 2, this.y - h / 2, w, h);

    ctx.fillStyle = '#facc15';
    ctx.fillRect(this.x - w / 2, this.y - 3, w, 6);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(this.x - 5, this.y - 6, 10, 12);

    // Emblemas geométricos flotantes al abrirse (Cero ctx.fillText)
    if (this.opened && this.grantedRelics && this.grantedRelics.length > 0) {
      const floatY = Math.min(16, (3.2 - Math.max(0, this.openAnimTimer)) * 6);
      if (this.grantedRelics.length === 2) {
        const offsets = [-14, 14];
        this.grantedRelics.forEach((relic, i) => {
          const ex = this.x + offsets[i];
          const ey = this.y - h / 2 - 16 - floatY - (i * 6);
          ctx.beginPath();
          ctx.arc(ex, ey, 8, 0, Math.PI * 2);
          ctx.fillStyle = relic.color;
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#fef08a';
          ctx.stroke();
        });
      } else if (this.grantedRelic) {
        const ey = this.y - h / 2 - 16 - floatY;
        ctx.beginPath();
        ctx.arc(this.x, ey, 9, 0, Math.PI * 2);
        ctx.fillStyle = this.grantedRelic.color;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#fef08a';
        ctx.stroke();
      }
    }

        if (!this.opened && this.isLocked) {
      const lockY = this.y - 4 + Math.sin(this.pulseTimer) * 1.5;
      ctx.beginPath();
      ctx.arc(this.x, lockY - 5, 5.5, Math.PI, 0, false);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#c084fc';
      ctx.stroke();

      ctx.fillStyle = '#a855f7';
      ctx.fillRect(this.x - 6, lockY - 1, 12, 10);
      ctx.strokeStyle = '#f3e8ff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(this.x - 6, lockY - 1, 12, 10);
    }
    ctx.restore();
  }
}

class Coin extends Entity {
  constructor(x, y) {
    super(x, y, 9, '#facc15');
    this.pulseTimer = Math.random() * Math.PI * 2;
    this.baseMagnetRange = 85;
  }

  update(dt, player, room) {
    this.pulseTimer += dt * 6;
    if (room && typeof room.isPointInPit === 'function' && room.isPointInPit(this.x, this.y, this.radius)) {
      const safe = room.getWalkablePosition(this.x, this.y, this.radius);
      this.x = safe.x;
      this.y = safe.y;
    }

    const effectiveMagnetRange = this.baseMagnetRange * (player.coinMagnetMultiplier || 1.0);
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0 && dist < effectiveMagnetRange) {
      const pullSpeed = ((effectiveMagnetRange - dist) / effectiveMagnetRange) * 290;
      this.vx = (dx / dist) * pullSpeed;
      this.vy = (dy / dist) * pullSpeed;
      super.update(dt);
    }

    if (MathUtils.circleCollision(this.x, this.y, this.radius, player.x, player.y, player.radius)) {
      const total = (player._coinDropCarry || 0) + 1 + (player.coinValueBonus || 0);
      const coinsEarned = Math.max(1, Math.floor(total));
      player._coinDropCarry = Number((total - coinsEarned).toFixed(4));
      player.addCoins(coinsEarned);
      this.markedForDeletion = true;
    }
  }

  draw(ctx) {
    const pulse = Math.sin(this.pulseTimer) * 1.2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius + pulse * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = '#facc15';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fef08a';
    ctx.stroke();

    // Ranura geométrica de moneda dorada (Cero ctx.fillText)
    ctx.fillStyle = '#854d0e';
    ctx.fillRect(this.x - 1.5, this.y - 4.5, 3, 9);
    ctx.restore();
  }
}

class VoidGem extends Entity {
  constructor(x, y, value = 1) {
    super(x, y, 9, '#c084fc');
    this.value = value;
    this.pulseTimer = Math.random() * Math.PI * 2;
    this.baseMagnetRange = 95;
  }

  update(dt, player, room) {
    this.pulseTimer += dt * 6;
    if (room && typeof room.isPointInPit === 'function' && room.isPointInPit(this.x, this.y, this.radius)) {
      const safe = room.getWalkablePosition(this.x, this.y, this.radius);
      this.x = safe.x;
      this.y = safe.y;
    }

    const effectiveMagnetRange = this.baseMagnetRange * (player.coinMagnetMultiplier || 1.0);
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0 && dist < effectiveMagnetRange) {
      const pullSpeed = ((effectiveMagnetRange - dist) / effectiveMagnetRange) * 320;
      this.vx = (dx / dist) * pullSpeed;
      this.vy = (dy / dist) * pullSpeed;
      super.update(dt);
    }

    if (MathUtils.circleCollision(this.x, this.y, this.radius, player.x, player.y, player.radius)) {
      player.addShards(this.value, room);
      this.markedForDeletion = true;
    }
  }

  draw(ctx) {
    const pulse = Math.sin(this.pulseTimer) * 1.5;
    const r = this.radius + pulse * 0.4;
    ctx.save();
    ctx.translate(this.x, this.y);
    // Diamante brillante
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.3);
    ctx.lineTo(r * 0.95, 0);
    ctx.lineTo(0, r * 1.3);
    ctx.lineTo(-r * 0.95, 0);
    ctx.closePath();
    ctx.fillStyle = '#a855f7';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#f0abfc';
    ctx.stroke();

    // Brillo blanco interior
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.6);
    ctx.lineTo(r * 0.45, 0);
    ctx.lineTo(0, r * 0.6);
    ctx.lineTo(-r * 0.45, 0);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
  }
}


class BloodDecal {
  constructor(x, y, radius = 14, color = '#15803d') {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.color = color;
    this.splats = [];
    for (let i = 0; i < 4; i++) {
      this.splats.push({
        dx: (Math.random() - 0.5) * radius * 1.5,
        dy: (Math.random() - 0.5) * radius * 1.5,
        r: radius * (0.35 + Math.random() * 0.45)
      });
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.fillStyle = this.color;
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * 0.75, 0, Math.PI * 2);
    ctx.fill();
    for (const s of this.splats) {
      ctx.beginPath();
      ctx.arc(this.x + s.dx, this.y + s.dy, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

class KeyItem extends Entity {
  constructor(x, y) {
    super(x, y, 9, '#38bdf8');
    this.pulseTimer = Math.random() * Math.PI * 2;
    this.baseMagnetRange = 85;
  }

  update(dt, player, room) {
    this.pulseTimer += dt * 5;
    if (room && typeof room.isPointInPit === 'function' && room.isPointInPit(this.x, this.y, this.radius)) {
      const safe = room.getWalkablePosition(this.x, this.y, this.radius);
      this.x = safe.x;
      this.y = safe.y;
    }
    const effectiveMagnetRange = this.baseMagnetRange * (player.coinMagnetMultiplier || 1.0);
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0 && dist < effectiveMagnetRange) {
      const pullSpeed = ((effectiveMagnetRange - dist) / effectiveMagnetRange) * 280;
      this.vx = (dx / dist) * pullSpeed;
      this.vy = (dy / dist) * pullSpeed;
      super.update(dt);
    }

    if (MathUtils.circleCollision(this.x, this.y, this.radius, player.x, player.y, player.radius)) {
      player.addKeys(1);
      soundManager.playProcedural('key');
      if (player.ui) {
        player.ui.spawnFloatingText('+1 LLAVE', '#38bdf8', this.x, this.y - 18);
      }
      this.markedForDeletion = true;
    }
  }

  draw(ctx) {
    const pulse = Math.sin(this.pulseTimer) * 1.5;
    ctx.save();
    ctx.translate(this.x, this.y + pulse * 0.5);
    ctx.beginPath();
    ctx.arc(0, -4, 4.5, 0, Math.PI * 2);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, 0.5);
    ctx.lineTo(0, 8);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, 4);
    ctx.lineTo(3.5, 4);
    ctx.moveTo(0, 7);
    ctx.lineTo(2.5, 7);
    ctx.stroke();
    ctx.restore();
  }
}

class HeartItem extends Entity {
  constructor(x, y, heartType = 'FULL') {
    const color = heartType === 'SOUL' ? '#06b6d4' : '#ef4444';
    super(x, y, 10, color);
    this.heartType = heartType;
    this.amount = heartType === 'FULL' ? 30 : heartType === 'HALF' ? 15 : 35;
    this.pulseTimer = Math.random() * Math.PI * 2;
    this.baseMagnetRange = 65;
  }

  update(dt, player, room) {
    this.pulseTimer += dt * 6;
    if (room && typeof room.isPointInPit === 'function' && room.isPointInPit(this.x, this.y, this.radius)) {
      const safe = room.getWalkablePosition(this.x, this.y, this.radius);
      this.x = safe.x;
      this.y = safe.y;
    }
    const effectiveMagnetRange = this.baseMagnetRange * (player.coinMagnetMultiplier || 1.0);
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0 && dist < effectiveMagnetRange) {
      const pullSpeed = ((effectiveMagnetRange - dist) / effectiveMagnetRange) * 260;
      this.vx = (dx / dist) * pullSpeed;
      this.vy = (dy / dist) * pullSpeed;
      super.update(dt);
    }

    if (MathUtils.circleCollision(this.x, this.y, this.radius, player.x, player.y, player.radius)) {
      if (this.heartType === 'SOUL') {
        player.addShield(this.amount);
        soundManager.playProcedural('heart');
        if (player.ui) {
          player.ui.spawnFloatingText(`+${this.amount} ESCUDO`, '#38bdf8', this.x, this.y - 18);
        }
        this.markedForDeletion = true;
      } else if (player.hp < player.maxHp) {
        player.heal(this.amount);
        soundManager.playProcedural('heart');
        if (player.ui) {
          player.ui.spawnFloatingText(`+${this.amount} HP`, '#f87171', this.x, this.y - 18);
        }
        this.markedForDeletion = true;
      }
    }
  }

  draw(ctx) {
    const pulse = Math.sin(this.pulseTimer) * 1.2;
    ctx.save();
    ctx.translate(this.x, this.y + pulse * 0.4);
    const scale = (this.radius / 10) * (this.heartType === 'HALF' ? 0.85 : 1.0);
    ctx.scale(scale, scale);

    const isSoul = this.heartType === 'SOUL';
    const mainColor = isSoul ? '#06b6d4' : '#ef4444';
    const glowColor = isSoul ? '#67e8f9' : '#fca5a5';

    ctx.beginPath();
    ctx.moveTo(0, 3);
    ctx.bezierCurveTo(-5, -4, -10, -1, -5, -8);
    ctx.bezierCurveTo(-2, -10, 0, -8, 0, -5);
    ctx.bezierCurveTo(0, -8, 2, -10, 5, -8);
    ctx.bezierCurveTo(10, -1, 5, -4, 0, 3);
    ctx.fillStyle = mainColor;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = glowColor;
    ctx.stroke();

    if (this.heartType === 'HALF') {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
      ctx.fillRect(0, -10, 8, 15);
    }
    ctx.restore();
  }
}

class RockObstacle extends Entity {
  constructor(x, y, w = 42, h = 42) {
    super(x, y, Math.min(w, h) / 2, '#475569');
    this.w = w;
    this.h = h;
    this.isSolid = true;
    this.maxHp = 50;
    this.hp = this.maxHp;
    this.hitFlashTimer = 0;
  }

  collidesWithCircle(cx, cy, cr) {
    return MathUtils.circleAABBCollision(cx, cy, cr, this.x - this.w / 2, this.y - this.h / 2, this.w, this.h);
  }

  resolveCircleCollision(circleEntity) {
    const left = this.x - this.w / 2;
    const right = this.x + this.w / 2;
    const top = this.y - this.h / 2;
    const bottom = this.y + this.h / 2;

    const closestX = MathUtils.clamp(circleEntity.x, left, right);
    const closestY = MathUtils.clamp(circleEntity.y, top, bottom);

    const dx = circleEntity.x - closestX;
    const dy = circleEntity.y - closestY;
    const distSq = dx * dx + dy * dy;

    if (distSq < circleEntity.radius * circleEntity.radius && distSq > 0) {
      const dist = Math.sqrt(distSq);
      const overlap = circleEntity.radius - dist;
      circleEntity.x += (dx / dist) * overlap;
      circleEntity.y += (dy / dist) * overlap;
    }
  }

  takeDamage(amount, room) {
    this.hp -= amount;
    this.hitFlashTimer = 0.08;
    if (this.hp <= 0) {
      this.hp = 0;
      this.markedForDeletion = true;
      soundManager.playProcedural('break_rock');
      if (room && typeof room.spawnParticle === 'function') {
        for (let i = 0; i < 8; i++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = 40 + Math.random() * 80;
          room.spawnParticle(this.x, this.y, Math.cos(ang) * spd, Math.sin(ang) * spd, 3 + Math.random() * 3, '#64748b', 0.4);
        }
      }
      if (room && Math.random() < 0.35) {
        if (Math.random() < 0.25) {
          room.keys.push(new KeyItem(this.x, this.y));
        } else {
          room.coins.push(new Coin(this.x, this.y));
        }
      }
    }
  }

  update(dt) {
    if (this.hitFlashTimer > 0) this.hitFlashTimer -= dt;
  }

  draw(ctx) {
    const left = this.x - this.w / 2;
    const top = this.y - this.h / 2;

    ctx.save();
    ctx.fillStyle = this.hitFlashTimer > 0 ? '#f1f5f9' : '#334155';
    ctx.fillRect(left, top, this.w, this.h);

    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(left, top, this.w, this.h);

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(left + 3, top + this.h - 5, this.w - 6, 2);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(left + 8, top + 6);
    ctx.lineTo(left + this.w / 2, top + this.h / 2);
    ctx.lineTo(left + this.w - 10, top + this.h - 8);
    ctx.stroke();

    ctx.restore();
  }
}

class PotObstacle extends Entity {
  constructor(x, y) {
    super(x, y, 14, '#b45309');
    this.isSolid = true;
    this.maxHp = 20;
    this.hp = this.maxHp;
    this.hitFlashTimer = 0;
  }

  collidesWithCircle(cx, cy, cr) {
    return MathUtils.circleCollision(cx, cy, cr, this.x, this.y, this.radius);
  }

  resolveCircleCollision(circleEntity) {
    const dx = circleEntity.x - this.x;
    const dy = circleEntity.y - this.y;
    const dist = Math.hypot(dx, dy);
    const minDist = circleEntity.radius + this.radius;
    if (dist < minDist && dist > 0) {
      const overlap = minDist - dist;
      circleEntity.x += (dx / dist) * overlap;
      circleEntity.y += (dy / dist) * overlap;
    }
  }

  takeDamage(amount, room) {
    this.hp -= amount;
    this.hitFlashTimer = 0.08;
    if (this.hp <= 0) {
      this.hp = 0;
      this.markedForDeletion = true;
      soundManager.playProcedural('break_pot');
      if (room && typeof room.spawnParticle === 'function') {
        for (let i = 0; i < 7; i++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = 50 + Math.random() * 90;
          room.spawnParticle(this.x, this.y, Math.cos(ang) * spd, Math.sin(ang) * spd, 3, '#d97706', 0.35);
        }
      }
      if (room && Math.random() < 0.45) {
        const roll = Math.random();
        if (roll < 0.4) {
          room.hearts.push(new HeartItem(this.x, this.y, Math.random() < 0.25 ? 'SOUL' : 'HALF'));
        } else {
          room.coins.push(new Coin(this.x, this.y));
        }
      }
    }
  }

  update(dt) {
    if (this.hitFlashTimer > 0) this.hitFlashTimer -= dt;
  }

  draw(ctx) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.hitFlashTimer > 0 ? '#fef3c7' : '#92400e';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#d97706';
    ctx.stroke();

    ctx.fillStyle = '#b45309';
    ctx.fillRect(this.x - 6, this.y - this.radius - 3, 12, 4);

    ctx.beginPath();
    ctx.arc(this.x - this.radius + 1, this.y - 2, 3.5, 0, Math.PI * 2);
    ctx.arc(this.x + this.radius - 1, this.y - 2, 3.5, 0, Math.PI * 2);
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
}

class ItemPedestal extends Entity {
  constructor(x, y, relicId) {
    super(x, y, 26, '#38bdf8');
    this.relicId = relicId;
    this.relic = typeof RELIC_CATALOG !== 'undefined' ? RELIC_CATALOG[relicId] : null;
    this.consumed = false;
    this.pulseTimer = 0;
  }

  update(dt, player, room) {
    this.pulseTimer += dt * 3.5;
    if (room && typeof room.isPointInPit === 'function' && room.isPointInPit(this.x, this.y, this.radius)) {
      const safe = room.getWalkablePosition(this.x, this.y, this.radius);
      this.x = safe.x;
      this.y = safe.y;
    }
    if (this.consumed) return;

    if (MathUtils.circleCollision(this.x, this.y, this.radius + 10, player.x, player.y, player.radius)) {
      this.consumed = true;
      let acquiredRelic = null;
      if (player && player.itemManager) {
        if (this.relicId && typeof player.itemManager.addRelic === 'function') {
          acquiredRelic = player.itemManager.addRelic(this.relicId);
        } else if (typeof player.itemManager.grantRandomRelic === 'function') {
          acquiredRelic = player.itemManager.grantRandomRelic();
        }
      }
      soundManager.playProcedural('pedestal');
      if (player.ui) {
        const relicName = acquiredRelic ? acquiredRelic.name : (this.relic ? this.relic.name : this.relicId);
        const relicDesc = acquiredRelic ? acquiredRelic.description : (this.relic ? this.relic.description : '');
        player.ui.showToast(`¡RELIQUIA ADQUIRIDA: ${relicName}! ${relicDesc}`);
        player.ui.spawnFloatingText(`★ ${relicName.toUpperCase()} ★`, '#facc15', this.x, this.y - 35);
      }
      if (room && typeof room.spawnParticle === 'function') {
        for (let i = 0; i < 20; i++) {
          const ang = (Math.PI * 2 * i) / 20;
          room.spawnParticle(this.x, this.y - 12, Math.cos(ang) * 90, Math.sin(ang) * 90, 4, '#38bdf8', 0.6);
        }
      }
    }
  }

  draw(ctx) {
    const floatY = Math.sin(this.pulseTimer) * 5;

    ctx.save();
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 12, 28, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#334155';
    ctx.fillRect(this.x - 14, this.y - 4, 28, 16);
    ctx.strokeRect(this.x - 14, this.y - 4, 28, 16);

    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y - 4, 20, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (!this.consumed) {
      ctx.beginPath();
      ctx.arc(this.x, this.y - 20 + floatY, 16, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.stroke();

      const relicColor = this.relic && this.relic.color ? this.relic.color : '#facc15';
      ctx.beginPath();
      ctx.arc(this.x, this.y - 20 + floatY, 8, 0, Math.PI * 2);
      ctx.fillStyle = relicColor;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      for (let i = 0; i < 4; i++) {
        const ang = this.pulseTimer + (i * Math.PI) / 2;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(
          this.x + Math.cos(ang) * 12 - 1.5,
          this.y - 20 + floatY + Math.sin(ang) * 12 - 1.5,
          3,
          3
        );
      }
    } else {
      ctx.beginPath();
      ctx.arc(this.x, this.y - 10, 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(100, 116, 139, 0.3)';
      ctx.fill();
    }
    ctx.restore();
  }
}

class BossRewardPedestal extends Entity {
  constructor(x, y) {
    super(x, y, 28, '#ef4444');
    this.consumed = false;
    this.pulseTimer = 0;
  }

  update(dt, player, room) {
    this.pulseTimer += dt * 4;
    if (room && typeof room.isPointInPit === 'function' && room.isPointInPit(this.x, this.y, this.radius)) {
      const safe = room.getWalkablePosition(this.x, this.y, this.radius);
      this.x = safe.x;
      this.y = safe.y;
    }
    if (this.consumed) return;

    if (MathUtils.circleCollision(this.x, this.y, this.radius + 12, player.x, player.y, player.radius)) {
      this.consumed = true;
      player.baseMaxHp += 30;
      if (player.itemManager) {
        player.itemManager.applyPassiveStats();
      }
      player.heal(player.maxHp);
      soundManager.playProcedural('pedestal');
      if (player.ui) {
        player.ui.showToast('★ ¡RECOMPENSA DE JEFE! +30 Salud Máxima Base y HP Restaurada ★');
        player.ui.spawnFloatingText('+30 MAX HP (CURACIÓN TOTAL)', '#22c55e', this.x, this.y - 35);
      }
      if (room && typeof room.spawnParticle === 'function') {
        for (let i = 0; i < 24; i++) {
          const ang = (Math.PI * 2 * i) / 24;
          room.spawnParticle(this.x, this.y - 12, Math.cos(ang) * 110, Math.sin(ang) * 110, 5, '#ef4444', 0.7);
        }
      }
    }
  }

  draw(ctx) {
    const floatY = Math.sin(this.pulseTimer) * 5;

    ctx.save();
    ctx.fillStyle = '#1c1917';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 12, 30, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = '#292524';
    ctx.fillRect(this.x - 15, this.y - 4, 30, 16);
    ctx.strokeRect(this.x - 15, this.y - 4, 30, 16);

    ctx.fillStyle = '#1c1917';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y - 4, 22, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (!this.consumed) {
      ctx.beginPath();
      ctx.arc(this.x, this.y - 22 + floatY, 14, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
      ctx.fill();
      ctx.strokeStyle = '#f87171';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(this.x, this.y - 22 + floatY, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#ef4444';
      ctx.fill();
    }
    ctx.restore();
  }
}


class LockedChest extends Entity {
  constructor(x, y) {
    super(x, y, 22, '#f59e0b');
    this.opened = false;
    this.openAnimTimer = 0;
    this.pulseTimer = 0;
    this.lastWarnTimer = 0;
  }

  update(dt, player, room) {
    this.pulseTimer += dt * 4.5;
    if (room && typeof room.isPointInPit === 'function' && room.isPointInPit(this.x, this.y, this.radius)) {
      const safe = room.getWalkablePosition(this.x, this.y, this.radius);
      this.x = safe.x;
      this.y = safe.y;
    }
    if (this.opened) {
      if (this.openAnimTimer > 0) this.openAnimTimer -= dt;
      return;
    }

    // Colisión física sólida: el cofre con candado es un obstáculo físico y NUNCA se abre
    // solo al chocar contra él. Solo se abre explícitamente con [E] o haciendo clic en el prompt.
    const dist = Math.hypot(player.x - this.x, player.y - this.y);
    const minDist = this.radius + player.radius;
    if (dist < minDist) {
      const overlap = minDist - dist;
      if (dist > 0.0001) {
        player.x += ((player.x - this.x) / dist) * overlap;
        player.y += ((player.y - this.y) / dist) * overlap;
      } else {
        player.x += minDist;
      }
    }
  }

  interact(player, room) {
    if (this.opened) return;
    if (player.keys > 0) {
      player.useKey();
      this.openChest(player, room);
    } else {
      this.forceOpen(player, room);
    }
  }

  forceOpen(player, room) {
    if (this.opened || !player) return;
    // Forzar el candado pagando 15 HP de integridad
    player.takeDamage(15, room, { isProjectile: false, ignoreInvulnerability: true, isSacrifice: true });
    soundManager.playProcedural('break_rock');
    if (window.activeGameInstance) {
      window.activeGameInstance.triggerScreenShake(5.0, 0.2);
    }
    if (player.ui) {
      player.ui.showToast('🩸 ¡CANDADO FORZADO CON SANGRE! (-15 HP)');
      player.ui.spawnFloatingText('💥 CANDADO ROTO (-15 HP)', '#ef4444', this.x, this.y - 25);
      player.ui.updateHealth(player);
    }
    this.openChest(player, room, true);
  }

  openChest(player, room, wasForced = false) {
    this.opened = true;
    this.openAnimTimer = 2.8;
    soundManager.playProcedural('key');
    soundManager.playProcedural('pedestal');

    if (player.ui && !wasForced) {
      player.ui.showToast('¡COFRE DORADO DESBLOQUEADO! [🔑 -1]');
      player.ui.spawnFloatingText('★ BOTÍN DORADO ★', '#fbbf24', this.x, this.y - 30);
    }

    // Drop de 4 a 7 monedas
    const coinCount = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i < coinCount; i++) {
      const ang = (Math.PI * 2 * i) / coinCount + Math.random() * 0.3;
      const spd = 20 + Math.random() * 30;
      room.coins.push(new Coin(this.x + Math.cos(ang) * spd, this.y + Math.sin(ang) * spd));
    }

    // Drop de corazón (50% Alma, 50% Completo)
    const hType = Math.random() < 0.5 ? 'SOUL' : 'FULL';
    room.hearts.push(new HeartItem(this.x, this.y - 28, hType));

    // 40% chance de reliquia directa
    if (Math.random() < 0.40) {
      const relic = player.itemManager.grantRandomRelic();
      if (relic && player.ui) {
        player.ui.spawnFloatingText(`★ RELIQUIA: ${relic.name.toUpperCase()} ★`, relic.color, this.x, this.y - 48);
      }
    }

    if (room && typeof room.spawnParticle === 'function') {
      for (let i = 0; i < 20; i++) {
        const ang = (Math.PI * 2 * i) / 20;
        room.spawnParticle(this.x, this.y, Math.cos(ang) * 110, Math.sin(ang) * 110, 4.5, '#f59e0b', 0.6);
      }
    }
  }

  draw(ctx) {
    ctx.save();
    const w = 42;
    const h = 30;
    const pulse = Math.sin(this.pulseTimer) * 2;

    ctx.fillStyle = this.opened ? '#78350f' : '#b45309';
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 2.5;
    ctx.fillRect(this.x - w / 2, this.y - h / 2, w, h);
    ctx.strokeRect(this.x - w / 2, this.y - h / 2, w, h);

    // Banda metálica dorada
    ctx.fillStyle = '#fde047';
    ctx.fillRect(this.x - w / 2, this.y - 3, w, 6);

    if (!this.opened) {
      // Candado dorado/celeste geométrico brillante (Cero ctx.fillText)
      const lockY = this.y - 3 + pulse * 0.4;
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(this.x, lockY - 5, 5.5, Math.PI, 0, false);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#38bdf8';
      ctx.stroke();

      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(this.x - 6, lockY - 1, 12, 10);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(this.x - 6, lockY - 1, 12, 10);

      // Ojo de la cerradura
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(this.x, lockY + 3, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

class VaultChest extends Entity {
  constructor(x, y) {
    super(x, y, 26, '#38bdf8');
    this.pulseTimer = 0;
    this.keyCost = 1;
    this.goldCost = 30;
    this.opened = false;
    this.openAnimTimer = 0;
    this.interactCooldown = 0;
    this.lastWarnTimer = 0;
  }

  update(dt, player, room) {
    this.pulseTimer += dt * 4;
    if (this.interactCooldown > 0) this.interactCooldown -= dt;
    if (this.opened && this.openAnimTimer > 0) this.openAnimTimer -= dt;
  }

  openWithKey(player, room) {
    if (this.opened || !player || player.keys < this.keyCost) return;
    player.keys -= this.keyCost;
    if (player.ui) player.ui.updateKeys(player.keys);
    this.grantVaultRewards(player, room, '1 LLAVE 🔑');
  }

  openWithGold(player, room) {
    if (this.opened || !player || player.coins < this.goldCost) return;
    player.spendCoins(this.goldCost);
    if (player.ui) player.ui.updateCoins(player.coins);
    this.grantVaultRewards(player, room, '30 🪙 ORO');
  }

  forceOpen(player, room) {
    if (this.opened || !player) return;
    player.takeDamage(25, room, { isProjectile: false, ignoreInvulnerability: true, isSacrifice: true });
    soundManager.playProcedural('break_rock');
    if (window.activeGameInstance) {
      window.activeGameInstance.triggerScreenShake(7.0, 0.25);
    }
    if (player.ui) {
      player.ui.showToast('🩸 ¡BÓVEDA FORZADA CON SANGRE! (-25 HP)');
      player.ui.spawnFloatingText('💥 BÓVEDA FORZADA (-25 HP)', '#ef4444', this.x, this.y - 30);
      player.ui.updateHealth(player);
    }
    this.grantVaultRewards(player, room, 'SANGRE 🩸');
  }

  grantVaultRewards(player, room, methodStr) {
    this.opened = true;
    this.openAnimTimer = 3.0;

    soundManager.playProcedural('key');
    soundManager.playProcedural('pedestal');

    const relic = player.itemManager.grantRandomRelic();
    player.addShield(50);
    player.coins += 25;

    if (player.ui) {
      player.ui.updateCoins(player.coins);
      const rName = relic ? relic.name.toUpperCase() : 'RELIQUIA MÍSTICA';
      player.ui.showToast(`💎 ¡BÓVEDA DEL TESORO ABIERTA! [${methodStr}] → ${rName} + 50 ESCUDO + 25 🪙`);
      player.ui.spawnFloatingText(`★ ${rName} (+50 ESCUDO) ★`, '#38bdf8', this.x, this.y - 35);
    }

    if (room && typeof room.spawnParticle === 'function') {
      for (let i = 0; i < 24; i++) {
        const ang = (Math.PI * 2 * i) / 24;
        room.spawnParticle(this.x, this.y, Math.cos(ang) * 120, Math.sin(ang) * 120, 5, '#38bdf8', 0.65);
      }
    }
  }

  interact(player, room) {
    if (this.opened) return;
    if (player.keys > 0) {
      this.openWithKey(player, room);
    } else if (player.coins >= 30) {
      this.openWithGold(player, room);
    } else {
      this.forceOpen(player, room);
    }
  }

  draw(ctx) {
    if (this.opened && this.openAnimTimer <= 0) return;
    const floatY = Math.sin(this.pulseTimer) * 3;
    const cy = this.y + floatY;
    const w = 48;
    const h = 34;

    ctx.save();
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.fillRect(this.x - w / 2, cy - h / 2, w, h);
    ctx.strokeRect(this.x - w / 2, cy - h / 2, w, h);

    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(this.x - w / 2, cy - 4, w, 8);

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(this.x, cy, 5, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3 + this.pulseTimer * 0.8;
      const lx = this.x + Math.cos(a) * 14;
      const ly = cy + Math.sin(a) * 14;
      ctx.beginPath();
      ctx.arc(lx, ly, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fde047';
      ctx.fill();
    }
    ctx.restore();
  }
}

class ShopItem extends Entity {
  constructor(x, y, type, title, subtitle, cost, color) {
    super(x, y, 22, color);
    this.type = type;
    this.title = title;
    this.subtitle = subtitle;
    this.cost = cost;
    this.purchased = false;
    this.floatTimer = Math.random() * Math.PI * 2;
  }

  update(dt, player) {
    this.floatTimer += dt * 3.5;
    // Ya no compra accidentalmente por colisión. Se adquiere con [E] o click en el prompt.
    return false;
  }

  buy(player, room) {
    if (this.purchased || !player) return false;
    if (player.coins >= this.cost) {
      player.spendCoins(this.cost);
      this.applyUpgrade(player);
      this.purchased = true;
      if (player.itemManager) {
        player.itemManager.onUpgradeChosen(this.type);
      }
      if (typeof soundManager !== 'undefined' && soundManager) {
        soundManager.playProcedural('coin', { volume: 0.85 });
      }
      if (player.ui) {
        player.ui.updateCoins(player.coins);
        player.ui.showToast(`¡MEJORA ADQUIRIDA: ${this.title} (-${this.cost} 🪙)!`);
        player.ui.spawnFloatingText(`★ ${this.title.toUpperCase()} ★`, this.color, this.x, this.y - 25);
      }
      if (room) {
        room.shopSelectionMade = true;
        room.shopItems = [this];
        for (let i = 0; i < 14; i++) {
          const angle = (Math.PI * 2 * i) / 14;
          room.spawnParticle(this.x, this.y, Math.cos(angle) * 110, Math.sin(angle) * 110, 4.5, this.color, 0.6);
        }
      }
      return true;
    } else {
      if (typeof soundManager !== 'undefined' && soundManager) {
        soundManager.playProcedural('hurt');
      }
      if (player.ui) {
        player.ui.showToast(`Monedas insuficientes para ${this.title} (Requiere ${this.cost} 🪙)`);
        player.ui.spawnFloatingText(`🔒 REQUIERE ${this.cost} 🪙`, '#ef4444', this.x, this.y - 25);
      }
      return false;
    }
  }

  interact(player, room) {
    return this.buy(player, room);
  }

  applyUpgrade(player) {
    if (this.type === 'DAMAGE') {
      player.shopDamageMultiplier = Number((player.shopDamageMultiplier + 0.45).toFixed(2));
    } else if (this.type === 'EXTRA_PROJECTILE') {
      player.extraProjectiles += 1;
    } else if (this.type === 'ATTACK_SPEED') {
      player.shopAttackSpeedMultiplier = Number(
        (player.shopAttackSpeedMultiplier + 0.25).toFixed(2)
      );
    } else if (this.type === 'LUCKY_CRIT_HP') {
      player.baseCritChance = Number(((player.baseCritChance || 0) + 0.15).toFixed(2));
      player.baseMaxHp += 20;
      player.itemManager.applyPassiveStats();
      player.heal(20);
      return;
    }
    player.itemManager.applyPassiveStats();
  }

  draw(ctx, player) {
    const offsetY = Math.sin(this.floatTimer) * 3;
    const canAfford = player.coins >= this.cost;

    ctx.save();
    // Pedestal
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = this.purchased ? '#475569' : canAfford ? this.color : '#ef4444';
    ctx.lineWidth = 2.5;
    ctx.fillRect(this.x - 32, this.y + 14, 64, 14);
    ctx.strokeRect(this.x - 32, this.y + 14, 64, 14);

    if (!this.purchased) {
      const oy = this.y - 4 + offsetY;
      ctx.beginPath();
      ctx.arc(this.x, oy, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Iconografía geométrica pura según el tipo de mejora (Cero ctx.fillText)
      ctx.fillStyle = '#0f172a';
      if (this.type === 'DAMAGE') {
        // Rombo de poder ofensivo
        ctx.beginPath();
        ctx.moveTo(this.x, oy - 10);
        ctx.lineTo(this.x + 10, oy);
        ctx.lineTo(this.x, oy + 10);
        ctx.lineTo(this.x - 10, oy);
        ctx.closePath();
        ctx.fill();
      } else if (this.type === 'EXTRA_PROJECTILE') {
        // Triple núcleo de proyectiles
        for (const dx of [-8, 0, 8]) {
          ctx.beginPath();
          ctx.arc(this.x + dx, oy + (dx === 0 ? -4 : 4), 4, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (this.type === 'LUCKY_CRIT_HP') {
        // Estrella de 4 puntas de Dado de la Suerte (+Crítico y +HP)
        ctx.beginPath();
        ctx.moveTo(this.x, oy - 11);
        ctx.lineTo(this.x + 4, oy - 4);
        ctx.lineTo(this.x + 11, oy);
        ctx.lineTo(this.x + 4, oy + 4);
        ctx.lineTo(this.x, oy + 11);
        ctx.lineTo(this.x - 4, oy + 4);
        ctx.lineTo(this.x - 11, oy);
        ctx.lineTo(this.x - 4, oy - 4);
        ctx.closePath();
        ctx.fill();
      } else {
        // Doble chevron de velocidad de ataque
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#0f172a';
        ctx.beginPath();
        ctx.moveTo(this.x - 6, oy - 7);
        ctx.lineTo(this.x + 3, oy);
        ctx.lineTo(this.x - 6, oy + 7);
        ctx.moveTo(this.x + 1, oy - 7);
        ctx.lineTo(this.x + 10, oy);
        ctx.lineTo(this.x + 1, oy + 7);
        ctx.stroke();
      }

      // Indicadores geométricos de costo (pips de moneda debajo del pedestal)
      const pipSpacing = 10;
      const startX = this.x - ((this.cost - 1) * pipSpacing) / 2;
      for (let i = 0; i < this.cost; i++) {
        ctx.beginPath();
        ctx.arc(startX + i * pipSpacing, this.y + 38, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = canAfford ? '#facc15' : '#ef4444';
        ctx.fill();
      }
    }

    ctx.restore();
  }
}

/**
 * Proyectil del Jugador compatible con los Hooks del `ItemManager` (`onShoot` y `onHit`).
 * Soporta `piercing` (Balas penetrantes), `bouncesLeft` (Balas rebotantes),
 * `homingStrength` (Ojo cazador), `ghostPiercing` (Munición Fantasma) y `elementalDamage`
 * en espacio continuo flotante.
 */
class Projectile extends Entity {
  constructor(
    x,
    y,
    dirX,
    dirY,
    speed = 520,
    damage = 25,
    radius = 7,
    element = 'NONE',
    elementLevel = 1
  ) {
    const elemConfig = ELEMENTS[element] || ELEMENTS.NONE;
    super(x, y, radius, elemConfig.color);
    this.element = element;
    this.elementLevel = elementLevel;
    this.borderColor = elemConfig.border;
    this.vx = dirX * speed;
    this.vy = dirY * speed;
    this.damage = damage;
    this.lifeTime = 1.65;

    // Propiedades modificables por hooks `onShoot` de las Reliquias
    this.piercing = false;
    this.ghostPiercing = false;
    this.bouncesLeft = 0;
    this.homingStrength = 0;
    this.elementalDamage = 0;
    this.isBonusProjectile = false;
    this.hitEnemies = new Set(); // Evita golpear al mismo enemigo en múltiples frames al atravesarlo
  }

  update(dt, room, player) {
    // Sincronizar color si un hook `onShoot` (ej. `OLYMPIAN_BLESSING`) asignó un nuevo elemento
    if (this.element && ELEMENTS[this.element] && this.element !== 'NONE') {
      this.color = ELEMENTS[this.element].color;
      this.borderColor = ELEMENTS[this.element].border;
    }

    if (window.synergyEngine) {
      window.synergyEngine.onProjectileUpdate(this, dt, room, player);
    }

    // Si tiene soft-homing (Ojo cazador), curva ligeramente su vector de velocidad hacia el enemigo más cercano
    if (this.homingStrength > 0 && room.enemies.length > 0) {
      let closest = null;
      let minDist = Infinity;
      for (const e of room.enemies) {
        if (e.markedForDeletion || this.hitEnemies.has(e)) continue;
        const d = Math.hypot(e.x - this.x, e.y - this.y);
        if (d < minDist) {
          minDist = d;
          closest = e;
        }
      }
      if (closest && minDist < 320) {
        const speed = Math.hypot(this.vx, this.vy);
        const currentAngle = Math.atan2(this.vy, this.vx);
        const targetAngle = Math.atan2(closest.y - this.y, closest.x - this.x);
        const diff = MathUtils.angleDiff(targetAngle, currentAngle);
        const newAngle = currentAngle + MathUtils.clamp(diff, -this.homingStrength * dt, this.homingStrength * dt);
        this.vx = Math.cos(newAngle) * speed;
        this.vy = Math.sin(newAngle) * speed;
      }
    }

    super.update(dt);
    this.lifeTime -= dt;

    if (this.lifeTime <= 0) {
      this.markedForDeletion = true;
      if (typeof EvolutionManager !== 'undefined' && this.evolutionId) {
        EvolutionManager.onProjectileDetonate(this, null, room, player);
      }
      return;
    }

    // Colisión con bordes de la habitación (soporta rebote si `bouncesLeft > 0`)
    const rb = (room && room.bounds) ? room.bounds : ROOM_BOUNDS;
    let hitWall = false;
    if (this.x - this.radius <= rb.left) {
      this.x = rb.left + this.radius;
      this.vx = Math.abs(this.vx);
      hitWall = true;
    } else if (this.x + this.radius >= rb.right) {
      this.x = rb.right - this.radius;
      this.vx = -Math.abs(this.vx);
      hitWall = true;
    }

    if (this.y - this.radius <= rb.top) {
      this.y = rb.top + this.radius;
      this.vy = Math.abs(this.vy);
      hitWall = true;
    } else if (this.y + this.radius >= rb.bottom) {
      this.y = rb.bottom - this.radius;
      this.vy = -Math.abs(this.vy);
      hitWall = true;
    }

    if (hitWall) {
      if (this.bouncesLeft > 0) {
        this.bouncesLeft -= 1;
        this.hitEnemies.clear();
        // Sinergia Caos Cinético
        if (player && player.synergyManager && player.synergyManager.has('KINETIC_CHAOS')) {
          this.damage = Math.round(this.damage * 1.35);
          this.radius = Math.min(24, this.radius * 1.25);
          if (room) {
            room.spawnParticle(this.x, this.y, '#38bdf8', 6);
            room.spawnParticle(this.x, this.y, '#ffffff', 4);
          }
          soundManager.playProcedural('crit', { volume: 0.35 });
        }
      } else {
        this.markedForDeletion = true;
        return;
      }
    }

    // Colisión Círculo-Círculo contra enemigos (y Escudos Orbitales / Guardias de Jefes v1.8)
    for (const enemy of room.enemies) {
      if (enemy.markedForDeletion || enemy.isBurrowed || this.hitEnemies.has(enemy)) continue;

      // 1. Verificar intercepción con Escudos Orbitales de Némesis (Fase 2)
      if (enemy.orbitShields && enemy.orbitShields.length > 0) {
        let blockedByOrbitShield = false;
        for (const shield of enemy.orbitShields) {
          if (MathUtils.circleCollision(this.x, this.y, this.radius, shield.x, shield.y, shield.radius)) {
            shield.flashTimer = 0.14;
            room.spawnParticle(this.x, this.y, -this.vx * 0.3, -this.vy * 0.3, 4, '#c084fc', 0.35);
            this.markedForDeletion = true;
            blockedByOrbitShield = true;
            break;
          }
        }
        if (blockedByOrbitShield) break;
      }

      if (MathUtils.circleCollision(this.x, this.y, this.radius, enemy.x, enemy.y, enemy.radius)) {
        // 2. Verificar estado Contraataque (`guard`) de Serafín
        if (enemy.isGuarding && typeof enemy.onGuardedHit === 'function') {
          enemy.onGuardedHit(this, room, player);
          this.markedForDeletion = true;
          break;
        }

        // 3. Verificar Ciclo de Invulnerabilidad (`hasInvulnerabilityCycle` en HardRoom v1.9)
        if (enemy.isCycleInvulnerable) {
          room.spawnParticle(this.x, this.y, -this.vx * 0.25, -this.vy * 0.25, 4, '#ffffff', 0.3);
          this.hitEnemies.add(enemy);
          if (!this.piercing) {
            this.markedForDeletion = true;
            break;
          }
          continue;
        }

        let rawHitDamage = this.damage + (this.elementalDamage || 0);
        if (player && player.critChance > 0 && Math.random() < player.critChance) {
          rawHitDamage *= 2.0;
          room.spawnParticle(enemy.x, enemy.y, '#fef08a', 6);
        }

        const dealt = enemy.takeDamage(rawHitDamage, this.vx * 0.15, this.vy * 0.15, this.element);
        if (this.element !== 'NONE' && !enemy.markedForDeletion) {
          enemy.applyElementalEffect(this.element, room, this.elementLevel);
        }

        // Ejecutar Hook `onHit` del ItemManager del jugador
        if (player && player.itemManager) {
          player.itemManager.onHit(this, enemy, room, dealt);
        }
        if (window.synergyEngine) {
          window.synergyEngine.onProjectileHit(this, enemy, room, player);
        }

        this.hitEnemies.add(enemy);

        if (typeof this.maxPierces === 'number') {
          this.maxPierces--;
          if (this.maxPierces <= 0) {
            this.piercing = false;
          }
        }

        if (!this.piercing) {
          this.markedForDeletion = true;
          if (typeof EvolutionManager !== 'undefined' && this.evolutionId) {
            EvolutionManager.onProjectileDetonate(this, enemy, room, player);
          }
          break;
        }
      }
    }
  }

  draw(ctx) {
    ctx.save();
    if (this.isHeavyOrb || this.radius > 12) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(239, 68, 68, 0.22)';
      ctx.fill();
    }
    if (this.ghostPiercing) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(103, 232, 249, 0.28)';
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.ghostPiercing ? '#a5f3fc' : this.color;
    ctx.fill();
    ctx.lineWidth = this.piercing ? 2.5 : 2;
    ctx.strokeStyle = this.ghostPiercing
      ? '#22d3ee'
      : this.piercing
      ? '#38bdf8'
      : this.borderColor;
    ctx.stroke();
    ctx.restore();
  }
}

class EnemyProjectile extends Entity {
  constructor(x, y, dirX, dirY, speed = 310, damage = 14, radius = 6, sourceArchetype = 'ShooterEnemy') {
    super(x, y, radius, '#fb923c');
    const ngMult = isMortalMode ? (4 * ngPlusLevel) : (1 + ngPlusLevel);
    const eyeDmgMult = (typeof BrotherEye !== 'undefined' && BrotherEye.enabled)
      ? Math.min(1.25, BrotherEye.getEnemyDamageMultiplier())
      : 1.0;
    this.vx = dirX * speed;
    this.vy = dirY * speed;
    this.damage = Math.max(1, Math.round(damage * ngMult * eyeDmgMult));
    this.lifeTime = 2.6;
    this.glowColor = 'rgba(249, 115, 22, 0.34)';
    this.coreColor = '#fff7ed';
    this.ringColor = '#f97316';
    this.sourceArchetype = sourceArchetype;
    this._perfectDodged = false;
  }

  update(dt, player, room) {
    super.update(dt);
    this.lifeTime -= dt;

    if (this.lifeTime <= 0) {
      this.markedForDeletion = true;
      return;
    }

    const rb = (room && room.bounds) ? room.bounds : ROOM_BOUNDS;
    if (
      this.x - this.radius <= rb.left ||
      this.x + this.radius >= rb.right ||
      this.y - this.radius <= rb.top ||
      this.y + this.radius >= rb.bottom
    ) {
      this.markedForDeletion = true;
      return;
    }

    if (MathUtils.circleCollision(this.x, this.y, this.radius, player.x, player.y, player.radius)) {
      const isDashing = typeof CombatSystem !== 'undefined' && CombatSystem.isPlayerDashing(player);
      if (isDashing) {
        if (!this._perfectDodged) {
          this._perfectDodged = true;
          CombatSystem.triggerPerfectDodge(player, room, this.x, this.y);
        }
        return;
      }
      player.takeDamage(this.damage, room, {
        isProjectile: true,
        vx: this.vx,
        vy: this.vy,
        sourceArchetype: this.sourceArchetype || 'ShooterEnemy',
      });
      room.spawnParticle(this.x, this.y, -this.vx * 0.25, -this.vy * 0.25, 4, '#fdba74', 0.35);
      this.markedForDeletion = true;
    }
  }

  draw(ctx) {
    ctx.save();
    // Halo exterior + borde oscuro de alto contraste para destacarse sobre efectos del jugador
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius + 4, 0, Math.PI * 2);
    ctx.fillStyle = this.glowColor;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius + 1.5, 0, Math.PI * 2);
    ctx.fillStyle = '#090d16';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.ringColor;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(this.x, this.y, Math.max(2, this.radius * 0.52), 0, Math.PI * 2);
    ctx.fillStyle = this.coreColor;
    ctx.fill();
    ctx.restore();
  }
}

// ----------------------------------------------------------------------------
// 6. GESTOR DE EFECTOS DE SONIDO (SFX) CON ATENUACIÓN DE REPETICIÓN (v2.1)
// ----------------------------------------------------------------------------
class SoundEffectManager {
  initAudioContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  playProcedural(type, options = {}) {
    if (this.isMuted) return;
    this.initAudioContext();
    if (!this.audioCtx) return;

    const ctx = this.audioCtx;
    const now = ctx.currentTime;
    const masterVol = (options.volume !== undefined ? options.volume : 1.0) * this.baseVolume;

    try {
      if (type === 'hurt') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(35, now + 0.18);
        gain.gain.setValueAtTime(0.5 * masterVol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.18);
      } else if (type === 'coin') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(987.77, now);
        osc.frequency.setValueAtTime(1318.51, now + 0.05);
        gain.gain.setValueAtTime(0.35 * masterVol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.16);
      } else if (type === 'key') {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        osc1.type = 'sine';
        osc2.type = 'triangle';
        osc1.frequency.setValueAtTime(1046.5, now);
        osc2.frequency.setValueAtTime(1567.98, now);
        gain.gain.setValueAtTime(0.4 * masterVol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);
        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.22);
        osc2.stop(now + 0.22);
      } else if (type === 'heart') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(261.63, now);
        osc.frequency.exponentialRampToValueAtTime(392.0, now + 0.15);
        gain.gain.setValueAtTime(0.45 * masterVol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === 'enemy_death') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(25, now + 0.15);
        gain.gain.setValueAtTime(0.5 * masterVol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'crit') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1760, now);
        gain.gain.setValueAtTime(0.45 * masterVol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.28);
      } else if (type === 'door_unlock') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(880, now + 0.04);
        gain.gain.setValueAtTime(0.3 * masterVol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === 'pedestal') {
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((freq, idx) => {
          const noteOsc = ctx.createOscillator();
          const noteGain = ctx.createGain();
          const startT = now + idx * 0.055;
          noteOsc.type = 'sine';
          noteOsc.frequency.setValueAtTime(freq, startT);
          noteGain.gain.setValueAtTime(0.35 * masterVol, startT);
          noteGain.gain.exponentialRampToValueAtTime(0.001, startT + 0.25);
          noteOsc.connect(noteGain);
          noteGain.connect(ctx.destination);
          noteOsc.start(startT);
          noteOsc.stop(startT + 0.25);
        });
      } else if (type === 'break_rock') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(90, now);
        osc.frequency.exponentialRampToValueAtTime(20, now + 0.16);
        gain.gain.setValueAtTime(0.45 * masterVol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.16);
      } else if (type === 'break_pot') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(480, now);
        osc.frequency.exponentialRampToValueAtTime(90, now + 0.14);
        gain.gain.setValueAtTime(0.4 * masterVol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.14);
      } else if (type === 'dash') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.15);
        gain.gain.setValueAtTime(0.35 * masterVol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'perfect_dodge') {
        const notes = [659.25, 987.77, 1318.51];
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const st = now + idx * 0.032;
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, st);
          gain.gain.setValueAtTime(0.28 * masterVol, st);
          gain.gain.exponentialRampToValueAtTime(0.001, st + 0.14);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(st);
          osc.stop(st + 0.14);
        });
      } else if (type === 'telegraph') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(210, now);
        osc.frequency.exponentialRampToValueAtTime(390, now + 0.16);
        gain.gain.setValueAtTime(0.22 * masterVol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.17);
      } else if (type === 'boss_flash') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(920, now);
        osc.frequency.exponentialRampToValueAtTime(1420, now + 0.08);
        gain.gain.setValueAtTime(0.25 * masterVol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.09);
      } else if (type === 'boss_slam') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(115, now);
        osc.frequency.exponentialRampToValueAtTime(28, now + 0.24);
        gain.gain.setValueAtTime(0.42 * masterVol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'boss_stun') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(280, now);
        osc.frequency.exponentialRampToValueAtTime(85, now + 0.25);
        gain.gain.setValueAtTime(0.32 * masterVol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.26);
      }
    } catch (e) {
      // Audio fallback
    }
  }

  constructor() {
    this.baseVolume = 0.50; // SFX volumen base independiente (50%)
    this.isMuted = false;
    this.soundPaths = {
      pelotita: 'sonidosarmas/pelotita.MP3',
      espada: 'sonidosarmas/espada.MP3',
      laser: 'sonidosarmas/sonido laser.MP3',
      sierras: 'sonidosarmas/pelotitas volando alrededor xd.MP3',
      pacto: 'sonidosarmas/musica rara para pacto (aun no confirmado su uso).MP3'
    };

    this.pools = {};
    this.activeVoices = {};

    for (const key in this.soundPaths) {
      this.pools[key] = [];
      this.activeVoices[key] = [];
      // Pool de 5 instancias reutilizables para no generar cortes ni sobrecargar memoria
      for (let i = 0; i < 5; i++) {
        const a = new Audio();
        a.src = this.soundPaths[key];
        a.preload = 'auto';
        this.pools[key].push(a);
      }
    }
  }

  /**
   * Reproduce un efecto de sonido atenuando progresivamente los sonidos repetidos anteriores.
   * El sonido anterior repetido baja su volumen para que el disparo/golpe actual resalte limpio
   * y no sature los altavoces ni genere fatiga auditiva.
   */
  play(key, options = {}) {
    if (this.isMuted) return null;
    const pool = this.pools[key];
    if (!pool) return null;

    const baseVol = (options.volume !== undefined ? options.volume : 1.0) * this.baseVolume;
    const attenuation = options.attenuation !== undefined ? options.attenuation : 0.35;
    const pitchJitter = options.pitchJitter !== undefined ? options.pitchJitter : 0.06;

    // Atenuar instancias anteriores que aún sigan sonando de este mismo efecto
    const currentActive = this.activeVoices[key] || [];
    for (let i = 0; i < currentActive.length; i++) {
      const voice = currentActive[i];
      if (!voice.audio.paused && !voice.audio.ended) {
        voice.currentVol = voice.currentVol * attenuation;
        voice.audio.volume = Math.max(0, voice.currentVol);
      }
    }

    // Obtener voz libre del pool
    let audioInst = pool.find((a) => a.paused || a.ended);
    if (!audioInst) {
      audioInst = pool[0];
    } else {
      const idx = pool.indexOf(audioInst);
      pool.splice(idx, 1);
      pool.push(audioInst);
    }

    try {
      audioInst.currentTime = 0;
      audioInst.volume = baseVol;

      // Micro-pitch sutil anti-machinegun (+/- 3%)
      if (pitchJitter > 0) {
        audioInst.playbackRate = (1.0 - pitchJitter / 2) + Math.random() * pitchJitter;
      } else {
        audioInst.playbackRate = 1.0;
      }

      const voiceEntry = { audio: audioInst, currentVol: baseVol };
      this.activeVoices[key].push(voiceEntry);

      audioInst.onended = () => {
        const vIdx = this.activeVoices[key].indexOf(voiceEntry);
        if (vIdx !== -1) this.activeVoices[key].splice(vIdx, 1);
      };

      const p = audioInst.play();
      if (p !== undefined) {
        p.catch(() => {});
      }
      return audioInst;
    } catch (err) {
      return null;
    }
  }

  setMasterVolume(val) {
    this.baseVolume = Math.max(0, Math.min(1, val));
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      for (const key in this.activeVoices) {
        for (const voice of this.activeVoices[key]) {
          voice.audio.volume = 0;
        }
      }
    }
  }
}

const soundManager = new SoundEffectManager();


// ============================================================================
// META-PROGRESO PERMANENTE (SANTUARIO DEL ABISMO) & GESTOR DE SINERGIAS
// ============================================================================
const META_STORAGE_KEY = 'ROGUE_METAPROGRESSION_V1';

const TALENT_DEFS = {
  vitality: {
    id: 'vitality',
    name: 'Corazón de Titán',
    icon: '❤️',
    desc: '+12 HP máxima base por nivel',
    maxLevel: 5,
    costs: [15, 35, 70, 120, 190],
    apply(player, level) {
      player.baseMaxHp += level * 12;
      player.maxHp = player.baseMaxHp;
      player.hp = player.maxHp;
    }
  },
  might: {
    id: 'might',
    name: 'Fuerza Primordial',
    icon: '⚔️',
    desc: '+6% de daño general por nivel',
    maxLevel: 5,
    costs: [20, 45, 80, 140, 210],
    apply(player, level) {
      player.shopDamageMultiplier += level * 0.06;
      player.damageMultiplier = player.shopDamageMultiplier;
    }
  },
  haste: {
    id: 'haste',
    name: 'Cadencia Arcana',
    icon: '⚡',
    desc: '+6% velocidad de ataque por nivel',
    maxLevel: 5,
    costs: [20, 45, 80, 140, 210],
    apply(player, level) {
      player.shopAttackSpeedMultiplier += level * 0.06;
      player.attackSpeedMultiplier = player.shopAttackSpeedMultiplier;
    }
  },
  swiftness: {
    id: 'swiftness',
    name: 'Pies Alados',
    icon: '👟',
    desc: '+4% velocidad de movimiento por nivel',
    maxLevel: 3,
    costs: [25, 60, 120],
    apply(player, level) {
      player.baseSpeed *= (1 + level * 0.04);
      player.speed = player.baseSpeed;
    }
  },
  starterBag: {
    id: 'starterBag',
    name: 'Bolsa de Expedición',
    icon: '🎒',
    desc: 'Nv.1: +15 Oro | Nv.2: +1 Llave | Nv.3: Reliquia inicial aleatoria',
    maxLevel: 3,
    costs: [30, 75, 150],
    apply(player, level) {
      if (level >= 1) player.coins += 15;
      if (level >= 2) player.keys += 1;
      if (level >= 3 && player.itemManager) {
        player.itemManager.grantRandomRelic();
      }
    }
  },
  dodgeMastery: {
    id: 'dodgeMastery',
    name: 'Maestría de Esquiva',
    icon: '💨',
    desc: 'Nv.1: +25% regeneración de Estamina | Nv.2: +35 Estamina Máx y -15% coste de Dash',
    maxLevel: 2,
    costs: [40, 130],
    apply(player, level) {
      if (level >= 1) {
        player.staminaRegenMultiplier = (player.staminaRegenMultiplier || 1.0) * 1.25;
      }
      if (level >= 2) {
        player.baseMaxStamina = (player.baseMaxStamina || 100) + 35;
        player.maxStamina = player.baseMaxStamina;
        player.stamina = player.maxStamina;
        player.baseDashCostMultiplier = Math.max(0.45, (player.baseDashCostMultiplier || 1.0) * 0.85);
        player.dashCostMultiplier = player.baseDashCostMultiplier;
      }
    }
  },
  greed: {
    id: 'greed',
    name: 'Codicia del Abismo',
    icon: '💎',
    desc: '+15% probabilidad de Gemas y +10% valor de monedas en drops',
    maxLevel: 5,
    costs: [15, 35, 65, 110, 175],
    apply(player, level) {
      player.gemDropBonus = (player.gemDropBonus || 0) + level * 0.15;
      player.coinValueBonus = (player.coinValueBonus || 0) + level * 0.10;
    }
  },
  sawAfinity: {
    id: 'sawAfinity',
    name: 'Blindaje de Sierras',
    icon: '🪚',
    desc: 'Nv.1: +1.5s activas | Nv.2: -1.5s recarga base | Nv.3: +1 Sierra extra',
    maxLevel: 3,
    costs: [35, 80, 160],
    apply(player, level) {
      if (player.sawShield) {
        if (level >= 1) player.sawShield.activeDuration += 1.5;
        if (level >= 2) player.sawShield.baseCooldown = Math.max(3.0, player.sawShield.baseCooldown - 1.5);
        if (level >= 3) player.sawShield.bonusSaws = (player.sawShield.bonusSaws || 0) + 1;
      }
    }
  }
};

class MetaProgressionManager {
  constructor() {
    this.data = this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(META_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const normArch = (id) => (id === 'cinder' ? 'pyro' : id);
        const rawUnlocked = Array.isArray(parsed.unlockedArchetypes) ? parsed.unlockedArchetypes : ['classic'];
        const normalizedUnlocked = Array.from(new Set(rawUnlocked.map(normArch)));
        return {
          shards: parsed.shards || 0,
          totalRuns: parsed.totalRuns || 0,
          totalKills: parsed.totalKills || 0,
          talents: parsed.talents || {},
          unlockedArchetypes: normalizedUnlocked,
          selectedArchetype: normArch(parsed.selectedArchetype || 'classic'),
          pendingBlessing: parsed.pendingBlessing || null
        };
      }
    } catch (e) {
      console.warn('Error cargando metaprogreso:', e);
    }
    return { shards: 0, totalRuns: 0, totalKills: 0, talents: {}, unlockedArchetypes: ['classic'], selectedArchetype: 'classic', pendingBlessing: null };
  }

  save() {
    try {
      localStorage.setItem(META_STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.warn('Error guardando metaprogreso:', e);
    }
  }

  getShards() {
    return this.data.shards || 0;
  }

  addShards(amount) {
    this.data.shards = Math.max(0, (this.data.shards || 0) + amount);
    this.save();
    return this.data.shards;
  }

  getUnlockedArchetypes() {
    if (!this.data.unlockedArchetypes) this.data.unlockedArchetypes = ['classic'];
    return this.data.unlockedArchetypes;
  }

  isArchetypeUnlocked(id) {
    return this.getUnlockedArchetypes().includes(id);
  }

  getSelectedArchetype() {
    return this.data.selectedArchetype || 'classic';
  }

  selectArchetype(id) {
    if (!this.isArchetypeUnlocked(id)) return false;
    this.data.selectedArchetype = id;
    this.save();
    return true;
  }

  unlockArchetype(id, cost) {
    if (this.isArchetypeUnlocked(id)) return true;
    if (this.data.shards < cost) return false;
    this.data.shards -= cost;
    if (!this.data.unlockedArchetypes) this.data.unlockedArchetypes = ['classic'];
    this.data.unlockedArchetypes.push(id);
    this.data.selectedArchetype = id;
    this.save();
    return true;
  }

  setPendingBlessing(blessing) {
    this.data.pendingBlessing = blessing;
    this.save();
  }

  getTalentLevel(talentId) {
    return (this.data.talents && this.data.talents[talentId]) || 0;
  }

  upgradeTalent(talentId) {
    const def = TALENT_DEFS[talentId];
    if (!def) return false;
    const currentLvl = this.getTalentLevel(talentId);
    if (currentLvl >= def.maxLevel) return false;
    const cost = def.costs[currentLvl];
    if (this.data.shards < cost) return false;

    this.data.shards -= cost;
    if (!this.data.talents) this.data.talents = {};
    this.data.talents[talentId] = currentLvl + 1;
    this.save();
    return true;
  }

  applyAllTalentsToPlayer(player) {
    for (const id in TALENT_DEFS) {
      const lvl = this.getTalentLevel(id);
      if (lvl > 0) {
        TALENT_DEFS[id].apply(player, lvl);
      }
    }
  }
}

const metaProgression = new MetaProgressionManager();
window.metaProgression = metaProgression;

/**
 * Función auxiliar universal e infalible para comprobar posesión de reliquias
 */
function hasPlayerRelic(player, relicId) {
  if (!player || !player.itemManager) return false;
  if (typeof player.itemManager.hasRelic === 'function') {
    return player.itemManager.hasRelic(relicId);
  }
  if (player.itemManager.ownedSet && typeof player.itemManager.ownedSet.has === 'function') {
    return player.itemManager.ownedSet.has(relicId);
  }
  if (Array.isArray(player.itemManager.ownedRelics)) {
    return player.itemManager.ownedRelics.some(r => r && (r.id === relicId || r.key === relicId));
  }
  return false;
}

const SYNERGIES = {
  KINETIC_CHAOS: {
    id: 'KINETIC_CHAOS',
    name: 'Caos Cinético',
    icon: '💥',
    desc: 'Tus proyectiles ganan +35% daño acumulativo y crecen en tamaño con cada rebote en pared.',
    check(player) {
      return hasPlayerRelic(player, 'BOUNCING_BULLETS') && hasPlayerRelic(player, 'PIERCING_BULLETS');
    }
  },
  ABSOLUTE_ZERO: {
    id: 'ABSOLUTE_ZERO',
    name: 'Cero Absoluto',
    icon: '❄️',
    desc: 'El Rayo Láser deja una fisura glacial en el suelo (3.5s) que congela y ralentiza a los enemigos un 65%.',
    check(player) {
      const hasIce = hasPlayerRelic(player, 'FROZEN_HEART') || (player && player.elementalPool && (player.elementalPool.ICE || 0) > 0);
      const isLaser = Boolean(
        player &&
        player.currentWeapon &&
        (typeof WeaponSystem !== 'undefined'
          ? WeaponSystem.weaponHasTag(player.currentWeapon, 'BEAM')
          : player.currentWeapon.name === 'Rayo Láser')
      );
      return Boolean(hasIce && isLaser);
    }
  },
  VOLCANIC_SUPERNOVA: {
    id: 'VOLCANIC_SUPERNOVA',
    name: 'Supernova Volcánica',
    icon: '🌋',
    desc: 'Los Orbes Pesados detonan al final de su recorrido liberando 6 meteoritos ardientes en anillo.',
    check(player) {
      const hasFire = hasPlayerRelic(player, 'UNSTABLE_POWDER') || hasPlayerRelic(player, 'ASH_KING') || (player && player.elementalPool && (player.elementalPool.FIRE || 0) > 0);
      const isProjectile = Boolean(
        player &&
        player.currentWeapon &&
        (typeof WeaponSystem !== 'undefined'
          ? WeaponSystem.weaponHasTag(player.currentWeapon, 'PROJECTILE')
          : player.currentWeapon.name === 'Pelotas')
      );
      return Boolean(hasFire && isProjectile);
    }
  },
  THUNDER_GOD_PARRY: {
    id: 'THUNDER_GOD_PARRY',
    name: 'Parry del Dios del Trueno',
    icon: '⚡',
    desc: 'Ejecutar un Parry con la Espada convoca relámpagos celestes sobre TODOS los enemigos visibles en la sala.',
    check(player) {
      const hasLightning = hasPlayerRelic(player, 'VOLTAIC_ARC') || hasPlayerRelic(player, 'DIVINE_REVENGE') || (player && player.elementalPool && (player.elementalPool.LIGHTNING || 0) > 0);
      const isSword = Boolean(
        player &&
        player.currentWeapon &&
        (typeof WeaponSystem !== 'undefined'
          ? (WeaponSystem.weaponHasTag(player.currentWeapon, 'MELEE') || WeaponSystem.weaponHasTag(player.currentWeapon, 'PARRY'))
          : player.currentWeapon.name === 'Espada Larga')
      );
      return Boolean(hasLightning && isSword);
    }
  },
  PLASMA_VORTEX: {
    id: 'PLASMA_VORTEX',
    name: 'Vórtice de Plasma',
    icon: '🛡️',
    desc: 'Las sierras defensivas brillan con plasma; al bloquear balas disparan proyectiles guiados y aceleran tu escudo.',
    check(player) {
      return hasPlayerRelic(player, 'SECOND_SKIN') || hasPlayerRelic(player, 'SHIELD_OF_DAMNED');
    }
  },
  GRAVITATIONAL_SINGULARITY: {
    id: 'GRAVITATIONAL_SINGULARITY',
    name: 'Singularidad Gravitacional',
    icon: '🌀',
    desc: 'Tus proyectiles generan un vórtice gravitatorio que succiona a todos los enemigos a su paso.',
    check(player) {
      return hasPlayerRelic(player, 'SINGULARITY') || hasPlayerRelic(player, 'SINGULARITY_HEART') || hasPlayerRelic(player, 'HUNTER_EYE');
    }
  }
};

class SynergyManager {
  constructor() {
    this.activeSynergies = new Set();
    this.unlockedHistory = new Set();
  }

  update(player, ui, room) {
    for (const key in SYNERGIES) {
      const syn = SYNERGIES[key];
      const isActive = syn.check(player);
      if (isActive && !this.activeSynergies.has(key)) {
        this.activeSynergies.add(key);
        if (!this.unlockedHistory.has(key)) {
          this.unlockedHistory.add(key);
          if (ui) {
            ui.showToast(`✨ ¡FUSIÓN DESBLOQUEADA: ${syn.name.toUpperCase()}! ✨`);
            ui.updateSynergies(this);
          }
          soundManager.playProcedural('pedestal', { volume: 0.8 });
          if (room) {
            room.spawnParticle(player.x, player.y, '#f0abfc', 14);
            room.spawnParticle(player.x, player.y, '#38bdf8', 14);
          }
        }
      } else if (!isActive && this.activeSynergies.has(key)) {
        this.activeSynergies.delete(key);
        if (ui) ui.updateSynergies(this);
      }
    }
  }

  has(key) {
    return this.activeSynergies.has(key);
  }
}

// ----------------------------------------------------------------------------
// 6. SISTEMA DE ARMAMENTOS (DESACOPLADO EN `weapons.js` - `WeaponSystem`)
//    Las armas principales (`Pelotas`, `Rayo Láser`, `Espada Larga` y nuevas)
//    se registran declarativamente en `weapons.js` sin dependencias en este archivo.
// ----------------------------------------------------------------------------

class OrbitalDefenseShield {
  constructor(player) {
    this.isActive = false;
    this.activeDuration = 6.0;
    this.timer = 0;
    this.baseCooldown = 8.5;
    this.cooldownTimer = 2.0; // Inicia tras 2s en la primera sala
    this.sawRadius = 14;
    this.orbitRadius = 56;
    this.angle = 0;
    this.angularSpeed = 4.6;
    this.bonusSaws = 0;
    this.enemyHitCooldowns = new WeakMap();
    this.saws = [];
  }

  getCooldown(player) {
    // Si el jugador tiene mejoras de proyectiles extra, las sierras aparecen más seguido!
    const extra = (player && player.extraProjectiles) ? player.extraProjectiles : 0;
    return Math.max(2.5, this.baseCooldown - extra * 1.4);
  }

  getSawCount(player) {
    // +1 sierra por cada proyectil extra y +1 por Blindaje de Sierras Nv.3
    const extra = (player && player.extraProjectiles) ? player.extraProjectiles : 0;
    return 2 + extra + (this.bonusSaws || 0);
  }

  update(dt, player, room) {
    if (this.isActive) {
      this.timer -= dt;
      this.angle += this.angularSpeed * dt;

      const sawCount = this.getSawCount(player);
      this.saws = [];

      for (let i = 0; i < sawCount; i++) {
        const sawAngle = this.angle + (i * 2 * Math.PI) / sawCount;
        const sawX = player.x + Math.cos(sawAngle) * this.orbitRadius;
        const sawY = player.y + Math.sin(sawAngle) * this.orbitRadius;
        this.saws.push({ x: sawX, y: sawY });

        // 1. Destruir proyectiles enemigos que impacten las sierras
        if (room && room.enemyProjectiles && room.enemyProjectiles.length > 0) {
          for (const ep of room.enemyProjectiles) {
            if (ep.markedForDeletion) continue;
            if (MathUtils.circleCollision(sawX, sawY, this.sawRadius, ep.x, ep.y, ep.radius)) {
              ep.markedForDeletion = true;
              room.spawnParticle(ep.x, ep.y, '#f97316', 5);
              room.spawnParticle(ep.x, ep.y, '#ffffff', 3);
              soundManager.playProcedural('break_rock', { volume: 0.35 });

              // Sinergia Vórtice de Plasma
              if (player && player.synergyManager && player.synergyManager.has('PLASMA_VORTEX')) {
                player.shield = Math.min(player.maxShield || 25, (player.shield || 0) + 2);
                if (room.enemies.length > 0) {
                  const target = room.enemies[0];
                  const ddx = target.x - sawX;
                  const ddy = target.y - sawY;
                  const dist = Math.hypot(ddx, ddy) || 1;
                  const plasmaD = new Projectile(sawX, sawY, ddx / dist, ddy / dist, 640, Math.round(28 * player.damageMultiplier), 6, 'NONE', 1);
                  plasmaD.color = '#38bdf8';
                  plasmaD.borderColor = '#ffffff';
                  room.projectiles.push(plasmaD);
                }
              }
            }
          }
        }

        // 2. Dañar y empujar fuertemente enemigos
        if (room && room.enemies && room.enemies.length > 0) {
          for (const enemy of room.enemies) {
            if (enemy.markedForDeletion || enemy.isBurrowed) continue;
            if (MathUtils.circleCollision(sawX, sawY, this.sawRadius, enemy.x, enemy.y, enemy.radius)) {
              const currentCd = this.enemyHitCooldowns.get(enemy) || 0;
              if (currentCd <= 0) {
                const sawDmg = Math.max(6, Math.round(10 * player.damageMultiplier));
                const pushDir = MathUtils.normalize(enemy.x - player.x, enemy.y - player.y);
                const pushMag = 340;
                enemy.takeDamage(sawDmg, pushDir.x * pushMag, pushDir.y * pushMag, 'NONE');
                this.enemyHitCooldowns.set(enemy, 0.22);
                room.spawnParticle(sawX, sawY, '#fb923c', 4);
                soundManager.playProcedural('break_rock', { volume: 0.25 });
                if (window.activeGameInstance) {
                  window.activeGameInstance.triggerScreenShake(1.5, 0.08);
                }
              }
            }
          }
        }
      }

      // Decrementar cooldowns individuales de enemigos
      if (room && room.enemies) {
        for (const enemy of room.enemies) {
          const cd = this.enemyHitCooldowns.get(enemy);
          if (cd && cd > 0) {
            this.enemyHitCooldowns.set(enemy, cd - dt);
          }
        }
      }

      if (this.timer <= 0) {
        this.isActive = false;
        this.cooldownTimer = this.getCooldown(player);
        this.saws = [];
      }
    } else {
      this.cooldownTimer -= dt;
      if (this.cooldownTimer <= 0) {
        this.isActive = true;
        this.timer = this.activeDuration;
        soundManager.play('sierras', { volume: 0.65, pitchJitter: 0.02, attenuation: 0.4 });
        if (room) {
          room.spawnParticle(player.x, player.y, '#f97316', 10);
        }
      }
    }
  }

  draw(ctx) {
    if (!this.isActive || this.saws.length === 0) return;

    ctx.save();
    for (const saw of this.saws) {
      ctx.save();
      ctx.translate(saw.x, saw.y);
      ctx.rotate(this.angle * 2.2);

      const teeth = 8;
      ctx.beginPath();
      for (let i = 0; i < teeth * 2; i++) {
        const a = (i * Math.PI) / teeth;
        const r = i % 2 === 0 ? this.sawRadius : this.sawRadius - 4;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = '#94a3b8';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#f97316';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#f97316';
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
}

// ----------------------------------------------------------------------------
// 7. JERARQUÍA DE ENEMIGOS: ENEMY, SHOOTER, SPLITTER Y ELITEENEMY (v1.5)
// ----------------------------------------------------------------------------
class Enemy extends Entity {
  constructor(x, y, sectionNumber = 1, levelNumber = 1, behaviorType = 'ERRATIC') {
    const isBoss = behaviorType === 'BOSS_MIXED';
    const radius = isBoss ? 26 : behaviorType === 'DASHER' ? 15 : 16;
    const color = isBoss ? '#16a34a' : behaviorType === 'DASHER' ? '#10b981' : '#22c55e';
    super(x, y, radius, color);

    this.sectionNumber = sectionNumber;
    this.levelNumber = levelNumber;
    this.behaviorType = behaviorType;
    this.isBoss = isBoss;
    this.isElite = false;
    this.dropsCoin = true;

    const globalFloor = (sectionNumber - 1) * CONFIG.LEVELS_PER_SECTION + levelNumber;
    // Escalado v2.1: En Modo Mortal multiplica por (4 * ngPlusLevel); en modo normal usa (1 + ngPlusLevel)
    this.ngMult = isMortalMode ? (4 * ngPlusLevel) : (1 + ngPlusLevel);

    // Propuesta B: Desacople de velocidad para mantener la física de esquiva y kiteo
    this.ngSpeedMult = isMortalMode
      ? Math.min(1.75, 1 + ngPlusLevel * 0.12)
      : Math.min(1.45, 1 + ngPlusLevel * 0.06);

    const baseHpV11 = isBoss ? 230 + levelNumber * 50 : 50 + levelNumber * 16;
    this.maxHp = Math.round(baseHpV11 * CONFIG.ENEMY_HP_MULTIPLIER * this.ngMult);
    this.hp = this.maxHp;

    // Fórmula de Defensa Progresiva y Orgánica
    this.isFlying = false;
    this.isBerserk = false;
    if (sectionNumber === 1) {
      this.defense = 0;
    } else {
      this.defense =
        CONFIG.SECTION_2_BASE_DEFENSE +
        (sectionNumber - 2) * 20 +
        (levelNumber - 1) * 3;
    }

    const baseSpeed = isBoss ? 110 + globalFloor * 4 : 115 + globalFloor * 6;
    this.speed = Math.min(CONFIG.ENEMY_SPEED_CAPS.COMMON, baseSpeed * this.ngSpeedMult);
    this.contactDamage = Math.round((isBoss ? 25 : 15) * this.ngMult);

    this.activeEffects = [];
    this.freezeMeter = 0;
    this.maxFreezeMeter = isBoss ? 220 : 100;
    this.ccImmunityTimer = 0;

    this.elementalAffinities = {
      NONE: 1.0,
      FIRE: 1.0,
      BLEED: 1.0,
      ELECTRIC: 1.0,
      ICE: 1.0,
      MIRACLE: 1.0,
      POISON: 1.0,
    };
    this.resistantElement = null;
    this.weakElement = null;

    if (sectionNumber >= 2) {
      this.assignElementalProfile();
    }

    this.aiTimer = Math.random() * Math.PI * 2;
    this.waveFrequency = 5.5 + Math.random() * 2.5;
    this.waveAmplitude = isBoss ? 95 : 135;

    this.dashState = 'APPROACH';
    this.stateTimer = 1.1 + Math.random() * 1.0;
    this.dashTargetDir = { x: 0, y: 0 };
    this.dashSpeed = isBoss ? 390 : 440;

    this.knockbackVx = 0;
    this.knockbackVy = 0;
    this.hitFlashTimer = 0;

    // Mecánica de Ciclo de Invulnerabilidad (`HardRoom` v1.9: 3s vulnerable / 2s invulnerable)
    this.hasInvulnerabilityCycle = false;
    this.invulnCycleTimer = Math.random() * 3.0;
    this.isCycleInvulnerable = false;

    // Marca del Cazador (`HUNTERS_MARK` v2.1: +25% daño recibido en Élites marcados)
    this.isMarkedByHunter = false;
    this.huntersMarkDamageMultiplier = 1.0;

    // Retardo inicial de reacción al entrar a una nueva sala (dar tiempo de reacción al jugador)
    this.reactionDelay = 0;

    // Sistema Universal de Estamina Enemiga & Desincronización Fibonacci (v3.5)
    this.maxStamina = isBoss ? 140 : (behaviorType === 'DASHER' ? 110 : 100);
    this.stamina = this.maxStamina;
    this.staminaRegen = isBoss ? 25 : 22;
    this.isExhausted = false;
    this.staminaExhaustedRecoveryThreshold = this.maxStamina * 0.50;
    this.cachedSepVx = 0;
    this.cachedSepVy = 0;
    this.isLastSurvivor = false;
    if (typeof HiveMindSystem !== 'undefined' && HiveMindSystem && typeof HiveMindSystem.initEnemyHiveState === 'function') {
      HiveMindSystem.initEnemyHiveState(this);
    }
  }

  consumeStamina(amount) {
    if (!amount || amount <= 0) return true;
    this.stamina = Math.max(0, this.stamina - amount);
    if (this.stamina <= 0) {
      this.stamina = 0;
      this.isExhausted = true;
    }
    return !this.isExhausted;
  }

  updateStamina(dt) {
    if (this.stamina < this.maxStamina) {
      const regenMult = this.isExhausted ? 1.28 : 1.0;
      this.stamina = Math.min(this.maxStamina, this.stamina + this.staminaRegen * regenMult * dt);
      if (this.isExhausted && this.stamina >= this.staminaExhaustedRecoveryThreshold) {
        this.isExhausted = false;
      }
    }
  }

  assignElementalProfile() {
    if (Math.random() < 0.7) {
      const profile =
        ELEMENTAL_PROFILES[Math.floor(Math.random() * ELEMENTAL_PROFILES.length)];
      this.resistantElement = profile.resist;
      this.weakElement = profile.weak;
    } else {
      const resistIdx = Math.floor(Math.random() * ELEMENT_KEYS.length);
      let weakIdx = Math.floor(Math.random() * ELEMENT_KEYS.length);
      if (weakIdx === resistIdx) {
        weakIdx = (resistIdx + 1) % ELEMENT_KEYS.length;
      }
      this.resistantElement = ELEMENT_KEYS[resistIdx];
      this.weakElement = ELEMENT_KEYS[weakIdx];
    }

    this.elementalAffinities[this.resistantElement] = CONFIG.ELEMENTAL_RESIST_MULT;
    this.elementalAffinities[this.weakElement] = CONFIG.ELEMENTAL_WEAK_MULT;
  }

  getDefenseMitigationMultiplier() {
    return 100 / (100 + this.defense);
  }

  getElementalAffinityMultiplier(element = 'NONE') {
    return this.elementalAffinities[element] !== undefined
      ? this.elementalAffinities[element]
      : 1.0;
  }

  takeDamage(rawDamage, kbVx = 0, kbVy = 0, element = 'NONE') {
    if (this.isCycleInvulnerable) return 0;
    this.reactionDelay = 0; // Se activa instantáneamente al recibir impacto

    const isTrueDamage = element === 'TRUE_DAMAGE';
    const defenseMultiplier = isTrueDamage ? 1.0 : this.getDefenseMitigationMultiplier();
    const affinityMultiplier = isTrueDamage ? 1.0 : this.getElementalAffinityMultiplier(element);
    const hunterMult = this.isMarkedByHunter ? this.huntersMarkDamageMultiplier || 1.25 : 1.0;
    const finalDamage = rawDamage * defenseMultiplier * affinityMultiplier * hunterMult;

    this.hp -= finalDamage;
    if (finalDamage > 0 && typeof HiveMindSystem !== 'undefined' && HiveMindSystem && typeof HiveMindSystem.recordDamageToHive === 'function') {
      HiveMindSystem.recordDamageToHive(finalDamage);
    }
    this.knockbackVx += kbVx;
    this.knockbackVy += kbVy;
    this.hitFlashTimer = 0.08;

    if (this.hp <= 0) {
      this.hp = 0;
      this.markedForDeletion = true;
      if (window.synergyEngine) {
        const room = (window.activeGameInstance && window.activeGameInstance.currentRoom) ? window.activeGameInstance.currentRoom : null;
        const player = (window.activeGameInstance && window.activeGameInstance.player) ? window.activeGameInstance.player : null;
        window.synergyEngine.onEnemyKilled(this, room, player);
      }
    }
    return finalDamage;
  }

  applyDoTDamage(rawAmount, element = 'NONE') {
    if (this.markedForDeletion || this.isCycleInvulnerable || rawAmount <= 0) return 0;
    this.hp -= rawAmount;
    if (typeof HiveMindSystem !== 'undefined' && HiveMindSystem && typeof HiveMindSystem.recordDamageToHive === 'function') {
      HiveMindSystem.recordDamageToHive(rawAmount);
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.markedForDeletion = true;
      if (window.synergyEngine) {
        const room = (window.activeGameInstance && window.activeGameInstance.currentRoom) ? window.activeGameInstance.currentRoom : null;
        const player = (window.activeGameInstance && window.activeGameInstance.player) ? window.activeGameInstance.player : null;
        window.synergyEngine.onEnemyKilled(this, room, player);
      }
    }
    return rawAmount;
  }

  hasEffect(type) {
    return this.activeEffects.some((e) => e.type === type);
  }

  getEffect(type) {
    return this.activeEffects.find((e) => e.type === type) || null;
  }

  applyElementalEffect(elementType, room, elementLevel = 1) {
    if (this.markedForDeletion) return;

    const affinity = this.getElementalAffinityMultiplier(elementType);
    const extraLevels = Math.max(0, elementLevel - 1);
    const levelMultiplier = 1 + CONFIG.ELEMENT_EXTRA_LEVEL_BONUS * extraLevels;

    if (elementType === 'FIRE') {
      const baseDps = 22 * levelMultiplier;
      const stackDps = 8 * levelMultiplier;
      const existing = this.getEffect('FIRE');
      if (existing) {
        existing.dps += stackDps;
        if (this.isBoss) {
          existing.dps = Math.min(85 * levelMultiplier, existing.dps);
          existing.timer = 5.0;
        }
      } else {
        this.activeEffects.push(
          this.isBoss
            ? { type: 'FIRE', dps: Math.min(85 * levelMultiplier, baseDps), timer: 5.0 }
            : { type: 'FIRE', dps: baseDps }
        );
      }
    } else if (elementType === 'BLEED') {
      const baseDmgPerPixel = 0.24 * levelMultiplier;
      const existing = this.getEffect('BLEED');
      if (existing) {
        existing.stacks = this.isBoss ? Math.min(6, existing.stacks + 1) : (existing.stacks + 1);
        existing.damagePerPixel = baseDmgPerPixel * existing.stacks;
        if (this.isBoss) existing.timer = 5.0;
      } else {
        this.activeEffects.push({
          type: 'BLEED',
          stacks: 1,
          damagePerPixel: baseDmgPerPixel,
          ...(this.isBoss ? { timer: 5.0 } : {})
        });
      }
    } else if (elementType === 'ELECTRIC') {
      if (this.isBoss) {
        // Tenacidad de Jefe: choque eléctrico porcentual acotado y micro-slow sin congelar la FSM
        const bossShock = Math.min(this.maxHp * 0.04, 48 * levelMultiplier);
        this.takeDamage(bossShock, 0, 0, 'ELECTRIC');
        if (this.markedForDeletion) return;

        if ((this.ccImmunityTimer || 0) <= 0) {
          this.ccImmunityTimer = 3.5;
          const existingSlow = this.getEffect('BOSS_SLOW');
          if (existingSlow) {
            existingSlow.timer = Math.max(existingSlow.timer, 0.95);
            existingSlow.speedMult = Math.min(existingSlow.speedMult, 0.72);
          } else {
            this.activeEffects.push({ type: 'BOSS_SLOW', timer: 0.95, speedMult: 0.72 });
          }
        }
        return;
      }

      const rawShock = this.maxHp * 0.3;
      this.takeDamage(rawShock, 0, 0, 'ELECTRIC');
      if (this.markedForDeletion) return;

      const stunDuration = 1.5 * levelMultiplier;
      const existing = this.getEffect('ELECTRIC');
      if (existing) {
        existing.timer = Math.max(existing.timer, stunDuration);
      } else {
        this.activeEffects.push({ type: 'ELECTRIC', timer: stunDuration });
      }
    } else if (elementType === 'ICE') {
      if (this.isBoss) {
        if ((this.ccImmunityTimer || 0) > 0 || this.isBurrowed || this.isGuarding || (this.invulnerableTimer || 0) > 0) {
          return;
        }
        this.freezeMeter += 36 * affinity;
        if (this.freezeMeter >= this.maxFreezeMeter) {
          this.freezeMeter = 0;
          this.ccImmunityTimer = 5.0;
          this.setFrozen(0.55);
          const existingSlow = this.getEffect('BOSS_SLOW');
          if (existingSlow) {
            existingSlow.timer = Math.max(existingSlow.timer, 1.8);
            existingSlow.speedMult = Math.min(existingSlow.speedMult, 0.65);
          } else {
            this.activeEffects.push({ type: 'BOSS_SLOW', timer: 1.8, speedMult: 0.65 });
          }
        }
        return;
      }

      this.freezeMeter += 50 * affinity;
      if (this.freezeMeter >= this.maxFreezeMeter) {
        this.freezeMeter = 0;
        const baseFreezeTime = 2.4 * levelMultiplier;
        this.setFrozen(baseFreezeTime * affinity);

        if (room && room.enemies) {
          const candidates = [];
          for (const other of room.enemies) {
            if (other === this || other.markedForDeletion) continue;
            const dist = Math.hypot(other.x - this.x, other.y - this.y);
            candidates.push({ enemy: other, dist });
          }

          candidates.sort((a, b) => a.dist - b.dist);
          for (const item of candidates.slice(0, 2)) {
            const neighborAffinity = item.enemy.getElementalAffinityMultiplier('ICE');
            item.enemy.setFrozen(baseFreezeTime * neighborAffinity);
            room.spawnParticle(item.enemy.x, item.enemy.y, 0, -40, 6, ELEMENTS.ICE.color, 0.5);
          }
        }
      }
    } else if (elementType === 'MIRACLE') {
      if (this.isBoss) {
        // Tenacidad de Jefe: "Discordia Astral" en vez de ejecución instantánea a los 4s
        const existingAstral = this.getEffect('MIRACLE_BOSS');
        const tickDmg = Math.round(32 * levelMultiplier);
        if (!existingAstral) {
          this.activeEffects.push({
            type: 'MIRACLE_BOSS',
            timer: 3.0,
            tickTimer: 0.75,
            damagePerTick: tickDmg,
          });
        } else {
          existingAstral.timer = 3.0;
          existingAstral.damagePerTick = Math.max(existingAstral.damagePerTick, tickDmg);
        }
        return;
      }

      const miracleDuration = Math.max(
        0.6,
        4.0 * Math.pow(1 - CONFIG.ELEMENT_EXTRA_LEVEL_BONUS, extraLevels)
      );
      const existing = this.getEffect('MIRACLE');
      if (!existing) {
        this.activeEffects.push({
          type: 'MIRACLE',
          timer: miracleDuration,
          allyHitCooldowns: new Map(),
        });
      } else {
        existing.timer = Math.min(existing.timer, miracleDuration);
      }
    } else if (elementType === 'POISON') {
      this.applyPoisonEffect(4.0 * levelMultiplier, (this.isBoss ? 18 : 20) * levelMultiplier);
    }
  }

  setFrozen(duration) {
    const existing = this.getEffect('ICE');
    if (existing) {
      existing.timer = Math.max(existing.timer, duration);
    } else {
      this.activeEffects.push({ type: 'ICE', timer: duration });
    }
  }

  /**
   * Aplica o refresca el efecto de estado de Veneno (`POISON` - v1.9)
   * originado por `PoisonPuddle` (DoT lento que dura 4s tras salir del charco).
   */
  applyPoisonEffect(duration = 4.0, dps = 18) {
    if (this.markedForDeletion || this.isBurrowed) return;
    const existing = this.getEffect('POISON');
    if (existing) {
      existing.timer = Math.max(existing.timer, duration);
      existing.dps = Math.max(existing.dps, dps);
    } else {
      this.activeEffects.push({ type: 'POISON', timer: duration, dps });
    }
  }

  findClosestFellowEnemy(allEnemies) {
    let closest = null;
    let minDist = Infinity;
    for (const other of allEnemies) {
      if (other === this || other.markedForDeletion) continue;
      const d = Math.hypot(other.x - this.x, other.y - this.y);
      if (d < minDist) {
        minDist = d;
        closest = other;
      }
    }
    return closest;
  }

  computeAIMovement(dt, targetEntity, miracleEffect, room, allEnemies) {
    const toTarget = MathUtils.normalize(targetEntity.x - this.x, targetEntity.y - this.y);
    const perpX = -toTarget.y;
    const perpY = toTarget.x;

    const speedBoost = (miracleEffect ? 1.35 : 1.0) * (this.isBerserk ? 1.2 : 1.0);
    let moveVx = 0;
    let moveVy = 0;

    const useHive = !miracleEffect && typeof HiveMindSystem !== 'undefined';
    let runLocalCheck = true;
    if (useHive) {
      runLocalCheck = HiveMindSystem.shouldRunLocalCheck(this);
      this._fibRunThisFrame = runLocalCheck;
    } else {
      this._fibRunThisFrame = true;
    }

    if (this.behaviorType === 'ERRATIC' || miracleEffect) {
      if (useHive && !miracleEffect) {
        let directive = this.cachedSteering;
        if (runLocalCheck || !directive) {
          directive = HiveMindSystem.computeTacticalDirective(this, targetEntity, room, allEnemies);
        }
        const waveMod = Math.sin(this.aiTimer * this.waveFrequency) * 0.14;
        moveVx = directive.moveVx * speedBoost + perpX * (this.waveAmplitude * waveMod);
        moveVy = directive.moveVy * speedBoost + perpY * (this.waveAmplitude * waveMod);
      } else {
        const waveOffset =
          Math.sin(this.aiTimer * this.waveFrequency) *
          (miracleEffect ? this.waveAmplitude * 0.35 : this.waveAmplitude);
        moveVx = toTarget.x * this.speed * speedBoost + perpX * waveOffset;
        moveVy = toTarget.y * this.speed * speedBoost + perpY * waveOffset;
      }
    } else if (this.behaviorType === 'DASHER' || this.behaviorType === 'BOSS_MIXED') {
      this.stateTimer -= dt;

      if (this.dashState === 'APPROACH') {
        if (this.isExhausted) {
          // Agotado: retrocede/orbita brevemente hasta recuperar estamina
          moveVx = (-toTarget.x * 0.45 + perpX * (this.flankSign || 1) * 0.75) * (this.speed * 0.72);
          moveVy = (-toTarget.y * 0.45 + perpY * (this.flankSign || 1) * 0.75) * (this.speed * 0.72);
        } else {
          const wave =
            this.behaviorType === 'BOSS_MIXED'
              ? Math.sin(this.aiTimer * this.waveFrequency) * this.waveAmplitude
              : 0;
          moveVx = toTarget.x * (this.speed * 0.85) + perpX * wave;
          moveVy = toTarget.y * (this.speed * 0.85) + perpY * wave;

          if (this.stateTimer <= 0 && (this.stamina >= 28 || this.isLastSurvivor)) {
            this.dashState = 'WINDUP';
            this.stateTimer = 0.45;
            this.dashTargetDir = { x: toTarget.x, y: toTarget.y };
          }
        }
      } else if (this.dashState === 'WINDUP') {
        if (this.stateTimer > 0.2) {
          this.dashTargetDir = { x: toTarget.x, y: toTarget.y };
        }
        moveVx = 0;
        moveVy = 0;

        if (this.stateTimer <= 0) {
          this.consumeStamina(32, 1.35);
          this.dashState = 'DASH';
          this.stateTimer = 0.36;
        }
      } else if (this.dashState === 'DASH') {
        moveVx = this.dashTargetDir.x * this.dashSpeed;
        moveVy = this.dashTargetDir.y * this.dashSpeed;

        if (this.stateTimer <= 0) {
          this.dashState = 'APPROACH';
          this.stateTimer = 1.2 + Math.random() * 0.9;
        }
      }
    }

    return { moveVx, moveVy };
  }

  update(dt, player, allEnemies, room) {
    if (this.markedForDeletion) return;
    if (this.hitFlashTimer > 0) this.hitFlashTimer -= dt;
    if (this.ccImmunityTimer > 0) this.ccImmunityTimer = Math.max(0, this.ccImmunityTimer - dt);
    this.aiTimer += dt;
    this.updateStamina(dt);
    if (this.hiveLungeTimer > 0) this.hiveLungeTimer = Math.max(0, this.hiveLungeTimer - dt);
    if (this.hiveLungeCooldown > 0) this.hiveLungeCooldown = Math.max(0, this.hiveLungeCooldown - dt);

    // Retardo de reacción inicial al entrar el jugador a la sala (0.25s para evaluar la situación)
    if (this.reactionDelay > 0) {
      this.reactionDelay = Math.max(0, this.reactionDelay - dt);
      this.vx = 0;
      this.vy = 0;
      return;
    }

    // Actualizar Ciclo de Invulnerabilidad (`HardRoom` v1.9: 3.0s vulnerable -> 2.0s invulnerable)
    if (this.hasInvulnerabilityCycle) {
      this.invulnCycleTimer = (this.invulnCycleTimer + dt) % 5.0;
      this.isCycleInvulnerable = this.invulnCycleTimer >= 3.0;
    } else {
      this.isCycleInvulnerable = false;
    }

    let isStunnedOrFrozen = false;
    let bossSlowMult = 1.0;
    let miracleEffect = null;
    let bleedEffect = null;
    const defenseMitigation = this.getDefenseMitigationMultiplier();

    for (let i = this.activeEffects.length - 1; i >= 0; i--) {
      const eff = this.activeEffects[i];

      if (eff.type === 'FIRE') {
        if (!this.isCycleInvulnerable) {
          const fireAffinity = this.getElementalAffinityMultiplier('FIRE');
          this.applyDoTDamage(eff.dps * fireAffinity * defenseMitigation * dt, 'FIRE');
          if (this.markedForDeletion) return;
        }
        if (typeof eff.timer === 'number') {
          eff.timer -= dt;
          if (eff.timer <= 0) this.activeEffects.splice(i, 1);
        }
      } else if (eff.type === 'POISON') {
        eff.timer -= dt;
        if (!this.isCycleInvulnerable) {
          this.applyDoTDamage(eff.dps * defenseMitigation * dt, 'POISON');
          if (this.markedForDeletion) return;
        }
        if (eff.timer <= 0) {
          this.activeEffects.splice(i, 1);
        }
      } else if (eff.type === 'BLEED') {
        if (typeof eff.timer === 'number') {
          eff.timer -= dt;
          if (eff.timer <= 0) {
            this.activeEffects.splice(i, 1);
            continue;
          }
        }
        bleedEffect = eff;
      } else if (eff.type === 'ELECTRIC' || eff.type === 'ICE') {
        eff.timer -= dt;
        if (eff.timer <= 0) {
          this.activeEffects.splice(i, 1);
        } else {
          isStunnedOrFrozen = true;
        }
      } else if (eff.type === 'BOSS_SLOW') {
        eff.timer -= dt;
        if (eff.timer <= 0) {
          this.activeEffects.splice(i, 1);
        } else {
          bossSlowMult = Math.min(bossSlowMult, eff.speedMult || 0.72);
        }
      } else if (eff.type === 'MIRACLE_BOSS') {
        eff.timer -= dt;
        eff.tickTimer -= dt;
        if (eff.tickTimer <= 0) {
          eff.tickTimer = 0.75;
          const mirAffinity = this.getElementalAffinityMultiplier('MIRACLE');
          this.applyDoTDamage(eff.damagePerTick * mirAffinity * defenseMitigation, 'MIRACLE');
          if (room && typeof room.spawnParticle === 'function') {
            room.spawnParticle(this.x, this.y - this.radius * 0.5, 0, -50, 5, '#e879f9', 0.4);
          }
          if (this.markedForDeletion) return;
        }
        if (eff.timer <= 0) {
          this.activeEffects.splice(i, 1);
        }
      } else if (eff.type === 'MIRACLE') {
        eff.timer -= dt;
        for (const [ally, cd] of eff.allyHitCooldowns.entries()) {
          if (cd - dt <= 0 || ally.markedForDeletion) eff.allyHitCooldowns.delete(ally);
          else eff.allyHitCooldowns.set(ally, cd - dt);
        }

        if (eff.timer <= 0) {
          this.hp = 0;
          this.markedForDeletion = true;
          return;
        }
        miracleEffect = eff;
      }
    }

    let targetEntity = player;
    if (miracleEffect) {
      const closestAlly = this.findClosestFellowEnemy(allEnemies);
      if (closestAlly) targetEntity = closestAlly;
    }

    const prevX = this.x;
    const prevY = this.y;

    if (isStunnedOrFrozen) {
      this.vx = 0;
      this.vy = 0;
      this.knockbackVx = 0;
      this.knockbackVy = 0;
    } else {
      let { moveVx, moveVy } = this.computeAIMovement(dt, targetEntity, miracleEffect, room, allEnemies);

      // Reducción de velocidad ambiental (ej. 50% al pisar un `PoisonPuddle` en v1.9) y slow elemental en Jefes
      const envSpeedMult =
        room && typeof room.getEntitySpeedMultiplier === 'function'
          ? room.getEntitySpeedMultiplier(this)
          : 1.0;
      moveVx *= envSpeedMult * bossSlowMult;
      moveVy *= envSpeedMult * bossSlowMult;

      // Mini-acelerón táctico de flanqueo (Colmena): cierra esquinas sin romper el techo máximo
      if (this.hiveLungeTimer > 0 && !this.isExhausted) {
        moveVx *= 1.42;
        moveVy *= 1.42;
      }

      // Tope absoluto de velocidad en caminata (impide que Berserk / BrotherEye superen al jugador)
      const isTelegraphedDash = (
        this.dashState === 'DASH' ||
        this.currentState === 'P1_WALL_DASH' ||
        this.currentState === 'P2_DASH_EXECUTE' ||
        this.currentState === 'P2_TRIANGLE_DASH' ||
        this.currentState === 'P1_SPEAR_LUNGE' ||
        this.currentState === 'P2_AMBUSH_BURROW'
      );
      if (!isTelegraphedDash) {
        const capTable = CONFIG.ENEMY_SPEED_CAPS;
        let walkCap = capTable.COMMON;
        if (this.isBoss) {
          walkCap = this.phase >= 2 ? capTable.BOSS_WALK_P2 : capTable.BOSS_WALK_P1;
          if (this.isBurrowed) walkCap = capTable.ABISMO_BURROW;
        } else if (this.isElite) {
          walkCap = (this.isBerserk || this.hiveLungeTimer > 0) ? capTable.BERSERK_MAX : capTable.ELITE;
        } else if (this.isFlying) {
          walkCap = this.isBerserk ? capTable.BERSERK_MAX : capTable.FLYER;
        } else if (this.isBerserk || this.hiveLungeTimer > 0) {
          walkCap = capTable.BERSERK_MAX;
        }
        const moveMag = Math.hypot(moveVx, moveVy);
        if (moveMag > walkCap && moveMag > 0) {
          const capScale = walkCap / moveMag;
          moveVx *= capScale;
          moveVy *= capScale;
        }
      }

      if (!miracleEffect) {
        // Optimización Fibonacci: el bucle O(N^2) de separación se recalcula en turnos escalonados
        if (this._fibRunThisFrame !== false || allEnemies.length <= 4 || this.cachedSepVx === undefined) {
          let sepVx = 0;
          let sepVy = 0;
          for (const other of allEnemies) {
            if (other === this || other.markedForDeletion) continue;
            const dx = this.x - other.x;
            const dy = this.y - other.y;
            const dist = Math.hypot(dx, dy);
            const minSep = this.radius + other.radius + 4;
            if (dist > 0 && dist < minSep) {
              const pushFactor = ((minSep - dist) / minSep) * 140;
              sepVx += (dx / dist) * pushFactor;
              sepVy += (dy / dist) * pushFactor;
            }
          }
          this.cachedSepVx = sepVx;
          this.cachedSepVy = sepVy;
        }
        moveVx += this.cachedSepVx || 0;
        moveVy += this.cachedSepVy || 0;
      }

      this.vx = moveVx + this.knockbackVx;
      this.vy = moveVy + this.knockbackVy;
      const currentKb = Math.hypot(this.knockbackVx, this.knockbackVy);
      this.knockbackVx *= Math.pow(0.001, dt);
      this.knockbackVy *= Math.pow(0.001, dt);

      // Movimiento tentativo en X con colisión de abismos (pits)
      const prevStepX = this.x;
      this.x += this.vx * dt;
      if (!this.isBoss && !this.isFlying && room && typeof room.isPointInPit === 'function' && room.isPointInPit(this.x, this.y, this.radius)) {
        if (currentKb > 110 && !this.isElite) {
          // ¡Empujado al abismo! Muerte instantánea por caída al vacío
          this.hp = 0;
          this.markedForDeletion = true;
          if (typeof room.spawnParticle === 'function') room.spawnParticle(this.x, this.y, '#020617', 14);
          if (player && player.ui) {
            player.ui.spawnFloatingText('¡AL VACÍO!', '#38bdf8', this.x, this.y - 20);
          }
          return;
        } else {
          this.x = prevStepX;
        }
      }

      // Movimiento tentativo en Y con colisión de abismos (pits)
      const prevStepY = this.y;
      this.y += this.vy * dt;
      if (!this.isBoss && !this.isFlying && room && typeof room.isPointInPit === 'function' && room.isPointInPit(this.x, this.y, this.radius)) {
        if (currentKb > 110 && !this.isElite) {
          this.hp = 0;
          this.markedForDeletion = true;
          if (typeof room.spawnParticle === 'function') room.spawnParticle(this.x, this.y, '#020617', 14);
          if (player && player.ui) {
            player.ui.spawnFloatingText('¡AL VACÍO!', '#38bdf8', this.x, this.y - 20);
          }
          return;
        } else {
          this.y = prevStepY;
        }
      }
    }

    const eb = (room && room.bounds) ? room.bounds : ROOM_BOUNDS;
    const clampedX = MathUtils.clamp(this.x, eb.left + this.radius, eb.right - this.radius);
    const clampedY = MathUtils.clamp(this.y, eb.top + this.radius, eb.bottom - this.radius);
    if (clampedX !== this.x) {
      this.x = clampedX;
      this.vx = 0;
    }
    if (clampedY !== this.y) {
      this.y = clampedY;
      this.vy = 0;
    }

    if (bleedEffect) {
      const distMoved = Math.hypot(this.x - prevX, this.y - prevY);
      const effectiveDist = this.isBoss ? Math.min(distMoved, 260 * dt) : distMoved;
      if (effectiveDist > 0) {
        const bleedAffinity = this.getElementalAffinityMultiplier('BLEED');
        this.applyDoTDamage(
          effectiveDist * bleedEffect.damagePerPixel * bleedAffinity * defenseMitigation,
          'BLEED'
        );
        if (this.markedForDeletion) return;
      }
    }

    if (miracleEffect) {
      const myMiracleAffinity = this.getElementalAffinityMultiplier('MIRACLE');
      for (const other of allEnemies) {
        if (other === this || other.markedForDeletion) continue;
        if (miracleEffect.allyHitCooldowns.has(other)) continue;

        if (MathUtils.circleCollision(this.x, this.y, this.radius, other.x, other.y, other.radius)) {
          const push = MathUtils.normalize(other.x - this.x, other.y - this.y);
          const rawFriendlyFire = Math.max(45, this.contactDamage * 3.2) * myMiracleAffinity;
          other.takeDamage(rawFriendlyFire, push.x * 220, push.y * 220, 'MIRACLE');
          miracleEffect.allyHitCooldowns.set(other, 0.25);

          if (other.hp <= 0 || other.markedForDeletion) {
            this.hp = 0;
            this.markedForDeletion = true;
            return;
          }
        }
      }
    }
  }

  drawBodyShape(ctx, fillStyle, strokeStyle, lineWidth) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = fillStyle;
    ctx.fill();
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = strokeStyle;
    ctx.stroke();
  }

  draw(ctx) {
    ctx.save();

    const hasFire = this.hasEffect('FIRE');
    const hasBleed = this.hasEffect('BLEED');
    const hasElectric = this.hasEffect('ELECTRIC');
    const hasIce = this.hasEffect('ICE');
    const hasPoison = this.hasEffect('POISON');
    const miracleEff = this.getEffect('MIRACLE');

    // Halo blanco / parpadeo del Ciclo de Invulnerabilidad (`HardRoom` v1.9)
    if (this.hasInvulnerabilityCycle) {
      if (this.isCycleInvulnerable) {
        const blink = Math.floor(this.aiTimer * 14) % 2 === 0;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius + 9, 0, Math.PI * 2);
        ctx.fillStyle = blink ? 'rgba(255, 255, 255, 0.35)' : 'rgba(226, 232, 240, 0.18)';
        ctx.fill();
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius + 7, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.32)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    if (hasPoison) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 6, 0, Math.PI * 2);
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (this.resistantElement && ELEMENTS[this.resistantElement]) {
      const resColor = ELEMENTS[this.resistantElement].color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 5, 0, Math.PI * 2);
      ctx.strokeStyle = resColor;
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    if (this.dashState === 'WINDUP' && !hasElectric && !hasIce) {
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x + this.dashTargetDir.x * 110, this.y + this.dashTargetDir.y * 110);
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.75)';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (miracleEff) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 9, 0, Math.PI * 2);
      ctx.strokeStyle = '#e879f9';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    this.drawLastSurvivorGlow(ctx);

    let bodyFill = this.color;
    if (this.hitFlashTimer > 0) {
      bodyFill = '#ffffff';
    } else if (hasIce) {
      bodyFill = '#38bdf8';
    } else if (hasElectric) {
      bodyFill = '#facc15';
    } else if (miracleEff) {
      bodyFill = '#d946ef';
    }

    const bodyStroke = hasFire
      ? '#ef4444'
      : hasBleed
      ? '#be123c'
      : this.isBoss
      ? '#facc15'
      : this.isLastSurvivor
      ? '#fde047'
      : '#14532d';

    this.drawBodyShape(ctx, bodyFill, bodyStroke, this.isBoss ? 3.5 : 2);

    if (this.weakElement && ELEMENTS[this.weakElement]) {
      const weakColor = ELEMENTS[this.weakElement].color;
      const r = Math.max(4, Math.min(6, this.radius * 0.38));
      ctx.beginPath();
      ctx.moveTo(this.x, this.y - r);
      ctx.lineTo(this.x + r, this.y);
      ctx.lineTo(this.x, this.y + r);
      ctx.lineTo(this.x - r, this.y);
      ctx.closePath();
      ctx.fillStyle = weakColor;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#0f172a';
      ctx.stroke();
    }

    const barW = Math.max(24, this.radius * 2);
    const barH = 4;
    const hpRatio = MathUtils.clamp(this.hp / this.maxHp, 0, 1);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(this.x - barW / 2, this.y - this.radius - 13, barW, barH);
    ctx.fillStyle = this.isElite ? '#e879f9' : '#4ade80';
    ctx.fillRect(this.x - barW / 2, this.y - this.radius - 13, barW * hpRatio, barH);

    this.drawStaminaBar(ctx, barW);

    if (this.freezeMeter > 0) {
      const freezeRatio = MathUtils.clamp(this.freezeMeter / this.maxFreezeMeter, 0, 1);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(this.x - barW / 2, this.y - this.radius - 18, barW, 3);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(this.x - barW / 2, this.y - this.radius - 18, barW * freezeRatio, 3);
    }

    if (miracleEff) {
      const miracleRatio = MathUtils.clamp(miracleEff.timer / 4.0, 0, 1);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(this.x - barW / 2, this.y - this.radius - 23, barW, 3);
      ctx.fillStyle = '#e879f9';
      ctx.fillRect(this.x - barW / 2, this.y - this.radius - 23, barW * miracleRatio, 3);
    }

    // Indicador visual de alerta de reacción inicial (! geométrico sin texto)
    if (this.reactionDelay > 0) {
      const alertY = this.y - this.radius - 23;
      ctx.fillStyle = '#facc15';
      ctx.strokeStyle = '#854d0e';
      ctx.lineWidth = 1;
      // Barra vertical del signo de admiración
      ctx.fillRect(this.x - 1.5, alertY, 3, 6);
      ctx.strokeRect(this.x - 1.5, alertY, 3, 6);
      // Punto inferior del signo de admiración
      ctx.beginPath();
      ctx.arc(this.x, alertY + 8.5, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  }

  drawLastSurvivorGlow(ctx) {
    if (!this.isLastSurvivor || this.markedForDeletion) return;
    const pulse = 0.55 + Math.sin((this.aiTimer || 0) * 10) * 0.3;
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius + 9 + pulse * 3, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(250, 204, 21, ${(0.22 * pulse).toFixed(3)})`;
    ctx.fill();
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
  }

  drawStaminaBar(ctx, barW) {
    if (this.isBoss || !this.maxStamina) return;
    const w = barW || Math.max(24, this.radius * 2);
    const ratio = MathUtils.clamp(this.stamina / this.maxStamina, 0, 1);
    const y = this.y - this.radius - 8;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(this.x - w / 2, y, w, 2.5);
    ctx.fillStyle = this.isExhausted ? '#ef4444' : '#f59e0b';
    ctx.fillRect(this.x - w / 2, y, w * ratio, 2.5);
  }
}

class ShooterEnemy extends Enemy {
  constructor(x, y, sectionNumber = 1, levelNumber = 1) {
    super(x, y, sectionNumber, levelNumber, 'SHOOTER');
    this.radius = 16;
    this.color = '#f97316';
    this.preferredDistance = 300;
    this.stopBandTolerance = 45;
    this.shootInterval = 1.65;
    this.shootTimer = 0.7 + Math.random() * 0.7;
    this.aimAngle = 0;
  }

  computeAIMovement(dt, targetEntity, miracleEffect, room, allEnemies) {
    const dx = targetEntity.x - this.x;
    const dy = targetEntity.y - this.y;
    const norm = MathUtils.normalize(dx, dy);
    const dist = norm.length;
    this.aimAngle = Math.atan2(norm.y, norm.x);

    if (miracleEffect) {
      this._fibRunThisFrame = true;
      return {
        moveVx: norm.x * this.speed * 1.35,
        moveVy: norm.y * this.speed * 1.35,
      };
    }

    const useHive = typeof HiveMindSystem !== 'undefined';
    let runLocalCheck = true;
    if (useHive) {
      runLocalCheck = HiveMindSystem.shouldRunLocalCheck(this);
      this._fibRunThisFrame = runLocalCheck;
    } else {
      this._fibRunThisFrame = true;
    }

    let moveVx = 0;
    let moveVy = 0;
    if (useHive) {
      let directive = this.cachedSteering;
      if (runLocalCheck || !directive) {
        directive = HiveMindSystem.computeTacticalDirective(this, targetEntity, room, allEnemies);
      }
      moveVx = directive.moveVx;
      moveVy = directive.moveVy;
    } else {
      const minIdealDist = this.preferredDistance - 20;
      const maxIdealDist = this.preferredDistance + this.stopBandTolerance;
      if (dist < minIdealDist) {
        moveVx = -norm.x * this.speed * 1.05;
        moveVy = -norm.y * this.speed * 1.05;
      } else if (dist > maxIdealDist) {
        moveVx = norm.x * this.speed * 0.85;
        moveVy = norm.y * this.speed * 0.85;
      }
    }

    const rangedMult = useHive && HiveMindSystem.interHiveNetwork
      ? (HiveMindSystem.interHiveNetwork.rangedCooldownMult || 1.0)
      : 1.0;

    this.shootTimer -= dt;
    if (this.shootTimer <= 0 && room && (!this.isExhausted || this.isLastSurvivor)) {
      const o = useHive ? HiveMindSystem.oracle : null;
      const isAggressiveVolley = Boolean((o && (o.syncExceptionActive || o.q.hiveBelow50Pct)) || this.isLastSurvivor);
      const projSpeed = isAggressiveVolley ? 345 : 315;
      const aimVec = (useHive && typeof HiveMindSystem.getPredictiveAim === 'function')
        ? HiveMindSystem.getPredictiveAim(this, targetEntity, projSpeed)
        : norm;
      const spawnX = this.x + aimVec.x * (this.radius + 8);
      const spawnY = this.y + aimVec.y * (this.radius + 8);

      if (isAggressiveVolley && this.stamina >= 32) {
        this.consumeStamina(32, 1.25);
        this.shootTimer = this.shootInterval * rangedMult * 0.92;
        const baseAng = Math.atan2(aimVec.y, aimVec.x);
        const spread = 0.14;
        for (const offset of [-spread, spread]) {
          const ax = Math.cos(baseAng + offset);
          const ay = Math.sin(baseAng + offset);
          room.enemyProjectiles.push(
            new EnemyProjectile(spawnX, spawnY, ax, ay, projSpeed, 14, 6)
          );
        }
      } else {
        this.consumeStamina(22, 1.1);
        this.shootTimer = this.shootInterval * rangedMult;
        room.enemyProjectiles.push(
          new EnemyProjectile(spawnX, spawnY, aimVec.x, aimVec.y, projSpeed, 14, 6)
        );
      }
    }

    return { moveVx, moveVy };
  }

  drawBodyShape(ctx, fillStyle, strokeStyle, lineWidth) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.aimAngle);

    ctx.fillStyle = '#7c2d12';
    ctx.strokeStyle = '#fdba74';
    ctx.lineWidth = 1.5;
    ctx.fillRect(this.radius * 0.4, -4, this.radius * 0.9, 8);
    ctx.strokeRect(this.radius * 0.4, -4, this.radius * 0.9, 8);

    const side = this.radius * 1.75;
    ctx.fillStyle = fillStyle;
    ctx.strokeStyle = strokeStyle === '#14532d' ? '#9a3412' : strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.fillRect(-side / 2, -side / 2, side, side);
    ctx.strokeRect(-side / 2, -side / 2, side, side);

    ctx.restore();
  }
}

class SplitterEnemy extends Enemy {
  constructor(x, y, sectionNumber = 1, levelNumber = 1, isMini = false, parentStats = null) {
    super(x, y, sectionNumber, levelNumber, 'ERRATIC');
    this.behaviorType = 'ERRATIC';
    this.isMini = isMini;
    this.hasSplit = false;
    this.color = isMini ? '#22d3ee' : '#0891b2';

    if (!isMini) {
      this.radius = 20;
      this.dropsCoin = false;
    } else if (parentStats) {
      this.radius = parentStats.radius * 0.5;
      this.maxHp = Math.max(1, Math.round(parentStats.maxHp * 0.5));
      this.hp = this.maxHp;
      this.speed = Math.min(CONFIG.ENEMY_SPEED_CAPS.SPLITTER_MINI, parentStats.speed * 1.15);
      this.defense = parentStats.defense;
      this.resistantElement = parentStats.resistantElement;
      this.weakElement = parentStats.weakElement;
      this.elementalAffinities = { ...parentStats.elementalAffinities };
      this.dropsCoin = true;
    }
  }

  spawnSplitChildren() {
    if (this.isMini || this.hasSplit) return [];
    this.hasSplit = true;

    const parentStats = {
      radius: this.radius,
      maxHp: this.maxHp,
      speed: this.speed,
      defense: this.defense,
      resistantElement: this.resistantElement,
      weakElement: this.weakElement,
      elementalAffinities: this.elementalAffinities,
    };

    const offsetDist = 16;
    const angle = Math.random() * Math.PI * 2;
    const dx = Math.cos(angle) * offsetDist;
    const dy = Math.sin(angle) * offsetDist;

    const child1 = new SplitterEnemy(
      MathUtils.clamp(this.x + dx, ROOM_BOUNDS.left + 14, ROOM_BOUNDS.right - 14),
      MathUtils.clamp(this.y + dy, ROOM_BOUNDS.top + 14, ROOM_BOUNDS.bottom - 14),
      this.sectionNumber,
      this.levelNumber,
      true,
      parentStats
    );
    child1.knockbackVx = Math.cos(angle) * 140;
    child1.knockbackVy = Math.sin(angle) * 140;

    const child2 = new SplitterEnemy(
      MathUtils.clamp(this.x - dx, ROOM_BOUNDS.left + 14, ROOM_BOUNDS.right - 14),
      MathUtils.clamp(this.y - dy, ROOM_BOUNDS.top + 14, ROOM_BOUNDS.bottom - 14),
      this.sectionNumber,
      this.levelNumber,
      true,
      parentStats
    );
    child2.knockbackVx = -Math.cos(angle) * 140;
    child2.knockbackVy = -Math.sin(angle) * 140;

    return [child1, child2];
  }

  drawBodyShape(ctx, fillStyle, strokeStyle, lineWidth) {
    const sides = 6;
    const rotOffset = this.aiTimer * 0.8;

    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = rotOffset + (i * Math.PI * 2) / sides;
      const vx = this.x + Math.cos(a) * this.radius;
      const vy = this.y + Math.sin(a) * this.radius;
      if (i === 0) ctx.moveTo(vx, vy);
      else ctx.lineTo(vx, vy);
    }
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = strokeStyle === '#14532d' ? '#cffafe' : strokeStyle;
    ctx.stroke();

    if (!this.isMini) {
      ctx.fillStyle = 'rgba(207, 250, 254, 0.75)';
      ctx.beginPath();
      ctx.arc(this.x - 5, this.y, 2.5, 0, Math.PI * 2);
      ctx.arc(this.x + 5, this.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * Minijefe Aleatorio (`EliteEnemy` - v1.5)
 * - Hereda de `Enemy`.
 * - Posee un aura visual distintiva (doble anillo pulsante dorado/púrpura y corona).
 * - Estadísticas potenciadas:
 *     - x1.5 de Vida Máxima (`CONFIG.ELITE_HP_MULT = 1.5`)
 *     - x2.0 de Velocidad de Movimiento (`CONFIG.ELITE_SPEED_MULT = 2.0`)
 * - Al morir, instancia un `RelicChest` en sus coordenadas exactas.
 */
class EliteEnemy extends Enemy {
  constructor(x, y, sectionNumber = 1, levelNumber = 1) {
    super(x, y, sectionNumber, levelNumber, 'ERRATIC');
    this.isElite = true;
    this.radius = 20;
    this.color = '#9333ea'; // Púrpura real élite

    // x1.5 de Vida Máxima y velocidad con tope táctico (Propuesta B)
    this.maxHp = Math.round(this.maxHp * CONFIG.ELITE_HP_MULT);
    this.hp = this.maxHp;
    this.speed = Math.min(CONFIG.ENEMY_SPEED_CAPS.ELITE, this.speed * CONFIG.ELITE_SPEED_MULT);
  }

  draw(ctx) {
    // Aura visual distintiva pulsante detrás del cuerpo del EliteEnemy
    ctx.save();
    const pulse = Math.sin(this.aiTimer * 7) * 4;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius + 10 + pulse, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(168, 85, 247, 0.24)';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#facc15';
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Corona geométrica dorada de 3 puntas sobre el EliteEnemy (Cero ctx.fillText)
    const cy = this.y - this.radius - 18;
    ctx.beginPath();
    ctx.moveTo(this.x - 10, cy + 4);
    ctx.lineTo(this.x - 8, cy - 5);
    ctx.lineTo(this.x - 3, cy);
    ctx.lineTo(this.x, cy - 7);
    ctx.lineTo(this.x + 3, cy);
    ctx.lineTo(this.x + 8, cy - 5);
    ctx.lineTo(this.x + 10, cy + 4);
    ctx.closePath();
    ctx.fillStyle = '#fde047';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#a16207';
    ctx.stroke();
    ctx.restore();

    super.draw(ctx);
  }
}

// ----------------------------------------------------------------------------
// 7B. ARQUITECTURA DE JEFES (FSM, ARMADURA DIRECCIONAL) Y GOLIAT (v1.6)
// ----------------------------------------------------------------------------

/**
 * Entidad de Suelo Agrietado (`CrackedGroundHazard`) dejada por Goliat en Fase 2
 * durante su Dash Explosivo. Explota tras 0.5 segundos causando daño en área y partículas.
 */

class FlyerEnemy extends Enemy {
  constructor(x, y, sectionNumber = 1, levelNumber = 1) {
    super(x, y, sectionNumber, levelNumber, 'ERRATIC');
    this.radius = 14;
    this.color = '#a855f7';
    this.isFlying = true;
    this.speed = Math.min(CONFIG.ENEMY_SPEED_CAPS.FLYER, 135 + (sectionNumber - 1) * 16);
    this.shootTimer = 1.2 + Math.random() * 1.5;
    this.maxHp = Math.round((38 + levelNumber * 12) * CONFIG.ENEMY_HP_MULTIPLIER * this.ngMult);
    this.hp = this.maxHp;
    this.contactDamage = Math.round(12 * this.ngMult);
  }

  update(dt, player, allEnemies, room) {
    super.update(dt, player, allEnemies, room);
    if (this.markedForDeletion || this.reactionDelay > 0) return;

    const rangedMult = typeof HiveMindSystem !== 'undefined' && HiveMindSystem.interHiveNetwork
      ? (HiveMindSystem.interHiveNetwork.rangedCooldownMult || 1.0)
      : 1.0;

    this.shootTimer -= dt;
    if (this.shootTimer <= 0 && (!this.isExhausted || this.isLastSurvivor)) {
      const useHive = typeof HiveMindSystem !== 'undefined';
      const fastShot = Boolean((useHive && HiveMindSystem.oracle && HiveMindSystem.oracle.syncExceptionActive) || this.isLastSurvivor);
      const projSpeed = fastShot ? 340 : 290;
      this.consumeStamina(20, 1.0);
      this.shootTimer = (2.5 + Math.random() * 0.8) * rangedMult;
      const aimVec = (useHive && typeof HiveMindSystem.getPredictiveAim === 'function')
        ? HiveMindSystem.getPredictiveAim(this, player, projSpeed)
        : MathUtils.normalize(player.x - this.x, player.y - this.y);
      if (room && room.enemyProjectiles) {
        room.enemyProjectiles.push(
          new EnemyProjectile(this.x, this.y, aimVec.x, aimVec.y, projSpeed, Math.round(14 * this.ngMult), 6, 'FlyerEnemy')
        );
        if (typeof room.spawnParticle === 'function') {
          room.spawnParticle(this.x, this.y, aimVec.x * 40, aimVec.y * 40, 3, '#c084fc', 0.3);
        }
      }
    }
  }

  draw(ctx) {
    this.drawLastSurvivorGlow(ctx);
    ctx.save();
    const wingFlap = Math.sin(this.aiTimer * 16) * 7;
    ctx.fillStyle = 'rgba(192, 132, 252, 0.45)';
    ctx.beginPath();
    ctx.ellipse(this.x - 12, this.y - 2 + wingFlap * 0.4, 9, 5 + Math.abs(wingFlap) * 0.5, -0.4, 0, Math.PI * 2);
    ctx.ellipse(this.x + 12, this.y - 2 + wingFlap * 0.4, 9, 5 + Math.abs(wingFlap) * 0.5, 0.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 16, 10, 4, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.hitFlashTimer > 0 ? '#ffffff' : this.color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = this.isLastSurvivor ? '#fde047' : '#e9d5ff';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(this.x, this.y - 1, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#581c87';
    ctx.fill();

    ctx.restore();
    this.drawStaminaBar(ctx);
  }
}

class ChargerEnemy extends Enemy {
  constructor(x, y, sectionNumber = 1, levelNumber = 1) {
    super(x, y, sectionNumber, levelNumber, 'CHASER');
    this.radius = 18;
    this.color = '#dc2626';
    this.state = 'PATROL';
    this.stateTimer = 0;
    this.chargeDir = { x: 0, y: 0 };
    this.chargeDistance = 0;
    this.maxHp = Math.round((55 + levelNumber * 16) * CONFIG.ENEMY_HP_MULTIPLIER * this.ngMult);
    this.hp = this.maxHp;
    this.contactDamage = Math.round(20 * this.ngMult);
  }

  takeDamage(rawDamage, kbVx = 0, kbVy = 0, element = 'NONE') {
    return super.takeDamage(rawDamage, kbVx * 0.6, kbVy * 0.6, element);
  }

  update(dt, player, allEnemies, room) {
    if (this.markedForDeletion) return;
    this.aiTimer += dt;
    this.updateStamina(dt);
    if (this.hiveLungeTimer > 0) this.hiveLungeTimer = Math.max(0, this.hiveLungeTimer - dt);
    if (this.hiveLungeCooldown > 0) this.hiveLungeCooldown = Math.max(0, this.hiveLungeCooldown - dt);
    if (this.reactionDelay > 0) {
      this.reactionDelay -= dt;
      return;
    }

    if (this.state === 'PATROL') {
      const dx = player.x - this.x;
      const dy = player.y - this.y;
      const dist = Math.hypot(dx, dy);

      const useHive = typeof HiveMindSystem !== 'undefined';
      const punishCharge = Boolean(
        this.isLastSurvivor ||
        (useHive && HiveMindSystem.subHives && HiveMindSystem.subHives.CHARGER && HiveMindSystem.subHives.CHARGER.directive === 'EMBESTIDA_CASTIGO') ||
        (useHive && HiveMindSystem.oracle && HiveMindSystem.oracle.syncExceptionActive)
      );
      const alignTol = punishCharge ? 40 : 28;

      if ((!this.isExhausted || this.isLastSurvivor) && dist < 440 && (Math.abs(dx) < alignTol || Math.abs(dy) < alignTol)) {
        this.state = 'WINDUP';
        this.stateTimer = punishCharge ? 0.25 : 0.42;
        this.chargeDir = MathUtils.normalize(dx, dy);
        this.vx = 0;
        this.vy = 0;
        return;
      }

      if (useHive) {
        const runCheck = HiveMindSystem.shouldRunLocalCheck(this);
        if (runCheck || !this.cachedSteering) {
          HiveMindSystem.computeTacticalDirective(this, player, room, allEnemies);
        }
        const dir = this.cachedSteering;
        const speedScale = 85 / Math.max(1, this.speed);
        this.vx = (dir ? dir.moveVx * speedScale : 0);
        this.vy = (dir ? dir.moveVy * speedScale : 0);
      } else {
        const norm = MathUtils.normalize(dx, dy);
        this.vx = norm.x * 85;
        this.vy = norm.y * 85;
      }
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    } else if (this.state === 'WINDUP') {
      this.stateTimer -= dt;
      this.vx = 0;
      this.vy = 0;
      if (this.stateTimer <= 0) {
        this.consumeStamina(42, 1.4);
        this.state = 'CHARGE';
        this.chargeDistance = 0;
      }
    } else if (this.state === 'CHARGE') {
      const chargeSpeed = 480;
      this.vx = this.chargeDir.x * chargeSpeed;
      this.vy = this.chargeDir.y * chargeSpeed;

      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.chargeDistance += chargeSpeed * dt;

      const b = (room && room.bounds) ? room.bounds : ROOM_BOUNDS;
      const hitWall =
        this.x - this.radius <= b.left ||
        this.x + this.radius >= b.right ||
        this.y - this.radius <= b.top ||
        this.y + this.radius >= b.bottom;

      const hitPit = room && typeof room.isPointInPit === 'function' && room.isPointInPit(this.x, this.y, this.radius);

      if (hitWall || hitPit || this.chargeDistance >= 450) {
        this.state = 'STUNNED';
        this.stateTimer = 0.75;
        this.vx = 0;
        this.vy = 0;
        this.x = MathUtils.clamp(this.x, b.left + this.radius, b.right - this.radius);
        this.y = MathUtils.clamp(this.y, b.top + this.radius, b.bottom - this.radius);
        if (hitWall && room && typeof room.spawnParticle === 'function') {
          for (let i = 0; i < 6; i++) {
            room.spawnParticle(this.x, this.y, (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 80, 4, '#cbd5e1', 0.3);
          }
        }
      }
    } else if (this.state === 'STUNNED') {
      this.stateTimer -= dt;
      this.vx = 0;
      this.vy = 0;
      if (this.stateTimer <= 0) {
        this.state = 'PATROL';
      }
    }

    if (this.hitFlashTimer > 0) this.hitFlashTimer -= dt;
  }

  draw(ctx) {
    this.drawLastSurvivorGlow(ctx);
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.hitFlashTimer > 0 ? '#ffffff' : this.color;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = this.isLastSurvivor ? '#fde047' : (this.state === 'WINDUP' ? '#fef08a' : '#7f1d1d');
    ctx.stroke();

    const facingAngle = Math.atan2(this.chargeDir.y || 1, this.chargeDir.x || 0);
    ctx.translate(this.x, this.y);
    ctx.rotate(facingAngle);

    ctx.fillStyle = '#450a0a';
    ctx.fillRect(this.radius * 0.4, -this.radius * 0.6, 6, this.radius * 1.2);

    ctx.beginPath();
    ctx.moveTo(this.radius * 0.5, -this.radius * 0.7);
    ctx.lineTo(this.radius * 1.1, -this.radius * 0.9);
    ctx.moveTo(this.radius * 0.5, this.radius * 0.7);
    ctx.lineTo(this.radius * 1.1, this.radius * 0.9);
    ctx.strokeStyle = '#f87171';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    if (this.state === 'WINDUP') {
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 6, 0, Math.PI * 2);
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
    this.drawStaminaBar(ctx);
  }
}

window.Enemy = Enemy;
window.ShooterEnemy = ShooterEnemy;
window.SplitterEnemy = SplitterEnemy;
window.EliteEnemy = EliteEnemy;
window.FlyerEnemy = FlyerEnemy;
window.ChargerEnemy = ChargerEnemy;
window.Coin = Coin;
window.VoidGem = VoidGem;
window.KeyItem = KeyItem;
window.HeartItem = HeartItem;
window.ItemPedestal = ItemPedestal;

class CrackedGroundHazard extends Entity {
  constructor(x, y, radius = 44, damage = 20, delay = 0.5) {
    super(x, y, radius, '#ef4444');
    this.damage = damage;
    this.timer = delay;
    this.maxDelay = delay;
    this.exploded = false;
    this.postBlastTimer = 0.22;
  }

  update(dt, player, room) {
    if (!this.exploded) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.exploded = true;
        if (
          MathUtils.circleCollision(
            this.x,
            this.y,
            this.radius,
            player.x,
            player.y,
            player.radius
          )
        ) {
          player.takeDamage(this.damage, room, { sourceArchetype: 'Hazard' });
        }
        for (let i = 0; i < 10; i++) {
          const ang = (Math.PI * 2 * i) / 10 + Math.random() * 0.3;
          const spd = 80 + Math.random() * 110;
          room.spawnParticle(
            this.x,
            this.y,
            Math.cos(ang) * spd,
            Math.sin(ang) * spd,
            4.5,
            '#f97316',
            0.4
          );
        }
      }
    } else {
      this.postBlastTimer -= dt;
      if (this.postBlastTimer <= 0) {
        this.markedForDeletion = true;
      }
    }
  }

  draw(ctx) {
    ctx.save();
    if (!this.exploded) {
      const progress = 1 - Math.max(0, this.timer / this.maxDelay);
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(239, 68, 68, ${0.15 + progress * 0.35})`;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#f97316';
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      const alpha = Math.max(0, this.postBlastTimer / 0.22);
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius * 1.15, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(251, 146, 60, ${alpha * 0.65})`;
      ctx.fill();
    }
    ctx.restore();
  }
}

/**
 * Entidad de Anillo Expansivo (`ExpandingRingHazard`) emitida por Goliat en Fase 2
 * al aterrizar de su Salto de Anillos en el centro de la sala.
 * La hitbox es una corona circular (`|dist - currentRadius| <= thickness`).
 */
class ExpandingRingHazard extends Entity {
  constructor(x, y, startDelay = 0, expansionSpeed = 235, maxRadius = 460, damage = 18) {
    super(x, y, 12, '#f43f5e');
    this.startDelay = startDelay;
    this.currentRadius = 18;
    this.expansionSpeed = expansionSpeed;
    this.maxRadius = maxRadius;
    this.ringThickness = 14;
    this.damage = damage;
    this.hasHitPlayer = false;
  }

  update(dt, player, room) {
    if (this.startDelay > 0) {
      this.startDelay -= dt;
      return;
    }

    this.currentRadius += this.expansionSpeed * dt;
    if (this.currentRadius >= this.maxRadius) {
      this.markedForDeletion = true;
      return;
    }

    if (!this.hasHitPlayer && player) {
      const dist = Math.hypot(player.x - this.x, player.y - this.y);
      const radialDiff = Math.abs(dist - this.currentRadius);
      if (radialDiff <= this.ringThickness + player.radius * 0.7) {
        const isDashing = typeof CombatSystem !== 'undefined' && CombatSystem.isPlayerDashing(player);
        const isParrying = (typeof WeaponSystem !== 'undefined')
          ? WeaponSystem.isWeaponParrying(player.currentWeapon)
          : Boolean(
              player.currentWeapon &&
              player.currentWeapon.mode === 0 &&
              player.currentWeapon.swingTimer > 0
            );
        if (isDashing || isParrying) {
          this.hasHitPlayer = true;
          CombatSystem.triggerPerfectDodge(player, room, player.x, player.y, '⚡ ANILLO EVADIDO');
        } else {
          this.hasHitPlayer = true;
          player.takeDamage(this.damage, room, { sourceArchetype: 'GoliatBoss' });
        }
      }
    }
  }

  draw(ctx) {
    if (this.startDelay > 0) return;
    ctx.save();
    const alpha = Math.max(0.2, 1 - this.currentRadius / this.maxRadius);
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.currentRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(244, 63, 94, ${(alpha * 0.75).toFixed(2)})`;
    ctx.lineWidth = this.ringThickness;
    ctx.stroke();

    // Borde interior cian/blanco de alto contraste (comunica patrón saltable con Dash)
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.currentRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(186, 230, 253, ${alpha.toFixed(2)})`;
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Clase Base `Boss` (Hereda de `Enemy` - v2.9)
 * Implementa:
 *  - Transición de Fases con Phase Gate estricto al 50% de HP.
 *  - Soft Boss Armor (DPS Cap suave anti-evaporación para builds rotas).
 *  - Ventanas de Fatiga/Castigo (`isStaggered`, +25% daño recibido) y Animación Wind-Up.
 *  - Máquina de Estados Finita (FSM) + Telegrafiados codificados por color/forma.
 *  - Armadura Direccional (`hasFrontalArmor`, `facingAngle`, `frontalDamageMultiplier`).
 */
class Boss extends Enemy {
  constructor(x, y, sectionNumber = 1, levelNumber = 1, bossTitle = 'JEFE') {
    super(x, y, sectionNumber, levelNumber, 'BOSS_MIXED');
    this.isBoss = true;
    this.bossTitle = bossTitle;
    this.radius = 34;
    // Escalado v2.1 de Jefe: En Modo Mortal multiplica por (4 * ngPlusLevel); en modo normal usa (1 + ngPlusLevel)
    this.ngMult = isMortalMode ? (4 * ngPlusLevel) : (1 + ngPlusLevel);
    // Propuesta B: Velocidad desacoplada del HP/daño para garantizar maniobrabilidad táctica
    this.ngSpeedMult = isMortalMode
      ? Math.min(1.6, 1 + ngPlusLevel * 0.12)
      : Math.min(1.4, 1 + ngPlusLevel * 0.06);

    // Escalado de salud y daño de Jefe según `ngPlusLevel`
    const baseBossHp = 620 + levelNumber * 120 + (sectionNumber - 1) * 280;
    this.maxHp = Math.round(baseBossHp * CONFIG.ENEMY_HP_MULTIPLIER * this.ngMult);
    if (window.bossPhaseManager) {
      window.bossPhaseManager.tuneBossHp(this);
    }
    this.hp = this.maxHp;
    this.contactDamage = Math.round(25 * this.ngMult);
    const baseBossSpeed = 110 + ((sectionNumber - 1) * 4 + levelNumber) * 4;
    this.speed = Math.min(CONFIG.ENEMY_SPEED_CAPS.BOSS_WALK_P1, baseBossSpeed * this.ngSpeedMult);

    // Un Jefe jamás hereda el ciclo de invulnerabilidad aleatorio de HardRoom
    this.hasInvulnerabilityCycle = false;
    this.isCycleInvulnerable = false;

    // Sistema de Fases (al 50% de HP dispara onPhaseChange con Phase Gate duro)
    this.phase = 1;
    this.phaseChanged = false;

    // Máquina de Estados (FSM), Wind-Up y Telegrafiado
    this.currentState = 'IDLE';
    this.stateTimer = 1.0;
    this.telegraphs = []; // Indicadores de peligro en el suelo [{ type: 'CIRCLE'|'LINE', ... }]
    this.invulnerableTimer = 0;
    this.isWindup = false;
    this.windupProgress = 0;
    this.windupColor = '#f59e0b';
    this.windupFlashPlayed = false;

    // Ventana de Castigo / Fatiga (`isStaggered`) y Soft Boss Armor (DPS Cap)
    this.isStaggered = false;
    this.staggerVulnerableMult = 1.0;
    this.dpsMeter = 0;
    this.lastDpsArmorRatio = 1.0;

    // Estados especiales de Jefes v1.8
    this.isBurrowed = false; // Abismo: Invulnerable bajo tierra + Z-Index lógico
    this.isGuarding = false; // Serafín: Guardia de contraataque
    this.orbitShields = []; // Némesis: 4 escudos orbitales en Fase 2

    // Armadura Direccional Frontal
    this.facingAngle = Math.PI / 2;
    this.hasFrontalArmor = false;
    this.frontalDamageMultiplier = 0.2; // 80% de reducción frontal (recibe 20%)
    this.lastHitWasBlocked = false;

    // Estamina Universal v3.5 para Jefes
    this.maxStamina = 160 + Math.max(0, sectionNumber - 1) * 20;
    this.stamina = this.maxStamina;
    this.staminaRegen = 30;
    this.isExhausted = false;
    this.staminaRegenDelayTimer = 0;
  }

  getDefenseStatusText() {
    if (this.isBurrowed) return 'Bajo Tierra (INVULNERABLE)';
    if (this.isGuarding) return 'Guardia Celestial (CONTRAATAQUE)';
    if (this.isStaggered) return '¡ATURDIDO / EXPUESTO (+25% DMG)!';
    if (this.isExhausted) return '¡SIN ESTAMINA (RECUPERANDO)!';
    if (this.orbitShields && this.orbitShields.length > 0) {
      return this.orbitExpanded ? 'Escudos Abiertos (¡VULNERABLE!)' : '4 Escudos Orbitales + Clon';
    }
    if (this.hasFrontalArmor) return 'Escudo Frontal Activo (-80% DMG)';
    if (this.lastDpsArmorRatio < 0.82) {
      return `Armadura Anti-Burst (${Math.round(this.lastDpsArmorRatio * 100)}% DMG)`;
    }
    return this.phase === 2 ? 'Fase 2 Desatada (100% DMG)' : 'Vulnerable (100% DMG)';
  }

  /**
   * Cambia el estado actual de la Máquina de Estados (FSM) y limpia telegrafiados previos.
   */
  transitionToState(newState, duration = 1.0) {
    this.currentState = newState;
    const exhaustedSlow = this.isExhausted && (newState.includes('IDLE') || newState.includes('NEUTRAL') || newState.includes('CHASE')) ? 1.35 : 1.0;
    this.stateTimer = duration * exhaustedSlow;
    this.telegraphs = [];
    this.isWindup = false;
    this.windupProgress = 0;
    this.windupFlashPlayed = false;
    if (!newState.includes('STUNNED') && !newState.includes('RECOVERY') && !newState.includes('EXHAUSTED')) {
      this.isStaggered = false;
      this.staggerVulnerableMult = 1.0;
    }

    // Consumo de estamina del Jefe al ejecutar habilidades activas o telegrafiados ofensivos
    const isPassiveState =
      newState === 'IDLE' ||
      newState === 'NEUTRAL' ||
      newState.includes('STUNNED') ||
      newState.includes('RECOVERY') ||
      newState.includes('EXHAUSTED') ||
      newState.includes('CHASE');
    if (!isPassiveState) {
      const heavySkill =
        newState.includes('DASH') ||
        newState.includes('SLAM') ||
        newState.includes('BEAM') ||
        newState.includes('STORM') ||
        newState.includes('METEOR') ||
        newState.includes('LAVA');
      this.consumeStamina(heavySkill ? 34 : 20, 1.35);
    }

    if (newState.includes('TELEGRAPH') || newState.includes('WINDUP')) {
      if (typeof soundManager !== 'undefined' && soundManager) {
        soundManager.playProcedural('telegraph', { volume: 0.35 });
      }
    }
    if (this.onBossStateChanged) {
      this.onBossStateChanged(this);
    }
  }

  setWindup(active, progress = 0, color = '#f59e0b') {
    this.isWindup = Boolean(active);
    this.windupProgress = MathUtils.clamp(progress, 0, 1);
    this.windupColor = color;
    if (this.isWindup && this.windupProgress >= 0.82 && !this.windupFlashPlayed) {
      this.windupFlashPlayed = true;
      if (typeof soundManager !== 'undefined' && soundManager) {
        soundManager.playProcedural('boss_flash', { volume: 0.42 });
      }
    }
  }

  /**
   * Registra un indicador visual de peligro (Telegrafiado) para ser dibujado en el Canvas.
   */
  addTelegraph(telegraphConfig) {
    this.telegraphs.push(telegraphConfig);
  }

  /**
   * Evento disparado automáticamente cuando el HP del Jefe baja al 50% o menos.
   * Las subclases sobrescriben este método para alterar patrones, color y velocidad.
   */
  onPhaseChange() {
    this.phase = 2;
    this.isStaggered = false;
    this.staggerVulnerableMult = 1.0;
    this.dpsMeter = 0;
    this.lastDpsArmorRatio = 1.0;
    this.stamina = this.maxStamina;
    this.isExhausted = false;
    this.staminaRegenDelayTimer = 0;
    if (this.onBossStateChanged) {
      this.onBossStateChanged(this);
    }
  }

  getDpsSoftThreshold() {
    return Math.max(105, this.maxHp * 0.14);
  }

  applyBurstCappedDamage(postMitigationDamage) {
    if (postMitigationDamage <= 0) return 0;
    const threshold = this.getDpsSoftThreshold();
    if (this.dpsMeter <= threshold) {
      this.dpsMeter += postMitigationDamage;
      this.lastDpsArmorRatio = 1.0;
      return postMitigationDamage;
    }
    const overload = (this.dpsMeter - threshold) / threshold;
    const armorMult = Math.max(0.24, 1 / (1 + overload * 0.85));
    const capped = Math.max(1, postMitigationDamage * armorMult);
    this.dpsMeter += capped;
    this.lastDpsArmorRatio = armorMult;
    return capped;
  }

  handlePhaseGateAndHealthClamp(prevHp) {
    const phaseThreshold = Math.ceil(this.maxHp * 0.5);
    if (!this.phaseChanged && prevHp > phaseThreshold && this.hp <= phaseThreshold) {
      // Phase Gate estricto: ningún golpe/DoT único puede evaporar la Fase 2
      this.hp = phaseThreshold;
      this.markedForDeletion = false;
      this.phaseChanged = true;
      this.phase = 2;
      if (window.bossPhaseManager) {
        const room = (window.activeGameInstance && window.activeGameInstance.currentRoom) ? window.activeGameInstance.currentRoom : null;
        const player = (window.activeGameInstance && window.activeGameInstance.player) ? window.activeGameInstance.player : null;
        window.bossPhaseManager.triggerPhaseShift(this, room, player);
      }
      this.onPhaseChange();
      return true;
    }
    if (!this.phaseChanged && this.hp > 0 && this.hp <= this.maxHp * 0.5) {
      this.phaseChanged = true;
      this.phase = 2;
      if (window.bossPhaseManager) {
        const room = (window.activeGameInstance && window.activeGameInstance.currentRoom) ? window.activeGameInstance.currentRoom : null;
        const player = (window.activeGameInstance && window.activeGameInstance.player) ? window.activeGameInstance.player : null;
        window.bossPhaseManager.triggerPhaseShift(this, room, player);
      }
      this.onPhaseChange();
      return true;
    }
    return false;
  }

  update(dt, player, allEnemies, room) {
    // Decrementar siempre la invulnerabilidad temporal (ej. transformación Fase 2 de boss_phases.js)
    // para que ningún Jefe (Abismo/Serafín/Goliat/Némesis) quede invulnerable en Fase 2
    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer = Math.max(0, this.invulnerableTimer - dt);
    }
    this.hasInvulnerabilityCycle = false;
    this.isCycleInvulnerable = false;

    const threshold = this.getDpsSoftThreshold();
    this.dpsMeter = Math.max(0, this.dpsMeter - threshold * dt);
    if (this.dpsMeter <= threshold * 0.85) {
      this.lastDpsArmorRatio = 1.0;
    }

    // Presión de Colmena sobre Jefes: acorta pausas/enfriamientos cuando el jugador está sin estamina o arrinconado
    if (typeof HiveMindSystem !== 'undefined' && typeof HiveMindSystem.getBossPressureMult === 'function' && !this.isStaggered && this.stateTimer > 0) {
      const pressMult = HiveMindSystem.getBossPressureMult(this);
      if (pressMult > 1.0) {
        this.stateTimer = Math.max(0.01, this.stateTimer - dt * (pressMult - 1.0));
      }
    }

    super.update(dt, player, allEnemies, room);
  }

  applyDoTDamage(rawAmount, element = 'NONE') {
    if (this.invulnerableTimer > 0 || this.isBurrowed || this.isGuarding || this.markedForDeletion || rawAmount <= 0) {
      return 0;
    }
    const prevHp = this.hp;
    const capped = this.applyBurstCappedDamage(rawAmount);
    this.hp -= capped;
    this.handlePhaseGateAndHealthClamp(prevHp);
    if (this.hp <= 0) {
      this.hp = 0;
      this.markedForDeletion = true;
      if (window.synergyEngine) {
        const room = (window.activeGameInstance && window.activeGameInstance.currentRoom) ? window.activeGameInstance.currentRoom : null;
        const player = (window.activeGameInstance && window.activeGameInstance.player) ? window.activeGameInstance.player : null;
        window.synergyEngine.onEnemyKilled(this, room, player);
      }
    }
    if (this.onBossStateChanged) {
      this.onBossStateChanged(this);
    }
    return capped;
  }

  /**
   * Sobrescribe `takeDamage` para calcular Armadura Direccional, Ventana de Castigo (+25%),
   * Soft Boss Armor (anti-burst) y Phase Gate duro en el 50% de HP.
   */
  takeDamage(rawDamage, kbVx = 0, kbVy = 0, element = 'NONE') {
    if (this.invulnerableTimer > 0 || this.isBurrowed || this.isGuarding || this.markedForDeletion) {
      return 0;
    }

    let directionalMultiplier = 1.0;
    this.lastHitWasBlocked = false;

    if (this.hasFrontalArmor && (kbVx !== 0 || kbVy !== 0)) {
      const impactDir = MathUtils.normalize(kbVx, kbVy);
      const toAttackerX = -impactDir.x;
      const toAttackerY = -impactDir.y;

      const facingX = Math.cos(this.facingAngle);
      const facingY = Math.sin(this.facingAngle);

      const dotProduct = facingX * toAttackerX + facingY * toAttackerY;
      if (dotProduct > 0) {
        directionalMultiplier = this.frontalDamageMultiplier; // 0.20 (80% mitigado)
        this.lastHitWasBlocked = true;
      }
    }

    const staggerMult = this.isStaggered ? (this.staggerVulnerableMult || 1.25) : 1.0;
    const isAstralWeakened = this.hasEffect('MIRACLE_BOSS') ? 1.2 : 1.0;
    const scaledIncoming = rawDamage * directionalMultiplier * staggerMult * isAstralWeakened;
    const cappedIncoming = this.applyBurstCappedDamage(scaledIncoming);
    const prevHp = this.hp;

    const dealt = super.takeDamage(
      cappedIncoming,
      kbVx * 0.25,
      kbVy * 0.25,
      element
    );

    this.handlePhaseGateAndHealthClamp(prevHp);

    if (this.onBossStateChanged) {
      this.onBossStateChanged(this);
    }

    return dealt;
  }

  drawBodyShape(ctx, fillStyle, strokeStyle, lineWidth) {
    ctx.save();
    let jx = 0;
    let jy = 0;
    let scaleX = 1;
    let scaleY = 1;

    if (this.isWindup && this.windupProgress > 0) {
      const shakeMag = this.windupProgress * 3.5;
      jx = (Math.random() - 0.5) * 2 * shakeMag;
      jy = (Math.random() - 0.5) * 2 * shakeMag;
      scaleX = 1 - this.windupProgress * 0.22;
      scaleY = 1 + this.windupProgress * 0.22;
    } else if (this.isStaggered) {
      const pant = 1 + Math.sin(this.aiTimer * 12) * 0.06;
      scaleX = pant;
      scaleY = 1 / pant;
    }

    ctx.translate(this.x + jx, this.y + jy);
    ctx.rotate(this.facingAngle);
    ctx.scale(scaleX, scaleY);

    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = fillStyle;
    ctx.fill();
    ctx.lineWidth = this.isStaggered ? 4 : lineWidth;
    ctx.strokeStyle = this.isStaggered ? '#38bdf8' : strokeStyle;
    ctx.stroke();

    // Flash de impacto inminente en los últimos 180ms del windup
    if (this.isWindup && this.windupProgress >= 0.80) {
      const flashAlpha = (Math.sin(this.aiTimer * 45) * 0.5 + 0.5) * 0.85 + 0.15;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 7, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 255, 255, ${flashAlpha.toFixed(2)})`;
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Renderiza todos los indicadores de peligro (Telegrafiado) en el suelo antes del cuerpo.
   */
  drawTelegraphs(ctx) {
    if (window.bossPhaseManager) {
      window.bossPhaseManager.drawEnrageAura(ctx, this);
    }
    if (this.telegraphs.length === 0) return;

    ctx.save();
    for (const tel of this.telegraphs) {
      if (tel.type === 'CIRCLE') {
        const progress = tel.progress !== undefined ? tel.progress : 0.5;
        const isTeleport = tel.style === 'TELEPORT';
        const isWindupGuard = tel.style === 'GUARD';
        const baseRgb = isTeleport
          ? '56, 189, 248'
          : isWindupGuard
          ? '250, 204, 21'
          : '245, 158, 11';
        const strokeHex = isTeleport
          ? '#38bdf8'
          : isWindupGuard
          ? '#fde047'
          : (progress >= 0.82 ? '#ffffff' : '#f59e0b');

        ctx.beginPath();
        ctx.arc(tel.x, tel.y, tel.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${baseRgb}, ${(0.14 + progress * 0.24).toFixed(2)})`;
        ctx.fill();
        ctx.lineWidth = progress >= 0.82 ? 3.5 : 2.5;
        ctx.strokeStyle = strokeHex;
        ctx.setLineDash([8, 6]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Círculo interno creciente (o convergente para teletransporte)
        const innerR = isTeleport
          ? Math.max(4, tel.radius * (1 - MathUtils.clamp(progress, 0, 1)))
          : tel.radius * MathUtils.clamp(progress, 0, 1);
        ctx.beginPath();
        ctx.arc(tel.x, tel.y, innerR, 0, Math.PI * 2);
        ctx.strokeStyle = progress >= 0.82 ? '#ffffff' : `rgba(${baseRgb}, 0.9)`;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      } else if (tel.type === 'LINE') {
        const isPrimary = tel.active !== false;
        const lineRgb = isPrimary ? '245, 158, 11' : '244, 63, 94';
        ctx.beginPath();
        ctx.moveTo(tel.x1, tel.y1);
        ctx.lineTo(tel.x2, tel.y2);
        ctx.strokeStyle = `rgba(${lineRgb}, ${isPrimary ? 0.34 : 0.14})`;
        ctx.lineWidth = tel.width || 60;
        ctx.lineCap = 'round';
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(tel.x1, tel.y1);
        ctx.lineTo(tel.x2, tel.y2);
        ctx.strokeStyle = isPrimary ? '#fbbf24' : 'rgba(244, 63, 94, 0.55)';
        ctx.lineWidth = isPrimary ? 4 : 2;
        ctx.setLineDash([10, 6]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Punta de flecha direccional geométrica (0 ctx.fillText) para leer el sentido al instante
        if (isPrimary && tel.arrow !== false) {
          const ang = Math.atan2(tel.y2 - tel.y1, tel.x2 - tel.x1);
          const midX = (tel.x1 + tel.x2) * 0.5;
          const midY = (tel.y1 + tel.y2) * 0.5;
          const headSize = 13;
          ctx.beginPath();
          ctx.moveTo(midX + Math.cos(ang) * headSize, midY + Math.sin(ang) * headSize);
          ctx.lineTo(midX + Math.cos(ang + 2.4) * headSize, midY + Math.sin(ang + 2.4) * headSize);
          ctx.lineTo(midX + Math.cos(ang - 2.4) * headSize, midY + Math.sin(ang - 2.4) * headSize);
          ctx.closePath();
          ctx.fillStyle = '#fef08a';
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }
}

/**
 * IMPLEMENTACIÓN COMPLETA v1.6: `GoliatBoss` (GOLIAT, EL ÚLTIMO BASTIÓN)
 * - Defensa Base (Fase 1): Escudo Frontal con 80% de reducción de daño (`dot > 0`).
 *   Los ataques por la espalda (`dot <= 0`) infligen el 100% del daño.
 * - Fase 1 (Tanque Lento):
 *    1. `P1_MARCH` (Marcha): Avanza lento hacia el jugador disparando proyectiles en abanico.
 *    2. `P1_HAMMER_TELEGRAPH` -> `P1_HAMMER_IMPACT` (Martillo Sísmico): Se detiene, dibuja un
 *       círculo rojo de peligro en el piso durante 1s y luego ejecuta daño en área + onda expansiva.
 *    3. `P1_WALL_TELEGRAPH` -> `P1_WALL_DASH` (Muralla): Dibuja una línea recta roja gruesa
 *       durante 1s y luego embiste a alta velocidad por esa línea causando gran daño y knockback.
 * - Fase 2 (Agresiva - al 50% de HP):
 *    - Cambia su color/sprite a Carmesí/Magma, pierde el escudo frontal (`hasFrontalArmor = false`)
 *      y duplica su velocidad base (`speed *= 2`).
 *    1. `P2_EXPLOSIVE_DASH` (Dash Explosivo): Dashes consecutivos hacia el jugador dejando
 *       entidades `CrackedGroundHazard` que explotan tras 0.5s con daño y partículas.
 *    2. `P2_RING_JUMP_AIR` -> `P2_RING_LAND` (Salto de Anillos): Cada 3 dashes, salta al centro
 *       (invulnerable 1s) y al caer emite 3 anillos expansivos (`ExpandingRingHazard`).
 */
class GoliatBoss extends Boss {
  constructor(x, y, sectionNumber = 1, levelNumber = 1) {
    super(x, y, sectionNumber, levelNumber, 'GOLIAT, EL ÚLTIMO BASTIÓN');
    this.radius = 34;
    this.color = '#475569'; // Acero pesado de bastión en Fase 1

    this.basePhase1Speed = Math.min(180, 62 * this.ngSpeedMult);
    this.speed = this.basePhase1Speed;
    this.contactDamage = Math.round(24 * this.ngMult);

    // Activar Armadura Frontal del 80% en Fase 1
    this.hasFrontalArmor = true;
    this.frontalDamageMultiplier = 0.2;
    this.turnRate = 1.45; // Giro lento del escudo en rad/s para permitir flanqueo por la espalda

    // Variables de Fase 1
    this.fanShootTimer = 0.9;
    this.hammerRadius = 140;
    this.hammerVisualExpand = 0;
    this.wallDashDir = { x: 0, y: 1 };
    this.wallDashSpeed = 640;
    this.wallDashHasHitPlayer = false;

    // Variables de Fase 2
    this.p2DashCount = 0;
    this.p2DashDir = { x: 0, y: 1 };
    this.p2DashSpeed = 510;
    this.hazardSpawnTimer = 0;

    this.transitionToState('P1_MARCH', 3.2);
  }

  /**
   * Transición a Fase 2 al caer al 50% de HP:
   * Cambia de color, pierde el escudo frontal y duplica su velocidad base.
   */
  onPhaseChange() {
    super.onPhaseChange();
    this.color = '#dc2626'; // Carmesí incandescente en Fase 2
    this.hasFrontalArmor = false; // Pierde el escudo frontal (daño normal desde todos los ángulos)
    this.speed = Math.min(CONFIG.ENEMY_SPEED_CAPS.BOSS_WALK_P2, this.basePhase1Speed * 2.0);
    this.p2DashCount = 0;
    this.transitionToState('P2_PREPARE_DASH', 0.6);
  }

  rotateFacingTowards(targetX, targetY, dt, maxTurnSpeed = this.turnRate) {
    const desiredAngle = Math.atan2(targetY - this.y, targetX - this.x);
    const diff = MathUtils.angleDiff(desiredAngle, this.facingAngle);
    this.facingAngle += MathUtils.clamp(diff, -maxTurnSpeed * dt, maxTurnSpeed * dt);
  }

  computeAIMovement(dt, targetEntity, miracleEffect, room) {
    this.stateTimer -= dt;
    if (this.hammerVisualExpand > 0) {
      this.hammerVisualExpand = Math.max(0, this.hammerVisualExpand - dt);
    }

    let moveVx = 0;
    let moveVy = 0;
    const rb = (room && room.bounds) ? room.bounds : ROOM_BOUNDS;

    // ========================================================================
    // MÁQUINA DE ESTADOS - FASE 1 (TANQUE LENTO CON ESCUDO FRONTAL)
    // ========================================================================
    if (this.phase === 1) {
      if (this.currentState === 'P1_MARCH') {
        this.hasFrontalArmor = true;
        this.rotateFacingTowards(targetEntity.x, targetEntity.y, dt, this.turnRate);
        const toPlayer = MathUtils.normalize(targetEntity.x - this.x, targetEntity.y - this.y);
        moveVx = toPlayer.x * this.speed;
        moveVy = toPlayer.y * this.speed;

        this.fanShootTimer -= dt;
        if (this.fanShootTimer <= 0 && room) {
          this.fanShootTimer = 1.15;
          const bulletCount = 5;
          const spreadArc = 0.24;
          for (let i = 0; i < bulletCount; i++) {
            const angle =
              this.facingAngle + (i - (bulletCount - 1) / 2) * spreadArc;
            const dx = Math.cos(angle);
            const dy = Math.sin(angle);
            room.enemyProjectiles.push(
              new EnemyProjectile(
                this.x + dx * (this.radius + 10),
                this.y + dy * (this.radius + 10),
                dx,
                dy,
                270,
                15,
                7,
                'GoliatBoss'
              )
            );
          }
        }

        if (this.stateTimer <= 0) {
          this.transitionToState('P1_HAMMER_TELEGRAPH', 1.05);
        }
      } else if (this.currentState === 'P1_HAMMER_TELEGRAPH') {
        moveVx = 0;
        moveVy = 0;
        const progress = 1 - Math.max(0, this.stateTimer / 1.05);
        this.setWindup(true, progress, '#f59e0b');
        this.telegraphs = [
          {
            type: 'CIRCLE',
            x: this.x,
            y: this.y,
            radius: this.hammerRadius,
            progress,
          },
        ];

        if (this.stateTimer <= 0) {
          this.setWindup(false, 0);
          this.telegraphs = [];
          this.hammerVisualExpand = 0.35;
          if (typeof soundManager !== 'undefined' && soundManager) {
            soundManager.playProcedural('boss_slam', { volume: 0.55 });
          }
          if (
            MathUtils.circleCollision(
              this.x,
              this.y,
              this.hammerRadius,
              targetEntity.x,
              targetEntity.y,
              targetEntity.radius
            )
          ) {
            targetEntity.takeDamage(28, room);
            const push = MathUtils.normalize(targetEntity.x - this.x, targetEntity.y - this.y);
            targetEntity.x = MathUtils.clamp(
              targetEntity.x + push.x * 50,
              rb.left + targetEntity.radius,
              rb.right - targetEntity.radius
            );
            targetEntity.y = MathUtils.clamp(
              targetEntity.y + push.y * 50,
              rb.top + targetEntity.radius,
              rb.bottom - targetEntity.radius
            );
          }
          if (room) {
            if (typeof BossShockwaveHazard !== 'undefined') {
              room.hazards.push(new BossShockwaveHazard(this.x, this.y, '#38bdf8', 250, 320, 14));
            }
            for (let i = 0; i < 18; i++) {
              const ang = (Math.PI * 2 * i) / 18;
              room.spawnParticle(
                this.x,
                this.y,
                Math.cos(ang) * 210,
                Math.sin(ang) * 210,
                5,
                '#f59e0b',
                0.45
              );
            }
          }
          this.transitionToState('P1_HAMMER_RECOVERY', 0.65);
        }
      } else if (this.currentState === 'P1_HAMMER_RECOVERY') {
        moveVx = 0;
        moveVy = 0;
        if (this.stateTimer <= 0) {
          const norm = MathUtils.normalize(targetEntity.x - this.x, targetEntity.y - this.y);
          this.wallDashDir = norm.length > 0 ? { x: norm.x, y: norm.y } : { x: 1, y: 0 };
          this.facingAngle = Math.atan2(this.wallDashDir.y, this.wallDashDir.x);
          this.transitionToState('P1_WALL_TELEGRAPH', 1.0);
        }
      } else if (this.currentState === 'P1_WALL_TELEGRAPH') {
        moveVx = 0;
        moveVy = 0;
        const progress = 1 - Math.max(0, this.stateTimer / 1.0);
        this.setWindup(true, progress, '#f59e0b');
        const wallEnd = MathUtils.getRayWallIntersection(
          this.x,
          this.y,
          this.wallDashDir.x,
          this.wallDashDir.y,
          440,
          rb
        );
        this.telegraphs = [
          {
            type: 'LINE',
            x1: this.x,
            y1: this.y,
            x2: wallEnd.x,
            y2: wallEnd.y,
            width: this.radius * 2.0,
            active: true,
          },
        ];

        if (this.stateTimer <= 0) {
          this.setWindup(false, 0);
          this.wallDashHasHitPlayer = false;
          this.transitionToState('P1_WALL_DASH', 0.64);
        }
      } else if (this.currentState === 'P1_WALL_DASH') {
        moveVx = this.wallDashDir.x * this.wallDashSpeed;
        moveVy = this.wallDashDir.y * this.wallDashSpeed;

        if (
          !this.wallDashHasHitPlayer &&
          MathUtils.circleCollision(
            this.x,
            this.y,
            this.radius + 4,
            targetEntity.x,
            targetEntity.y,
            targetEntity.radius
          )
        ) {
          this.wallDashHasHitPlayer = true;
          targetEntity.takeDamage(32, room);
          targetEntity.x = MathUtils.clamp(
            targetEntity.x + this.wallDashDir.x * 85,
            rb.left + targetEntity.radius,
            rb.right - targetEntity.radius
          );
          targetEntity.y = MathUtils.clamp(
            targetEntity.y + this.wallDashDir.y * 85,
            rb.top + targetEntity.radius,
            rb.bottom - targetEntity.radius
          );
        }

        // Contrajuego: si Goliat se estrella contra un muro, pierde su escudo temporalmente y queda aturdido
        const nextX = this.x + moveVx * dt;
        const nextY = this.y + moveVy * dt;
        const hitWall =
          nextX <= rb.left + this.radius + 2 ||
          nextX >= rb.right - this.radius - 2 ||
          nextY <= rb.top + this.radius + 2 ||
          nextY >= rb.bottom - this.radius - 2;

        if (hitWall) {
          this.hasFrontalArmor = false;
          this.isStaggered = true;
          this.staggerVulnerableMult = 1.25;
          if (typeof soundManager !== 'undefined' && soundManager) {
            soundManager.playProcedural('boss_stun', { volume: 0.65 });
          }
          if (window.CombatSystem) {
            window.CombatSystem.triggerScreenShake(10, 0.28);
          }
          if (room) {
            for (let i = 0; i < 14; i++) {
              const ang = Math.random() * Math.PI * 2;
              room.spawnParticle(this.x, this.y, Math.cos(ang) * 160, Math.sin(ang) * 160, 4.5, '#38bdf8', 0.45);
            }
          }
          this.transitionToState('P1_WALL_STUNNED', 1.45);
        } else if (this.stateTimer <= 0) {
          this.fanShootTimer = 0.55;
          this.transitionToState('P1_MARCH', 3.2);
        }
      } else if (this.currentState === 'P1_WALL_STUNNED') {
        moveVx = 0;
        moveVy = 0;
        this.hasFrontalArmor = false;
        this.isStaggered = true;
        this.staggerVulnerableMult = 1.25;
        if (this.stateTimer <= 0) {
          this.hasFrontalArmor = true;
          this.isStaggered = false;
          this.staggerVulnerableMult = 1.0;
          this.fanShootTimer = 0.6;
          this.transitionToState('P1_MARCH', 3.2);
        }
      }
      return { moveVx, moveVy };
    }

    // ========================================================================
    // MÁQUINA DE ESTADOS - FASE 2 (AGRESIVA, SIN ESCUDO FRONTAL, VELOCIDAD x2)
    // ========================================================================
    if (this.currentState === 'P2_PREPARE_DASH') {
      const toPlayer = MathUtils.normalize(targetEntity.x - this.x, targetEntity.y - this.y);
      this.p2DashDir = toPlayer.length > 0 ? { x: toPlayer.x, y: toPlayer.y } : { x: 1, y: 0 };
      this.facingAngle = Math.atan2(this.p2DashDir.y, this.p2DashDir.x);
      moveVx = toPlayer.x * (this.speed * 0.45);
      moveVy = toPlayer.y * (this.speed * 0.45);

      const progress = 1 - Math.max(0, this.stateTimer / 0.55);
      this.setWindup(true, progress, '#f59e0b');
      const dashLineEnd = MathUtils.getRayWallIntersection(
        this.x,
        this.y,
        this.p2DashDir.x,
        this.p2DashDir.y,
        265,
        rb
      );
      this.telegraphs = [
        {
          type: 'LINE',
          x1: this.x,
          y1: this.y,
          x2: dashLineEnd.x,
          y2: dashLineEnd.y,
          width: this.radius * 1.6,
          active: true,
        },
      ];

      if (this.stateTimer <= 0) {
        this.setWindup(false, 0);
        this.telegraphs = [];
        this.hazardSpawnTimer = 0;
        this.transitionToState('P2_EXPLOSIVE_DASH', 0.50);
      }
    } else if (this.currentState === 'P2_EXPLOSIVE_DASH') {
      moveVx = this.p2DashDir.x * this.p2DashSpeed;
      moveVy = this.p2DashDir.y * this.p2DashSpeed;

      this.hazardSpawnTimer -= dt;
      if (this.hazardSpawnTimer <= 0 && room) {
        this.hazardSpawnTimer = 0.13;
        room.hazards.push(new CrackedGroundHazard(this.x, this.y, 42, 20, 0.62));
      }

      if (this.stateTimer <= 0) {
        this.p2DashCount += 1;
        if (this.p2DashCount >= 3) {
          this.p2DashCount = 0;
          this.invulnerableTimer = 1.0;
          this.transitionToState('P2_RING_JUMP_AIR', 1.0);
        } else {
          this.transitionToState('P2_PREPARE_DASH', 0.52);
        }
      }
    } else if (this.currentState === 'P2_RING_JUMP_AIR') {
      const dx = rb.centerX - this.x;
      const dy = rb.centerY - this.y;
      moveVx = dx * 5.5;
      moveVy = dy * 5.5;

      const progress = 1 - Math.max(0, this.stateTimer / 1.0);
      this.telegraphs = [
        {
          type: 'CIRCLE',
          x: rb.centerX,
          y: rb.centerY,
          radius: 74,
          progress,
        },
      ];

      if (this.stateTimer <= 0) {
        this.x = rb.centerX;
        this.y = rb.centerY;
        this.telegraphs = [];
        this.invulnerableTimer = 0;
        if (typeof soundManager !== 'undefined' && soundManager) {
          soundManager.playProcedural('boss_slam', { volume: 0.65 });
        }

        if (room) {
          if (typeof BossShockwaveHazard !== 'undefined') {
            room.hazards.push(new BossShockwaveHazard(this.x, this.y, '#38bdf8', 320, 520, 16));
          }
          for (let i = 0; i < 3; i++) {
            room.hazards.push(
              new ExpandingRingHazard(
                this.x,
                this.y,
                i * 0.46,
                225,
                470,
                16
              )
            );
          }
          for (let i = 0; i < 16; i++) {
            const ang = (Math.PI * 2 * i) / 16;
            room.spawnParticle(
              this.x,
              this.y,
              Math.cos(ang) * 190,
              Math.sin(ang) * 190,
              5,
              '#f43f5e',
              0.5
            );
          }
        }
        this.isStaggered = true;
        this.staggerVulnerableMult = 1.25;
        this.transitionToState('P2_RING_LAND_RECOVERY', 1.45);
      }
    } else if (this.currentState === 'P2_RING_LAND_RECOVERY') {
      moveVx = 0;
      moveVy = 0;
      this.isStaggered = true;
      this.staggerVulnerableMult = 1.25;
      if (this.stateTimer <= 0) {
        this.isStaggered = false;
        this.staggerVulnerableMult = 1.0;
        this.transitionToState('P2_PREPARE_DASH', 0.55);
      }
    }

    return { moveVx, moveVy };
  }

  draw(ctx) {
    // 1. Dibujar indicadores de Telegrafiado en el suelo
    this.drawTelegraphs(ctx);

    // Onda expansiva visual del Martillo Sísmico
    if (this.hammerVisualExpand > 0) {
      const ratio = 1 - this.hammerVisualExpand / 0.35;
      ctx.save();
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.hammerRadius * (0.8 + ratio * 0.35), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(239, 68, 68, ${1 - ratio})`;
      ctx.lineWidth = 8 * (1 - ratio);
      ctx.stroke();
      ctx.restore();
    }

    // Si está en el aire durante `P2_RING_JUMP_AIR` (invulnerable 1s), dibujamos su sombra e indicador
    ctx.save();
    if (this.currentState === 'P2_RING_JUMP_AIR') {
      ctx.globalAlpha = 0.4;
    }

    super.draw(ctx);

    // 2. Dibujar Escudo Frontal Direccional en Fase 1 (`hasFrontalArmor === true`)
    if (this.hasFrontalArmor) {
      ctx.beginPath();
      ctx.arc(
        this.x,
        this.y,
        this.radius + 8,
        this.facingAngle - Math.PI * 0.48,
        this.facingAngle + Math.PI * 0.48
      );
      ctx.strokeStyle = this.lastHitWasBlocked ? '#ffffff' : '#facc15';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Indicador de espalda vulnerable
      const backAngle = this.facingAngle + Math.PI;
      const bx = this.x + Math.cos(backAngle) * (this.radius - 6);
      const by = this.y + Math.sin(backAngle) * (this.radius - 6);
      ctx.beginPath();
      ctx.arc(bx, by, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ef4444';
      ctx.fill();
    } else if (this.phase === 2) {
      // Aura geométrica carmesí de Fase 2 (Furia sin escudo - Cero ctx.fillText)
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 9, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
      ctx.lineWidth = 3;
      ctx.setLineDash([7, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  }
}

// ============================================================================
// 7C. ENTIDADES AUXILIARES Y LOS 3 NUEVOS JEFES FINALES (v1.8: NÉMESIS, ABISMO, SERAFÍN)
// ============================================================================

/**
 * Proyectil enemigo con Soft-Homing (`HomingEnemyProjectile`) usado por `NemesisBoss`
 * en su ataque "Juicio Ocular". Ajusta levemente su vector de velocidad hacia el jugador
 * en cada frame interpolando el ángulo mediante `MathUtils.angleDiff` y `deltaTime`.
 */
class HomingEnemyProjectile extends EnemyProjectile {
  constructor(x, y, dirX, dirY, speed = 265, damage = 15, radius = 7, turnRate = 1.65) {
    super(x, y, dirX, dirY, speed, damage, radius);
    this.speed = speed;
    this.turnRate = turnRate;
    this.lifeTime = 3.1;
  }

  update(dt, player, room) {
    if (player && !player.markedForDeletion) {
      const currentAngle = Math.atan2(this.vy, this.vx);
      const targetAngle = Math.atan2(player.y - this.y, player.x - this.x);
      const diff = MathUtils.angleDiff(targetAngle, currentAngle);
      const newAngle =
        currentAngle + MathUtils.clamp(diff, -this.turnRate * dt, this.turnRate * dt);
      this.vx = Math.cos(newAngle) * this.speed;
      this.vy = Math.sin(newAngle) * this.speed;
    }
    super.update(dt, player, room);
  }

  draw(ctx) {
    const angle = Math.atan2(this.vy, this.vx);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.arc(0, 0, this.radius + 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(168, 85, 247, 0.34)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, 0, this.radius + 1.5, 0, Math.PI * 2);
    ctx.fillStyle = '#090d16';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#a855f7';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fae8ff';
    ctx.stroke();

    // Pupila direccional brillante de alto contraste
    ctx.beginPath();
    ctx.arc(this.radius * 0.32, 0, this.radius * 0.36, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
  }
}

/**
 * Barrera Estática de Daño (`StaticBarrierHazard`) generada por `NemesisBoss`
 * en su ataque "Prisión Geométrica".
 * Resuelve la colisión exacta contra una hitbox rectangular rotada transformando
 * las coordenadas continuas del jugador al espacio local rotado del rectángulo.
 */
class StaticBarrierHazard extends Entity {
  constructor(x1, y1, x2, y2, thickness = 18, damage = 20, duration = 4.0) {
    super((x1 + x2) / 2, (y1 + y2) / 2, thickness / 2, '#c084fc');
    this.x1 = x1;
    this.y1 = y1;
    this.x2 = x2;
    this.y2 = y2;
    this.cx = (x1 + x2) / 2;
    this.cy = (y1 + y2) / 2;
    this.length = Math.hypot(x2 - x1, y2 - y1);
    this.thickness = thickness;
    this.angle = Math.atan2(y2 - y1, x2 - x1);
    this.damage = damage;
    this.timer = duration;
    this.maxDuration = duration;
  }

  update(dt, player, room) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.markedForDeletion = true;
      return;
    }

    // Transformación inversa al marco de referencia local de la caja rotada (OBB vs Círculo)
    const dx = player.x - this.cx;
    const dy = player.y - this.cy;
    const cosA = Math.cos(-this.angle);
    const sinA = Math.sin(-this.angle);
    const localX = dx * cosA - dy * sinA;
    const localY = dx * sinA + dy * cosA;

    const halfL = this.length / 2;
    const halfT = this.thickness / 2;
    const closestX = MathUtils.clamp(localX, -halfL, halfL);
    const closestY = MathUtils.clamp(localY, -halfT, halfT);

    const distX = localX - closestX;
    const distY = localY - closestY;
    if (distX * distX + distY * distY <= player.radius * player.radius) {
      player.takeDamage(this.damage, room, { sourceArchetype: 'NemesisBoss' });
    }
  }

  draw(ctx) {
    const alpha = Math.min(1, this.timer / 0.4);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.angle);

    ctx.fillStyle = 'rgba(192, 132, 252, 0.35)';
    ctx.strokeStyle = '#e879f9';
    ctx.lineWidth = 2.5;
    ctx.fillRect(-this.length / 2, -this.thickness / 2, this.length, this.thickness);
    ctx.strokeRect(-this.length / 2, -this.thickness / 2, this.length, this.thickness);

    // Núcleo energético central de la barrera
    ctx.fillStyle = '#f5d0fe';
    ctx.fillRect(-this.length / 2 + 4, -2.5, Math.max(0, this.length - 8), 5);

    ctx.restore();
  }
}

/**
 * Zona de Gravedad (`GravityZoneHazard`) generada por `NemesisBoss` en "Lluvia Invertida".
 * Aplica un multiplicador de velocidad de `0.5` al jugador mientras esté adentro.
 * A los 2.0 segundos explota disparando proyectiles en 8 direcciones.
 */
class GravityZoneHazard extends Entity {
  constructor(x, y, radius = 86, duration = 2.4, projectileDamage = 15) {
    super(x, y, radius, '#7e22ce');
    this.armingDuration = 0.58; // Gracia inicial para poder salir antes de ralentizar
    this.armingTimer = this.armingDuration;
    this.timer = duration;
    this.maxDuration = duration;
    this.projectileDamage = projectileDamage;
    this.isGravityZone = false;
    this.speedMultiplier = 0.5;
    this.pulsePhase = Math.random() * Math.PI * 2;
  }

  update(dt, player, room) {
    this.pulsePhase += dt * 7;
    if (this.armingTimer > 0) {
      this.armingTimer = Math.max(0, this.armingTimer - dt);
      this.isGravityZone = this.armingTimer <= 0;
      return;
    }

    this.isGravityZone = true;
    this.timer -= dt;

    if (this.timer <= 0) {
      // Explota disparando proyectiles de alto contraste en 8 direcciones
      if (room) {
        const directions = 8;
        for (let i = 0; i < directions; i++) {
          const angle = (i * Math.PI * 2) / directions;
          const dx = Math.cos(angle);
          const dy = Math.sin(angle);
          const orb = new EnemyProjectile(
            this.x + dx * 12,
            this.y + dy * 12,
            dx,
            dy,
            285,
            this.projectileDamage,
            6.5,
            'NemesisBoss'
          );
          orb.ringColor = '#c084fc';
          orb.glowColor = 'rgba(192, 132, 252, 0.36)';
          orb.coreColor = '#faf5ff';
          room.enemyProjectiles.push(orb);
          room.spawnParticle(this.x, this.y, dx * 160, dy * 160, 4.5, '#d8b4fe', 0.45);
        }
      }
      this.markedForDeletion = true;
    }
  }

  draw(ctx) {
    ctx.save();
    if (this.armingTimer > 0) {
      const armProg = 1 - Math.max(0, this.armingTimer / this.armingDuration);
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(168, 85, 247, ${(0.08 + armProg * 0.12).toFixed(2)})`;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(216, 180, 254, 0.75)';
      ctx.setLineDash([4, 6]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius * armProg, 0, Math.PI * 2);
      ctx.strokeStyle = '#f0abfc';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      return;
    }

    const progress = 1 - Math.max(0, this.timer / this.maxDuration);
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(126, 34, 206, ${0.18 + progress * 0.28})`;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#c084fc';
    ctx.setLineDash([7, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Anillo gravitacional implosivo que marca la cuenta regresiva hacia la detonación
    const innerR = Math.max(6, this.radius * (1 - progress));
    ctx.beginPath();
    ctx.arc(this.x, this.y, innerR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(240, 171, 252, 0.85)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Entidad `NemesisDarkClone` (Clon Oscuro - Fase 2 de `NemesisBoss`):
 * Guarda el historial de coordenadas continuas del jugador y replica la ruta
 * con 1.35 segundos de retraso y pausas periódicas para dar aire táctico.
 */
class NemesisDarkClone extends Entity {
  constructor(startX, startY, bossOwner) {
    super(startX, startY, 17, '#3b0764');
    this.bossOwner = bossOwner;
    this.history = [];
    this.elapsedTime = 0;
    this.delaySeconds = 1.35;
    this.contactDamage = 18;
    this.activeReplica = false;
    this.chaseCycleTimer = 0;
    this.isPaused = false;
  }

  update(dt, player, room) {
    if (!this.bossOwner || this.bossOwner.markedForDeletion || this.bossOwner.hp <= 0) {
      this.markedForDeletion = true;
      return;
    }

    this.chaseCycleTimer = (this.chaseCycleTimer + dt) % 4.9;
    this.isPaused = this.chaseCycleTimer >= 4.0;

    if (!this.isPaused) {
      this.elapsedTime += dt;
      this.history.push({
        x: player.x,
        y: player.y,
        time: this.elapsedTime,
      });

      const targetTime = this.elapsedTime - this.delaySeconds;
      while (this.history.length > 1 && this.history[1].time <= targetTime) {
        this.history.shift();
      }

      if (this.elapsedTime >= this.delaySeconds && this.history.length > 0) {
        this.activeReplica = true;
        const sample = this.history[0];
        this.x = sample.x;
        this.y = sample.y;
      }
    }

    if (this.activeReplica && !this.isPaused && MathUtils.circleCollision(this.x, this.y, this.radius, player.x, player.y, player.radius)) {
      if (typeof CombatSystem !== 'undefined' && CombatSystem.isPlayerDashing(player)) {
        CombatSystem.triggerPerfectDodge(player, room, this.x, this.y);
      } else {
        player.takeDamage(this.contactDamage, room, { sourceArchetype: 'ShadowReplicaEnemy' });
      }
    }
  }

  draw(ctx) {
    ctx.save();
    if (this.history.length > 2) {
      ctx.beginPath();
      for (let i = 0; i < this.history.length; i += 3) {
        const pt = this.history[i];
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.25)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.globalAlpha = this.isPaused ? 0.38 : (this.activeReplica ? 0.88 : 0.4);
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#1e1b4b';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = this.isPaused ? '#38bdf8' : '#e879f9';
    ctx.stroke();

    ctx.fillStyle = this.isPaused ? '#38bdf8' : '#f43f5e';
    ctx.beginPath();
    ctx.arc(this.x - 5, this.y - 2, 3, 0, Math.PI * 2);
    ctx.arc(this.x + 5, this.y - 2, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/**
 * 1. `NemesisBoss` (NÉMESIS, EL OJO DEL VACÍO - Foco: Vectores y Clones)
 */
class NemesisBoss extends Boss {
  constructor(x, y, sectionNumber = 1, levelNumber = 1) {
    super(x, y, sectionNumber, levelNumber, 'NÉMESIS, EL OJO DEL VACÍO');
    this.radius = 32;
    this.color = '#6b21a8';
    this.basePhase1Speed = Math.min(200, 78 * this.ngSpeedMult);
    this.speed = this.basePhase1Speed;
    this.contactDamage = Math.round(20 * this.ngMult);

    // Variables de Fase 1
    this.ocularBurstTimer = 0.65;
    this.prisonPoints = [];
    this.gravitySpawnedInState = false;

    // Variables de Fase 2 (4 Escudos Orbitales con respiración táctica + Clon Oscuro)
    this.orbitTheta = 0;
    this.orbitAngularSpeed = 2.4;
    this.orbitRadius = 72;
    this.orbitCycleTimer = 0;
    this.orbitExpanded = false;
    this.orbitShields = [];
    this.darkCloneSpawned = false;

    this.transitionToState('P1_OCULAR_JUDGMENT', 3.4);
  }

  onPhaseChange() {
    super.onPhaseChange();
    this.color = '#a21caf';
    this.speed = Math.min(CONFIG.ENEMY_SPEED_CAPS.BOSS_WALK_P2, this.basePhase1Speed * 1.35);
    this.orbitCycleTimer = 0;
    this.orbitExpanded = false;
    this.orbitRadius = 72;

    this.orbitShields = [];
    for (let i = 0; i < 4; i++) {
      const angle = this.orbitTheta + (i * Math.PI * 2) / 4;
      this.orbitShields.push({
        x: this.x + Math.cos(angle) * this.orbitRadius,
        y: this.y + Math.sin(angle) * this.orbitRadius,
        radius: 15,
        angle,
        flashTimer: 0,
      });
    }

    this.transitionToState('P2_OCULAR_JUDGMENT', 2.8);
  }

  updateOrbitShields(dt, player, room) {
    if (this.orbitShields.length === 0) return;

    // Respiración de Escudos: 3.5s cerrados (72px) -> 2.2s abiertos (142px) para permitir ataques melee
    this.orbitCycleTimer = (this.orbitCycleTimer + dt) % 5.7;
    this.orbitExpanded = this.orbitCycleTimer >= 3.5;
    const targetRadius = this.orbitExpanded ? 142 : 72;
    const targetSpeed = this.orbitExpanded ? 1.25 : 2.4;
    this.orbitRadius += (targetRadius - this.orbitRadius) * Math.min(1, dt * 6);
    this.orbitAngularSpeed += (targetSpeed - this.orbitAngularSpeed) * Math.min(1, dt * 6);

    this.orbitTheta = (this.orbitTheta + this.orbitAngularSpeed * dt) % (Math.PI * 2);
    for (let i = 0; i < this.orbitShields.length; i++) {
      const shield = this.orbitShields[i];
      const theta = this.orbitTheta + (i * Math.PI * 2) / this.orbitShields.length;
      shield.angle = theta;
      shield.x = this.x + Math.cos(theta) * this.orbitRadius;
      shield.y = this.y + Math.sin(theta) * this.orbitRadius;
      if (shield.flashTimer > 0) {
        shield.flashTimer = Math.max(0, shield.flashTimer - dt);
      }

      if (room && room.projectiles) {
        for (const proj of room.projectiles) {
          if (proj.markedForDeletion) continue;
          if (MathUtils.circleCollision(proj.x, proj.y, proj.radius, shield.x, shield.y, shield.radius)) {
            proj.markedForDeletion = true;
            shield.flashTimer = 0.14;
            room.spawnParticle(proj.x, proj.y, -proj.vx * 0.25, -proj.vy * 0.25, 4, '#e879f9', 0.35);
          }
        }
      }

      if (
        player &&
        MathUtils.circleCollision(shield.x, shield.y, shield.radius, player.x, player.y, player.radius)
      ) {
        if (typeof CombatSystem !== 'undefined' && CombatSystem.isPlayerDashing(player)) {
          CombatSystem.triggerPerfectDodge(player, room, shield.x, shield.y);
        } else {
          player.takeDamage(16, room, { sourceArchetype: 'NemesisBoss' });
        }
      }
    }
  }

  selectGeometricPrisonPoints(player) {
    const radius = 152;
    const baseAngle = Math.random() * Math.PI * 2;
    const pad = 38;
    this.prisonPoints = [];
    for (let i = 0; i < 3; i++) {
      const a = baseAngle + (i * Math.PI * 2) / 3;
      const px = MathUtils.clamp(
        player.x + Math.cos(a) * radius,
        ROOM_BOUNDS.left + pad,
        ROOM_BOUNDS.right - pad
      );
      const py = MathUtils.clamp(
        player.y + Math.sin(a) * radius,
        ROOM_BOUNDS.top + pad,
        ROOM_BOUNDS.bottom - pad
      );
      this.prisonPoints.push({ x: px, y: py });
    }
  }

  spawnGravityRainZones(player, room, zoneCount = 3) {
    if (!room) return;
    const pad = 90;
    for (let i = 0; i < zoneCount; i++) {
      let zx;
      let zy;
      if (i === 0) {
        zx = MathUtils.clamp(player.x, ROOM_BOUNDS.left + pad, ROOM_BOUNDS.right - pad);
        zy = MathUtils.clamp(player.y, ROOM_BOUNDS.top + pad, ROOM_BOUNDS.bottom - pad);
      } else {
        zx = ROOM_BOUNDS.left + pad + Math.random() * (ROOM_BOUNDS.right - ROOM_BOUNDS.left - pad * 2);
        zy = ROOM_BOUNDS.top + pad + Math.random() * (ROOM_BOUNDS.bottom - ROOM_BOUNDS.top - pad * 2);
      }
      room.hazards.push(new GravityZoneHazard(zx, zy, 86, 2.15, 15));
    }
  }

  computeAIMovement(dt, targetEntity, miracleEffect, room) {
    this.stateTimer -= dt;

    if (this.phase === 2) {
      this.updateOrbitShields(dt, targetEntity, room);
      if (!this.darkCloneSpawned && room && targetEntity) {
        this.darkCloneSpawned = true;
        room.hazards.push(new NemesisDarkClone(targetEntity.x, targetEntity.y, this));
      }
    }

    const toPlayer = MathUtils.normalize(targetEntity.x - this.x, targetEntity.y - this.y);
    this.facingAngle = Math.atan2(toPlayer.y, toPlayer.x);

    let moveVx = 0;
    let moveVy = 0;
    const isP2 = this.phase === 2;

    if (
      this.currentState === 'P1_OCULAR_JUDGMENT' ||
      this.currentState === 'P2_OCULAR_JUDGMENT'
    ) {
      const idealDist = 240;
      if (toPlayer.length > idealDist + 35) {
        moveVx = toPlayer.x * this.speed;
        moveVy = toPlayer.y * this.speed;
      } else if (toPlayer.length < idealDist - 35) {
        moveVx = -toPlayer.x * this.speed * 0.85;
        moveVy = -toPlayer.y * this.speed * 0.85;
      } else {
        moveVx = -toPlayer.y * this.speed * 0.75;
        moveVy = toPlayer.x * this.speed * 0.75;
      }

      this.ocularBurstTimer -= dt;
      if (this.ocularBurstTimer <= 0 && room) {
        this.ocularBurstTimer = isP2 ? 0.78 : 0.98;
        const orbCount = isP2 ? 4 : 3;
        const spread = 0.28;
        for (let i = 0; i < orbCount; i++) {
          const ang = this.facingAngle + (i - (orbCount - 1) / 2) * spread;
          const dx = Math.cos(ang);
          const dy = Math.sin(ang);
          room.enemyProjectiles.push(
            new HomingEnemyProjectile(
              this.x + dx * (this.radius + 10),
              this.y + dy * (this.radius + 10),
              dx,
              dy,
              isP2 ? 275 : 250,
              15,
              7,
              isP2 ? 1.8 : 1.55
            )
          );
        }
      }

      if (this.stateTimer <= 0) {
        this.selectGeometricPrisonPoints(targetEntity);
        this.transitionToState(isP2 ? 'P2_PRISON_TELEGRAPH' : 'P1_PRISON_TELEGRAPH', 1.05);
      }
    } else if (
      this.currentState === 'P1_PRISON_TELEGRAPH' ||
      this.currentState === 'P2_PRISON_TELEGRAPH'
    ) {
      moveVx = 0;
      moveVy = 0;
      const progress = 1 - Math.max(0, this.stateTimer / 1.05);
      this.setWindup(true, progress, '#e879f9');
      this.telegraphs = [];
      for (let i = 0; i < this.prisonPoints.length; i++) {
        const pA = this.prisonPoints[i];
        const pB = this.prisonPoints[(i + 1) % this.prisonPoints.length];
        this.telegraphs.push({
          type: 'LINE',
          x1: pA.x,
          y1: pA.y,
          x2: pB.x,
          y2: pB.y,
          width: 18,
          active: true,
          arrow: false,
        });
      }

      if (this.stateTimer <= 0) {
        this.setWindup(false, 0);
        this.telegraphs = [];
        if (room) {
          for (let i = 0; i < this.prisonPoints.length; i++) {
            const pA = this.prisonPoints[i];
            const pB = this.prisonPoints[(i + 1) % this.prisonPoints.length];
            room.hazards.push(new StaticBarrierHazard(pA.x, pA.y, pB.x, pB.y, 18, 20, 4.0));
          }
        }
        this.gravitySpawnedInState = false;
        this.transitionToState(isP2 ? 'P2_GRAVITY_RAIN' : 'P1_GRAVITY_RAIN', 2.4);
      }
    } else if (
      this.currentState === 'P1_GRAVITY_RAIN' ||
      this.currentState === 'P2_GRAVITY_RAIN'
    ) {
      moveVx = -toPlayer.y * (this.speed * 0.6);
      moveVy = toPlayer.x * (this.speed * 0.6);

      if (!this.gravitySpawnedInState && room) {
        this.gravitySpawnedInState = true;
        this.spawnGravityRainZones(targetEntity, room, isP2 ? 4 : 3);
      }

      if (this.stateTimer <= 0) {
        this.isStaggered = true;
        this.staggerVulnerableMult = 1.25;
        this.transitionToState(isP2 ? 'P2_OCULAR_RECOVERY' : 'P1_OCULAR_RECOVERY', 1.25);
      }
    } else if (
      this.currentState === 'P1_OCULAR_RECOVERY' ||
      this.currentState === 'P2_OCULAR_RECOVERY'
    ) {
      moveVx = 0;
      moveVy = 0;
      this.isStaggered = true;
      this.staggerVulnerableMult = 1.25;
      if (this.stateTimer <= 0) {
        this.isStaggered = false;
        this.staggerVulnerableMult = 1.0;
        this.ocularBurstTimer = 0.45;
        this.transitionToState(
          isP2 ? 'P2_OCULAR_JUDGMENT' : 'P1_OCULAR_JUDGMENT',
          isP2 ? 2.9 : 3.4
        );
      }
    }

    return { moveVx, moveVy };
  }

  draw(ctx) {
    this.drawTelegraphs(ctx);
    super.draw(ctx);

    ctx.save();
    // Pupila central del Ojo del Vacío mirando hacia el jugador
    const irisDist = this.radius * 0.34;
    const ix = this.x + Math.cos(this.facingAngle) * irisDist;
    const iy = this.y + Math.sin(this.facingAngle) * irisDist;

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * 0.68, 0, Math.PI * 2);
    ctx.fillStyle = '#f5d0fe';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(ix, iy, this.radius * 0.34, 0, Math.PI * 2);
    ctx.fillStyle = this.phase === 2 ? '#e11d48' : '#3b0764';
    ctx.fill();

    // Dibujar los 4 Escudos Orbitales en Fase 2
    if (this.phase === 2 && this.orbitShields.length > 0) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.orbitRadius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(232, 121, 249, 0.28)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);

      for (const shield of this.orbitShields) {
        ctx.beginPath();
        ctx.arc(shield.x, shield.y, shield.radius, 0, Math.PI * 2);
        ctx.fillStyle = shield.flashTimer > 0 ? '#ffffff' : '#a855f7';
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#fde047';
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

/**
 * Entidad `PermanentCrackedGroundHazard`:
 * Suelo agrietado permanente dejado por `AbismoBoss` al emerger en Fase 2.
 * Inflige daño continuo al jugador si lo pisa, reduciendo progresivamente la arena segura.
 */
class PermanentCrackedGroundHazard extends Entity {
  constructor(x, y, radius = 48, damage = 16) {
    super(x, y, radius, '#7f1d1d');
    this.damage = damage;
    this.pulseTimer = Math.random() * Math.PI * 2;
  }

  update(dt, player, room) {
    this.pulseTimer += dt * 4;
    if (MathUtils.circleCollision(this.x, this.y, this.radius, player.x, player.y, player.radius)) {
      player.takeDamage(this.damage, room, { sourceArchetype: 'AbismoBoss' });
    }
  }

  draw(ctx) {
    const pulse = Math.sin(this.pulseTimer) * 0.08;
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(127, 29, 29, ${0.42 + pulse})`;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#ef4444';
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Grietas internas geométricas
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const ang = (i * Math.PI * 2) / 5 + 0.3;
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(
        this.x + Math.cos(ang) * (this.radius * 0.82),
        this.y + Math.sin(ang) * (this.radius * 0.82)
      );
    }
    ctx.strokeStyle = '#fca5a5';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Minion `WormEnemy` instanciado por `AbismoBoss` en Fase 2:
 * Rápido y frágil; explota al morir aplicando daño en área y partículas corrosivas.
 */
class WormEnemy extends Enemy {
  constructor(x, y, sectionNumber = 1, levelNumber = 1) {
    super(x, y, sectionNumber, levelNumber, 'ERRATIC');
    this.radius = 11;
    this.color = '#fb7185';
    this.maxHp = Math.max(20, Math.round(32 * CONFIG.ENEMY_HP_MULTIPLIER * this.ngMult));
    this.hp = this.maxHp;
    this.speed = Math.min(CONFIG.ENEMY_SPEED_CAPS.FLYER, 195 * this.ngSpeedMult);
    this.contactDamage = Math.round(12 * this.ngMult);
    this.dropsCoin = false;
    this.explosionRadius = 68;
    this.explosionDamage = Math.round(20 * this.ngMult);
  }

  onDeath(room, player) {
    if (!room) return;
    if (
      player &&
      MathUtils.circleCollision(
        this.x,
        this.y,
        this.explosionRadius,
        player.x,
        player.y,
        player.radius
      )
    ) {
      player.takeDamage(this.explosionDamage, room, { sourceArchetype: 'WormEnemy' });
    }
    for (let i = 0; i < 12; i++) {
      const ang = (i * Math.PI * 2) / 12;
      room.spawnParticle(
        this.x,
        this.y,
        Math.cos(ang) * 165,
        Math.sin(ang) * 165,
        4.5,
        '#fb7185',
        0.42
      );
    }
  }
}

/**
 * 2. `AbismoBoss` (ABISMO, EL DEVORAMUNDOS - Foco: I-frames y Z-Index lógico)
 * - Propiedad `isBurrowed` (booleano): Si es `true`, ignora colisiones de daño (invulnerable),
 *   actualiza su posición `(x, y)` y dibuja una estela de partículas de tierra en el Canvas.
 * - Fase 1 (La Cacería):
 *    - `P1_BURROW_CHASE` -> `P1_EMERGE_TELEGRAPH`: Pasa a `isBurrowed = true`, persigue al
 *      jugador a alta velocidad por 3s, se detiene, muestra un telegrafiado circular grande
 *      y emerge (`isBurrowed = false`) aplicando daño masivo en área.
 *    - `P1_JAWS_SUCTION` -> `P1_JAWS_BITE` (Mandíbulas): Inmóvil, aplica un vector de
 *      atracción constante al jugador durante 2s y luego ejecuta una hitbox de mordida frontal.
 * - Fase 2 (Hambre Infinita - Al 50% HP):
 *    - Al emerger, deja permanentemente entidades `PermanentCrackedGroundHazard` que reducen la arena.
 *    - Instancia `WormEnemy` (minions rápidos y frágiles que explotan al morir) periódicamente.
 *    - `P2_AMBUSH_BURROW` -> `P2_AMBUSH_TELEGRAPH`: Emboscada Triple enterrada con 3 emergencias
 *      consecutivas en la posición predictiva del jugador (`player.x + player.vx * leadTime`).
 */
class AbismoBoss extends Boss {
  constructor(x, y, sectionNumber = 1, levelNumber = 1) {
    super(x, y, sectionNumber, levelNumber, 'ABISMO, EL DEVORAMUNDOS');
    this.radius = 35;
    this.color = '#854d0e'; // Quitina subterránea en Fase 1
    this.basePhase1Speed = Math.min(195, 88 * this.ngSpeedMult);
    this.speed = this.basePhase1Speed;
    this.burrowSpeed = Math.min(CONFIG.ENEMY_SPEED_CAPS.ABISMO_BURROW, 225 * this.ngSpeedMult);
    this.contactDamage = Math.round(24 * this.ngMult);

    this.isBurrowed = true;
    this.dirtTrailTimer = 0;
    this.emergeRadius = 124;
    this.suctionForce = 130;
    this.biteVisualTimer = 0;

    // Variables de Fase 2
    this.wormSpawnTimer = 4.0;
    this.ambushCounter = 0;
    this.ambushTarget = { x: ROOM_BOUNDS.centerX, y: ROOM_BOUNDS.centerY };

    this.transitionToState('P1_BURROW_CHASE', 2.6);
  }

  onPhaseChange() {
    super.onPhaseChange();
    this.color = '#9f1239'; // Carmesí abisal en Fase 2
    this.burrowSpeed = Math.min(CONFIG.ENEMY_SPEED_CAPS.ABISMO_BURROW + 18, 255 * this.ngSpeedMult);
    this.ambushCounter = 0;
    this.isBurrowed = true;
    this.transitionToState('P2_AMBUSH_BURROW', 0.72);
  }

  spawnPermanentCrackedFloor(room) {
    if (!room) return;
    // Limitar a 10 fisuras permanentes para no bloquear toda la sala
    const currentPermanent = room.hazards.filter(
      (h) => h instanceof PermanentCrackedGroundHazard
    );
    if (currentPermanent.length >= 10) {
      currentPermanent[0].markedForDeletion = true;
    }
    room.hazards.push(new PermanentCrackedGroundHazard(this.x, this.y, 46, 16));
    if (this.phase === 2 && typeof AbyssalGeyserHazard !== 'undefined') {
      room.hazards.push(new AbyssalGeyserHazard(this.x, this.y, 52, 1.05, 1.35, 20));
    }
  }

  executeEmergeExplosion(targetEntity, room) {
    this.isBurrowed = false;
    this.telegraphs = [];
    this.setWindup(false, 0);
    if (typeof soundManager !== 'undefined' && soundManager) {
      soundManager.playProcedural('boss_slam', { volume: 0.55 });
    }

    if (
      targetEntity &&
      MathUtils.circleCollision(
        this.x,
        this.y,
        this.emergeRadius,
        targetEntity.x,
        targetEntity.y,
        targetEntity.radius
      )
    ) {
      targetEntity.takeDamage(34, room);
      const push = MathUtils.normalize(targetEntity.x - this.x, targetEntity.y - this.y);
      targetEntity.x = MathUtils.clamp(
        targetEntity.x + push.x * 60,
        ROOM_BOUNDS.left + targetEntity.radius,
        ROOM_BOUNDS.right - targetEntity.radius
      );
      targetEntity.y = MathUtils.clamp(
        targetEntity.y + push.y * 60,
        ROOM_BOUNDS.top + targetEntity.radius,
        ROOM_BOUNDS.bottom - targetEntity.radius
      );
    }

    if (room) {
      // Anillo de 6 rocas proyectiles de alto contraste al emerger
      const rockCount = 6;
      for (let i = 0; i < rockCount; i++) {
        const ang = (i * Math.PI * 2) / rockCount + 0.25;
        const dx = Math.cos(ang);
        const dy = Math.sin(ang);
        const rock = new EnemyProjectile(
          this.x + dx * (this.radius + 8),
          this.y + dy * (this.radius + 8),
          dx,
          dy,
          225,
          14,
          6.5,
          'AbismoBoss'
        );
        rock.ringColor = '#d97706';
        rock.glowColor = 'rgba(217, 119, 6, 0.34)';
        rock.coreColor = '#fef3c7';
        room.enemyProjectiles.push(rock);
      }

      for (let i = 0; i < 20; i++) {
        const ang = (i * Math.PI * 2) / 20;
        room.spawnParticle(
          this.x,
          this.y,
          Math.cos(ang) * 215,
          Math.sin(ang) * 215,
          5.5,
          this.phase === 2 ? '#e11d48' : '#a16207',
          0.48
        );
      }
      if (this.phase === 2) {
        this.spawnPermanentCrackedFloor(room);
      }
    }
  }

  computeAIMovement(dt, targetEntity, miracleEffect, room) {
    this.stateTimer -= dt;
    if (this.biteVisualTimer > 0) {
      this.biteVisualTimer = Math.max(0, this.biteVisualTimer - dt);
    }

    if (this.isBurrowed && room) {
      this.dirtTrailTimer -= dt;
      if (this.dirtTrailTimer <= 0) {
        this.dirtTrailTimer = 0.05;
        const jitterX = (Math.random() - 0.5) * 28;
        const jitterY = (Math.random() - 0.5) * 28;
        room.spawnParticle(
          this.x + jitterX,
          this.y + jitterY,
          (Math.random() - 0.5) * 65,
          (Math.random() - 0.5) * 65,
          5,
          '#a16207',
          0.45
        );
      }
    }

    if (this.phase === 2 && room) {
      this.wormSpawnTimer -= dt;
      if (this.wormSpawnTimer <= 0) {
        this.wormSpawnTimer = 5.4;
        const activeWorms = room.enemies.filter(
          (e) => e instanceof WormEnemy && !e.markedForDeletion
        ).length;
        if (activeWorms < 3) {
          const ang = Math.random() * Math.PI * 2;
          const wx = MathUtils.clamp(
            this.x + Math.cos(ang) * 55,
            ROOM_BOUNDS.left + 25,
            ROOM_BOUNDS.right - 25
          );
          const wy = MathUtils.clamp(
            this.y + Math.sin(ang) * 55,
            ROOM_BOUNDS.top + 25,
            ROOM_BOUNDS.bottom - 25
          );
          room.enemies.push(new WormEnemy(wx, wy, this.sectionNumber, this.levelNumber));
        }
      }
    }

    const toPlayer = MathUtils.normalize(targetEntity.x - this.x, targetEntity.y - this.y);
    let moveVx = 0;
    let moveVy = 0;

    // ========================================================================
    // FASE 1: RASTRO DE MUERTE + EMERGENCIA SÍSMICA + SUCCIÓN Y MORDIDA + PAUSA
    // ========================================================================
    if (this.phase === 1) {
      if (this.currentState === 'P1_BURROW_CHASE') {
        this.isBurrowed = true;
        this.facingAngle = Math.atan2(toPlayer.y, toPlayer.x);
        moveVx = toPlayer.x * this.burrowSpeed;
        moveVy = toPlayer.y * this.burrowSpeed;

        if (this.stateTimer <= 0) {
          this.transitionToState('P1_EMERGE_TELEGRAPH', 0.95);
        }
      } else if (this.currentState === 'P1_EMERGE_TELEGRAPH') {
        this.isBurrowed = true;
        moveVx = 0;
        moveVy = 0;
        const progress = 1 - Math.max(0, this.stateTimer / 0.95);
        this.setWindup(true, progress, '#f59e0b');
        this.telegraphs = [
          {
            type: 'CIRCLE',
            x: this.x,
            y: this.y,
            radius: this.emergeRadius,
            progress,
          },
        ];

        if (this.stateTimer <= 0) {
          this.executeEmergeExplosion(targetEntity, room);
          this.transitionToState('P1_JAWS_SUCTION', 1.9);
        }
      } else if (this.currentState === 'P1_JAWS_SUCTION') {
        this.isBurrowed = false;
        moveVx = 0;
        moveVy = 0;
        this.facingAngle = Math.atan2(toPlayer.y, toPlayer.x);

        // El Dash rompe la fuerza de succión
        const playerIsDashing = typeof CombatSystem !== 'undefined' && CombatSystem.isPlayerDashing(targetEntity);
        if (!playerIsDashing) {
          const pullDir = MathUtils.normalize(this.x - targetEntity.x, this.y - targetEntity.y);
          targetEntity.x = MathUtils.clamp(
            targetEntity.x + pullDir.x * this.suctionForce * dt,
            ROOM_BOUNDS.left + targetEntity.radius,
            ROOM_BOUNDS.right - targetEntity.radius
          );
          targetEntity.y = MathUtils.clamp(
            targetEntity.y + pullDir.y * this.suctionForce * dt,
            ROOM_BOUNDS.top + targetEntity.radius,
            ROOM_BOUNDS.bottom - targetEntity.radius
          );
        }

        const biteX = this.x + Math.cos(this.facingAngle) * 58;
        const biteY = this.y + Math.sin(this.facingAngle) * 58;
        const progress = 1 - Math.max(0, this.stateTimer / 1.9);
        this.setWindup(true, progress * 0.85, '#f59e0b');
        this.telegraphs = [
          {
            type: 'CIRCLE',
            x: biteX,
            y: biteY,
            radius: 68,
            progress,
          },
        ];

        if (this.stateTimer <= 0) {
          this.setWindup(false, 0);
          this.telegraphs = [];
          this.biteVisualTimer = 0.35;
          if (
            MathUtils.circleCollision(
              biteX,
              biteY,
              68,
              targetEntity.x,
              targetEntity.y,
              targetEntity.radius
            )
          ) {
            targetEntity.takeDamage(32, room);
          }
          this.isStaggered = true;
          this.staggerVulnerableMult = 1.25;
          this.transitionToState('P1_BITE_RECOVERY', 1.25);
        }
      } else if (this.currentState === 'P1_BITE_RECOVERY') {
        this.isBurrowed = false;
        this.isStaggered = true;
        this.staggerVulnerableMult = 1.25;
        moveVx = 0;
        moveVy = 0;
        if (this.stateTimer <= 0) {
          this.isStaggered = false;
          this.staggerVulnerableMult = 1.0;
          this.isBurrowed = true;
          this.transitionToState('P1_BURROW_CHASE', 2.6);
        }
      }
      return { moveVx, moveVy };
    }

    // ========================================================================
    // FASE 2: EMBOSCADA TRIPLE JUSTA + FATIGA EN SUPERFICIE + SUCCIÓN
    // ========================================================================
    if (this.currentState === 'P2_AMBUSH_BURROW') {
      this.isBurrowed = true;
      const leadTime = 0.28;
      const predX = MathUtils.clamp(
        targetEntity.x + targetEntity.vx * leadTime,
        ROOM_BOUNDS.left + 60,
        ROOM_BOUNDS.right - 60
      );
      const predY = MathUtils.clamp(
        targetEntity.y + targetEntity.vy * leadTime,
        ROOM_BOUNDS.top + 60,
        ROOM_BOUNDS.bottom - 60
      );
      this.ambushTarget = { x: predX, y: predY };

      const toPred = MathUtils.normalize(predX - this.x, predY - this.y);
      moveVx = toPred.x * (this.burrowSpeed * 1.4);
      moveVy = toPred.y * (this.burrowSpeed * 1.4);

      if (this.stateTimer <= 0 || Math.hypot(predX - this.x, predY - this.y) <= 26) {
        this.x = predX;
        this.y = predY;
        this.transitionToState('P2_AMBUSH_TELEGRAPH', 0.82);
      }
    } else if (this.currentState === 'P2_AMBUSH_TELEGRAPH') {
      this.isBurrowed = true;
      moveVx = 0;
      moveVy = 0;
      const progress = 1 - Math.max(0, this.stateTimer / 0.82);
      this.setWindup(true, progress, '#f59e0b');
      this.telegraphs = [
        {
          type: 'CIRCLE',
          x: this.x,
          y: this.y,
          radius: this.emergeRadius,
          progress,
        },
      ];

      if (this.stateTimer <= 0) {
        this.executeEmergeExplosion(targetEntity, room);
        this.ambushCounter += 1;
        this.transitionToState('P2_AMBUSH_SURFACE_PAUSE', 0.45);
      }
    } else if (this.currentState === 'P2_AMBUSH_SURFACE_PAUSE') {
      this.isBurrowed = false;
      moveVx = 0;
      moveVy = 0;
      if (this.stateTimer <= 0) {
        if (this.ambushCounter < 3) {
          this.isBurrowed = true;
          this.transitionToState('P2_AMBUSH_BURROW', 0.72);
        } else {
          this.ambushCounter = 0;
          this.isStaggered = true;
          this.staggerVulnerableMult = 1.25;
          this.transitionToState('P2_EXHAUSTED_SURFACE', 1.55);
        }
      }
    } else if (this.currentState === 'P2_EXHAUSTED_SURFACE') {
      this.isBurrowed = false;
      this.isStaggered = true;
      this.staggerVulnerableMult = 1.25;
      moveVx = 0;
      moveVy = 0;
      if (this.stateTimer <= 0) {
        this.isStaggered = false;
        this.staggerVulnerableMult = 1.0;
        this.transitionToState('P2_JAWS_SUCTION', 1.8);
      }
    } else if (this.currentState === 'P2_JAWS_SUCTION') {
      this.isBurrowed = false;
      moveVx = 0;
      moveVy = 0;
      this.facingAngle = Math.atan2(toPlayer.y, toPlayer.x);

      const playerIsDashing = typeof CombatSystem !== 'undefined' && CombatSystem.isPlayerDashing(targetEntity);
      if (!playerIsDashing) {
        const pullDir = MathUtils.normalize(this.x - targetEntity.x, this.y - targetEntity.y);
        targetEntity.x = MathUtils.clamp(
          targetEntity.x + pullDir.x * (this.suctionForce * 1.18) * dt,
          ROOM_BOUNDS.left + targetEntity.radius,
          ROOM_BOUNDS.right - targetEntity.radius
        );
        targetEntity.y = MathUtils.clamp(
          targetEntity.y + pullDir.y * (this.suctionForce * 1.18) * dt,
          ROOM_BOUNDS.top + targetEntity.radius,
          ROOM_BOUNDS.bottom - targetEntity.radius
        );
      }

      const biteX = this.x + Math.cos(this.facingAngle) * 58;
      const biteY = this.y + Math.sin(this.facingAngle) * 58;
      const progress = 1 - Math.max(0, this.stateTimer / 1.8);
      this.setWindup(true, progress * 0.85, '#f59e0b');
      this.telegraphs = [
        {
          type: 'CIRCLE',
          x: biteX,
          y: biteY,
          radius: 70,
          progress,
        },
      ];

      if (this.stateTimer <= 0) {
        this.setWindup(false, 0);
        this.telegraphs = [];
        this.biteVisualTimer = 0.35;
        if (
          MathUtils.circleCollision(
            biteX,
            biteY,
            70,
            targetEntity.x,
            targetEntity.y,
            targetEntity.radius
          )
        ) {
          targetEntity.takeDamage(34, room);
        }
        this.isBurrowed = true;
        this.transitionToState('P2_AMBUSH_BURROW', 0.72);
      }
    }

    return { moveVx, moveVy };
  }

  draw(ctx) {
    this.drawTelegraphs(ctx);

    // Si está bajo tierra (`isBurrowed === true`), se dibuja el túmulo sísmico en vez del cuerpo
    if (this.isBurrowed) {
      ctx.save();
      const pulse = Math.sin(this.aiTimer * 12) * 5;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius * 0.85 + pulse, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(120, 53, 15, 0.45)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#d97706';
      ctx.setLineDash([6, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      return;
    }

    super.draw(ctx);

    // Mandíbulas quitinosas frontales de Abismo
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.facingAngle);
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 4;
    const jawSpread = this.biteVisualTimer > 0 ? 0.12 : 0.48;
    for (const sign of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(this.radius * 0.55, sign * 10, 16, -jawSpread * sign, jawSpread * sign + sign * 0.9);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/**
 * Proyectil `SuspendedSwordProjectile` (Espadas Suspendidas - Fase 2 de `SerafinBoss`):
 * Permanece estático durante 1.5 segundos apuntando al jugador; al cumplirse los 1.5s,
 * calcula su vector de velocidad hacia la coordenada exacta del jugador en ese frame
 * y se dispara simultáneamente junto con las demás espadas.
 */
class SuspendedSwordProjectile extends EnemyProjectile {
  constructor(x, y, suspendDuration = 1.35, launchSpeed = 580, damage = 18) {
    super(x, y, 0, 0, 0, damage, 8);
    this.suspendTimer = suspendDuration;
    this.maxSuspendDuration = suspendDuration;
    this.launchSpeed = launchSpeed;
    this.launched = false;
    this.aimAngle = 0;
    this.lifeTime = 4.5;
  }

  update(dt, player, room) {
    if (!this.launched) {
      if (player) {
        this.aimAngle = Math.atan2(player.y - this.y, player.x - this.x);
      }
      this.suspendTimer -= dt;
      if (this.suspendTimer <= 0 && player) {
        this.launched = true;
        const norm = MathUtils.normalize(player.x - this.x, player.y - this.y);
        this.aimAngle = Math.atan2(norm.y, norm.x);
        this.vx = norm.x * this.launchSpeed;
        this.vy = norm.y * this.launchSpeed;
        if (typeof soundManager !== 'undefined' && soundManager) {
          soundManager.playProcedural('boss_flash', { volume: 0.25 });
        }
      }
      return;
    }
    super.update(dt, player, room);
  }

  draw(ctx) {
    ctx.save();
    if (!this.launched) {
      const urg = 1 - Math.max(0, this.suspendTimer / Math.max(0.2, this.maxSuspendDuration));
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x + Math.cos(this.aimAngle) * 750, this.y + Math.sin(this.aimAngle) * 750);
      ctx.strokeStyle = urg > 0.8 ? 'rgba(255, 255, 255, 0.55)' : 'rgba(250, 204, 21, 0.32)';
      ctx.lineWidth = urg > 0.8 ? 2.5 : 1.5;
      ctx.setLineDash([6, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.translate(this.x, this.y);
    ctx.rotate(this.aimAngle);

    // Aura oscura + Geometría de Espada Celestial de alto contraste
    ctx.beginPath();
    ctx.moveTo(19, 0);
    ctx.lineTo(-12, -8);
    ctx.lineTo(-7, 0);
    ctx.lineTo(-12, 8);
    ctx.closePath();
    ctx.fillStyle = '#090d16';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-10, -6);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-10, 6);
    ctx.closePath();
    ctx.fillStyle = '#fef08a';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#f59e0b';
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * 3. `SerafinBoss` (SERAFÍN, EL ÁNGEL DE LA RUINA - Foco: Contraataques y Combos Legibles)
 */
class SerafinBoss extends Boss {
  constructor(x, y, sectionNumber = 1, levelNumber = 1) {
    super(x, y, sectionNumber, levelNumber, 'SERAFÍN, EL ÁNGEL DE LA RUINA');
    this.radius = 30;
    this.color = '#eab308'; // Oro celestial en Fase 1
    this.basePhase1Speed = Math.min(220, 92 * this.ngSpeedMult);
    this.speed = this.basePhase1Speed;
    this.contactDamage = Math.round(22 * this.ngMult);

    this.isGuarding = false;
    this.counterGuardCooldown = 0;
    this.teleportTarget = null;
    this.spearDir = { x: 1, y: 0 };
    this.spearSpeed = 1120;
    this.spearHasHit = false;

    this.spiralAngle = 0;
    this.spiralTimer = 0;

    // Variables de Fase 2 (Combo Triangular legible + Ventana de Castigo + 6 Espadas Escalonadas)
    this.triangleVertices = [];
    this.triangleStep = 0;
    this.swordsSpawnedInState = false;

    this.transitionToState('P1_SPEAR_PREP', 0.55);
  }

  onPhaseChange() {
    super.onPhaseChange();
    this.color = '#f43f5e';
    this.speed = Math.min(CONFIG.ENEMY_SPEED_CAPS.BOSS_WALK_P2, this.basePhase1Speed * 1.85);
    this.isGuarding = false;
    this.teleportTarget = null;
    this.setupTriangleComboVertices();
    if (typeof CelestialJudgmentPillar !== 'undefined') {
      const room = window.activeGameInstance ? window.activeGameInstance.currentRoom : null;
      const player = window.activeGameInstance ? window.activeGameInstance.player : null;
      if (room && player) {
        room.hazards.push(new CelestialJudgmentPillar(player.x, ROOM_BOUNDS.centerY, 64, 550, 0.95, 22));
      }
    }
    this.transitionToState('P2_TRIANGLE_TELEGRAPH', 0.65);
  }

  onGuardedHit(sourceEntity, room, player) {
    if (!room || !player || this.counterGuardCooldown > 0) return;
    this.counterGuardCooldown = 0.35;
    const norm = MathUtils.normalize(player.x - this.x, player.y - this.y);
    const counterProj = new EnemyProjectile(
      this.x + norm.x * (this.radius + 10),
      this.y + norm.y * (this.radius + 10),
      norm.x,
      norm.y,
      580,
      22,
      8,
      'SerafinBoss'
    );
    counterProj.ringColor = '#fde047';
    counterProj.glowColor = 'rgba(250, 204, 21, 0.42)';
    counterProj.coreColor = '#ffffff';
    room.enemyProjectiles.push(counterProj);

    for (let i = 0; i < 8; i++) {
      const ang = (i * Math.PI * 2) / 8;
      room.spawnParticle(
        this.x,
        this.y,
        Math.cos(ang) * 150,
        Math.sin(ang) * 150,
        4,
        '#fef08a',
        0.35
      );
    }
  }

  chooseTeleportTarget(player) {
    const pad = 68;
    const angle = Math.random() * Math.PI * 2;
    const dist = 235;
    this.teleportTarget = {
      x: MathUtils.clamp(player.x + Math.cos(angle) * dist, ROOM_BOUNDS.left + pad, ROOM_BOUNDS.right - pad),
      y: MathUtils.clamp(player.y + Math.sin(angle) * dist, ROOM_BOUNDS.top + pad, ROOM_BOUNDS.bottom - pad),
    };
  }

  teleportAroundPlayer(player, room) {
    if (!this.teleportTarget) {
      this.chooseTeleportTarget(player);
    }
    if (room) {
      for (let i = 0; i < 10; i++) {
        const a = (i * Math.PI * 2) / 10;
        room.spawnParticle(this.x, this.y, Math.cos(a) * 120, Math.sin(a) * 120, 4, '#fef08a', 0.35);
      }
    }
    this.x = this.teleportTarget.x;
    this.y = this.teleportTarget.y;
    this.teleportTarget = null;
    if (room) {
      for (let i = 0; i < 10; i++) {
        const a = (i * Math.PI * 2) / 10;
        room.spawnParticle(this.x, this.y, Math.cos(a) * 120, Math.sin(a) * 120, 4, '#38bdf8', 0.35);
      }
    }
    const norm = MathUtils.normalize(player.x - this.x, player.y - this.y);
    this.spearDir = norm.length > 0 ? { x: norm.x, y: norm.y } : { x: 1, y: 0 };
    this.facingAngle = Math.atan2(this.spearDir.y, this.spearDir.x);
  }

  setupTriangleComboVertices(targetEntity = null) {
    const cx = targetEntity ? targetEntity.x : ROOM_BOUNDS.centerX;
    const cy = targetEntity ? targetEntity.y : ROOM_BOUNDS.centerY;
    const r = 195;
    const pad = 58;
    const baseA = Math.random() * Math.PI * 2;
    this.triangleVertices = [];
    for (let i = 0; i < 3; i++) {
      const a = baseA + (i * Math.PI * 2) / 3;
      this.triangleVertices.push({
        x: MathUtils.clamp(cx + Math.cos(a) * r, ROOM_BOUNDS.left + pad, ROOM_BOUNDS.right - pad),
        y: MathUtils.clamp(cy + Math.sin(a) * r, ROOM_BOUNDS.top + pad, ROOM_BOUNDS.bottom - pad),
      });
    }
    this.x = this.triangleVertices[0].x;
    this.y = this.triangleVertices[0].y;
    this.triangleStep = 0;
  }

  spawnSixSuspendedSwords(room) {
    if (!room) return;
    const pad = 72;
    const positions = [
      { x: ROOM_BOUNDS.left + pad, y: ROOM_BOUNDS.top + pad },
      { x: ROOM_BOUNDS.centerX, y: ROOM_BOUNDS.top + pad },
      { x: ROOM_BOUNDS.right - pad, y: ROOM_BOUNDS.top + pad },
      { x: ROOM_BOUNDS.left + pad, y: ROOM_BOUNDS.bottom - pad },
      { x: ROOM_BOUNDS.centerX, y: ROOM_BOUNDS.bottom - pad },
      { x: ROOM_BOUNDS.right - pad, y: ROOM_BOUNDS.bottom - pad },
    ];
    positions.forEach((pos, idx) => {
      // Disparo escalonado rítmico: 1.05s, 1.19s, 1.33s... hasta 1.75s
      room.enemyProjectiles.push(new SuspendedSwordProjectile(pos.x, pos.y, 1.05 + idx * 0.14, 580, 18));
    });
  }

  computeAIMovement(dt, targetEntity, miracleEffect, room) {
    this.stateTimer -= dt;
    if (this.counterGuardCooldown > 0) {
      this.counterGuardCooldown = Math.max(0, this.counterGuardCooldown - dt);
    }
    let moveVx = 0;
    let moveVy = 0;

    // ========================================================================
    // FASE 1: SELLO TELETRANSPORTE -> LANZA (0.68s) -> ESPIRAL -> GUARDIA CON AVISO
    // ========================================================================
    if (this.phase === 1) {
      if (this.currentState === 'P1_SPEAR_PREP') {
        this.isGuarding = false;
        if (!this.teleportTarget) {
          this.chooseTeleportTarget(targetEntity);
        }
        const progress = 1 - Math.max(0, this.stateTimer / 0.55);
        this.telegraphs = [
          {
            type: 'CIRCLE',
            style: 'TELEPORT',
            x: this.teleportTarget.x,
            y: this.teleportTarget.y,
            radius: 46,
            progress,
          },
        ];
        if (this.stateTimer <= 0) {
          this.teleportAroundPlayer(targetEntity, room);
          this.transitionToState('P1_SPEAR_TELEGRAPH', 0.68);
        }
      } else if (this.currentState === 'P1_SPEAR_TELEGRAPH') {
        moveVx = 0;
        moveVy = 0;
        const progress = 1 - Math.max(0, this.stateTimer / 0.68);
        this.setWindup(true, progress, '#fbbf24');
        const ray = MathUtils.getRayWallIntersection(
          this.x,
          this.y,
          this.spearDir.x,
          this.spearDir.y,
          540,
          ROOM_BOUNDS
        );
        this.telegraphs = [
          {
            type: 'LINE',
            x1: this.x,
            y1: this.y,
            x2: ray.x,
            y2: ray.y,
            width: 22,
            active: true,
          },
        ];
        if (this.stateTimer <= 0) {
          this.setWindup(false, 0);
          this.telegraphs = [];
          this.spearHasHit = false;
          this.transitionToState('P1_SPEAR_DASH', 0.42);
        }
      } else if (this.currentState === 'P1_SPEAR_DASH') {
        moveVx = this.spearDir.x * this.spearSpeed;
        moveVy = this.spearDir.y * this.spearSpeed;
        if (
          !this.spearHasHit &&
          MathUtils.circleCollision(
            this.x,
            this.y,
            this.radius + 4,
            targetEntity.x,
            targetEntity.y,
            targetEntity.radius
          )
        ) {
          this.spearHasHit = true;
          targetEntity.takeDamage(28, room);
        }
        if (this.stateTimer <= 0) {
          this.spiralTimer = 0;
          this.transitionToState('P1_SACRILEGE_SPIRAL', 2.7);
        }
      } else if (this.currentState === 'P1_SACRILEGE_SPIRAL') {
        const toCenter = MathUtils.normalize(ROOM_BOUNDS.centerX - this.x, ROOM_BOUNDS.centerY - this.y);
        moveVx = toCenter.x * this.speed * 0.7;
        moveVy = toCenter.y * this.speed * 0.7;

        this.spiralTimer -= dt;
        if (this.spiralTimer <= 0 && room) {
          this.spiralTimer = 0.15;
          this.spiralAngle += 0.36;
          const arms = 3;
          for (let k = 0; k < arms; k++) {
            const ang = this.spiralAngle + (k * Math.PI * 2) / arms;
            const dx = Math.cos(ang);
            const dy = Math.sin(ang);
            const feather = new EnemyProjectile(
              this.x + dx * (this.radius + 6),
              this.y + dy * (this.radius + 6),
              dx,
              dy,
              265,
              14,
              6,
              'SerafinBoss'
            );
            feather.ringColor = '#fbbf24';
            feather.glowColor = 'rgba(251, 191, 36, 0.32)';
            feather.coreColor = '#fef9c3';
            room.enemyProjectiles.push(feather);
          }
        }

        if (this.stateTimer <= 0) {
          this.isGuarding = false;
          this.transitionToState('P1_GUARD_WINDUP', 0.48);
        }
      } else if (this.currentState === 'P1_GUARD_WINDUP') {
        this.isGuarding = false;
        moveVx = 0;
        moveVy = 0;
        const progress = 1 - Math.max(0, this.stateTimer / 0.48);
        this.setWindup(true, progress, '#fde047');
        this.telegraphs = [
          {
            type: 'CIRCLE',
            style: 'GUARD',
            x: this.x,
            y: this.y,
            radius: this.radius + 16,
            progress,
          },
        ];
        if (this.stateTimer <= 0) {
          this.setWindup(false, 0);
          this.isGuarding = true;
          this.transitionToState('P1_COUNTER_GUARD', 1.35);
        }
      } else if (this.currentState === 'P1_COUNTER_GUARD') {
        this.isGuarding = true;
        moveVx = 0;
        moveVy = 0;
        if (this.stateTimer <= 0) {
          this.isGuarding = false;
          this.teleportTarget = null;
          this.transitionToState('P1_SPEAR_PREP', 0.55);
        }
      }
      return { moveVx, moveVy };
    }

    // ========================================================================
    // FASE 2: COMBO TRIANGULAR LEGIBLE + RECUPERACIÓN + 6 ESPADAS RÍTMICAS
    // ========================================================================
    if (this.currentState === 'P2_TRIANGLE_TELEGRAPH') {
      this.isGuarding = false;
      moveVx = 0;
      moveVy = 0;
      const totalTeleDur = 0.52;
      const progress = 1 - Math.max(0, this.stateTimer / totalTeleDur);
      this.setWindup(true, progress, '#fbbf24');

      const vStart = this.triangleVertices[this.triangleStep % 3];
      const vEnd = this.triangleVertices[(this.triangleStep + 1) % 3];
      const norm = MathUtils.normalize(vEnd.x - vStart.x, vEnd.y - vStart.y);
      this.spearDir = norm.length > 0 ? { x: norm.x, y: norm.y } : { x: 1, y: 0 };
      this.facingAngle = Math.atan2(this.spearDir.y, this.spearDir.x);

      // Enfatiza con flecha luminosa SOLO la arista activa
      this.telegraphs = [];
      for (let i = 0; i < 3; i++) {
        const pA = this.triangleVertices[i];
        const pB = this.triangleVertices[(i + 1) % 3];
        const isCurrent = i === this.triangleStep % 3;
        this.telegraphs.push({
          type: 'LINE',
          x1: pA.x,
          y1: pA.y,
          x2: pB.x,
          y2: pB.y,
          width: isCurrent ? 26 : 10,
          active: isCurrent,
          arrow: isCurrent,
        });
      }

      if (this.stateTimer <= 0) {
        this.setWindup(false, 0);
        this.spearHasHit = false;
        this.transitionToState('P2_TRIANGLE_DASH', 0.34);
      }
    } else if (this.currentState === 'P2_TRIANGLE_DASH') {
      const vEnd = this.triangleVertices[(this.triangleStep + 1) % 3];
      const toEnd = MathUtils.normalize(vEnd.x - this.x, vEnd.y - this.y);
      moveVx = toEnd.x * 1050;
      moveVy = toEnd.y * 1050;

      if (
        !this.spearHasHit &&
        MathUtils.circleCollision(
          this.x,
          this.y,
          this.radius + 5,
          targetEntity.x,
          targetEntity.y,
          targetEntity.radius
        )
      ) {
        this.spearHasHit = true;
        targetEntity.takeDamage(26, room);
      }

      if (this.stateTimer <= 0 || Math.hypot(vEnd.x - this.x, vEnd.y - this.y) <= 26) {
        this.x = vEnd.x;
        this.y = vEnd.y;
        this.triangleStep += 1;
        if (this.triangleStep < 3) {
          this.transitionToState('P2_TRIANGLE_TELEGRAPH', 0.52);
        } else {
          this.isStaggered = true;
          this.staggerVulnerableMult = 1.25;
          this.transitionToState('P2_SERAPH_RECOVERY', 1.25);
        }
      }
    } else if (this.currentState === 'P2_SERAPH_RECOVERY') {
      this.isStaggered = true;
      this.staggerVulnerableMult = 1.25;
      moveVx = 0;
      moveVy = 0;
      if (this.stateTimer <= 0) {
        this.isStaggered = false;
        this.staggerVulnerableMult = 1.0;
        this.swordsSpawnedInState = false;
        this.transitionToState('P2_SUSPENDED_SWORDS', 1.9);
      }
    } else if (this.currentState === 'P2_SUSPENDED_SWORDS') {
      if (!this.swordsSpawnedInState && room) {
        this.swordsSpawnedInState = true;
        this.spawnSixSuspendedSwords(room);
      }

      const toPlayer = MathUtils.normalize(targetEntity.x - this.x, targetEntity.y - this.y);
      moveVx = -toPlayer.y * this.speed;
      moveVy = toPlayer.x * this.speed;

      this.spiralTimer -= dt;
      if (this.spiralTimer <= 0 && room) {
        this.spiralTimer = 0.11;
        this.spiralAngle += 0.42;
        for (let k = 0; k < 4; k++) {
          const ang = this.spiralAngle + (k * Math.PI * 2) / 4;
          const feather = new EnemyProjectile(
            this.x + Math.cos(ang) * (this.radius + 6),
            this.y + Math.sin(ang) * (this.radius + 6),
            Math.cos(ang),
            Math.sin(ang),
            290,
            15,
            6,
            'SerafinBoss'
          );
          feather.ringColor = '#fb7185';
          feather.glowColor = 'rgba(251, 113, 133, 0.34)';
          feather.coreColor = '#fff1f2';
          room.enemyProjectiles.push(feather);
        }
      }

      if (this.stateTimer <= 0) {
        this.isGuarding = false;
        this.transitionToState('P2_GUARD_WINDUP', 0.42);
      }
    } else if (this.currentState === 'P2_GUARD_WINDUP') {
      this.isGuarding = false;
      moveVx = 0;
      moveVy = 0;
      const progress = 1 - Math.max(0, this.stateTimer / 0.42);
      this.setWindup(true, progress, '#fde047');
      this.telegraphs = [
        {
          type: 'CIRCLE',
          style: 'GUARD',
          x: this.x,
          y: this.y,
          radius: this.radius + 16,
          progress,
        },
      ];
      if (this.stateTimer <= 0) {
        this.setWindup(false, 0);
        this.isGuarding = true;
        this.transitionToState('P2_COUNTER_GUARD', 0.95);
      }
    } else if (this.currentState === 'P2_COUNTER_GUARD') {
      this.isGuarding = true;
      moveVx = 0;
      moveVy = 0;
      if (this.stateTimer <= 0) {
        this.isGuarding = false;
        this.setupTriangleComboVertices(targetEntity);
        this.transitionToState('P2_TRIANGLE_TELEGRAPH', 0.52);
      }
    }

    return { moveVx, moveVy };
  }

  draw(ctx) {
    this.drawTelegraphs(ctx);

    ctx.save();
    // Alas geométricas seráficas
    const wingSpan = this.radius + 18;
    const flap = Math.sin(this.aiTimer * 9) * 6;
    ctx.strokeStyle = this.phase === 2 ? '#fda4af' : '#fef08a';
    ctx.lineWidth = 3;
    for (const sign of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x + sign * wingSpan, this.y - 16 + flap);
      ctx.lineTo(this.x + sign * (wingSpan - 8), this.y + 10 + flap);
      ctx.closePath();
      ctx.fillStyle =
        this.phase === 2 ? 'rgba(244, 63, 94, 0.28)' : 'rgba(250, 204, 21, 0.25)';
      ctx.fill();
      ctx.stroke();
    }

    // Escudo de Contraataque (`isGuarding === true`)
    if (this.isGuarding) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 12, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(254, 240, 138, 0.25)';
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#fde047';
      ctx.stroke();
    }
    ctx.restore();

    super.draw(ctx);
  }
}

const BOSS_CLASSES = [GoliatBoss, NemesisBoss, AbismoBoss, SerafinBoss];

// ----------------------------------------------------------------------------
// 8. ENTIDAD JUGADOR CON ANIMACIONES DE SPRITES Y ITEMMANAGER (v2.1)
// ----------------------------------------------------------------------------
const PIG_ANIMATIONS = {
  abajo: {
    src: 'chanchos/abajo/spritesheet.png',
    frames: [
      { x: 231, y: 1, w: 227, h: 228 },
      { x: 1, y: 230, w: 225, h: 226 },
      { x: 1, y: 1, w: 229, h: 227 }
    ]
  },
  arriba: {
    src: 'chanchos/arriba/spritesheet.png',
    frames: [
      { x: 485, y: 1, w: 227, h: 199 },
      { x: 1, y: 229, w: 253, h: 227 },
      { x: 255, y: 229, w: 225, h: 223 },
      { x: 485, y: 229, w: 227, h: 229 },
      { x: 1, y: 459, w: 228, h: 229 },
      { x: 255, y: 459, w: 229, h: 228 },
      { x: 485, y: 459, w: 228, h: 228 },
      { x: 1, y: 1, w: 230, h: 227 },
      { x: 255, y: 1, w: 227, h: 225 }
    ]
  },
  derecha: {
    src: 'chanchos/derecha/spritesheet.png',
    frames: [
      { x: 258, y: 1, w: 284, h: 199 },
      { x: 1, y: 1, w: 256, h: 198 }
    ]
  },
  izquierda: {
    src: 'chanchos/izquierda/spritesheet.png',
    frames: [
      { x: 260, y: 1, w: 254, h: 195 },
      { x: 1, y: 201, w: 258, h: 198 },
      { x: 1, y: 1, w: 255, h: 199 }
    ]
  }
};

class PlayerSpriteAnimator {
  constructor() {
    this.sheets = {};
    for (const dir in PIG_ANIMATIONS) {
      const img = new Image();
      img.src = PIG_ANIMATIONS[dir].src;
      this.sheets[dir] = {
        img,
        frames: PIG_ANIMATIONS[dir].frames
      };
    }
  }

  isReady(dir) {
    const sheet = this.sheets[dir];
    return sheet && sheet.img && sheet.img.complete && sheet.img.naturalWidth > 0;
  }
}

const playerSpriteAnimator = new PlayerSpriteAnimator();

class Player extends Entity {
  constructor(x, y, uiManager = null) {
    super(x, y, 18, '#3b82f6');
    this.ui = uiManager;
    this.baseRadius = 18;
    this.sizeMultiplier = 1.0;
    this.baseSpeed = 270;
    this.speed = this.baseSpeed;
    this.baseMaxHp = 100;
    this.maxHp = this.baseMaxHp;
    this.hp = this.maxHp;

    this.invulnerableTimer = 0;
    this.roomTransitionGrace = 0;

    this.coins = 0;
    this.keys = 1;
    this.shield = 0;
    this.shopDamageMultiplier = 1.0;
    this.damageMultiplier = 1.0;
    this.extraProjectiles = 0;
    this.shopAttackSpeedMultiplier = 1.0;
    this.attackSpeedMultiplier = 1.0;

    this.coinMagnetMultiplier = 1.0;
    this.coinValueBonus = 0.0;
    this._coinDropCarry = 0.0;
    this.extraCoinChance = 0.0;
    this.enemySpawnMultiplier = 1.0;

    // Estadísticas adicionales de v2.1 / v3.5 (Crítico, Estamina Souls para Dash + Perfect Dodge)
    this.baseCritChance = 0.0;
    this.critChance = 0.0;
    this.baseMaxStamina = (typeof COMBAT_CONFIG !== 'undefined' && COMBAT_CONFIG.PLAYER_MAX_STAMINA) || 100;
    this.maxStamina = this.baseMaxStamina;
    this.stamina = this.maxStamina;
    this.baseDashCostMultiplier = 1.0;
    this.dashCostMultiplier = 1.0;
    this.staminaRegenRate = (typeof COMBAT_CONFIG !== 'undefined' && COMBAT_CONFIG.STAMINA_REGEN_RATE) || 42;
    this.staminaRegenDelayTimer = 0;
    this.staminaAttackPenaltyTimer = 0;
    this.isStaminaExhausted = false;
    this.dodgeActiveTimer = 0;
    this.dashIFrameTimer = 0;
    this.dashGlideTimer = 0;
    this.adrenalineTimer = 0;
    this.perfectDodgeInternalCd = 0;
    this.dodgeDir = { x: 0, y: 0 };
    this.extraUpgradeChoices = 0;
    this.experienceMultiplier = 1.0;
    this.relicChanceMultiplier = 1.0;

    // Defensa / Armadura Base permanente (mejorable en SanctuaryRoom v1.9)
    this.baseDefense = 0;

    // Estado de Veneno ambiental (`PoisonPuddle` v1.9: dura 4s al salir del charco)
    this.poisonTimer = 0;
    this.poisonDps = 6.0;
    this.envDotUiAccumulator = 0;

    // Diccionario de niveles elementales (v1.4+)
    this.elementalPool = {};

    this.weapons = (typeof WeaponSystem !== 'undefined')
      ? WeaponSystem.createPlayerArsenal(this)
      : [
          new ProjectileWeapon(),
          new ChargeLaserWeapon(),
          new LongSwordWeapon(),
        ];
    this.currentWeaponIndex = 0;
    this.sawShield = new OrbitalDefenseShield(this);

    // Meta-progreso de la partida actual & Gestor de Sinergias
    this.shardsCollectedThisRun = 0;
    this.synergyManager = new SynergyManager();

    // Estado de animación de sprites (chanchos v2.1)
    this.animDirection = 'abajo';
    this.animTimer = 0;
    this.isMoving = false;

    // Gestor de Reliquias basado en Hooks sin límite máximo (v2.1)
    this.itemManager = new ItemManager(this);
    this.itemManager.applyPassiveStats();
  }

  getDashStaminaCost() {
    const baseCost = (typeof COMBAT_CONFIG !== 'undefined' && COMBAT_CONFIG.DASH_STAMINA_COST) || 30;
    return Math.max(10, Math.round(baseCost * (this.dashCostMultiplier || 1.0)));
  }

  /**
   * Altar de la Mente (`NexusRoom` NG+1):
   * Conserva todas las Reliquias (y sus niveles), pero resetea las estadísticas base
   * ganadas en tiendas y santuarios a sus valores iniciales.
   */
  resetBaseStatsKeepRelics() {
    this.baseSpeed = 270;
    this.baseMaxHp = 100;
    this.baseMaxStamina = (typeof COMBAT_CONFIG !== 'undefined' && COMBAT_CONFIG.PLAYER_MAX_STAMINA) || 100;
    this.baseDashCostMultiplier = 1.0;
    this.baseDefense = 0;
    this.baseCritChance = 0.0;
    this.shopDamageMultiplier = 1.0;
    this.shopAttackSpeedMultiplier = 1.0;
    this.extraProjectiles = 0;
    this.poisonTimer = 0;
    this.itemManager.applyPassiveStats();
    this.hp = this.maxHp;
    this.stamina = this.maxStamina;
    this.isStaminaExhausted = false;
    if (this.ui) {
      this.ui.updateHealth(this);
      this.ui.updateStats(this);
    }
  }

  /**
   * Altar del Cuerpo (`NexusRoom` NG+1):
   * Conserva todas las estadísticas base súper altas, pero vacía por completo el inventario de Reliquias.
   */
  clearRelicsKeepBaseStats() {
    this.poisonTimer = 0;
    this.dashCostMultiplier = this.baseDashCostMultiplier || 1.0;
    this.maxStamina = this.baseMaxStamina || 100;
    this.stamina = this.maxStamina;
    this.isStaminaExhausted = false;
    this.extraUpgradeChoices = 0;
    this.relicChanceMultiplier = 1.0;
    const sacrificedCount = this.itemManager && Array.isArray(this.itemManager.ownedRelics)
      ? this.itemManager.ownedRelics.reduce((acc, r) => acc + (r.level || 1), 0)
      : 0;
    if (sacrificedCount > 0 && typeof BrotherEye !== 'undefined' && BrotherEye.enabled && typeof BrotherEye.recordRelicSacrifice === 'function') {
      BrotherEye.recordRelicSacrifice(sacrificedCount);
    }
    this.itemManager.clearAllRelics();
    this.hp = this.maxHp;
    if (this.ui) {
      this.ui.updateHealth(this);
      this.ui.updateStats(this);
    }
  }

  /**
   * Altar del Abismo (`NexusRoom` NG+2 o superior):
   * Conserva TODO (reliquias y estadísticas base) y restaura la salud para el siguiente ciclo.
   */
  keepAllForAbyss() {
    this.poisonTimer = 0;
    this.itemManager.applyPassiveStats();
    this.hp = this.maxHp;
    if (this.ui) {
      this.ui.updateHealth(this);
      this.ui.updateStats(this);
    }
  }

  get currentWeapon() {
    return this.weapons[this.currentWeaponIndex];
  }

  cancelCurrentAttack() {
    if (this.currentWeapon && typeof this.currentWeapon.cancel === 'function') {
      this.currentWeapon.cancel();
    }
  }

  addCoins(amount) {
    if (amount <= 0) return;
    this.coins += amount;
    soundManager.playProcedural('coin');
    if (this.itemManager) {
      this.itemManager.applyPassiveStats();
    }
    if (this.ui) {
      this.ui.updateCoins(this.coins);
    }
  }

  addShards(amount, room) {
    this.shardsCollectedThisRun += amount;
    window.metaProgression.addShards(amount);
    if (this.ui) {
      this.ui.updateShards(this.shardsCollectedThisRun, window.metaProgression.getShards());
      this.ui.spawnFloatingText(`+${amount} 💎`, '#c084fc', this.x, this.y - 14);
    }
    soundManager.playProcedural('coin', { volume: 0.35, pitchJitter: 0.25 });
  }

  addKeys(amount) {
    this.keys = Math.max(0, this.keys + amount);
    if (this.itemManager) this.itemManager.applyPassiveStats();
    if (this.ui) this.ui.updateKeys(this.keys);
  }

  useKey() {
    if (this.keys > 0) {
      this.keys -= 1;
      if (this.itemManager) this.itemManager.applyPassiveStats();
      if (this.ui) this.ui.updateKeys(this.keys);
      return true;
    }
    return false;
  }

  addShield(amount) {
    this.shield = (this.shield || 0) + amount;
    if (this.ui) this.ui.updateHealth(this);
  }

  spendCoins(amount) {
    if (amount <= 0) return;
    this.coins = Math.max(0, this.coins - amount);
    if (this.itemManager) {
      this.itemManager.applyPassiveStats();
    }
    if (this.ui) {
      this.ui.updateCoins(this.coins);
    }
  }

  heal(amount, isBloodChalice = false) {
    if (amount <= 0) return;
    const healContext = { amount, isBloodChalice };
    if (this.itemManager) {
      this.itemManager.onHeal(healContext);
    }
    if (healContext.amount <= 0 || this.hp >= this.maxHp) return;
    this.hp = Math.min(this.maxHp, this.hp + healContext.amount);
    this.itemManager.applyPassiveStats();
  }

  addOrUpgradeElement(elementKey) {
    if (!this.elementalPool[elementKey]) {
      this.elementalPool[elementKey] = 1;
    } else {
      this.elementalPool[elementKey] += 1;
    }
    if (this.ui) {
      this.ui.updateElements(this.elementalPool);
    }
    if (typeof EvolutionManager !== 'undefined') {
      const currentRoom = (window.activeGameInstance && window.activeGameInstance.currentRoom) || null;
      EvolutionManager.checkEvolutions(this, currentRoom, this.ui);
    }
    return this.elementalPool[elementKey];
  }

  getElementLevel(elementKey) {
    if (!elementKey || elementKey === 'NONE') return 0;
    return this.elementalPool[elementKey] || 1;
  }

  rollElementForAttack() {
    const ownedElements = Object.keys(this.elementalPool);
    if (ownedElements.length === 0) return 'NONE';

    if (Math.random() < CONFIG.ELEMENTAL_PROC_CHANCE) {
      const randomIdx = Math.floor(Math.random() * ownedElements.length);
      return ownedElements[randomIdx];
    }
    return 'NONE';
  }

  toggleWeaponMode() {
    if (!this.currentWeapon || typeof this.currentWeapon.toggleMode !== 'function') return;
    this.currentWeapon.toggleMode();
    soundManager.playProcedural('pedestal', { volume: 0.5 });
    if (this.ui) {
      this.ui.updateStats(this);
      this.ui.showToast(`Modo: ${this.currentWeapon.getModeBadge()}`);
    }
  }

  selectWeapon(indexOrDir) {
    if (!this.weapons || this.weapons.length === 0) return;
    const prevIdx = this.currentWeaponIndex;
    this.cancelCurrentAttack();
    if (indexOrDir === 'next') {
      this.currentWeaponIndex = (this.currentWeaponIndex + 1) % this.weapons.length;
    } else if (indexOrDir === 'prev') {
      this.currentWeaponIndex =
        (this.currentWeaponIndex - 1 + this.weapons.length) % this.weapons.length;
    } else if (
      typeof indexOrDir === 'number' &&
      indexOrDir >= 0 &&
      indexOrDir < this.weapons.length
    ) {
      this.currentWeaponIndex = indexOrDir;
    }
    if (
      prevIdx !== this.currentWeaponIndex &&
      typeof BrotherEye !== 'undefined' &&
      BrotherEye.enabled &&
      typeof BrotherEye.recordWeaponSwitch === 'function'
    ) {
      BrotherEye.recordWeaponSwitch(
        prevIdx,
        this.currentWeaponIndex,
        this.currentWeapon ? this.currentWeapon.id : null
      );
    }
    if (this.ui) {
      this.ui.updateStats(this);
    }
  }

  getDefenseMitigationMultiplier() {
    return 100 / (100 + Math.max(0, this.baseDefense));
  }

  applyPoisonEffect(duration = 4.0, dps = 6.0) {
    this.poisonTimer = Math.max(this.poisonTimer, duration);
    this.poisonDps = Math.max(this.poisonDps, dps);
  }

  /**
   * Daño continuo ambiental (DoT) para `FireZone` (muy rápido mientras se pise)
   * y `PoisonPuddle` (DoT lento durante 4s después de salir del charco).
   */
  takeEnvironmentalDoT(dps, dt, room) {
    if (this.roomTransitionGrace > 0 || this.hp <= 0) return;
    let rawStep = dps * this.getDefenseMitigationMultiplier() * dt;
    if (rawStep <= 0) return;

    const hpBefore = this.hp;
    const vitBefore = this.hp + this.shield;

    if (this.shield > 0) {
      if (this.shield >= rawStep) {
        this.shield -= rawStep;
        rawStep = 0;
      } else {
        rawStep -= this.shield;
        this.shield = 0;
      }
      if (this.ui) this.ui.updateHealth(this);
    }

    if (rawStep > 0) {
      this.hp = Math.max(0, this.hp - rawStep);
    }

    const totalDotApplied = Math.max(0, vitBefore - (this.hp + this.shield));
    if (
      totalDotApplied > 0 &&
      typeof BrotherEye !== 'undefined' &&
      BrotherEye.enabled &&
      typeof BrotherEye.recordPlayerDamage === 'function'
    ) {
      const crossedNearDeath =
        this.maxHp > 0 &&
        hpBefore / this.maxHp > 0.22 &&
        this.hp / this.maxHp <= 0.22;
      BrotherEye.recordPlayerDamage(totalDotApplied, this.hp, this.maxHp, 'Hazard', crossedNearDeath);
    }

    this.envDotUiAccumulator += dt;
    if (this.envDotUiAccumulator >= 0.14 || this.hp <= 0) {
      this.envDotUiAccumulator = 0;
      this.itemManager.applyPassiveStats();
    }
  }

  /**
   * Recibe daño ejecutando primero el Hook `onDamageTaken` del `ItemManager`
   * y dispara actualización Event-Driven de Salud/Stats en el DOM.
   */
  takeDamage(amount, room, options = {}) {
    if (!options.ignoreInvulnerability && (this.invulnerableTimer > 0 || this.roomTransitionGrace > 0)) return;

    const isSacrifice = Boolean(options.isSacrifice || options.ignoreDefense);
    const mitigatedAmount = isSacrifice ? amount : Math.max(1, Math.round(amount * this.getDefenseMitigationMultiplier()));
    const damageContext = {
      amount: mitigatedAmount,
      isProjectile: Boolean(options.isProjectile),
      vx: options.vx || 0,
      vy: options.vy || 0,
    };
    if (room) {
      this.itemManager.onDamageTaken(damageContext, room);
    }

    const hpBefore = this.hp;
    const vitBefore = this.hp + this.shield;

    if (this.shield > 0) {
      if (this.shield >= damageContext.amount) {
        this.shield -= damageContext.amount;
        damageContext.amount = 0;
      } else {
        damageContext.amount -= this.shield;
        this.shield = 0;
      }
      if (this.ui) this.ui.updateHealth(this);
    }

    const recordEyeDamage = () => {
      if (isSacrifice) return;
      const totalApplied = Math.max(0, vitBefore - (this.hp + this.shield));
      if (totalApplied > 0 && typeof HiveMindSystem !== 'undefined') {
        HiveMindSystem.recordDamageToPlayer(totalApplied);
      }
      if (
        totalApplied > 0 &&
        typeof BrotherEye !== 'undefined' &&
        BrotherEye.enabled &&
        typeof BrotherEye.recordPlayerDamage === 'function'
      ) {
        const crossedNearDeath =
          this.maxHp > 0 &&
          hpBefore / this.maxHp > 0.22 &&
          this.hp / this.maxHp <= 0.22;
        const archetype = options.sourceArchetype || (options.isProjectile ? 'ShooterEnemy' : 'Enemy');
        BrotherEye.recordPlayerDamage(totalApplied, this.hp, this.maxHp, archetype, crossedNearDeath);
      }
    };

    if (damageContext.amount <= 0) {
      recordEyeDamage();
      soundManager.playProcedural('hurt');
      if (window.activeGameInstance) {
        window.activeGameInstance.triggerScreenShake(4.0, 0.15);
      }
      return;
    }

    this.hp = Math.max(0, this.hp - damageContext.amount);
    recordEyeDamage();
    this.invulnerableTimer = 0.75;
    soundManager.playProcedural('hurt');
    if (window.activeGameInstance) {
      window.activeGameInstance.triggerScreenShake(7.0, 0.22);
      window.activeGameInstance.triggerHitStop(0.04);
    }
    this.itemManager.applyPassiveStats();
  }

  update(dt, input, room) {
    if (this.invulnerableTimer > 0) this.invulnerableTimer -= dt;
    if (this.roomTransitionGrace > 0) this.roomTransitionGrace -= dt;
    if (this.dashIFrameTimer > 0) this.dashIFrameTimer = Math.max(0, this.dashIFrameTimer - dt);
    if (this.perfectDodgeInternalCd > 0) {
      this.perfectDodgeInternalCd = Math.max(0, this.perfectDodgeInternalCd - dt);
    }

    if (this.adrenalineTimer > 0) {
      this.adrenalineTimer = Math.max(0, this.adrenalineTimer - dt);
      if (this.adrenalineTimer === 0 && this.itemManager) {
        this.itemManager.applyPassiveStats();
      }
    }

    const wasDashing = this.dodgeActiveTimer > 0;
    if (this.dodgeActiveTimer > 0) {
      this.dodgeActiveTimer = Math.max(0, this.dodgeActiveTimer - dt);
      if (wasDashing && this.dodgeActiveTimer === 0) {
        const glideDur = (typeof COMBAT_CONFIG !== 'undefined' && COMBAT_CONFIG.DASH_GLIDE_DURATION) || 0.12;
        this.dashGlideTimer = glideDur;
      }
    }
    if (this.dashGlideTimer > 0) {
      this.dashGlideTimer = Math.max(0, this.dashGlideTimer - dt);
    }

    // Regeneración continua de Estamina (Dark Souls simplona, Opción A):
    // Solo restringe Dashes; si dispara con estamina en 0 recarga más lento.
    if (this.staminaAttackPenaltyTimer > 0) {
      this.staminaAttackPenaltyTimer = Math.max(0, this.staminaAttackPenaltyTimer - dt);
    }
    if (this.staminaRegenDelayTimer > 0) {
      this.staminaRegenDelayTimer = Math.max(0, this.staminaRegenDelayTimer - dt);
    } else if (this.stamina < this.maxStamina && this.dodgeActiveTimer <= 0) {
      const baseRegen = this.staminaRegenRate || ((typeof COMBAT_CONFIG !== 'undefined' && COMBAT_CONFIG.STAMINA_REGEN_RATE) || 42);
      const talentMult = (typeof MetaProgressionManager !== 'undefined' && MetaProgressionManager.getTalentLevel)
        ? 1 + (MetaProgressionManager.getTalentLevel('dodgeMastery') || 0) * 0.14
        : 1.0;
      const penaltyMult = this.staminaAttackPenaltyTimer > 0
        ? ((typeof COMBAT_CONFIG !== 'undefined' && COMBAT_CONFIG.STAMINA_EMPTY_ATTACK_PENALTY_MULT) || 0.55)
        : 1.0;
      const prevStam = this.stamina;
      this.stamina = Math.min(this.maxStamina, this.stamina + baseRegen * talentMult * penaltyMult * dt);
      if (this.isStaminaExhausted && this.stamina >= Math.min(this.maxStamina, this.getDashStaminaCost())) {
        this.isStaminaExhausted = false;
      }
      if (this.stamina >= this.maxStamina && prevStam < this.maxStamina && room && typeof room.spawnParticle === 'function') {
        room.spawnParticle(this.x, this.y, '#38bdf8', 5);
      }
    }
    if (this.ui && typeof this.ui.updateStamina === 'function') {
      this.ui.updateStamina(this);
    }

    // Procesar DoT de Veneno (`PoisonPuddle` v1.9: dura 4 segundos tras salir del charco)
    if (this.poisonTimer > 0) {
      this.poisonTimer = Math.max(0, this.poisonTimer - dt);
      this.takeEnvironmentalDoT(this.poisonDps, dt, room);
    }

    // Hook de arquetipo móvil por tick (v2.6)
    if (window.PIG_ARCHETYPES && this.archetype && window.PIG_ARCHETYPES[this.archetype]?.onTick) {
      window.PIG_ARCHETYPES[this.archetype].onTick(this, dt);
    }

    const moveVec = input.getMovementVector();
    const aimState = input.getAimAndAttackState(this);

    if (typeof CombatSystem !== 'undefined') {
      CombatSystem.handlePlayerDash(this, input, room, aimState, moveVec);
    } else if (input.consumeDodgeTrigger() && this.dodgeActiveTimer <= 0 && !this.isStaminaExhausted && this.stamina > 0) {
      const dashCost = this.getDashStaminaCost();
      this.cancelCurrentAttack();
      this.stamina = Math.max(0, this.stamina - dashCost);
      if (this.stamina <= 0) {
        this.isStaminaExhausted = true;
        this.staminaRegenDelayTimer = 0.72;
      } else {
        this.staminaRegenDelayTimer = 0.36;
      }
      this.dodgeActiveTimer = 0.20;
      this.dashIFrameTimer = 0.30;
      this.dashGlideTimer = 0;
      this.invulnerableTimer = Math.max(this.invulnerableTimer, 0.30);
      this.dodgeDir =
        moveVec.length > 0
          ? { x: moveVec.x, y: moveVec.y }
          : { x: aimState.aimX, y: aimState.aimY };
      if (room) {
        room.spawnParticle(this.x, this.y, '#93c5fd', 10);
      }
      if (this.ui && typeof this.ui.updateStamina === 'function') this.ui.updateStamina(this);
    }

    // Durante el Dash o sus I-Frames, el jugador ignora slows ambientales (zonas de gravedad / charcos)
    const isDashingNow = (typeof CombatSystem !== 'undefined')
      ? CombatSystem.isPlayerDashing(this)
      : (this.dodgeActiveTimer > 0 || this.dashIFrameTimer > 0);
    const envSpeedMult = isDashingNow
      ? 1.0
      : (room && typeof room.getEntitySpeedMultiplier === 'function'
        ? room.getEntitySpeedMultiplier(this)
        : 1.0);

    const prevPlayerX = this.x;
    const prevPlayerY = this.y;

    if (this.dodgeActiveTimer > 0) {
      // Durante el impulso evasivo (dodge / dash), el cerdito salta por los aires sobre los abismos
      const dashMult = (typeof COMBAT_CONFIG !== 'undefined' && COMBAT_CONFIG.DASH_SPEED_MULT) || 2.50;
      this.vx = this.dodgeDir.x * this.speed * dashMult;
      this.vy = this.dodgeDir.y * this.speed * dashMult;
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      // Desplazamiento dinámico de enemigos para no quedar encajonado
      if (typeof CombatSystem !== 'undefined') {
        CombatSystem.processDashEnemyDisplacement(this, room, dt);
      }
    } else if (this.dashGlideTimer > 0) {
      // Post-Dash Momentum Glide: transición fluida para encadenar esquivas sin freno brusco
      const glideMax = (typeof COMBAT_CONFIG !== 'undefined' && COMBAT_CONFIG.DASH_GLIDE_DURATION) || 0.12;
      const glideRatio = MathUtils.clamp(this.dashGlideTimer / glideMax, 0, 1);
      const glideDirX = moveVec.length > 0 ? moveVec.x : this.dodgeDir.x;
      const glideDirY = moveVec.length > 0 ? moveVec.y : this.dodgeDir.y;
      const glideMult = 1.0 + 0.85 * glideRatio;
      this.vx = glideDirX * this.speed * envSpeedMult * glideMult;
      this.vy = glideDirY * this.speed * envSpeedMult * glideMult;

      this.x += this.vx * dt;
      if (room && typeof room.isPointInPit === 'function' && room.isPointInPit(this.x, this.y, this.radius)) {
        this.x = prevPlayerX;
      }
      this.y += this.vy * dt;
      if (room && typeof room.isPointInPit === 'function' && room.isPointInPit(this.x, this.y, this.radius)) {
        this.y = prevPlayerY;
      }
    } else {
      this.vx = moveVec.x * this.speed * envSpeedMult;
      this.vy = moveVec.y * this.speed * envSpeedMult;

      // Movimiento con resolución por eje para deslizarse suavemente por los bordes de los pozos
      this.x += this.vx * dt;
      if (room && typeof room.isPointInPit === 'function' && room.isPointInPit(this.x, this.y, this.radius)) {
        this.x = prevPlayerX;
      }

      this.y += this.vy * dt;
      if (room && typeof room.isPointInPit === 'function' && room.isPointInPit(this.x, this.y, this.radius)) {
        this.y = prevPlayerY;
      }
    }

    // Si terminó la esquiva y el jugador quedó justo adentro de un abismo, rescatarlo a tierra firme
    if (this.dodgeActiveTimer <= 0 && room && typeof room.isPointInPit === 'function' && room.isPointInPit(this.x, this.y, this.radius)) {
      if (typeof room.resolveSafeGround === 'function') {
        room.resolveSafeGround(this);
      }
    }

    // Estado y dirección de animación de sprites (chanchos)
    this.isMoving = moveVec.length > 0 || this.dodgeActiveTimer > 0;
    if (aimState.isAttacking) {
      if (Math.abs(aimState.aimX) > Math.abs(aimState.aimY)) {
        this.animDirection = aimState.aimX > 0 ? 'derecha' : 'izquierda';
      } else {
        this.animDirection = aimState.aimY > 0 ? 'abajo' : 'arriba';
      }
    } else if (moveVec.length > 0) {
      if (Math.abs(moveVec.x) > Math.abs(moveVec.y)) {
        this.animDirection = moveVec.x > 0 ? 'derecha' : 'izquierda';
      } else {
        this.animDirection = moveVec.y > 0 ? 'abajo' : 'arriba';
      }
    }

    if (this.isMoving) {
      this.animTimer += dt * 8.0;
    } else {
      this.animTimer = 0;
    }

    // Ejecutar Hook continuo `onUpdate` del ItemManager (Satélites, Singularidad, CDs)
    this.itemManager.onUpdate(dt, room);

    this.sawShield.update(dt, this, room);
    this.currentWeapon.update(dt, this, room, aimState);
    if (this.synergyManager) {
      try {
        this.synergyManager.update(this, this.ui, room);
      } catch (err) {
        console.error('Error actualizando sinergias:', err);
      }
    }
    if (window.synergyEngine) {
      try {
        window.synergyEngine.update(this, this.ui, room);
      } catch (err) {
        console.error('Error actualizando synergyEngine:', err);
      }
    }
  }

  draw(ctx, input, room) {
    // Dibujar efectos visuales de las Reliquias activas (Satélites, Escudo, Onda expansiva)
    this.itemManager.onDraw(ctx, room);

    this.sawShield.draw(ctx);
    const aimState = input.getAimAndAttackState(this);
    this.currentWeapon.draw(ctx, this, aimState);

    ctx.save();
    if (this.adrenalineTimer > 0) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 9, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.72)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (this.dodgeActiveTimer > 0) {
      ctx.beginPath();
      ctx.arc(
        this.x - this.dodgeDir.x * 14,
        this.y - this.dodgeDir.y * 14,
        this.radius * 0.9,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = 'rgba(147, 197, 253, 0.35)';
      ctx.fill();
    }

    if (this.invulnerableTimer > 0 && Math.floor(this.invulnerableTimer * 16) % 2 === 0) {
      ctx.globalAlpha = 0.45;
    }

    // Animaciones del chancho (chanchos/abajo, arriba, derecha, izquierda)
    const spriteAnim = playerSpriteAnimator;
    if (spriteAnim && spriteAnim.isReady(this.animDirection)) {
      const sheet = spriteAnim.sheets[this.animDirection];
      const frames = sheet.frames;
      const frameIdx = this.isMoving ? Math.floor(this.animTimer) % frames.length : 0;
      const frame = frames[frameIdx];

      // Elevación óptica en el aire al saltar fosos durante la esquiva
      const jumpElevation = this.dodgeActiveTimer > 0 ? -12 * Math.sin((this.dodgeActiveTimer / 0.20) * Math.PI) : 0;

      // Sombra suave proyectada bajo el personaje
      ctx.beginPath();
      ctx.ellipse(this.x, this.y + this.radius * 0.85, this.radius * 0.95, this.radius * 0.45, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
      ctx.fill();

      // Renderizado del sprite escalado armónicamente al radio del jugador
      const drawSize = this.radius * 2.5;
      const aspect = frame.w / frame.h;
      const drawW = drawSize * (aspect > 1 ? aspect : 1);
      const drawH = drawSize * (aspect < 1 ? 1 / aspect : 1);

      ctx.drawImage(
        sheet.img,
        frame.x,
        frame.y,
        frame.w,
        frame.h,
        this.x - drawW / 2,
        this.y - drawH / 2 - 2 + jumpElevation,
        drawW,
        drawH
      );
    } else {
      const jumpElevation = this.dodgeActiveTimer > 0 ? -12 * Math.sin((this.dodgeActiveTimer / 0.18) * Math.PI) : 0;
      // Fallback geométrico clásico (círculo azul + ojo) si la imagen aún no cargó
      ctx.beginPath();
      ctx.arc(this.x, this.y + jumpElevation, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = this.poisonTimer > 0 ? '#4ade80' : '#93c5fd';
      ctx.stroke();

      const eyeX = this.x + aimState.aimX * (this.radius * 0.45);
      const eyeY = this.y + aimState.aimY * (this.radius * 0.45) + jumpElevation;
      ctx.beginPath();
      ctx.arc(eyeX, eyeY, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#e0f2fe';
      ctx.fill();
    }

    if (this.poisonTimer > 0) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 6, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(74, 222, 128, 0.75)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  }
}

// ----------------------------------------------------------------------------
// 9. TRAMPAS AMBIENTALES, SANTUARIO Y JERARQUÍA POLIMÓRFICA DE SALAS (v1.9)
// ----------------------------------------------------------------------------

/**
 * 1. `SpikeTrap` (Pinchos - Trampa Temporizada v1.9):
 *  - Ciclo de 3 estados:
 *      - `HIDDEN` (2.0s): Oculta e inofensiva.
 *      - `WARNING` (1.0s): Aviso / telegrafiado visual (puntas emergiendo y marco ámbar).
 *      - `ACTIVE` (1.5s): Activa; aplica daño masivo instantáneo si el jugador O un
 *        enemigo colisiona con ella.
 */
class SpikeTrap extends Entity {
  constructor(x, y, radius = 38, initialPhaseOffset = 0) {
    super(x, y, radius, '#64748b');
    this.hiddenDuration = 2.0;
    this.warningDuration = 1.0;
    this.activeDuration = 1.5;
    this.totalCycle = this.hiddenDuration + this.warningDuration + this.activeDuration; // 4.5s
    this.cycleTimer = initialPhaseOffset % this.totalCycle;
    this.state = 'HIDDEN';
    this.playerDamage = 32;
    this.enemyDamage = 55;
    this.hitEnemiesInCycle = new Set();
  }

  update(dt, player, room) {
    const prevState = this.state;
    this.cycleTimer = (this.cycleTimer + dt) % this.totalCycle;

    if (this.cycleTimer < this.hiddenDuration) {
      this.state = 'HIDDEN';
    } else if (this.cycleTimer < this.hiddenDuration + this.warningDuration) {
      this.state = 'WARNING';
    } else {
      this.state = 'ACTIVE';
    }

    if (prevState === 'ACTIVE' && this.state !== 'ACTIVE') {
      this.hitEnemiesInCycle.clear();
    }

    if (this.state === 'ACTIVE') {
      // 1. Afecta al Jugador (daño masivo instantáneo)
      if (
        player &&
        MathUtils.circleCollision(this.x, this.y, this.radius, player.x, player.y, player.radius)
      ) {
        player.takeDamage(this.playerDamage, room, { sourceArchetype: 'Hazard' });
      }

      // 2. Afecta a TODOS los Enemigos de la sala
      if (room && room.enemies) {
        for (const enemy of room.enemies) {
          if (
            enemy.markedForDeletion ||
            enemy.isBurrowed ||
            this.hitEnemiesInCycle.has(enemy)
          ) {
            continue;
          }
          if (
            MathUtils.circleCollision(
              this.x,
              this.y,
              this.radius,
              enemy.x,
              enemy.y,
              enemy.radius
            )
          ) {
            this.hitEnemiesInCycle.add(enemy);
            enemy.takeDamage(this.enemyDamage, 0, 0, 'BLEED');
            room.spawnParticle(enemy.x, enemy.y, 0, -60, 4, '#ef4444', 0.35);
          }
        }
      }
    }
  }

  draw(ctx) {
    ctx.save();
    // Placa base metálica octogonal/circular en el piso
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle =
      this.state === 'ACTIVE'
        ? 'rgba(127, 29, 29, 0.55)'
        : this.state === 'WARNING'
        ? 'rgba(180, 83, 9, 0.35)'
        : 'rgba(15, 23, 42, 0.72)';
    ctx.fill();
    ctx.lineWidth = this.state === 'HIDDEN' ? 1.5 : 2.5;
    ctx.strokeStyle =
      this.state === 'ACTIVE'
        ? '#ef4444'
        : this.state === 'WARNING'
        ? '#f59e0b'
        : '#334155';
    if (this.state === 'WARNING') ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Dibujar los 7 agujeros / pinchos en formación hexagonal
    const offsets = [
      { dx: 0, dy: 0 },
      { dx: -16, dy: -10 },
      { dx: 16, dy: -10 },
      { dx: -16, dy: 10 },
      { dx: 16, dy: 10 },
      { dx: 0, dy: -20 },
      { dx: 0, dy: 20 },
    ];

    for (const off of offsets) {
      const sx = this.x + off.dx;
      const sy = this.y + off.dy;

      // Cavidad del pincho
      ctx.beginPath();
      ctx.arc(sx, sy, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#090d16';
      ctx.fill();

      if (this.state === 'WARNING') {
        // Telegrafiado visual (1.0s): puntas metálicas asomándose
        ctx.beginPath();
        ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = '#facc15';
        ctx.fill();
      } else if (this.state === 'ACTIVE') {
        // Activa (1.5s): pinchos de acero afilados emergidos
        ctx.beginPath();
        ctx.moveTo(sx, sy - 11);
        ctx.lineTo(sx + 5, sy + 3);
        ctx.lineTo(sx - 5, sy + 3);
        ctx.closePath();
        ctx.fillStyle = '#e2e8f0';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#ef4444';
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

/**
 * 2. `FireZone` (Zona de Fuego - Trampa Estática v1.9):
 *  - Estática en el piso.
 *  - Aplica daño continuo (DoT) muy rápido mientras cualquier entidad (Jugador o Enemigo)
 *    esté encima.
 *  - Renderizada como polígonos naranjas/rojos translúcidos animados.
 */
class FireZone extends Entity {
  constructor(x, y, radius = 52) {
    super(x, y, radius, '#f97316');
    this.playerDps = 28; // DoT continuo muy rápido al jugador
    this.enemyDps = 48; // DoT continuo muy rápido a los enemigos
    this.animTimer = Math.random() * Math.PI * 2;
    this.emberTimer = 0;
  }

  update(dt, player, room) {
    this.animTimer += dt * 6.5;
    this.emberTimer -= dt;

    // 1. Afecta al Jugador mientras esté encima
    if (
      player &&
      MathUtils.circleCollision(this.x, this.y, this.radius, player.x, player.y, player.radius)
    ) {
      player.takeEnvironmentalDoT(this.playerDps, dt, room);
    }

    // 2. Afecta a TODOS los Enemigos mientras estén encima
    if (room && room.enemies) {
      for (const enemy of room.enemies) {
        if (enemy.markedForDeletion || enemy.isBurrowed) continue;
        if (
          MathUtils.circleCollision(this.x, this.y, this.radius, enemy.x, enemy.y, enemy.radius)
        ) {
          enemy.takeDamage(this.enemyDps * dt, 0, 0, 'FIRE');
        }
      }
    }

    if (this.emberTimer <= 0 && room) {
      this.emberTimer = 0.22;
      const ang = Math.random() * Math.PI * 2;
      const dist = Math.random() * (this.radius * 0.7);
      room.spawnParticle(
        this.x + Math.cos(ang) * dist,
        this.y + Math.sin(ang) * dist,
        (Math.random() - 0.5) * 25,
        -35 - Math.random() * 30,
        3.5,
        '#fb923c',
        0.35
      );
    }
  }

  draw(ctx) {
    ctx.save();
    // Polígono exterior rojo translúcido (10 vértices oscilantes)
    const outerSides = 10;
    ctx.beginPath();
    for (let i = 0; i < outerSides; i++) {
      const a = (i * Math.PI * 2) / outerSides + this.animTimer * 0.15;
      const wobble = Math.sin(this.animTimer + i * 1.7) * 6;
      const r = this.radius + wobble;
      const px = this.x + Math.cos(a) * r;
      const py = this.y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(239, 68, 68, 0.34)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(249, 115, 22, 0.75)';
    ctx.stroke();

    // Polígono interior naranja/ámbar translúcido (8 vértices)
    const innerSides = 8;
    ctx.beginPath();
    for (let i = 0; i < innerSides; i++) {
      const a = (i * Math.PI * 2) / innerSides - this.animTimer * 0.25;
      const wobble = Math.cos(this.animTimer * 1.3 + i * 2.1) * 5;
      const r = this.radius * 0.62 + wobble;
      const px = this.x + Math.cos(a) * r;
      const py = this.y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(249, 115, 22, 0.45)';
    ctx.fill();
    ctx.restore();
  }
}

/**
 * 3. `PoisonPuddle` (Charco Venenoso - Trampa Estática v1.9):
 *  - No hace daño de impacto directo.
 *  - Reduce la velocidad de movimiento de cualquier entidad (Jugador o Enemigo) al 50%
 *    mientras la pise (`isSlowingHazard = true`, `speedMultiplier = 0.5`).
 *  - Aplica un efecto de estado de veneno (`POISON`: DoT lento que dura 4.0 segundos
 *    después de salir del charco).
 */
class PoisonPuddle extends Entity {
  constructor(x, y, radius = 56) {
    super(x, y, radius, '#22c55e');
    this.isSlowingHazard = true;
    this.speedMultiplier = 0.5;
    this.poisonDuration = 4.0;
    this.playerPoisonDps = 6.5;
    this.enemyPoisonDps = 18.0;
    this.bubbleTimer = Math.random() * Math.PI * 2;
  }

  update(dt, player, room) {
    this.bubbleTimer += dt * 4;

    // 1. Si el Jugador pisa el charco: refresca el estado de veneno de 4.0s
    if (
      player &&
      MathUtils.circleCollision(this.x, this.y, this.radius, player.x, player.y, player.radius)
    ) {
      player.applyPoisonEffect(this.poisonDuration, this.playerPoisonDps);
    }

    // 2. Si cualquier Enemigo pisa el charco: refresca el estado de veneno de 4.0s
    if (room && room.enemies) {
      for (const enemy of room.enemies) {
        if (enemy.markedForDeletion || enemy.isBurrowed) continue;
        if (
          MathUtils.circleCollision(this.x, this.y, this.radius, enemy.x, enemy.y, enemy.radius)
        ) {
          enemy.applyPoisonEffect(this.poisonDuration, this.enemyPoisonDps);
        }
      }
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(22, 163, 74, 0.36)';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.7)';
    ctx.stroke();

    // Burbujas tóxicas internas en el charco
    for (let i = 0; i < 4; i++) {
      const ang = (i * Math.PI) / 2 + 0.5;
      const dist = this.radius * 0.45;
      const bx = this.x + Math.cos(ang) * dist;
      const by = this.y + Math.sin(ang) * dist;
      const br = 4 + Math.sin(this.bubbleTimer + i * 1.6) * 2;
      ctx.beginPath();
      ctx.arc(bx, by, Math.max(2, br), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(134, 239, 172, 0.55)';
      ctx.fill();
    }
    ctx.restore();
  }
}

/**
 * Entidad Interactiva `SanctuaryAltar` (Altares del Santuario de Atributos v1.9):
 * Se instancian 3 altares alineados horizontalmente de izquierda a derecha en `SanctuaryRoom`:
 *  1. `POTION_HP` (Izquierda): Poción de Vida -> Restaura el 30% de la Vida Máxima.
 *  2. `BOOTS_SPEED` (Centro): Botas de Agilidad -> Incrementa la velocidad de movimiento base permanentemente.
 *  3. `ARMOR_PLATES` (Derecha): Placas de Defensa -> Incrementa la defensa/armadura base permanentemente.
 */
class SanctuaryAltar extends Entity {
  constructor(x, y, altarType, title, cost, color) {
    super(x, y, 24, color);
    this.altarType = altarType;
    this.title = title;
    this.cost = cost;
    this.purchased = false;
    this.floatTimer = Math.random() * Math.PI * 2;
  }

  update(dt, player, room) {
    this.floatTimer += dt * 3.5;
    // Ya no compra accidentalmente por colisión. Se adquiere con [E] o click en el prompt.
    return false;
  }

  buy(player, room) {
    if (this.purchased || !player) return false;

    if (player.coins >= this.cost) {
      player.spendCoins(this.cost);
      this.purchased = true;

      if (this.altarType === 'POTION_HP') {
        player.baseMaxHp += 15;
        player.itemManager.applyPassiveStats();
        const healAmt = Math.max(1, Math.round(player.maxHp * 0.3));
        player.heal(healAmt);
        if (player.ui) {
          player.ui.showToast(
            `SANTUARIO: ¡Poción de Vida activada! (+15 HP Máx Base y +${healAmt} HP restaurados)`
          );
        }
      } else if (this.altarType === 'BOOTS_SPEED') {
        player.baseSpeed += 26;
        player.itemManager.applyPassiveStats();
        if (player.ui) {
          player.ui.showToast('SANTUARIO: ¡Botas de Agilidad adquiridas! (+26 Velocidad Base permanente)');
        }
      } else if (this.altarType === 'ARMOR_PLATES') {
        player.baseDefense += 25;
        player.itemManager.applyPassiveStats();
        if (player.ui) {
          player.ui.showToast('SANTUARIO: ¡Placas de Defensa equipadas! (+25 Armadura Base permanente)');
        }
      }

      if (player.itemManager) {
        player.itemManager.onUpgradeChosen(this.altarType);
      }

      if (typeof soundManager !== 'undefined' && soundManager) {
        soundManager.playProcedural('pedestal');
      }

      if (player.ui) {
        player.ui.updateCoins(player.coins);
        player.ui.spawnFloatingText(`★ ${this.title.toUpperCase()} ★`, this.color, this.x, this.y - 28);
      }

      if (room) {
        if (room.altars) {
          room.altars = [this];
          if (player.ui) player.ui.updateRoomInfo(room, null);
        }
        for (let i = 0; i < 14; i++) {
          const ang = (i * Math.PI * 2) / 14;
          room.spawnParticle(
            this.x,
            this.y,
            Math.cos(ang) * 115,
            Math.sin(ang) * 115,
            4.5,
            this.color,
            0.5
          );
        }
      }
      return true;
    } else {
      if (typeof soundManager !== 'undefined' && soundManager) {
        soundManager.playProcedural('hurt');
      }
      if (player.ui) {
        player.ui.showToast(`Monedas insuficientes para ${this.title} (Requiere ${this.cost} 🪙)`);
        player.ui.spawnFloatingText(`🔒 REQUIERE ${this.cost} 🪙`, '#ef4444', this.x, this.y - 25);
      }
      return false;
    }
  }

  interact(player, room) {
    return this.buy(player, room);
  }

  draw(ctx, player) {
    const offsetY = Math.sin(this.floatTimer) * 3.5;
    const canAfford = player && player.coins >= this.cost;

    ctx.save();
    // Base de altar de piedra sagrada
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = this.purchased ? '#334155' : canAfford ? this.color : '#ef4444';
    ctx.lineWidth = 2.5;
    ctx.fillRect(this.x - 34, this.y + 14, 68, 16);
    ctx.strokeRect(this.x - 34, this.y + 14, 68, 16);

    if (!this.purchased) {
      const oy = this.y - 5 + offsetY;
      ctx.beginPath();
      ctx.arc(this.x, oy, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = this.color;
      ctx.stroke();

      // Iconografía geométrica pura según el tipo de altar (Cero ctx.fillText)
      ctx.fillStyle = this.color;
      ctx.strokeStyle = this.color;
      if (this.altarType === 'POTION_HP') {
        // Cruz médica de Poción de Vida (+30% HP)
        ctx.fillRect(this.x - 3.5, oy - 10, 7, 20);
        ctx.fillRect(this.x - 10, oy - 3.5, 20, 7);
      } else if (this.altarType === 'BOOTS_SPEED') {
        // Silueta de Bota Alada / Velocidad
        ctx.beginPath();
        ctx.moveTo(this.x - 6, oy - 10);
        ctx.lineTo(this.x + 2, oy - 10);
        ctx.lineTo(this.x + 2, oy + 2);
        ctx.lineTo(this.x + 11, oy + 4);
        ctx.lineTo(this.x + 11, oy + 9);
        ctx.lineTo(this.x - 8, oy + 9);
        ctx.closePath();
        ctx.fill();
      } else if (this.altarType === 'ARMOR_PLATES') {
        // Escudo heráldico de Placas de Defensa
        ctx.beginPath();
        ctx.moveTo(this.x - 10, oy - 9);
        ctx.lineTo(this.x + 10, oy - 9);
        ctx.lineTo(this.x + 10, oy + 1);
        ctx.lineTo(this.x, oy + 11);
        ctx.lineTo(this.x - 10, oy + 1);
        ctx.closePath();
        ctx.fill();
      }

      // Pips geométricos de costo en monedas debajo del altar
      const pipSpacing = 10;
      const startX = this.x - ((this.cost - 1) * pipSpacing) / 2;
      for (let i = 0; i < this.cost; i++) {
        ctx.beginPath();
        ctx.arc(startX + i * pipSpacing, this.y + 40, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = canAfford ? '#facc15' : '#ef4444';
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

/**
 * Nube Tóxica Aliada (`ToxicCloudHazard` - v2.1 `TOXIC_GRENADE`):
 * Instanciada por `room.spawnPoisonCloud(x, y, options)`. Daña y envenena continuamente
 * a los enemigos dentro de su radio durante `duration` segundos.
 */
class ToxicCloudHazard extends Entity {
  constructor(x, y, options = {}) {
    const radius = options.radius || 100;
    super(x, y, radius, '#22c55e');
    this.duration = options.duration || 5.0;
    this.maxDuration = this.duration;
    this.damagePerSecond = options.damagePerSecond || 15;
    this.pulseTimer = Math.random() * Math.PI * 2;
  }

  update(dt, player, room) {
    this.pulseTimer += dt * 4.5;
    this.duration -= dt;
    if (this.duration <= 0) {
      this.markedForDeletion = true;
      return;
    }

    if (room && room.enemies) {
      for (const enemy of room.enemies) {
        if (enemy.markedForDeletion || enemy.isBurrowed) continue;
        if (
          MathUtils.circleCollision(this.x, this.y, this.radius, enemy.x, enemy.y, enemy.radius)
        ) {
          enemy.takeDamage(this.damagePerSecond * dt, 0, 0, 'POISON');
          enemy.applyPoisonEffect(3.0, this.damagePerSecond * 0.6);
        }
      }
    }
  }

  draw(ctx) {
    const alpha = MathUtils.clamp(this.duration / this.maxDuration, 0.15, 1.0);
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(34, 197, 94, ${(0.22 * alpha).toFixed(3)})`;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = `rgba(74, 222, 128, ${(0.65 * alpha).toFixed(3)})`;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    for (let i = 0; i < 5; i++) {
      const a = this.pulseTimer * 0.4 + (i * Math.PI * 2) / 5;
      const d = this.radius * 0.55;
      const sx = this.x + Math.cos(a) * d;
      const sy = this.y + Math.sin(a) * d;
      ctx.beginPath();
      ctx.arc(sx, sy, 5 + Math.sin(this.pulseTimer + i) * 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(134, 239, 172, ${(0.45 * alpha).toFixed(3)})`;
      ctx.fill();
    }
    ctx.restore();
  }
}

/**
 * CLASE `RoomPit` (Abismo / Foso / Vacío intransitable - v2.1):
 * Define una región de caída al vacío en el piso de la habitación.
 *  - Bloquea el movimiento terrestre de jugador y enemigos.
 *  - El cerdito puede saltar por encima con la Esquiva (`[SHIFT]`).
 *  - Los proyectiles y láseres vuelan libremente a través de los fosos.
 *  - Si un enemigo recibe un empuje/knockback hacia el foso, cae y muere instantáneamente.
 */
class RoomPit {
  constructor(x, y, w, h, label = 'Abismo') {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.label = label;
  }

  collidesWithCircle(cx, cy, r) {
    return MathUtils.circleAABBCollision(cx, cy, r, this.x, this.y, this.w, this.h);
  }

  containsPoint(px, py) {
    return px >= this.x && px <= this.x + this.w && py >= this.y && py <= this.y + this.h;
  }

  draw(ctx) {
    ctx.save();

    // 1. Fondo abisal profundo con gradiente de vacío
    const grad = ctx.createLinearGradient(this.x, this.y, this.x, this.y + this.h);
    grad.addColorStop(0, '#020408');
    grad.addColorStop(0.2, '#000000');
    grad.addColorStop(0.85, '#040711');
    grad.addColorStop(1, '#0b1329');

    ctx.fillStyle = grad;
    ctx.fillRect(this.x, this.y, this.w, this.h);

    // 2. Líneas de profundidad vertical simulando cornisa rocosa
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.45)';
    ctx.lineWidth = 1;
    const step = 44;
    for (let lx = this.x + step; lx < this.x + this.w; lx += step) {
      ctx.beginPath();
      ctx.moveTo(lx, this.y + 4);
      ctx.lineTo(lx, this.y + Math.min(this.h - 4, 26));
      ctx.stroke();
    }

    // 3. Sombra de borde superior
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(this.x, this.y, this.w, 8);

    // 4. Borde de roca biselada
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(this.x, this.y, this.w, this.h);

    // 5. Destellos sutiles de energía abisal en las esquinas
    ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.fillRect(this.x, this.y, 4, 4);
    ctx.fillRect(this.x + this.w - 4, this.y, 4, 4);
    ctx.fillRect(this.x, this.y + this.h - 4, 4, 4);
    ctx.fillRect(this.x + this.w - 4, this.y + this.h - 4, 4, 4);

    ctx.restore();
  }
}

/**
 * CLASE BASE POLIMÓRFICA `Room` (v1.9+ / v2.1):
 * Define la física de bordes, puertas, bucle de actualización y renderizado con Z-Index
 * lógico (las trampas `hazards` y altares se dibujan en el piso ANTES de los enemigos y el jugador).
 * Ahora soporta layouts de fosos, pasillos y abismos intransitables (`RoomPit`).
 * Todas las habitaciones especializadas heredan de `Room`.
 */
class Room {
  constructor(gridX, gridY, type = 'NORMAL', sectionNumber = 1, levelNumber = 1, layoutType = 'OPEN') {
    this.gridX = gridX;
    this.gridY = gridY;
    this.type = type;
    this.sectionNumber = sectionNumber;
    this.levelNumber = levelNumber;
    this.isExitRoom = false;
    this.layoutType = layoutType;

    this.doors = { N: false, S: false, E: false, W: false };
    this.doorOffsets = {}; // Posiciones dinámicas de puertas alineadas con caminos ({ N: x, S: x, W: y, E: y })
    this.visited = false;
    this.cleared = false;

    // Dimensiones dinámicas por habitación (permite pasillos angostos, arenas amplias y salas asimétricas)
    this.bounds = {
      left: ROOM_BOUNDS.left,
      right: ROOM_BOUNDS.right,
      top: ROOM_BOUNDS.top,
      bottom: ROOM_BOUNDS.bottom,
      width: ROOM_BOUNDS.right - ROOM_BOUNDS.left,
      height: ROOM_BOUNDS.bottom - ROOM_BOUNDS.top,
      centerX: ROOM_BOUNDS.centerX,
      centerY: ROOM_BOUNDS.centerY,
    };

    this.pits = [];
    this.keys = [];
    this.hearts = [];
    this.obstacles = [];
    this.pedestals = [];
    this.decals = [];
    this.isLocked = false;
    this.enemies = [];
    this.projectiles = [];
    this.enemyProjectiles = [];
    this.hazards = []; // Trampas ambientales y peligros de piso (afectan a jugador y enemigos)
    this.altars = []; // Altares del Santuario (SanctuaryRoom)
    this.coins = [];
    this.relicChests = [];
    this.lockedChests = [];
    this.vaultChest = null;
    this.transmutationAnvil = null;
    this.smugglerBriefcase = null;
    this.merchantSafe = null;
    this.shopItems = [];
    this.shopSelectionMade = false;
    this.particles = [];
    this.portalPulse = 0;
    this.bossName = null;
    this.chest = null;

    this.exitPortal = {
      x: ROOM_BOUNDS.centerX,
      y: ROOM_BOUNDS.centerY,
      radius: 26,
    };

    this.initLayout(this.layoutType);
  }

  getDoorPosition(dirKey) {
    const b = this.bounds;
    if (dirKey === 'N') {
      const x = this.doorOffsets.N !== undefined ? this.doorOffsets.N : b.centerX;
      return { x, y: b.top };
    } else if (dirKey === 'S') {
      const x = this.doorOffsets.S !== undefined ? this.doorOffsets.S : b.centerX;
      return { x, y: b.bottom };
    } else if (dirKey === 'W') {
      const y = this.doorOffsets.W !== undefined ? this.doorOffsets.W : b.centerY;
      return { x: b.left, y };
    } else if (dirKey === 'E') {
      const y = this.doorOffsets.E !== undefined ? this.doorOffsets.E : b.centerY;
      return { x: b.right, y };
    }
    return { x: b.centerX, y: b.centerY };
  }

  /**
   * Garantiza que ningún foso o abismo obstruya el umbral de una puerta activa.
   */
  ensureDoorPassages() {
    const margin = 55;
    for (const dirKey of ['N', 'S', 'E', 'W']) {
      if (!this.doors[dirKey]) continue;
      const dPos = this.getDoorPosition(dirKey);
      const doorZone = {
        left: dPos.x - margin,
        right: dPos.x + margin,
        top: dPos.y - margin,
        bottom: dPos.y + margin,
      };
      this.pits = this.pits.filter((pit) => {
        const overlaps = !(
          pit.x > doorZone.right ||
          pit.x + pit.w < doorZone.left ||
          pit.y > doorZone.bottom ||
          pit.y + pit.h < doorZone.top
        );
        return !overlaps;
      });
    }
  }

  initLayout(layoutType = 'OPEN') {
    this.pits = [];
    this.doorOffsets = {};
    this.layoutType = layoutType;

    // Reiniciar dimensiones a los límites estándar (960x640: centro exacto 480, 320)
    this.bounds = {
      left: ROOM_BOUNDS.left,
      right: ROOM_BOUNDS.right,
      top: ROOM_BOUNDS.top,
      bottom: ROOM_BOUNDS.bottom,
      width: ROOM_BOUNDS.right - ROOM_BOUNDS.left,
      height: ROOM_BOUNDS.bottom - ROOM_BOUNDS.top,
      centerX: ROOM_BOUNDS.centerX,
      centerY: ROOM_BOUNDS.centerY,
    };

    if (layoutType === 'OPEN') {
      return;
    }

    if (layoutType === 'CORRIDOR_H') {
      // Pasillo Horizontal auténtico: sala estrecha (altura 280px centrada en 320)
      this.bounds.top = 180;
      this.bounds.bottom = 460;
      this.bounds.height = this.bounds.bottom - this.bounds.top;
      this.bounds.centerY = 320;
      this.doorOffsets = { W: 320, E: 320, N: 480, S: 480 };
      this.pits.push(new RoomPit(320, 180, 120, 35, 'Grieta Cornisa Norte'));
      this.pits.push(new RoomPit(520, 425, 120, 35, 'Grieta Cornisa Sur'));
    } else if (layoutType === 'CORRIDOR_V') {
      // Pasillo Vertical auténtico: sala estrecha (ancho 360px perfectamente centrado en 480)
      this.bounds.left = 300;
      this.bounds.right = 660;
      this.bounds.width = this.bounds.right - this.bounds.left;
      this.bounds.centerX = 480;
      this.doorOffsets = { N: 480, S: 480, W: 320, E: 320 };
      this.pits.push(new RoomPit(300, 200, 35, 120, 'Grieta Pared Oeste'));
      this.pits.push(new RoomPit(625, 340, 35, 120, 'Grieta Pared Este'));
    } else if (layoutType === 'UPPER_PATH') {
      // Camino Superior: los accesos W y E están sobre el sendero superior (y=180)
      this.doorOffsets = { W: 180, E: 180, N: 480, S: 480 };
      // Gran abismo inferior con puente central de 140px centrado en 480 (410 a 550) hacia puerta Sur
      this.pits.push(new RoomPit(ROOM_BOUNDS.left, 290, 410 - ROOM_BOUNDS.left, ROOM_BOUNDS.bottom - 290, 'Abismo Inferior Izquierdo'));
      this.pits.push(new RoomPit(550, 290, ROOM_BOUNDS.right - 550, ROOM_BOUNDS.bottom - 290, 'Abismo Inferior Derecho'));
    } else if (layoutType === 'LOWER_PATH') {
      // Camino Inferior: los accesos W y E están sobre el sendero inferior (y=460)
      this.doorOffsets = { W: 460, E: 460, N: 480, S: 480 };
      // Gran abismo superior con puente central de 140px centrado en 480 (410 a 550) hacia puerta Norte
      this.pits.push(new RoomPit(ROOM_BOUNDS.left, ROOM_BOUNDS.top, 410 - ROOM_BOUNDS.left, 240, 'Abismo Superior Izquierdo'));
      this.pits.push(new RoomPit(550, ROOM_BOUNDS.top, ROOM_BOUNDS.right - 550, 240, 'Abismo Superior Derecho'));
    } else if (layoutType === 'CORNERS') {
      // 4 fosos en las esquinas con amplio paso libre hacia todas las puertas centrales (480, 320)
      this.doorOffsets = { N: 480, S: 480, W: 320, E: 320 };
      this.pits.push(new RoomPit(ROOM_BOUNDS.left, ROOM_BOUNDS.top, 240, 140, 'Foso Noroeste'));
      this.pits.push(new RoomPit(ROOM_BOUNDS.right - 240, ROOM_BOUNDS.top, 240, 140, 'Foso Noreste'));
      this.pits.push(new RoomPit(ROOM_BOUNDS.left, ROOM_BOUNDS.bottom - 140, 240, 140, 'Foso Suroeste'));
      this.pits.push(new RoomPit(ROOM_BOUNDS.right - 240, ROOM_BOUNDS.bottom - 140, 240, 140, 'Foso Sureste'));
    } else if (layoutType === 'CROSS_CHASM') {
      // 4 abismos cuadrantes creando un cruce de puentes y una arena central
      this.doorOffsets = { N: 480, S: 480, W: 320, E: 320 };
      this.pits.push(new RoomPit(140, 110, 270, 140, 'Abismo Noroeste'));
      this.pits.push(new RoomPit(550, 110, 270, 140, 'Abismo Noreste'));
      this.pits.push(new RoomPit(140, 390, 270, 140, 'Abismo Suroeste'));
      this.pits.push(new RoomPit(550, 390, 270, 140, 'Abismo Sureste'));
    } else if (layoutType === 'TWIN_ISLANDS') {
      // Dos cañones verticales creando 3 carriles con carril central centrado en 480
      this.doorOffsets = { N: 480, S: 480, W: 320, E: 320 };
      this.pits.push(new RoomPit(280, 120, 90, 410, 'Grieta Izquierda'));
      this.pits.push(new RoomPit(590, 120, 90, 410, 'Grieta Derecha'));
    }

    if (this.exitPortal) {
      this.exitPortal.x = this.bounds.centerX;
      this.exitPortal.y = this.bounds.centerY;
    }
  }

  isPointInPit(px, py, radius = 0) {
    for (let i = 0; i < this.pits.length; i++) {
      if (this.pits[i].collidesWithCircle(px, py, radius)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Encuentra una posición 100% transitable y accesible garantizada en la sala.
   * Evita cualquier abismo (pit), obstáculo destructible (roca/vasija) y márgenes de paredes.
   */
  getWalkablePosition(preferredX, preferredY, radius = 25) {
    const b = this.bounds;
    const pad = radius + 14;

    const isValid = (x, y) => {
      if (x < b.left + pad || x > b.right - pad || y < b.top + pad || y > b.bottom - pad) {
        return false;
      }
      if (this.isPointInPit(x, y, radius + 4)) {
        return false;
      }
      if (this.obstacles && this.obstacles.some((obs) => typeof obs.collidesWith === 'function' && obs.collidesWith(x, y, radius + 4))) {
        return false;
      }
      return true;
    };

    if (isValid(preferredX, preferredY)) {
      return { x: preferredX, y: preferredY };
    }

    const angles = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, Math.PI, -(3 * Math.PI) / 4, -Math.PI / 2, -Math.PI / 4];
    for (let dist = 24; dist <= 380; dist += 20) {
      for (const a of angles) {
        const testX = preferredX + Math.cos(a) * dist;
        const testY = preferredY + Math.sin(a) * dist;
        if (isValid(testX, testY)) {
          return { x: testX, y: testY };
        }
      }
    }

    return { x: b.centerX, y: b.centerY };
  }

  resolveSafeGround(entity) {
    const b = this.bounds;
    const step = 16;
    for (let dist = 16; dist <= 180; dist += step) {
      const angles = [0, Math.PI, Math.PI / 2, -Math.PI / 2, Math.PI / 4, -Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4];
      for (const a of angles) {
        const testX = MathUtils.clamp(entity.x + Math.cos(a) * dist, b.left + entity.radius, b.right - entity.radius);
        const testY = MathUtils.clamp(entity.y + Math.sin(a) * dist, b.top + entity.radius, b.bottom - entity.radius);
        if (!this.isPointInPit(testX, testY, entity.radius)) {
          entity.x = testX;
          entity.y = testY;
          this.spawnParticle(entity.x, entity.y, '#38bdf8', 12);
          if (entity.takeDamage && (!entity.invulnerableTimer || entity.invulnerableTimer <= 0)) {
            entity.takeDamage(5, this);
            if (entity.ui) {
              entity.ui.spawnFloatingText('¡AL BORDE!', '#facc15', entity.x, entity.y - 25);
            }
          }
          return;
        }
      }
    }
    const safe = this.getWalkablePosition(b.centerX, b.centerY, entity.radius || 18);
    entity.x = safe.x;
    entity.y = safe.y;
  }

  getMinDistanceToAnyDoor(x, y) {
    let minDist = Infinity;
    for (const dirKey of ['N', 'S', 'E', 'W']) {
      if (!this.doors[dirKey]) continue;
      const dPos = this.getDoorPosition(dirKey);
      const dist = Math.hypot(x - dPos.x, y - dPos.y);
      if (dist < minDist) minDist = dist;
    }
    return minDist;
  }

  getSafeSpawnPosition(minX, maxX, minY, maxY, padding = 35, requiredDoorDist = 210) {
    const b = this.bounds;
    let bestPos = null;
    let maxDistFound = -1;

    // Relajar progresivamente la distancia requerida si la habitación es reducida o muy transitada
    const thresholds = [
      requiredDoorDist,
      requiredDoorDist * 0.8,
      requiredDoorDist * 0.6,
      requiredDoorDist * 0.4,
      0,
    ];

    for (const minDoorDist of thresholds) {
      for (let attempts = 0; attempts < 35; attempts++) {
        const ex = minX + Math.random() * (maxX - minX);
        const ey = minY + Math.random() * (maxY - minY);

        if (!this.isPointInPit(ex, ey, padding)) {
          const distToDoor = this.getMinDistanceToAnyDoor(ex, ey);
          if (distToDoor > maxDistFound) {
            maxDistFound = distToDoor;
            bestPos = { x: ex, y: ey };
          }
          if (distToDoor >= minDoorDist) {
            return { x: ex, y: ey };
          }
        }
      }
    }

    if (bestPos) return bestPos;
    return { x: b.centerX, y: b.centerY };
  }

  /**
   * Etiqueta de HUD para el tipo de sala actual (mostrada en el DOM v1.9).
   */
  getHudTypeLabel() {
    let baseLabel = this.type;
    if (this.type === 'START') baseLabel = 'SALA INICIAL';
    else if (this.type === 'SANCTUARY') baseLabel = 'SANTUARIO';
    else if (this.type === 'SHOP') baseLabel = 'TIENDA';
    else if (this.type === 'BOSS') baseLabel = 'ARENA DE JEFE';
    else if (this.type === 'HARD') baseLabel = 'SALA DE ÉLITE';
    else if (this.type === 'HAZARD') baseLabel = 'SALA DE PELIGROS';
    else baseLabel = 'SALA NORMAL';

    let layoutSuffix = '';
    if (this.templateName) {
      layoutSuffix = ` // ${this.templateName.toUpperCase()}`;
    } else if (this.layoutType === 'CORRIDOR_H') layoutSuffix = ' // PASILLO H';
    else if (this.layoutType === 'CORRIDOR_V') layoutSuffix = ' // PASILLO V';
    else if (this.layoutType === 'UPPER_PATH') layoutSuffix = ' // CAMINO SUPERIOR';
    else if (this.layoutType === 'LOWER_PATH') layoutSuffix = ' // CAMINO INFERIOR';
    else if (this.layoutType === 'CORNERS') layoutSuffix = ' // FOSOS';
    else if (this.layoutType === 'CROSS_CHASM') layoutSuffix = ' // PUENTES';
    else if (this.layoutType === 'TWIN_ISLANDS') layoutSuffix = ' // CAÑÓN';

    if (this.isExitRoom && this.type !== 'SHOP' && this.type !== 'BOSS') {
      return `[SALA DEL PORTAL // ${baseLabel}${layoutSuffix}]`;
    }
    return `[${baseLabel}${layoutSuffix}]`;
  }

  getFloorBackgroundColor() {
    return '#0f172a';
  }

  /**
   * Soporta tanto la firma clásica de 7 argumentos `spawnParticle(x, y, vx, vy, radius, color, lifeTime)`
   * como la firma abreviada de ráfaga radial `spawnParticle(x, y, color, count)` usada en reliquias v2.1.
   */
  spawnParticle(x, y, vx, vy, radius, color, lifeTime = 0.5) {
    if (typeof vx === 'string') {
      const burstColor = vx;
      const count = typeof vy === 'number' ? Math.min(28, Math.max(1, vy)) : 8;
      for (let i = 0; i < count; i++) {
        const ang = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.35;
        const spd = 75 + Math.random() * 135;
        if (this.particles.length >= CONFIG.MAX_PARTICLES) {
          this.particles.shift();
        }
        this.particles.push(
          new Particle(x, y, Math.cos(ang) * spd, Math.sin(ang) * spd, 4.5, burstColor, 0.5)
        );
      }
      return;
    }

    if (this.particles.length >= CONFIG.MAX_PARTICLES) {
      this.particles.shift();
    }
    this.particles.push(new Particle(x, y, vx, vy, radius, color, lifeTime));
  }

  /**
   * Spawnea 1 o múltiples monedas alrededor de `(x, y)` (`CHALICE_OF_ABUNDANCE` v2.1).
   */
  spawnCoin(x, y, amount = 1) {
    const b = this.bounds;
    const count = Math.max(1, Math.round(amount));
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const dist = i === 0 ? 0 : 8 + Math.random() * 18;
      const cx = MathUtils.clamp(
        x + Math.cos(ang) * dist,
        b.left + 16,
        b.right - 16
      );
      const cy = MathUtils.clamp(
        y + Math.sin(ang) * dist,
        b.top + 16,
        b.bottom - 16
      );
      this.coins.push(new Coin(cx, cy));
    }
  }

  /**
   * Instancia una nube tóxica aliada en `(x, y)` (`TOXIC_GRENADE` v2.1).
   */
  spawnPoisonCloud(x, y, options = {}) {
    this.hazards.push(new ToxicCloudHazard(x, y, options));
  }

  getRandomSafePosition(originX = null, originY = null, maxRange = 200) {
    const b = this.bounds;
    const ox = originX !== null ? originX : b.centerX;
    const oy = originY !== null ? originY : b.centerY;
    const padding = 28;
    const angle = Math.random() * Math.PI * 2;
    const dist = 65 + Math.random() * Math.max(40, maxRange - 65);
    const rawX = ox + Math.cos(angle) * dist;
    const rawY = oy + Math.sin(angle) * dist;
    return {
      x: MathUtils.clamp(rawX, b.left + padding, b.right - padding),
      y: MathUtils.clamp(rawY, b.top + padding, b.bottom - padding),
    };
  }

  /**
   * Calcula el multiplicador de velocidad ambiental para CUALQUIER entidad (Jugador o Enemigo).
   * Retorna `0.5` si la entidad pisa un `PoisonPuddle` (`isSlowingHazard`) o una `GravityZoneHazard`.
   */
  getEntitySpeedMultiplier(entity) {
    if (!entity || entity.isBurrowed) return 1.0;
    let mult = 1.0;
    for (const haz of this.hazards) {
      if (haz.markedForDeletion) continue;
      if (
        (haz.isGravityZone || haz.isSlowingHazard) &&
        MathUtils.circleCollision(entity.x, entity.y, entity.radius, haz.x, haz.y, haz.radius)
      ) {
        mult = Math.min(mult, haz.speedMultiplier || 0.5);
      }
    }
    return mult;
  }

  getPlayerSpeedMultiplier(player) {
    return this.getEntitySpeedMultiplier(player);
  }

  /**
   * Método auxiliar para generar una oleada de enemigos según un factor de cantidad.
   */
  spawnStandardWave(countFactor = 1.0, spawnMultiplier = 1.0, eliteChanceMult = 1.0) {
    const b = this.bounds;
    const margin = Math.min(90, Math.min(b.width, b.height) * 0.22);
    const minX = b.left + margin;
    const maxX = b.right - margin;
    const minY = b.top + margin;
    const maxY = b.bottom - margin;

    const floorMultiplier = Math.pow(1 + CONFIG.ENEMY_FLOOR_SCALING, this.levelNumber - 1);
    const baseForRoom = this.isExitRoom
      ? CONFIG.BASE_ENEMIES_PER_ROOM + 1
      : CONFIG.BASE_ENEMIES_PER_ROOM;
    const enemyCount = Math.max(
      1,
      Math.round(baseForRoom * floorMultiplier * spawnMultiplier * countFactor)
    );

    for (let i = 0; i < enemyCount; i++) {
      const spawnPos = this.getSafeSpawnPosition(minX, maxX, minY, maxY, 35);
      const ex = spawnPos.x;
      const ey = spawnPos.y;

      const roll = Math.random();
      if (roll < 0.22) {
        this.enemies.push(new ShooterEnemy(ex, ey, this.sectionNumber, this.levelNumber));
      } else if (roll < 0.42) {
        this.enemies.push(new SplitterEnemy(ex, ey, this.sectionNumber, this.levelNumber, false));
      } else if (roll < 0.62) {
        this.enemies.push(new FlyerEnemy(ex, ey, this.sectionNumber, this.levelNumber));
      } else if (roll < 0.78) {
        this.enemies.push(new ChargerEnemy(ex, ey, this.sectionNumber, this.levelNumber));
      } else {
        const behavior = Math.random() < 0.5 ? 'ERRATIC' : 'DASHER';
        this.enemies.push(new Enemy(ex, ey, this.sectionNumber, this.levelNumber, behavior));
      }
    }

    const effectiveEliteChance = Math.min(0.95, CONFIG.ELITE_SPAWN_CHANCE * eliteChanceMult);
    if (this.enemies.length > 0 && Math.random() < effectiveEliteChance) {
      const replaceIdx = Math.floor(Math.random() * this.enemies.length);
      const target = this.enemies[replaceIdx];
      this.enemies[replaceIdx] = new EliteEnemy(
        target.x,
        target.y,
        this.sectionNumber,
        this.levelNumber
      );
    }

    if (typeof BrotherEye !== 'undefined' && BrotherEye.enabled) {
      for (const enemy of this.enemies) {
        BrotherEye.tuneSpawnedEnemy(enemy);
      }
    }

    this.cleared = this.enemies.length === 0;
  }

  /**
   * Método polimórfico sobrescrito por cada subclase de `Room`.
   */
  populateRoomContent(spawnMultiplier = 1.0, uiManager = null) {
    this.cleared = true;
  }

  addDecal(x, y, radius = 14, color = '#15803d') {
    if (this.decals.length < 30) {
      this.decals.push(new BloodDecal(x, y, radius, color));
    }
  }

  generateObstacles() {
    if (this.hasAuthoredTemplate) return;
    if (this.type === 'START' || this.type === 'SANCTUARY' || this.type === 'TREASURE' || this.type === 'SHOP' || this.type === 'BOSS' || this.type === 'NEXUS') return;

    if (typeof LevelTemplateSystem !== 'undefined' && typeof LevelTemplateSystem.generateStructuredObstaclesForRoom === 'function') {
      LevelTemplateSystem.generateStructuredObstaclesForRoom(this);
      return;
    }

    const b = this.bounds;
    const padding = 130;
    const minX = b.left + padding;
    const maxX = b.right - padding;
    const minY = b.top + padding;
    const maxY = b.bottom - padding;

    const clusterCount = Math.floor(2 + Math.random() * 3);
    for (let c = 0; c < clusterCount; c++) {
      const cx = minX + Math.random() * (maxX - minX);
      const cy = minY + Math.random() * (maxY - minY);

      if (this.isPointInPit && this.isPointInPit(cx, cy, 35)) continue;

      if (Math.random() < 0.6) {
        this.obstacles.push(new RockObstacle(cx, cy, 40, 40));
        if (Math.random() < 0.5) {
          this.obstacles.push(new RockObstacle(cx + 42, cy, 40, 40));
        }
      } else {
        this.obstacles.push(new PotObstacle(cx, cy));
        if (Math.random() < 0.5) {
          this.obstacles.push(new PotObstacle(cx + 28, cy));
        }
      }
    }
  }

  resolvePlayerBoundsAndDoors(player, floor) {
    const halfDoor = CONFIG.DOOR_WIDTH / 2;
    const b = this.bounds;
    const activeFloor = floor || window.activeGameInstance?.currentFloor;
    const isTargetLocked = (dx, dy) => {
      if (!activeFloor) return false;
      const target = activeFloor.getRoom(this.gridX + dx, this.gridY + dy);
      return Boolean(target && target.isLocked);
    };

    // 1. Puerta Norte
    if (player.y - player.radius <= b.top) {
      const doorPos = this.getDoorPosition('N');
      const inDoorSpan = Math.abs(player.x - doorPos.x) <= halfDoor - player.radius * 0.4;
      const isLocked = isTargetLocked(0, -1);
      if (this.cleared && this.doors.N && inDoorSpan && !isLocked) {
        if (player.y <= b.top - 4) return 'N';
      } else {
        player.y = b.top + player.radius;
      }
    }

    // 2. Puerta Sur
    if (player.y + player.radius >= b.bottom) {
      const doorPos = this.getDoorPosition('S');
      const inDoorSpan = Math.abs(player.x - doorPos.x) <= halfDoor - player.radius * 0.4;
      const isLocked = isTargetLocked(0, 1);
      if (this.cleared && this.doors.S && inDoorSpan && !isLocked) {
        if (player.y >= b.bottom + 4) return 'S';
      } else {
        player.y = b.bottom - player.radius;
      }
    }

    // 3. Puerta Oeste
    if (player.x - player.radius <= b.left) {
      const doorPos = this.getDoorPosition('W');
      const inDoorSpan = Math.abs(player.y - doorPos.y) <= halfDoor - player.radius * 0.4;
      const isLocked = isTargetLocked(-1, 0);
      if (this.cleared && this.doors.W && inDoorSpan && !isLocked) {
        if (player.x <= b.left - 4) return 'W';
      } else {
        player.x = b.left + player.radius;
      }
    }

    // 4. Puerta Este
    if (player.x + player.radius >= b.right) {
      const doorPos = this.getDoorPosition('E');
      const inDoorSpan = Math.abs(player.y - doorPos.y) <= halfDoor - player.radius * 0.4;
      const isLocked = isTargetLocked(1, 0);
      if (this.cleared && this.doors.E && inDoorSpan && !isLocked) {
        if (player.x >= b.right + 4) return 'E';
      } else {
        player.x = b.right - player.radius;
      }
    }

    return null;
  }

  update(dt, player, floor) {
    this.portalPulse += dt * 4;

    if (typeof BrotherEye !== 'undefined' && BrotherEye.enabled) {
      BrotherEye.onRoomTick(dt, this, player);
    }
    if (typeof HiveMindSystem !== 'undefined') {
      HiveMindSystem.updateOracle(dt, this, player);
    }

    if (this.chest) {
      this.chest.update(dt, player, this);
    }

    for (const rChest of this.relicChests) {
      rChest.update(dt, player, this);
    }
    this.relicChests = this.relicChests.filter((c) => !c.opened || c.openAnimTimer > 0);

    for (const lc of this.lockedChests) {
      lc.update(dt, player, this);
    }
    this.lockedChests = this.lockedChests.filter((c) => !c.opened || c.openAnimTimer > 0);

    if (this.vaultChest) {
      this.vaultChest.update(dt, player, this);
    }
    if (this.transmutationAnvil) {
      this.transmutationAnvil.update(dt, player, this);
    }
    if (this.smugglerBriefcase) {
      this.smugglerBriefcase.update(dt, player, this);
    }
    if (this.merchantSafe) {
      this.merchantSafe.update(dt, player, this);
    }

    for (const altar of this.altars) {
      altar.update(dt, player, this);
    }

    for (const obs of this.obstacles) {
      obs.update(dt);
      obs.resolveCircleCollision(player);
      for (const en of this.enemies) {
        if (!en.isFlying) obs.resolveCircleCollision(en);
      }
    }
    this.obstacles = this.obstacles.filter((ob) => !ob.markedForDeletion);

    for (const key of this.keys) {
      key.update(dt, player, this);
    }
    this.keys = this.keys.filter((k) => !k.markedForDeletion);

    for (const heart of this.hearts) {
      heart.update(dt, player, this);
    }
    this.hearts = this.hearts.filter((h) => !h.markedForDeletion);

    for (const ped of this.pedestals) {
      ped.update(dt, player, this);
    }

    if (this.bossRewardPedestal) {
      this.bossRewardPedestal.update(dt, player, this);
    }

    for (const proj of this.projectiles) {
      try {
        for (const obs of this.obstacles) {
          if (!obs.markedForDeletion && obs.collidesWithCircle(proj.x, proj.y, proj.radius)) {
            obs.takeDamage(proj.damage, this);
            proj.markedForDeletion = true;
            break;
          }
        }
        if (!proj.markedForDeletion) {
          proj.update(dt, this, player);
        }
      } catch (err) {
        proj.markedForDeletion = true;
        if (window.devConsole) window.devConsole.log('ERROR', 'Fallo en proyectil: ' + err.message);
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.markedForDeletion);

    for (const eProj of this.enemyProjectiles) {
      try {
        for (const obs of this.obstacles) {
          if (!obs.markedForDeletion && obs.collidesWithCircle(eProj.x, eProj.y, eProj.radius)) {
            obs.takeDamage(eProj.damage * 0.5, this);
            eProj.markedForDeletion = true;
            break;
          }
        }
        if (!eProj.markedForDeletion) {
          eProj.update(dt, player, this);
        }
      } catch (err) {
        eProj.markedForDeletion = true;
        if (window.devConsole) window.devConsole.log('ERROR', 'Fallo en proyectil enemigo: ' + err.message);
      }
    }
    this.enemyProjectiles = this.enemyProjectiles.filter((ep) => !ep.markedForDeletion);

    // Procesar Trampas Ambientales y Hazards (afectan TANTO al jugador COMO a los enemigos)
    for (const haz of this.hazards) {
      try {
        haz.update(dt, player, this);
      } catch (err) {
        haz.markedForDeletion = true;
        if (window.devConsole) window.devConsole.log('ERROR', 'Fallo en hazard: ' + err.message);
      }
    }
    this.hazards = this.hazards.filter((hz) => !hz.markedForDeletion);

    const prevEnemyCount = this.enemies.length;
    const prevCleared = this.cleared;
    const newlySpawnedEnemies = [];

    for (const enemy of this.enemies) {
      enemy.update(dt, player, this.enemies, this);

      if (
        !enemy.markedForDeletion &&
        !enemy.isBurrowed &&
        !enemy.hasEffect('MIRACLE') &&
        (!enemy.invulnerableTimer || enemy.invulnerableTimer <= 0) &&
        MathUtils.circleCollision(player.x, player.y, player.radius, enemy.x, enemy.y, enemy.radius)
      ) {
        player.takeDamage(enemy.contactDamage, this, {
          sourceArchetype: enemy.constructor ? enemy.constructor.name : 'Enemy',
        });
      }

      if (enemy.markedForDeletion) {
        if (typeof enemy.onDeath === 'function') {
          enemy.onDeath(this, player);
        }

        if (typeof BrotherEye !== 'undefined' && BrotherEye.enabled && typeof BrotherEye.recordEnemyKill === 'function') {
          BrotherEye.recordEnemyKill(
            enemy.constructor ? enemy.constructor.name : 'Enemy',
            enemy instanceof Boss
          );
        }
        if (typeof HiveMindSystem !== 'undefined') {
          HiveMindSystem.recordEnemyKilled(this);
        }

        if (player && player.itemManager) {
          player.itemManager.onKill(enemy, this);
          if (enemy instanceof Boss) {
            player.itemManager.onBossKill(enemy, this);
          }
        }

        if (enemy instanceof Boss) {
          this.hazards = [];
          this.enemyProjectiles = [];
          this.bossRewardPedestal = new BossRewardPedestal(ROOM_BOUNDS.centerX, ROOM_BOUNDS.centerY - 75);
          for (let i = 0; i < 6; i++) {
            this.coins.push(new Coin(enemy.x + (i - 2.5) * 16, enemy.y + 12));
          }
          // El jefe derrotado arroja un botín colosal de Gemas del Vacío (+30 Gemas)
          for (let i = 0; i < 15; i++) {
            const rx = enemy.x + (Math.random() - 0.5) * 70;
            const ry = enemy.y + (Math.random() - 0.5) * 70;
            const safeG = this.getWalkablePosition(rx, ry, 12);
            this.coins.push(new VoidGem(safeG.x, safeG.y, 2));
          }
          this.hearts.push(new HeartItem(enemy.x, enemy.y - 15, 'SOUL'));
          for (const other of this.enemies) {
            if (other !== enemy) other.markedForDeletion = true;
          }
        }

        if (enemy instanceof EliteEnemy) {
          this.relicChests.push(new RelicChest(enemy.x, enemy.y));
          // Minijefe Elite otorga Gemas garantizadas (+4)
          for (let i = 0; i < 4; i++) {
            this.coins.push(new VoidGem(enemy.x + (i - 1.5) * 14, enemy.y - 12, 1));
          }
          if (player.ui) {
            player.ui.showToast('¡MINIJEFES ELITE DERROTADO! Abre el Cofre de Reliquia púrpura');
          }
        }

        if (enemy instanceof SplitterEnemy && !enemy.isMini) {
          const children = enemy.spawnSplitChildren();
          if (player && player.itemManager) {
            for (const child of children) {
              player.itemManager.onEnemySpawn(child, this);
            }
          }
          newlySpawnedEnemies.push(...children);
          for (let i = 0; i < 10; i++) {
            const ang = (Math.PI * 2 * i) / 10;
            this.spawnParticle(
              enemy.x,
              enemy.y,
              Math.cos(ang) * 90,
              Math.sin(ang) * 90,
              4,
              '#22d3ee',
              0.45
            );
          }
        } else if (enemy.dropsCoin) {
          this.coins.push(new Coin(enemy.x, enemy.y));
          if (player.extraCoinChance > 0 && Math.random() < player.extraCoinChance) {
            this.coins.push(new Coin(enemy.x + 10, enemy.y - 6));
          }
          // Probabilidad de soltar Gemas del Vacío (35% base + bono talento de codicia)
          const gemChance = 0.35 + (player.gemDropBonus || 0);
          if (Math.random() < gemChance) {
            this.coins.push(new VoidGem(enemy.x - 10, enemy.y + 6, 1));
          }
          const eyeHeartBonus = (typeof BrotherEye !== 'undefined' && BrotherEye.enabled) ? BrotherEye.getHeartDropBonus() : 0;
          if (Math.random() < ((player.hp < player.maxHp * 0.4 ? 0.35 : 0.18) + eyeHeartBonus)) {
            const hType = Math.random() < 0.25 ? 'SOUL' : (Math.random() < 0.4 ? 'HALF' : 'FULL');
            this.hearts.push(new HeartItem(enemy.x + 8, enemy.y + 6, hType));
          }
          // Drop de llaves balanceado: dinámico para evitar inflación de llaves
          const currentKeys = player ? player.keys : 0;
          const keyChance = currentKeys === 0 ? 0.08 : (currentKeys < 4 ? 0.035 : (currentKeys < 8 ? 0.015 : 0.003));
          if (Math.random() < keyChance) {
            const safeK = this.getWalkablePosition(enemy.x - 8, enemy.y - 6, 12);
            this.keys.push(new KeyItem(safeK.x, safeK.y));
          }
          this.addDecal(enemy.x, enemy.y, 14, enemy.color || '#15803d');
          soundManager.playProcedural('enemy_death');
        }
      }
    }

    this.enemies = this.enemies.filter((e) => !e.markedForDeletion);
    if (newlySpawnedEnemies.length > 0) {
      this.enemies.push(...newlySpawnedEnemies);
    }

    const hasActiveChallenge = Boolean(this.hazards && this.hazards.some(h => typeof ChallengeMonolith !== 'undefined' && h instanceof ChallengeMonolith && h.isActive));
    if (!this.cleared && this.enemies.length === 0 && !hasActiveChallenge) {
      this.cleared = true;
      if (typeof HiveMindSystem !== 'undefined') {
        HiveMindSystem.onRoomCleared(this);
      }
      if (typeof BrotherEye !== 'undefined' && BrotherEye.enabled) {
        BrotherEye.onRoomExited(this, player, true);
      }
      if (window.PIG_ARCHETYPES && player.archetype && window.PIG_ARCHETYPES[player.archetype]?.onRoomCleared) {
        window.PIG_ARCHETYPES[player.archetype].onRoomCleared(player, this);
      }
      if (window.RunSaveManager && window.activeGameInstance) {
        window.RunSaveManager.save(window.activeGameInstance);
      }
    }

    if (this.type === 'BOSS' && !this.cleared && player && player.ui && typeof player.ui.updateBossStamina === 'function') {
      const activeBoss = this.enemies.find((e) => e instanceof Boss && !e.markedForDeletion);
      if (activeBoss) {
        player.ui.updateBossStamina(activeBoss);
      }
    }

    if (
      player.ui &&
      (this.enemies.length !== prevEnemyCount || this.cleared !== prevCleared)
    ) {
      player.ui.updateRoomInfo(this, floor);
      if (this.type === 'BOSS') {
        const activeBoss = this.enemies.find((e) => e instanceof Boss && !e.markedForDeletion);
        player.ui.updateBossStatus(activeBoss || null, this, floor);
        if (this.cleared) {
          const bossLabel = this.bossName || 'JEFE';
          const isFinalCycleBoss =
            this.sectionNumber === CONFIG.TOTAL_SECTIONS &&
            this.levelNumber === CONFIG.LEVELS_PER_SECTION;
          player.ui.showToast(
            isFinalCycleBoss
              ? `¡${bossLabel} DERROTADO! Entra al portal hacia LA SALA DEL NEXO (New Game+)`
              : `¡${bossLabel} DERROTADO! Entra al portal verde central para avanzar`
          );
        }
      } else if (this.cleared && !prevCleared) {
        player.ui.showToast(
          this.isExitRoom
            ? '¡SALA DESPEJADA! Portal dorado activado hacia la Tienda'
            : '¡SALA DESPEJADA! Puertas desbloqueadas'
        );

        // Propuesta C: En NG+, las salas de combate despejadas tienen alta probabilidad de generar un RelicChest
        if (
          ngPlusLevel >= 1 &&
          this.type !== 'START' &&
          this.type !== 'SANCTUARY' &&
          this.type !== 'SHOP' &&
          this.type !== 'BOSS'
        ) {
          const dropChance = this.type === 'HARD' || this.type === 'HAZARD' ? 0.7 : 0.4;
          if (Math.random() < dropChance) {
            const safePos = this.getWalkablePosition(this.bounds.centerX, this.bounds.centerY, 26);
            const rChest = new RelicChest(safePos.x, safePos.y);
            rChest.isLocked = false;
            this.relicChests.push(rChest);
            if (player.ui) {
              player.ui.showToast('★ ¡COFRE DE COMBATE! Recompensa de sala despejada');
              player.ui.spawnFloatingText('★ COFRE DE VICTORIA ★', '#c084fc', safePos.x, safePos.y - 25);
            }
          }
        } else if (
          ngPlusLevel === 0 &&
          this.type !== 'START' &&
          this.type !== 'SANCTUARY' &&
          this.type !== 'SHOP' &&
          this.type !== 'BOSS' &&
          this.cleared &&
          !prevCleared
        ) {
          const lockedChance = this.type === 'HARD' || this.type === 'HAZARD' ? 0.45 : 0.25;
          if (Math.random() < lockedChance) {
            const safePos = this.getWalkablePosition(this.bounds.centerX, this.bounds.centerY, 24);
            this.lockedChests.push(new LockedChest(safePos.x, safePos.y));
            if (player.ui) {
              player.ui.showToast('★ ¡COFRE DORADO BLOQUEADO! Requiere 1 Llave [🔑]');
              player.ui.spawnFloatingText('★ COFRE DORADO [🔑]', '#f59e0b', safePos.x, safePos.y - 25);
            }
          }
        }
      }
    }

    for (const coin of this.coins) {
      coin.update(dt, player, this);
    }
    this.coins = this.coins.filter((c) => !c.markedForDeletion);

    for (const item of this.shopItems) {
      const justBought = item.update(dt, player);
      if (justBought) {
        this.shopSelectionMade = true;
        this.shopItems = [item];
        for (let i = 0; i < 14; i++) {
          const angle = (Math.PI * 2 * i) / 14;
          this.spawnParticle(
            item.x,
            item.y,
            Math.cos(angle) * 110,
            Math.sin(angle) * 110,
            4,
            item.color,
            0.55
          );
        }
        break;
      }
    }

    for (const part of this.particles) {
      part.update(dt, this);
    }
    this.particles = this.particles.filter((pt) => pt.lifeTime > 0);

    // Actualización de interacción en el mundo y prompt [E] (v2.5)
    const nearest = this.getNearestInteractable(player, floor);
    this.currentInteractable = nearest;
    if (player && player.ui && typeof player.ui.updateInteractPrompt === 'function') {
      player.ui.updateInteractPrompt(nearest);
    }
  }

  getNearestInteractable(player, floor) {
    if (!player || player.hp <= 0) return null;
    let closest = null;
    let closestDist = Infinity;

    // 1. Yunque Transmutador
    if (this.transmutationAnvil && !this.transmutationAnvil.markedForDeletion) {
      const d = Math.hypot(player.x - this.transmutationAnvil.x, player.y - this.transmutationAnvil.y);
      if (d <= 65 && d < closestDist) {
        closestDist = d;
        const isFree = (this.transmutationAnvil.freeUses > 0);
        closest = {
          entity: this.transmutationAnvil,
          x: this.transmutationAnvil.x,
          y: this.transmutationAnvil.y,
          title: '⚒️ YUNQUE TRANSMUTADOR',
          desc: 'Transmuta o Funde Reliquias',
          cost: isFree ? '✨ 1 USO GRATIS' : '25 🪙 Oro',
          costColor: isFree ? '#4ade80' : '#facc15',
          interact: (p, r) => {
            this.transmutationAnvil.interact(p, r);
          }
        };
      }
    }

    // 2. Cofres con Candado
    if (this.lockedChests && this.lockedChests.length > 0) {
      for (const lc of this.lockedChests) {
        if (lc.opened) continue;
        const d = Math.hypot(player.x - lc.x, player.y - lc.y);
        if (d <= 60 && d < closestDist) {
          closestDist = d;
          const hasKey = player.keys > 0;
          closest = {
            entity: lc,
            x: lc.x,
            y: lc.y,
            title: '🔒 COFRE CON CANDADO',
            desc: hasKey ? 'Abrir con llave' : 'Romper candado a golpes',
            cost: hasKey ? '1 Llave 🔑' : 'Forzar (-15 HP ❤️)',
            costColor: hasKey ? '#facc15' : '#ef4444',
            interact: (p, r) => {
              if (p.keys > 0) {
                p.useKey();
                lc.openChest(p, r);
              } else {
                lc.forceOpen(p, r);
              }
            }
          };
        }
      }
    }

    // 3. Gran Bóveda Abisal
    if (this.vaultChest && !this.vaultChest.opened) {
      const d = Math.hypot(player.x - this.vaultChest.x, player.y - this.vaultChest.y);
      if (d <= 65 && d < closestDist) {
        closestDist = d;
        const hasKey = player.keys > 0;
        const hasGold = player.coins >= 30;
        let costStr = '1 Llave 🔑';
        let costCol = '#facc15';
        let descStr = 'Desbloquear bóveda abisal';
        if (!hasKey && hasGold) {
          costStr = '30 🪙 Oro';
          descStr = 'Sobornar cerrojo de bóveda';
        } else if (!hasKey && !hasGold) {
          costStr = 'Forzar (-25 HP ❤️)';
          costCol = '#ef4444';
          descStr = 'Forzar con tu sangre';
        }
        closest = {
          entity: this.vaultChest,
          x: this.vaultChest.x,
          y: this.vaultChest.y,
          title: '💎 BÓVEDA DEL TESORO',
          desc: descStr,
          cost: costStr,
          costColor: costCol,
          interact: (p, r) => {
            if (p.keys > 0) {
              this.vaultChest.openWithKey(p, r);
            } else if (p.coins >= 30) {
              this.vaultChest.openWithGold(p, r);
            } else {
              this.vaultChest.forceOpen(p, r);
            }
          }
        };
      }
    }

    // 4. Objetos de la Tienda
    if (this.shopItems && this.shopItems.length > 0) {
      for (const item of this.shopItems) {
        if (item.purchased) continue;
        const d = Math.hypot(player.x - item.x, player.y - item.y);
        if (d <= 55 && d < closestDist) {
          closestDist = d;
          const canAfford = player.coins >= item.cost;
          closest = {
            entity: item,
            x: item.x,
            y: item.y,
            title: `🛒 ${item.title}`,
            desc: item.subtitle || 'Mejora pasiva permanente',
            cost: `${item.cost} 🪙 Oro`,
            costColor: canAfford ? '#facc15' : '#ef4444',
            interact: (p, r) => {
              item.buy(p, r);
            }
          };
        }
      }
    }

    // 5. Altares del Santuario
    if (this.altars && this.altars.length > 0) {
      for (const altar of this.altars) {
        if (altar.purchased) continue;
        const d = Math.hypot(player.x - altar.x, player.y - altar.y);
        if (d <= 55 && d < closestDist) {
          closestDist = d;
          const canAfford = player.coins >= altar.cost;
          closest = {
            entity: altar,
            x: altar.x,
            y: altar.y,
            title: `✨ ${altar.title}`,
            desc: 'Bendición del Santuario',
            cost: `${altar.cost} 🪙 Oro`,
            costColor: canAfford ? '#facc15' : '#ef4444',
            interact: (p, r) => {
              altar.buy(p, r);
            }
          };
        }
      }
    }

    // 6. Monolitos y Altares en hazards
    if (this.hazards && this.hazards.length > 0) {
      for (const haz of this.hazards) {
        if (haz.markedForDeletion) continue;
        const d = Math.hypot(player.x - haz.x, player.y - haz.y);
        if (typeof ChallengeMonolith !== 'undefined' && haz instanceof ChallengeMonolith) {
          if (!haz.isActive && !haz.completed && d <= 60 && d < closestDist) {
            closestDist = d;
            closest = {
              entity: haz,
              x: haz.x,
              y: haz.y,
              title: '⚔️ MONOLITO DE DESAFÍO',
              desc: '2 Oleadas de Élites por Gran Botín',
              cost: '¡INICIAR!',
              costColor: '#f87171',
              interact: (p, r) => {
                haz.interact(p, r);
              }
            };
          }
        }
        if (typeof ChampionChest !== 'undefined' && haz instanceof ChampionChest) {
          if (!haz.opened && d <= 65 && d < closestDist) {
            closestDist = d;
            closest = {
              entity: haz,
              x: haz.x,
              y: haz.y,
              title: '👑 COFRE DEL GRAN CAMPEÓN',
              desc: 'Botín Supremo: +50 Oro, +25 Gemas y Reliquia de Élite',
              cost: 'ABRIR [E]',
              costColor: '#facc15',
              interact: (p, r) => {
                haz.open(p, r);
              }
            };
          }
        }
        if (typeof BloodPactAltar !== 'undefined' && haz instanceof BloodPactAltar) {
          if (!haz.consumed && d <= 60 && d < closestDist) {
            closestDist = d;
            closest = {
              entity: haz,
              x: haz.x,
              y: haz.y,
              title: '🩸 ALTAR DE SANGRE',
              desc: 'Sacrifica 20 HP por +35% Daño',
              cost: '-20 HP ❤️',
              costColor: '#ef4444',
              interact: (p, r) => {
                haz.interact(p, r);
              }
            };
          }
        }
      }
    }

    // 7. Puertas Bloqueadas / Cerradas con Llave (SHOP o TREASURE)
    const activeFloor = floor || window.activeGameInstance?.currentFloor;
    if (activeFloor && this.cleared) {
      const doorDirs = [
        { dir: 'N', dx: 0, dy: -1 },
        { dir: 'S', dx: 0, dy: 1 },
        { dir: 'W', dx: -1, dy: 0 },
        { dir: 'E', dx: 1, dy: 0 }
      ];
      for (const dInfo of doorDirs) {
        if (!this.doors[dInfo.dir]) continue;
        const targetRoom = activeFloor.getRoom(this.gridX + dInfo.dx, this.gridY + dInfo.dy);
        if (targetRoom && targetRoom.isLocked) {
          const dPos = this.getDoorPosition(dInfo.dir);
          const d = Math.hypot(player.x - dPos.x, player.y - dPos.y);
          if (d <= 75 && d < closestDist) {
            closestDist = d;
            const hasKey = player.keys > 0;
            const roomName = targetRoom.type === 'SHOP' ? 'Tienda' : (targetRoom.type === 'TREASURE' ? 'Sala del Tesoro' : 'Sala Bloqueada');
            closest = {
              entity: targetRoom,
              x: dPos.x,
              y: dPos.y,
              title: '🔒 PUERTA CON CERRADURA',
              desc: hasKey ? `Abrir cerrojo a la ${roomName}` : 'Forzar cerrojo con sangre (-15 HP)',
              cost: hasKey ? '1 Llave 🔑' : 'Forzar (-15 HP ❤️)',
              costColor: hasKey ? '#facc15' : '#ef4444',
              interact: (p, r) => {
                if (p.keys > 0) {
                  p.useKey();
                  targetRoom.isLocked = false;
                  soundManager.playProcedural('door_unlock');
                  if (p.ui) {
                    p.ui.showToast(`¡${roomName.toUpperCase()} DESBLOQUEADA CON LLAVE! [🔑 -1]`);
                    p.ui.spawnFloatingText('🔓 PUERTA ABIERTA', '#38bdf8', dPos.x, dPos.y);
                  }
                } else {
                  p.takeDamage(15, r, { isProjectile: false, ignoreInvulnerability: true, isSacrifice: true });
                  targetRoom.isLocked = false;
                  soundManager.playProcedural('break_rock');
                  soundManager.playProcedural('door_unlock');
                  if (window.activeGameInstance) {
                    window.activeGameInstance.triggerScreenShake(6.0, 0.2);
                  }
                  if (p.ui) {
                    p.ui.showToast('🩸 ¡PUERTA FORZADA CON SANGRE! (-15 HP)');
                    p.ui.spawnFloatingText('💥 PUERTA FORZADA (-15 HP)', '#ef4444', dPos.x, dPos.y);
                    p.ui.updateHealth(p);
                  }
                }
              }
            };
          }
        }
      }
    }

    // 8. Maletín del Contrabandista (StartRoom)
    if (this.smugglerBriefcase && !this.smugglerBriefcase.opened) {
      const d = Math.hypot(player.x - this.smugglerBriefcase.x, player.y - this.smugglerBriefcase.y);
      if (d <= 65 && d < closestDist) {
        closestDist = d;
        closest = {
          entity: this.smugglerBriefcase,
          x: this.smugglerBriefcase.x,
          y: this.smugglerBriefcase.y,
          title: '💼 MALETÍN DEL CONTRABANDISTA',
          desc: 'Kit Express (+1 Reliquia, +35 🪙, +1 🔑, +25 🛡️)',
          cost: '🎬 Anuncio / 15 💎',
          costColor: '#34d399',
          interact: (p, r) => {
            this.smugglerBriefcase.interact(p, r);
          }
        };
      }
    }

    // 9. Caja Fuerte del Mercader (ShopRoom)
    if (this.merchantSafe && !this.merchantSafe.opened) {
      const d = Math.hypot(player.x - this.merchantSafe.x, player.y - this.merchantSafe.y);
      if (d <= 65 && d < closestDist) {
        closestDist = d;
        closest = {
          entity: this.merchantSafe,
          x: this.merchantSafe.x,
          y: this.merchantSafe.y,
          title: '💰 CAJA FUERTE DEL MERCADER',
          desc: 'Soborno de Tienda (+45 🪙 Oro / +1 🔑 Llave)',
          cost: '🎬 Anuncio / 10 💎',
          costColor: '#facc15',
          interact: (p, r) => {
            this.merchantSafe.interact(p, r);
          }
        };
      }
    }

    return closest;
  }

  drawPortalVortex(ctx, x, y, radius, fillColor, strokeColor, isActive = true) {
    ctx.save();
    const pulse = isActive ? Math.sin(this.portalPulse) * 3 : 0;
    if (isActive) {
      ctx.beginPath();
      ctx.arc(x, y, radius + 9 + pulse, 0, Math.PI * 2);
      ctx.strokeStyle = strokeColor;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = strokeColor;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, radius * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = '#090d16';
    ctx.fill();
    ctx.restore();
  }

  drawRoomDecorations(ctx, player) {}

  draw(ctx, player) {
    // Fondo exterior de vacío abisal extendido para cubrir cualquier traslación de screen shake
    const maxShakeMargin = 80;
    ctx.fillStyle = '#080d1a';
    ctx.fillRect(-maxShakeMargin, -maxShakeMargin, CONFIG.CANVAS_WIDTH + maxShakeMargin * 2, CONFIG.CANVAS_HEIGHT + maxShakeMargin * 2);

    const b = this.bounds;

    // Piso interior propio de la habitación según sus límites geométricos
    ctx.fillStyle = this.getFloorBackgroundColor();
    ctx.fillRect(b.left, b.top, b.width, b.height);

    for (const decal of this.decals) decal.draw(ctx);

    ctx.strokeStyle = 'rgba(51, 65, 85, 0.25)';
    ctx.lineWidth = 1;
    const gridStep = 64;
    for (let x = b.left + gridStep; x < b.right; x += gridStep) {
      ctx.beginPath();
      ctx.moveTo(x, b.top);
      ctx.lineTo(x, b.bottom);
      ctx.stroke();
    }
    for (let y = b.top + gridStep; y < b.bottom; y += gridStep) {
      ctx.beginPath();
      ctx.moveTo(b.left, y);
      ctx.lineTo(b.right, y);
      ctx.stroke();
    }

    ctx.strokeStyle = this.cleared ? '#475569' : '#dc2626';
    ctx.lineWidth = 3;
    ctx.strokeRect(b.left, b.top, b.width, b.height);

    this.drawDoors(ctx);

    // 1. Z-INDEX DE PISO: Dibujar Fosos/Abismos (Pits), Trampas Ambientales, Altares y Cofres
    for (const pit of this.pits) pit.draw(ctx);
    for (const haz of this.hazards) haz.draw(ctx);
    this.drawRoomDecorations(ctx, player);

    for (const obs of this.obstacles) obs.draw(ctx);
    for (const ped of this.pedestals) ped.draw(ctx);
    if (this.bossRewardPedestal) this.bossRewardPedestal.draw(ctx);
    for (const key of this.keys) key.draw(ctx);
    for (const heart of this.hearts) heart.draw(ctx);

    for (const altar of this.altars) altar.draw(ctx, player);
    if (this.chest) this.chest.draw(ctx);
    for (const rChest of this.relicChests) rChest.draw(ctx);
    for (const lc of this.lockedChests) lc.draw(ctx);
    if (this.vaultChest) this.vaultChest.draw(ctx);
    if (this.transmutationAnvil) this.transmutationAnvil.draw(ctx);
    if (this.smugglerBriefcase) this.smugglerBriefcase.draw(ctx);
    if (this.merchantSafe) this.merchantSafe.draw(ctx);

    if (this.isExitRoom) {
      this.drawPortalVortex(
        ctx,
        this.exitPortal.x,
        this.exitPortal.y,
        this.exitPortal.radius,
        this.cleared ? '#facc15' : '#475569',
        this.cleared ? '#fef08a' : '#64748b',
        this.cleared
      );
    }

    if (this.type === 'SHOP') {
      this.drawPortalVortex(
        ctx,
        this.exitPortal.x,
        this.exitPortal.y,
        this.exitPortal.radius,
        '#38bdf8',
        '#bae6fd',
        true
      );
      for (const item of this.shopItems) {
        item.draw(ctx, player);
      }
    }

    if (this.type === 'BOSS' && this.cleared) {
      const isFinalCycleBoss =
        this.sectionNumber === CONFIG.TOTAL_SECTIONS &&
        this.levelNumber === CONFIG.LEVELS_PER_SECTION;
      this.drawPortalVortex(
        ctx,
        this.exitPortal.x,
        this.exitPortal.y,
        this.exitPortal.radius,
        isFinalCycleBoss ? '#c084fc' : '#4ade80',
        isFinalCycleBoss ? '#f5d0fe' : '#bbf7d0',
        true
      );
    }

    // 2. Z-INDEX SUBTERRÁNEO (`isBurrowed === true`)
    for (const enemy of this.enemies) {
      if (enemy.isBurrowed) enemy.draw(ctx);
    }

    // 3. Z-INDEX DE ENTIDADES Y PROYECTILES EN SUPERFICIE (v2.9: lectura limpia en salas de Jefe)
    const isBossBattleActive = this.type === 'BOSS' && !this.cleared;
    for (const coin of this.coins) coin.draw(ctx);

    if (isBossBattleActive) {
      ctx.save();
      ctx.globalAlpha = 0.78;
      for (const part of this.particles) part.draw(ctx);
      for (const proj of this.projectiles) proj.draw(ctx);
      ctx.restore();
    } else {
      for (const part of this.particles) part.draw(ctx);
      for (const proj of this.projectiles) proj.draw(ctx);
    }

    for (const enemy of this.enemies) {
      if (!enemy.isBurrowed) enemy.draw(ctx);
    }
    // Proyectiles enemigos siempre en la capa superior para lectura nítida sobre cualquier efecto
    for (const eProj of this.enemyProjectiles) eProj.draw(ctx);

    if (typeof HiveMindSystem !== 'undefined') {
      HiveMindSystem.drawOverlay(ctx, this);
    }
  }

  drawDoors(ctx) {
    const dw = CONFIG.DOOR_WIDTH;
    const wt = CONFIG.WALL_THICKNESS;
    const b = this.bounds;
    const activeFloor = window.activeGameInstance?.currentFloor;

    const isDoorLocked = (dx, dy) => {
      if (!this.cleared || !activeFloor) return false;
      const target = activeFloor.getRoom(this.gridX + dx, this.gridY + dy);
      return Boolean(target && target.isLocked);
    };

    const drawLockIcon = (lx, ly) => {
      // Candado geométrico dorado sin texto (estricto cumplimiento: 0 fillText)
      ctx.save();
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(lx, ly - 4, 4.5, Math.PI, 0, false);
      ctx.stroke();

      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(lx - 5, ly - 2, 10, 8);
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 1;
      ctx.strokeRect(lx - 5, ly - 2, 10, 8);

      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(lx, ly + 2, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    ctx.save();
    if (this.doors.N) {
      const dPos = this.getDoorPosition('N');
      const locked = isDoorLocked(0, -1);
      const frameColor = locked ? '#f59e0b' : (this.cleared ? '#38bdf8' : '#ef4444');
      const doorFill = locked ? '#1c1917' : (this.cleared ? '#0f172a' : '#450a0a');

      ctx.fillStyle = doorFill;
      ctx.fillRect(dPos.x - dw / 2, b.top - wt, dw, wt + 4);
      ctx.strokeStyle = frameColor;
      ctx.lineWidth = 3;
      ctx.strokeRect(dPos.x - dw / 2, b.top - wt + 2, dw, wt - 2);
      if (this.cleared && !locked) {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
        ctx.fillRect(dPos.x - dw / 2 + 4, b.top - wt + 4, dw - 8, wt - 4);
      } else if (locked) {
        drawLockIcon(dPos.x, b.top - wt / 2 + 1);
      }
    }
    if (this.doors.S) {
      const dPos = this.getDoorPosition('S');
      const locked = isDoorLocked(0, 1);
      const frameColor = locked ? '#f59e0b' : (this.cleared ? '#38bdf8' : '#ef4444');
      const doorFill = locked ? '#1c1917' : (this.cleared ? '#0f172a' : '#450a0a');

      ctx.fillStyle = doorFill;
      ctx.fillRect(dPos.x - dw / 2, b.bottom - 4, dw, wt + 4);
      ctx.strokeStyle = frameColor;
      ctx.lineWidth = 3;
      ctx.strokeRect(dPos.x - dw / 2, b.bottom, dw, wt - 2);
      if (this.cleared && !locked) {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
        ctx.fillRect(dPos.x - dw / 2 + 4, b.bottom + 2, dw - 8, wt - 4);
      } else if (locked) {
        drawLockIcon(dPos.x, b.bottom + wt / 2 - 1);
      }
    }
    if (this.doors.W) {
      const dPos = this.getDoorPosition('W');
      const locked = isDoorLocked(-1, 0);
      const frameColor = locked ? '#f59e0b' : (this.cleared ? '#38bdf8' : '#ef4444');
      const doorFill = locked ? '#1c1917' : (this.cleared ? '#0f172a' : '#450a0a');

      ctx.fillStyle = doorFill;
      ctx.fillRect(b.left - wt, dPos.y - dw / 2, wt + 4, dw);
      ctx.strokeStyle = frameColor;
      ctx.lineWidth = 3;
      ctx.strokeRect(b.left - wt + 2, dPos.y - dw / 2, wt - 2, dw);
      if (this.cleared && !locked) {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
        ctx.fillRect(b.left - wt + 4, dPos.y - dw / 2 + 4, wt - 4, dw - 8);
      } else if (locked) {
        drawLockIcon(b.left - wt / 2 + 1, dPos.y);
      }
    }
    if (this.doors.E) {
      const dPos = this.getDoorPosition('E');
      const locked = isDoorLocked(1, 0);
      const frameColor = locked ? '#f59e0b' : (this.cleared ? '#38bdf8' : '#ef4444');
      const doorFill = locked ? '#1c1917' : (this.cleared ? '#0f172a' : '#450a0a');

      ctx.fillStyle = doorFill;
      ctx.fillRect(b.right - 4, dPos.y - dw / 2, wt + 4, dw);
      ctx.strokeStyle = frameColor;
      ctx.lineWidth = 3;
      ctx.strokeRect(b.right, dPos.y - dw / 2, wt - 2, dw);
      if (this.cleared && !locked) {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
        ctx.fillRect(b.right + 2, dPos.y - dw / 2 + 4, wt - 4, dw - 8);
      } else if (locked) {
        drawLockIcon(b.right + wt / 2 - 1, dPos.y);
      }
    }
    ctx.restore();
  }
}

/**
 * Subclase `StartRoom`: Sala Inicial pacífica con el Cofre Elemental en el centro.
 */
class StartRoom extends Room {
  constructor(gridX, gridY, sectionNumber = 1, levelNumber = 1) {
    super(gridX, gridY, 'START', sectionNumber, levelNumber);
    this.cleared = true;
    if (ngPlusLevel >= 1) {
      // Propuesta A & C: En NG+ la sala inicial ofrece tanto el cofre elemental como un Cofre de Reliquia doble
      this.chest = new Chest(ROOM_BOUNDS.centerX - 65, ROOM_BOUNDS.centerY);
      this.relicChests.push(new RelicChest(ROOM_BOUNDS.centerX + 65, ROOM_BOUNDS.centerY));
    } else {
      this.chest = new Chest(ROOM_BOUNDS.centerX, ROOM_BOUNDS.centerY);
    }
    if (typeof SmugglerBriefcase !== 'undefined') {
      this.smugglerBriefcase = new SmugglerBriefcase(ROOM_BOUNDS.centerX - 130, ROOM_BOUNDS.centerY + 55);
    }
  }

  getHudTypeLabel() {
    return '[SALA INICIAL]';
  }
}

/**
 * Subclase `NormalRoom`: Spawn estándar de enemigos según el nivel y layout de fosos.
 */
class NormalRoom extends Room {
  constructor(gridX, gridY, sectionNumber = 1, levelNumber = 1, layoutType = 'OPEN') {
    super(gridX, gridY, 'NORMAL', sectionNumber, levelNumber, layoutType);
  }

  populateRoomContent(spawnMultiplier = 1.0, uiManager = null, eliteChanceMult = 1.0) {
    this.spawnStandardWave(1.0, spawnMultiplier, eliteChanceMult);
  }
}

/**
 * Subclase `HardRoom` (Sala de Élite - v1.9 / v2.1):
 *  - Genera +50% de enemigos respecto a una sala estándar (`countFactor = 1.5`).
 *  - El 30% de los enemigos generados aquí obtienen `hasInvulnerabilityCycle = true`
 *    (alternando 3 segundos de vulnerabilidad y 2 segundos de invulnerabilidad total
 *    con halo blanco / parpadeo).
 */
class HardRoom extends Room {
  constructor(gridX, gridY, sectionNumber = 1, levelNumber = 1, layoutType = 'OPEN') {
    super(gridX, gridY, 'HARD', sectionNumber, levelNumber, layoutType);
  }

  getFloorBackgroundColor() {
    return '#161129';
  }

  populateRoomContent(spawnMultiplier = 1.0, uiManager = null, eliteChanceMult = 1.0) {
    // Spawn de Monolito de Desafío de Hordas en salas de élite
    if (typeof ChallengeMonolith !== 'undefined') {
      this.hazards.push(new ChallengeMonolith(this.bounds.centerX, this.bounds.centerY));
    }
    // +50% de enemigos
    this.spawnStandardWave(1.5, spawnMultiplier, eliteChanceMult);

    // El 30% de los enemigos generados aquí obtienen `hasInvulnerabilityCycle = true`
    const targetCycleCount = Math.max(1, Math.round(this.enemies.length * 0.3));
    const indices = this.enemies.map((_, idx) => idx);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    for (let k = 0; k < Math.min(targetCycleCount, indices.length); k++) {
      const enemy = this.enemies[indices[k]];
      enemy.isBerserk = true;
    }
  }
}

/**
 * Subclase `HazardRoom` (Sala de Peligros Ambientales - v1.9 / v2.1):
 *  - Menos enemigos de lo normal (`countFactor = 0.6`).
 *  - Llena de trampas ambientales (`SpikeTrap`, `FireZone`, `PoisonPuddle`) que afectan
 *    TANTO al jugador COMO a los enemigos, respetando las zonas seguras de fosos.
 */
class HazardRoom extends Room {
  constructor(gridX, gridY, sectionNumber = 1, levelNumber = 1, layoutType = 'OPEN') {
    super(gridX, gridY, 'HAZARD', sectionNumber, levelNumber, layoutType);
  }

  getFloorBackgroundColor() {
    return '#171312';
  }

  populateRoomContent(spawnMultiplier = 1.0, uiManager = null, eliteChanceMult = 1.0) {
    // Menos enemigos de lo normal (60%)
    this.spawnStandardWave(0.6, spawnMultiplier, eliteChanceMult);

    // Poblar con las 3 clases de Trampas Ambientales en posiciones seguras dentro de los límites y fuera de fosos
    const cx = this.bounds.centerX;
    const cy = this.bounds.centerY;

    const tryAddHazard = (haz) => {
      const b = this.bounds;
      if (
        haz.x >= b.left + haz.radius &&
        haz.x <= b.right - haz.radius &&
        haz.y >= b.top + haz.radius &&
        haz.y <= b.bottom - haz.radius &&
        !this.isPointInPit(haz.x, haz.y, haz.radius) &&
        this.getMinDistanceToAnyDoor(haz.x, haz.y) >= 150
      ) {
        this.hazards.push(haz);
      }
    };

    // 1. Pinchos temporizados (`SpikeTrap`: 2s oculta, 1s aviso, 1.5s activa)
    tryAddHazard(new SpikeTrap(cx - 175, cy - 105, 38, 0.0));
    tryAddHazard(new SpikeTrap(cx + 175, cy - 105, 38, 1.5));
    tryAddHazard(new SpikeTrap(cx - 175, cy + 105, 38, 3.0));
    tryAddHazard(new SpikeTrap(cx + 175, cy + 105, 38, 0.8));

    // 2. Zonas de Fuego (`FireZone`: DoT rápido poligonal)
    tryAddHazard(new FireZone(cx - 85, cy, 48));
    tryAddHazard(new FireZone(cx + 85, cy, 48));

    // 3. Charcos Venenosos (`PoisonPuddle`: 50% slow + 4s veneno al salir)
    tryAddHazard(new PoisonPuddle(cx, cy - 125, 52));
    tryAddHazard(new PoisonPuddle(cx, cy + 125, 52));
  }
}

/**
 * Subclase `SanctuaryRoom` (Santuario de Atributos - v1.9):
 *  - Aparece exactamente UNA vez por nivel, separada de la tienda normal.
 *  - Es pacífica (`cleared = true`, 0 enemigos).
 *  - Instancia 3 altares interactivos alineados horizontalmente en estricto orden
 *    de izquierda a derecha:
 *      1. Poción de Vida (Restaura el 30% de la Vida Máxima)
 *      2. Botas de Agilidad (+Velocidad de Movimiento Base permanente)
 *      3. Placas de Defensa (+Armadura / Defensa Base permanente)
 */

class TreasureRoom extends Room {
  constructor(gridX, gridY, sectionNumber = 1, levelNumber = 1) {
    super(gridX, gridY, 'TREASURE', sectionNumber, levelNumber, 'OPEN');
    this.cleared = true;
    const relicId = this.pickTreasureRelic();
    this.pedestals.push(new ItemPedestal(ROOM_BOUNDS.centerX - 50, ROOM_BOUNDS.centerY, relicId));
    if (typeof TransmutationAnvil !== 'undefined') {
      this.transmutationAnvil = new TransmutationAnvil(ROOM_BOUNDS.centerX + 150, ROOM_BOUNDS.centerY);
    }
  }

  getHudTypeLabel() {
    return '[SALA DEL TESORO]';
  }

  getFloorBackgroundColor() {
    return '#0a1426';
  }

  pickTreasureRelic() {
    if (typeof RELIC_KEYS !== 'undefined' && RELIC_KEYS.length > 0) {
      return RELIC_KEYS[Math.floor(Math.random() * RELIC_KEYS.length)];
    }
    return 'BOUNCING_BULLETS';
  }

  populateRoomContent() {
    this.cleared = true;
  }
}

class SanctuaryRoom extends Room {
  constructor(gridX, gridY, sectionNumber = 1, levelNumber = 1) {
    super(gridX, gridY, 'SANCTUARY', sectionNumber, levelNumber);
    this.cleared = true;
  }

  getHudTypeLabel() {
    return '[SANTUARIO]';
  }

  getFloorBackgroundColor() {
    return '#0d1f22';
  }

  populateRoomContent() {
    this.cleared = true;
    this.enemies = [];

    const cy = ROOM_BOUNDS.centerY + 10;
    const spacing = 215;

    // Estricto orden de izquierda a derecha:
    // 1. Izquierda: Poción de Vida (Restaura 30% HP Máxima)
    // 2. Centro: Botas de Agilidad (+Velocidad Base permanente)
    // 3. Derecha: Placas de Defensa (+Defensa/Armadura Base permanente)
    if (typeof BloodPactAltar !== 'undefined') {
      this.hazards.push(new BloodPactAltar(ROOM_BOUNDS.centerX, ROOM_BOUNDS.bottom - 75));
    }
    this.altars = [
      new SanctuaryAltar(
        ROOM_BOUNDS.centerX - spacing,
        cy,
        'POTION_HP',
        'Poción de Vida (+30% HP Máx)',
        3,
        '#4ade80'
      ),
      new SanctuaryAltar(
        ROOM_BOUNDS.centerX,
        cy,
        'BOOTS_SPEED',
        'Botas de Agilidad (+Vel. Base)',
        4,
        '#38bdf8'
      ),
      new SanctuaryAltar(
        ROOM_BOUNDS.centerX + spacing,
        cy,
        'ARMOR_PLATES',
        'Placas de Defensa (+Armadura)',
        4,
        '#facc15'
      ),
    ];
  }

  drawRoomDecorations(ctx) {
    // Alfombra ritual geométrica bajo los 3 altares del Santuario (Cero ctx.fillText)
    ctx.save();
    ctx.strokeStyle = 'rgba(45, 212, 191, 0.28)';
    ctx.lineWidth = 2;
    ctx.strokeRect(ROOM_BOUNDS.centerX - 285, ROOM_BOUNDS.centerY - 45, 570, 110);
    ctx.restore();
  }
}

/**
 * Subclase `ShopRoom`: Tienda de mejoras al final del piso (límite de 1 compra por nivel).
 */
class ShopRoom extends Room {
  constructor(gridX, gridY, sectionNumber = 1, levelNumber = 1) {
    super(gridX, gridY, 'SHOP', sectionNumber, levelNumber);
    this.cleared = true;
    this.exitPortal = {
      x: ROOM_BOUNDS.centerX,
      y: ROOM_BOUNDS.top + 95,
      radius: 26,
    };
    this.vaultChest = new VaultChest(ROOM_BOUNDS.centerX - 130, ROOM_BOUNDS.bottom - 75);
    if (typeof TransmutationAnvil !== 'undefined') {
      this.transmutationAnvil = new TransmutationAnvil(ROOM_BOUNDS.centerX + 130, ROOM_BOUNDS.bottom - 75);
    }
    if (typeof MerchantSafe !== 'undefined') {
      this.merchantSafe = new MerchantSafe(ROOM_BOUNDS.centerX, ROOM_BOUNDS.bottom - 75);
    }
    this.setupShopItems();
  }

  getHudTypeLabel() {
    return '[TIENDA DEL NIVEL]';
  }

  getFloorBackgroundColor() {
    return '#131c31';
  }

  setupShopItems() {
    const cy = ROOM_BOUNDS.centerY + 15;
    const spacing = 210;

    this.shopItems = [
      new ShopItem(
        ROOM_BOUNDS.centerX - spacing,
        cy,
        'DAMAGE',
        '+ Daño (+45%)',
        'Aumenta el multiplicador de daño',
        4,
        '#f87171'
      ),
      new ShopItem(
        ROOM_BOUNDS.centerX,
        cy,
        'EXTRA_PROJECTILE',
        '+ 1 Proyectil / Sierra',
        'Disparo extra en "V" o sierra adicional',
        6,
        '#38bdf8'
      ),
      new ShopItem(
        ROOM_BOUNDS.centerX + spacing,
        cy,
        'ATTACK_SPEED',
        '+ Velocidad de Ataque',
        'Reduce cooldown y tiempo de carga',
        4,
        '#a855f7'
      ),
    ];
  }

  /**
   * Soporte para `LUCKY_DICE` (#55 - Dado de la Suerte):
   * Si `player.extraUpgradeChoices > 0`, agrega una 4ta opción de mejora (`LUCKY_CRIT_HP`).
   */
  ensureExtraUpgradeChoices(player) {
    if (!player || !player.extraUpgradeChoices || player.extraUpgradeChoices <= 0) return;
    if (this.shopItems.some((item) => item.type === 'LUCKY_CRIT_HP')) return;
    if (this.shopItems.some((item) => item.purchased)) return;

    const cy = ROOM_BOUNDS.centerY + 15;
    const spacing = 165;
    this.shopItems = [
      new ShopItem(
        ROOM_BOUNDS.centerX - spacing * 1.5,
        cy,
        'DAMAGE',
        '+ Daño (+45%)',
        'Aumenta el multiplicador de daño',
        4,
        '#f87171'
      ),
      new ShopItem(
        ROOM_BOUNDS.centerX - spacing * 0.5,
        cy,
        'EXTRA_PROJECTILE',
        '+ 1 Proyectil / Sierra',
        'Disparo extra en "V" o sierra adicional',
        6,
        '#38bdf8'
      ),
      new ShopItem(
        ROOM_BOUNDS.centerX + spacing * 0.5,
        cy,
        'ATTACK_SPEED',
        '+ Velocidad de Ataque',
        'Reduce cooldown y tiempo de carga',
        4,
        '#a855f7'
      ),
      new ShopItem(
        ROOM_BOUNDS.centerX + spacing * 1.5,
        cy,
        'LUCKY_CRIT_HP',
        'Dado de Fortuna (+15% Crít / +20 HP)',
        'Otorga probabilidad crítica y vitalidad máxima',
        5,
        '#fde047'
      ),
    ];
  }
}

/**
 * Subclase `BossRoom`: Cámara del Jefe Final elegido al azar entre los 4 Jefes (FSM).
 */
class BossRoom extends Room {
  constructor(gridX, gridY, sectionNumber = 1, levelNumber = 1) {
    super(gridX, gridY, 'BOSS', sectionNumber, levelNumber);
    this.cleared = false;
  }

  getHudTypeLabel() {
    const shortBoss = this.bossName ? this.bossName.split(',')[0] : 'JEFE';
    return `[CÁMARA DEL JEFE // ${shortBoss}]`;
  }

  populateRoomContent(spawnMultiplier = 1.0, uiManager = null) {
    const ChosenBossClass =
      BOSS_CLASSES[Math.floor(Math.random() * BOSS_CLASSES.length)];
    const boss = new ChosenBossClass(
      ROOM_BOUNDS.centerX,
      ROOM_BOUNDS.top + 135,
      this.sectionNumber,
      this.levelNumber
    );
    this.bossName = boss.bossTitle;
    boss.onBossStateChanged = (b) => {
      if (uiManager) uiManager.updateBossStatus(b, this);
    };
    this.enemies.push(boss);
    this.cleared = false;
  }
}

/**
 * Entidad Interactiva `NexusAltar` (Altares de la Sala del Nexo - v2.0 NG+):
 *  - `MIND_ALTAR` (Altar de la Mente - Izquierda en NG+0):
 *      Conserva todas las Reliquias (y sus niveles), resetea stats base a valores iniciales.
 *  - `BODY_ALTAR` (Altar del Cuerpo - Derecha en NG+0):
 *      Conserva todas las stats base súper altas, vacía el inventario de Reliquias.
 *  - `ABYSS_ALTAR` (Altar del Abismo - Único central en NG+ >= 1):
 *      Conserva TODO (reliquias y stats) con advertencia visual de escalado brutal.
 */
class NexusAltar extends Entity {
  constructor(x, y, altarType, title, color, onSelectCallback) {
    super(x, y, 30, color);
    this.altarType = altarType;
    this.title = title;
    this.onSelectCallback = onSelectCallback;
    this.consumed = false;
    this.pulseTimer = Math.random() * Math.PI * 2;
  }

  update(dt, player, room) {
    this.pulseTimer += dt * 4.2;
    if (this.consumed) return false;

    if (
      MathUtils.circleCollision(this.x, this.y, this.radius, player.x, player.y, player.radius)
    ) {
      this.consumed = true;
      if (room) {
        for (let i = 0; i < 28; i++) {
          const ang = (i * Math.PI * 2) / 28;
          const spd = 140 + Math.random() * 140;
          room.spawnParticle(
            this.x,
            this.y,
            Math.cos(ang) * spd,
            Math.sin(ang) * spd,
            5.5,
            this.color,
            0.65
          );
        }
      }
      if (typeof this.onSelectCallback === 'function') {
        this.onSelectCallback(this.altarType);
      }
      return true;
    }
    return false;
  }

  draw(ctx) {
    if (this.consumed) return;

    const floatY = Math.sin(this.pulseTimer) * 4.5;
    const oy = this.y - 6 + floatY;

    ctx.save();

    // Pedestal dimensional
    ctx.fillStyle = '#090d16';
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 3;
    ctx.fillRect(this.x - 42, this.y + 18, 84, 18);
    ctx.strokeRect(this.x - 42, this.y + 18, 84, 18);

    // Aura de resonancia exterior
    const auraR = this.radius + 10 + Math.sin(this.pulseTimer * 1.4) * 5;
    ctx.beginPath();
    ctx.arc(this.x, oy, auraR, 0, Math.PI * 2);
    ctx.strokeStyle = this.color;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Esfera central del Altar del Nexo
    ctx.beginPath();
    ctx.arc(this.x, oy, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = this.color;
    ctx.stroke();

    // Iconografía geométrica pura según el tipo de Altar del Nexo (Cero ctx.fillText)
    ctx.strokeStyle = this.color;
    ctx.fillStyle = this.color;
    ctx.lineWidth = 2.5;

    if (this.altarType === 'MIND_ALTAR') {
      // Ojo / Rombo Psíquico con órbitas de reliquias (Altar de la Mente)
      ctx.beginPath();
      ctx.moveTo(this.x, oy - 14);
      ctx.lineTo(this.x + 14, oy);
      ctx.lineTo(this.x, oy + 14);
      ctx.lineTo(this.x - 14, oy);
      ctx.closePath();
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(this.x, oy, 5, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.altarType === 'BODY_ALTAR') {
      // Escudo / Corazón Forjado de Estadísticas Base (Altar del Cuerpo)
      ctx.beginPath();
      ctx.moveTo(this.x - 13, oy - 11);
      ctx.lineTo(this.x + 13, oy - 11);
      ctx.lineTo(this.x + 13, oy + 2);
      ctx.lineTo(this.x, oy + 15);
      ctx.lineTo(this.x - 13, oy + 2);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#090d16';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.x, oy - 7);
      ctx.lineTo(this.x, oy + 9);
      ctx.moveTo(this.x - 7, oy);
      ctx.lineTo(this.x + 7, oy);
      ctx.stroke();
    } else if (this.altarType === 'ABYSS_ALTAR') {
      // Estrella Abisal de 8 puntas con anillos de peligro carmesí (Altar del Abismo)
      const spikes = 8;
      ctx.beginPath();
      for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 === 0 ? 17 : 7;
        const a = this.pulseTimer * 0.5 + (i * Math.PI) / spikes;
        const sx = this.x + Math.cos(a) * r;
        const sy = oy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }
}

/**
 * Subclase `NexusRoom` (La Sala del Nexo - Interacción de NG+ v2.0):
 *  - Aparece al derrotar al último jefe de la Sección 4 - Nivel 4.
 *  - No tiene enemigos ni trampas (`cleared = true`, `enemies = []`, `hazards = []`).
 *  - Si `ngPlusLevel === 0` (pasando a NG+1), instancia 2 altares en el centro:
 *      1. Izquierda: Altar de la Mente (`MIND_ALTAR`) -> Conserva Reliquias, resetea stats base.
 *      2. Derecha:   Altar del Cuerpo (`BODY_ALTAR`) -> Conserva stats base, vacía Reliquias.
 *  - Si `ngPlusLevel >= 1` (pasando a NG+2 o superior), instancia 1 único Altar del Abismo (`ABYSS_ALTAR`):
 *      - Conserva TODO (reliquias y stats), advirtiendo visualmente en el Canvas que el mundo
 *        escalará brutalmente (`x${ngPlusLevel + 2}`).
 */
class NexusRoom extends Room {
  constructor(onSelectAltarCallback) {
    super(777, 777, 'NEXUS', CONFIG.TOTAL_SECTIONS, CONFIG.LEVELS_PER_SECTION);
    this.cleared = true;
    this.enemies = [];
    this.hazards = [];
    this.onSelectAltarCallback = onSelectAltarCallback;
    this.warningPulse = 0;
    this.setupNexusAltars();
  }

  getHudTypeLabel() {
    return ngPlusLevel === 0
      ? '[SALA DEL NEXO // TRANSICIÓN NG+1]'
      : `[SALA DEL NEXO // UMBRAL ABISAL NG+${ngPlusLevel + 1}]`;
  }

  getFloorBackgroundColor() {
    return ngPlusLevel >= 1 ? '#180713' : '#090f24';
  }

  setupNexusAltars() {
    const cx = ROOM_BOUNDS.centerX;
    const cy = ROOM_BOUNDS.centerY - 25;

    if (ngPlusLevel === 0) {
      // Pasando al primer NG+ (NG+1): 2 Altares en el centro
      const spacing = 165;
      this.altars = [
        new NexusAltar(
          cx - spacing,
          cy,
          'MIND_ALTAR',
          'Altar de la Mente (Conserva Reliquias / Resetea Stats)',
          '#38bdf8',
          this.onSelectAltarCallback
        ),
        new NexusAltar(
          cx + spacing,
          cy,
          'BODY_ALTAR',
          'Altar del Cuerpo (Conserva Stats Base / Vacía Reliquias)',
          '#4ade80',
          this.onSelectAltarCallback
        ),
      ];
    } else {
      // Pasando a NG+2 o superior: 1 único Altar del Abismo en el centro
      this.altars = [
        new NexusAltar(
          cx,
          cy,
          'ABYSS_ALTAR',
          'Altar del Abismo (Conserva TODO / Escalado Brutal)',
          '#ef4444',
          this.onSelectAltarCallback
        ),
      ];
    }
  }

  update(dt, player, floor) {
    this.warningPulse += dt * 3.2;
    super.update(dt, player, floor);
  }

  drawRoomDecorations(ctx) {
    const cx = ROOM_BOUNDS.centerX;
    const cy = ROOM_BOUNDS.centerY - 25;

    ctx.save();
    if (ngPlusLevel === 0) {
      // Círculos arcanos de dualidad Mente / Cuerpo (Cero ctx.fillText)
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.28)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx - 165, cy, 68, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(74, 222, 128, 0.28)';
      ctx.beginPath();
      ctx.arc(cx + 165, cy, 68, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(192, 132, 252, 0.25)';
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(cx - 95, cy);
      ctx.lineTo(cx + 95, cy);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      // Advertencia visual brutal para NG+2 o superior (Anillos concéntricos carmesíes de peligro)
      for (let i = 1; i <= 3; i++) {
        const r = 65 * i + Math.sin(this.warningPulse - i) * 8;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(239, 68, 68, ${0.42 - i * 0.1})`;
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 8]);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Triángulo de advertencia de peligro extremo alrededor del Altar del Abismo
      ctx.beginPath();
      ctx.moveTo(cx, cy - 115);
      ctx.lineTo(cx + 110, cy + 75);
      ctx.lineTo(cx - 110, cy + 75);
      ctx.closePath();
      ctx.strokeStyle = 'rgba(248, 113, 113, 0.35)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    ctx.restore();
  }
}

/**
 * Generador Polimórfico de Mazmorra (`DungeonFloor` - v1.9):
 *  - Genera las coordenadas mediante Random Walker.
 *  - Instancia exactamente UNA `SanctuaryRoom` por nivel (pacífica, con sus 3 altares).
 *  - Distribuye el resto de salas polimórficamente entre `NormalRoom`, `HardRoom` y `HazardRoom`.
 *  - Marca la habitación más lejana como `isExitRoom = true` (con el portal hacia `ShopRoom` -> `BossRoom`).
 */
class DungeonFloor {
  constructor(
    sectionNumber,
    levelNumber,
    targetRooms = CONFIG.ROOMS_PER_FLOOR,
    spawnMult = 1.0,
    uiManager = null,
    eliteChanceMult = 1.0
  ) {
    this.sectionNumber = sectionNumber;
    this.levelNumber = levelNumber;
    this.targetRooms = targetRooms;
    this.spawnMult = spawnMult;
    this.ui = uiManager;
    this.eliteChanceMult = eliteChanceMult;
    this.rooms = new Map();
    this.shopRoom = new ShopRoom(99, 99, this.sectionNumber, this.levelNumber);
    this.bossRoom = new BossRoom(100, 100, this.sectionNumber, this.levelNumber);
    this.bossRoom.populateRoomContent(this.spawnMult, this.ui);
    this.generate();
  }

  static key(x, y) {
    return `${x},${y}`;
  }

  getRoom(x, y) {
    return this.rooms.get(DungeonFloor.key(x, y)) || null;
  }

  generate() {
    this.rooms.clear();

    // 1. Generar la topología de coordenadas: Estampar Sección Multi-Sala de Autor + Random Walker
    const coordsMap = new Map();
    coordsMap.set(DungeonFloor.key(0, 0), { gridX: 0, gridY: 0 });

    const stampedSection =
      typeof LevelTemplateSystem !== 'undefined' &&
      typeof LevelTemplateSystem.stampFloorSection === 'function'
        ? LevelTemplateSystem.stampFloorSection(coordsMap, this.targetRooms)
        : new Map();

    this.activeSectionName = null;
    for (const stInfo of stampedSection.values()) {
      if (stInfo.sectionName) {
        this.activeSectionName = stInfo.sectionName;
        break;
      }
    }

    const dirList = Object.values(DIRECTIONS);
    let walkerX = 0;
    let walkerY = 0;

    while (coordsMap.size < this.targetRooms) {
      if (Math.random() < 0.35) {
        const existingCoords = Array.from(coordsMap.values());
        const pick = existingCoords[Math.floor(Math.random() * existingCoords.length)];
        walkerX = pick.gridX;
        walkerY = pick.gridY;
      }

      const dir = dirList[Math.floor(Math.random() * dirList.length)];
      const nextX = walkerX + dir.dx;
      const nextY = walkerY + dir.dy;
      const nextKey = DungeonFloor.key(nextX, nextY);

      if (!coordsMap.has(nextKey)) {
        coordsMap.set(nextKey, { gridX: nextX, gridY: nextY });
      }

      walkerX = nextX;
      walkerY = nextY;
    }

    // 2. Identificar la coordenada más lejana a (0,0) como Sala de Salida / Jefe (respetando salas especiales estampadas)
    let exitKey = null;
    let maxDist = -1;
    for (const [k, coord] of coordsMap.entries()) {
      if (coord.gridX === 0 && coord.gridY === 0) continue;
      const stamped = stampedSection.get(k);
      if (stamped && (stamped.roomType === 'TREASURE' || stamped.roomType === 'SANCTUARY')) continue;
      const dist = Math.abs(coord.gridX) + Math.abs(coord.gridY);
      if (dist > maxDist) {
        maxDist = dist;
        exitKey = k;
      }
    }

    // 3. Selección y ordenamiento de salas especiales (Jefe, Tesoro, Tienda, Santuario)
    let stampedTreasureKey = null;
    let stampedSanctuaryKey = null;
    for (const [sk, sInfo] of stampedSection.entries()) {
      if (sk === exitKey) continue;
      if (sInfo.roomType === 'TREASURE' && !stampedTreasureKey) stampedTreasureKey = sk;
      if (sInfo.roomType === 'SANCTUARY' && !stampedSanctuaryKey) stampedSanctuaryKey = sk;
    }

    const candidates = Array.from(coordsMap.keys()).filter(
      (k) =>
        k !== '0,0' &&
        k !== exitKey &&
        k !== stampedTreasureKey &&
        k !== stampedSanctuaryKey
    );
    const getNeighborCount = (k) => {
      const c = coordsMap.get(k);
      let count = 0;
      for (const dir of dirList) {
        if (coordsMap.has(DungeonFloor.key(c.gridX + dir.dx, c.gridY + dir.dy))) count++;
      }
      return count;
    };
    // Priorizar celdas libres (no estampadas como combate) para ubicar las salas especiales restantes en callejones
    candidates.sort((a, b) => {
      const aStamped = stampedSection.has(a) ? 1 : 0;
      const bStamped = stampedSection.has(b) ? 1 : 0;
      if (aStamped !== bStamped) return aStamped - bStamped;
      return getNeighborCount(a) - getNeighborCount(b);
    });

    const treasureKey = stampedTreasureKey || (candidates.length > 0 ? candidates.shift() : null);
    const shopKey = candidates.length > 0 ? candidates.shift() : null;
    const sanctuaryKey = stampedSanctuaryKey || (candidates.length > 0 ? candidates.shift() : null);
    const combatKeys = candidates;
    const usedTemplateIds = new Set();

    // 4. Instanciar polimórficamente cada sala en la cuadrícula real
    const startRoom = new StartRoom(0, 0, this.sectionNumber, this.levelNumber);
    startRoom.visited = true;
    this.rooms.set('0,0', startRoom);

    if (treasureKey) {
      const tc = coordsMap.get(treasureKey);
      const tRoom = new TreasureRoom(tc.gridX, tc.gridY, this.sectionNumber, this.levelNumber);
      if (this.sectionNumber > 1 || this.levelNumber > 1) {
        tRoom.isLocked = true;
      }
      this.rooms.set(treasureKey, tRoom);
    }

    if (shopKey) {
      const sc = coordsMap.get(shopKey);
      this.shopRoom = new ShopRoom(sc.gridX, sc.gridY, this.sectionNumber, this.levelNumber);
      this.shopRoom.isLocked = true;
      this.rooms.set(shopKey, this.shopRoom);
    }

    if (sanctuaryKey) {
      const sancCoord = coordsMap.get(sanctuaryKey);
      this.rooms.set(
        sanctuaryKey,
        new SanctuaryRoom(sancCoord.gridX, sancCoord.gridY, this.sectionNumber, this.levelNumber)
      );
    }

    // Variedad y adaptación inteligente: 75% Plantillas de Autor (13x9) + 25% Procedural Estructurado
    combatKeys.forEach((k, idx) => {
      const c = coordsMap.get(k);
      const stamped = stampedSection.get(k);
      const hasN = coordsMap.has(DungeonFloor.key(c.gridX, c.gridY - 1));
      const hasS = coordsMap.has(DungeonFloor.key(c.gridX, c.gridY + 1));
      const hasW = coordsMap.has(DungeonFloor.key(c.gridX - 1, c.gridY));
      const hasE = coordsMap.has(DungeonFloor.key(c.gridX + 1, c.gridY));

      let chosenLayout;
      if (!hasN && !hasS && (hasW || hasE)) {
        const pool = ['CORRIDOR_H', 'UPPER_PATH', 'LOWER_PATH', 'CORNERS'];
        chosenLayout = pool[idx % pool.length];
      } else if (!hasW && !hasE && (hasN || hasS)) {
        const pool = ['CORRIDOR_V', 'TWIN_ISLANDS', 'CROSS_CHASM', 'OPEN'];
        chosenLayout = pool[idx % pool.length];
      } else {
        const pool = ['CORNERS', 'CROSS_CHASM', 'TWIN_ISLANDS', 'UPPER_PATH', 'LOWER_PATH', 'OPEN'];
        chosenLayout = pool[idx % pool.length];
      }

      let roomInstance;
      const desiredType = stamped && stamped.roomType ? stamped.roomType : null;
      if (desiredType === 'HARD' || (!desiredType && idx === 0)) {
        roomInstance = new HardRoom(c.gridX, c.gridY, this.sectionNumber, this.levelNumber, chosenLayout);
      } else if (desiredType === 'HAZARD' || (!desiredType && idx === 1)) {
        roomInstance = new HazardRoom(c.gridX, c.gridY, this.sectionNumber, this.levelNumber, chosenLayout);
      } else if (desiredType === 'NORMAL') {
        roomInstance = new NormalRoom(c.gridX, c.gridY, this.sectionNumber, this.levelNumber, chosenLayout);
      } else {
        const roll = Math.random();
        if (roll < 0.3) {
          roomInstance = new HardRoom(c.gridX, c.gridY, this.sectionNumber, this.levelNumber, chosenLayout);
        } else if (roll < 0.6) {
          roomInstance = new HazardRoom(c.gridX, c.gridY, this.sectionNumber, this.levelNumber, chosenLayout);
        } else {
          roomInstance = new NormalRoom(c.gridX, c.gridY, this.sectionNumber, this.levelNumber, chosenLayout);
        }
      }

      if (typeof LevelTemplateSystem !== 'undefined') {
        if (stamped && stamped.templateId) {
          roomInstance.assignedTemplateId = stamped.templateId;
          roomInstance.floorSectionName = stamped.sectionName || null;
          usedTemplateIds.add(stamped.templateId);
        } else if (Math.random() < (LevelTemplateSystem.AUTHORED_ROOM_CHANCE || 0.75)) {
          const pickedTpl = LevelTemplateSystem.pickTemplateForRoomType(roomInstance.type, usedTemplateIds);
          if (pickedTpl) {
            roomInstance.assignedTemplateId = pickedTpl.id;
            usedTemplateIds.add(pickedTpl.id);
          }
        }
      }

      this.rooms.set(k, roomInstance);
    });

    if (exitKey) {
      const ec = coordsMap.get(exitKey);
      this.bossRoom = new BossRoom(ec.gridX, ec.gridY, this.sectionNumber, this.levelNumber);
      this.bossRoom.populateRoomContent(this.spawnMult, this.ui);
      this.rooms.set(exitKey, this.bossRoom);
    }

    // 5. Conectar puertas entre salas vecinas
    for (const room of this.rooms.values()) {
      for (const dir of dirList) {
        const neighbor = this.getRoom(room.gridX + dir.dx, room.gridY + dir.dy);
        if (neighbor) {
          room.doors[dir.key] = true;
        }
      }
    }

    // 6. Sincronizar alineación de puertas entre salas contiguas (puertas compartidas en el mismo eje)
    for (const room of this.rooms.values()) {
      for (const dir of dirList) {
        const neighbor = this.getRoom(room.gridX + dir.dx, room.gridY + dir.dy);
        if (!neighbor) continue;

        if (dir.key === 'E') {
          if (room.doorOffsets.E !== undefined) {
            const clampedY = MathUtils.clamp(
              room.doorOffsets.E,
              neighbor.bounds.top + 55,
              neighbor.bounds.bottom - 55
            );
            neighbor.doorOffsets.W = clampedY;
            room.doorOffsets.E = clampedY;
          } else if (neighbor.doorOffsets.W !== undefined) {
            const clampedY = MathUtils.clamp(
              neighbor.doorOffsets.W,
              room.bounds.top + 55,
              room.bounds.bottom - 55
            );
            room.doorOffsets.E = clampedY;
            neighbor.doorOffsets.W = clampedY;
          }
        } else if (dir.key === 'S') {
          if (room.doorOffsets.S !== undefined) {
            const clampedX = MathUtils.clamp(
              room.doorOffsets.S,
              neighbor.bounds.left + 55,
              neighbor.bounds.right - 55
            );
            neighbor.doorOffsets.N = clampedX;
            room.doorOffsets.S = clampedX;
          } else if (neighbor.doorOffsets.N !== undefined) {
            const clampedX = MathUtils.clamp(
              neighbor.doorOffsets.N,
              room.bounds.left + 55,
              room.bounds.right - 55
            );
            room.doorOffsets.S = clampedX;
            neighbor.doorOffsets.N = clampedX;
          }
        }
      }
    }

    // 7. Despejar cualquier foso en los umbrales de puertas activas y poblar contenido (Plantillas 13x9 o Procedural)
    for (const room of this.rooms.values()) {
      // Fix Double Boss (v3.5): BossRoom ya genera su único Jefe en su constructor; evitar que una plantilla sobreescriba/duplique el Jefe.
      if (room.type === 'BOSS' || room instanceof BossRoom) {
        room.ensureDoorPassages();
        continue;
      }
      if (
        room.assignedTemplateId &&
        typeof LevelTemplateSystem !== 'undefined' &&
        typeof LevelTemplateSystem.getTemplateById === 'function'
      ) {
        const tpl = LevelTemplateSystem.getTemplateById(room.assignedTemplateId);
        if (tpl) {
          LevelTemplateSystem.applyTemplateToRoom(room, tpl, {
            spawnMultiplier: this.spawnMult,
            eliteChanceMult: this.eliteChanceMult
          });
          room.ensureDoorPassages();
          continue;
        }
      }
      room.ensureDoorPassages();
      room.populateRoomContent(this.spawnMult, this.ui, this.eliteChanceMult);
      if (typeof room.generateObstacles === 'function') {
        room.generateObstacles();
      }
    }
  }
}

// ----------------------------------------------------------------------------
// 10. ARQUITECTURA UIMANAGER (EVENT-DRIVEN DOM HUD - v1.7 / v2.1)
// ----------------------------------------------------------------------------
/**
 * Clase `UIManager`:
 *  - Guarda en caché todas las referencias a los nodos del DOM (`document.getElementById`).
 *  - NO se ejecuta en cada frame (`requestAnimationFrame`).
 *  - Actualiza el HTML/CSS únicamente cuando ocurre un evento real en el juego
 *    (daño recibido, moneda recolectada, cofre abierto, cambio de sala o estado de jefe).
 */
class UIManager {
  constructor() {
    this.dom = {
      version: document.getElementById('ui-version'),
      progression: document.getElementById('ui-progression'),
      shieldBadge: document.getElementById('ui-shield-badge'),
      hpText: document.getElementById('ui-hp-text'),
      hpFill: document.getElementById('ui-hp-fill'),
      coinCount: document.getElementById('coin-count'),

      statDamage: document.getElementById('stat-damage'),
      statAtkSpeed: document.getElementById('stat-atk-speed'),
      statExtraProj: document.getElementById('stat-extra-proj'),
      statCrit: document.getElementById('stat-crit'),
      statMoveSpeed: document.getElementById('stat-move-speed'),
      statDodge: document.getElementById('stat-dodge'),
      statDefense: document.getElementById('stat-defense'),
      statMagnet: document.getElementById('stat-magnet'),
      statWeaponName: document.getElementById('stat-weapon-name'),

      elementList: document.getElementById('element-list'),

      arenaToast: document.getElementById('arena-toast'),
      floatingTextContainer: document.getElementById('floating-text-container'),
      gameOverlay: document.getElementById('game-overlay'),
      overlayTitle: document.getElementById('overlay-title'),
      overlaySubtitle: document.getElementById('overlay-subtitle'),

      roomCoords: document.getElementById('room-coords'),
      roomTypeLabel: document.getElementById('room-type-label'),
      roomLockBadge: document.getElementById('room-lock-badge'),
      roomEnemiesCount: document.getElementById('room-enemies-count'),
      roomObjective: document.getElementById('room-objective'),
      domMinimap: document.getElementById('dom-minimap'),
      keyCount: document.getElementById('key-count'),

      bossPanel: document.getElementById('boss-panel'),
      bossPhaseBadge: document.getElementById('boss-phase-badge'),
      bossName: document.getElementById('boss-name'),
      bossHpText: document.getElementById('boss-hp-text'),
      bossHpFill: document.getElementById('boss-hp-fill'),
      bossStaminaFill: document.getElementById('boss-stamina-fill'),
      bossFsmState: document.getElementById('boss-fsm-state'),
      bossArmorState: document.getElementById('boss-armor-state'),

      relicCount: document.getElementById('relic-count'),
      relicGrid: document.getElementById('relic-grid'),
      relicInspectorTitle: document.getElementById('relic-inspector-title'),
      relicInspectorDesc: document.getElementById('relic-inspector-desc'),

      levelBanner: document.getElementById('hud-level-banner'),
      collectedRelicsStrip: document.getElementById('collected-relics-strip'),
      hudStaminaTrack: document.getElementById('hud-stamina-track'),
      hudStaminaFill: document.getElementById('hud-stamina-fill'),
      hudStaminaText: document.getElementById('hud-stamina-text'),
      mobileStaminaTrack: document.getElementById('mobile-stamina-track'),
      mobileStaminaFill: document.getElementById('mobile-stamina-fill'),
      hudWeaponCard: document.getElementById('hud-weapon-card'),
      hudWeaponSymbol: document.getElementById('hud-weapon-symbol'),
      hudWeaponMode: document.getElementById('hud-weapon-mode'),
      hudSawsBadge: document.getElementById('hud-saws-badge'),
      hudSawsText: document.getElementById('hud-saws-text'),

      // Meta-Progreso & Santuario DOM
      shardCount: document.getElementById('shard-count'),
      btnSanctuaryQuick: document.getElementById('btn-sanctuary-quick'),
      sanctuaryModal: document.getElementById('sanctuary-modal'),
      sanctuaryVaultNum: document.getElementById('sanctuary-vault-num'),
      sanctuaryTalentGrid: document.getElementById('sanctuary-talent-grid'),
      btnSanctuaryClose: document.getElementById('btn-sanctuary-close'),

      // Resumen Game Over & Ad Rewarded
      recapFloor: document.getElementById('recap-floor'),
      recapRooms: document.getElementById('recap-rooms'),
      recapKills: document.getElementById('recap-kills'),
      overlayRunShards: document.getElementById('overlay-run-shards'),
      overlayTotalShards: document.getElementById('overlay-total-shards'),
      btnAdDouble: document.getElementById('btn-ad-double'),
      btnAdText: document.getElementById('btn-ad-text'),
      btnOverlayRestart: document.getElementById('btn-overlay-restart'),
      btnOverlaySanctuary: document.getElementById('btn-overlay-sanctuary'),
      btnPauseSanctuary: document.getElementById('btn-pause-sanctuary'),

      // Sinergias
      synergyCount: document.getElementById('synergy-count'),
      synergyContainer: document.getElementById('synergy-container'),
      hudElementBadge: document.getElementById('hud-element-badge'),
      hudElementDot: document.getElementById('hud-element-dot'),
      hudElementText: document.getElementById('hud-element-text'),
      tabOverlay: document.getElementById('tab-overlay'),
      pauseMenu: document.getElementById('pause-menu'),
    };
    this.levelBannerTimer = null;
    this.toastTimer = null;

    this.relicSlots = [];
    this.initRelicGridSlots();
    this.initSanctuaryModal();

    const interactPromptEl = document.getElementById('world-interact-prompt');
    if (interactPromptEl) {
      interactPromptEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.activeGameInstance) {
          window.activeGameInstance.tryInteract();
        }
      });
    }
  }

  initSanctuaryModal() {
    const openSanctuary = () => {
      if (this.dom.sanctuaryModal) {
        this.dom.sanctuaryModal.classList.remove('hidden');
        this.renderSanctuaryTalents();
        this.renderSanctuaryArchetypes();
      }
    };
    const closeSanctuary = () => {
      if (this.dom.sanctuaryModal) {
        this.dom.sanctuaryModal.classList.add('hidden');
      }
    };

    if (this.dom.btnSanctuaryQuick) this.dom.btnSanctuaryQuick.addEventListener('click', openSanctuary);
    if (this.dom.btnPauseSanctuary) this.dom.btnPauseSanctuary.addEventListener('click', openSanctuary);
    if (this.dom.btnOverlaySanctuary) this.dom.btnOverlaySanctuary.addEventListener('click', openSanctuary);
    if (this.dom.btnSanctuaryClose) this.dom.btnSanctuaryClose.addEventListener('click', closeSanctuary);

    // Botón Suministro Rápido de Gemas con Anuncio en Santuario
    const btnQuickAdGems = document.getElementById('btn-sanctuary-quick-ad-gems');
    if (btnQuickAdGems) {
      btnQuickAdGems.addEventListener('click', () => {
        if (window.AdManager) {
          window.AdManager.showRewardedAd({
            title: 'SUMINISTRO RÁPIDO DE GEMAS',
            rewardDesc: '+35 Gemas del Abismo',
            onReward: () => {
              window.metaProgression.addShards(35);
              this.updateShards();
              this.renderSanctuaryTalents();
              this.renderSanctuaryArchetypes();
            }
          });
        }
      });
    }

    // Tabs del Santuario (v2.6)
    const tabTalents = document.getElementById('tab-btn-talents');
    const tabArchetypes = document.getElementById('tab-btn-archetypes');
    const tabOracle = document.getElementById('tab-btn-oracle');
    const contentTalents = document.getElementById('sanctuary-tab-talents');
    const contentArchetypes = document.getElementById('sanctuary-tab-archetypes');
    const contentOracle = document.getElementById('sanctuary-tab-oracle');

    const switchTab = (tabName) => {
      if (tabTalents) tabTalents.classList.toggle('active', tabName === 'talents');
      if (tabArchetypes) tabArchetypes.classList.toggle('active', tabName === 'archetypes');
      if (tabOracle) tabOracle.classList.toggle('active', tabName === 'oracle');

      if (contentTalents) contentTalents.classList.toggle('hidden', tabName !== 'talents');
      if (contentArchetypes) contentArchetypes.classList.toggle('hidden', tabName !== 'archetypes');
      if (contentOracle) contentOracle.classList.toggle('hidden', tabName !== 'oracle');

      if (tabName === 'talents') this.renderSanctuaryTalents();
      if (tabName === 'archetypes') this.renderSanctuaryArchetypes();
    };

    if (tabTalents) tabTalents.addEventListener('click', () => switchTab('talents'));
    if (tabArchetypes) tabArchetypes.addEventListener('click', () => switchTab('archetypes'));
    if (tabOracle) tabOracle.addEventListener('click', () => switchTab('oracle'));

    // Botones del Oráculo del Abismo
    const btnOracleAd = document.getElementById('btn-oracle-spin-ad');
    const btnOracleGems = document.getElementById('btn-oracle-spin-gems');
    const statusOracle = document.getElementById('oracle-reward-status');

    if (btnOracleAd) {
      btnOracleAd.addEventListener('click', () => {
        if (window.OracleManager) {
          window.OracleManager.spin('AD', (reward) => {
            if (statusOracle) statusOracle.textContent = `✨ ${reward.title}: ${reward.desc}`;
            this.updateShards();
          });
        }
      });
    }
    if (btnOracleGems) {
      btnOracleGems.addEventListener('click', () => {
        if (window.OracleManager) {
          window.OracleManager.spin('GEMS', (reward) => {
            if (statusOracle) statusOracle.textContent = `✨ ${reward.title}: ${reward.desc}`;
            this.updateShards();
          });
        }
      });
    }

    // Botón Continuar Partida Suspendida ("Modo Colectivo")
    const btnContinue = document.getElementById('btn-menu-continue');
    if (btnContinue) {
      btnContinue.addEventListener('click', () => {
        if (window.RunSaveManager) {
          if (!window.activeGameInstance) {
            const canvas = document.getElementById('gameCanvas');
            if (canvas) {
              window.activeGameInstance = new Game(canvas);
            }
          }
          if (window.activeGameInstance) {
            const ok = window.RunSaveManager.load(window.activeGameInstance);
            if (!ok) {
              this.showToast('⚠️ No se pudo reanudar la partida.');
            }
          }
        }
      });
    }

    // Botón Guardar y Salir en el Menú de Pausa
    const btnSaveQuit = document.getElementById('btn-pause-save-quit');
    if (btnSaveQuit) {
      btnSaveQuit.addEventListener('click', () => {
        if (window.RunSaveManager && window.activeGameInstance) {
          window.RunSaveManager.save(window.activeGameInstance);
          this.showToast('💾 ¡Partida guardada con éxito!');
          window.activeGameInstance.togglePause(false);
          const mainMenu = document.getElementById('main-menu');
          if (mainMenu) {
            mainMenu.classList.remove('hidden');
            mainMenu.style.display = 'flex';
          }
          const appShell = document.getElementById('app-shell');
          if (appShell) {
            appShell.classList.add('hidden');
            appShell.style.display = 'none';
          }
          window.RunSaveManager.updateContinueButtonUI();
        }
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.dom.sanctuaryModal && !this.dom.sanctuaryModal.classList.contains('hidden')) {
        e.stopPropagation();
        closeSanctuary();
      }
    });
  }

  renderSanctuaryArchetypes() {
    const grid = document.getElementById('sanctuary-archetype-grid');
    if (!grid || !window.PIG_ARCHETYPES || !window.metaProgression) return;
    grid.innerHTML = '';

    const mp = window.metaProgression;
    const currentArch = mp.getSelectedArchetype();

    for (const key in window.PIG_ARCHETYPES) {
      const arch = window.PIG_ARCHETYPES[key];
      const isUnlocked = mp.isArchetypeUnlocked(key);
      const isSelected = (currentArch === key);
      const canAfford = mp.getShards() >= arch.cost;

      const card = document.createElement('div');
      card.className = `archetype-card ${isSelected ? 'selected' : ''} ${!isUnlocked ? 'locked' : ''}`;

      card.innerHTML = `
        <div>
          <div class="archetype-header-row">
            <span class="archetype-name" style="color: ${arch.color};">
              <span>${arch.icon}</span>
              <span>${arch.name.toUpperCase()}</span>
            </span>
            <span class="archetype-badge" style="color: ${arch.color}; border: 1px solid ${arch.color};">${arch.badge}</span>
          </div>
          <div class="archetype-desc" style="margin-top: 8px;">${arch.desc}</div>
        </div>
        <div style="margin-top: 10px;">
          ${isSelected
            ? `<button class="btn-archetype-select" style="background: rgba(56, 189, 248, 0.25); border: 1.5px solid #38bdf8; color: #bae6fd;" disabled>★ ARQUETIPO ACTIVO ★</button>`
            : (isUnlocked
              ? `<button class="btn-archetype-select btn-select-arch" data-id="${key}" style="background: rgba(16, 185, 129, 0.25); border: 1.5px solid #10b981; color: #6ee7b7;">EQUIPAR CLASE</button>`
              : `<button class="btn-archetype-select btn-unlock-arch" data-id="${key}" data-cost="${arch.cost}" ${canAfford ? '' : 'disabled'} style="background: rgba(168, 85, 247, 0.25); border: 1.5px solid #a855f7; color: #f3e8ff;">
                  DESBLOQUEAR (${arch.cost} 💎)
                </button>`
            )
          }
        </div>
      `;

      const btnSelect = card.querySelector('.btn-select-arch');
      if (btnSelect) {
        btnSelect.addEventListener('click', () => {
          mp.selectArchetype(key);
          soundManager.playProcedural('pedestal', { volume: 0.8 });
          this.renderSanctuaryArchetypes();
          this.showToast(`🐷 ¡Arquetipo seleccionado: ${arch.name}!`);
        });
      }

      const btnUnlock = card.querySelector('.btn-unlock-arch');
      if (btnUnlock && canAfford) {
        btnUnlock.addEventListener('click', () => {
          if (mp.unlockArchetype(key, arch.cost)) {
            soundManager.playProcedural('pedestal', { volume: 0.9 });
            soundManager.playProcedural('key', { volume: 0.85 });
            this.updateShards();
            this.renderSanctuaryArchetypes();
            this.showToast(`🎉 ¡Clase desbloqueada: ${arch.name}!`);
          }
        });
      }

      grid.appendChild(card);
    }
  }

  updateShards(runShards, totalShards) {
    if (this.dom.shardCount) {
      this.dom.shardCount.textContent = String(totalShards !== undefined ? totalShards : window.metaProgression.getShards());
    }
    if (this.dom.sanctuaryVaultNum) {
      this.dom.sanctuaryVaultNum.textContent = `${window.metaProgression.getShards()} 💎`;
    }
    if (this.dom.overlayTotalShards) {
      this.dom.overlayTotalShards.textContent = `${window.metaProgression.getShards()} 💎`;
    }
  }

  renderSanctuaryTalents() {
    if (!this.dom.sanctuaryTalentGrid) return;
    this.dom.sanctuaryTalentGrid.innerHTML = '';
    const mp = window.metaProgression;
    if (this.dom.sanctuaryVaultNum) {
      this.dom.sanctuaryVaultNum.textContent = `${mp.getShards()} 💎`;
    }

    for (const key in TALENT_DEFS) {
      const talent = TALENT_DEFS[key];
      const curLvl = mp.getTalentLevel(key);
      const isMax = curLvl >= talent.maxLevel;
      const nextCost = isMax ? null : talent.costs[curLvl];
      const canAfford = !isMax && mp.getShards() >= nextCost;

      const card = document.createElement('div');
      card.className = 'talent-card' + (isMax ? ' maxed' : '');

      card.innerHTML = `
        <div>
          <div class="talent-header-row">
            <div class="talent-name-group">
              <span>${talent.icon}</span>
              <span>${talent.name}</span>
            </div>
            <span class="talent-level-badge">${isMax ? 'MAX' : `Nv. ${curLvl}/${talent.maxLevel}`}</span>
          </div>
          <div class="talent-desc">${talent.desc}</div>
        </div>
        <button class="btn-talent-upgrade" ${isMax || !canAfford ? 'disabled' : ''}>
          ${isMax ? '¡COMPLETO!' : `<span>MEJORAR</span> <span>(${nextCost} 💎)</span>`}
        </button>
      `;

      const btn = card.querySelector('.btn-talent-upgrade');
      if (btn && !isMax && canAfford) {
        btn.addEventListener('click', () => {
          if (mp.upgradeTalent(key)) {
            soundManager.playProcedural('pedestal', { volume: 0.7 });
            this.updateShards(0, mp.getShards());
            this.renderSanctuaryTalents();
          }
        });
      }

      this.dom.sanctuaryTalentGrid.appendChild(card);
    }
  }

  updateSynergies(synergyManager) {
    if (!this.dom.synergyContainer) return;
    this.dom.synergyContainer.innerHTML = '';
    const active = Array.from(synergyManager.activeSynergies);
    if (this.dom.synergyCount) {
      this.dom.synergyCount.textContent = `${active.length} ACTIVAS`;
    }

    if (active.length === 0) {
      this.dom.synergyContainer.innerHTML = '<div class="synergy-empty">Sin fusiones activas (Combina armas y reliquias afines)</div>';
      return;
    }

    for (const key of active) {
      const syn = SYNERGIES[key];
      if (!syn) continue;
      const sc = document.createElement('div');
      sc.className = 'synergy-card';
      sc.innerHTML = `
        <div class="synergy-card-header">
          <span>${syn.icon} ${syn.name}</span>
          <span style="color: #4ade80; font-size: 0.65rem;">ACTIVA</span>
        </div>
        <div class="synergy-card-desc">${syn.desc}</div>
      `;
      this.dom.synergyContainer.appendChild(sc);
    }
  }

  /**
   * Construye las casillas del inventario en Grid dinámicamente según `RELIC_KEYS.length`
   * incluyendo el indicador numérico de nivel/stack (`x2`, `x5`, etc. - v2.0).
   */
  initRelicGridSlots() {
    if (!this.dom.relicGrid) return;
    this.dom.relicGrid.innerHTML = '';
    this.relicSlots = [];

    const totalSlots = typeof RELIC_KEYS !== 'undefined' ? RELIC_KEYS.length : 25;
    for (let i = 0; i < totalSlots; i++) {
      const slot = document.createElement('div');
      slot.className = 'relic-slot';
      const idxSpan = document.createElement('span');
      idxSpan.className = 'relic-slot-idx';
      idxSpan.textContent = String(i + 1).padStart(2, '0');
      const codeSpan = document.createElement('span');
      codeSpan.textContent = '---';
      const stackSpan = document.createElement('span');
      stackSpan.className = 'relic-slot-stack';
      stackSpan.textContent = '';

      slot.appendChild(idxSpan);
      slot.appendChild(codeSpan);
      slot.appendChild(stackSpan);
      this.dom.relicGrid.appendChild(slot);
      this.relicSlots.push({ root: slot, idxSpan, codeSpan, stackSpan });
    }
  }

  updateProgression(section, level) {
    if (this.dom.version) {
      if (isMortalMode) {
        this.dom.version.textContent = `v2.1 | MODO MORTAL (NG+ ${ngPlusLevel})`;
        this.dom.version.style.background = '#ef4444';
        this.dom.version.style.color = '#ffffff';
        this.dom.version.style.boxShadow = '0 0 10px rgba(239, 68, 68, 0.6)';
      } else {
        this.dom.version.textContent = CONFIG.VERSION;
        this.dom.version.style.background = '';
        this.dom.version.style.color = '';
        this.dom.version.style.boxShadow = '';
      }
    }
    if (this.dom.progression) {
      this.dom.progression.textContent = isMortalMode
        ? `MODO MORTAL | Sección: ${section} - Nivel: ${level}`
        : `NG+ ${ngPlusLevel} | Sección: ${section} - Nivel: ${level}`;
      this.dom.progression.style.color = isMortalMode ? '#ef4444' : (ngPlusLevel >= 1 ? '#facc15' : '#f8fafc');
    }

    if (this.dom.levelBanner) {
      this.dom.levelBanner.classList.remove('fade-out');
      if (this.levelBannerTimer) clearTimeout(this.levelBannerTimer);
      this.levelBannerTimer = setTimeout(() => {
        if (this.dom.levelBanner) {
          this.dom.levelBanner.classList.add('fade-out');
        }
      }, 3500);
    }
  }

  updateHealth(player) {
    if (!player) return;
    const hp = Math.ceil(player.hp);
    const maxHp = player.maxHp;
    const ratio = MathUtils.clamp(player.hp / maxHp, 0, 1);

    if (this.dom.hpText) {
      this.dom.hpText.textContent = `${hp} / ${maxHp}`;
    }
    if (this.dom.hpFill) {
      this.dom.hpFill.style.width = `${(ratio * 100).toFixed(1)}%`;
      this.dom.hpFill.classList.toggle('low-hp', ratio <= 0.35);
    }

    if (this.dom.shieldBadge) {
      if (player.shield > 0) {
        this.dom.shieldBadge.textContent = `ESCUDO: +${player.shield}`;
        this.dom.shieldBadge.style.color = '#38bdf8';
      } else {
        const secondSkinState = player.itemManager.relicStates.get('SECOND_SKIN');
        if (secondSkinState && secondSkinState.ready) {
          this.dom.shieldBadge.textContent = 'ESCUDO LISTO';
          this.dom.shieldBadge.style.color = '#93c5fd';
        } else if (secondSkinState && !secondSkinState.ready) {
          this.dom.shieldBadge.textContent = 'ESCUDO EN CD';
          this.dom.shieldBadge.style.color = '#94a3b8';
        } else {
          this.dom.shieldBadge.textContent = ratio <= 0.25 ? 'CRÍTICO' : 'ESTABLE';
          this.dom.shieldBadge.style.color = ratio <= 0.25 ? '#ef4444' : '#38bdf8';
        }
      }
    }
  }

  updateStamina(player) {
    if (!player) return;
    const cur = Math.max(0, Math.round(player.stamina ?? 0));
    const max = Math.max(1, Math.round(player.maxStamina ?? 100));
    const exhausted = Boolean(player.isStaminaExhausted || cur <= 0);
    const penalty = Boolean(player.staminaAttackPenaltyTimer > 0);
    const dashCost = typeof player.getDashStaminaCost === 'function' ? player.getDashStaminaCost() : 30;
    const key = `${cur}|${max}|${exhausted ? 1 : 0}|${penalty ? 1 : 0}|${dashCost}`;
    if (this._lastStaminaKey === key) return;
    this._lastStaminaKey = key;

    const pct = MathUtils.clamp((cur / max) * 100, 0, 100).toFixed(1) + '%';
    if (this.dom.hudStaminaFill) {
      this.dom.hudStaminaFill.style.width = pct;
      this.dom.hudStaminaFill.classList.toggle('exhausted', exhausted);
      this.dom.hudStaminaFill.classList.toggle('penalized', !exhausted && penalty);
    }
    if (this.dom.hudStaminaTrack) {
      this.dom.hudStaminaTrack.classList.toggle('exhausted', exhausted);
    }
    if (this.dom.hudStaminaText) {
      this.dom.hudStaminaText.textContent = exhausted ? 'AGOTADO' : `${cur}/${max}`;
      this.dom.hudStaminaText.style.color = exhausted ? '#ef4444' : (penalty ? '#f59e0b' : '');
    }
    if (this.dom.mobileStaminaFill) {
      this.dom.mobileStaminaFill.style.width = pct;
      this.dom.mobileStaminaFill.classList.toggle('exhausted', exhausted);
    }
    if (this.dom.mobileStaminaTrack) {
      this.dom.mobileStaminaTrack.classList.toggle('exhausted', exhausted);
    }
    if (this.dom.statDodge) {
      const dashesLeft = Math.floor(cur / Math.max(1, dashCost));
      this.dom.statDodge.textContent = `${cur}/${max} (${dashesLeft} dash · coste ${dashCost})`;
      this.dom.statDodge.style.color = exhausted ? '#ef4444' : '#fbbf24';
    }
  }

  updateKeys(keys) {
    if (this.dom.keyCount) {
      this.dom.keyCount.textContent = String(keys);
    }
  }

  updateCoins(coins) {
    if (this.dom.coinCount) {
      this.dom.coinCount.textContent = String(coins);
    }
  }

  updateStats(player) {
    if (!player) return;
    if (this.dom.statDamage) {
      this.dom.statDamage.textContent = `x${player.damageMultiplier.toFixed(2)}`;
    }
    if (this.dom.statAtkSpeed) {
      this.dom.statAtkSpeed.textContent = `x${player.attackSpeedMultiplier.toFixed(2)}`;
    }
    if (this.dom.statExtraProj) {
      this.dom.statExtraProj.textContent = `+${player.extraProjectiles}`;
    }
    if (this.dom.statCrit) {
      const critPct = Math.round((player.critChance || 0) * 100);
      this.dom.statCrit.textContent = `${critPct}% (x2.0)`;
      this.dom.statCrit.style.color = critPct > 0 ? '#fde047' : '';
    }
    if (this.dom.statMoveSpeed) {
      this.dom.statMoveSpeed.textContent = `${Math.round(player.speed)}`;
    }
    this.updateStamina(player);
    if (this.dom.statDefense) {
      const defPct = Math.round((1 - player.getDefenseMitigationMultiplier()) * 100);
      this.dom.statDefense.textContent =
        defPct > 0 ? `+${player.baseDefense} (${defPct}% Mit.)` : `+${player.baseDefense}`;
    }
    if (this.dom.statMagnet) {
      this.dom.statMagnet.textContent = `x${player.coinMagnetMultiplier.toFixed(2)}`;
    }
    const activeEvo = (typeof EvolutionManager !== 'undefined' && player.currentWeapon)
      ? EvolutionManager.getActiveEvolution(player, player.currentWeapon)
      : null;

    if (this.dom.statWeaponName && player.currentWeapon) {
      if (activeEvo) {
        this.dom.statWeaponName.innerHTML = `<span style="color: ${activeEvo.color}; text-shadow: 0 0 8px ${activeEvo.color}88;">★ ${activeEvo.title}</span>`;
      } else {
        this.dom.statWeaponName.textContent = player.currentWeapon.name;
      }
    }
    if (this.dom.hudWeaponSymbol && player.currentWeapon) {
      if (activeEvo) {
        this.dom.hudWeaponSymbol.textContent = activeEvo.symbol;
      } else {
        this.dom.hudWeaponSymbol.textContent = player.currentWeapon.symbol || '🔮';
      }
    }
    if (this.dom.hudWeaponMode && player.currentWeapon && typeof player.currentWeapon.getModeBadge === 'function') {
      this.dom.hudWeaponMode.textContent = player.currentWeapon.getModeBadge();
    }
    if (this.dom.hudSawsBadge && this.dom.hudSawsText && player.sawShield) {
      const saw = player.sawShield;
      const count = saw.getSawCount(player);
      if (saw.isActive) {
        this.dom.hudSawsBadge.classList.add('active');
        this.dom.hudSawsBadge.classList.remove('recharging');
        this.dom.hudSawsText.textContent = `SIERRAS: ACTIVA (${saw.timer.toFixed(1)}s) [x${count}]`;
      } else {
        this.dom.hudSawsBadge.classList.remove('active');
        this.dom.hudSawsBadge.classList.add('recharging');
        this.dom.hudSawsText.textContent = `SIERRAS: CD (${saw.cooldownTimer.toFixed(1)}s) [x${count}]`;
      }
    }
    this.updateStamina(player);
  }

  updateBossStamina(boss) {
    if (!boss || !this.dom.bossStaminaFill) return;
    const cur = Math.max(0, Math.round(boss.stamina ?? 0));
    const max = Math.max(1, Math.round(boss.maxStamina ?? 160));
    const exh = Boolean(boss.isExhausted);
    const key = `${cur}|${max}|${exh ? 1 : 0}`;
    if (this._lastBossStamKey === key) return;
    this._lastBossStamKey = key;
    const pct = MathUtils.clamp((cur / max) * 100, 0, 100).toFixed(1) + '%';
    this.dom.bossStaminaFill.style.width = pct;
    this.dom.bossStaminaFill.classList.toggle('exhausted', exh);
  }

  updateElements(elementalPool) {
    if (this.dom.hudElementText) {
      const entriesForBadge = Object.entries(elementalPool);
      if (entriesForBadge.length === 0) {
        this.dom.hudElementText.textContent = 'Sin Afinidad';
        this.dom.hudElementText.style.color = 'var(--text-dim)';
        if (this.dom.hudElementDot) this.dom.hudElementDot.style.background = 'var(--text-dim)';
        if (this.dom.hudElementBadge) this.dom.hudElementBadge.style.borderColor = 'var(--border-bright)';
      } else {
        const primaryKey = entriesForBadge[0][0];
        const primaryLvl = entriesForBadge[0][1];
        const primaryCfg = ELEMENTS[primaryKey];
        const label = primaryCfg ? `${primaryCfg.name} Lv.${primaryLvl}` : `${primaryKey} Lv.${primaryLvl}`;
        this.dom.hudElementText.textContent = label;
        if (primaryCfg) {
          this.dom.hudElementText.style.color = primaryCfg.color;
          if (this.dom.hudElementDot) this.dom.hudElementDot.style.background = primaryCfg.color;
          if (this.dom.hudElementBadge) this.dom.hudElementBadge.style.borderColor = primaryCfg.color;
        }
      }
    }

    if (!this.dom.elementList) return;
    this.dom.elementList.innerHTML = '';

    const entries = Object.entries(elementalPool);
    if (entries.length === 0) {
      const emptyLi = document.createElement('li');
      emptyLi.className = 'element-empty';
      emptyLi.textContent = 'Sin elementos adquiridos (Abre el cofre de la sala inicial)';
      this.dom.elementList.appendChild(emptyLi);
      return;
    }

    for (const [key, level] of entries) {
      const cfg = ELEMENTS[key];
      if (!cfg) continue;

      const li = document.createElement('li');
      li.className = 'element-item';
      li.style.borderLeftColor = cfg.color;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'element-name';
      nameSpan.style.color = cfg.color;
      const bonusPct = (level - 1) * 20;
      nameSpan.textContent =
        bonusPct > 0 ? `${cfg.name} (+${bonusPct}% Efec.)` : cfg.name;

      const lvlSpan = document.createElement('span');
      lvlSpan.className = 'element-lvl';
      lvlSpan.textContent = `Lv. ${level}`;

      li.appendChild(nameSpan);
      li.appendChild(lvlSpan);
      this.dom.elementList.appendChild(li);
    }
  }

  updateRelics(ownedRelics, newlyGranted = null) {
    const totalRelics = typeof RELIC_KEYS !== 'undefined' ? RELIC_KEYS.length : 25;
    if (this.relicSlots.length !== totalRelics) {
      this.initRelicGridSlots();
    }
    const totalStacks = ownedRelics.reduce((sum, r) => sum + (r.level || 1), 0);
    if (this.dom.relicCount) {
      this.dom.relicCount.textContent =
        totalStacks > ownedRelics.length
          ? `${ownedRelics.length} / ${totalRelics} (Stacks: ${totalStacks})`
          : `${ownedRelics.length} / ${totalRelics}`;
    }

    for (let i = 0; i < this.relicSlots.length; i++) {
      const slotObj = this.relicSlots[i];
      const relic = ownedRelics[i];
      if (relic) {
        const catIdx =
          typeof RELIC_KEYS !== 'undefined' ? RELIC_KEYS.indexOf(relic.id) + 1 : i + 1;
        const lvl = relic.level || 1;
        slotObj.root.className = 'relic-slot owned';
        slotObj.root.style.borderColor = relic.color;
        if (slotObj.idxSpan) {
          slotObj.idxSpan.textContent = `#${String(catIdx > 0 ? catIdx : i + 1).padStart(2, '0')}`;
        }
        slotObj.codeSpan.textContent = relic.short;
        slotObj.codeSpan.style.color = relic.color;
        if (slotObj.stackSpan) {
          if (lvl > 1) {
            slotObj.stackSpan.textContent = `x${lvl}`;
            slotObj.stackSpan.classList.add('visible');
          } else {
            slotObj.stackSpan.textContent = '';
            slotObj.stackSpan.classList.remove('visible');
          }
        }
        slotObj.root.onmouseenter = () => this.inspectRelic(relic);
      } else {
        slotObj.root.className = 'relic-slot';
        slotObj.root.style.borderColor = '';
        if (slotObj.idxSpan) {
          slotObj.idxSpan.textContent = String(i + 1).padStart(2, '0');
        }
        slotObj.codeSpan.textContent = '---';
        slotObj.codeSpan.style.color = '';
        if (slotObj.stackSpan) {
          slotObj.stackSpan.textContent = '';
          slotObj.stackSpan.classList.remove('visible');
        }
        slotObj.root.onmouseenter = null;
      }
    }

    // Las reliquias ya no saturan la pantalla principal; se consultan exclusivamente en el menú [TAB]
    if (this.dom.collectedRelicsStrip) {
      this.dom.collectedRelicsStrip.innerHTML = '';
    }

    if (newlyGranted) {
      this.inspectRelic(newlyGranted);
    } else if (ownedRelics.length === 0) {
      if (this.dom.relicInspectorTitle) {
        this.dom.relicInspectorTitle.textContent = 'SIN RELIQUIA SELECCIONADA';
        this.dom.relicInspectorTitle.style.color = '';
      }
      if (this.dom.relicInspectorDesc) {
        this.dom.relicInspectorDesc.textContent =
          'Derrota a un ★ ELITE ★ para abrir su Cofre de Reliquia.';
      }
    }
  }

  inspectRelic(relic) {
    if (!relic) return;
    const lvl = relic.level || 1;
    const effMult = lvl > 1 ? (1 + lvl * 0.2).toFixed(2) : '1.00';
    if (this.dom.relicInspectorTitle) {
      this.dom.relicInspectorTitle.textContent =
        lvl > 1
          ? `[${relic.short}] ${relic.name.toUpperCase()} (x${lvl} // Efect. x${effMult})`
          : `[${relic.short}] ${relic.name.toUpperCase()}`;
      this.dom.relicInspectorTitle.style.color = relic.color;
    }
    if (this.dom.relicInspectorDesc) {
      this.dom.relicInspectorDesc.textContent =
        lvl > 1
          ? `${relic.description} [Stack x${lvl}: Efectividad escalada +${lvl * 20}%]`
          : relic.description;
    }
  }

  updateRoomInfo(room, floor) {
    if (!room) return;

    if (this.dom.roomCoords) {
      this.dom.roomCoords.textContent =
        room.type === 'SHOP'
          ? 'ZONA TIENDA'
          : room.type === 'BOSS'
          ? 'ARENA JEFE'
          : room.type === 'NEXUS'
          ? 'ZONA NEXO (NG+)'
          : `SALA (${room.gridX}, ${room.gridY})`;
    }

    const floorBossName =
      room.bossName || (floor && floor.bossRoom && floor.bossRoom.bossName) || 'JEFE';
    const shortBossName = floorBossName.split(',')[0];

    if (this.dom.roomTypeLabel) {
      this.dom.roomTypeLabel.textContent =
        typeof room.getHudTypeLabel === 'function' ? room.getHudTypeLabel() : `[${room.type}]`;
      const typeColorMap = {
        START: '#38bdf8',
        NORMAL: '#cbd5e1',
        HARD: '#facc15',
        HAZARD: '#fb923c',
        SANCTUARY: '#38bdf8',
        SHOP: '#4ade80',
        BOSS: '#f87171',
        NEXUS: '#c084fc',
      };
      this.dom.roomTypeLabel.style.color = room.isExitRoom
        ? '#c084fc'
        : typeColorMap[room.type] || '#cbd5e1';
    }

    if (this.dom.roomLockBadge) {
      this.dom.roomLockBadge.textContent = room.cleared
        ? 'PUERTAS ABIERTAS'
        : 'PUERTAS BLOQUEADAS';
      this.dom.roomLockBadge.className = `room-badge ${room.cleared ? 'cleared' : 'locked'}`;
    }

    if (this.dom.roomEnemiesCount) {
      this.dom.roomEnemiesCount.textContent = String(room.enemies.length);
    }

    if (this.dom.roomObjective) {
      if (!room.cleared) {
        if (room.type === 'BOSS') {
          this.dom.roomObjective.textContent = `Derrotar a ${shortBossName}`;
        } else if (room.type === 'HARD') {
          this.dom.roomObjective.textContent = 'Eliminar élite (+50% / Escudo cíclico)';
        } else if (room.type === 'HAZARD') {
          this.dom.roomObjective.textContent = 'Sobrevivir a trampas y hostiles';
        } else {
          this.dom.roomObjective.textContent = 'Eliminar hostiles';
        }
      } else if (room.type === 'NEXUS') {
        this.dom.roomObjective.textContent =
          ngPlusLevel === 0
            ? 'Elegir Altar [Izq: Mente | Der: Cuerpo] -> NG+1'
            : `Tocar Altar del Abismo -> NG+${ngPlusLevel + 1} (x${ngPlusLevel + 2})`;
      } else if (room.type === 'SANCTUARY') {
        const hasUnusedAltar = room.altars && room.altars.some((a) => !a.purchased);
        this.dom.roomObjective.textContent = hasUnusedAltar
          ? 'Elegir 1 Altar [Vida | Vel. | Defensa]'
          : 'Bendición activa -> Explorar piso';
      } else if (room.isExitRoom || room.type === 'EXIT') {
        this.dom.roomObjective.textContent = 'Entrar al Portal -> Tienda';
      } else if (room.type === 'SHOP') {
        this.dom.roomObjective.textContent = `Elegir 1 mejora -> ${shortBossName}`;
      } else if (room.type === 'BOSS') {
        const isFinalBossOfCycle =
          room.sectionNumber === CONFIG.TOTAL_SECTIONS &&
          room.levelNumber === CONFIG.LEVELS_PER_SECTION;
        this.dom.roomObjective.textContent = isFinalBossOfCycle
          ? 'Portal -> Sala del Nexo (NG+)'
          : 'Entrar al Portal -> Sig. Piso';
      } else {
        this.dom.roomObjective.textContent = 'Buscar sala de salida';
      }
    }

    this.renderDomMinimap(room, floor);
  }

  renderDomMinimap(currentRoom, floor) {
    if (!this.dom.domMinimap || !floor) return;
    this.dom.domMinimap.innerHTML = '';

    if (
      currentRoom.type === 'SHOP' ||
      currentRoom.type === 'BOSS' ||
      currentRoom.type === 'NEXUS'
    ) {
      const floorBossName =
        currentRoom.bossName || (floor.bossRoom && floor.bossRoom.bossName) || 'JEFE';
      const label = document.createElement('div');
      label.className = 'minimap-special-label';
      label.style.color =
        currentRoom.type === 'NEXUS'
          ? '#c084fc'
          : currentRoom.type === 'BOSS'
          ? '#f87171'
          : '#facc15';
      label.textContent =
        currentRoom.type === 'NEXUS'
          ? ngPlusLevel === 0
            ? '★ NEXO NG+1: IZQ [MENTE: Reliquias] | DER [CUERPO: Stats Base] ★'
            : `⚠ ALTAR DEL ABISMO (NG+${ngPlusLevel + 1}): Conservas TODO // Enemigos x${ngPlusLevel + 2} ⚠`
          : currentRoom.type === 'BOSS'
          ? `★ CÁMARA DEL JEFE: ${floorBossName} ★`
          : 'TIENDA: ROJO (+DMG: 4$) | AZUL (+1 PRJ: 6$) | PÚRPURA (+SPD: 4$)';
      this.dom.domMinimap.appendChild(label);
      return;
    }

    const containerW = 280;
    const containerH = 118;
    const centerX = containerW / 2;
    const centerY = containerH / 2;
    const step = 20;

    for (const r of floor.rooms.values()) {
      const dx = (r.gridX - currentRoom.gridX) * step;
      const dy = (r.gridY - currentRoom.gridY) * step;
      const left = centerX + dx - 8;
      const top = centerY + dy - 8;

      if (left < 4 || left > containerW - 20 || top < 4 || top > containerH - 20) {
        continue;
      }

      const node = document.createElement('div');
      node.className = 'minimap-node';
      if (r === currentRoom) node.classList.add('current');
      else if (r.isExitRoom || r.type === 'EXIT') node.classList.add('exit');
      else if (r.type === 'SANCTUARY') node.classList.add('sanctuary');
      else if (r.visited && r.type === 'HARD') node.classList.add('hard');
      else if (r.visited && r.type === 'HAZARD') node.classList.add('hazard');
      else if (r.visited) node.classList.add('visited');
      if (r.type === 'TREASURE') node.classList.add('treasure');
      else if (r.type === 'SHOP') node.classList.add('shop');
      else if (r.type === 'BOSS') node.classList.add('boss');

      if (r.layoutType === 'CORRIDOR_H') {
        node.style.width = '20px';
        node.style.height = '10px';
        node.style.top = `${top + 3}px`;
        node.style.borderRadius = '3px';
      } else if (r.layoutType === 'CORRIDOR_V') {
        node.style.width = '10px';
        node.style.height = '20px';
        node.style.left = `${left + 3}px`;
        node.style.borderRadius = '3px';
      }

      node.style.left = node.style.left || `${left}px`;
      node.style.top = node.style.top || `${top}px`;
      this.dom.domMinimap.appendChild(node);
    }
  }

  updateBossStatus(boss, room, floor = null) {
    if (!this.dom.bossPanel) return;

    const assignedBossName =
      (boss && boss.bossTitle) ||
      (room && room.bossName) ||
      (floor && floor.bossRoom && floor.bossRoom.bossName) ||
      'JEFE DEL NIVEL';

    if (this.dom.bossName) {
      this.dom.bossName.textContent = assignedBossName;
    }

    if (!boss || boss.markedForDeletion || (room && room.type !== 'BOSS')) {
      this.dom.bossPanel.classList.add('hidden');
      this.dom.bossPanel.classList.remove('active-boss');
      this.dom.bossPanel.classList.remove('phase-2-enrage');
      const defeated = room && room.type === 'BOSS' && room.cleared;
      if (this.dom.bossPhaseBadge) {
        this.dom.bossPhaseBadge.textContent = defeated ? 'DERROTADO' : 'EN ESPERA';
        this.dom.bossPhaseBadge.style.color = defeated ? '#4ade80' : '#94a3b8';
      }
      if (this.dom.bossHpText) {
        this.dom.bossHpText.textContent = defeated ? '0 / 0' : '-- / --';
      }
      if (this.dom.bossHpFill) {
        this.dom.bossHpFill.style.width = '0%';
      }
      if (this.dom.bossStaminaFill) {
        this.dom.bossStaminaFill.style.width = '0%';
        this.dom.bossStaminaFill.classList.remove('exhausted');
      }
      if (this.dom.bossFsmState) {
        this.dom.bossFsmState.textContent = defeated
          ? 'Portal de Nivel Abierto'
          : 'Aguardando en Cámara de Jefe';
      }
      if (this.dom.bossArmorState) {
        this.dom.bossArmorState.textContent = defeated
          ? 'Neutralizado'
          : 'Listo para el combate';
        this.dom.bossArmorState.style.color = defeated ? '#4ade80' : '#94a3b8';
      }
      return;
    }

    this.dom.bossPanel.classList.remove('hidden');
    this.dom.bossPanel.classList.add('active-boss');
    if (this.dom.bossPhaseBadge) {
      this.dom.bossPhaseBadge.textContent = `FASE ${boss.phase}`;
      this.dom.bossPhaseBadge.style.color = boss.phase === 2 ? '#ef4444' : '#facc15';
    }
    if (this.dom.bossHpText) {
      this.dom.bossHpText.textContent = `${Math.ceil(boss.hp)} / ${boss.maxHp}`;
    }
    if (this.dom.bossHpFill) {
      const ratio = MathUtils.clamp(boss.hp / boss.maxHp, 0, 1);
      this.dom.bossHpFill.style.width = `${(ratio * 100).toFixed(1)}%`;
    }
    this.updateBossStamina(boss);

    const fsmNames = {
      // Goliat
      P1_MARCH: 'Marcha + Ráfaga Abanico',
      P1_HAMMER_TELEGRAPH: '¡PELIGRO! Martillo Sísmico',
      P1_HAMMER_RECOVERY: 'Impacto Sísmico',
      P1_WALL_TELEGRAPH: '¡PELIGRO! Embestida de Muralla',
      P1_WALL_DASH: 'Embestida de Muralla',
      P1_WALL_STUNNED: '¡ESTRELLADO EN MURO! (¡ATÁCALO!)',
      P2_PREPARE_DASH: 'Fijando Trayectoria Explosiva',
      P2_EXPLOSIVE_DASH: 'Dash Explosivo (Suelo Agrietado)',
      P2_RING_JUMP_AIR: '¡SALTO AL CENTRO (INVULNERABLE)!',
      P2_RING_LAND_RECOVERY: '¡SOBRECALENTADO! (Ventana de Castigo)',

      // Némesis
      P1_OCULAR_JUDGMENT: 'Juicio Ocular (Soft-Homing)',
      P1_PRISON_TELEGRAPH: '¡PELIGRO! Prisión Geométrica',
      P1_GRAVITY_RAIN: 'Lluvia Invertida (Gravedad 0.5x)',
      P1_OCULAR_RECOVERY: '¡OJO EXPUESTO! (Ventana de Castigo)',
      P2_OCULAR_JUDGMENT: 'Juicio Ocular Despierto + Escudos',
      P2_PRISON_TELEGRAPH: '¡PELIGRO! Prisión del Vacío',
      P2_GRAVITY_RAIN: 'Lluvia Invertida + Clon Oscuro',
      P2_OCULAR_RECOVERY: '¡NÚCLEO ABIERTO! (Ventana de Castigo)',

      // Abismo
      P1_BURROW_CHASE: 'Rastro de Muerte (Bajo Tierra)',
      P1_EMERGE_TELEGRAPH: '¡PELIGRO! Emergencia Sísmica',
      P1_JAWS_SUCTION: 'Mandíbulas (¡Dash corta succión!)',
      P1_BITE_RECOVERY: '¡JADEANDO EN SUPERFICIE! (¡ATÁCALO!)',
      P2_AMBUSH_BURROW: 'Emboscada Triple Subterránea',
      P2_AMBUSH_TELEGRAPH: '¡PELIGRO! Erupción Abisal',
      P2_AMBUSH_SURFACE_PAUSE: 'Suelo Agrietado Permanente',
      P2_EXHAUSTED_SURFACE: '¡AGOTADO EN SUPERFICIE! (+25% DMG)',
      P2_JAWS_SUCTION: 'Hambre Infinita (Succión + Minions)',

      // Serafín
      P1_SPEAR_PREP: 'Sello de Teletransporte',
      P1_SPEAR_TELEGRAPH: '¡PELIGRO! Lanza del Juicio',
      P1_SPEAR_DASH: 'Estocada Relámpago',
      P1_SACRILEGE_SPIRAL: 'Plumas Sacrílegas (Espiral)',
      P1_GUARD_WINDUP: '¡PLEGANDO ALAS! (Prep. Contraataque)',
      P1_COUNTER_GUARD: '¡GUARDIA ACTIVA! (NO DISPARAR)',
      P2_TRIANGLE_TELEGRAPH: '¡PELIGRO! Combo Triangular',
      P2_TRIANGLE_DASH: 'Estocada Triangular',
      P2_SERAPH_RECOVERY: '¡ALAS CAÍDAS! (Ventana de Castigo)',
      P2_SUSPENDED_SWORDS: '6 Espadas Celestiales Rítmicas',
      P2_GUARD_WINDUP: '¡PREPARANDO GUARDIA SERÁFICA!',
      P2_COUNTER_GUARD: '¡GUARDIA SERÁFICA! (NO DISPARAR)',
    };
    if (this.dom.bossFsmState) {
      this.dom.bossFsmState.textContent = fsmNames[boss.currentState] || boss.currentState;
    }
    if (this.dom.bossArmorState) {
      const defText =
        typeof boss.getDefenseStatusText === 'function'
          ? boss.getDefenseStatusText()
          : 'Vulnerable';
      this.dom.bossArmorState.textContent = defText;
      this.dom.bossArmorState.style.color = boss.isStaggered
        ? '#38bdf8'
        : (boss.isBurrowed || boss.isGuarding || boss.hasFrontalArmor || (boss.orbitShields && boss.orbitShields.length > 0))
          ? '#facc15'
          : '#f87171';
    }
  }

  showToast(message, duration = 3000) {
    if (!this.dom.arenaToast) return;
    this.dom.arenaToast.textContent = message;
    this.dom.arenaToast.classList.add('visible');
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
    this.toastTimer = setTimeout(() => {
      if (this.dom.arenaToast) {
        this.dom.arenaToast.classList.remove('visible');
      }
    }, duration);
  }

  /**
   * Genera texto flotante dinámico en el DOM sobre el área de juego (Cero ctx.fillText).
   * Mapea coordenadas del canvas (960x640) a porcentajes CSS responsivos.
   */
  spawnFloatingText(text, color = '#facc15', canvasX = CONFIG.CANVAS_WIDTH / 2, canvasY = CONFIG.CANVAS_HEIGHT / 2) {
    const container = this.dom.floatingTextContainer || document.getElementById('floating-text-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'dom-floating-text';
    el.textContent = text;
    el.style.color = color;
    const pctX = (canvasX / CONFIG.CANVAS_WIDTH) * 100;
    const pctY = (canvasY / CONFIG.CANVAS_HEIGHT) * 100;
    el.style.left = `${pctX}%`;
    el.style.top = `${pctY}%`;
    container.appendChild(el);
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 1600);
  }

  /**
   * Actualiza la posición y contenido de la burbuja interactiva flotante [E] (v2.5)
   */
  updateInteractPrompt(interactable) {
    const promptEl = document.getElementById('world-interact-prompt');
    if (!promptEl) return;
    if (!interactable) {
      promptEl.classList.add('hidden');
      return;
    }
    const canvasW = CONFIG.CANVAS_WIDTH || 960;
    const canvasH = CONFIG.CANVAS_HEIGHT || 640;
    const pctX = ((interactable.x / canvasW) * 100).toFixed(2);
    const pctY = ((interactable.y / canvasH) * 100).toFixed(2);
    promptEl.style.left = `${pctX}%`;
    promptEl.style.top = `${pctY}%`;

    const titleEl = document.getElementById('interact-prompt-title');
    const descEl = document.getElementById('interact-prompt-desc');
    const costEl = document.getElementById('interact-prompt-cost');

    if (titleEl) titleEl.textContent = interactable.title;
    if (descEl) descEl.textContent = interactable.desc;
    if (costEl) {
      costEl.textContent = interactable.cost;
      costEl.style.color = interactable.costColor || '#facc15';
      costEl.style.borderColor = interactable.costColor || '#facc15';
    }

    promptEl.classList.remove('hidden');
  }

  setOverlayState(gameState, gameInstance) {
    if (!this.dom.gameOverlay) return;
    if (gameState === 'PLAYING') {
      this.dom.gameOverlay.classList.add('hidden');
      return;
    }

    this.dom.gameOverlay.classList.remove('hidden');
    const isWin = gameState === 'VICTORY';
    if (this.dom.overlayTitle) {
      this.dom.overlayTitle.textContent = isWin ? '¡VICTORIA DEL ABISMO!' : 'HAS CAÍDO EN LA MAZMORRA';
      this.dom.overlayTitle.style.color = isWin ? '#4ade80' : '#ef4444';
    }
    if (this.dom.overlaySubtitle) {
      this.dom.overlaySubtitle.textContent = isWin ? '¡Completaste todas las secciones con honor!' : 'Presiona [R] para reiniciar la incursión';
    }

    const player = gameInstance ? gameInstance.player : null;
    const runShards = player ? (player.shardsCollectedThisRun || 0) : 0;

    if (this.dom.recapFloor && gameInstance) {
      this.dom.recapFloor.textContent = `${gameInstance.currentSectionNumber || 1}-${gameInstance.currentLevelNumber || 1}`;
    }
    if (this.dom.recapRooms && gameInstance && gameInstance.currentFloor) {
      this.dom.recapRooms.textContent = String(gameInstance.currentFloor.clearedRoomsCount || 0);
    }
    if (this.dom.recapKills && player) {
      this.dom.recapKills.textContent = String(player.enemiesKilled || 0);
    }
    if (this.dom.overlayRunShards) {
      this.dom.overlayRunShards.textContent = `+${runShards}`;
    }
    if (this.dom.overlayTotalShards) {
      this.dom.overlayTotalShards.textContent = `${window.metaProgression.getShards()} 💎`;
    }

    // Configurar botón de simulación de Ad Rewarded
    if (this.dom.btnAdDouble) {
      this.dom.btnAdDouble.disabled = runShards <= 0;
      if (this.dom.btnAdText) {
        this.dom.btnAdText.textContent = runShards > 0 ? `[VER ANUNCIO] DUPLICAR GEMAS (+${runShards} 💎)` : 'SIN GEMAS PARA DUPLICAR';
      }

      this.dom.btnAdDouble.onclick = () => {
        if (this.dom.btnAdDouble.disabled) return;
        this.dom.btnAdDouble.disabled = true;
        if (this.dom.btnAdText) {
          this.dom.btnAdText.textContent = '⏳ Reproduciendo anuncio bonificado (2.0s)...';
        }

        setTimeout(() => {
          // Otorgar el doble de gemas
          window.metaProgression.addShards(runShards);
          soundManager.playProcedural('pedestal', { volume: 0.9 });
          soundManager.playProcedural('coin', { volume: 0.8 });
          if (this.dom.btnAdText) {
            this.dom.btnAdText.textContent = `✅ ¡+${runShards} GEMAS EXTRA OTORGADAS!`;
          }
          if (this.dom.overlayTotalShards) {
            this.dom.overlayTotalShards.textContent = `${window.metaProgression.getShards()} 💎`;
          }
          if (this.dom.shardCount) {
            this.dom.shardCount.textContent = String(window.metaProgression.getShards());
          }
        }, 2000);
      };
    }

    if (this.dom.btnOverlayRestart && gameInstance) {
      this.dom.btnOverlayRestart.onclick = () => {
        gameInstance.initNewRun();
      };
    }
  }
}

// ----------------------------------------------------------------------------
// 11. CLASE PRINCIPAL GAME (LOOP LIMPIO SIN RENDERIZADO DE TEXTO EN CANVAS)
// ----------------------------------------------------------------------------
class Game {
  constructor(canvas) {
    window.activeGameInstance = this;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ui = new UIManager();
    this.screenShakeIntensity = 0;
    this.screenShakeTimer = 0;
    this.hitStopTimer = 0;
    this.weaponButtons = Array.from(document.querySelectorAll('.weapon-btn'));
    this.isPaused = false;

    this.input = new InputManager(
      canvas,
      (weaponSelection) => this.handleWeaponSelect(weaponSelection),
      () => this.initNewRun(),
      () => this.togglePause(),
      () => this.handleWeaponModeToggle()
    );

    const hudWeaponMode = document.getElementById('hud-weapon-mode');
    if (hudWeaponMode) {
      hudWeaponMode.addEventListener('click', () => {
        this.handleWeaponModeToggle();
      });
    }

    const btnResume = document.getElementById('btn-pause-resume');
    const btnRestart = document.getElementById('btn-pause-restart');
    if (btnResume) {
      btnResume.addEventListener('click', () => this.togglePause(false));
    }
    if (btnRestart) {
      btnRestart.addEventListener('click', () => {
        this.togglePause(false);
        this.initNewRun();
      });
    }

    this.weaponButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.index);
        this.handleWeaponSelect(idx);
      });
    });

    this.initNewRun();
    this.lastTimestamp = performance.now();
    requestAnimationFrame((ts) => this.loop(ts));
  }

  triggerScreenShake(intensity, duration) {
    this.screenShakeIntensity = Math.max(this.screenShakeIntensity, intensity);
    this.screenShakeTimer = Math.max(this.screenShakeTimer, duration);
  }

  triggerHitStop(duration = 0.04) {
    this.hitStopTimer = duration;
  }

  tryInteract() {
    if (!this.currentRoom || !this.player || this.player.hp <= 0) return false;
    const interactable = this.currentRoom.currentInteractable;
    if (interactable && typeof interactable.interact === 'function') {
      interactable.interact(this.player, this.currentRoom);
      return true;
    }
    return false;
  }

  togglePause(forceState) {
    if (this.state !== 'PLAYING') return;
    this.isPaused = typeof forceState === 'boolean' ? forceState : !this.isPaused;
    const pauseMenu = document.getElementById('pause-menu');
    if (pauseMenu) {
      pauseMenu.classList.toggle('hidden', !this.isPaused);
    }
  }

  initNewRun() {
    if (isMortalMode) {
      ngPlusLevel = initialNgPlusLevel;
    } else {
      ngPlusLevel = 0;
    }
    this.state = 'PLAYING';
    this.isPaused = false;
    const pauseMenu = document.getElementById('pause-menu');
    if (pauseMenu) pauseMenu.classList.add('hidden');
    const tabOverlay = document.getElementById('tab-overlay');
    if (tabOverlay) tabOverlay.classList.add('hidden');
    this.currentSection = 1;
    this.currentLevel = 1;

    this.player = new Player(ROOM_BOUNDS.centerX, ROOM_BOUNDS.centerY + 75, this.ui);
    this.ui.updateKeys(this.player.keys);

    // Limpiar guardado previo al iniciar una nueva incursion desde cero ("Modo Colectivo")
    if (window.RunSaveManager && !window.RunSaveManager.isRestoring) {
      window.RunSaveManager.clear();
    }

    // Aplicar talentos permanentes comprados en el Santuario
    window.metaProgression.applyAllTalentsToPlayer(this.player);

    // Aplicar arquetipo móvil seleccionado (v2.6)
    if (window.PIG_ARCHETYPES && window.metaProgression) {
      const archId = window.metaProgression.getSelectedArchetype();
      const arch = window.PIG_ARCHETYPES[archId] || window.PIG_ARCHETYPES.classic;
      arch.apply(this.player);
    }

    // Consumir bendición pendiente del Oráculo del Abismo si existe
    if (window.OracleManager) {
      window.OracleManager.consumeBlessing(this.player, this);
    }

    this.player.itemManager.applyPassiveStats();
    this.player.hp = this.player.maxHp;
    this.ui.updateShards(0, window.metaProgression.getShards());

    // Propuesta A: Kit de Inicio Abisal al empezar partida en NG+ >= 1
    let starterRelicsCount = 0;
    if (ngPlusLevel >= 1) {
      const hpBonus = 35 * ngPlusLevel;
      this.player.baseMaxHp += hpBonus;
      this.player.hp = this.player.baseMaxHp;
      this.player.coins += 25 * ngPlusLevel;

      starterRelicsCount = Math.min(8, 2 * ngPlusLevel);
      for (let i = 0; i < starterRelicsCount; i++) {
        this.player.itemManager.grantRandomRelic();
      }
    }

    const eyeSpawnMult = (typeof BrotherEye !== 'undefined' && BrotherEye.enabled)
      ? BrotherEye.getAdaptiveSpawnMultiplier()
      : 1.0;
    if (typeof BrotherEye !== 'undefined' && BrotherEye.enabled) {
      BrotherEye.initialize(this.player, 'NEW_RUN_OR_R');
    }
    this.currentFloor = new DungeonFloor(
      this.currentSection,
      this.currentLevel,
      CONFIG.ROOMS_PER_FLOOR,
      this.player.enemySpawnMultiplier * eyeSpawnMult,
      this.ui,
      this.player.relicChanceMultiplier
    );
    this.currentRoom = this.currentFloor.getRoom(0, 0);
    if (typeof BrotherEye !== 'undefined' && BrotherEye.enabled) {
      BrotherEye.onRoomEntered(this.currentRoom, this.player);
    }
    if (typeof HiveMindSystem !== 'undefined') {
      HiveMindSystem.onRoomEntered(this.currentRoom, this.player);
    }
    this.syncWeaponButtonsUI();
    this.player.itemManager.onRoomStart(this.currentRoom);

    // Sincronización inicial Event-Driven del DOM al arrancar la partida
    this.ui.setOverlayState('PLAYING');
    this.ui.updateProgression(this.currentSection, this.currentLevel);
    this.ui.updateHealth(this.player);
    this.ui.updateCoins(this.player.coins);
    this.ui.updateStats(this.player);
    this.ui.updateElements(this.player.elementalPool);
    this.ui.updateRelics(this.player.itemManager.ownedRelics);
    this.ui.updateRoomInfo(this.currentRoom, this.currentFloor);
    this.ui.updateBossStatus(null, this.currentRoom, this.currentFloor);

    if (ngPlusLevel >= 1) {
      const modeLabel = isMortalMode ? 'MODO MORTAL' : 'NG+';
      this.ui.showToast(
        `★ KIT ABISAL (${modeLabel} ${ngPlusLevel}): +${35 * ngPlusLevel} HP, +${25 * ngPlusLevel} Oro y ${starterRelicsCount} Reliquias iniciales aplicadas.`
      );
      this.ui.spawnFloatingText(
        `★ KIT ABISAL: +${35 * ngPlusLevel} HP | +${25 * ngPlusLevel} ORO`,
        '#4ade80',
        ROOM_BOUNDS.centerX,
        ROOM_BOUNDS.centerY + 45
      );
    } else {
      this.ui.showToast('Abre el Cofre Elemental en el centro de la sala inicial');
    }

    // Auto-guardado instantáneo de la partida al iniciar ("Modo Colectivo")
    if (window.RunSaveManager && !window.RunSaveManager.isRestoring) {
      window.RunSaveManager.save(this);
    }
  }

  /**
   * Teletransporta al jugador a `NexusRoom` al derrotar al último jefe de la Sección 4 - Nivel 4
   * (en lugar de mostrar la pantalla de victoria).
   */
  enterNexusRoom() {
    const carriedRelicChests =
      this.currentRoom && this.currentRoom.relicChests
        ? this.currentRoom.relicChests.filter((c) => !c.opened)
        : [];

    if (typeof BrotherEye !== 'undefined' && BrotherEye.enabled) {
      BrotherEye.onRoomExited(this.currentRoom, this.player, this.currentRoom.cleared);
    }

    this.currentRoom.projectiles = [];
    this.currentRoom.enemyProjectiles = [];
    this.currentRoom = new NexusRoom((altarType) => this.enterNextNgPlusCycle(altarType));
    this.currentRoom.visited = true;

    // Música ambiental mística para el Nexo y pacto de ciclo
    soundManager.play('pacto', { volume: 0.7, pitchJitter: 0 });

    if (carriedRelicChests.length > 0) {
      carriedRelicChests.forEach((c, idx) => {
        c.x = ROOM_BOUNDS.centerX + (idx - (carriedRelicChests.length - 1) / 2) * 65;
        c.y = ROOM_BOUNDS.top + 95;
        this.currentRoom.relicChests.push(c);
      });
    }

    this.player.x = ROOM_BOUNDS.centerX;
    this.player.y = ROOM_BOUNDS.bottom - 75;
    this.player.roomTransitionGrace = 0.6;
    this.player.itemManager.onRoomStart(this.currentRoom);

    this.ui.updateRoomInfo(this.currentRoom, this.currentFloor);
    this.ui.updateBossStatus(null, this.currentRoom, this.currentFloor);

    if (ngPlusLevel === 0) {
      this.ui.showToast(
        'SALA DEL NEXO (NG+1): [Izq: Altar de la Mente (Reliquias)] | [Der: Altar del Cuerpo (Stats Base)]'
      );
    } else {
      this.ui.showToast(
        `¡ADVERTENCIA ABISAL! Toca el Altar del Abismo -> NG+${ngPlusLevel + 1} (Conservas TODO / Enemigos x${ngPlusLevel + 2})`
      );
    }
  }

  /**
   * Ejecutado al tocar un altar en `NexusRoom`:
   *  - `ngPlusLevel` suma 1.
   *  - Aplica las reglas del altar elegido (`MIND_ALTAR`, `BODY_ALTAR` o `ABYSS_ALTAR`).
   *  - Regresa a la Sección 1 - Nivel 1 y reinicia el loop del mundo SIN recargar la página web.
   */
  enterNextNgPlusCycle(altarType) {
    ngPlusLevel += 1;

    if (altarType === 'MIND_ALTAR') {
      this.player.resetBaseStatsKeepRelics();
    } else if (altarType === 'BODY_ALTAR') {
      this.player.clearRelicsKeepBaseStats();
    } else {
      this.player.keepAllForAbyss();
    }

    this.currentSection = 1;
    this.currentLevel = 1;
    this.player.itemManager.onLevelStart();
    if (typeof BrotherEye !== 'undefined' && BrotherEye.enabled) {
      BrotherEye.initialize(this.player, 'NG_PLUS');
    }
    const eyeSpawnMult = (typeof BrotherEye !== 'undefined' && BrotherEye.enabled)
      ? BrotherEye.getAdaptiveSpawnMultiplier()
      : 1.0;
    this.currentFloor = new DungeonFloor(
      this.currentSection,
      this.currentLevel,
      CONFIG.ROOMS_PER_FLOOR,
      this.player.enemySpawnMultiplier * eyeSpawnMult,
      this.ui,
      this.player.relicChanceMultiplier
    );
    this.currentRoom = this.currentFloor.getRoom(0, 0);
    if (typeof BrotherEye !== 'undefined' && BrotherEye.enabled) {
      BrotherEye.onRoomEntered(this.currentRoom, this.player);
    }
    if (typeof HiveMindSystem !== 'undefined') {
      HiveMindSystem.onRoomEntered(this.currentRoom, this.player);
    }
    this.player.x = ROOM_BOUNDS.centerX;
    this.player.y = ROOM_BOUNDS.centerY + 75;
    this.player.roomTransitionGrace = 0.6;
    this.player.itemManager.onRoomStart(this.currentRoom);

    this.ui.updateProgression(this.currentSection, this.currentLevel);
    this.ui.updateHealth(this.player);
    this.ui.updateStats(this.player);
    this.ui.updateRelics(this.player.itemManager.ownedRelics);
    this.ui.updateRoomInfo(this.currentRoom, this.currentFloor);
    this.ui.updateBossStatus(null, this.currentRoom, this.currentFloor);

    const altarNameMap = {
      MIND_ALTAR: 'ALTAR DE LA MENTE (Reliquias conservadas / Stats base reiniciadas)',
      BODY_ALTAR: 'ALTAR DEL CUERPO (Stats base conservadas / Reliquias vaciadas)',
      ABYSS_ALTAR: 'ALTAR DEL ABISMO (Todo conservado / Escalado Brutal)',
    };
    this.ui.showToast(
      `¡CICLO NG+ ${ngPlusLevel} INICIADO (Enemigos x${1 + ngPlusLevel})! ${altarNameMap[altarType] || ''}`
    );
    if (window.RunSaveManager) {
      window.RunSaveManager.save(this);
    }
  }

  handleWeaponModeToggle() {
    if (!this.player) return;
    this.player.toggleWeaponMode();
  }

  handleWeaponSelect(selection) {
    if (!this.player) return;
    this.player.selectWeapon(selection);
    this.syncWeaponButtonsUI();
  }

  syncWeaponButtonsUI() {
    this.weaponButtons.forEach((btn, idx) => {
      btn.classList.toggle('active', idx === this.player.currentWeaponIndex);
    });
  }

  transitionToRoom(directionKey) {
    const dir = DIRECTIONS[directionKey];
    const targetRoom = this.currentFloor.getRoom(
      this.currentRoom.gridX + dir.dx,
      this.currentRoom.gridY + dir.dy
    );
    if (!targetRoom) return;

    this.currentRoom.projectiles = [];
    this.currentRoom.enemyProjectiles = [];
    if (targetRoom.isLocked) {
      const roomName = targetRoom.type === 'SHOP' ? 'TIENDA' : (targetRoom.type === 'TREASURE' ? 'SALA DEL TESORO' : 'SALA BLOQUEADA');
      if (this.player.keys > 0) {
        this.player.useKey();
        targetRoom.isLocked = false;
        soundManager.playProcedural('door_unlock');
        this.ui.showToast(`¡${roomName} DESBLOQUEADA CON LLAVE! [🔑 -1]`);
      } else {
        // Empuje defensivo hacia el interior de la sala actual para prevenir bucles de 60fps y solapamiento
        const b = this.currentRoom.bounds;
        const pushPadding = this.player.radius + 14;
        if (directionKey === 'N') this.player.y = b.top + pushPadding;
        else if (directionKey === 'S') this.player.y = b.bottom - pushPadding;
        else if (directionKey === 'W') this.player.x = b.left + pushPadding;
        else if (directionKey === 'E') this.player.x = b.right - pushPadding;

        if (!this.lastDoorWarnTimer || Date.now() - this.lastDoorWarnTimer > 1800) {
          this.lastDoorWarnTimer = Date.now();
          soundManager.playProcedural('hurt');
          this.ui.showToast('🔒 PUERTA CERRADA: Usa [E] para abrir con 1 Llave o forzar con sangre (-15 HP)');
        }
        return;
      }
    }

    this.currentRoom = targetRoom;
    this.currentRoom.visited = true;

    const offset = this.player.radius + 18;
    if (directionKey === 'N') {
      const doorPos = targetRoom.getDoorPosition('S');
      this.player.x = doorPos.x;
      this.player.y = targetRoom.bounds.bottom - offset;
    } else if (directionKey === 'S') {
      const doorPos = targetRoom.getDoorPosition('N');
      this.player.x = doorPos.x;
      this.player.y = targetRoom.bounds.top + offset;
    } else if (directionKey === 'W') {
      const doorPos = targetRoom.getDoorPosition('E');
      this.player.x = targetRoom.bounds.right - offset;
      this.player.y = doorPos.y;
    } else if (directionKey === 'E') {
      const doorPos = targetRoom.getDoorPosition('W');
      this.player.x = targetRoom.bounds.left + offset;
      this.player.y = doorPos.y;
    }

    // Seguridad de entrada: garantizar que ningún enemigo quede pegado a la puerta de ingreso
    const entryX = this.player.x;
    const entryY = this.player.y;
    const minEntranceClearance = this.currentRoom.hasAuthoredTemplate ? 165 : 220;

    for (const enemy of this.currentRoom.enemies) {
      const dist = Math.hypot(enemy.x - entryX, enemy.y - entryY);
      if (dist < minEntranceClearance) {
        if (this.currentRoom.hasAuthoredTemplate) {
          // Desplazar suavemente hacia el interior manteniendo la formación de la plantilla
          const pushDir = MathUtils.normalize(
            this.currentRoom.bounds.centerX - entryX,
            this.currentRoom.bounds.centerY - entryY
          );
          const targetX = entryX + pushDir.x * (minEntranceClearance + 25) + (enemy.x - entryX) * 0.5;
          const targetY = entryY + pushDir.y * (minEntranceClearance + 25) + (enemy.y - entryY) * 0.5;
          const safePos = this.currentRoom.getWalkablePosition(targetX, targetY, enemy.radius || 20);
          enemy.x = safePos.x;
          enemy.y = safePos.y;
        } else {
          const margin = Math.min(90, Math.min(this.currentRoom.bounds.width, this.currentRoom.bounds.height) * 0.22);
          const safePos = this.currentRoom.getSafeSpawnPosition(
            this.currentRoom.bounds.left + margin,
            this.currentRoom.bounds.right - margin,
            this.currentRoom.bounds.top + margin,
            this.currentRoom.bounds.bottom - margin,
            35,
            minEntranceClearance + 30
          );
          enemy.x = safePos.x;
          enemy.y = safePos.y;
        }
      }
      // Retardo de reacción inicial para dar al jugador lectura inmediata del patrón de la sala
      enemy.reactionDelay = this.currentRoom.hasAuthoredTemplate ? 0.42 : 0.25;
    }

    this.player.roomTransitionGrace = 0.35;
    this.player.itemManager.onRoomStart(this.currentRoom);

    if (typeof BrotherEye !== 'undefined' && BrotherEye.enabled) {
      BrotherEye.onRoomEntered(this.currentRoom, this.player);
    }
    if (typeof HiveMindSystem !== 'undefined') {
      HiveMindSystem.onRoomEntered(this.currentRoom, this.player);
    }

    // Evento de cambio de habitación: actualiza Telemetría y Minimapa en el DOM
    this.ui.updateRoomInfo(this.currentRoom, this.currentFloor);
    this.ui.updateBossStatus(null, this.currentRoom, this.currentFloor);

    if (
      this.currentRoom.type === 'SANCTUARY' &&
      this.currentRoom.altars &&
      this.currentRoom.altars.some((a) => !a.consumed)
    ) {
      this.ui.showToast(
        '[SANTUARIO] Elige 1 Altar: Izq (+30% HP) | Centro (+Vel. Base) | Der (+Placas Defensa)'
      );
    } else if (this.currentRoom.type === 'HARD' && !this.currentRoom.cleared) {
      this.ui.showToast(
        '[SALA DE ÉLITE] +50% Enemigos | Hostiles con halo blanco alternan 3s vulnerables y 2s invulnerables'
      );
    } else if (this.currentRoom.type === 'HAZARD' && !this.currentRoom.cleared) {
      this.ui.showToast(
        '[SALA DE PELIGROS] ¡Cuidado con los Pinchos, Zonas de Fuego y Charcos Venenosos! Dañan a todos'
      );
    }

    // Auto-guardado instantáneo al transicionar de sala ("Modo Colectivo")
    if (window.RunSaveManager) {
      window.RunSaveManager.save(this);
    }
  }

  checkPortalTransitions() {
    if (!this.currentRoom.cleared) return;

    const portal = this.currentRoom.exitPortal;
    const touchingPortal = MathUtils.circleCollision(
      this.player.x,
      this.player.y,
      this.player.radius,
      portal.x,
      portal.y,
      portal.radius
    );

    if (!touchingPortal) return;

    if (this.currentRoom.isExitRoom || this.currentRoom.type === 'EXIT') {
      this.currentRoom.projectiles = [];
      this.currentRoom.enemyProjectiles = [];
      this.currentRoom = this.currentFloor.shopRoom;
      if (typeof this.currentRoom.ensureExtraUpgradeChoices === 'function') {
        this.currentRoom.ensureExtraUpgradeChoices(this.player);
      }
      this.currentRoom.visited = true;
      this.player.x = ROOM_BOUNDS.centerX;
      this.player.y = ROOM_BOUNDS.bottom - 65;
      this.player.roomTransitionGrace = 0.4;
      this.player.itemManager.onRoomStart(this.currentRoom);

      this.ui.updateRoomInfo(this.currentRoom, this.currentFloor);
      this.ui.updateBossStatus(null, this.currentRoom, this.currentFloor);
      this.ui.showToast(
        this.player.extraUpgradeChoices > 0
          ? 'TIENDA (+DADO SUERTE): Elige 1 entre 4 mejoras [Daño | +1 Proy | Vel.Atq | Dado Fortuna]'
          : 'TIENDA: Elige 1 mejora [Izq: +Daño (4$) | Centro: +1 Proyectil (6$) | Der: +Vel.Atq (4$)]'
      );
      return;
    }

    if (this.currentRoom.type === 'SHOP') {
      this.currentRoom.projectiles = [];
      this.currentRoom.enemyProjectiles = [];
      this.currentRoom = this.currentFloor.bossRoom;
      this.currentRoom.visited = true;
      this.player.x = ROOM_BOUNDS.centerX;
      this.player.y = ROOM_BOUNDS.bottom - 55;
      this.player.roomTransitionGrace = 0.45;
      this.player.itemManager.onRoomStart(this.currentRoom);
      if (typeof BrotherEye !== 'undefined' && BrotherEye.enabled) {
        BrotherEye.onRoomEntered(this.currentRoom, this.player);
      }
      if (typeof HiveMindSystem !== 'undefined') {
        HiveMindSystem.onRoomEntered(this.currentRoom, this.player);
      }

      const activeBoss = this.currentRoom.enemies.find(
        (e) => e instanceof Boss && !e.markedForDeletion
      );
      if (activeBoss) {
        activeBoss.reactionDelay = 0.35;
      }
      this.ui.updateRoomInfo(this.currentRoom, this.currentFloor);
      this.ui.updateBossStatus(activeBoss || null, this.currentRoom, this.currentFloor);
      const bossTitle = activeBoss ? activeBoss.bossTitle : 'JEFE FINAL';
      this.ui.showToast(`¡CÁMARA DEL JEFE: ${bossTitle}! Observa sus patrones y telegrafiados`);
      return;
    }

    if (this.currentRoom.type === 'BOSS') {
      if (this.currentLevel < CONFIG.LEVELS_PER_SECTION) {
        this.currentLevel += 1;
      } else if (this.currentSection < CONFIG.TOTAL_SECTIONS) {
        this.currentSection += 1;
        this.currentLevel = 1;
      } else {
        // Al derrotar al último jefe de la Sección 4 - Nivel 4, teletransporta a `NexusRoom` (NG+)
        this.enterNexusRoom();
        return;
      }

      this.player.itemManager.onLevelStart();
      if (typeof BrotherEye !== 'undefined' && BrotherEye.enabled && typeof BrotherEye.onLevelTransition === 'function') {
        BrotherEye.onLevelTransition(this.currentSection, this.currentLevel);
      }
      const eyeSpawnMult = (typeof BrotherEye !== 'undefined' && BrotherEye.enabled)
        ? BrotherEye.getAdaptiveSpawnMultiplier()
        : 1.0;
      this.currentFloor = new DungeonFloor(
        this.currentSection,
        this.currentLevel,
        CONFIG.ROOMS_PER_FLOOR,
        this.player.enemySpawnMultiplier * eyeSpawnMult,
        this.ui,
        this.player.relicChanceMultiplier
      );
      this.currentRoom = this.currentFloor.getRoom(0, 0);
      this.player.x = ROOM_BOUNDS.centerX;
      this.player.y = ROOM_BOUNDS.centerY + 75;
      this.player.heal(25);
      this.player.roomTransitionGrace = 0.5;
      this.player.itemManager.onRoomStart(this.currentRoom);
      if (typeof BrotherEye !== 'undefined' && BrotherEye.enabled) {
        BrotherEye.onRoomEntered(this.currentRoom, this.player);
      }
      if (typeof HiveMindSystem !== 'undefined') {
        HiveMindSystem.onRoomEntered(this.currentRoom, this.player);
      }

      this.ui.updateProgression(this.currentSection, this.currentLevel);
      this.ui.updateRoomInfo(this.currentRoom, this.currentFloor);
      this.ui.updateBossStatus(null, this.currentRoom, this.currentFloor);
      this.ui.showToast(
        `¡Avanzaste a Sección ${this.currentSection} - Nivel ${this.currentLevel}! (+25 HP restaurados)`
      );
      if (window.RunSaveManager) {
        window.RunSaveManager.save(this);
      }
    }
  }

  update(dt) {
    if (this.state !== 'PLAYING') return;
    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= dt;
      return;
    }

    this.player.update(dt, this.input, this.currentRoom);
    try {
      this.currentRoom.update(dt, this.player, this.currentFloor);
    } catch (err) {
      if (window.devConsole) window.devConsole.log('ERROR', 'Error en Room.update: ' + err.message);
    }

    const triggeredDoor = this.currentRoom.resolvePlayerBoundsAndDoors(this.player, this.currentFloor);
    if (triggeredDoor) {
      this.transitionToRoom(triggeredDoor);
    }

    this.checkPortalTransitions();

    if (this.player.hp <= 0) {
      const revived = this.player.itemManager.onDeath(this.currentRoom);
      if (!revived && this.player.hp <= 0) {
        if (!this.player.hasUsedAbyssalRevive && window.ReviveManager) {
          window.ReviveManager.promptRevive(this, () => {
            this.state = 'GAME_OVER';
            if (window.RunSaveManager) window.RunSaveManager.clear();
            if (typeof BrotherEye !== 'undefined' && BrotherEye.enabled) {
              BrotherEye.onPlayerDeath();
            }
            this.ui.setOverlayState('GAME_OVER', this);
          });
          return;
        }
        this.state = 'GAME_OVER';
        if (window.RunSaveManager) window.RunSaveManager.clear();
        if (typeof BrotherEye !== 'undefined' && BrotherEye.enabled) {
          BrotherEye.onPlayerDeath();
        }
        this.ui.setOverlayState('GAME_OVER', this);
      } else {
        this.ui.updateHealth(this.player);
      }
    }
  }

  draw() {
    // 1. Resetear cualquier matriz previa y pintar fondo sólido base en espacio no trasladado
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);
    this.ctx.fillStyle = '#080d1a';
    this.ctx.fillRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);

    // 2. Renderizado seguro con recorte estricto a las dimensiones reales del canvas (960x640)
    this.ctx.save();
    try {
      this.ctx.beginPath();
      this.ctx.rect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);
      this.ctx.clip();

      if (this.screenShakeTimer > 0) {
        this.screenShakeTimer -= 0.016;
        const currentIntensity = this.screenShakeIntensity * Math.min(1, this.screenShakeTimer / 0.15);
        const shakeX = (Math.random() - 0.5) * 2 * currentIntensity;
        const shakeY = (Math.random() - 0.5) * 2 * currentIntensity;
        this.ctx.translate(shakeX, shakeY);
        if (this.screenShakeTimer <= 0) {
          this.screenShakeIntensity = 0;
        }
      }
      this.currentRoom.draw(this.ctx, this.player);
      this.player.draw(this.ctx, this.input, this.currentRoom);
    } finally {
      this.ctx.restore();
    }
  }

  loop(timestamp) {
    const rawDt = (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;
    const dt = Math.min(rawDt, CONFIG.MAX_DELTA_TIME);

    if (!this.isPaused) {
      try {
        this.update(dt);
      } catch (err) {
        console.error('Error en bucle de actualización (Game.update):', err);
      }
    }
    try {
      this.draw();
    } catch (err) {
      console.error('Error en bucle de renderizado (Game.draw):', err);
    }

    requestAnimationFrame((ts) => this.loop(ts));
  }
}

// ----------------------------------------------------------------------------
// 12. GESTOR DE AUDIO Y BANDA SONORA NO REPETITIVA (v2.1)
// ----------------------------------------------------------------------------
class MusicManager {
  constructor() {
    this.tracks = [
      'Before_the_Kingdom_Fades.mp3',
      'Beneath_the_Heavy_Hammer.mp3',
      'Iron_Siege.mp3',
      'Liturgy_for_the_Sunken_King.mp3',
      'Midnight_Caliber.mp3',
      'Porch_Light_Still_On.mp3',
      'Where_Secrets_Sleep.mp3'
    ];
    this.deck = [];
    this.lastPlayed = null;
    this.secondLastPlayed = null;
    this.currentTrack = null;
    this.volume = 0.25; // Volumen inicial bajo (25%)
    this.isMuted = false;
    this.started = false;
    this.audio = new Audio();
    this.audio.volume = this.volume;

    // Transición automática al terminar cada canción
    this.audio.addEventListener('ended', () => {
      this.playNext();
    });

    // Prevención de fallos
    this.audio.addEventListener('error', (e) => {
      console.warn('Fallo en pista de audio:', this.currentTrack, e);
      setTimeout(() => this.playNext(), 1500);
    });
  }

  /**
   * Barajado Fisher-Yates con protección de frontera de ciclo.
   * Garantiza que todas las pistas suenen antes de repetir,
   * y que no haya repetición inmediata entre el final de una ronda y el inicio de la siguiente.
   */
  reshuffleDeck() {
    const newDeck = [...this.tracks];
    for (let i = newDeck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
    }

    if (newDeck.length > 2) {
      if (newDeck[0] === this.lastPlayed || newDeck[0] === this.secondLastPlayed) {
        const swapIdx = Math.floor(Math.random() * (newDeck.length - 2)) + 2;
        [newDeck[0], newDeck[swapIdx]] = [newDeck[swapIdx], newDeck[0]];
      }
    }
    this.deck = newDeck;
  }

  playNext() {
    if (this.deck.length === 0) {
      this.reshuffleDeck();
    }

    const nextTrack = this.deck.shift();
    this.secondLastPlayed = this.lastPlayed;
    this.lastPlayed = nextTrack;
    this.currentTrack = nextTrack;

    this.audio.src = `musicapendeja/${nextTrack}`;
    this.audio.volume = this.isMuted ? 0 : this.volume;

    const promise = this.audio.play();
    if (promise !== undefined) {
      promise.catch((err) => {
        console.log('Esperando interacción del usuario para reproducir audio:', err);
      });
    }

    this.updateUi();
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.playNext();
  }

  setVolume(newVol) {
    this.volume = Math.max(0, Math.min(1, newVol));
    if (!this.isMuted) {
      this.audio.volume = this.volume;
    }
    this.updateUi();
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    this.audio.volume = this.isMuted ? 0 : this.volume;
    this.updateUi();
  }

  getCleanTitle(filename) {
    if (!filename) return 'Silencio';
    return filename.replace(/\.mp3$/i, '').replace(/_/g, ' ');
  }

  updateUi() {
    const title = this.getCleanTitle(this.currentTrack);
    const volPct = Math.round(this.volume * 100);

    const trackLabel = document.getElementById('music-track-name');
    if (trackLabel) trackLabel.textContent = title;

    const sliders = [
      document.getElementById('music-volume-slider'),
      document.getElementById('menu-volume-slider')
    ];
    sliders.forEach((slider) => {
      if (slider && parseFloat(slider.value) !== this.volume) {
        slider.value = this.volume;
      }
    });

    const displays = [
      document.getElementById('music-volume-val'),
      document.getElementById('menu-volume-val')
    ];
    displays.forEach((disp) => {
      if (disp) disp.textContent = this.isMuted ? 'MUTE' : `${volPct}%`;
    });

    const toggleBtn = document.getElementById('btn-music-toggle');
    if (toggleBtn) {
      toggleBtn.textContent = this.isMuted || this.volume === 0 ? '🔇 MUTE' : '🔊 ON';
      toggleBtn.style.color = this.isMuted ? 'var(--accent-red)' : 'var(--accent-green)';
    }
  }
}

const musicManager = new MusicManager();

// ----------------------------------------------------------------------------
// 13. CINEMÁTICA, MÚSICA DE INTRO Y MENÚ PRINCIPAL (v2.1)
// ----------------------------------------------------------------------------
let activeGameInstance = null;
let introMusic = null;
let cinematicHandled = false;

function playIntroMusic() {
  if (!introMusic) {
    introMusic = new Audio('cinematica/musica de la intro.mp3');
    introMusic.loop = true;
  }
  introMusic.volume = musicManager.isMuted ? 0 : musicManager.volume;
  const p = introMusic.play();
  if (p !== undefined) {
    p.catch(() => {});
  }
}

function stopIntroMusic() {
  if (introMusic) {
    introMusic.pause();
    introMusic.currentTime = 0;
  }
}

function finishCinematic() {
  if (cinematicHandled) return;
  cinematicHandled = true;

  const cinematicOverlay = document.getElementById('cinematic-overlay');
  const video = document.getElementById('cinematic-video');
  if (video) {
    video.pause();
    video.currentTime = 0;
  }
  if (cinematicOverlay) {
    cinematicOverlay.style.display = 'none';
  }

  // Reproducir música de intro simultáneamente con la pantalla del Menú Principal
  playIntroMusic();

  if (window.RunSaveManager) {
    window.RunSaveManager.updateContinueButtonUI();
  }
}

function startGame(mortalMode, startingNgLevel) {
  isMortalMode = mortalMode;
  initialNgPlusLevel = startingNgLevel;
  ngPlusLevel = startingNgLevel;

  // Detener música de intro e iniciar soundtrack de batalla in-game
  stopIntroMusic();
  musicManager.start();

  const mainMenu = document.getElementById('main-menu');
  const appShell = document.getElementById('app-shell');
  if (mainMenu) mainMenu.style.display = 'none';
  if (appShell) {
    appShell.classList.remove('hidden');
    appShell.style.display = 'flex';
  }

  const canvas = document.getElementById('gameCanvas');
  if (!activeGameInstance) {
    activeGameInstance = new Game(canvas);
  } else {
    activeGameInstance.initNewRun();
  }
}

// Sincronización Independiente de Volúmenes
function updateMusicVolume(val) {
  musicManager.setVolume(val);
  if (introMusic && !introMusic.paused) {
    introMusic.volume = musicManager.isMuted ? 0 : musicManager.volume;
  }
  const pct = Math.round(musicManager.volume * 100);
  const hudSlider = document.getElementById('music-volume-slider');
  const menuSlider = document.getElementById('menu-volume-slider');
  const hudVal = document.getElementById('music-volume-val');
  const menuVal = document.getElementById('menu-volume-val');
  if (hudSlider && parseFloat(hudSlider.value) !== musicManager.volume) hudSlider.value = musicManager.volume;
  if (menuSlider && parseFloat(menuSlider.value) !== musicManager.volume) menuSlider.value = musicManager.volume;
  if (hudVal) hudVal.textContent = musicManager.isMuted ? 'MUTE' : `${pct}%`;
  if (menuVal) menuVal.textContent = musicManager.isMuted ? 'MUTE' : `${pct}%`;
}

let lastSfxPreviewTime = 0;
function updateSfxVolume(val, triggerPreview = false) {
  soundManager.setMasterVolume(val);
  const pct = Math.round(soundManager.baseVolume * 100);
  const hudSlider = document.getElementById('sfx-volume-slider');
  const menuSlider = document.getElementById('menu-sfx-slider');
  const hudVal = document.getElementById('sfx-volume-val');
  const menuVal = document.getElementById('menu-sfx-val');
  if (hudSlider && parseFloat(hudSlider.value) !== soundManager.baseVolume) hudSlider.value = soundManager.baseVolume;
  if (menuSlider && parseFloat(menuSlider.value) !== soundManager.baseVolume) menuSlider.value = soundManager.baseVolume;
  if (hudVal) hudVal.textContent = soundManager.isMuted ? 'MUTE' : `${pct}%`;
  if (menuVal) menuVal.textContent = soundManager.isMuted ? 'MUTE' : `${pct}%`;

  if (triggerPreview && val > 0 && !soundManager.isMuted) {
    const now = performance.now();
    if (now - lastSfxPreviewTime > 200) {
      lastSfxPreviewTime = now;
      soundManager.play('pelotita', { volume: 0.65, pitchJitter: 0 });
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  // Cinemática inicial
  const video = document.getElementById('cinematic-video');
  const skipBtn = document.getElementById('cinematic-skip-btn');
  const promptOverlay = document.getElementById('cinematic-prompt');

  if (video) {
    video.addEventListener('ended', finishCinematic);

    // Intentar reproducción automática
    const p = video.play();
    if (p !== undefined) {
      p.catch(() => {
        // Bloqueo de políticas de navegador sin gesto previo del usuario
        if (promptOverlay && !cinematicHandled) {
          promptOverlay.classList.remove('hidden');
        }
      });
    }
  }

  if (skipBtn) {
    skipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      finishCinematic();
    });
  }

  if (promptOverlay) {
    promptOverlay.addEventListener('click', () => {
      promptOverlay.classList.add('hidden');
      if (video && !cinematicHandled) {
        video.play().catch(() => {});
      }
    });
  }

  // Tecla [ENTER] para saltar la cinemática en cualquier momento
  window.addEventListener('keydown', (e) => {
    if (!cinematicHandled && (e.key === 'Enter' || e.code === 'Enter')) {
      e.preventDefault();
      finishCinematic();
    }
  });

  // Botones y Stepper de Menú Principal
  const btnPlay = document.getElementById('btn-menu-play');
  const modeSelection = document.getElementById('menu-mode-selection');
  const btnNormal = document.getElementById('btn-mode-normal');
  const btnMortal = document.getElementById('btn-mode-mortal');
  const btnMinus = document.getElementById('btn-mortal-minus');
  const btnPlus = document.getElementById('btn-mortal-plus');
  const displayNg = document.getElementById('mortal-ng-display');

  // Controles de Música
  const btnMusicToggle = document.getElementById('btn-music-toggle');
  const btnMusicSkip = document.getElementById('btn-music-skip');
  const sliderMusicHud = document.getElementById('music-volume-slider');
  const sliderMusicMenu = document.getElementById('menu-volume-slider');

  // Controles de Efectos (SFX)
  const sliderSfxHud = document.getElementById('sfx-volume-slider');
  const sliderSfxMenu = document.getElementById('menu-sfx-slider');

  if (sliderMusicHud) {
    sliderMusicHud.addEventListener('input', (e) => updateMusicVolume(parseFloat(e.target.value)));
  }
  if (sliderMusicMenu) {
    sliderMusicMenu.addEventListener('input', (e) => updateMusicVolume(parseFloat(e.target.value)));
  }

  if (sliderSfxHud) {
    sliderSfxHud.addEventListener('input', (e) => updateSfxVolume(parseFloat(e.target.value), true));
  }
  if (sliderSfxMenu) {
    sliderSfxMenu.addEventListener('input', (e) => updateSfxVolume(parseFloat(e.target.value), true));
  }

  if (btnMusicToggle) {
    btnMusicToggle.addEventListener('click', () => {
      musicManager.toggleMute();
      if (introMusic && !introMusic.paused) {
        introMusic.volume = musicManager.isMuted ? 0 : musicManager.volume;
      }
      updateMusicVolume(musicManager.volume);
    });
  }

  if (btnMusicSkip) {
    btnMusicSkip.addEventListener('click', () => {
      stopIntroMusic();
      musicManager.start();
      musicManager.playNext();
    });
  }

  let selectedMortalNg = 1;

  if (btnPlay) {
    btnPlay.addEventListener('click', () => {
      btnPlay.style.display = 'none';
      if (modeSelection) {
        modeSelection.classList.remove('hidden');
        modeSelection.style.display = 'flex';
      }
    });
  }

  if (btnMinus) {
    btnMinus.addEventListener('click', (e) => {
      e.stopPropagation();
      if (selectedMortalNg > 1) {
        selectedMortalNg--;
        if (displayNg) displayNg.textContent = String(selectedMortalNg);
      }
    });
  }

  if (btnPlus) {
    btnPlus.addEventListener('click', (e) => {
      e.stopPropagation();
      if (selectedMortalNg < 99) {
        selectedMortalNg++;
        if (displayNg) displayNg.textContent = String(selectedMortalNg);
      }
    });
  }

  if (btnNormal) {
    btnNormal.addEventListener('click', () => {
      startGame(false, 0);
    });
  }

  if (btnMortal) {
    btnMortal.addEventListener('click', () => {
      startGame(true, selectedMortalNg);
    });
  }
});
