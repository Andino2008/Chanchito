/**
 * ============================================================================
 * SISTEMA MODULAR DE TRANSMUTACIÓN Y RECICLAJE DE RELIQUIAS (`transmutation.js` - v2.4)
 * ============================================================================
 * Permite al jugador gastar llaves en el Yunque Abisal para fundir, transmutar
 * o subir de nivel reliquias indeseadas, resolviendo el problema de la mala suerte
 * y eliminando las "runs muertas" (Dead Runs).
 *
 * Módulos contenidos:
 *  1. TRANSMUTATION_CONFIG: Costes en llaves y recompensas de reciclaje.
 *  2. TransmutationAnvil: Entidad interactiva en salas de tienda y tesoro.
 *  3. TransmutationManager: Gestor del modal HTML, selección y forja.
 * ============================================================================
 */

const TRANSMUTATION_CONFIG = {
  KEY_COST_TRANSMUTE: 1, // 1 llave para re-rollear por otra reliquia
  KEY_COST_SALVAGE: 1,   // 1 llave para desarmar por oro + gemas + curación
  KEY_COST_UPGRADE: 2,   // 2 llaves para subir +1 nivel garantizado a una reliquia
  SALVAGE_GOLD: 25,
  SALVAGE_SHARDS: 15,
  SALVAGE_HEAL: 25,
  INTERACT_RADIUS: 42,
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
  }

  update(dt, player, room) {
    this.pulseTimer += dt * 3.5;
    this.hoverTimer += dt * 2.5;
    if (this.interactCooldown > 0) this.interactCooldown -= dt;

    if (!player) return;
    const dist = Math.hypot(player.x - this.x, player.y - this.y);

    // Al aproximarse el jugador, abre la interfaz de forja si no está ya abierta
    if (dist <= this.radius + player.radius + 14 && this.interactCooldown <= 0) {
      if (typeof TransmutationManager !== 'undefined') {
        if (!TransmutationManager.isOpen()) {
          TransmutationManager.openModal(player, player.ui);
          this.interactCooldown = 0.6;
        }
      }
    }
  }

  draw(ctx) {
    ctx.save();
    const pulse = Math.sin(this.pulseTimer) * 2;
    const hover = Math.sin(this.hoverTimer) * 3;

    // 1. Aura rúnica en el piso
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius + 12 + pulse, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(168, 85, 247, 0.16)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(192, 132, 252, 0.4)';
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
    ctx.strokeStyle = '#a855f7';
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
    ctx.fillStyle = '#c084fc';
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

  static openModal(player, ui) {
    this.init();
    this.activePlayer = player;
    this.activeUi = ui;
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

  static render() {
    const player = this.activePlayer;
    if (!player || !player.itemManager) return;

    // 1. Contador de Llaves
    const keysNum = document.getElementById('transmutation-keys-num');
    if (keysNum) {
      keysNum.textContent = `${player.keys || 0} 🔑`;
      keysNum.style.color = (player.keys > 0) ? '#facc15' : '#ef4444';
    }

    // 2. Lista de Reliquias poseídas
    const listEl = document.getElementById('transmutation-relic-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const owned = player.itemManager.ownedRelics || [];

    if (owned.length === 0) {
      listEl.innerHTML = `
        <div class="transmute-empty-msg">
          No tienes reliquias en tu inventario para colocar en el yunque.<br>
          <small>Explora la mazmorra y abre cofres para conseguir reliquias.</small>
        </div>
      `;
      this.updateActionButtons();
      return;
    }

    owned.forEach((relic) => {
      const card = document.createElement('div');
      card.className = `transmute-relic-card ${this.selectedRelicId === relic.id ? 'selected' : ''}`;
      card.style.borderColor = this.selectedRelicId === relic.id ? '#c084fc' : 'rgba(255, 255, 255, 0.12)';

      card.innerHTML = `
        <div class="transmute-relic-badge" style="background: ${relic.color || '#38bdf8'};">
          ${relic.short || 'REL'}
        </div>
        <div class="transmute-relic-details">
          <div class="transmute-relic-name">${relic.name}</div>
          <div class="transmute-relic-lvl">Nivel ${relic.level || 1}</div>
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
    const keys = player ? (player.keys || 0) : 0;

    const banner = document.getElementById('transmutation-selected-banner');
    if (banner) {
      if (selectedRelic) {
        banner.innerHTML = `Reliquia en el yunque: <strong style="color: ${selectedRelic.color || '#38bdf8'};">${selectedRelic.name}</strong> (Nv. ${selectedRelic.level || 1})`;
      } else {
        banner.textContent = 'Ninguna reliquia seleccionada. Haz clic en una de tus reliquias arriba para forjarla.';
      }
    }

    const btnTransmute = document.getElementById('btn-transmute-action');
    const btnSalvage = document.getElementById('btn-salvage-action');
    const btnReforge = document.getElementById('btn-reforge-action');

    if (btnTransmute) {
      btnTransmute.disabled = !hasRelic || keys < TRANSMUTATION_CONFIG.KEY_COST_TRANSMUTE;
    }
    if (btnSalvage) {
      btnSalvage.disabled = !hasRelic || keys < TRANSMUTATION_CONFIG.KEY_COST_SALVAGE;
    }
    if (btnReforge) {
      btnReforge.disabled = !hasRelic || keys < TRANSMUTATION_CONFIG.KEY_COST_UPGRADE;
    }
  }

  static executeTransmute() {
    const player = this.activePlayer;
    if (!player || !this.selectedRelicId) return;
    if ((player.keys || 0) < TRANSMUTATION_CONFIG.KEY_COST_TRANSMUTE) return;

    const relicName = player.itemManager.getRelic(this.selectedRelicId)?.name || 'Reliquia';

    // 1. Cobrar llave y remover reliquia vieja
    player.keys -= TRANSMUTATION_CONFIG.KEY_COST_TRANSMUTE;
    player.itemManager.removeRelic(this.selectedRelicId);

    // 2. Forjar nueva reliquia aleatoria
    const newRelic = player.itemManager.grantRandomRelic();

    if (typeof soundManager !== 'undefined' && soundManager) {
      soundManager.playProcedural('pedestal', { volume: 0.9 });
    }
    if (window.activeGameInstance) {
      window.activeGameInstance.triggerScreenShake(3.5, 0.14);
    }
    if (this.activeUi) {
      this.activeUi.updateKeys(player.keys);
      this.activeUi.showToast(`🔮 ¡TRANSMUTACIÓN EXITOSA! ${relicName} se convirtió en: ${newRelic ? newRelic.name : 'Nueva Reliquia'}`);
    }

    this.selectedRelicId = null;
    this.render();
  }

  static executeSalvage() {
    const player = this.activePlayer;
    if (!player || !this.selectedRelicId) return;
    if ((player.keys || 0) < TRANSMUTATION_CONFIG.KEY_COST_SALVAGE) return;

    const relicName = player.itemManager.getRelic(this.selectedRelicId)?.name || 'Reliquia';

    // 1. Cobrar llave y remover reliquia
    player.keys -= TRANSMUTATION_CONFIG.KEY_COST_SALVAGE;
    player.itemManager.removeRelic(this.selectedRelicId);

    // 2. Entregar recursos
    player.coins += TRANSMUTATION_CONFIG.SALVAGE_GOLD;
    player.addShards(TRANSMUTATION_CONFIG.SALVAGE_SHARDS);
    player.heal(TRANSMUTATION_CONFIG.SALVAGE_HEAL);

    if (typeof soundManager !== 'undefined' && soundManager) {
      soundManager.playProcedural('coin', { volume: 0.8 });
    }
    if (this.activeUi) {
      this.activeUi.updateKeys(player.keys);
      this.activeUi.updateCoins(player.coins);
      this.activeUi.updateHealth(player);
      this.activeUi.showToast(`🪙 ¡RELIQUIA FUNDIDA! Desarmaste ${relicName}: +${TRANSMUTATION_CONFIG.SALVAGE_GOLD} Oro, +${TRANSMUTATION_CONFIG.SALVAGE_SHARDS} Gemas y +${TRANSMUTATION_CONFIG.SALVAGE_HEAL} HP`);
    }

    this.selectedRelicId = null;
    this.render();
  }

  static executeReforge() {
    const player = this.activePlayer;
    if (!player || !this.selectedRelicId) return;
    if ((player.keys || 0) < TRANSMUTATION_CONFIG.KEY_COST_UPGRADE) return;

    const relic = player.itemManager.getRelic(this.selectedRelicId);
    if (!relic) return;

    // 1. Cobrar 2 llaves
    player.keys -= TRANSMUTATION_CONFIG.KEY_COST_UPGRADE;

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
      this.activeUi.updateKeys(player.keys);
      this.activeUi.showToast(`⚒️ ¡REFORJA DE MAESTRÍA! ${relic.name} subió a Nivel ${relic.level} ★`);
    }

    this.render();
  }
}

// Exponer en el entorno global
window.TRANSMUTATION_CONFIG = TRANSMUTATION_CONFIG;
window.TransmutationAnvil = TransmutationAnvil;
window.TransmutationManager = TransmutationManager;
