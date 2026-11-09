/**
 * ============================================================================
 * MOBILE_CONTROLS.JS - CONTROLADOR TÁCTIL TWIN-STICK ROGUELIKE (v2.6)
 * ============================================================================
 * Proporciona:
 * 1. Joystick Dinámico Flotante de Movimiento (Pulgar Izquierdo, 360° analógico).
 * 2. Joystick de Apuntado + Disparo Continuo (Pulgar Derecho) con Auto-Apuntado Asistido inteligente.
 * 3. Botones táctiles arcade de alta respuesta: Dash [SHIFT], Modo de Arma [ESPACIO],
 *    Cambio de Arma [Q/E] e Interacción Contextual inteligente [E] (Cofres, Tienda, Yunque, Puertas).
 * 4. Bloqueo de Orientación Horizontal (Landscape API) + Pausa automática al rotar a vertical.
 * 5. Barra rápida móvil: Pausa [ESC], Mochila de Reliquias [TAB] y Pantalla Completa.
 * 
 * Regla de Oro: Cero llamadas a ctx.fillText / ctx.strokeText. Todo UI es DOM/SVG.
 */

(function () {
  'use strict';

  // --------------------------------------------------------------------------
  // 1. ESTADO GLOBAL DE ENTRADA MÓVIL
  // --------------------------------------------------------------------------
  const mobileState = {
    active: true,
    moveVector: { x: 0, y: 0, length: 0 },
    aimState: {
      active: false,
      aimX: 1,
      aimY: 0,
      aimAngle: 0,
      isAttacking: false,
      isAutoAim: false,
    },
    dodgeRequested: false,
    autoAimEnabled: true,
  };
  window.mobileTouchControls = mobileState;

  // Parámetros de sensibilidad y zona muerta
  const JOYSTICK_MAX_RADIUS = 42;
  const AIM_DEADZONE = 10;
  const AUTO_AIM_SCAN_RADIUS = 750;

  // Variables de toque para tracking multitáctil
  let moveTouchId = null;
  let moveOrigin = { x: 0, y: 0 };

  let aimTouchId = null;
  let aimOrigin = { x: 0, y: 0 };
  let isAimPressed = false;
  let aimDragged = false;

  // --------------------------------------------------------------------------
  // 2. DETECCIÓN Y BLOQUEO DE ORIENTACIÓN HORIZONTAL (LANDSCAPE)
  // --------------------------------------------------------------------------
  function checkOrientation() {
    const rotateOverlay = document.getElementById('mobile-rotate-overlay');
    if (!rotateOverlay) return;

    const isPortrait = window.innerHeight > window.innerWidth ||
      (window.screen && window.screen.orientation && window.screen.orientation.type && window.screen.orientation.type.startsWith('portrait'));

    if (isPortrait) {
      rotateOverlay.classList.remove('hidden');
      rotateOverlay.style.display = 'flex';
      // Pausa automática de cortesía para no morir al girar el teléfono
      if (window.activeGameInstance && !window.activeGameInstance.isPaused && window.activeGameInstance.player && window.activeGameInstance.player.hp > 0) {
        window.activeGameInstance.togglePause(true);
      }
    } else {
      rotateOverlay.classList.add('hidden');
      rotateOverlay.style.display = 'none';
    }
  }

  async function requestFullscreenAndLandscape() {
    try {
      const docEl = document.documentElement;
      if (docEl.requestFullscreen) {
        await docEl.requestFullscreen();
      } else if (docEl.webkitRequestFullscreen) {
        await docEl.webkitRequestFullscreen();
      }

      if (window.screen && window.screen.orientation && window.screen.orientation.lock) {
        await window.screen.orientation.lock('landscape').catch(() => {
          // Algunos navegadores móviles no permiten screen.orientation sin PWA instalada
        });
      }
    } catch (err) {
      console.warn('Pantalla completa / Landscape:', err);
    }
    checkOrientation();
  }

  // --------------------------------------------------------------------------
  // 3. AUTO-APUNTADO INTELIGENTE (SMART AUTO-AIM ASSIST)
  // --------------------------------------------------------------------------
  function findClosestTarget(player, room) {
    if (!player || !room || !room.enemies || room.enemies.length === 0) return null;

    let closest = null;
    let minDistSq = AUTO_AIM_SCAN_RADIUS * AUTO_AIM_SCAN_RADIUS;

    for (let i = 0; i < room.enemies.length; i++) {
      const enemy = room.enemies[i];
      if (!enemy || enemy.hp <= 0) continue;

      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      const distSq = dx * dx + dy * dy;

      if (distSq < minDistSq) {
        minDistSq = distSq;
        closest = enemy;
      }
    }

    return closest;
  }

  function updateAimAssist(player, room) {
    if (!isAimPressed) {
      if (!aimDragged) {
        mobileState.aimState.active = false;
        mobileState.aimState.isAttacking = false;
      }
      return;
    }

    // Si el jugador está arrastrando el stick derecho más allá de la zona muerta, manda el apuntado manual
    if (aimDragged) {
      mobileState.aimState.active = true;
      mobileState.aimState.isAttacking = true;
      return;
    }

    // Si solo mantiene pulsado el botón de disparo sin arrastrar: AUTO-AIM INTELIGENTE
    if (mobileState.autoAimEnabled && player && room) {
      const target = findClosestTarget(player, room);
      if (target) {
        const dx = target.x - player.x;
        const dy = target.y - player.y;
        const angle = Math.atan2(dy, dx);
        mobileState.aimState.active = true;
        mobileState.aimState.isAttacking = true;
        mobileState.aimState.aimAngle = angle;
        mobileState.aimState.aimX = Math.cos(angle);
        mobileState.aimState.aimY = Math.sin(angle);
        mobileState.aimState.isAutoAim = true;

        // Feedback visual en el botón de apuntado
        const knobAim = document.getElementById('mobile-stick-knob-aim');
        if (knobAim) {
          const fx = Math.cos(angle) * 16;
          const fy = Math.sin(angle) * 16;
          knobAim.style.transform = `translate(${fx}px, ${fy}px)`;
        }
        return;
      }
    }

    // Si no hay enemigos en rango, dispara hacia donde mira o camina el jugador
    mobileState.aimState.active = true;
    mobileState.aimState.isAttacking = true;
    mobileState.aimState.isAutoAim = false;
  }

  // --------------------------------------------------------------------------
  // 4. INICIALIZACIÓN DE ELEMENTOS Y EVENTOS TÁCTILES
  // --------------------------------------------------------------------------
  function initMobileControls() {
    const leftZone = document.getElementById('mobile-zone-left');
    const baseMove = document.getElementById('mobile-stick-base-move');
    const knobMove = document.getElementById('mobile-stick-knob-move');

    const rightAimBase = document.getElementById('mobile-stick-base-aim');
    const knobAim = document.getElementById('mobile-stick-knob-aim');

    const btnDodge = document.getElementById('btn-touch-dodge');
    const btnMode = document.getElementById('btn-touch-mode');
    const btnSwap = document.getElementById('btn-touch-swap');
    const btnInteract = document.getElementById('btn-touch-interact');

    const btnPause = document.getElementById('btn-touch-pause');
    const btnBackpack = document.getElementById('btn-touch-tab');
    const btnFullscreen = document.getElementById('btn-touch-fullscreen');

    const entryGate = document.getElementById('mobile-fullscreen-entry');
    const btnEnterFullscreen = document.getElementById('btn-mobile-enter-fullscreen');
    const btnEnterWindowed = document.getElementById('btn-mobile-enter-windowed');

    // Portal de bienvenida táctil
    if (btnEnterFullscreen) {
      btnEnterFullscreen.addEventListener('click', async (e) => {
        e.preventDefault();
        await requestFullscreenAndLandscape();
        if (entryGate) {
          entryGate.classList.add('hidden');
          entryGate.style.display = 'none';
        }
      });
    }

    if (btnEnterWindowed) {
      btnEnterWindowed.addEventListener('click', (e) => {
        e.preventDefault();
        checkOrientation();
        if (entryGate) {
          entryGate.classList.add('hidden');
          entryGate.style.display = 'none';
        }
      });
    }

    // Botón de pantalla completa en HUD móvil
    if (btnFullscreen) {
      btnFullscreen.addEventListener('click', (e) => {
        e.preventDefault();
        requestFullscreenAndLandscape();
      });
    }

    // Botón de Pausa Móvil
    if (btnPause) {
      btnPause.addEventListener('click', (e) => {
        e.preventDefault();
        if (window.activeGameInstance) {
          window.activeGameInstance.togglePause();
        }
      });
    }

    // Botón de Mochila / Estadísticas / 75 Reliquias [TAB]
    if (btnBackpack) {
      btnBackpack.addEventListener('click', (e) => {
        e.preventDefault();
        const tabOverlay = document.getElementById('tab-overlay');
        if (tabOverlay) {
          if (tabOverlay.classList.contains('hidden')) {
            tabOverlay.classList.remove('hidden');
            if (window.activeGameInstance && window.activeGameInstance.player) {
              window.activeGameInstance.updateTabOverlay(window.activeGameInstance.player);
            }
          } else {
            tabOverlay.classList.add('hidden');
          }
        }
      });
    }

    // Botón de Altura de Controles Táctiles (Media -> Alta Tablet -> Baja)
    const btnPos = document.getElementById('btn-touch-pos');
    const controlsRight = document.getElementById('mobile-controls-right');
    const posLabel = document.getElementById('touch-pos-label');

    const POSITIONS = ['mid', 'high', 'low'];
    const POS_LABELS = {
      mid: 'ALTURA: MEDIA',
      high: 'ALTURA: ALTA (TABLET)',
      low: 'ALTURA: BAJA',
    };

    let currentPos = localStorage.getItem('mobile_controls_height') || 'mid';
    function applyControlsHeight(pos) {
      currentPos = pos;
      localStorage.setItem('mobile_controls_height', pos);
      if (controlsRight) {
        controlsRight.classList.remove('pos-low', 'pos-mid', 'pos-high');
        controlsRight.classList.add(`pos-${pos}`);
      }
      if (posLabel) {
        posLabel.textContent = POS_LABELS[pos] || 'ALTURA: MEDIA';
      }
    }
    applyControlsHeight(currentPos);

    if (btnPos) {
      btnPos.addEventListener('click', (e) => {
        e.preventDefault();
        const nextIdx = (POSITIONS.indexOf(currentPos) + 1) % POSITIONS.length;
        applyControlsHeight(POSITIONS[nextIdx]);
        if (navigator.vibrate) navigator.vibrate(20);
      });
    }

    // Botón de Esquiva / Dash
    if (btnDodge) {
      const handleDodge = (e) => {
        e.preventDefault();
        e.stopPropagation();
        mobileState.dodgeRequested = true;
        btnDodge.classList.add('active');
        if (navigator.vibrate) navigator.vibrate(25);
        setTimeout(() => btnDodge.classList.remove('active'), 140);
      };
      btnDodge.addEventListener('touchstart', handleDodge, { passive: false });
      btnDodge.addEventListener('mousedown', handleDodge);
    }

    // Botón de Modo de Arma [ESPACIO]
    if (btnMode) {
      const handleMode = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.activeGameInstance) {
          window.activeGameInstance.handleWeaponModeToggle();
        }
        btnMode.classList.add('active');
        if (navigator.vibrate) navigator.vibrate(20);
        setTimeout(() => btnMode.classList.remove('active'), 140);
      };
      btnMode.addEventListener('touchstart', handleMode, { passive: false });
      btnMode.addEventListener('mousedown', handleMode);
    }

    // Botón de Cambiar Arma [Q / E]
    if (btnSwap) {
      const handleSwap = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.activeGameInstance) {
          window.activeGameInstance.handleWeaponSelect('next');
        }
        btnSwap.classList.add('active');
        if (navigator.vibrate) navigator.vibrate(15);
        setTimeout(() => btnSwap.classList.remove('active'), 140);
      };
      btnSwap.addEventListener('touchstart', handleSwap, { passive: false });
      btnSwap.addEventListener('mousedown', handleSwap);
    }

    // Botón Contextual de Interacción [E]
    if (btnInteract) {
      const handleInteract = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.activeGameInstance) {
          window.activeGameInstance.tryInteract();
        }
        btnInteract.classList.add('active');
        if (navigator.vibrate) navigator.vibrate(30);
        setTimeout(() => btnInteract.classList.remove('active'), 140);
      };
      btnInteract.addEventListener('touchstart', handleInteract, { passive: false });
      btnInteract.addEventListener('mousedown', handleInteract);
    }

    // ------------------------------------------------------------------------
    // JOYSTICK IZQUIERDO: MOVIMIENTO DINÁMICO FLOTANTE
    // ------------------------------------------------------------------------
    if (leftZone && baseMove && knobMove) {
      leftZone.addEventListener('touchstart', (e) => {
        if (moveTouchId !== null) return;
        const touch = e.changedTouches[0];
        moveTouchId = touch.identifier;
        moveOrigin = { x: touch.clientX, y: touch.clientY };

        baseMove.style.left = `${touch.clientX}px`;
        baseMove.style.top = `${touch.clientY}px`;
        baseMove.classList.add('visible');
        knobMove.style.transform = 'translate(0px, 0px)';
      }, { passive: false });

      const onTouchMove = (e) => {
        if (moveTouchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          const touch = e.changedTouches[i];
          if (touch.identifier === moveTouchId) {
            const dx = touch.clientX - moveOrigin.x;
            const dy = touch.clientY - moveOrigin.y;
            const dist = Math.hypot(dx, dy);

            if (dist === 0) {
              mobileState.moveVector = { x: 0, y: 0, length: 0 };
              knobMove.style.transform = 'translate(0px, 0px)';
            } else {
              const clampedDist = Math.min(dist, JOYSTICK_MAX_RADIUS);
              const nx = dx / dist;
              const ny = dy / dist;
              const kx = nx * clampedDist;
              const ky = ny * clampedDist;

              knobMove.style.transform = `translate(${kx}px, ${ky}px)`;
              mobileState.moveVector = {
                x: nx,
                y: ny,
                length: clampedDist / JOYSTICK_MAX_RADIUS,
              };
            }
            e.preventDefault();
            break;
          }
        }
      };

      const onTouchEnd = (e) => {
        if (moveTouchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === moveTouchId) {
            moveTouchId = null;
            baseMove.classList.remove('visible');
            knobMove.style.transform = 'translate(0px, 0px)';
            mobileState.moveVector = { x: 0, y: 0, length: 0 };
            break;
          }
        }
      };

      window.addEventListener('touchmove', onTouchMove, { passive: false });
      window.addEventListener('touchend', onTouchEnd, { passive: false });
      window.addEventListener('touchcancel', onTouchEnd, { passive: false });
    }

    // ------------------------------------------------------------------------
    // JOYSTICK DERECHO: APUNTADO ANALÓGICO + DISPARO + AUTO-AIM
    // ------------------------------------------------------------------------
    if (rightAimBase && knobAim) {
      rightAimBase.addEventListener('touchstart', (e) => {
        if (aimTouchId !== null) return;
        const touch = e.changedTouches[0];
        aimTouchId = touch.identifier;

        const rect = rightAimBase.getBoundingClientRect();
        aimOrigin = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };

        isAimPressed = true;
        aimDragged = false;
        rightAimBase.classList.add('active');

        // Al tocar, activa disparo con auto-aim inmediato
        const game = window.activeGameInstance;
        if (game) {
          updateAimAssist(game.player, game.currentRoom);
        }
      }, { passive: false });

      const onAimMove = (e) => {
        if (aimTouchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          const touch = e.changedTouches[i];
          if (touch.identifier === aimTouchId) {
            const dx = touch.clientX - aimOrigin.x;
            const dy = touch.clientY - aimOrigin.y;
            const dist = Math.hypot(dx, dy);

            if (dist > AIM_DEADZONE) {
              aimDragged = true;
              const clampedDist = Math.min(dist, JOYSTICK_MAX_RADIUS);
              const angle = Math.atan2(dy, dx);
              const kx = Math.cos(angle) * clampedDist;
              const ky = Math.sin(angle) * clampedDist;

              knobAim.style.transform = `translate(${kx}px, ${ky}px)`;
              mobileState.aimState.active = true;
              mobileState.aimState.isAttacking = true;
              mobileState.aimState.aimAngle = angle;
              mobileState.aimState.aimX = Math.cos(angle);
              mobileState.aimState.aimY = Math.sin(angle);
              mobileState.aimState.isAutoAim = false;
            } else {
              aimDragged = false;
              const game = window.activeGameInstance;
              if (game) {
                updateAimAssist(game.player, game.currentRoom);
              }
            }
            e.preventDefault();
            break;
          }
        }
      };

      const onAimEnd = (e) => {
        if (aimTouchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === aimTouchId) {
            aimTouchId = null;
            isAimPressed = false;
            aimDragged = false;
            rightAimBase.classList.remove('active');
            knobAim.style.transform = 'translate(0px, 0px)';
            mobileState.aimState.isAttacking = false;
            mobileState.aimState.active = false;
            break;
          }
        }
      };

      window.addEventListener('touchmove', onAimMove, { passive: false });
      window.addEventListener('touchend', onAimEnd, { passive: false });
      window.addEventListener('touchcancel', onAimEnd, { passive: false });
    }

    // ------------------------------------------------------------------------
    // BUCLE DE ACTUALIZACIÓN DEL HUD MÓVIL (60 FPS)
    // ------------------------------------------------------------------------
    function updateMobileHudLoop() {
      const game = window.activeGameInstance;
      if (game && game.player) {
        // 1. Mantener auto-aim actualizado si el jugador sostiene el botón
        if (isAimPressed && !aimDragged) {
          updateAimAssist(game.player, game.currentRoom);
        }

        // 2. Actualizar estado del botón de Esquiva
        if (btnDodge) {
          const dodgePipCount = document.getElementById('touch-dodge-charges');
          if (dodgePipCount) {
            dodgePipCount.textContent = String(game.player.dodgeCharges || 0);
          }
          if (game.player.dodgeCharges <= 0) {
            btnDodge.classList.add('depleted');
          } else {
            btnDodge.classList.remove('depleted');
          }
        }

        // 3. Actualizar botón Contextual de Interacción [E]
        if (btnInteract && game.currentRoom) {
          const interactable = game.currentRoom.currentInteractable;
          if (interactable && typeof interactable.interact === 'function') {
            btnInteract.classList.remove('hidden');
            btnInteract.classList.add('pulse');
            const lbl = document.getElementById('touch-interact-label');
            if (lbl) {
              const type = interactable.type || '';
              if (type === 'VAULT_CHEST' || type === 'LOCKED_CHEST') {
                lbl.textContent = 'ABRIR COFRE';
              } else if (type === 'DOOR') {
                lbl.textContent = 'ABRIR PUERTA';
              } else if (type === 'CHALLENGE_MONOLITH') {
                lbl.textContent = 'INICIAR RETO';
              } else if (type === 'TRANSMUTATION_ANVIL') {
                lbl.textContent = 'USAR YUNQUE';
              } else if (type === 'SHOP_ITEM') {
                lbl.textContent = 'COMPRAR ITEM';
              } else if (type === 'BRIEFCASE') {
                lbl.textContent = 'RECOGER BOTÍN';
              } else {
                lbl.textContent = 'INTERACTUAR';
              }
            }
          } else {
            btnInteract.classList.add('hidden');
            btnInteract.classList.remove('pulse');
          }
        }

        // 4. Actualizar etiqueta del modo de arma actual
        if (btnMode) {
          const modeTag = document.getElementById('touch-weapon-mode-tag');
          if (modeTag && game.player.currentWeapon) {
            const w = game.player.currentWeapon;
            const mode = w.currentMode || 'NORMAL';
            modeTag.textContent = mode.toUpperCase();
          }
        }
      }

      requestAnimationFrame(updateMobileHudLoop);
    }
    requestAnimationFrame(updateMobileHudLoop);

    // Escuchar cambios de orientación y resize
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    checkOrientation();
  }

  // Ejecutar cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileControls);
  } else {
    initMobileControls();
  }
})();
