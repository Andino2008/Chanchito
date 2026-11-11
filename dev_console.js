/**
 * ============================================================================
 * DEV_CONSOLE.JS - CONSOLA DE DIAGNÓSTICO, BROTHER EYE Y EDITOR DE SALAS [F2]
 * ============================================================================
 * Proporciona una consola dentro del juego accesible mediante un botón en el HUD
 * o con la tecla [F2] / [º] / [~].
 *
 * Funciones principales:
 *  1. Captura en tiempo real de errores (window.onerror, console.error, try/catch
 *     de entidades) para que nunca más un fallo congele silenciosamente la sala.
 *  2. Monitor en vivo de BrotherEye (Estados -1 al 4, ecuación R, DTPS, Dados
 *     de Ruido, racha de Dios y modificadores aplicados sala por sala).
 *  3. Herramientas de rescate instantáneo (Rescatar jugador fuera del mapa,
 *     limpiar proyectiles, forzar subidón "Pies en la Tierra", ejecutar JS).
 *  4. Editor Visual de Salas (13x9) y Secciones de Autor (v3.0): permite dibujar
 *     salas con rocas, fosos, trampas y enemigos, probarlas en vivo en la
 *     habitación actual, guardarlas en el catálogo local y exportar el código JS
 *     para `level_templates.js`.
 *
 * REGLA INVIOLABLE: 100% DOM HTML/CSS. Cero llamadas de texto en Canvas.
 * ============================================================================
 */

(function (root) {
  var MAX_LOGS = 120;

  var EDITOR_BRUSHES = [
    { symbol: '.', label: '. Piso', desc: 'Piso libre', color: '#1e293b', text: '#94a3b8' },
    { symbol: '#', label: '# Roca', desc: 'Muro / Roca destructible', color: '#475569', text: '#f8fafc' },
    { symbol: 'O', label: 'O Vasija', desc: 'Vasija con botín', color: '#b45309', text: '#fef3c7' },
    { symbol: '~', label: '~ Foso', desc: 'Abismo intransitable (Saltable con Dash)', color: '#020617', text: '#38bdf8' },
    { symbol: '^', label: '^ Pinchos', desc: 'Trampa de Pinchos rítmica', color: '#7f1d1d', text: '#fca5a5' },
    { symbol: '*', label: '* Fuego', desc: 'Zona de Fuego continuo', color: '#9a3412', text: '#fdba74' },
    { symbol: '%', label: '% Veneno', desc: 'Charco Venenoso (Slow 50%)', color: '#14532d', text: '#86efac' },
    { symbol: 'S', label: 'S Francot.', desc: 'ShooterEnemy (Distancia)', color: '#581c87', text: '#e9d5ff' },
    { symbol: 'C', label: 'C Charger', desc: 'ChargerEnemy (Embestida)', color: '#991b1b', text: '#fecaca' },
    { symbol: 'F', label: 'F Volador', desc: 'FlyerEnemy (Vuela sobre fosos)', color: '#0c4a6e', text: '#bae6fd' },
    { symbol: 'P', label: 'P Splitter', desc: 'SplitterEnemy (Se divide)', color: '#134e4a', text: '#99f6e4' },
    { symbol: 'E', label: 'E Básico', desc: 'Enemigo cuerpo a cuerpo', color: '#831843', text: '#fbcfe8' },
    { symbol: 'X', label: 'X Élite', desc: 'Minijefe EliteEnemy', color: '#713f12', text: '#fde047' },
    { symbol: '?', label: '? Random', desc: 'Enemigo aleatorio en este punto', color: '#312e81', text: '#c7d2fe' }
  ];

  function getBrushMeta(symbol) {
    for (var i = 0; i < EDITOR_BRUSHES.length; i++) {
      if (EDITOR_BRUSHES[i].symbol === symbol) return EDITOR_BRUSHES[i];
    }
    return EDITOR_BRUSHES[0];
  }

  function InGameDevConsole() {
    this.isOpen = false;
    this.activeTab = 'BROTHER_EYE'; // 'BROTHER_EYE' | 'LEVEL_EDITOR' | 'LOGS' | 'TOOLS'
    this.logs = [];
    this.errorCount = 0;
    this.warnCount = 0;
    this.refreshTimer = null;

    // Estado del Editor de Salas 13x9
    this.editorState = {
      id: 'MI_SALA_AUTOR',
      name: 'Sala Personalizada',
      sectionTag: 'AUTOR',
      selectedBrush: '#',
      isMouseDown: false,
      grid: [
        '.............',
        '.S..#...#..S.',
        '....O...O....',
        '.............',
        '...##...##...',
        '.............',
        '....O...O....',
        '.C..#...#..C.',
        '.............'
      ]
    };

    this.initDOM();
    this.hookGlobalErrors();
    this.hookBrotherEye();

    this.log('INFO', 'Consola v3.0 inicializada. Presiona [F2] para abrir BrotherEye o el Editor de Salas (13x9).');
  }

  InGameDevConsole.prototype.initDOM = function () {
    var self = this;

    // 1. Inyectar estilos CSS de la consola y del Editor 13x9
    var style = document.createElement('style');
    style.id = 'dev-console-styles';
    style.textContent = [
      '.dev-console-toggle-btn {',
      '  position: fixed;',
      '  top: 12px;',
      '  left: 50%;',
      '  transform: translateX(-50%);',
      '  z-index: 2500;',
      '  background: rgba(9, 15, 29, 0.92);',
      '  border: 1px solid rgba(56, 189, 248, 0.55);',
      '  color: #38bdf8;',
      '  font-family: var(--font-mono, monospace);',
      '  font-size: 0.72rem;',
      '  font-weight: 800;',
      '  letter-spacing: 0.8px;',
      '  padding: 5px 14px;',
      '  border-radius: 999px;',
      '  cursor: pointer;',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 8px;',
      '  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.75);',
      '  backdrop-filter: blur(8px);',
      '  transition: all 0.18s ease;',
      '}',
      '.dev-console-toggle-btn:hover {',
      '  background: rgba(15, 23, 42, 0.98);',
      '  border-color: #7dd3fc;',
      '  color: #ffffff;',
      '  box-shadow: 0 0 20px rgba(56, 189, 248, 0.5);',
      '}',
      '.dev-console-toggle-btn.has-error {',
      '  border-color: #ef4444;',
      '  color: #fca5a5;',
      '  background: rgba(69, 10, 10, 0.92);',
      '  animation: devErrPulse 1s infinite alternate;',
      '}',
      '@keyframes devErrPulse {',
      '  from { box-shadow: 0 0 10px rgba(239, 68, 68, 0.4); }',
      '  to { box-shadow: 0 0 24px rgba(239, 68, 68, 0.95); }',
      '}',
      '.dev-console-badge {',
      '  background: rgba(56, 189, 248, 0.2);',
      '  border: 1px solid rgba(56, 189, 248, 0.45);',
      '  padding: 1px 6px;',
      '  border-radius: 999px;',
      '  font-size: 0.66rem;',
      '  color: #e0f2fe;',
      '}',
      '.dev-console-badge.err {',
      '  background: #dc2626;',
      '  border-color: #fca5a5;',
      '  color: #fff;',
      '}',
      '.dev-console-modal {',
      '  position: fixed;',
      '  top: 44px;',
      '  left: 50%;',
      '  transform: translateX(-50%);',
      '  width: 920px;',
      '  max-width: 96vw;',
      '  max-height: 86vh;',
      '  background: rgba(6, 10, 20, 0.96);',
      '  border: 1.5px solid rgba(56, 189, 248, 0.55);',
      '  border-radius: 12px;',
      '  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.95), 0 0 35px rgba(56, 189, 248, 0.22);',
      '  z-index: 2500;',
      '  display: flex;',
      '  flex-direction: column;',
      '  overflow: hidden;',
      '  font-family: var(--font-mono, monospace);',
      '  color: #f8fafc;',
      '  backdrop-filter: blur(16px);',
      '}',
      '.dev-console-modal.hidden {',
      '  display: none !important;',
      '}',
      '.dev-console-header {',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: space-between;',
      '  padding: 10px 16px;',
      '  background: linear-gradient(90deg, rgba(15, 23, 42, 0.95), rgba(12, 19, 34, 0.95));',
      '  border-bottom: 1px solid #1e293b;',
      '  flex-wrap: wrap;',
      '  gap: 8px;',
      '}',
      '.dev-console-tabs {',
      '  display: flex;',
      '  gap: 6px;',
      '  flex-wrap: wrap;',
      '}',
      '.dev-tab-btn {',
      '  background: rgba(15, 23, 42, 0.8);',
      '  border: 1px solid #334155;',
      '  color: #94a3b8;',
      '  padding: 5px 11px;',
      '  border-radius: 6px;',
      '  font-family: inherit;',
      '  font-size: 0.72rem;',
      '  font-weight: 800;',
      '  cursor: pointer;',
      '  transition: all 0.15s ease;',
      '}',
      '.dev-tab-btn.active {',
      '  background: rgba(56, 189, 248, 0.18);',
      '  border-color: #38bdf8;',
      '  color: #38bdf8;',
      '  box-shadow: 0 0 12px rgba(56, 189, 248, 0.25);',
      '}',
      '.dev-console-body {',
      '  padding: 12px 16px;',
      '  overflow-y: auto;',
      '  flex: 1;',
      '  display: flex;',
      '  flex-direction: column;',
      '  gap: 10px;',
      '  max-height: 68vh;',
      '}',
      '.eye-grid {',
      '  display: grid;',
      '  grid-template-columns: repeat(3, 1fr);',
      '  gap: 10px;',
      '}',
      '.eye-card {',
      '  background: rgba(15, 23, 42, 0.78);',
      '  border: 1px solid #1e293b;',
      '  border-radius: 8px;',
      '  padding: 10px 12px;',
      '  display: flex;',
      '  flex-direction: column;',
      '  gap: 5px;',
      '}',
      '.eye-card-title {',
      '  font-size: 0.68rem;',
      '  font-weight: 900;',
      '  color: #38bdf8;',
      '  letter-spacing: 0.8px;',
      '  text-transform: uppercase;',
      '  border-bottom: 1px solid rgba(51, 65, 85, 0.5);',
      '  padding-bottom: 4px;',
      '  margin-bottom: 2px;',
      '}',
      '.eye-kv {',
      '  display: flex;',
      '  justify-content: space-between;',
      '  font-size: 0.72rem;',
      '  color: #cbd5e1;',
      '}',
      '.eye-kv strong {',
      '  color: #f8fafc;',
      '}',
      '.eye-regime-pill {',
      '  display: inline-block;',
      '  padding: 2px 8px;',
      '  border-radius: 4px;',
      '  font-size: 0.72rem;',
      '  font-weight: 900;',
      '}',
      '.regime-EQUILIBRIO { background: rgba(56, 189, 248, 0.2); color: #38bdf8; border: 1px solid #38bdf8; }',
      '.regime-ACOMPANAR { background: rgba(250, 204, 21, 0.2); color: #facc15; border: 1px solid #facc15; }',
      '.regime-PIES { background: rgba(239, 68, 68, 0.28); color: #fca5a5; border: 1px solid #ef4444; }',
      '.regime-ALIVIO { background: rgba(74, 222, 128, 0.2); color: #4ade80; border: 1px solid #4ade80; }',
      '.dev-log-list {',
      '  display: flex;',
      '  flex-direction: column;',
      '  gap: 4px;',
      '  font-size: 0.72rem;',
      '  background: rgba(3, 7, 18, 0.85);',
      '  border: 1px solid #1e293b;',
      '  border-radius: 6px;',
      '  padding: 8px 10px;',
      '  max-height: 46vh;',
      '  overflow-y: auto;',
      '}',
      '.dev-log-item {',
      '  padding: 3px 6px;',
      '  border-radius: 4px;',
      '  border-left: 3px solid #38bdf8;',
      '  word-break: break-word;',
      '  line-height: 1.35;',
      '}',
      '.dev-log-item.WARN { border-left-color: #facc15; background: rgba(250, 204, 21, 0.08); color: #fef08a; }',
      '.dev-log-item.ERROR { border-left-color: #ef4444; background: rgba(239, 68, 68, 0.14); color: #fecaca; font-weight: 700; }',
      '.dev-log-item.EYE { border-left-color: #c084fc; background: rgba(192, 132, 252, 0.08); color: #e9d5ff; }',
      '.dev-tools-grid {',
      '  display: grid;',
      '  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));',
      '  gap: 10px;',
      '}',
      '.dev-tool-btn {',
      '  background: rgba(17, 28, 48, 0.9);',
      '  border: 1px solid rgba(56, 189, 248, 0.4);',
      '  color: #f8fafc;',
      '  padding: 10px 12px;',
      '  border-radius: 8px;',
      '  font-family: inherit;',
      '  font-size: 0.74rem;',
      '  font-weight: 800;',
      '  cursor: pointer;',
      '  text-align: left;',
      '  display: flex;',
      '  flex-direction: column;',
      '  gap: 3px;',
      '  transition: all 0.15s ease;',
      '}',
      '.dev-tool-btn:hover {',
      '  background: rgba(56, 189, 248, 0.18);',
      '  border-color: #38bdf8;',
      '  transform: translateY(-1px);',
      '}',
      '.dev-tool-btn small {',
      '  font-size: 0.65rem;',
      '  color: #94a3b8;',
      '  font-weight: 400;',
      '}',
      '.dev-cmd-row {',
      '  display: flex;',
      '  gap: 8px;',
      '  padding: 10px 16px;',
      '  background: rgba(9, 15, 29, 0.95);',
      '  border-top: 1px solid #1e293b;',
      '}',
      '.dev-cmd-input {',
      '  flex: 1;',
      '  background: #030712;',
      '  border: 1px solid #334155;',
      '  color: #38bdf8;',
      '  padding: 6px 10px;',
      '  border-radius: 6px;',
      '  font-family: inherit;',
      '  font-size: 0.74rem;',
      '  outline: none;',
      '}',
      '.dev-cmd-input:focus { border-color: #38bdf8; }',
      /* Estilos del Editor de Salas 13x9 */
      '.lvl-editor-layout {',
      '  display: grid;',
      '  grid-template-columns: 1fr 290px;',
      '  gap: 12px;',
      '  align-items: start;',
      '}',
      '@media (max-width: 780px) {',
      '  .lvl-editor-layout { grid-template-columns: 1fr; }',
      '}',
      '.lvl-brush-bar {',
      '  display: flex;',
      '  flex-wrap: wrap;',
      '  gap: 5px;',
      '  margin-bottom: 8px;',
      '}',
      '.lvl-brush-btn {',
      '  border: 1px solid #334155;',
      '  border-radius: 5px;',
      '  padding: 4px 8px;',
      '  font-family: inherit;',
      '  font-size: 0.68rem;',
      '  font-weight: 800;',
      '  cursor: pointer;',
      '  transition: transform 0.1s ease, box-shadow 0.1s ease;',
      '}',
      '.lvl-brush-btn.selected {',
      '  outline: 2px solid #38bdf8;',
      '  box-shadow: 0 0 12px rgba(56, 189, 248, 0.65);',
      '  transform: translateY(-1px);',
      '}',
      '.lvl-grid-board {',
      '  display: grid;',
      '  grid-template-columns: repeat(13, 1fr);',
      '  gap: 3px;',
      '  background: #050811;',
      '  padding: 8px;',
      '  border: 2px solid #334155;',
      '  border-radius: 8px;',
      '  user-select: none;',
      '}',
      '.lvl-grid-cell {',
      '  aspect-ratio: 1.25 / 1;',
      '  min-height: 26px;',
      '  border: 1px solid rgba(148, 163, 184, 0.18);',
      '  border-radius: 4px;',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  font-size: 0.78rem;',
      '  font-weight: 900;',
      '  cursor: pointer;',
      '  position: relative;',
      '}',
      '.lvl-grid-cell:hover {',
      '  border-color: #38bdf8;',
      '  filter: brightness(1.2);',
      '}',
      '.lvl-grid-cell.door-cell {',
      '  box-shadow: inset 0 0 0 1.5px rgba(56, 189, 248, 0.65);',
      '}',
      '.lvl-code-box {',
      '  width: 100%;',
      '  height: 135px;',
      '  background: #030712;',
      '  border: 1px solid #334155;',
      '  border-radius: 6px;',
      '  color: #a7f3d0;',
      '  font-family: inherit;',
      '  font-size: 0.66rem;',
      '  padding: 6px 8px;',
      '  resize: vertical;',
      '}'
    ].join('\n');
    document.head.appendChild(style);

    // 2. Botón flotante para abrir/cerrar la consola
    this.toggleBtn = document.createElement('button');
    this.toggleBtn.id = 'dev-console-toggle-btn';
    this.toggleBtn.className = 'dev-console-toggle-btn';
    this.toggleBtn.type = 'button';
    this.toggleBtn.title = 'Abrir/Cerrar Consola de Diagnóstico, BrotherEye y Editor de Salas (Tecla F2)';
    this.toggleBtn.innerHTML = '<span>💻 CONSOLA [F2]</span><span id="dev-console-badge" class="dev-console-badge">EYE: R=65</span>';
    this.toggleBtn.addEventListener('click', function () {
      self.toggle();
    });
    document.body.appendChild(this.toggleBtn);

    // 3. Modal de la consola
    this.modal = document.createElement('div');
    this.modal.id = 'dev-console-modal';
    this.modal.className = 'dev-console-modal hidden';
    this.modal.innerHTML = [
      '<div class="dev-console-header">',
      '  <div class="dev-console-tabs">',
      '    <button type="button" class="dev-tab-btn active" data-tab="BROTHER_EYE">👁️ BROTHER EYE</button>',
      '    <button type="button" class="dev-tab-btn" data-tab="LEVEL_EDITOR">🗺️ EDITOR DE SALAS (13x9)</button>',
      '    <button type="button" class="dev-tab-btn" data-tab="LOGS">📜 LOGS (<span id="dev-tab-err-count">0</span>)</button>',
      '    <button type="button" class="dev-tab-btn" data-tab="TOOLS">🛠️ HERRAMIENTAS</button>',
      '  </div>',
      '  <button type="button" id="dev-console-close" class="dev-tab-btn" style="border-color:#ef4444;color:#fca5a5;">CERRAR [F2]</button>',
      '</div>',
      '<div id="dev-console-body" class="dev-console-body"></div>',
      '<form id="dev-cmd-form" class="dev-cmd-row">',
      '  <input id="dev-cmd-input" class="dev-cmd-input" type="text" placeholder="Ej: BrotherEye.getStatus() | game.player.hp = 200 | help" autocomplete="off" />',
      '  <button type="submit" class="dev-tab-btn active">EJECUTAR</button>',
      '</form>'
    ].join('\n');
    document.body.appendChild(this.modal);

    window.addEventListener('mouseup', function () {
      self.editorState.isMouseDown = false;
    });

    // Eventos de pestañas
    var tabBtns = this.modal.querySelectorAll('[data-tab]');
    for (var i = 0; i < tabBtns.length; i++) {
      tabBtns[i].addEventListener('click', function (e) {
        var t = e.currentTarget.getAttribute('data-tab');
        self.setTab(t);
      });
    }

    this.modal.querySelector('#dev-console-close').addEventListener('click', function () {
      self.toggle(false);
    });

    this.modal.querySelector('#dev-cmd-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var input = self.modal.querySelector('#dev-cmd-input');
      var cmd = input.value.trim();
      if (!cmd) return;
      input.value = '';
      self.executeCommand(cmd);
    });

    // Atajo de teclado: F2 o tecla º / `
    window.addEventListener('keydown', function (e) {
      if (e.key === 'F2' || e.code === 'Backquote') {
        e.preventDefault();
        self.toggle();
      }
    });
  };

  InGameDevConsole.prototype.toggle = function (forceState) {
    this.isOpen = (typeof forceState === 'boolean') ? forceState : !this.isOpen;
    if (this.isOpen) {
      this.modal.classList.remove('hidden');
      this.render();
      var self = this;
      if (this.refreshTimer) clearInterval(this.refreshTimer);
      this.refreshTimer = setInterval(function () {
        if (self.isOpen && self.activeTab === 'BROTHER_EYE') {
          self.renderBrotherEyeTab();
        }
      }, 300);
    } else {
      this.modal.classList.add('hidden');
      if (this.refreshTimer) {
        clearInterval(this.refreshTimer);
        this.refreshTimer = null;
      }
    }
  };

  InGameDevConsole.prototype.setTab = function (tabName) {
    this.activeTab = tabName;
    var tabBtns = this.modal.querySelectorAll('[data-tab]');
    for (var i = 0; i < tabBtns.length; i++) {
      var btn = tabBtns[i];
      if (btn.getAttribute('data-tab') === tabName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    }
    this.render();
  };

  InGameDevConsole.prototype.log = function (level, message, extra) {
    var now = new Date();
    var ts = now.toTimeString().split(' ')[0];
    var text = typeof message === 'string' ? message : JSON.stringify(message);
    if (extra) {
      text += ' | ' + (extra && extra.stack ? extra.stack.split('\n')[0] : String(extra));
    }

    this.logs.unshift({
      time: ts,
      level: level || 'INFO',
      text: text
    });
    if (this.logs.length > MAX_LOGS) {
      this.logs.pop();
    }

    if (level === 'ERROR') {
      this.errorCount++;
      this.toggleBtn.classList.add('has-error');
    } else if (level === 'WARN') {
      this.warnCount++;
    }

    this.updateBadge();
    if (this.isOpen && this.activeTab === 'LOGS') {
      this.renderLogsTab();
    }
  };

  InGameDevConsole.prototype.updateBadge = function () {
    var badge = document.getElementById('dev-console-badge');
    var errCountSpan = document.getElementById('dev-tab-err-count');
    if (errCountSpan) errCountSpan.textContent = String(this.errorCount);
    if (!badge) return;

    if (this.errorCount > 0) {
      badge.className = 'dev-console-badge err';
      badge.textContent = '⚠️ ' + this.errorCount + ' ERR';
      return;
    }

    if (typeof BrotherEye !== 'undefined') {
      var s4 = BrotherEye.state4_adaptive;
      badge.className = 'dev-console-badge';
      badge.textContent = 'EYE R=' + s4.performanceR.toFixed(0) + ' (' + s4.regime + ')';
    }
  };

  InGameDevConsole.prototype.hookGlobalErrors = function () {
    var self = this;
    window.addEventListener('error', function (e) {
      self.log('ERROR', e.message + ' (' + (e.filename ? e.filename.split('/').pop() : 'script') + ':' + e.lineno + ')');
    });
    window.addEventListener('unhandledrejection', function (e) {
      self.log('ERROR', 'Promesa rechazada: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason)));
    });
  };

  InGameDevConsole.prototype.hookBrotherEye = function () {
    var self = this;
    if (typeof BrotherEye !== 'undefined') {
      BrotherEye.onUpdateCallback = function (status) {
        var sum = status.summary;
        self.log(
          'EYE',
          '[ESTADO 4] R=' + sum.R + ' (Δ=' + (sum.delta >= 0 ? '+' : '') + sum.delta + ') | Régimen: ' + sum.regime +
          ' | Próx. Sala -> Cant: x' + sum.nextCountMult + ', Daño: x' + sum.nextDamageMult + ', Vel: x' + sum.nextSpeedMult
        );
        self.updateBadge();
      };
    }
  };

  InGameDevConsole.prototype.render = function () {
    if (!this.isOpen) return;
    if (this.activeTab === 'BROTHER_EYE') {
      this.renderBrotherEyeTab();
    } else if (this.activeTab === 'LEVEL_EDITOR') {
      this.renderLevelEditorTab();
    } else if (this.activeTab === 'LOGS') {
      this.renderLogsTab();
    } else if (this.activeTab === 'TOOLS') {
      this.renderToolsTab();
    }
  };

  InGameDevConsole.prototype.renderLevelEditorTab = function () {
    var self = this;
    var body = document.getElementById('dev-console-body');
    if (!body) return;

    var allTemplates = (typeof LevelTemplateSystem !== 'undefined')
      ? LevelTemplateSystem.getAllRoomTemplates()
      : [];

    var optionsHtml = allTemplates.map(function (t) {
      var sel = (t.id === self.editorState.id) ? ' selected' : '';
      var tag = t.isCustom ? '★ PERSONALIZADA' : (t.sectionTag || 'AUTOR');
      return '<option value="' + t.id + '"' + sel + '>[' + tag + '] ' + t.name + ' (' + t.id + ')</option>';
    }).join('');

    var brushesHtml = EDITOR_BRUSHES.map(function (b) {
      var isSel = self.editorState.selectedBrush === b.symbol;
      return '<button type="button" class="lvl-brush-btn' + (isSel ? ' selected' : '') + '" ' +
        'data-brush="' + b.symbol + '" title="' + b.desc + '" ' +
        'style="background:' + b.color + ';color:' + b.text + ';">' + b.label + '</button>';
    }).join('');

    var rows = (typeof LevelTemplateSystem !== 'undefined')
      ? LevelTemplateSystem.normalizeGrid(this.editorState.grid)
      : this.editorState.grid;
    this.editorState.grid = rows;

    var cellsHtml = '';
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 13; c++) {
        var ch = rows[r].charAt(c) || '.';
        var bMeta = getBrushMeta(ch);
        var isDoor = (r === 0 && c === 6) || (r === 8 && c === 6) || (r === 4 && c === 0) || (r === 4 && c === 12);
        var doorTitle = isDoor ? ' (Umbral de Puerta)' : '';
        cellsHtml += '<div class="lvl-grid-cell' + (isDoor ? ' door-cell' : '') + '" ' +
          'data-row="' + r + '" data-col="' + c + '" ' +
          'title="Celda (' + c + ', ' + r + '): ' + bMeta.desc + doorTitle + '" ' +
          'style="background:' + bMeta.color + ';color:' + bMeta.text + ';">' +
          (ch === '.' ? (isDoor ? '🚪' : '·') : ch) +
          '</div>';
      }
    }

    var exportedCode = (typeof LevelTemplateSystem !== 'undefined')
      ? LevelTemplateSystem.formatTemplateAsCode(this.editorState)
      : '';

    var floorInfo = '';
    var game = window.activeGameInstance;
    if (game && game.currentRoom) {
      var cr = game.currentRoom;
      var secLabel = (game.currentFloor && game.currentFloor.activeSectionName)
        ? ' | Sección Piso: ' + game.currentFloor.activeSectionName
        : '';
      floorInfo = 'Sala Actual: <strong>' + (cr.templateName || cr.layoutType) + '</strong> (' + cr.type + ')' + secLabel;
    }

    body.innerHTML = [
      '<div class="lvl-editor-layout">',
      '  <div>',
      '    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px;flex-wrap:wrap;">',
      '      <span style="font-size:0.72rem;color:#38bdf8;font-weight:800;">🎨 PINCELES (CLIC O ARRASTRAR EN LA GRILLA 13x9):</span>',
      '      <span style="font-size:0.68rem;color:#94a3b8;">' + floorInfo + '</span>',
      '    </div>',
      '    <div class="lvl-brush-bar">' + brushesHtml + '</div>',
      '    <div id="lvl-grid-board" class="lvl-grid-board">' + cellsHtml + '</div>',
      '    <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">',
      '      <button type="button" class="dev-tab-btn" id="lvl-btn-mirror-x">↔️ Simetría Izq → Der</button>',
      '      <button type="button" class="dev-tab-btn" id="lvl-btn-mirror-y">↕️ Simetría Arr → Abj</button>',
      '      <button type="button" class="dev-tab-btn" id="lvl-btn-capture">📸 Capturar Sala Actual</button>',
      '      <button type="button" class="dev-tab-btn" id="lvl-btn-clear" style="border-color:#ef4444;color:#fca5a5;">🧹 Limpiar Todo</button>',
      '    </div>',
      '  </div>',
      '  <div class="eye-card" style="gap:8px;">',
      '    <div class="eye-card-title">📂 CATÁLOGO Y EXPORTACIÓN</div>',
      '    <label style="font-size:0.68rem;color:#94a3b8;">Cargar plantilla existente:</label>',
      '    <select id="lvl-template-select" class="dev-cmd-input" style="width:100%;">',
      '      <option value="">-- Elegir Plantilla --</option>',
      optionsHtml,
      '    </select>',
      '    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">',
      '      <div>',
      '        <label style="font-size:0.65rem;color:#94a3b8;">ID (Código):</label>',
      '        <input id="lvl-input-id" class="dev-cmd-input" style="width:100%;" value="' + this.editorState.id + '" />',
      '      </div>',
      '      <div>',
      '        <label style="font-size:0.65rem;color:#94a3b8;">Nombre en HUD:</label>',
      '        <input id="lvl-input-name" class="dev-cmd-input" style="width:100%;" value="' + this.editorState.name + '" />',
      '      </div>',
      '    </div>',
      '    <button type="button" id="lvl-btn-apply-live" class="dev-tab-btn active" style="width:100%;padding:8px;background:rgba(56,189,248,0.25);border-color:#38bdf8;color:#fff;">',
      '      ⚡ PROBAR EN LA SALA ACTUAL EN VIVO',
      '    </button>',
      '    <button type="button" id="lvl-btn-save-custom" class="dev-tab-btn" style="width:100%;padding:8px;border-color:#4ade80;color:#4ade80;">',
      '      💾 GUARDAR EN MI JUEGO + COPIAR JS',
      '    </button>',
      '    <label style="font-size:0.65rem;color:#94a3b8;">Código listo para pegar en <code>level_templates.js</code>:</label>',
      '    <textarea id="lvl-code-output" class="lvl-code-box" readonly>' + exportedCode + '</textarea>',
      '  </div>',
      '</div>'
    ].join('\n');

    // Eventos de pinceles
    var brushBtns = body.querySelectorAll('[data-brush]');
    for (var i = 0; i < brushBtns.length; i++) {
      brushBtns[i].addEventListener('click', function (e) {
        self.editorState.selectedBrush = e.currentTarget.getAttribute('data-brush');
        self.renderLevelEditorTab();
      });
    }

    // Función para pintar una celda sin re-renderizar todo el DOM de golpe
    var paintCell = function (cellEl) {
      var r = parseInt(cellEl.getAttribute('data-row'), 10);
      var c = parseInt(cellEl.getAttribute('data-col'), 10);
      var sym = self.editorState.selectedBrush;
      var line = self.editorState.grid[r];
      self.editorState.grid[r] = line.substring(0, c) + sym + line.substring(c + 1);

      var bMeta = getBrushMeta(sym);
      var isDoor = (r === 0 && c === 6) || (r === 8 && c === 6) || (r === 4 && c === 0) || (r === 4 && c === 12);
      cellEl.style.background = bMeta.color;
      cellEl.style.color = bMeta.text;
      cellEl.textContent = sym === '.' ? (isDoor ? '🚪' : '·') : sym;

      var codeOut = document.getElementById('lvl-code-output');
      if (codeOut && typeof LevelTemplateSystem !== 'undefined') {
        codeOut.value = LevelTemplateSystem.formatTemplateAsCode(self.editorState);
      }
    };

    var cells = body.querySelectorAll('.lvl-grid-cell');
    for (var j = 0; j < cells.length; j++) {
      cells[j].addEventListener('mousedown', function (e) {
        e.preventDefault();
        self.editorState.isMouseDown = true;
        paintCell(e.currentTarget);
      });
      cells[j].addEventListener('mouseenter', function (e) {
        if (self.editorState.isMouseDown) {
          paintCell(e.currentTarget);
        }
      });
    }

    // Inputs de ID y Nombre
    var idInput = document.getElementById('lvl-input-id');
    var nameInput = document.getElementById('lvl-input-name');
    var syncInputs = function () {
      if (idInput) self.editorState.id = idInput.value.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_') || 'MI_SALA';
      if (nameInput) self.editorState.name = nameInput.value.trim() || 'Mi Sala';
      var codeOut = document.getElementById('lvl-code-output');
      if (codeOut && typeof LevelTemplateSystem !== 'undefined') {
        codeOut.value = LevelTemplateSystem.formatTemplateAsCode(self.editorState);
      }
    };
    if (idInput) idInput.addEventListener('input', syncInputs);
    if (nameInput) nameInput.addEventListener('input', syncInputs);

    // Selector de plantilla existente
    var tplSelect = document.getElementById('lvl-template-select');
    if (tplSelect) {
      tplSelect.addEventListener('change', function (e) {
        var chosenId = e.currentTarget.value;
        if (!chosenId || typeof LevelTemplateSystem === 'undefined') return;
        var tpl = LevelTemplateSystem.getTemplateById(chosenId);
        if (tpl) {
          self.editorState.id = tpl.id;
          self.editorState.name = tpl.name;
          self.editorState.sectionTag = tpl.sectionTag || 'AUTOR';
          self.editorState.grid = LevelTemplateSystem.normalizeGrid(tpl.grid);
          self.renderLevelEditorTab();
        }
      });
    }

    // Botones de simetría, captura y limpieza
    var btnMirrorX = document.getElementById('lvl-btn-mirror-x');
    if (btnMirrorX) {
      btnMirrorX.addEventListener('click', function () {
        for (var r = 0; r < 9; r++) {
          var chars = self.editorState.grid[r].split('');
          for (var c = 0; c < 6; c++) {
            chars[12 - c] = chars[c];
          }
          self.editorState.grid[r] = chars.join('');
        }
        self.renderLevelEditorTab();
      });
    }

    var btnMirrorY = document.getElementById('lvl-btn-mirror-y');
    if (btnMirrorY) {
      btnMirrorY.addEventListener('click', function () {
        for (var r = 0; r < 4; r++) {
          self.editorState.grid[8 - r] = self.editorState.grid[r];
        }
        self.renderLevelEditorTab();
      });
    }

    var btnCapture = document.getElementById('lvl-btn-capture');
    if (btnCapture) {
      btnCapture.addEventListener('click', function () {
        var g = window.activeGameInstance;
        if (!g || !g.currentRoom || typeof LevelTemplateSystem === 'undefined') return;
        self.editorState.grid = LevelTemplateSystem.captureRoomToGrid(g.currentRoom);
        self.renderLevelEditorTab();
      });
    }

    var btnClear = document.getElementById('lvl-btn-clear');
    if (btnClear) {
      btnClear.addEventListener('click', function () {
        var empty = [];
        for (var r = 0; r < 9; r++) empty.push('.............');
        self.editorState.grid = empty;
        self.renderLevelEditorTab();
      });
    }

    // Probar en vivo en la sala actual
    var btnApplyLive = document.getElementById('lvl-btn-apply-live');
    if (btnApplyLive) {
      btnApplyLive.addEventListener('click', function () {
        syncInputs();
        var g = window.activeGameInstance;
        if (!g || !g.currentRoom || typeof LevelTemplateSystem === 'undefined') {
          self.log('WARN', 'Inicia una partida primero para probar la sala en vivo.');
          return;
        }
        LevelTemplateSystem.applyTemplateToRoom(g.currentRoom, self.editorState, {
          flipX: false,
          flipY: false,
          spawnMultiplier: 1.0,
          eliteChanceMult: 1.0
        });
        // Asegurar que el jugador quede en posición caminable y con gracia breve
        var safeP = g.currentRoom.getWalkablePosition(g.player.x, g.player.y, g.player.radius);
        g.player.x = safeP.x;
        g.player.y = safeP.y;
        g.player.roomTransitionGrace = 0.6;
        for (var k = 0; k < g.currentRoom.enemies.length; k++) {
          g.currentRoom.enemies[k].reactionDelay = 0.65;
        }
        if (g.ui) {
          g.ui.updateRoomInfo(g.currentRoom, g.currentFloor);
          g.ui.showToast('🗺️ Plantilla "' + self.editorState.name + '" aplicada en vivo');
        }
        self.log('INFO', 'Plantilla "' + self.editorState.id + '" aplicada en vivo a la sala actual.');
        self.toggle(false);
      });
    }

    // Guardar en catálogo local y copiar código JS
    var btnSaveCustom = document.getElementById('lvl-btn-save-custom');
    if (btnSaveCustom) {
      btnSaveCustom.addEventListener('click', function () {
        syncInputs();
        if (typeof LevelTemplateSystem === 'undefined') return;
        var saved = LevelTemplateSystem.saveCustomTemplate(self.editorState);
        var codeStr = LevelTemplateSystem.formatTemplateAsCode(self.editorState);
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(codeStr).catch(function () {});
        }
        if (saved) {
          self.log('INFO', 'Plantilla "' + saved.id + '" guardada en el catálogo y copiada al portapapeles.');
          if (window.activeGameInstance && window.activeGameInstance.ui) {
            window.activeGameInstance.ui.showToast('💾 Plantilla "' + saved.name + '" guardada en el catálogo y copiada al portapapeles');
          }
          self.renderLevelEditorTab();
        }
      });
    }
  };

  InGameDevConsole.prototype.renderBrotherEyeTab = function () {
    var body = document.getElementById('dev-console-body');
    if (!body || typeof BrotherEye === 'undefined') return;

    var st = BrotherEye.getStatus();
    var sm1 = st.stateMinus1_GlobalClock;
    var s0 = st.state0_Initial;
    var s1 = st.state1_Enter;
    var s2 = st.state2_Midpoint;
    var s3 = st.state3_Complete;
    var s4 = st.state4_Adaptive;

    var regimeClass = 'regime-EQUILIBRIO';
    if (s4.regime === 'ACOMPAÑAR_BUILD') regimeClass = 'regime-ACOMPANAR';
    else if (s4.regime === 'PIES_EN_LA_TIERRA') regimeClass = 'regime-PIES';
    else if (s4.regime === 'ALIVIO') regimeClass = 'regime-ALIVIO';

    var historyHtml = '';
    if (BrotherEye.roomHistory && BrotherEye.roomHistory.length > 0) {
      var rows = BrotherEye.roomHistory.slice().reverse().slice(0, 6).map(function (h) {
        return '<div class="eye-kv" style="border-bottom:1px dashed #1e293b;padding:2px 0;">' +
          '<span>[' + h.globalTime + 's] Sala ' + h.roomType + ' (' + h.roomTime + 's | DTPS: ' + h.dtps + ')</span>' +
          '<strong>R=' + h.R + ' (Δ=' + (h.delta >= 0 ? '+' : '') + h.delta + ') → ' + h.regime +
          ' [Cant x' + h.nextModifiers.count + ' | Dmg x' + h.nextModifiers.damage + ' | Spd x' + h.nextModifiers.speed + ']</strong>' +
          '</div>';
      }).join('');
      historyHtml = '<div class="eye-card" style="grid-column: 1 / -1;"><div class="eye-card-title">📊 HISTORIAL RECIENTE DE HABITACIONES EVALUADAS</div>' + rows + '</div>';
    } else {
      historyHtml = '<div class="eye-card" style="grid-column: 1 / -1;"><div class="eye-card-title">📊 HISTORIAL RECIENTE DE HABITACIONES EVALUADAS</div><div style="font-size:0.72rem;color:#94a3b8;">Completa una sala con enemigos para ver el primer cálculo adaptativo (Estados 1 → 4).</div></div>';
    }

    body.innerHTML = [
      '<div class="eye-grid">',
      '  <div class="eye-card">',
      '    <div class="eye-card-title">⏱️ ESTADO -1 & ESTADO 0 (BASE)</div>',
      '    <div class="eye-kv"><span>Reloj Global (Estado -1):</span><strong>' + sm1.elapsedSeconds.toFixed(1) + 's (' + (sm1.active ? 'ACTIVO' : 'PAUSADO') + ')</strong></div>',
      '    <div class="eye-kv"><span>Último Reset Reloj:</span><strong>' + sm1.resetReason + '</strong></div>',
      '    <div class="eye-kv"><span>Vida/Escudo Inicial (E0):</span><strong>' + s0.maxHp + ' HP + ' + s0.shield + ' Esc</strong></div>',
      '    <div class="eye-kv"><span>Daño / Proyectiles (E0):</span><strong>x' + s0.damageMultiplier.toFixed(2) + ' / ' + s0.projectiles + ' proy</strong></div>',
      '    <div class="eye-kv"><span>Reliquias Iniciales (E0):</span><strong>' + s0.totalRelics + '</strong></div>',
      '  </div>',

      '  <div class="eye-card">',
      '    <div class="eye-card-title">🚪 ESTADO 1 (ENTRADA) & ESTADO 2 (50%)</div>',
      '    <div class="eye-kv"><span>Sala Actual / 2do Reloj:</span><strong>' + s1.roomType + ' | ' + s1.roomClockSeconds.toFixed(1) + 's</strong></div>',
      '    <div class="eye-kv"><span>Vida Entrada / Enemigos:</span><strong>' + s1.entryVitality + ' Vit | ' + s1.totalEnemiesInitial + ' Enem.</strong></div>',
      '    <div class="eye-kv"><span>Midpoint (50% Muertos):</span><strong>' + (s2.triggered ? ('SÍ (' + s2.timeElapsedFirstHalf.toFixed(1) + 's)') : 'Pendiente') + '</strong></div>',
      '    <div class="eye-kv"><span>Vida Perdida al 50%:</span><strong>-' + s2.hpLostFirstHalf + ' HP (DTPS: ' + s2.dtpsFirstHalf.toFixed(2) + ')</strong></div>',
      '    <div class="eye-kv"><span>Nuevas Reliquias en Sala:</span><strong>+' + s2.newRelicsAcquiredMid + '</strong></div>',
      '  </div>',

      '  <div class="eye-card">',
      '    <div class="eye-card-title">🏁 ESTADO 3 (FINAL DE SALA & DTPS)</div>',
      '    <div class="eye-kv"><span>Última Sala Completada:</span><strong>' + (s3.completed ? 'SÍ' : 'En curso') + ' (' + s3.totalTimeEmployed.toFixed(2) + 's)</strong></div>',
      '    <div class="eye-kv"><span>Daño Total Recibido:</span><strong>' + s3.totalDamageTaken + ' HP</strong></div>',
      '    <div class="eye-kv"><span>DTPS (Daño / Segundo):</span><strong style="color:#facc15;">' + s3.dtpsTotal.toFixed(2) + ' HP/s</strong></div>',
      '    <div class="eye-kv"><span>Velocidad KPS (1ra vs 2da):</span><strong>' + s2.kpsFirstHalf.toFixed(2) + ' vs ' + s3.kpsSecondHalf.toFixed(2) + '/s</strong></div>',
      '    <div class="eye-kv"><span>Ratio Ritmo (Slowdown):</span><strong>x' + s3.combatSlowdownRatio.toFixed(2) + '</strong></div>',
      '  </div>',

      '  <div class="eye-card" style="grid-column: span 2;">',
      '    <div class="eye-card-title">🧮 ESTADO 4: ECUACIÓN R = 0.30S + 0.20P + 0.20V + 0.20E + 0.10G</div>',
      '    <div class="eye-kv"><span>S (Supervivencia 30%): <strong>' + s4.indicators.S_survival + '</strong></span><span>P (Potencia 20%): <strong>' + s4.indicators.P_power + '</strong></span><span>V (Velocidad 20%): <strong>' + s4.indicators.V_speed + '</strong></span></div>',
      '    <div class="eye-kv"><span>E (Eficiencia DTPS 20%): <strong>' + s4.indicators.E_efficiency + '</strong></span><span>G (Progresión 10%): <strong>' + s4.indicators.G_progression + '</strong></span><span>Dados [Min/Max]: <strong>' + s4.diceStats.minPoint + ' / ' + s4.diceStats.maxPoint + '</strong></span></div>',
      '    <div class="eye-kv" style="margin-top:4px;padding-top:4px;border-top:1px solid #1e293b;">',
      '      <span>Rendimiento Calculado: <strong style="color:#38bdf8;font-size:0.85rem;">R = ' + s4.performanceR + '</strong> (Esperado: ' + s4.expectedR + ' | Δ = ' + (s4.delta >= 0 ? '+' : '') + s4.delta + ')</span>',
      '      <span>Dado Ruido: <strong>' + s4.diceStats.noiseRoll + '</strong> | Racha Dios: <strong>' + s4.godStreak + ' salas</strong></span>',
      '    </div>',
      '  </div>',

      '  <div class="eye-card">',
      '    <div class="eye-card-title">⚡ PRÓXIMA SALA (MODIFICADORES)</div>',
      '    <div class="eye-kv"><span>Régimen Activo:</span><span class="eye-regime-pill ' + regimeClass + '">' + s4.regime + '</span></div>',
      '    <div class="eye-kv"><span>Cantidad Enemigos:</span><strong>x' + s4.nextRoomModifiers.enemyCountMultiplier + '</strong></div>',
      '    <div class="eye-kv"><span>Daño Enemigos:</span><strong>x' + s4.nextRoomModifiers.enemyDamageMultiplier + '</strong></div>',
      '    <div class="eye-kv"><span>Velocidad Enemigos:</span><strong>x' + s4.nextRoomModifiers.enemySpeedMultiplier + '</strong></div>',
      '  </div>',
      historyHtml,
      '</div>'
    ].join('\n');
  };

  InGameDevConsole.prototype.renderLogsTab = function () {
    var body = document.getElementById('dev-console-body');
    if (!body) return;

    if (this.logs.length === 0) {
      body.innerHTML = '<div style="color:#94a3b8;font-size:0.75rem;">Sin registros todavía.</div>';
      return;
    }

    var itemsHtml = this.logs.map(function (item) {
      return '<div class="dev-log-item ' + item.level + '">' +
        '<span style="color:#64748b;">[' + item.time + ']</span> ' +
        '<strong>[' + item.level + ']</strong> ' +
        item.text +
        '</div>';
    }).join('');

    body.innerHTML = '<div class="dev-log-list">' + itemsHtml + '</div>';
  };

  InGameDevConsole.prototype.renderToolsTab = function () {
    var self = this;
    var body = document.getElementById('dev-console-body');
    if (!body) return;

    var weaponCardsHtml = '';
    if (typeof WeaponSystem !== 'undefined') {
      var allWeapons = WeaponSystem.getAllWeaponDefs();
      var weaponBtns = allWeapons.map(function (wDef) {
        var tagsLabel = (wDef.tags && wDef.tags.length > 0) ? wDef.tags.join(', ') : 'CUSTOM';
        return '  <button type="button" class="dev-tool-btn" data-equip-weapon="' + wDef.id + '">' +
          '    <span>' + wDef.symbol + ' ' + wDef.name + ' <span style="color:#38bdf8;font-size:0.64rem;">[' + tagsLabel + ']</span></span>' +
          '    <small>' + (wDef.description || 'Arma modular de weapons.js') + '</small>' +
          '  </button>';
      }).join('\n');
      weaponCardsHtml = [
        '<div class="eye-card" style="margin-top:4px;">',
        '  <div class="eye-card-title">⚔️ PROBAR / EQUIPAR ARMAS DESDE WEAPONS.JS (PLUG & PLAY)</div>',
        '  <div class="dev-tools-grid">' + weaponBtns + '</div>',
        '</div>'
      ].join('\n');
    }

    body.innerHTML = [
      '<div class="dev-tools-grid">',
      '  <button type="button" class="dev-tool-btn" data-action="RESCUE_PLAYER">',
      '    <span>📍 RESCATAR JUGADOR AL CENTRO</span>',
      '    <small>Si saliste de los bordes del mapa o quedaste atrapado, te devuelve al centro seguro de la sala.</small>',
      '  </button>',
      '  <button type="button" class="dev-tool-btn" data-action="CLEAR_PROJECTILES">',
      '    <span>🧹 LIMPIAR PROYECTILES Y TRAMPAS</span>',
      '    <small>Elimina todos los proyectiles en vuelo y charcos activos de la habitación actual.</small>',
      '  </button>',
      '  <button type="button" class="dev-tool-btn" data-action="OPEN_LEVEL_EDITOR">',
      '    <span>🗺️ ABRIR EDITOR VISUAL DE SALAS (13x9)</span>',
      '    <small>Diseña tus propias secciones con rocas, fosos, trampas y enemigos, y pruébalas en vivo.</small>',
      '  </button>',
      '  <button type="button" class="dev-tool-btn" data-action="FORCE_SPIKE">',
      '    <span>⚡ FORZAR SALA "PIES EN LA TIERRA"</span>',
      '    <small>Configura BrotherEye en modo Subidón (+55% enemigos, +42% daño, +15% velocidad) para la próxima sala.</small>',
      '  </button>',
      '  <button type="button" class="dev-tool-btn" data-action="FORCE_ACCOMPANY">',
      '    <span>🔥 FORZAR MODO "ACOMPAÑAR BUILD"</span>',
      '    <small>Configura BrotherEye para acompañar una build fuerte (+30% cantidad de enemigos) en la próxima sala.</small>',
      '  </button>',
      '  <button type="button" class="dev-tool-btn" data-action="ADAPT_CURRENT_ROOM">',
      '    <span>👁️ APLICAR DIFICULTAD A ESTA SALA AHORA</span>',
      '    <small>Inyecta inmediatamente los enemigos extra y el ajuste de daño/velocidad en la habitación actual.</small>',
      '  </button>',
      '  <button type="button" class="dev-tool-btn" data-action="GRANT_METEOR_BUILD">',
      '    <span>🌋 PROBAR BUILD METEORITOS (STRESS TEST)</span>',
      '    <small>Otorga Fuego Nvl 3 + Pólvora Inestable + +3 Proyectiles para verificar que no se congele la sala.</small>',
      '  </button>',
      '</div>',
      weaponCardsHtml
    ].join('\n');

    var btns = body.querySelectorAll('[data-action]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function (e) {
        var act = e.currentTarget.getAttribute('data-action');
        self.runQuickAction(act);
      });
    }

    var equipBtns = body.querySelectorAll('[data-equip-weapon]');
    for (var j = 0; j < equipBtns.length; j++) {
      equipBtns[j].addEventListener('click', function (e) {
        var weaponId = e.currentTarget.getAttribute('data-equip-weapon');
        var g = window.activeGameInstance;
        if (!g || !g.player || typeof WeaponSystem === 'undefined') {
          self.log('WARN', 'Inicia una partida primero para equipar "' + weaponId + '".');
          return;
        }
        WeaponSystem.giveWeapon(g.player, weaponId, true);
        self.log('INFO', 'Arma equipada/seleccionada desde weapons.js: ' + weaponId);
        self.toggle(false);
      });
    }
  };

  InGameDevConsole.prototype.runQuickAction = function (action) {
    if (action === 'OPEN_LEVEL_EDITOR') {
      this.setTab('LEVEL_EDITOR');
      return;
    }

    var game = window.activeGameInstance;
    if (!game || !game.player || !game.currentRoom) {
      this.log('WARN', 'Inicia una partida primero para usar las herramientas en vivo.');
      return;
    }

    var p = game.player;
    var r = game.currentRoom;

    if (action === 'RESCUE_PLAYER') {
      var b = r.bounds || ROOM_BOUNDS;
      p.x = b.centerX;
      p.y = b.centerY;
      r.projectiles = [];
      r.enemyProjectiles = [];
      this.log('INFO', 'Jugador rescatado al centro de la sala (' + Math.round(p.x) + ', ' + Math.round(p.y) + ').');
      if (game.ui) game.ui.showToast('📍 Jugador teletransportado al centro de la sala');

    } else if (action === 'CLEAR_PROJECTILES') {
      r.projectiles = [];
      r.enemyProjectiles = [];
      r.hazards = [];
      this.log('INFO', 'Se limpiaron todos los proyectiles y peligros de la sala.');

    } else if (action === 'FORCE_SPIKE') {
      if (typeof BrotherEye !== 'undefined') {
        BrotherEye.state4_adaptive.regime = 'PIES_EN_LA_TIERRA';
        BrotherEye.state4_adaptive.performanceR = 92.0;
        BrotherEye.state4_adaptive.delta = 27.0;
        BrotherEye.state4_adaptive.nextRoomModifiers.enemyCountMultiplier = 1.55;
        BrotherEye.state4_adaptive.nextRoomModifiers.enemyDamageMultiplier = 1.42;
        BrotherEye.state4_adaptive.nextRoomModifiers.enemySpeedMultiplier = 1.15;
        this.updateBadge();
        this.log('EYE', 'Subidón "PIES EN LA TIERRA" armado para la próxima sala (Cant x1.55, Daño x1.42, Vel x1.15).');
        if (game.ui) game.ui.showToast('👁️ Subidón "Pies en la Tierra" preparado para la próxima sala');
      }

    } else if (action === 'FORCE_ACCOMPANY') {
      if (typeof BrotherEye !== 'undefined') {
        BrotherEye.state4_adaptive.regime = 'ACOMPAÑAR_BUILD';
        BrotherEye.state4_adaptive.performanceR = 84.0;
        BrotherEye.state4_adaptive.delta = 19.0;
        BrotherEye.state4_adaptive.nextRoomModifiers.enemyCountMultiplier = 1.30;
        BrotherEye.state4_adaptive.nextRoomModifiers.enemyDamageMultiplier = 1.15;
        BrotherEye.state4_adaptive.nextRoomModifiers.enemySpeedMultiplier = 1.08;
        this.updateBadge();
        this.log('EYE', 'Modo "ACOMPAÑAR_BUILD" armado para la próxima sala (Cant x1.30, Daño x1.15, Vel x1.08).');
      }

    } else if (action === 'ADAPT_CURRENT_ROOM') {
      if (typeof BrotherEye !== 'undefined') {
        r.brotherEyeAdapted = false;
        r.cleared = false;
        BrotherEye.applyAdaptationToRoom(r, p);
        BrotherEye.ROOM_ENTER(r, p);
        this.log('EYE', 'Adaptación aplicada en vivo a la sala actual. Enemigos ahora: ' + r.enemies.length);
        if (game.ui) game.ui.showToast('👁️ BrotherEye adaptó la sala actual (' + r.enemies.length + ' enemigos)');
      }

    } else if (action === 'GRANT_METEOR_BUILD') {
      p.elementalPool = p.elementalPool || {};
      p.elementalPool.FIRE = Math.max(p.elementalPool.FIRE || 0, 3);
      p.bonusProjectiles = Math.max(p.bonusProjectiles || 0, 3);
      p.damageMultiplier = Math.max(p.damageMultiplier, 2.2);
      if (window.synergyEngine) {
        window.synergyEngine.activeSynergies.add('VOLCANIC_SUPERNOVA');
      }
      if (typeof EvolutionManager !== 'undefined') {
        EvolutionManager.checkEvolutions(p, r, game.ui);
      }
      if (game.ui) {
        game.ui.updateElements(p.elementalPool);
        game.ui.updateStats(p);
      }
      this.log('INFO', 'Build de Meteoritos (Fuego Nvl 3 + Supernova Volcánica) activada.');
    }
  };

  InGameDevConsole.prototype.executeCommand = function (cmd) {
    this.log('INFO', '> ' + cmd);
    if (cmd.toLowerCase() === 'help') {
      this.log('INFO', 'Comandos útiles: WeaponSystem.giveWeapon(game.player, "ABYSS_SHOTGUN") | BrotherEye.getStatus() | LevelTemplateSystem.getAllRoomTemplates()');
      this.setTab('LOGS');
      return;
    }
    try {
      var game = window.activeGameInstance;
      // eslint-disable-next-line no-eval
      var result = eval(cmd);
      if (result !== undefined) {
        this.log('INFO', 'Resultado: ' + (typeof result === 'object' ? JSON.stringify(result) : String(result)));
      }
    } catch (err) {
      this.log('ERROR', 'Error al ejecutar comando: ' + err.message);
    }
    this.setTab('LOGS');
  };

  root.devConsole = new InGameDevConsole();
}(typeof self !== 'undefined' ? self : this));
