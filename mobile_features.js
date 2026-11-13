/**
 * ============================================================================
 * MOBILE_FEATURES.JS - SISTEMA DE MONETIZACIÓN JUSTA, BUCLE MÓVIL Y ARQUETIPOS
 * ============================================================================
 * Implementa:
 *  1. AdManager: Gestor centralizado de anuncios recompensados (simulado y listo para SDK móvil).
 *  2. ReviveManager: "Segunda Oportunidad Abisal" (1 revivir por run con Supernova Abisal).
 *  3. SmugglerBriefcase & MerchantSafe: Entidades interactivas in-run para partidas rápidas de 5-10 min.
 *  4. PIG_ARCHETYPES: Arquetipos desbloqueables con Gemas (Berserker, Ciber, Magnate, Demonio).
 *  5. OracleManager: Ruleta mística del Oráculo del Abismo en el Santuario.
 *  6. RunSaveManager: Auto-guardado instantáneo de bolsillo por sala ("Modo Colectivo").
 *
 * REGLA ESTRICTA: 0 llamadas a ctx.fillText o ctx.strokeText en el Canvas.
 */

// ----------------------------------------------------------------------------
// 1. AD MANAGER (GESTOR CENTRALIZADO DE ANUNCIOS BONIFICADOS)
// ----------------------------------------------------------------------------
class AdManagerClass {
  constructor() {
    this.externalProvider = null;
    this.isWatching = false;
    this.activeFinishAd = null;
  }

  finishCurrentAd(awarded = true) {
    if (typeof this.activeFinishAd === 'function') {
      this.activeFinishAd(awarded);
    }
  }

  setProvider(providerFn) {
    this.externalProvider = providerFn;
  }

  showRewardedAd({ title = 'ANUNCIO BONIFICADO', rewardDesc = 'Recompensa', onReward = () => {}, onCancel = () => {} }) {
    if (this.isWatching) return;

    // Si hay un SDK móvil nativo conectado (AdMob, CrazyGames, etc.)
    if (typeof this.externalProvider === 'function') {
      this.isWatching = true;
      this.externalProvider({
        title,
        rewardDesc,
        onSuccess: () => {
          this.isWatching = false;
          onReward();
        },
        onError: () => {
          this.isWatching = false;
          onCancel();
        }
      });
      return;
    }

    // Modal de simulación in-game de 2.0s
    this.isWatching = true;
    const modal = document.getElementById('ad-simulator-modal');
    const titleEl = document.getElementById('ad-sim-title');
    const descEl = document.getElementById('ad-sim-desc');
    const progressEl = document.getElementById('ad-sim-progress-fill');
    const timerEl = document.getElementById('ad-sim-timer');
    const btnCancel = document.getElementById('ad-sim-btn-cancel');

    if (modal && titleEl && descEl && progressEl) {
      modal.classList.remove('hidden');
      titleEl.textContent = title.toUpperCase();
      descEl.textContent = rewardDesc;
      progressEl.style.width = '0%';
      if (timerEl) timerEl.textContent = '2.0s';

      let elapsed = 0;
      const duration = 2000;
      const intervalMs = 50;

      let timerId = null;

      const finishAd = (awarded = true) => {
        clearInterval(timerId);
        this.activeFinishAd = null;
        modal.classList.add('hidden');
        this.isWatching = false;
        if (awarded) {
          if (typeof soundManager !== 'undefined' && soundManager) {
            soundManager.playProcedural('pedestal', { volume: 0.9 });
            soundManager.playProcedural('coin', { volume: 0.7 });
          }
          if (window.activeGameInstance && window.activeGameInstance.ui) {
            window.activeGameInstance.ui.showToast(`🎬 ¡RECOMPENSA OBTENIDA! ${rewardDesc}`);
          }
          onReward();
        } else {
          onCancel();
        }
      };

      this.activeFinishAd = finishAd;

      if (btnCancel) {
        btnCancel.onclick = () => finishAd(false);
      }

      timerId = setInterval(() => {
        elapsed += intervalMs;
        const pct = Math.min(100, Math.round((elapsed / duration) * 100));
        progressEl.style.width = `${pct}%`;
        const remainingSec = Math.max(0, ((duration - elapsed) / 1000)).toFixed(1);
        if (timerEl) timerEl.textContent = `${remainingSec}s`;

        if (elapsed >= duration) {
          finishAd(true);
        }
      }, intervalMs);
    } else {
      // Fallback si no está el modal en el DOM
      setTimeout(() => {
        this.isWatching = false;
        onReward();
      }, 1000);
    }
  }
}

const AdManager = new AdManagerClass();
window.AdManager = AdManager;


// ----------------------------------------------------------------------------
// 2. ARQUETIPOS DE CERDITO (CLASES DESBLOQUEABLES CON GEMAS)
// ----------------------------------------------------------------------------
const PIG_ARCHETYPES = {
  classic: {
    id: 'classic',
    name: 'Cerdito Clásico',
    icon: '🐷',
    badge: 'ESTÁNDAR',
    cost: 0,
    color: '#38bdf8',
    desc: 'Equilibrado y noble. Comienza con 100 HP, stats base sin alteraciones y 1 Llave inicial.',
    apply(player) {
      player.archetype = 'classic';
      player.archetypeColor = '#38bdf8';
    }
  },
  berserker: {
    id: 'berserker',
    name: 'Jabalí Berserker',
    icon: '🐗',
    badge: 'OFENSIVO',
    cost: 120,
    color: '#ef4444',
    desc: 'Furia Sangrienta: Gana hasta +60% de Velocidad de Ataque a menor vida restante. Inicia con afinidad de Sangrado Lv.1 y +15% Daño.',
    apply(player) {
      player.archetype = 'berserker';
      player.archetypeColor = '#ef4444';
      player.shopDamageMultiplier = Number((player.shopDamageMultiplier * 1.15).toFixed(2));
      player.damageMultiplier = player.shopDamageMultiplier;
      if (player.elementalPool) {
        player.elementalPool.BLEED = Math.max(player.elementalPool.BLEED || 0, 1);
      }
      player._lastBerserkerHpRatio = -1;
    },
    onTick(player, dt) {
      if (player.hp > 0 && player.maxHp > 0 && player.itemManager) {
        const hpRatio = Math.max(0, Math.min(1, player.hp / player.maxHp));
        if (player._lastBerserkerHpRatio === undefined || Math.abs(hpRatio - player._lastBerserkerHpRatio) >= 0.01) {
          player._lastBerserkerHpRatio = hpRatio;
          player.itemManager.applyPassiveStats();
        }
      }
    }
  },
  cyber: {
    id: 'cyber',
    name: 'Ciber-Porcino',
    icon: '🤖',
    badge: 'TECNOLÓGICO',
    cost: 200,
    color: '#06b6d4',
    desc: 'Núcleo Tecnológico: Inicia con +40 de Escudo y afinidad Electricidad Lv.1. Regenera +15 de Escudo automáticamente al limpiar cada sala.',
    apply(player) {
      player.archetype = 'cyber';
      player.archetypeColor = '#06b6d4';
      player.addShield(40);
      if (player.elementalPool) {
        player.elementalPool.LIGHTNING = Math.max(player.elementalPool.LIGHTNING || 0, 1);
      }
    },
    onRoomCleared(player, room) {
      player.addShield(15);
      if (player.ui) {
        player.ui.spawnFloatingText('+15 ESCUDO TECH 🛡️', '#06b6d4', player.x, player.y - 28);
      }
    }
  },
  tycoon: {
    id: 'tycoon',
    name: 'Magnate Dorado',
    icon: '👑',
    badge: 'ECONOMÍA',
    cost: 300,
    color: '#fbbf24',
    desc: 'Poder Financiero: Inicia con 80 Monedas de Oro y 2 Llaves. Gana +1% de Daño permanente acumulativo por cada 5 monedas en tu billetera.',
    apply(player) {
      player.archetype = 'tycoon';
      player.archetypeColor = '#fbbf24';
      player.coins += 80;
      player.keys += 2;
      player._lastTycoonCoins = player.coins;
    },
    onTick(player, dt) {
      if (player.itemManager && player._lastTycoonCoins !== player.coins) {
        player._lastTycoonCoins = player.coins;
        player.itemManager.applyPassiveStats();
      }
    }
  },
  pyro: {
    id: 'pyro',
    name: 'Demonio de Ceniza',
    icon: '🔥',
    badge: 'CAÑÓN DE CRISTAL',
    cost: 450,
    color: '#f97316',
    desc: 'Cañón de Cristal: -35% HP Máx (+40% Daño base). +35 Estamina Máx y -20% coste de Dash. Deja charcos de fuego al esquivar.',
    apply(player) {
      player.archetype = 'pyro';
      player.archetypeColor = '#f97316';
      player.baseMaxHp = Math.max(30, Math.round((player.baseMaxHp || 100) * 0.65));
      player.maxHp = player.baseMaxHp;
      player.hp = player.maxHp;
      player.shopDamageMultiplier = Number((player.shopDamageMultiplier * 1.40).toFixed(2));
      player.damageMultiplier = player.shopDamageMultiplier;
      player.baseMaxStamina = (player.baseMaxStamina || 100) + 35;
      player.maxStamina = player.baseMaxStamina;
      player.stamina = player.maxStamina;
      player.baseDashCostMultiplier = Math.max(0.45, Number(((player.baseDashCostMultiplier || 1.0) * 0.80).toFixed(3)));
      player.dashCostMultiplier = player.baseDashCostMultiplier;
      if (player.elementalPool) {
        player.elementalPool.FIRE = Math.max(player.elementalPool.FIRE || 0, 1);
      }
    },
    onDodge(player, room) {
      if (room && typeof FirePuddle !== 'undefined') {
        room.hazards.push(new FirePuddle(player.x, player.y, 35, 3.5, 12));
      }
    }
  }
};
window.PIG_ARCHETYPES = PIG_ARCHETYPES;


// ----------------------------------------------------------------------------
// 3. ORÁCULO DEL ABISMO (RULETA DE SUMINISTROS Y BENDICIONES)
// ----------------------------------------------------------------------------
const ORACLE_REWARDS = [
  {
    id: 'GEMS_JACKPOT',
    title: '¡JACKPOT! +75 GEMAS DEL ABISMO',
    icon: '💎',
    color: '#c084fc',
    desc: '+75 Gemas añadidas inmediatamente a tu bóveda del Santuario.',
    grant(player, game) {
      if (window.metaProgression) {
        window.metaProgression.addShards(75);
      }
    }
  },
  {
    id: 'HEAVY_ARSENAL',
    title: 'ARSENAL EXPERIMENTAL',
    icon: '🚀',
    color: '#fb923c',
    desc: 'Próxima partida: Desbloqueas Fuego Nv.3 al instante (Lanzagranadas de Napalm para Pelotas).',
    grant(player, game) {
      if (window.metaProgression) {
        window.metaProgression.setPendingBlessing({ type: 'HEAVY_ARSENAL', label: 'Lanzagranadas de Napalm' });
      }
    }
  },
  {
    id: 'DUAL_RELIC_PACK',
    title: 'PAQUETE DE 2 RELIQUIAS',
    icon: '🎁',
    color: '#38bdf8',
    desc: 'Próxima partida: Iniciarás con 2 Reliquias aleatorias extra en tu inventario.',
    grant(player, game) {
      if (window.metaProgression) {
        window.metaProgression.setPendingBlessing({ type: 'DUAL_RELIC_PACK', label: '+2 Reliquias Extra' });
      }
    }
  },
  {
    id: 'RICH_START',
    title: 'FONDO DE EXPEDICIÓN',
    icon: '🪙',
    color: '#facc15',
    desc: 'Próxima partida: Iniciarás con +60 de Oro y +2 Llaves maestras.',
    grant(player, game) {
      if (window.metaProgression) {
        window.metaProgression.setPendingBlessing({ type: 'RICH_START', label: '+60 Oro / +2 Llaves' });
      }
    }
  },
  {
    id: 'SHIELD_MATRIX',
    title: 'MATRIZ DE ESCUDO PESADO',
    icon: '🛡️',
    color: '#06b6d4',
    desc: 'Próxima partida: Comenzarás con +65 de Escudo Abisal protector.',
    grant(player, game) {
      if (window.metaProgression) {
        window.metaProgression.setPendingBlessing({ type: 'SHIELD_MATRIX', label: '+65 Escudo Inicial' });
      }
    }
  },
  {
    id: 'HASTE_AURA',
    title: 'BENDICIÓN DE AGILIDAD',
    icon: '⚡',
    color: '#4ade80',
    desc: 'Próxima partida: +25% Velocidad de Ataque y +15% Velocidad de Movimiento permanente.',
    grant(player, game) {
      if (window.metaProgression) {
        window.metaProgression.setPendingBlessing({ type: 'HASTE_AURA', label: '+25% Vel. Ataque / +15% Mov.' });
      }
    }
  }
];

class OracleManagerClass {
  spin(costType = 'GEMS', onSuccess = () => {}) {
    const mp = window.metaProgression;
    if (!mp) return;

    const doSpin = () => {
      const idx = Math.floor(Math.random() * ORACLE_REWARDS.length);
      const reward = ORACLE_REWARDS[idx];
      reward.grant(null, window.activeGameInstance);

      if (typeof soundManager !== 'undefined' && soundManager) {
        soundManager.playProcedural('pedestal', { volume: 0.95 });
        soundManager.playProcedural('key', { volume: 0.85 });
      }

      onSuccess(reward);
    };

    if (costType === 'AD') {
      AdManager.showRewardedAd({
        title: 'ORÁCULO DEL ABISMO',
        rewardDesc: 'Tirada Mística de Suministros',
        onReward: doSpin
      });
    } else {
      const COST = 25;
      if (mp.getShards() < COST) {
        if (window.activeGameInstance && window.activeGameInstance.ui) {
          window.activeGameInstance.ui.showToast('⚠️ Gemas insuficientes (Requiere 25 💎 o ver 1 anuncio)');
        }
        return;
      }
      mp.data.shards -= COST;
      mp.save();
      if (window.activeGameInstance && window.activeGameInstance.ui) {
        window.activeGameInstance.ui.updateShards(0, mp.getShards());
      }
      doSpin();
    }
  }

  consumeBlessing(player, game) {
    const mp = window.metaProgression;
    if (!mp || !mp.data.pendingBlessing) return;

    const b = mp.data.pendingBlessing;
    mp.data.pendingBlessing = null;
    mp.save();

    if (b.type === 'HEAVY_ARSENAL' && player.elementalPool) {
      player.elementalPool.FIRE = Math.max(player.elementalPool.FIRE || 0, 3);
      if (typeof EvolutionManager !== 'undefined' && typeof EvolutionManager.checkEvolutions === 'function') {
        EvolutionManager.checkEvolutions(player, game && game.currentRoom ? game.currentRoom : null, player.ui);
      }
      player.ui?.updateStats?.(player);
      player.ui?.showToast('🚀 ¡ARSENAL DEL ORÁCULO: LANZAGRANADAS DE NAPALM DESBLOQUEADO!');
    } else if (b.type === 'DUAL_RELIC_PACK' && player.itemManager) {
      player.itemManager.grantRandomRelic();
      player.itemManager.grantRandomRelic();
      player.ui?.showToast('🎁 ¡2 RELIQUIAS EXTRA DEL ORÁCULO ENTREGADAS!');
    } else if (b.type === 'RICH_START') {
      player.coins += 60;
      player.keys += 2;
      player.ui?.showToast('🪙 ¡FONDO DEL ORÁCULO: +60 ORO Y +2 LLAVES!');
    } else if (b.type === 'SHIELD_MATRIX') {
      player.addShield(65);
      player.ui?.showToast('🛡️ ¡MATRIZ DEL ORÁCULO: +65 ESCUDO APLICADO!');
    } else if (b.type === 'HASTE_AURA') {
      player.shopAttackSpeedMultiplier *= 1.25;
      player.attackSpeedMultiplier = player.shopAttackSpeedMultiplier;
      player.baseSpeed *= 1.15;
      player.speed = player.baseSpeed;
      player.ui?.showToast('⚡ ¡AGILIDAD DEL ORÁCULO APLICADA!');
    }
  }
}

const OracleManager = new OracleManagerClass();
window.OracleManager = OracleManager;


// ----------------------------------------------------------------------------
// 4. REVIVE MANAGER ("SEGUNDA OPORTUNIDAD ABISAL")
// ----------------------------------------------------------------------------
class ReviveManagerClass {
  promptRevive(gameInstance, onFinalGameOver) {
    if (!gameInstance || !gameInstance.player) return onFinalGameOver();
    const player = gameInstance.player;

    if (player.hasUsedAbyssalRevive) {
      return onFinalGameOver();
    }

    gameInstance.isPaused = true;
    const modal = document.getElementById('revive-modal');
    if (!modal) return onFinalGameOver();

    modal.classList.remove('hidden');

    const btnAd = document.getElementById('btn-revive-ad');
    const btnGems = document.getElementById('btn-revive-gems');
    const btnGiveUp = document.getElementById('btn-revive-giveup');
    const gemsCostText = document.getElementById('revive-gems-cost-text');

    const mp = window.metaProgression;
    const currentGems = mp ? mp.getShards() : 0;
    const REVIVE_COST_GEMS = 30;

    if (gemsCostText) {
      gemsCostText.textContent = `(30 💎 • TIENES ${currentGems} 💎)`;
    }
    if (btnGems) {
      btnGems.disabled = currentGems < REVIVE_COST_GEMS;
    }

    const closeAndProceed = () => {
      modal.classList.add('hidden');
      gameInstance.isPaused = false;
      onFinalGameOver();
    };

    const executeRevival = () => {
      modal.classList.add('hidden');
      gameInstance.isPaused = false;
      player.hasUsedAbyssalRevive = true;

      // 1. Restaurar 60% de Vida Máxima
      player.hp = Math.max(1, Math.round(player.maxHp * 0.60));
      player.invulnerableTimer = 3.0; // 3 segundos de gracia absoluta

      // 2. Supernova Abisal: limpiar proyectiles enemigos y empujar
      const room = gameInstance.currentRoom;
      if (room) {
        room.enemyProjectiles = [];
        for (const enemy of room.enemies) {
          if (!enemy.markedForDeletion) {
            const dist = Math.hypot(enemy.x - player.x, enemy.y - player.y) || 1;
            const pushDir = { x: (enemy.x - player.x) / dist, y: (enemy.y - player.y) / dist };
            enemy.vx += pushDir.x * 450;
            enemy.vy += pushDir.y * 450;
            if (typeof enemy.takeDamage === 'function') {
              enemy.takeDamage(40, pushDir.x * 200, pushDir.y * 200, 'NONE');
            }
          }
        }
        // Partículas de Supernova
        for (let i = 0; i < 40; i++) {
          const ang = (Math.PI * 2 * i) / 40;
          const spd = 160 + Math.random() * 120;
          room.spawnParticle(player.x, player.y, Math.cos(ang) * spd, Math.sin(ang) * spd, 6, '#38bdf8', 0.8);
          room.spawnParticle(player.x, player.y, Math.cos(ang) * (spd * 0.6), Math.sin(ang) * (spd * 0.6), 5, '#c084fc', 0.8);
        }
      }

      gameInstance.triggerScreenShake(9.0, 0.4);
      if (typeof soundManager !== 'undefined' && soundManager) {
        soundManager.playProcedural('pedestal', { volume: 1.0 });
        soundManager.playProcedural('break_rock', { volume: 0.8 });
      }

      if (gameInstance.ui) {
        gameInstance.ui.updateHealth(player);
        gameInstance.ui.showToast('⚡ ¡SEGUNDA OPORTUNIDAD ABISAL CONSUMADA! (Supernova liberada)');
        gameInstance.ui.spawnFloatingText('★ SEGUNDA OPORTUNIDAD ★', '#38bdf8', player.x, player.y - 45);
      }
    };

    if (btnAd) {
      btnAd.onclick = () => {
        AdManager.showRewardedAd({
          title: 'SEGUNDA OPORTUNIDAD ABISAL',
          rewardDesc: 'Revivir con 60% HP y Supernova',
          onReward: executeRevival,
          onCancel: () => {}
        });
      };
    }

    if (btnGems) {
      btnGems.onclick = () => {
        if (currentGems < REVIVE_COST_GEMS) return;
        mp.data.shards -= REVIVE_COST_GEMS;
        mp.save();
        if (gameInstance.ui) gameInstance.ui.updateShards(0, mp.getShards());
        executeRevival();
      };
    }

    if (btnGiveUp) {
      btnGiveUp.onclick = closeAndProceed;
    }
  }
}

const ReviveManager = new ReviveManagerClass();
window.ReviveManager = ReviveManager;


// ----------------------------------------------------------------------------
// 5. ENTIDADES MÓVILES IN-RUN: MALETÍN DEL CONTRABANDISTA Y CAJA DEL MERCADER
// ----------------------------------------------------------------------------

const MobileBaseEntity = typeof Entity !== 'undefined' ? Entity : class {
  constructor(x, y, radius, color) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.radius = radius;
    this.color = color;
    this.markedForDeletion = false;
  }
};

/**
 * Maletín del Contrabandista en la Sala Inicial (StartRoom).
 * Permite arrancar la run en modo express (1 Reliquia + 35 Oro + 1 Llave + 25 Escudo).
 */
class SmugglerBriefcase extends MobileBaseEntity {
  constructor(x, y) {
    super(x, y, 22, '#10b981');
    this.opened = false;
    this.pulseTimer = 0;
  }

  update(dt, player, room) {
    this.pulseTimer += dt * 4;
    if (this.opened) return;

    // Obstáculo físico que no se abre solo
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

  openWithAd(player, room) {
    AdManager.showRewardedAd({
      title: 'MALETÍN DEL CONTRABANDISTA',
      rewardDesc: 'Kit de Asalto Inicial Completo',
      onReward: () => this.grantSupplies(player, room, 'ANUNCIO PATROCINADO')
    });
  }

  openWithGems(player, room) {
    const mp = window.metaProgression;
    const COST = 15;
    if (!mp || mp.getShards() < COST) {
      if (player.ui) player.ui.showToast('⚠️ Gemas insuficientes (Requiere 15 💎)');
      return;
    }
    mp.data.shards -= COST;
    mp.save();
    if (player.ui) player.ui.updateShards(0, mp.getShards());
    this.grantSupplies(player, room, '15 GEMAS 💎');
  }

  grantSupplies(player, room, methodStr) {
    this.opened = true;
    soundManager.playProcedural('pedestal', { volume: 0.9 });
    soundManager.playProcedural('key', { volume: 0.8 });

    player.coins += 35;
    player.keys += 1;
    player.addShield(25);
    const relic = player.itemManager ? player.itemManager.grantRandomRelic() : null;

    if (player.ui) {
      player.ui.updateCoins(player.coins);
      player.ui.updateKeys(player.keys);
      player.ui.showToast(`💼 ¡MALETÍN ABIERTO VIA ${methodStr}! [+35 🪙 | +1 🔑 | +25 🛡️]`);
      player.ui.spawnFloatingText('★ KIT DE ASALTO EXPRESS ★', '#10b981', this.x, this.y - 30);
      if (relic) {
        player.ui.spawnFloatingText(`+${relic.name.toUpperCase()}`, relic.color, this.x, this.y - 50);
      }
    }

    if (room && typeof room.spawnParticle === 'function') {
      for (let i = 0; i < 25; i++) {
        const ang = (Math.PI * 2 * i) / 25;
        room.spawnParticle(this.x, this.y, Math.cos(ang) * 90, Math.sin(ang) * 90, 4, '#10b981', 0.5);
      }
    }
  }

  grantLoot(player, room) {
    this.grantSupplies(player, room, 'SUMINISTRO EXPRESS');
  }

  interact(player, room) {
    if (this.opened) return;
    openMobileChoiceModal({
      title: '💼 MALETÍN DEL CONTRABANDISTA',
      desc: 'Arranque rápido de 5 minutos: Obtén +1 Reliquia Aleatoria, +35 Monedas de Oro, +1 Llave y +25 Escudo de protección.',
      adText: 'ABRIR CON ANUNCIO (GRATIS)',
      gemText: 'ABRIR CON 15 GEMAS',
      gemCost: 15,
      onAd: () => this.openWithAd(player, room),
      onGems: () => this.openWithGems(player, room)
    });
  }

  draw(ctx) {
    ctx.save();
    const w = 38;
    const h = 26;
    const pulse = Math.sin(this.pulseTimer) * 2;

    ctx.fillStyle = this.opened ? '#064e3b' : '#047857';
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 2.5;
    ctx.fillRect(this.x - w / 2, this.y - h / 2, w, h);
    ctx.strokeRect(this.x - w / 2, this.y - h / 2, w, h);

    // Manija del maletín
    ctx.strokeStyle = '#a7f3d0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.x, this.y - h / 2 - 2, 5, Math.PI, 0, false);
    ctx.stroke();

    // Broches metálicos dorados
    ctx.fillStyle = '#fde047';
    ctx.fillRect(this.x - 11, this.y - 3, 5, 6);
    ctx.fillRect(this.x + 6, this.y - 3, 5, 6);
    ctx.restore();
  }
}
window.SmugglerBriefcase = SmugglerBriefcase;


/**
 * Caja Fuerte del Mercader en ShopRoom.
 * Soborno opcional de emergencia por 45 Oro y 1 Llave.
 */
class MerchantSafe extends MobileBaseEntity {
  constructor(x, y) {
    super(x, y, 24, '#f59e0b');
    this.opened = false;
    this.pulseTimer = 0;
  }

  update(dt, player, room) {
    this.pulseTimer += dt * 3.5;
    if (this.opened) return;

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

  getBribeGold(room) {
    const scale = (typeof Room !== 'undefined' && typeof Room.getEconomyScale === 'function')
      ? Room.getEconomyScale(room ? room.sectionNumber : 1, room ? room.levelNumber : 1)
      : 1;
    return Math.round(25 * scale);
  }

  openWithAd(player, room) {
    const goldAmt = this.getBribeGold(room);
    AdManager.showRewardedAd({
      title: 'CAJA FUERTE DEL MERCADER',
      rewardDesc: `Soborno de Tienda (+${goldAmt} Oro / +1 Llave)`,
      onReward: () => this.grantSafeContent(player, room, 'ANUNCIO PATROCINADO')
    });
  }

  openWithGems(player, room) {
    const mp = window.metaProgression;
    const COST = 10;
    if (!mp || mp.getShards() < COST) {
      if (player.ui) player.ui.showToast('⚠️ Gemas insuficientes (Requiere 10 💎)');
      return;
    }
    mp.data.shards -= COST;
    mp.save();
    if (player.ui) player.ui.updateShards(0, mp.getShards());
    this.grantSafeContent(player, room, '10 GEMAS 💎');
  }

  grantSafeContent(player, room, methodStr) {
    this.opened = true;
    soundManager.playProcedural('coin', { volume: 0.9 });
    soundManager.playProcedural('door_unlock', { volume: 0.85 });

    const goldAmt = this.getBribeGold(room);
    player.coins += goldAmt;
    player.keys += 1;

    if (player.ui) {
      player.ui.updateCoins(player.coins);
      player.ui.updateKeys(player.keys);
      player.ui.showToast(`💰 ¡SOBORNO COMPLETADO VIA ${methodStr}! [+${goldAmt} 🪙 / +1 🔑]`);
      player.ui.spawnFloatingText(`+${goldAmt} 🪙 | +1 🔑`, '#facc15', this.x, this.y - 25);
    }
  }

  grantLoot(player, room) {
    this.grantSafeContent(player, room, 'SOBORNO DE EMERGENCIA');
  }

  interact(player, room) {
    if (this.opened) return;
    const goldAmt = this.getBribeGold(room);
    openMobileChoiceModal({
      title: '💰 CAJA FUERTE DEL MERCADER',
      desc: `¿Necesitas fondos para comprar en la tienda? Soborna la caja del mercader para recibir +${goldAmt} Monedas de Oro y +1 Llave maestra.`,
      adText: 'SOBORNAR CON ANUNCIO',
      gemText: 'SOBORNAR CON 10 GEMAS',
      gemCost: 10,
      onAd: () => this.openWithAd(player, room),
      onGems: () => this.openWithGems(player, room)
    });
  }

  draw(ctx) {
    ctx.save();
    const w = 36;
    const h = 36;
    ctx.fillStyle = this.opened ? '#1c1917' : '#334155';
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2.5;
    ctx.fillRect(this.x - w / 2, this.y - h / 2, w, h);
    ctx.strokeRect(this.x - w / 2, this.y - h / 2, w, h);

    // Dial giratorio central de la caja fuerte
    ctx.beginPath();
    ctx.arc(this.x, this.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#fde047';
    ctx.fill();
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }
}
window.MerchantSafe = MerchantSafe;


// Modal auxiliar de elección rápida para Maletín y Caja Fuerte
function openMobileChoiceModal({ title, desc, adText, gemText, gemCost, onAd, onGems }) {
  const modal = document.getElementById('mobile-choice-modal');
  if (!modal) return;

  const titleEl = document.getElementById('choice-modal-title');
  const descEl = document.getElementById('choice-modal-desc');
  const btnAd = document.getElementById('choice-modal-btn-ad');
  const btnGems = document.getElementById('choice-modal-btn-gems');
  const btnClose = document.getElementById('choice-modal-btn-close');

  if (titleEl) titleEl.textContent = title;
  if (descEl) descEl.textContent = desc;
  if (btnAd) btnAd.textContent = `🎬 ${adText}`;
  if (btnGems) {
    const currentGems = window.metaProgression ? window.metaProgression.getShards() : 0;
    btnGems.textContent = `💎 ${gemText} (${gemCost} 💎 • TIENES ${currentGems})`;
    btnGems.disabled = currentGems < gemCost;
  }

  modal.classList.remove('hidden');

  const close = () => modal.classList.add('hidden');

  if (btnAd) {
    btnAd.onclick = () => {
      close();
      onAd();
    };
  }
  if (btnGems) {
    btnGems.onclick = () => {
      close();
      onGems();
    };
  }
  if (btnClose) {
    btnClose.onclick = close;
  }
}
window.openMobileChoiceModal = openMobileChoiceModal;


// ----------------------------------------------------------------------------
// 6. RUN SAVE MANAGER (AUTO-GUARDADO INSTANTÁNEO POR SALA - "MODO COLECTIVO")
// ----------------------------------------------------------------------------
const SUSPENDED_RUN_STORAGE_KEY = 'ROGUE_SUSPENDED_RUN_V1';

class RunSaveManagerClass {
  constructor() {
    this.isRestoring = false;
  }
  save(gameInstance) {
    if (this.isRestoring) return;
    if (!gameInstance || !gameInstance.player || gameInstance.state !== 'PLAYING') return;
    if (gameInstance.player.hp <= 0) {
      this.clear();
      return;
    }

    try {
      const p = gameInstance.player;
      const r = gameInstance.currentRoom;
      const f = gameInstance.currentFloor;

      const data = {
        timestamp: Date.now(),
        section: gameInstance.currentSection,
        level: gameInstance.currentLevel,
        ngPlusLevel: typeof ngPlusLevel !== 'undefined' ? ngPlusLevel : 0,
        isMortalMode: typeof isMortalMode !== 'undefined' ? isMortalMode : false,
        roomGridX: r ? r.gridX : 0,
        roomGridY: r ? r.gridY : 0,
        player: {
          hp: p.hp,
          maxHp: p.maxHp,
          coins: p.coins,
          keys: p.keys,
          shield: p.shield,
          archetype: p.archetype || 'classic',
          elementalPool: p.elementalPool || {},
          hasUsedAbyssalRevive: Boolean(p.hasUsedAbyssalRevive),
          relics: p.itemManager && Array.isArray(p.itemManager.ownedRelics)
            ? p.itemManager.ownedRelics.map(rel => ({ id: rel.id, level: rel.level || 1 }))
            : []
        },
        brotherEyeState: (typeof BrotherEye !== 'undefined' && typeof BrotherEye.exportSaveState === 'function')
          ? BrotherEye.exportSaveState()
          : null
      };

      localStorage.setItem(SUSPENDED_RUN_STORAGE_KEY, JSON.stringify(data));
      this.updateContinueButtonUI();
    } catch (e) {
      console.warn('Error guardando partida suspendida:', e);
    }
  }

  hasSave() {
    try {
      const raw = localStorage.getItem(SUSPENDED_RUN_STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return Boolean(parsed && parsed.player && parsed.player.hp > 0);
    } catch (e) {
      return false;
    }
  }

  getSaveData() {
    try {
      const raw = localStorage.getItem(SUSPENDED_RUN_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  clear() {
    try {
      localStorage.removeItem(SUSPENDED_RUN_STORAGE_KEY);
      this.updateContinueButtonUI();
    } catch (e) {
      console.warn('Error borrando partida suspendida:', e);
    }
  }

  load(gameInstance) {
    const data = this.getSaveData();
    if (!data || !gameInstance) return false;

    this.isRestoring = true;
    try {
      gameInstance.currentSection = data.section || 1;
      gameInstance.currentLevel = data.level || 1;
      if (typeof ngPlusLevel !== 'undefined') ngPlusLevel = data.ngPlusLevel || 0;
      if (typeof isMortalMode !== 'undefined') isMortalMode = Boolean(data.isMortalMode);

      gameInstance.state = 'PLAYING';
      gameInstance.isPaused = false;

      if (data.brotherEyeState && typeof BrotherEye !== 'undefined' && typeof BrotherEye.importSaveState === 'function') {
        BrotherEye.importSaveState(data.brotherEyeState);
      }

      // Generar piso correspondiente
      const eyeSpawnMult = (typeof BrotherEye !== 'undefined' && BrotherEye.enabled)
        ? BrotherEye.getAdaptiveSpawnMultiplier()
        : 1.0;

      gameInstance.currentFloor = new DungeonFloor(
        gameInstance.currentSection,
        gameInstance.currentLevel,
        CONFIG.ROOMS_PER_FLOOR,
        eyeSpawnMult,
        gameInstance.ui,
        1.0
      );

      // Reconstruir jugador y restaurar atributos
      gameInstance.player = new Player(ROOM_BOUNDS.centerX, ROOM_BOUNDS.centerY, gameInstance.ui);
      const p = gameInstance.player;
      p.maxHp = data.player.maxHp || 100;
      p.hp = Math.min(p.maxHp, data.player.hp || 100);
      p.coins = data.player.coins || 0;
      p.keys = data.player.keys || 0;
      p.shield = data.player.shield || 0;
      p.hasUsedAbyssalRevive = Boolean(data.player.hasUsedAbyssalRevive);
      p.elementalPool = data.player.elementalPool || { FIRE: 0, ICE: 0, LIGHTNING: 0, BLEED: 0, POISON: 0 };

      // Restaurar arquetipo
      if (window.PIG_ARCHETYPES && data.player.archetype) {
        const arch = window.PIG_ARCHETYPES[data.player.archetype] || window.PIG_ARCHETYPES.classic;
        arch.apply(p);
      }

      // Restaurar reliquias
      if (data.player.relics && Array.isArray(data.player.relics)) {
        for (const relData of data.player.relics) {
          const rel = typeof p.itemManager.addRelic === 'function'
            ? p.itemManager.addRelic(relData.id)
            : (typeof p.itemManager.grantSpecificRelic === 'function' ? p.itemManager.grantSpecificRelic(relData.id) : null);
          if (rel && relData.level > 1) {
            rel.level = relData.level;
          }
        }
      }

      // Obtener o situar en la sala correcta
      const targetRoom = gameInstance.currentFloor.getRoom(data.roomGridX || 0, data.roomGridY || 0) || gameInstance.currentFloor.getRoom(0, 0);
      gameInstance.currentRoom = targetRoom;
      targetRoom.visited = true;

      // Ocultar menú y sincronizar UI
      const mainMenu = document.getElementById('main-menu');
      if (mainMenu) {
        mainMenu.classList.add('hidden');
        mainMenu.style.display = 'none';
      }
      const appShell = document.getElementById('app-shell');
      if (appShell) {
        appShell.classList.remove('hidden');
        appShell.style.display = 'flex';
      }

      if (typeof stopIntroMusic === 'function') stopIntroMusic();
      if (typeof musicManager !== 'undefined' && musicManager) musicManager.start();

      gameInstance.ui.setOverlayState('PLAYING');
      gameInstance.ui.updateProgression(gameInstance.currentSection, gameInstance.currentLevel);
      gameInstance.ui.updateHealth(p);
      gameInstance.ui.updateCoins(p.coins);
      gameInstance.ui.updateKeys(p.keys);
      gameInstance.ui.updateStats(p);
      gameInstance.ui.updateElements(p.elementalPool);
      gameInstance.ui.updateRelics(p.itemManager.ownedRelics);
      gameInstance.ui.updateRoomInfo(gameInstance.currentRoom, gameInstance.currentFloor);

      gameInstance.ui.showToast(`▶️ ¡PARTIDA REANUDADA! Sección ${gameInstance.currentSection} - Nivel ${gameInstance.currentLevel}`);
      return true;
    } catch (e) {
      console.error('Error cargando partida:', e);
      this.clear();
      return false;
    } finally {
      this.isRestoring = false;
    }
  }

  updateContinueButtonUI() {
    const btn = document.getElementById('btn-menu-continue');
    const desc = document.getElementById('menu-continue-desc');
    if (!btn) return;

    if (this.hasSave()) {
      const data = this.getSaveData();
      btn.classList.remove('hidden');
      if (desc && data) {
        const archName = (window.PIG_ARCHETYPES && data.player && window.PIG_ARCHETYPES[data.player.archetype]?.name) || 'Cerdito';
        desc.textContent = `Sección ${data.section || 1}-${data.level || 1} • ${archName} • ${data.player.hp} HP`;
      }
    } else {
      btn.classList.add('hidden');
    }
  }
}

const RunSaveManager = new RunSaveManagerClass();
window.RunSaveManager = RunSaveManager;

// Inicialización de evento DOM al cargar la página
document.addEventListener('DOMContentLoaded', () => {
  RunSaveManager.updateContinueButtonUI();
});
