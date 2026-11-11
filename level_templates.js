/**
 * ============================================================================
 * LEVEL_TEMPLATES.JS - SISTEMA DE PLANTILLAS DE SALA (13x9) Y SECCIONES DE PISO
 * ============================================================================
 * Permite diseñar habitaciones tácticas ("Plantillas de Sala") y secuencias de
 * habitaciones conectadas ("Secciones / Chunks de Piso") que se inyectan dentro
 * de la generación procedural de `DungeonFloor`.
 *
 * ----------------------------------------------------------------------------
 * GUÍA RÁPIDA PARA CREAR TUS PROPIAS SALAS (GRILLA 13 COLUMNAS x 9 FILAS):
 * ----------------------------------------------------------------------------
 * Cada sala tiene 13 columnas (0 a 12) y 9 filas (0 a 8).
 * Las 4 puertas estándar están en:
 *   - Norte (N): Columna 6, Fila 0
 *   - Sur   (S): Columna 6, Fila 8
 *   - Oeste (W): Columna 0, Fila 4
 *   - Este  (E): Columna 12, Fila 4
 *
 * LEYENDA DE CARACTERES:
 *   .  = Piso libre
 *   #  = Roca / Muro destructible (Cobertura sólida, bloquea balas)
 *   O  = Vasija destructible (Cobertura ligera, suelta monedas/corazones)
 *   ~  = Foso / Abismo intransitable (Se puede saltar con Dash [SHIFT])
 *   ^  = Trampa de Pinchos rítmica (Daño a jugador y enemigos)
 *   *  = Zona de Fuego (Daño continuo a jugador y enemigos)
 *   %  = Charco Venenoso (Ralentiza 50% y envenena a jugador y enemigos)
 *   S  = Francotirador (`ShooterEnemy`)
 *   C  = Embestidor (`ChargerEnemy`)
 *   F  = Volador (`FlyerEnemy`)
 *   P  = Divisible (`SplitterEnemy`)
 *   E  = Enemigo cuerpo a cuerpo (`Enemy`)
 *   X  = Minijefe Élite (`EliteEnemy`)
 *   ?  = Enemigo aleatorio del piso en esa posición exacta
 * ============================================================================
 */

(function (root) {
  var GRID_COLS = 13;
  var GRID_ROWS = 9;
  var STORAGE_KEY_CUSTOM_TEMPLATES = 'roguelike_custom_room_templates_v1';

  // Proporción de salas de combate que usan Plantillas de Autor (75%) vs Procedural Estructurado (25%)
  var AUTHORED_ROOM_CHANCE = 0.75;

  // ==========================================================================
  // 1. CATÁLOGO DE PLANTILLAS DE SALA (13x9) - EDITABLE POR EL AUTOR
  // ==========================================================================
  var BUILTIN_ROOM_TEMPLATES = [
    {
      id: 'CUATRO_PILARES',
      name: 'Los 4 Pilares',
      sectionTag: 'CLÁSICO',
      allowedTypes: ['NORMAL', 'HARD'],
      allowFlipX: true,
      allowFlipY: true,
      weight: 1.3,
      grid: [
        '.............',
        '.S.........S.',
        '..##.....##..',
        '..#O..E..O#..',
        '....C...C....',
        '..#O..E..O#..',
        '..##.....##..',
        '.S.........S.',
        '.............'
      ]
    },
    {
      id: 'TRINCHERA_CENTRAL',
      name: 'Trinchera Partida',
      sectionTag: 'COBERTURA',
      allowedTypes: ['NORMAL', 'HARD'],
      allowFlipX: true,
      allowFlipY: true,
      weight: 1.25,
      grid: [
        '.............',
        '..S...E...S..',
        '.#O.......O#.',
        '....P...P....',
        '..###...###..',
        '....C...C....',
        '.#O.......O#.',
        '..S...E...S..',
        '.............'
      ]
    },
    {
      id: 'PUENTE_ABISAL',
      name: 'Puente del Abismo',
      sectionTag: 'ABISMO',
      allowedTypes: ['NORMAL', 'HARD', 'HAZARD'],
      allowFlipX: true,
      allowFlipY: true,
      weight: 1.2,
      grid: [
        '.............',
        '.S..#...#..S.',
        '.~~~O...O~~~.',
        '.~~~..C..~~~.',
        '.....E.E.....',
        '.~~~..C..~~~.',
        '.~~~O...O~~~.',
        '.S..#...#..S.',
        '.............'
      ]
    },
    {
      id: 'BASTION_CRUZADO',
      name: 'Bastión en Cruz',
      sectionTag: 'FORTALEZA',
      allowedTypes: ['NORMAL', 'HARD', 'HAZARD'],
      allowFlipX: true,
      allowFlipY: true,
      weight: 1.2,
      grid: [
        '.............',
        '.S.##...##.S.',
        '...#O.^.O#...',
        '.....E.E.....',
        '..^..###..^..',
        '.....E.E.....',
        '...#O.^.O#...',
        '.C.##...##.C.',
        '.............'
      ]
    },
    {
      id: 'GALERIA_ARTILLERA',
      name: 'Galería de Tiro',
      sectionTag: 'TÁCTICO',
      allowedTypes: ['NORMAL', 'HARD'],
      allowFlipX: true,
      allowFlipY: true,
      weight: 1.15,
      grid: [
        '.............',
        '.S..#...#..S.',
        '....#...#....',
        '..O..C.C..O..',
        '....#...#....',
        '..O..E.E..O..',
        '....#...#....',
        '.S..#...#..S.',
        '.............'
      ]
    },
    {
      id: 'CALDERA_CIRCULAR',
      name: 'Anillo de Fuego',
      sectionTag: 'PELIGRO',
      allowedTypes: ['HAZARD', 'NORMAL'],
      allowFlipX: true,
      allowFlipY: true,
      weight: 1.15,
      grid: [
        '.............',
        '.F.........F.',
        '...#..*..#...',
        '..O..C.C..O..',
        '..*..#O#..*..',
        '..O..E.E..O..',
        '...#..*..#...',
        '.S.........S.',
        '.............'
      ]
    },
    {
      id: 'BODEGA_CERAMICA',
      name: 'Bodega de Vasijas',
      sectionTag: 'BOTÍN',
      allowedTypes: ['NORMAL'],
      allowFlipX: true,
      allowFlipY: true,
      weight: 1.1,
      grid: [
        '.............',
        '.OO.#...#.OO.',
        '.O..P...P..O.',
        '...#O...O#...',
        '....E...E....',
        '...#O...O#...',
        '.O..P...P..O.',
        '.OO.#...#.OO.',
        '.............'
      ]
    },
    {
      id: 'ISLAS_DEL_VACIO',
      name: 'Islas Gemelas',
      sectionTag: 'ABISMO',
      allowedTypes: ['NORMAL', 'HARD'],
      allowFlipX: true,
      allowFlipY: true,
      weight: 1.15,
      grid: [
        '.............',
        '.S.~~...~~.S.',
        '...~~.F.~~...',
        '.#O.......O#.',
        '....C...C....',
        '.#O.......O#.',
        '...~~.F.~~...',
        '.S.~~...~~.S.',
        '.............'
      ]
    },
    {
      id: 'EL_BUNKER',
      name: 'El Búnker Central',
      sectionTag: 'FORTALEZA',
      allowedTypes: ['HARD', 'NORMAL'],
      allowFlipX: true,
      allowFlipY: true,
      weight: 1.2,
      grid: [
        '.............',
        '.C.........C.',
        '....##.##....',
        '..S.#O.O#.S..',
        '.....E.E.....',
        '..S.#O.O#.S..',
        '....##.##....',
        '.P.........P.',
        '.............'
      ]
    },
    {
      id: 'GUANTELETE_ACERO',
      name: 'Pasillo de Pinchos',
      sectionTag: 'TRAMPAS',
      allowedTypes: ['HAZARD', 'NORMAL'],
      allowFlipX: true,
      allowFlipY: true,
      weight: 1.15,
      grid: [
        '.............',
        '.S.#..^..#.S.',
        '...O.....O...',
        '..^..C.C..^..',
        '....#...#....',
        '..^..E.E..^..',
        '...O.....O...',
        '.P.#..^..#.P.',
        '.............'
      ]
    },
    {
      id: 'CIENAGA_ALQUIMICA',
      name: 'Ciénaga Tóxica',
      sectionTag: 'PELIGRO',
      allowedTypes: ['HAZARD', 'NORMAL'],
      allowFlipX: true,
      allowFlipY: true,
      weight: 1.1,
      grid: [
        '.............',
        '.F..%...%..F.',
        '...#O...O#...',
        '..%..P.P..%..',
        '....#...#....',
        '..%..C.C..%..',
        '...#O...O#...',
        '.S..%...%..S.',
        '.............'
      ]
    },
    {
      id: 'COLISEO_OCTOGONAL',
      name: 'Coliseo de Sangre',
      sectionTag: 'ARENA',
      allowedTypes: ['HARD', 'NORMAL'],
      allowFlipX: true,
      allowFlipY: true,
      weight: 1.2,
      grid: [
        '.............',
        '.~~.#...#.~~.',
        '.~~..S.S..~~.',
        '...#O...O#...',
        '....C.X.C....',
        '...#O...O#...',
        '.~~..E.E..~~.',
        '.~~.#...#.~~.',
        '.............'
      ]
    },
    {
      id: 'PINZA_DIAGONAL',
      name: 'Emboscada Diagonal',
      sectionTag: 'TÁCTICO',
      allowedTypes: ['NORMAL', 'HARD'],
      allowFlipX: true,
      allowFlipY: true,
      weight: 1.15,
      grid: [
        '.............',
        '.S.##........',
        '..#O...C..F..',
        '.....##......',
        '....E...E....',
        '......##.....',
        '..F..C...O#..',
        '........##.S.',
        '.............'
      ]
    },
    {
      id: 'TEMPLO_COLUMNAS',
      name: 'Columnata Antigua',
      sectionTag: 'CLÁSICO',
      allowedTypes: ['NORMAL', 'HARD', 'HAZARD'],
      allowFlipX: true,
      allowFlipY: true,
      weight: 1.2,
      grid: [
        '.............',
        '.S.#..O..#.S.',
        '......^......',
        '.C.#.....#.C.',
        '.....*.*.....',
        '.E.#.....#.E.',
        '......^......',
        '.P.#..O..#.P.',
        '.............'
      ]
    },
    {
      id: 'ENCRUCIJADA_PUENTES',
      name: 'Rotonda Abisal',
      sectionTag: 'ABISMO',
      allowedTypes: ['NORMAL', 'HARD', 'HAZARD'],
      allowFlipX: true,
      allowFlipY: true,
      weight: 1.15,
      grid: [
        '.............',
        '.~~~.....~~~.',
        '.~~~.S.S.~~~.',
        '....#O.O#....',
        '...C.....C...',
        '....#O.O#....',
        '.~~~.P.P.~~~.',
        '.~~~.....~~~.',
        '.............'
      ]
    },
    {
      id: 'CAMARA_ENJAMBRE',
      name: 'Cámara de Incubación',
      sectionTag: 'CACERÍA',
      allowedTypes: ['NORMAL', 'HARD'],
      allowFlipX: true,
      allowFlipY: true,
      weight: 1.1,
      grid: [
        '.............',
        '.P..#O.O#..P.',
        '..F.......F..',
        '.O..#...#..O.',
        '...P..C..P...',
        '.O..#...#..O.',
        '..F.......F..',
        '.P..#O.O#..P.',
        '.............'
      ]
    }
  ];

  // ==========================================================================
  // 2. CATÁLOGO DE SECCIONES MULTI-SALA (FLOOR_SECTIONS / CHUNKS DE PISO)
  // ==========================================================================
  // Cada sección define una cadena de 2 a 3 habitaciones conectadas que se
  // estampan juntas en el mapa del piso para crear patrones de exploración
  // reconocibles (ej: "Trinchera -> Coliseo Élite -> Sala del Tesoro").
  var BUILTIN_FLOOR_SECTIONS = [
    {
      id: 'SECCION_GUANTELETE_TESORO',
      name: 'El Guantelete del Botín',
      description: 'Galería de Tiro seguida del Coliseo de Élite que custodia la Sala del Tesoro.',
      steps: [
        { dx: 1, dy: 0, roomType: 'NORMAL', templateId: 'GALERIA_ARTILLERA' },
        { dx: 2, dy: 0, roomType: 'HARD', templateId: 'COLISEO_OCTOGONAL' },
        { dx: 3, dy: 0, roomType: 'TREASURE', templateId: null }
      ]
    },
    {
      id: 'SECCION_RUTA_SANTUARIO',
      name: 'Sendero al Santuario',
      description: 'Puente Abisal conectado a la Columnata Antigua que desemboca en el Santuario.',
      steps: [
        { dx: 0, dy: -1, roomType: 'NORMAL', templateId: 'PUENTE_ABISAL' },
        { dx: 0, dy: -2, roomType: 'HAZARD', templateId: 'TEMPLO_COLUMNAS' },
        { dx: 1, dy: -2, roomType: 'SANCTUARY', templateId: null }
      ]
    },
    {
      id: 'SECCION_BASTION_Y_BODEGA',
      name: 'Asalto al Búnker',
      description: 'Los 4 Pilares seguidos del Búnker de Élite y una Bodega de Vasijas para recuperarse.',
      steps: [
        { dx: -1, dy: 0, roomType: 'NORMAL', templateId: 'CUATRO_PILARES' },
        { dx: -2, dy: 0, roomType: 'HARD', templateId: 'EL_BUNKER' },
        { dx: -2, dy: 1, roomType: 'NORMAL', templateId: 'BODEGA_CERAMICA' }
      ]
    },
    {
      id: 'SECCION_CRUCE_ELEMENTAL',
      name: 'Paso de la Caldera',
      description: 'Trinchera Partida seguida del Anillo de Fuego y la Ciénaga Tóxica.',
      steps: [
        { dx: 0, dy: 1, roomType: 'NORMAL', templateId: 'TRINCHERA_CENTRAL' },
        { dx: 1, dy: 1, roomType: 'HAZARD', templateId: 'CALDERA_CIRCULAR' },
        { dx: 1, dy: 2, roomType: 'HAZARD', templateId: 'CIENAGA_ALQUIMICA' }
      ]
    },
    {
      id: 'SECCION_FORTALEZA_CRUZADA',
      name: 'Encrucijada del Abismo',
      description: 'Islas Gemelas conectadas al Bastión en Cruz y la Rotonda Abisal.',
      steps: [
        { dx: 1, dy: 0, roomType: 'NORMAL', templateId: 'ISLAS_DEL_VACIO' },
        { dx: 1, dy: -1, roomType: 'HARD', templateId: 'BASTION_CRUZADO' },
        { dx: 2, dy: -1, roomType: 'NORMAL', templateId: 'ENCRUCIJADA_PUENTES' }
      ]
    }
  ];

  // ==========================================================================
  // 3. GESTIÓN DE PLANTILLAS PERSONALIZADAS (LOCALSTORAGE + EXPORTACIÓN)
  // ==========================================================================
  function loadCustomTemplates() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY_CUSTOM_TEMPLATES);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function saveCustomTemplate(templateObj) {
    if (!templateObj || !templateObj.id || !Array.isArray(templateObj.grid)) return false;
    var normalized = normalizeGrid(templateObj.grid);
    var entry = {
      id: String(templateObj.id).toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
      name: String(templateObj.name || templateObj.id),
      sectionTag: String(templateObj.sectionTag || 'AUTOR'),
      allowedTypes: Array.isArray(templateObj.allowedTypes) && templateObj.allowedTypes.length > 0
        ? templateObj.allowedTypes
        : ['NORMAL', 'HARD', 'HAZARD'],
      allowFlipX: templateObj.allowFlipX !== false,
      allowFlipY: templateObj.allowFlipY !== false,
      weight: Number(templateObj.weight) || 1.5,
      isCustom: true,
      grid: normalized
    };

    var list = loadCustomTemplates();
    var existingIdx = list.findIndex(function (t) { return t.id === entry.id; });
    if (existingIdx >= 0) {
      list[existingIdx] = entry;
    } else {
      list.push(entry);
    }

    try {
      localStorage.setItem(STORAGE_KEY_CUSTOM_TEMPLATES, JSON.stringify(list));
      return entry;
    } catch (e) {
      return false;
    }
  }

  function deleteCustomTemplate(templateId) {
    var list = loadCustomTemplates().filter(function (t) { return t.id !== templateId; });
    try {
      localStorage.setItem(STORAGE_KEY_CUSTOM_TEMPLATES, JSON.stringify(list));
      return true;
    } catch (e) {
      return false;
    }
  }

  function getAllRoomTemplates() {
    var custom = loadCustomTemplates();
    var map = new Map();
    for (var i = 0; i < BUILTIN_ROOM_TEMPLATES.length; i++) {
      map.set(BUILTIN_ROOM_TEMPLATES[i].id, BUILTIN_ROOM_TEMPLATES[i]);
    }
    // Las plantillas creadas por el usuario tienen prioridad o se suman al catálogo
    for (var j = 0; j < custom.length; j++) {
      map.set(custom[j].id, custom[j]);
    }
    return Array.from(map.values());
  }

  function getTemplateById(id) {
    if (!id) return null;
    var all = getAllRoomTemplates();
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === id) return all[i];
    }
    return null;
  }

  function normalizeGrid(gridLines) {
    var rows = [];
    for (var r = 0; r < GRID_ROWS; r++) {
      var line = (gridLines && gridLines[r]) ? String(gridLines[r]) : '';
      line = line.replace(/\s/g, '.');
      if (line.length < GRID_COLS) {
        line = line + '.'.repeat(GRID_COLS - line.length);
      } else if (line.length > GRID_COLS) {
        line = line.slice(0, GRID_COLS);
      }
      rows.push(line);
    }
    return rows;
  }

  function transformGrid(gridLines, flipX, flipY) {
    var rows = normalizeGrid(gridLines);
    if (flipY) {
      rows = rows.slice().reverse();
    }
    if (flipX) {
      rows = rows.map(function (rowStr) {
        return rowStr.split('').reverse().join('');
      });
    }
    return rows;
  }

  // ==========================================================================
  // 4. COMPILADOR DE GRILLA 13x9 DENTRO DE UNA INSTANCIA `Room`
  // ==========================================================================
  function getCellGeometry(bounds) {
    var b = bounds || ROOM_BOUNDS;
    var cellW = b.width / GRID_COLS;
    var cellH = b.height / GRID_ROWS;
    return {
      left: b.left,
      top: b.top,
      right: b.right,
      bottom: b.bottom,
      width: b.width,
      height: b.height,
      cellW: cellW,
      cellH: cellH,
      centerOf: function (col, row) {
        return {
          x: b.left + (col + 0.5) * cellW,
          y: b.top + (row + 0.5) * cellH
        };
      },
      rectOf: function (col, row, spanCols, spanRows) {
        return {
          x: Math.round(b.left + col * cellW),
          y: Math.round(b.top + row * cellH),
          w: Math.round((spanCols || 1) * cellW),
          h: Math.round((spanRows || 1) * cellH)
        };
      }
    };
  }

  /**
   * Verifica si una celda `(col, row)` está en el umbral de una puerta activa
   * para mantener los accesos 100% despejados de rocas, fosos o trampas.
   */
  function isNearActiveDoorCell(room, col, row) {
    var doors = room.doors || { N: true, S: true, E: true, W: true };
    var hasAnyDoor = doors.N || doors.S || doors.E || doors.W;
    // Si aún no se conectaron puertas (ej: en previsualización), proteger los 4 umbrales
    var checkN = !hasAnyDoor || doors.N;
    var checkS = !hasAnyDoor || doors.S;
    var checkW = !hasAnyDoor || doors.W;
    var checkE = !hasAnyDoor || doors.E;

    if (checkN && row <= 1 && Math.abs(col - 6) <= 1) return true;
    if (checkS && row >= GRID_ROWS - 2 && Math.abs(col - 6) <= 1) return true;
    if (checkW && col <= 1 && Math.abs(row - 4) <= 1) return true;
    if (checkE && col >= GRID_COLS - 2 && Math.abs(row - 4) <= 1) return true;
    return false;
  }

  /**
   * Une celdas `~` contiguas en rectángulos `RoomPit` limpios (Greedy Rectangle Merging).
   */
  function compilePitsFromMatrix(room, matrix, geom) {
    var used = [];
    for (var r = 0; r < GRID_ROWS; r++) {
      used.push(new Array(GRID_COLS).fill(false));
    }

    for (var row = 0; row < GRID_ROWS; row++) {
      for (var col = 0; col < GRID_COLS; col++) {
        if (used[row][col] || matrix[row][col] !== '~') continue;
        if (isNearActiveDoorCell(room, col, row)) {
          used[row][col] = true;
          continue;
        }

        // Expandir ancho (columnas)
        var spanC = 1;
        while (
          col + spanC < GRID_COLS &&
          !used[row][col + spanC] &&
          matrix[row][col + spanC] === '~' &&
          !isNearActiveDoorCell(room, col + spanC, row)
        ) {
          spanC++;
        }

        // Expandir alto (filas) mientras toda la fila inferior tenga `~`
        var spanR = 1;
        var canExpandRow = true;
        while (row + spanR < GRID_ROWS && canExpandRow) {
          for (var cc = col; cc < col + spanC; cc++) {
            if (
              used[row + spanR][cc] ||
              matrix[row + spanR][cc] !== '~' ||
              isNearActiveDoorCell(room, cc, row + spanR)
            ) {
              canExpandRow = false;
              break;
            }
          }
          if (canExpandRow) {
            spanR++;
          }
        }

        for (var rr = row; rr < row + spanR; rr++) {
          for (var cc2 = col; cc2 < col + spanC; cc2++) {
            used[rr][cc2] = true;
          }
        }

        var rect = geom.rectOf(col, row, spanC, spanR);
        room.pits.push(new RoomPit(rect.x, rect.y, rect.w, rect.h, 'Abismo'));
      }
    }
  }

  function createEnemyFromSymbol(symbol, x, y, sectionNumber, levelNumber) {
    if (symbol === 'S') {
      return new ShooterEnemy(x, y, sectionNumber, levelNumber);
    } else if (symbol === 'C') {
      return new ChargerEnemy(x, y, sectionNumber, levelNumber);
    } else if (symbol === 'F') {
      return new FlyerEnemy(x, y, sectionNumber, levelNumber);
    } else if (symbol === 'P') {
      return new SplitterEnemy(x, y, sectionNumber, levelNumber, false);
    } else if (symbol === 'X') {
      return new EliteEnemy(x, y, sectionNumber, levelNumber);
    } else if (symbol === 'E') {
      var beh = ((Math.round(x + y) % 2) === 0) ? 'DASHER' : 'ERRATIC';
      return new Enemy(x, y, sectionNumber, levelNumber, beh);
    } else {
      // '?' Comodín táctico
      var roll = Math.random();
      if (roll < 0.22) return new ShooterEnemy(x, y, sectionNumber, levelNumber);
      if (roll < 0.42) return new SplitterEnemy(x, y, sectionNumber, levelNumber, false);
      if (roll < 0.62) return new FlyerEnemy(x, y, sectionNumber, levelNumber);
      if (roll < 0.78) return new ChargerEnemy(x, y, sectionNumber, levelNumber);
      return new Enemy(x, y, sectionNumber, levelNumber, Math.random() < 0.5 ? 'ERRATIC' : 'DASHER');
    }
  }

  /**
   * Aplica una plantilla `13x9` completa sobre una instancia de `Room`.
   * Reemplaza los fosos, rocas/vasijas, trampas y formaciones de enemigos.
   */
  function applyTemplateToRoom(room, template, options) {
    if (!room || !template || !Array.isArray(template.grid)) return false;
    var opts = options || {};
    var spawnMultiplier = opts.spawnMultiplier !== undefined ? opts.spawnMultiplier : 1.0;
    var eliteChanceMult = opts.eliteChanceMult !== undefined ? opts.eliteChanceMult : 1.0;
    var flipX = opts.flipX !== undefined ? Boolean(opts.flipX) : (template.allowFlipX && Math.random() < 0.5);
    var flipY = opts.flipY !== undefined ? Boolean(opts.flipY) : (template.allowFlipY && Math.random() < 0.5);

    // 1. Resetear la sala a límites estándar 13x9 (864x544) para que la grilla calce al milímetro
    room.initLayout('OPEN');
    room.templateId = template.id;
    room.templateName = template.name;
    room.templateSectionTag = template.sectionTag || 'AUTOR';
    room.hasAuthoredTemplate = true;
    room.pits = [];
    room.obstacles = [];
    room.hazards = [];
    room.enemies = [];

    var rows = transformGrid(template.grid, flipX, flipY);
    var matrix = rows.map(function (rStr) { return rStr.split(''); });
    var geom = getCellGeometry(room.bounds);

    // 2. Compilar Fosos (`~`) uniendo bloques adyacentes
    compilePitsFromMatrix(room, matrix, geom);
    room.ensureDoorPassages();

    // 3. Compilar Rocas (`#`), Vasijas (`O`), Trampas (`^`, `*`, `%`) y recolectar marcadores de enemigos
    var enemyMarkers = [];
    var hasAuthoredElite = false;

    for (var row = 0; row < GRID_ROWS; row++) {
      for (var col = 0; col < GRID_COLS; col++) {
        var ch = matrix[row][col];
        if (ch === '.' || ch === '~') continue;

        var center = geom.centerOf(col, row);
        var nearDoor = isNearActiveDoorCell(room, col, row);

        // Si el portal de salida está en el centro (6, 4), no taparlo con roca sólida
        var isCenterPortalCell = room.isExitRoom && col === 6 && row === 4;

        if (ch === '#') {
          if (!nearDoor && !isCenterPortalCell) {
            room.obstacles.push(new RockObstacle(center.x, center.y, 44, 44));
          }
        } else if (ch === 'O') {
          if (!nearDoor && !isCenterPortalCell) {
            room.obstacles.push(new PotObstacle(center.x, center.y));
          }
        } else if (ch === '^') {
          if (!nearDoor) {
            var phaseOffset = ((col + row) % 4) * 0.9;
            room.hazards.push(new SpikeTrap(center.x, center.y, 34, phaseOffset));
          }
        } else if (ch === '*') {
          if (!nearDoor) {
            room.hazards.push(new FireZone(center.x, center.y, 44));
          }
        } else if (ch === '%') {
          if (!nearDoor) {
            room.hazards.push(new PoisonPuddle(center.x, center.y, 48));
          }
        } else if ('SCFPEX?'.indexOf(ch) !== -1) {
          if (ch === 'X') hasAuthoredElite = true;
          enemyMarkers.push({
            symbol: ch,
            x: center.x,
            y: center.y,
            col: col,
            row: row
          });
        }
      }
    }

    // Si es una HardRoom (Sala de Élite), preservar el Monolito de Desafío en una posición caminable cercana al centro
    if (room.type === 'HARD' && typeof ChallengeMonolith !== 'undefined') {
      var monoPos = room.getWalkablePosition(room.bounds.centerX, room.bounds.centerY, 32);
      room.hazards.push(new ChallengeMonolith(monoPos.x, monoPos.y));
    }

    // Si es una HazardRoom y la plantilla no tenía trampas explícitas, añadir un par de peligros simétricos
    if (room.type === 'HAZARD' && room.hazards.length === 0) {
      var h1 = room.getWalkablePosition(room.bounds.centerX - 160, room.bounds.centerY, 40);
      var h2 = room.getWalkablePosition(room.bounds.centerX + 160, room.bounds.centerY, 40);
      room.hazards.push(new SpikeTrap(h1.x, h1.y, 36, 0.0));
      room.hazards.push(new SpikeTrap(h2.x, h2.y, 36, 1.8));
    }

    // 4. Instanciar la formación de enemigos diseñada en la plantilla
    var floorMultiplier = Math.pow(1 + CONFIG.ENEMY_FLOOR_SCALING, (room.levelNumber || 1) - 1);
    var typeCountFactor = room.type === 'HARD' ? 1.35 : (room.type === 'HAZARD' ? 0.75 : 1.0);
    var scaleFactor = floorMultiplier * spawnMultiplier * typeCountFactor;

    if (enemyMarkers.length > 0) {
      var desiredCount = Math.max(
        enemyMarkers.length,
        Math.round(enemyMarkers.length * Math.min(1.85, Math.max(0.75, scaleFactor)))
      );
      if (room.type === 'HAZARD') {
        desiredCount = Math.max(3, Math.round(enemyMarkers.length * 0.8));
      }

      // Primero spawneamos los marcadores exactos de la plantilla
      var markersToUse = enemyMarkers.slice(0, desiredCount);
      for (var m = 0; m < markersToUse.length; m++) {
        var mk = markersToUse[m];
        var safePos = room.getWalkablePosition(mk.x, mk.y, 20);
        var enemy = createEnemyFromSymbol(mk.symbol, safePos.x, safePos.y, room.sectionNumber, room.levelNumber);
        enemy.isAuthoredSpawn = true;
        enemy.authoredHomeX = safePos.x;
        enemy.authoredHomeY = safePos.y;
        room.enemies.push(enemy);
      }

      // Si el escalado de piso/BrotherEye pide refuerzos adicionales, spawnearlos flanqueando los marcadores de la plantilla
      var extraNeeded = desiredCount - markersToUse.length;
      for (var ex = 0; ex < extraNeeded; ex++) {
        var baseMk = enemyMarkers[ex % enemyMarkers.length];
        var angle = (ex * Math.PI) / 2 + 0.4;
        var flankPos = room.getWalkablePosition(
          baseMk.x + Math.cos(angle) * 48,
          baseMk.y + Math.sin(angle) * 48,
          20
        );
        var extraEnemy = createEnemyFromSymbol(baseMk.symbol === 'X' ? 'E' : baseMk.symbol, flankPos.x, flankPos.y, room.sectionNumber, room.levelNumber);
        extraEnemy.isAuthoredSpawn = true;
        room.enemies.push(extraEnemy);
      }
    } else {
      // Fallback si la plantilla no definió letras de enemigos
      room.spawnStandardWave(typeCountFactor, spawnMultiplier, eliteChanceMult);
    }

    // 5. Probabilidad de Élite y ciclo Berserk en salas HARD
    var effectiveEliteChance = Math.min(0.95, CONFIG.ELITE_SPAWN_CHANCE * eliteChanceMult);
    if (!hasAuthoredElite && room.enemies.length > 0 && Math.random() < effectiveEliteChance) {
      var replaceIdx = Math.floor(Math.random() * room.enemies.length);
      var target = room.enemies[replaceIdx];
      room.enemies[replaceIdx] = new EliteEnemy(
        target.x,
        target.y,
        room.sectionNumber,
        room.levelNumber
      );
    }

    if (room.type === 'HARD' && room.enemies.length > 0) {
      var targetBerserk = Math.max(1, Math.round(room.enemies.length * 0.3));
      for (var bIdx = 0; bIdx < Math.min(targetBerserk, room.enemies.length); bIdx++) {
        room.enemies[bIdx].isBerserk = true;
      }
    }

    if (typeof BrotherEye !== 'undefined' && BrotherEye.enabled) {
      for (var eIdx = 0; eIdx < room.enemies.length; eIdx++) {
        BrotherEye.tuneSpawnedEnemy(room.enemies[eIdx]);
      }
    }

    room.cleared = room.enemies.length === 0;
    return true;
  }

  // ==========================================================================
  // 5. GENERADOR PROCEDURAL ESTRUCTURADO (EL 25% RESTANTE CON PATRONES REALES)
  // ==========================================================================
  /**
   * Cuando una sala cae en el 25% procedural, en vez de tirar 3 rocas al azar,
   * construye estructuras simétricas de cobertura (Trincheras en L, Columnas
   * Paralelas o Búnkeres Gemelos) para que NUNCA se sienta vacía.
   */
  function generateStructuredObstaclesForRoom(room) {
    if (!room || room.hasAuthoredTemplate) return;
    if (
      room.type === 'START' ||
      room.type === 'SANCTUARY' ||
      room.type === 'TREASURE' ||
      room.type === 'SHOP' ||
      room.type === 'BOSS' ||
      room.type === 'NEXUS'
    ) {
      return;
    }

    var b = room.bounds;
    var cx = b.centerX;
    var cy = b.centerY;
    var styleRoll = Math.floor(Math.random() * 3);

    var tryPlaceRock = function (x, y) {
      if (x < b.left + 90 || x > b.right - 90 || y < b.top + 80 || y > b.bottom - 80) return;
      if (room.isPointInPit && room.isPointInPit(x, y, 36)) return;
      if (room.getMinDistanceToAnyDoor && room.getMinDistanceToAnyDoor(x, y) < 110) return;
      if (room.isExitRoom && Math.hypot(x - cx, y - cy) < 60) return;
      room.obstacles.push(new RockObstacle(x, y, 42, 42));
    };

    var tryPlacePot = function (x, y) {
      if (x < b.left + 85 || x > b.right - 85 || y < b.top + 75 || y > b.bottom - 75) return;
      if (room.isPointInPit && room.isPointInPit(x, y, 28)) return;
      if (room.getMinDistanceToAnyDoor && room.getMinDistanceToAnyDoor(x, y) < 100) return;
      room.obstacles.push(new PotObstacle(x, y));
    };

    if (styleRoll === 0) {
      // Patrón A: 4 Parapetos en L simétricos
      var ox = Math.min(185, b.width * 0.24);
      var oy = Math.min(120, b.height * 0.24);
      var signs = [
        { sx: -1, sy: -1 },
        { sx: 1, sy: -1 },
        { sx: -1, sy: 1 },
        { sx: 1, sy: 1 }
      ];
      for (var i = 0; i < signs.length; i++) {
        var s = signs[i];
        var bx = cx + s.sx * ox;
        var by = cy + s.sy * oy;
        tryPlaceRock(bx, by);
        tryPlaceRock(bx + s.sx * 42, by);
        tryPlacePot(bx, by + s.sy * 36);
      }
    } else if (styleRoll === 1) {
      // Patrón B: Dos muros de escudo flanqueando el centro
      var spanX = Math.min(150, b.width * 0.20);
      for (var step = -1; step <= 1; step++) {
        tryPlaceRock(cx - spanX, cy + step * 44);
        tryPlaceRock(cx + spanX, cy + step * 44);
      }
      tryPlacePot(cx - spanX - 36, cy);
      tryPlacePot(cx + spanX + 36, cy);
    } else {
      // Patrón C: Diamante táctico con vasijas internas
      tryPlaceRock(cx - 110, cy - 85);
      tryPlaceRock(cx + 110, cy - 85);
      tryPlaceRock(cx - 110, cy + 85);
      tryPlaceRock(cx + 110, cy + 85);
      tryPlacePot(cx - 72, cy - 85);
      tryPlacePot(cx + 72, cy - 85);
      tryPlacePot(cx - 72, cy + 85);
      tryPlacePot(cx + 72, cy + 85);
    }

    // Garantizar al menos 4 elementos de cobertura simétricos incluso en pasillos estrechos o caminos con fosos
    if (room.obstacles.length < 4 && typeof room.getWalkablePosition === 'function') {
      var anchorOffsets = [
        { dx: -170, dy: -90, isPot: false },
        { dx: 170, dy: -90, isPot: false },
        { dx: -170, dy: 90, isPot: false },
        { dx: 170, dy: 90, isPot: false },
        { dx: -115, dy: 0, isPot: true },
        { dx: 115, dy: 0, isPot: true },
        { dx: 0, dy: -95, isPot: true },
        { dx: 0, dy: 95, isPot: true }
      ];
      for (var aIdx = 0; aIdx < anchorOffsets.length && room.obstacles.length < 6; aIdx++) {
        var ao = anchorOffsets[aIdx];
        var wp = room.getWalkablePosition(cx + ao.dx, cy + ao.dy, 26);
        if (room.getMinDistanceToAnyDoor && room.getMinDistanceToAnyDoor(wp.x, wp.y) < 90) continue;
        if (room.isExitRoom && Math.hypot(wp.x - cx, wp.y - cy) < 55) continue;
        var tooClose = room.obstacles.some(function (ob) {
          return Math.hypot(ob.x - wp.x, ob.y - wp.y) < 42;
        });
        if (tooClose) continue;
        if (ao.isPot) {
          room.obstacles.push(new PotObstacle(wp.x, wp.y));
        } else {
          room.obstacles.push(new RockObstacle(wp.x, wp.y, 40, 40));
        }
      }
    }
  }

  // ==========================================================================
  // 6. SELECCIÓN PONDERADA Y ESTAMPADO DE SECCIONES EN `DungeonFloor`
  // ==========================================================================
  function pickTemplateForRoomType(roomType, usedTemplateIds) {
    var all = getAllRoomTemplates();
    var candidates = all.filter(function (t) {
      return !t.allowedTypes || t.allowedTypes.indexOf(roomType) !== -1;
    });
    if (candidates.length === 0) candidates = all;

    // Preferir plantillas que aún no hayan salido en este mismo piso para máxima variedad
    var unused = candidates.filter(function (t) {
      return !usedTemplateIds || !usedTemplateIds.has(t.id);
    });
    var pool = unused.length > 0 ? unused : candidates;

    var totalWeight = 0;
    for (var i = 0; i < pool.length; i++) {
      totalWeight += (pool[i].weight || 1.0);
    }
    var roll = Math.random() * totalWeight;
    var acc = 0;
    for (var j = 0; j < pool.length; j++) {
      acc += (pool[j].weight || 1.0);
      if (roll <= acc) return pool[j];
    }
    return pool[0];
  }

  /**
   * Rota una coordenada relativa `(dx, dy)` según `rot` (0, 1, 2, 3 = 0°, 90°, 180°, 270°)
   * para que una sección creada por el usuario pueda orientarse hacia cualquier rama del mapa.
   */
  function rotateOffset(dx, dy, rot) {
    var r = ((rot % 4) + 4) % 4;
    if (r === 1) return { dx: -dy, dy: dx };
    if (r === 2) return { dx: -dx, dy: -dy };
    if (r === 3) return { dx: dy, dy: -dx };
    return { dx: dx, dy: dy };
  }

  /**
   * Estampa 1 Sección Multi-Sala de Autor (`FLOOR_SECTIONS`) partiendo del origen `(0,0)`
   * para darle al jugador un camino inicial estructurado y reconocible.
   */
  function stampFloorSection(coordsMap, targetRooms) {
    var stampedPlan = new Map(); // key "x,y" -> { roomType, templateId, sectionName }
    if (!BUILTIN_FLOOR_SECTIONS || BUILTIN_FLOOR_SECTIONS.length === 0) {
      return stampedPlan;
    }

    var section = BUILTIN_FLOOR_SECTIONS[Math.floor(Math.random() * BUILTIN_FLOOR_SECTIONS.length)];
    var rotation = Math.floor(Math.random() * 4);

    for (var i = 0; i < section.steps.length; i++) {
      if (coordsMap.size >= targetRooms - 2) break;
      var step = section.steps[i];
      var rotOff = rotateOffset(step.dx, step.dy, rotation);
      var gx = rotOff.dx;
      var gy = rotOff.dy;
      var key = gx + ',' + gy;
      if (key === '0,0') continue;

      coordsMap.set(key, { gridX: gx, gridY: gy });
      stampedPlan.set(key, {
        roomType: step.roomType,
        templateId: step.templateId,
        sectionId: section.id,
        sectionName: section.name
      });
    }

    return stampedPlan;
  }

  /**
   * Exporta una plantilla como código JS formateado listo para pegar en `BUILTIN_ROOM_TEMPLATES`.
   */
  function formatTemplateAsCode(templateObj) {
    var rows = normalizeGrid(templateObj.grid);
    var gridLines = rows.map(function (r, idx) {
      return "        '" + r + "'" + (idx < rows.length - 1 ? ',' : '');
    }).join('\n');

    return [
      '    {',
      "      id: '" + (templateObj.id || 'MI_SALA_NUEVA') + "',",
      "      name: '" + (templateObj.name || 'Mi Sala Nueva') + "',",
      "      sectionTag: '" + (templateObj.sectionTag || 'AUTOR') + "',",
      '      allowedTypes: ' + JSON.stringify(templateObj.allowedTypes || ['NORMAL', 'HARD', 'HAZARD']) + ',',
      '      allowFlipX: true,',
      '      allowFlipY: true,',
      '      weight: 1.3,',
      '      grid: [',
      gridLines,
      '      ]',
      '    }'
    ].join('\n');
  }

  /**
   * Captura el estado actual de una `Room` y lo convierte en una grilla `13x9` editable.
   */
  function captureRoomToGrid(room) {
    var mat = [];
    for (var r = 0; r < GRID_ROWS; r++) {
      mat.push(new Array(GRID_COLS).fill('.'));
    }
    if (!room) return mat.map(function (row) { return row.join(''); });

    var geom = getCellGeometry(room.bounds);
    var toCell = function (x, y) {
      var c = Math.floor((x - geom.left) / geom.cellW);
      var rw = Math.floor((y - geom.top) / geom.cellH);
      return {
        col: MathUtils.clamp(c, 0, GRID_COLS - 1),
        row: MathUtils.clamp(rw, 0, GRID_ROWS - 1)
      };
    };

    // 1. Pits
    for (var row = 0; row < GRID_ROWS; row++) {
      for (var col = 0; col < GRID_COLS; col++) {
        var center = geom.centerOf(col, row);
        if (room.isPointInPit && room.isPointInPit(center.x, center.y, 4)) {
          mat[row][col] = '~';
        }
      }
    }

    // 2. Hazards
    if (room.hazards) {
      for (var h = 0; h < room.hazards.length; h++) {
        var haz = room.hazards[h];
        var hc = toCell(haz.x, haz.y);
        if (typeof SpikeTrap !== 'undefined' && haz instanceof SpikeTrap) mat[hc.row][hc.col] = '^';
        else if (typeof FireZone !== 'undefined' && haz instanceof FireZone) mat[hc.row][hc.col] = '*';
        else if (typeof PoisonPuddle !== 'undefined' && haz instanceof PoisonPuddle) mat[hc.row][hc.col] = '%';
      }
    }

    // 3. Obstacles
    if (room.obstacles) {
      for (var o = 0; o < room.obstacles.length; o++) {
        var obs = room.obstacles[o];
        var oc = toCell(obs.x, obs.y);
        if (typeof PotObstacle !== 'undefined' && obs instanceof PotObstacle) {
          mat[oc.row][oc.col] = 'O';
        } else {
          mat[oc.row][oc.col] = '#';
        }
      }
    }

    // 4. Enemies
    if (room.enemies) {
      for (var e = 0; e < room.enemies.length; e++) {
        var en = room.enemies[e];
        var ec = toCell(en.x, en.y);
        if (typeof EliteEnemy !== 'undefined' && en instanceof EliteEnemy) mat[ec.row][ec.col] = 'X';
        else if (typeof ShooterEnemy !== 'undefined' && en instanceof ShooterEnemy) mat[ec.row][ec.col] = 'S';
        else if (typeof ChargerEnemy !== 'undefined' && en instanceof ChargerEnemy) mat[ec.row][ec.col] = 'C';
        else if (typeof FlyerEnemy !== 'undefined' && en instanceof FlyerEnemy) mat[ec.row][ec.col] = 'F';
        else if (typeof SplitterEnemy !== 'undefined' && en instanceof SplitterEnemy) mat[ec.row][ec.col] = 'P';
        else mat[ec.row][ec.col] = 'E';
      }
    }

    return mat.map(function (row) { return row.join(''); });
  }

  root.LevelTemplateSystem = {
    GRID_COLS: GRID_COLS,
    GRID_ROWS: GRID_ROWS,
    AUTHORED_ROOM_CHANCE: AUTHORED_ROOM_CHANCE,
    BUILTIN_ROOM_TEMPLATES: BUILTIN_ROOM_TEMPLATES,
    BUILTIN_FLOOR_SECTIONS: BUILTIN_FLOOR_SECTIONS,
    getAllRoomTemplates: getAllRoomTemplates,
    loadCustomTemplates: loadCustomTemplates,
    saveCustomTemplate: saveCustomTemplate,
    deleteCustomTemplate: deleteCustomTemplate,
    getTemplateById: getTemplateById,
    normalizeGrid: normalizeGrid,
    transformGrid: transformGrid,
    applyTemplateToRoom: applyTemplateToRoom,
    generateStructuredObstaclesForRoom: generateStructuredObstaclesForRoom,
    pickTemplateForRoomType: pickTemplateForRoomType,
    stampFloorSection: stampFloorSection,
    formatTemplateAsCode: formatTemplateAsCode,
    captureRoomToGrid: captureRoomToGrid
  };
}(typeof self !== 'undefined' ? self : this));
