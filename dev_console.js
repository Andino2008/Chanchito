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
  var MAX_LOGS = 500;

  function escapeHtml(str) {
    return String(str === undefined || str === null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

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
      '.regime-EQUILIBRIO, .regime-JUICIO_EQUILIBRADO { background: rgba(56, 189, 248, 0.2); color: #38bdf8; border: 1px solid #38bdf8; }',
      '.regime-ACOMPANAR, .regime-ACUSACION_FISCAL { background: rgba(249, 115, 22, 0.22); color: #fdba74; border: 1px solid #f97316; }',
      '.regime-PIES, .regime-SENTENCIA_MAXIMA { background: rgba(239, 68, 68, 0.28); color: #fca5a5; border: 1px solid #ef4444; }',
      '.regime-MALDICION_TRIBUNAL { background: rgba(185, 28, 28, 0.36); color: #fecaca; border: 1px solid #dc2626; }',
      '.regime-ALIVIO, .regime-CLEMENCIA_DEFENSOR { background: rgba(59, 130, 246, 0.22); color: #93c5fd; border: 1px solid #3b82f6; }',
      '.regime-BENDICION_DIVINA { background: rgba(74, 222, 128, 0.24); color: #86efac; border: 1px solid #22c55e; }',
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
      '  <div style="display:flex;gap:6px;align-items:center;">',
      '    <button type="button" id="dev-btn-export-pdf" class="dev-tab-btn" style="border-color:#22c55e;color:#86efac;" title="Exportar todos los logs, Tribunal BrotherEye y Expediente Global como PDF">📄 EXPORTAR PDF</button>',
      '    <button type="button" id="dev-console-close" class="dev-tab-btn" style="border-color:#ef4444;color:#fca5a5;">CERRAR [F2]</button>',
      '  </div>',
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

    var exportHeaderBtn = this.modal.querySelector('#dev-btn-export-pdf');
    if (exportHeaderBtn) {
      exportHeaderBtn.addEventListener('click', function () {
        self.exportLogsAsPdf();
      });
    }

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
      var sm1 = BrotherEye.globalClock || {};
      var heatTxt = typeof sm1.baseHeatLevel === 'number' ? (' | C:' + sm1.baseHeatLevel.toFixed(0)) : '';
      badge.className = 'dev-console-badge';
      badge.textContent = 'TRIBUNAL ' + s4.regime + heatTxt;
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
          '[TRIBUNAL] Fiscal:' + sum.prosecutorScore + ' vs Defensor:' + sum.defenderScore +
          ' | Dado d100=' + sum.chaosD100 + ' → ' + sum.regime +
          ' [Cant x' + sum.nextCountMult + ', HP x' + sum.nextHpMult + ', Dmg x' + sum.nextDamageMult + ', Spd x' + sum.nextSpeedMult + ']'
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

    if (typeof BrotherEye.analyzeShortTermPatterns === 'function') {
      BrotherEye.analyzeShortTermPatterns();
    }

    var st = BrotherEye.getStatus();
    var sm1 = st.stateMinus1_GlobalClock;
    var s0 = st.state0_Initial;
    var s1 = st.state1_Enter;
    var s2 = st.state2_Midpoint;
    var s3 = st.state3_Complete;
    var s4 = st.state4_Adaptive;
    var mem = st.shortTermMemory || BrotherEye.shortTermMemory || {};
    var cd = s4.courtDebate || { prosecutorScore: 0, defenderScore: 0, prosecutorReasons: [], defenderReasons: [], debateMargin: 0, heatApplied: 0, rawVerdictScore: 0, effectiveVerdictScore: 0, winner: 'EMPATE' };

    var regimeClass = 'regime-' + s4.regime;

    var prosList = (cd.prosecutorReasons && cd.prosecutorReasons.length > 0)
      ? cd.prosecutorReasons.map(function (r) { return '<div style="font-size:0.68rem;color:#fca5a5;">• ' + r + '</div>'; }).join('')
      : '<div style="font-size:0.68rem;color:#94a3b8;">Sin cargos graves aún.</div>';

    var defList = (cd.defenderReasons && cd.defenderReasons.length > 0)
      ? cd.defenderReasons.map(function (r) { return '<div style="font-size:0.68rem;color:#93c5fd;">• ' + r + '</div>'; }).join('')
      : '<div style="font-size:0.68rem;color:#94a3b8;">Sin objeciones críticas (jugador sano).</div>';

    var act = mem.actions || { projectileShots: 0, beamShots: 0, meleeSwings: 0, parrySuccess: 0, dashes: 0 };
    var dirs = mem.dodgeDirs || { LEFT: 0, RIGHT: 0, UP: 0, DOWN: 0 };
    var roomsSince = mem.roomsSinceReset || 0;
    var resetEvery = mem.resetIntervalRooms || 4;
    var roomsLeft = Math.max(0, resetEvery - roomsSince);

    var ledger = st.globalLedger || BrotherEye.globalLedger || {};
    var activeDirectives = st.activeGlobalDirectives || BrotherEye.activeGlobalDirectives || [];
    var currentRelicsCount = (window.activeGameInstance && window.activeGameInstance.player && window.activeGameInstance.player.itemManager && Array.isArray(window.activeGameInstance.player.itemManager.ownedRelics))
      ? window.activeGameInstance.player.itemManager.ownedRelics.length
      : (s3.finalRelics || 0);
    var directivesPills = activeDirectives.length > 0
      ? activeDirectives.map(function (d) {
          var badgeStyle = d.tone === 'DEFENSOR'
            ? 'background:rgba(59,130,246,0.2);color:#93c5fd;border:1px solid #3b82f6;'
            : (d.tone === 'CAOS'
                ? 'background:rgba(250,204,21,0.2);color:#fde047;border:1px solid #eab308;'
                : 'background:rgba(239,68,68,0.22);color:#fca5a5;border:1px solid #ef4444;');
          return '<span style="display:inline-block;padding:2px 7px;border-radius:4px;font-size:0.65rem;font-weight:800;' + badgeStyle + '">' + d.id + '</span>';
        }).join(' ')
      : '<span style="font-size:0.68rem;color:#94a3b8;">Ninguna directiva especial activa todavía</span>';

    var historyHtml = '';
    if (BrotherEye.roomHistory && BrotherEye.roomHistory.length > 0) {
      var rows = BrotherEye.roomHistory.slice().reverse().slice(0, 6).map(function (h) {
        var mod = h.nextModifiers || {};
        return '<div class="eye-kv" style="border-bottom:1px dashed #1e293b;padding:3px 0;gap:8px;flex-wrap:wrap;">' +
          '<span>[#' + (h.roomNumber || '?') + ' ' + h.roomType + ' ' + h.roomTime + 's | -' + (h.percentLost !== undefined ? h.percentLost : 0) + '% vit] Fiscal ' + (h.prosecutorScore !== undefined ? h.prosecutorScore : '-') + ' vs Def ' + (h.defenderScore !== undefined ? h.defenderScore : '-') + ' (d100=' + (h.chaosD100 || '-') + ')</span>' +
          '<strong>' + h.regime + ' [Cant x' + (mod.count || 1) + ' | HP x' + (mod.hp || 1) + ' | Dmg x' + (mod.damage || 1) + ' | Spd x' + (mod.speed || 1) + ']</strong>' +
          '</div>';
      }).join('');
      historyHtml = '<div class="eye-card" style="grid-column: 1 / -1;"><div class="eye-card-title">📊 HISTORIAL JUDICIAL DE HABITACIONES</div>' + rows + '</div>';
    } else {
      historyHtml = '<div class="eye-card" style="grid-column: 1 / -1;"><div class="eye-card-title">📊 HISTORIAL JUDICIAL DE HABITACIONES</div><div style="font-size:0.72rem;color:#94a3b8;">Completa una sala con enemigos para presenciar el primer debate entre BrotherEye y JusticeEye.</div></div>';
    }

    body.innerHTML = [
      '<div class="eye-grid">',
      '  <div class="eye-card">',
      '    <div class="eye-card-title">⏱️ ESTADOS -1 & 0 (CRÓNICA DE RUN)</div>',
      '    <div class="eye-kv"><span>Reloj Global (E-1):</span><strong>' + sm1.elapsedSeconds.toFixed(1) + 's (' + (sm1.active ? 'ACTIVO' : 'PAUSADO') + ')</strong></div>',
      '    <div class="eye-kv"><span>Salas Limpiadas / Jefes:</span><strong>#' + (sm1.roomsClearedCount || 0) + ' salas | ' + (sm1.bossesKilledCount || 0) + ' jefes</strong></div>',
      '    <div class="eye-kv"><span>Muertes en Sesión:</span><strong style="color:#f87171;">' + (sm1.deathsCount || 0) + '</strong></div>',
      '    <div class="eye-kv"><span>Calor Judicial Acumulado:</span><strong style="color:#fb923c;">' + (sm1.baseHeatLevel || 0).toFixed(1) + ' / 100</strong></div>',
      '    <div class="eye-kv"><span>Base Inicial (E0):</span><strong>' + Math.round(s0.maxHp) + ' HP + ' + Math.round(s0.shield) + ' Esc | ' + s0.totalRelics + ' Rel</strong></div>',
      '  </div>',

      '  <div class="eye-card">',
      '    <div class="eye-card-title">🚪 ESTADOS 1 & 2 (SALA ACTUAL / 50%)</div>',
      '    <div class="eye-kv"><span>Sala Actual / Reloj Sala:</span><strong>' + s1.roomType + ' | ' + s1.roomClockSeconds.toFixed(1) + 's</strong></div>',
      '    <div class="eye-kv"><span>Entrada: Vit / Enem / DPS:</span><strong>' + Math.round(s1.entryVitality) + ' | ' + s1.totalEnemiesInitial + ' | x' + (s1.entryDpsPower || 1).toFixed(1) + '</strong></div>',
      '    <div class="eye-kv"><span>Midpoint (50% Muertos):</span><strong>' + (s2.triggered ? ('SÍ (' + s2.timeElapsedFirstHalf.toFixed(1) + 's)') : 'Pendiente') + '</strong></div>',
      '    <div class="eye-kv"><span>Vitalidad Perdida al 50%:</span><strong>-' + Math.round(s2.hpLostFirstHalf) + ' HP (' + ((s2.percentLostFirstHalf || 0) * 100).toFixed(1) + '%)</strong></div>',
      '    <div class="eye-kv"><span>KPS 1ra Mitad:</span><strong>' + s2.kpsFirstHalf.toFixed(2) + ' enem/s</strong></div>',
      '  </div>',

      '  <div class="eye-card">',
      '    <div class="eye-card-title">🏁 ESTADO 3 (ACTA FORENSE FINAL)</div>',
      '    <div class="eye-kv"><span>Última Sala:</span><strong>' + (s3.completed ? 'SÍ' : 'En curso') + ' (' + s3.totalTimeEmployed.toFixed(2) + 's)</strong></div>',
      '    <div class="eye-kv"><span>Daño / % Tanque Perdido:</span><strong>-' + Math.round(s3.totalDamageTaken) + ' HP (' + ((s3.percentVitalityLost || 0) * 100).toFixed(1) + '%)</strong></div>',
      '    <div class="eye-kv"><span>DTPS / KPS Total:</span><strong style="color:#facc15;">' + s3.dtpsTotal.toFixed(2) + '/s | ' + s3.kpsTotal.toFixed(2) + ' k/s</strong></div>',
      '    <div class="eye-kv"><span>Ratio Ritmo (Slowdown):</span><strong>x' + s3.combatSlowdownRatio.toFixed(2) + '</strong></div>',
      '    <div class="eye-kv"><span>DPS Potencial Snapshot:</span><strong>x' + (s3.potentialDpsSnapshot || 1).toFixed(2) + '</strong></div>',
      '  </div>',

      '  <div class="eye-card" style="border-color: rgba(239, 68, 68, 0.45);">',
      '    <div class="eye-card-title" style="color:#f87171;">🔴 BROTHER EYE (EL FISCAL SÁDICO)</div>',
      '    <div class="eye-kv"><span>Acusación Total:</span><strong style="color:#f87171;font-size:0.85rem;">' + cd.prosecutorScore + ' pts</strong></div>',
      '    <div class="eye-kv"><span>Calor Aplicado (+Run):</span><strong>+' + cd.heatApplied + ' pts</strong></div>',
      '    <div style="margin-top:4px;border-top:1px solid #1e293b;padding-top:4px;">' + prosList + '</div>',
      '  </div>',

      '  <div class="eye-card" style="border-color: rgba(59, 130, 246, 0.45);">',
      '    <div class="eye-card-title" style="color:#60a5fa;">🔵 JUSTICE EYE (ABOGADO DEFENSOR)</div>',
      '    <div class="eye-kv"><span>Defensa / Clemencia:</span><strong style="color:#60a5fa;font-size:0.85rem;">' + cd.defenderScore + ' pts</strong></div>',
      '    <div class="eye-kv"><span>Margen Debate (F - D):</span><strong>' + (cd.debateMargin >= 0 ? '+' : '') + cd.debateMargin + '</strong></div>',
      '    <div style="margin-top:4px;border-top:1px solid #1e293b;padding-top:4px;">' + defList + '</div>',
      '  </div>',

      '  <div class="eye-card" style="border-color: rgba(250, 204, 21, 0.45);">',
      '    <div class="eye-card-title" style="color:#facc15;">🎲 DADOS DEL CAOS & VEREDICTO</div>',
      '    <div class="eye-kv"><span>Sentencia Activa:</span><span class="eye-regime-pill ' + regimeClass + '">' + s4.regime + '</span></div>',
      '    <div class="eye-kv"><span>Dado d100 / Turbulencia:</span><strong>' + (s4.diceStats.chaosD100 || 50) + '/100 | x' + (s4.diceStats.turbulenceMult || 1).toFixed(2) + '</strong></div>',
      '    <div class="eye-kv"><span>Cant / HP Enemigos:</span><strong>x' + s4.nextRoomModifiers.enemyCountMultiplier + ' | HP x' + (s4.nextRoomModifiers.enemyHpMultiplier || 1) + '</strong></div>',
      '    <div class="eye-kv"><span>Daño / Vel / Élite+:</span><strong>x' + s4.nextRoomModifiers.enemyDamageMultiplier + ' | x' + s4.nextRoomModifiers.enemySpeedMultiplier + ' | ' + Math.round((s4.nextRoomModifiers.elitePromotionChance || 0) * 100) + '%</strong></div>',
      '    <div class="eye-kv"><span>Bono Corazones / R(v2):</span><strong>+' + Math.round((s4.nextRoomModifiers.heartDropBonus || 0) * 100) + '% | R=' + s4.performanceR + '</strong></div>',
      '  </div>',

      '  <div class="eye-card" style="grid-column: 1 / -1; border-color: rgba(192, 132, 252, 0.4);">',
      '    <div class="eye-card-title" style="color:#c084fc;">🧠 MEMORIA A CORTO PLAZO — PATRONES (Borrón en ' + roomsLeft + ' sala(s) o al cambiar de nivel)</div>',
      '    <div class="eye-kv" style="flex-wrap:wrap;gap:10px;">',
      '      <span>Ciclo Ventana: <strong>' + roomsSince + ' / ' + resetEvery + ' salas</strong> (Último reset: ' + (mem.lastResetReason || 'INIT') + ')</span>',
      '      <span>Ofensiva: <strong>Proy:' + act.projectileShots + ' | Rayo:' + act.beamShots + ' | Melee:' + act.meleeSwings + ' | Parry:' + act.parrySuccess + '</strong></span>',
      '      <span>Dash (' + act.dashes + '): <strong>I:' + dirs.LEFT + ' D:' + dirs.RIGHT + ' Ar:' + dirs.UP + ' Ab:' + dirs.DOWN + '</strong></span>',
      '    </div>',
      '    <div class="eye-kv" style="margin-top:3px;border-top:1px dashed #334155;padding-top:4px;flex-wrap:wrap;gap:8px;">',
      '      <span>Patrón Detectado: <strong style="color:#e879f9;">' + (mem.dominantPatternLabel || 'ESTILO VARIADO') + '</strong></span>',
      '      <span>Contramedida IA: <strong style="color:#38bdf8;">' + (mem.countermeasurePlan || 'Ninguna') + '</strong></span>',
      '    </div>',
      '  </div>',
      '  <div class="eye-card" style="grid-column: 1 / -1; border-color: rgba(56, 189, 248, 0.42);">',
      '    <div class="eye-card-title" style="color:#38bdf8;">📜 EXPEDIENTE GLOBAL DEL JUGADOR (LARGO PLAZO — RUN + NG+' + (ledger.ngPlusCyclesCarried || 0) + ')</div>',
      '    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px 12px;font-size:0.70rem;">',
      '      <div class="eye-kv"><span>Cambios Arma:</span><strong>' + (ledger.weaponSwitchCount || 0) + '</strong></div>',
      '      <div class="eye-kv"><span>Daño Total Run:</span><strong style="color:#f87171;">' + Math.round(ledger.totalDamageReceived || 0) + ' HP</strong></div>',
      '      <div class="eye-kv"><span>Enemigos Abatidos:</span><strong style="color:#4ade80;">' + (ledger.totalEnemiesKilled || 0) + '</strong></div>',
      '      <div class="eye-kv"><span>Al Límite (<=22%):</span><strong style="color:#fbbf24;">' + (ledger.nearDeathCount || 0) + ' vec.</strong></div>',
      '      <div class="eye-kv"><span>Prom. Salas:</span><strong>' + (ledger.avgRoomClearTime ? ledger.avgRoomClearTime + 's' : '-') + '</strong></div>',
      '      <div class="eye-kv"><span>Prom. Jefes:</span><strong>' + (ledger.avgBossKillTime ? ledger.avgBossKillTime + 's' : '-') + '</strong></div>',
      '      <div class="eye-kv"><span>Reliquias Hist.:</span><strong style="color:#c084fc;">' + (ledger.totalRelicsEverGained || 0) + ' (Act:' + currentRelicsCount + ')</strong></div>',
      '      <div class="eye-kv"><span>Dashes / Perf.:</span><strong>' + (ledger.totalDashesUsed || 0) + ' / ' + (ledger.totalPerfectDodges || 0) + '</strong></div>',
      '    </div>',
      '    <div class="eye-kv" style="margin-top:4px;border-top:1px dashed #334155;padding-top:4px;flex-wrap:wrap;gap:8px;align-items:center;">',
      '      <span>Némesis Personal: <strong style="color:#fb7185;">' + (ledger.nemesisArchetype || 'Sin Némesis aún') + '</strong></span>',
      '      <span style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;">Directivas: ' + directivesPills + '</span>',
      '    </div>',
      '  </div>',
      (function () {
        if (typeof HiveMindSystem === 'undefined') return '';
        var hm = HiveMindSystem.getTelemetry();
        var o = hm.oracle || {};
        var q = o.q || {};
        var t4 = hm.table4Rooms || {};
        var net = hm.interHiveNetwork || {};
        var sh = hm.subHives || {};
        var st = hm.stats || {};
        var qKeys = Object.keys(q);
        var boolHtml = qKeys.map(function (k) {
          var on = Boolean(q[k]);
          return '<span style="padding:1px 5px;border-radius:4px;font-size:0.62rem;border:1px solid ' + (on ? '#f59e0b' : '#334155') + ';background:' + (on ? 'rgba(245,158,11,0.2)' : 'rgba(15,23,42,0.7)') + ';color:' + (on ? '#fde68a' : '#64748b') + ';">' + escapeHtml(k) + ':' + (on ? '1' : '0') + '</span>';
        }).join('');
        var subHtml = ['MELEE', 'RANGED', 'CHARGER', 'ELITE', 'BOSS'].map(function (t) {
          var h = sh[t] || {};
          return '<span style="font-size:0.67rem;"><strong>' + t + '</strong>(' + (h.count || 0) + ', ex:' + (h.exhaustedCount || 0) + '): <em style="color:#38bdf8;">' + escapeHtml(h.directive || '-') + '</em></span>';
        }).join(' | ');
        return [
          '  <div class="eye-card" style="grid-column: 1 / -1; border-color: rgba(245, 158, 11, 0.45);">',
          '    <div class="eye-card-title" style="color:#fbbf24;">🐝 MENTE COLMENA & ORÁCULO GLOBAL (FIBONACCI [3,5,8,1] · SALAS 4/4)</div>',
          '    <div class="eye-kv" style="flex-wrap:wrap;gap:10px;">',
          '      <span>Sector Vago (3x3): <strong style="color:#fbbf24;">' + escapeHtml(o.sectorLabel || 'CENTER') + ' (' + (o.playerMoveTrend || 'STATIC') + ' / ' + (o.playerDistZone || 'MID') + ')</strong></span>',
          '      <span>Vivos: <strong>' + (o.livingEnemies || 0) + '/' + (o.initialEnemies || 0) + ' (' + Math.round((o.aliveRatio || 1) * 100) + '%)</strong></span>',
          '      <span>Ahorro CPU Fibonacci: <strong style="color:#4ade80;">' + (st.cpuSavedPct || 0) + '%</strong> (' + (st.skippedTicks || 0) + '/' + (st.totalTicks || 0) + ' saltados)</span>',
          '      <span>Tabla 4 Salas: <strong>' + (t4.roomsTracked || 0) + '/4</strong> | Sincronías Extremas: <strong style="color:#f87171;">' + (t4.extremeSyncTriggers || 0) + '</strong></span>',
          '    </div>',
          '    <div class="eye-kv" style="margin-top:3px;flex-wrap:wrap;gap:6px;">',
          '      <span>Sub-Colmenas: ' + subHtml + '</span>',
          '    </div>',
          '    <div class="eye-kv" style="margin-top:3px;border-top:1px dashed #334155;padding-top:4px;">',
          '      <span>Red Inter-Colmena (' + (net.milestonePct || 100) + '%): <strong style="color:#fde047;">' + escapeHtml(net.lastTip || '-') + '</strong></span>',
          '    </div>',
          '    <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:5px;">' + boolHtml + '</div>',
          '  </div>'
        ].join('\n');
      })(),
      historyHtml,
      '</div>'
    ].join('\n');
  };

  InGameDevConsole.prototype.renderLogsTab = function () {
    var self = this;
    var body = document.getElementById('dev-console-body');
    if (!body) return;

    var toolbarHtml = [
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">',
      '  <span style="font-size:0.72rem;color:#94a3b8;">Total registros en sesión: <strong style="color:#f8fafc;">' + this.logs.length + '</strong> (Salas evaluadas: <strong style="color:#38bdf8;">' + ((typeof BrotherEye !== 'undefined' && BrotherEye.roomHistory) ? BrotherEye.roomHistory.length : 0) + '</strong>)</span>',
      '  <button type="button" id="dev-logs-export-pdf-btn" class="dev-tab-btn" style="border-color:#22c55e;color:#86efac;">📄 EXPORTAR LOGS ENTEROS COMO PDF</button>',
      '</div>'
    ].join('\n');

    if (this.logs.length === 0) {
      body.innerHTML = toolbarHtml + '<div style="color:#94a3b8;font-size:0.75rem;">Sin registros todavía (puedes exportar igualmente el estado actual de BrotherEye como PDF).</div>';
    } else {
      var itemsHtml = this.logs.map(function (item) {
        return '<div class="dev-log-item ' + item.level + '">' +
          '<span style="color:#64748b;">[' + escapeHtml(item.time) + ']</span> ' +
          '<strong>[' + escapeHtml(item.level) + ']</strong> ' +
          escapeHtml(item.text) +
          '</div>';
      }).join('');

      body.innerHTML = toolbarHtml + '<div class="dev-log-list">' + itemsHtml + '</div>';
    }

    var btnExport = document.getElementById('dev-logs-export-pdf-btn');
    if (btnExport) {
      btnExport.addEventListener('click', function () {
        self.exportLogsAsPdf();
      });
    }
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
      '    <span>🔥 FORZAR "SENTENCIA MÁXIMA" (FISCAL)</span>',
      '    <small>Dicta Sentencia Máxima del Tribunal (Cant x2.10, HP Enemigo x2.60, Daño x1.65, Élites +30%).</small>',
      '  </button>',
      '  <button type="button" class="dev-tool-btn" data-action="FORCE_CURSE">',
      '    <span>💀 FORZAR "MALDICIÓN DEL TRIBUNAL"</span>',
      '    <small>Simula el crítico sádico de los Dados del Caos para la próxima sala.</small>',
      '  </button>',
      '  <button type="button" class="dev-tool-btn" data-action="FORCE_BLESSING">',
      '    <span>✨ FORZAR "BENDICIÓN DIVINA"</span>',
      '    <small>Simula el crítico benigno de los Dados del Caos (tregua +25% drops de corazón).</small>',
      '  </button>',
      '  <button type="button" class="dev-tool-btn" data-action="RESET_SHORT_MEMORY">',
      '    <span>🧠 LIMPIAR MEMORIA A CORTO PLAZO</span>',
      '    <small>Fuerza borrón y cuenta nueva de los patrones tácticos registrados.</small>',
      '  </button>',
      '  <button type="button" class="dev-tool-btn" data-action="ADAPT_CURRENT_ROOM">',
      '    <span>👁️ APLICAR DIFICULTAD A ESTA SALA AHORA</span>',
      '    <small>Inyecta inmediatamente los enemigos extra y el ajuste de daño/velocidad en la habitación actual.</small>',
      '  </button>',
      '  <button type="button" class="dev-tool-btn" data-action="GRANT_METEOR_BUILD">',
      '    <span>🌋 PROBAR BUILD METEORITOS (STRESS TEST)</span>',
      '    <small>Otorga Fuego Nvl 3 + Pólvora Inestable + +3 Proyectiles para verificar que no se congele la sala.</small>',
      '  </button>',
      '  <button type="button" class="dev-tool-btn" data-action="EXPORT_PDF" style="border-color:rgba(34,197,94,0.55);">',
      '    <span style="color:#86efac;">📄 EXPORTAR LOGS ENTEROS A PDF</span>',
      '    <small>Genera reporte completo (BrotherEye, Fiscal/Defensor, Expediente Global, todas las salas y consola).</small>',
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
    if (action === 'EXPORT_PDF') {
      this.exportLogsAsPdf();
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
        BrotherEye.state4_adaptive.regime = 'SENTENCIA_MAXIMA';
        BrotherEye.state4_adaptive.performanceR = 94.0;
        BrotherEye.state4_adaptive.delta = 29.0;
        BrotherEye.state4_adaptive.nextRoomModifiers.enemyCountMultiplier = 2.10;
        BrotherEye.state4_adaptive.nextRoomModifiers.enemyHpMultiplier = 2.60;
        BrotherEye.state4_adaptive.nextRoomModifiers.enemyDamageMultiplier = 1.65;
        BrotherEye.state4_adaptive.nextRoomModifiers.enemySpeedMultiplier = 1.22;
        BrotherEye.state4_adaptive.nextRoomModifiers.elitePromotionChance = 0.30;
        this.updateBadge();
        this.log('EYE', 'Sentencia Máxima armada (Cant x2.10, HP x2.60, Daño x1.65, Élites 30%).');
        if (game.ui) game.ui.showToast('🔥 Sentencia Máxima del Tribunal preparada para la próxima sala');
      }

    } else if (action === 'FORCE_CURSE') {
      if (typeof BrotherEye !== 'undefined') {
        BrotherEye.state4_adaptive.regime = 'MALDICION_TRIBUNAL';
        BrotherEye.state4_adaptive.diceStats.chaosD100 = 98;
        BrotherEye.state4_adaptive.nextRoomModifiers.enemyCountMultiplier = 2.40;
        BrotherEye.state4_adaptive.nextRoomModifiers.enemyHpMultiplier = 2.75;
        BrotherEye.state4_adaptive.nextRoomModifiers.enemyDamageMultiplier = 1.80;
        BrotherEye.state4_adaptive.nextRoomModifiers.enemySpeedMultiplier = 1.26;
        BrotherEye.state4_adaptive.nextRoomModifiers.elitePromotionChance = 0.32;
        this.updateBadge();
        this.log('EYE', 'Maldición del Tribunal armada para la próxima sala.');
        if (game.ui) game.ui.showToast('💀 Maldición del Tribunal armada para la próxima sala');
      }

    } else if (action === 'FORCE_BLESSING') {
      if (typeof BrotherEye !== 'undefined') {
        BrotherEye.state4_adaptive.regime = 'BENDICION_DIVINA';
        BrotherEye.state4_adaptive.diceStats.chaosD100 = 4;
        BrotherEye.state4_adaptive.nextRoomModifiers.enemyCountMultiplier = 0.72;
        BrotherEye.state4_adaptive.nextRoomModifiers.enemyHpMultiplier = 0.85;
        BrotherEye.state4_adaptive.nextRoomModifiers.enemyDamageMultiplier = 0.75;
        BrotherEye.state4_adaptive.nextRoomModifiers.enemySpeedMultiplier = 0.90;
        BrotherEye.state4_adaptive.nextRoomModifiers.elitePromotionChance = 0.0;
        BrotherEye.state4_adaptive.nextRoomModifiers.heartDropBonus = 0.25;
        this.updateBadge();
        this.log('EYE', 'Bendición Divina armada para la próxima sala (+25% corazones).');
        if (game.ui) game.ui.showToast('✨ Bendición Divina armada para la próxima sala');
      }

    } else if (action === 'RESET_SHORT_MEMORY') {
      if (typeof BrotherEye !== 'undefined' && typeof BrotherEye.resetShortTermMemory === 'function') {
        BrotherEye.resetShortTermMemory('MANUAL_CONSOLE');
        this.log('EYE', 'Memoria a corto plazo borrada manualmente (borrón y cuenta nueva).');
        if (game.ui) game.ui.showToast('🧠 Memoria táctica de BrotherEye reiniciada');
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

  InGameDevConsole.prototype.buildFullReportHtml = function () {
    var now = new Date();
    var pad = function (n) { return n < 10 ? '0' + n : String(n); };
    var dateStamp = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + ' ' +
      pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
    var game = window.activeGameInstance;
    var p = game && game.player ? game.player : null;
    var r = game && game.currentRoom ? game.currentRoom : null;

    var st = (typeof BrotherEye !== 'undefined' && typeof BrotherEye.getStatus === 'function')
      ? BrotherEye.getStatus()
      : null;
    var sm1 = (st && st.stateMinus1_GlobalClock) || {};
    var s0 = (st && st.state0_Initial) || {};
    var s1 = (st && st.state1_Enter) || {};
    var s3 = (st && st.state3_Complete) || {};
    var s4 = (st && st.state4_Adaptive) || {};
    var cd = s4.courtDebate || {};
    var ds = s4.diceStats || {};
    var mod = s4.nextRoomModifiers || {};
    var mem = (st && st.shortTermMemory) || {};
    var ledger = (st && st.globalLedger) || {};
    var directives = (st && st.activeGlobalDirectives) || [];
    var history = (typeof BrotherEye !== 'undefined' && Array.isArray(BrotherEye.roomHistory))
      ? BrotherEye.roomHistory
      : [];

    var relicsStr = 'Ninguna';
    if (p && p.itemManager && Array.isArray(p.itemManager.ownedRelics) && p.itemManager.ownedRelics.length > 0) {
      relicsStr = p.itemManager.ownedRelics.map(function (rel) {
        return escapeHtml(rel.name || rel.id) + (rel.level > 1 ? ' (Nv.' + rel.level + ')' : '');
      }).join(', ');
    }

    var weaponsStr = 'N/A';
    if (p && Array.isArray(p.weapons)) {
      weaponsStr = p.weapons.map(function (w, idx) {
        var mark = idx === p.currentWeaponIndex ? '★ ' : '';
        return mark + escapeHtml(w.name || w.id || ('Slot ' + (idx + 1)));
      }).join(' | ');
    }

    var nemesisTable = 'Sin daño registrado';
    if (ledger.nemesisByArchetype && Object.keys(ledger.nemesisByArchetype).length > 0) {
      nemesisTable = Object.keys(ledger.nemesisByArchetype).map(function (k) {
        return escapeHtml(k) + ': ' + ledger.nemesisByArchetype[k] + ' pts';
      }).join(' | ');
    }

    var historyRowsHtml = history.length > 0
      ? history.map(function (h) {
          var m = h.nextModifiers || {};
          var dirsList = Array.isArray(h.directives) && h.directives.length > 0 ? h.directives.join(', ') : '-';
          return '<tr>' +
            '<td>#' + escapeHtml(h.roomNumber) + '</td>' +
            '<td>' + escapeHtml(h.roomType) + '</td>' +
            '<td>' + escapeHtml(h.globalTime) + 's</td>' +
            '<td>' + escapeHtml(h.roomTime) + 's</td>' +
            '<td>-' + escapeHtml(h.percentLost) + '%</td>' +
            '<td>' + escapeHtml(h.prosecutorScore) + ' vs ' + escapeHtml(h.defenderScore) + '</td>' +
            '<td>' + escapeHtml(h.chaosD100) + '</td>' +
            '<td><strong>' + escapeHtml(h.regime) + '</strong></td>' +
            '<td>x' + escapeHtml(m.count) + ' / HP x' + escapeHtml(m.hp) + ' / Dmg x' + escapeHtml(m.damage) + ' / Spd x' + escapeHtml(m.speed) + '</td>' +
            '<td>' + escapeHtml(dirsList) + ' | ' + escapeHtml(h.memoryNote || '') + '</td>' +
          '</tr>';
        }).join('')
      : '<tr><td colspan="10">Sin habitaciones evaluadas en esta sesión todavía.</td></tr>';

    var chronoLogs = this.logs.slice().reverse();
    var logsRowsHtml = chronoLogs.length > 0
      ? chronoLogs.map(function (l) {
          var cls = l.level === 'ERROR' ? 'err' : (l.level === 'WARN' ? 'warn' : (l.level === 'EYE' ? 'eye' : ''));
          return '<tr class="' + cls + '">' +
            '<td>' + escapeHtml(l.time) + '</td>' +
            '<td><strong>' + escapeHtml(l.level) + '</strong></td>' +
            '<td>' + escapeHtml(l.text) + '</td>' +
          '</tr>';
        }).join('')
      : '<tr><td colspan="3">Sin entradas en el log de consola.</td></tr>';

    var activeDirectivesStr = directives.length > 0
      ? directives.map(function (d) { return escapeHtml(d.id); }).join(', ')
      : 'Ninguna';

    var playerSummary = p
      ? ('HP ' + Math.round(p.hp) + '/' + Math.round(p.maxHp) + ' | Escudo ' + Math.round(p.shield || 0) +
         ' | Estamina ' + Math.round(p.stamina || 0) + '/' + Math.round(p.maxStamina || 100) +
         ' | Oro ' + (p.coins || 0) + ' | Llaves ' + (p.keys || 0) +
         ' | Dmg x' + (p.damageMultiplier || 1).toFixed(2) + ' | VelAtq x' + (p.attackSpeedMultiplier || 1).toFixed(2) +
         ' | Proy +' + (p.extraProjectiles || 0))
      : 'Partida no iniciada en runtime';

    var hm = (typeof HiveMindSystem !== 'undefined') ? HiveMindSystem.getTelemetry() : null;
    var hiveSummaryHtml = hm
      ? ('<h2>2B. MENTE COLMENA & FIBONACCI (v3.5)</h2><div class="box">' +
         '<div class="kv"><strong>Sector Vago:</strong> ' + escapeHtml(hm.oracle.sectorLabel || 'CENTER') + ' (' + escapeHtml(hm.oracle.playerMoveTrend || 'STATIC') + ') | <strong>Vivos:</strong> ' + escapeHtml(hm.oracle.livingEnemies) + '/' + escapeHtml(hm.oracle.initialEnemies) + ' | <strong>Ahorro CPU Fibonacci:</strong> ' + escapeHtml(hm.stats.cpuSavedPct || 0) + '%</div>' +
         '<div class="kv"><strong>Tabla 4 Salas:</strong> ' + escapeHtml(hm.table4Rooms.roomsTracked) + '/4 (Reset: ' + escapeHtml(hm.table4Rooms.lastResetReason) + ') | <strong>Sincronías Extremas:</strong> ' + escapeHtml(hm.table4Rooms.extremeSyncTriggers) + '</div>' +
         '<div class="kv"><strong>Tip Red Inter-Colmena (' + escapeHtml(hm.interHiveNetwork.milestonePct) + '%):</strong> ' + escapeHtml(hm.interHiveNetwork.lastTip || '-') + '</div>' +
         '</div>')
      : '';

    var locationSummary = game
      ? ('Sección ' + game.currentSection + ' - Nivel ' + game.currentLevel + ' | Sala: ' + (r ? (r.type + ' (' + (r.templateName || r.layoutType || 'proc') + ')') : 'N/A'))
      : 'N/A';

    return [
      '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">',
      '<title>BrotherEye Logs ' + escapeHtml(dateStamp) + '</title>',
      '<style>',
      '  @page { size: A4 portrait; margin: 11mm; }',
      '  * { box-sizing: border-box; }',
      '  body { font-family: Consolas, "Courier New", monospace; color: #0f172a; background: #fff; font-size: 10.5px; line-height: 1.38; margin: 0; padding: 14px; }',
      '  h1 { font-size: 16px; margin: 0 0 4px; color: #0f172a; border-bottom: 2px solid #0284c7; padding-bottom: 4px; }',
      '  h2 { font-size: 12px; margin: 12px 0 5px; color: #0369a1; border-bottom: 1px solid #cbd5e1; padding-bottom: 2px; page-break-after: avoid; }',
      '  .meta { font-size: 10px; color: #475569; margin-bottom: 8px; }',
      '  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }',
      '  .box { border: 1px solid #cbd5e1; border-radius: 5px; padding: 7px 9px; background: #f8fafc; page-break-inside: avoid; }',
      '  .kv { margin: 2px 0; }',
      '  table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 9.5px; }',
      '  th, td { border: 1px solid #cbd5e1; padding: 3px 5px; text-align: left; vertical-align: top; word-break: break-word; }',
      '  th { background: #e2e8f0; color: #0f172a; font-weight: bold; }',
      '  tr { page-break-inside: avoid; }',
      '  tr.err td { background: #fee2e2; color: #991b1b; }',
      '  tr.warn td { background: #fef9c3; color: #854d0e; }',
      '  tr.eye td { background: #f3e8ff; color: #581c87; }',
      '  ul { margin: 3px 0 0 16px; padding: 0; }',
      '</style></head><body>',
      '<h1>👁️ REPORTE COMPLETO DE TELEMETRÍA Y LOGS — BROTHER EYE</h1>',
      '<div class="meta"><strong>Generado:</strong> ' + escapeHtml(dateStamp) + ' | <strong>Motor:</strong> ' + escapeHtml(st ? st.version : 'N/A') + ' | <strong>Origen:</strong> ' + escapeHtml(window.location.href) + '</div>',
      '<div class="box">',
      '  <div class="kv"><strong>Ubicación:</strong> ' + escapeHtml(locationSummary) + '</div>',
      '  <div class="kv"><strong>Jugador:</strong> ' + escapeHtml(playerSummary) + '</div>',
      '  <div class="kv"><strong>Armas:</strong> ' + weaponsStr + '</div>',
      '  <div class="kv"><strong>Reliquias:</strong> ' + relicsStr + '</div>',
      '</div>',
      '<h2>1. TRIBUNAL JUDICIAL (ESTADOS -1 AL 4) & MEMORIA A CORTO PLAZO</h2>',
      '<div class="grid2">',
      '  <div class="box">',
      '    <div class="kv"><strong>Reloj Global (E-1):</strong> ' + escapeHtml(typeof sm1.elapsedSeconds === 'number' ? sm1.elapsedSeconds.toFixed(1) : 0) + 's | Salas: #' + escapeHtml(sm1.roomsClearedCount || 0) + ' | Jefes: ' + escapeHtml(sm1.bossesKilledCount || 0) + ' | Muertes: ' + escapeHtml(sm1.deathsCount || 0) + '</div>',
      '    <div class="kv"><strong>Calor Judicial:</strong> ' + escapeHtml(typeof sm1.baseHeatLevel === 'number' ? sm1.baseHeatLevel.toFixed(1) : 0) + ' / 100 | <strong>Base E0:</strong> ' + escapeHtml(Math.round(s0.maxHp || 0)) + ' HP + ' + escapeHtml(Math.round(s0.shield || 0)) + ' Esc</div>',
      '    <div class="kv"><strong>Sala Actual (E1/E3):</strong> ' + escapeHtml(s1.roomType || '-') + ' | Reloj Sala: ' + escapeHtml(typeof s1.roomClockSeconds === 'number' ? s1.roomClockSeconds.toFixed(1) : 0) + 's | Tiempo Última: ' + escapeHtml(typeof s3.totalTimeEmployed === 'number' ? s3.totalTimeEmployed.toFixed(2) : 0) + 's | Vit Perdida: ' + escapeHtml(((s3.percentVitalityLost || 0) * 100).toFixed(1)) + '%</div>',
      '    <div class="kv"><strong>Memoria Corta:</strong> ' + escapeHtml(mem.roomsSinceReset || 0) + '/' + escapeHtml(mem.resetIntervalRooms || 4) + ' salas (Reset: ' + escapeHtml(mem.lastResetReason || '-') + ') | Patrón: ' + escapeHtml(mem.dominantPatternLabel || 'VARIADO') + '</div>',
      '  </div>',
      '  <div class="box">',
      '    <div class="kv"><strong>Sentencia Activa:</strong> ' + escapeHtml(s4.regime || '-') + ' | <strong>Ganador:</strong> ' + escapeHtml(cd.winner || '-') + ' | <strong>d100:</strong> ' + escapeHtml(ds.chaosD100 || '-') + ' (Turb x' + escapeHtml(ds.turbulenceMult || 1) + ')</div>',
      '    <div class="kv"><strong>Fiscal vs Defensor:</strong> ' + escapeHtml(cd.prosecutorScore || 0) + ' vs ' + escapeHtml(cd.defenderScore || 0) + ' (Margen ' + escapeHtml(cd.debateMargin || 0) + ', Calor +' + escapeHtml(cd.heatApplied || 0) + ')</div>',
      '    <div class="kv"><strong>Modificadores Próxima Sala:</strong> Cant x' + escapeHtml(mod.enemyCountMultiplier || 1) + ' | HP x' + escapeHtml(mod.enemyHpMultiplier || 1) + ' | Dmg x' + escapeHtml(mod.enemyDamageMultiplier || 1) + ' | Spd x' + escapeHtml(mod.enemySpeedMultiplier || 1) + ' | Élite ' + Math.round((mod.elitePromotionChance || 0) * 100) + '%</div>',
      '    <div class="kv"><strong>Razones Fiscal:</strong> ' + escapeHtml((cd.prosecutorReasons || []).join(' ; ') || 'Ninguna') + '</div>',
      '    <div class="kv"><strong>Razones Defensor:</strong> ' + escapeHtml((cd.defenderReasons || []).join(' ; ') || 'Ninguna') + '</div>',
      '  </div>',
      '</div>',
      '<h2>2. EXPEDIENTE GLOBAL DEL JUGADOR (LARGO PLAZO) & DIRECTIVAS</h2>',
      '<div class="box">',
      '  <div class="kv"><strong>Cambios Arma:</strong> ' + escapeHtml(ledger.weaponSwitchCount || 0) + ' | <strong>Daño Total Recibido:</strong> ' + escapeHtml(Math.round(ledger.totalDamageReceived || 0)) + ' HP | <strong>Enemigos Abatidos:</strong> ' + escapeHtml(ledger.totalEnemiesKilled || 0) + ' | <strong>Veces al Límite (<=22% HP):</strong> ' + escapeHtml(ledger.nearDeathCount || 0) + '</div>',
      '  <div class="kv"><strong>Prom. Salas:</strong> ' + escapeHtml(ledger.avgRoomClearTime || 0) + 's | <strong>Prom. Jefes:</strong> ' + escapeHtml(ledger.avgBossKillTime || 0) + 's | <strong>Reliquias Históricas:</strong> ' + escapeHtml(ledger.totalRelicsEverGained || 0) + ' (Sacrificios: ' + escapeHtml(ledger.forbiddenSacrificesCount || 0) + ') | <strong>Dashes / Perf.:</strong> ' + escapeHtml(ledger.totalDashesUsed || 0) + ' / ' + escapeHtml(ledger.totalPerfectDodges || 0) + ' | <strong>Ciclos NG+:</strong> ' + escapeHtml(ledger.ngPlusCyclesCarried || 0) + '</div>',
      '  <div class="kv"><strong>Némesis Personal:</strong> ' + escapeHtml(ledger.nemesisArchetype || 'Ninguno') + ' (' + nemesisTable + ')</div>',
      '  <div class="kv"><strong>Directivas Activas:</strong> ' + activeDirectivesStr + '</div>',
      '</div>',
      hiveSummaryHtml,
      '<h2>3. HISTORIAL COMPLETO DE HABITACIONES EVALUADAS (' + history.length + ' salas)</h2>',
      '<table><thead><tr><th>Sala</th><th>Tipo</th><th>T.Global</th><th>T.Sala</th><th>Vit Perd.</th><th>Debate (F vs D)</th><th>d100</th><th>Régimen</th><th>Multiplicadores</th><th>Directivas & Memoria</th></tr></thead><tbody>',
      historyRowsHtml,
      '</tbody></table>',
      '<h2>4. LOGS COMPLETOS DE CONSOLA Y ERRORES (' + chronoLogs.length + ' entradas, Errores: ' + this.errorCount + ')</h2>',
      '<table><thead><tr><th style="width:70px;">Hora</th><th style="width:65px;">Nivel</th><th>Mensaje</th></tr></thead><tbody>',
      logsRowsHtml,
      '</tbody></table>',
      '</body></html>'
    ].join('\n');
  };

  InGameDevConsole.prototype.exportLogsAsPdf = function () {
    try {
      var html = this.buildFullReportHtml();
      var now = new Date();
      var pad = function (n) { return n < 10 ? '0' + n : String(n); };
      var pdfTitle = 'BrotherEye_Logs_' + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '_' + pad(now.getHours()) + pad(now.getMinutes());

      var oldFrame = document.getElementById('dev-pdf-print-frame');
      if (oldFrame && oldFrame.parentNode) {
        oldFrame.parentNode.removeChild(oldFrame);
      }

      var iframe = document.createElement('iframe');
      iframe.id = 'dev-pdf-print-frame';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.visibility = 'hidden';
      document.body.appendChild(iframe);

      var doc = iframe.contentWindow.document;
      doc.open();
      doc.write(html);
      doc.close();

      var prevTitle = document.title;
      document.title = pdfTitle;

      var triggerPrint = function () {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        } finally {
          setTimeout(function () {
            document.title = prevTitle;
          }, 800);
        }
      };

      setTimeout(triggerPrint, 60);
      this.log('INFO', 'Exportación PDF disparada (' + (this.logs.length) + ' logs, ' +
        ((typeof BrotherEye !== 'undefined' && BrotherEye.roomHistory) ? BrotherEye.roomHistory.length : 0) + ' salas). Elegí "Guardar como PDF".');
      if (window.activeGameInstance && window.activeGameInstance.ui) {
        window.activeGameInstance.ui.showToast('📄 Abriendo diálogo PDF con todos los logs');
      }
      return true;
    } catch (err) {
      this.log('ERROR', 'No se pudo abrir la impresión PDF: ' + err.message);
      return false;
    }
  };

  root.devConsole = new InGameDevConsole();
}(typeof self !== 'undefined' ? self : this));
