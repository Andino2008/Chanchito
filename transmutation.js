/**
 * ============================================================================
 * SISTEMA MODULAR DE TRANSMUTACIÓN Y RECICLAJE DE RELIQUIAS (`transmutation.js` - v2.5)
 * ============================================================================
 * Rediseño integral basado en la "Regla de los 3 Segundos" (Mobile & Quick-Play):
 *  1. CERO coste de llaves: Las llaves se reservan exclusivamente para puertas y cofres.
 *  2. 1 Uso Gratuito por sala / yunque: Transmutar o Fundir sin costo alguno en el 1er uso.
 *  3. Fundir Salvavidas: Desarmar una reliquia otorga +35 HP curados + 1 Llave 🔑 + 25 Oro 🪙.
 *  4. Reforja con Oro: Subir de nivel una reliquia cuesta 30 Oro 🪙 (sin llaves).
 *  5. Interacción limpia con [E]: Se activa con tecla o clic, nunca al pasar caminando.
 *  6. Tarjetas claras con iconos intuitivos y descripciones completas sin cortes.
 * ============================================================================
 */

const TRANSMUTATION_CONFIG = {
  SALVAGE_GOLD: 25,
  SALVAGE_KEYS: 1,
  SALVAGE_HEAL: 35,
  UPGRADE_COST_GOLD: 30,
  REUSE_COST_GOLD: 25,
  INTERACT_RADIUS: 65,
};

// BaseEntity defensiva para evitar dependencias del orden de carga de scripts
const BaseEntityTransmute = (typeof Entity !== 'undefined') ? Entity : class {
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
};

/**
 * Entidad física del Yunque Transmutador ubicada en salas de tienda y tesoro.
 */
class TransmutationAnvil extends BaseEntityTransmute {
  constructor(x, y) {
    super(x, y, 26, '#a855f7');
    this.pulseTimer = 0;
    this.hoverTimer = 0;
    this.interactCooldown = 0;
    this.freeUses = 1; // 1 uso 100% gratuito por yunque
  }

  update(dt, player, room) {
    this.pulseTimer += dt * 3.5;
    this.hoverTimer += dt * 2.5;
    if (this.interactCooldown > 0) this.interactCooldown -= dt;
    // Nota: Ya NO abre el modal automáticamente por proximidad.
    // La apertura se gestiona mediante el World Interaction Prompt [E] o click.
  }

  interact(player, room) {
    if (this.interactCooldown > 0) return;
    this.interactCooldown = 0.5;
    if (typeof TransmutationManager !== 'undefined') {
      TransmutationManager.openModal(player, player ? player.ui : null, this);
    }
  }

  draw(ctx) {
    ctx.save();
    const pulse = Math.sin(this.pulseTimer) * 2;
    const hover = Math.sin(this.hoverTimer) * 3;

    // 1. Aura rúnica en el piso
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius + 12 + pulse, 0, Math.PI * 2);
    ctx.fillStyle = this.freeUses > 0 ? 'rgba(34, 197, 94, 0.16)' : 'rgba(168, 85, 247, 0.16)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = this.freeUses > 0 ? 'rgba(74, 222, 128, 0.5)' : 'rgba(192, 132, 252, 0.4)';
    ctx.stroke();

    // 2. Pedestal metálico del Yunque (base trapezoidal)
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.moveTo(this.x - 20, this.y + 16);
    ctx.lineTo(this.x + 20, this.y + 16);
    ctx.lineTo(this.x + 14, this.y - 4);
    ctx.lineTo(this.x - 14, this.y - 4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 3. Cuerno y mesa del yunque
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.rect(this.x - 16, this.y - 12, 32, 10);
    ctx.fill();
    ctx.strokeStyle = this.freeUses > 0 ? '#4ade80' : '#a855f7';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Pico / cuerno izquierdo del yunque
    ctx.beginPath();
    ctx.moveTo(this.x - 16, this.y - 12);
    ctx.lineTo(this.x - 25, this.y - 16);
    ctx.lineTo(this.x - 16, this.y - 6);
    ctx.closePath();
    ctx.fillStyle = '#475569';
    ctx.fill();
    ctx.stroke();

    // 4. Llama rúnica etérea flotante encima del yunque
    const flameY = this.y - 20 + hover;
    ctx.beginPath();
    ctx.arc(this.x, flameY, 7, 0, Math.PI * 2);
    ctx.fillStyle = this.freeUses > 0 ? '#4ade80' : '#c084fc';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(this.x, flameY, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.restore();
  }
}

/**
 * Gestor del Modal HTML y Lógica de Transmutación.
 */
class TransmutationManager {
  static activePlayer = null;
  static activeUi = null;
  static activeAnvil = null;
  static selectedRelicId = null;
  static initialized = false;

  static init() {
    if (this.initialized) return;
    this.initialized = true;

    const btnClose = document.getElementById('btn-transmutation-close');
    if (btnClose) {
      btnClose.addEventListener('click', () => this.closeModal());
    }

    const btnTransmute = document.getElementById('btn-transmute-action');
    if (btnTransmute) {
      btnTransmute.addEventListener('click', () => this.executeTransmute());
    }

    const btnSalvage = document.getElementById('btn-salvage-action');
    if (btnSalvage) {
      btnSalvage.addEventListener('click', () => this.executeSalvage());
    }

    const btnReforge = document.getElementById('btn-reforge-action');
    if (btnReforge) {
      btnReforge.addEventListener('click', () => this.executeReforge());
    }

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.isOpen()) {
        e.stopPropagation();
        this.closeModal();
      }
    });
  }

  static isOpen() {
    const modal = document.getElementById('transmutation-modal');
    return Boolean(modal && !modal.classList.contains('hidden'));
  }

  static openModal(player, ui, anvil = null) {
    this.init();
    this.activePlayer = player;
    this.activeUi = ui;
    this.activeAnvil = anvil;
    this.selectedRelicId = null;

    const modal = document.getElementById('transmutation-modal');
    if (modal) {
      modal.classList.remove('hidden');
    }

    if (window.activeGameInstance) {
      window.activeGameInstance.isPaused = true;
    }

    if (typeof soundManager !== 'undefined' && soundManager) {
      soundManager.playProcedural('pedestal', { volume: 0.75 });
    }

    this.render();
  }

  static closeModal() {
    const modal = document.getElementById('transmutation-modal');
    if (modal) {
      modal.classList.add('hidden');
    }
    if (window.activeGameInstance) {
      window.activeGameInstance.isPaused = false;
    }
  }

  /**
   * Genera un icono visual limpio y temático para la tarjeta en lugar de abreviaturas crípticas
   */
  static getRelicIcon(relic) {
    if (!relic) return '✨';
    if (relic.icon) return relic.icon;
    const id = (relic.id || '').toUpperCase();
    const name = (relic.name || '').toUpperCase();
    if (id.includes('BULLET') || name.includes('BALA')) return '⚡';
    if (id.includes('SHIELD') || id.includes('ARMOR') || name.includes('ESCUDO') || name.includes('CORAZA')) return '🛡️';
    if (id.includes('HEART') || id.includes('BLOOD') || name.includes('SANGRE') || name.includes('VIDA') || name.includes('FENIX')) return '❤️';
    if (id.includes('DAMAGE') || id.includes('SWORD') || name.includes('MASCARA') || name.includes('CALAVERA')) return '⚔️';
    if (id.includes('SPEED') || id.includes('FEATHER') || name.includes('PLUMA') || name.includes('BOTAS')) return '🪶';
    if (id.includes('CRIT') || name.includes('OJO') || name.includes('CRIT')) return '🎯';
    if (id.includes('POISON') || id.includes('TOXIC') || name.includes('VENENO') || name.includes('HONGO')) return '🧪';
    if (id.includes('TIME') || name.includes('ARENA') || name.includes('TIEMPO')) return '⏳';
    if (id.includes('METEOR') || id.includes('FIRE') || name.includes('FUEGO') || name.includes('LAVA')) return '🔥';
    if (id.includes('ICE') || id.includes('FROST') || name.includes('HIELO')) return '❄️';
    if (id.includes('GOLD') || id.includes('COIN') || name.includes('ORO') || name.includes('MONEDA')) return '🪙';
    if (id.includes('KEY') || name.includes('LLAVE')) return '🔑';
    if (id.includes('BOOK') || id.includes('TOME') || name.includes('LIBRO')) return '📖';
    return '✨';
  }

  static render() {
    const player = this.activePlayer;
    if (!player || !player.itemManager) return;

    // 1. Oro disponible
    const goldNum = document.getElementById('transmutation-gold-num');
    if (goldNum) {
      goldNum.textContent = `${player.coins || 0} 🪙`;
    }

    // 2. Estado de uso gratuito
    const isFree = this.activeAnvil ? (this.activeAnvil.freeUses > 0) : true;
    const freeBadge = document.getElementById('transmutation-free-badge');
    if (freeBadge) {
      if (isFree) {
        freeBadge.textContent = '✨ 1 USO GRATIS';
        freeBadge.style.color = '#4ade80';
        freeBadge.style.borderColor = 'rgba(74, 222, 128, 0.5)';
        freeBadge.style.background = 'rgba(34, 197, 94, 0.2)';
      } else {
        freeBadge.textContent = `REUSO: ${TRANSMUTATION_CONFIG.REUSE_COST_GOLD} 🪙`;
        freeBadge.style.color = '#facc15';
        freeBadge.style.borderColor = 'rgba(250, 204, 21, 0.4)';
        freeBadge.style.background = 'rgba(234, 179, 8, 0.15)';
      }
    }

    // 3. Lista de Reliquias poseídas
    const listEl = document.getElementById('transmutation-relic-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const owned = player.itemManager.ownedRelics || [];

    if (owned.length === 0) {
      listEl.innerHTML = `
        <div class="transmute-empty-msg">
          No tienes reliquias en tu inventario para colocar en el yunque.<br>
          <small>Explora la mazmorra y derrota salas o jefes para conseguir reliquias.</small>
        </div>
      `;
      this.updateActionButtons();
      return;
    }

    owned.forEach((relic) => {
      const isSelected = this.selectedRelicId === relic.id;
      const card = document.createElement('div');
      card.className = `transmute-relic-card ${isSelected ? 'selected' : ''}`;
      card.style.borderColor = isSelected ? '#c084fc' : 'rgba(255, 255, 255, 0.14)';

      const icon = this.getRelicIcon(relic);
      const lvl = relic.level || 1;

      card.innerHTML = `
        <div class="transmute-relic-badge" style="background: ${relic.color || '#a855f7'};">
          ${icon}
        </div>
        <div class="transmute-relic-details">
          <div class="transmute-relic-name">${relic.name}</div>
          <div class="transmute-relic-lvl">NIVEL ${lvl} ★</div>
          <div class="transmute-relic-desc">${relic.description || ''}</div>
        </div>
      `;

      card.addEventListener('click', () => {
        this.selectedRelicId = relic.id;
        this.render();
      });

      listEl.appendChild(card);
    });

    this.updateActionButtons();
  }

  static updateActionButtons() {
    const player = this.activePlayer;
    const hasRelic = Boolean(this.selectedRelicId && player && player.itemManager && player.itemManager.hasRelic(this.selectedRelicId));
    const selectedRelic = hasRelic ? player.itemManager.getRelic(this.selectedRelicId) : null;
    const coins = player ? (player.coins || 0) : 0;
    const isFree = this.activeAnvil ? (this.activeAnvil.freeUses > 0) : true;

    const banner = document.getElementById('transmutation-selected-banner');
    if (banner) {
      if (selectedRelic) {
        banner.innerHTML = `Reliquia en el yunque: <strong style="color: ${selectedRelic.color || '#38bdf8'};">${selectedRelic.name}</strong> (Nv. ${selectedRelic.level || 1}) — ¡Elige una acción abajo!`;
      } else {
        banner.textContent = 'Ninguna reliquia seleccionada. Haz clic en una de tus reliquias arriba para forjarla.';
      }
    }

    const btnTransmute = document.getElementById('btn-transmute-action');
    const btnSalvage = document.getElementById('btn-salvage-action');
    const btnReforge = document.getElementById('btn-reforge-action');

    const transmuteCostLabel = document.getElementById('transmute-cost-label');
    const salvageCostLabel = document.getElementById('salvage-cost-label');
    const reforgeCostLabel = document.getElementById('reforge-cost-label');

    const canAffordReuse = isFree || coins >= TRANSMUTATION_CONFIG.REUSE_COST_GOLD;
    const canAffordReforge = coins >= TRANSMUTATION_CONFIG.UPGRADE_COST_GOLD;

    if (transmuteCostLabel) {
      transmuteCostLabel.textContent = isFree
        ? '✨ GRATIS (1er uso) · Nueva reliquia aleatoria'
        : `Coste: ${TRANSMUTATION_CONFIG.REUSE_COST_GOLD} 🪙 Oro · Nueva reliquia aleatoria`;
    }
    if (salvageCostLabel) {
      salvageCostLabel.textContent = isFree
        ? `✨ GRATIS (1er uso) · +${TRANSMUTATION_CONFIG.SALVAGE_HEAL} HP, +1 🔑 y +${TRANSMUTATION_CONFIG.SALVAGE_GOLD} 🪙`
        : `Coste: ${TRANSMUTATION_CONFIG.REUSE_COST_GOLD} 🪙 · +${TRANSMUTATION_CONFIG.SALVAGE_HEAL} HP, +1 🔑 y +${TRANSMUTATION_CONFIG.SALVAGE_GOLD} 🪙`;
    }
    if (reforgeCostLabel) {
      reforgeCostLabel.textContent = `Coste: ${TRANSMUTATION_CONFIG.UPGRADE_COST_GOLD} 🪙 Oro · Mejora stats (Sin Llaves)`;
    }

    if (btnTransmute) {
      btnTransmute.disabled = !hasRelic || !canAffordReuse;
    }
    if (btnSalvage) {
      btnSalvage.disabled = !hasRelic || !canAffordReuse;
    }
    if (btnReforge) {
      btnReforge.disabled = !hasRelic || !canAffordReforge;
    }
  }

  static executeTransmute() {
    const player = this.activePlayer;
    if (!player || !this.selectedRelicId) return;

    const isFree = this.activeAnvil ? (this.activeAnvil.freeUses > 0) : true;
    if (!isFree && (player.coins || 0) < TRANSMUTATION_CONFIG.REUSE_COST_GOLD) return;

    const relicName = player.itemManager.getRelic(this.selectedRelicId)?.name || 'Reliquia';

    // 1. Cobrar uso libre o 25 de oro
    if (isFree && this.activeAnvil) {
      this.activeAnvil.freeUses--;
    } else {
      player.spendCoins(TRANSMUTATION_CONFIG.REUSE_COST_GOLD);
    }

    // 2. Remover reliquia vieja y forjar nueva reliquia aleatoria
    player.itemManager.removeRelic(this.selectedRelicId);
    const newRelic = player.itemManager.grantRandomRelic();

    if (typeof soundManager !== 'undefined' && soundManager) {
      soundManager.playProcedural('pedestal', { volume: 0.9 });
    }
    if (window.activeGameInstance) {
      window.activeGameInstance.triggerScreenShake(3.5, 0.14);
    }
    if (this.activeUi) {
      this.activeUi.updateCoins(player.coins);
      this.activeUi.updateRelics(player.itemManager.ownedRelics);
      this.activeUi.showToast(`🔮 ¡TRANSMUTACIÓN EXITOSA! ${relicName} se convirtió en: ${newRelic ? newRelic.name : 'Nueva Reliquia'}`);
    }

    this.selectedRelicId = null;
    this.render();
  }

  static executeSalvage() {
    const player = this.activePlayer;
    if (!player || !this.selectedRelicId) return;

    const isFree = this.activeAnvil ? (this.activeAnvil.freeUses > 0) : true;
    if (!isFree && (player.coins || 0) < TRANSMUTATION_CONFIG.REUSE_COST_GOLD) return;

    const relicName = player.itemManager.getRelic(this.selectedRelicId)?.name || 'Reliquia';

    // 1. Cobrar uso libre o 25 de oro
    if (isFree && this.activeAnvil) {
      this.activeAnvil.freeUses--;
    } else {
      player.spendCoins(TRANSMUTATION_CONFIG.REUSE_COST_GOLD);
    }

    // 2. Remover reliquia seleccionada
    player.itemManager.removeRelic(this.selectedRelicId);

    // 3. Entregar salvavidas: +35 HP, +1 Llave garantizada, +25 Oro
    player.heal(TRANSMUTATION_CONFIG.SALVAGE_HEAL);
    player.keys = (player.keys || 0) + TRANSMUTATION_CONFIG.SALVAGE_KEYS;
    player.coins += TRANSMUTATION_CONFIG.SALVAGE_GOLD;
    if (player.itemManager) player.itemManager.applyPassiveStats();

    if (typeof soundManager !== 'undefined' && soundManager) {
      soundManager.playProcedural('coin', { volume: 0.85 });
    }
    if (window.activeGameInstance) {
      window.activeGameInstance.triggerScreenShake(3.0, 0.12);
    }
    if (this.activeUi) {
      this.activeUi.updateHealth(player);
      this.activeUi.updateKeys(player.keys);
      this.activeUi.updateCoins(player.coins);
      this.activeUi.updateRelics(player.itemManager.ownedRelics);
      this.activeUi.showToast(`❤️ ¡RELIQUIA FUNDIDA! Desarmaste ${relicName}: +${TRANSMUTATION_CONFIG.SALVAGE_HEAL} HP curados, +1 Llave 🔑 y +${TRANSMUTATION_CONFIG.SALVAGE_GOLD} Oro 🪙`);
    }

    this.selectedRelicId = null;
    this.render();
  }

  static executeReforge() {
    const player = this.activePlayer;
    if (!player || !this.selectedRelicId) return;
    if ((player.coins || 0) < TRANSMUTATION_CONFIG.UPGRADE_COST_GOLD) return;

    const relic = player.itemManager.getRelic(this.selectedRelicId);
    if (!relic) return;

    // 1. Cobrar 30 de oro (Cero llaves)
    player.spendCoins(TRANSMUTATION_CONFIG.UPGRADE_COST_GOLD);

    // 2. Subir de nivel la reliquia
    relic.level = (relic.level || 1) + 1;
    player.itemManager.applyPassiveStats();

    if (typeof soundManager !== 'undefined' && soundManager) {
      soundManager.playProcedural('crit', { volume: 0.85 });
    }
    if (window.activeGameInstance) {
      window.activeGameInstance.triggerScreenShake(4.0, 0.16);
    }
    if (this.activeUi) {
      this.activeUi.updateCoins(player.coins);
      this.activeUi.updateRelics(player.itemManager.ownedRelics);
      this.activeUi.showToast(`⚒️ ¡REFORJA DE MAESTRÍA! ${relic.name} subió a Nivel ${relic.level} ★`);
    }

    this.render();
  }
}

// Exponer en el entorno global
window.TRANSMUTATION_CONFIG = TRANSMUTATION_CONFIG;
window.TransmutationAnvil = TransmutationAnvil;
window.TransmutationManager = TransmutationManager;
