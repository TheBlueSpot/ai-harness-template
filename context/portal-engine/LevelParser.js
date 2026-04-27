(function initLevelParser(globalScope) {
  "use strict";

  var LEVEL_SCHEMA_VERSION = "portal-engine.level.v2";

  function fail(message) {
    throw new Error("LevelParser: " + message);
  }

  function ensureString(value, name) {
    if (typeof value !== "string" || value.length === 0) {
      fail(name + " must be a non-empty string.");
    }
  }

  function ensureNumber(value, name) {
    if (typeof value !== "number" || Number.isNaN(value)) {
      fail(name + " must be a number.");
    }
  }

  function freezeCopy(object) {
    return Object.freeze(object);
  }

  function buildSurface(rawSurface, tileSize) {
    ensureString(rawSurface.id, "surface.id");
    ensureNumber(rawSurface.x, "surface.x");
    ensureNumber(rawSurface.y, "surface.y");
    ensureNumber(rawSurface.width, "surface.width");
    ensureNumber(rawSurface.height, "surface.height");

    return freezeCopy({
      id: rawSurface.id,
      x: rawSurface.x * tileSize,
      y: rawSurface.y * tileSize,
      width: rawSurface.width * tileSize,
      height: rawSurface.height * tileSize,
      normal: freezeCopy({
        x: rawSurface.normal.x,
        y: rawSurface.normal.y
      }),
      isPortalable: rawSurface.isPortalable === true,
      material: rawSurface.material || "panel"
    });
  }

  function buildEntity(rawEntity, tileSize) {
    ensureString(rawEntity.id, "entity.id");
    ensureString(rawEntity.type, "entity.type");
    ensureNumber(rawEntity.x, "entity.x");
    ensureNumber(rawEntity.y, "entity.y");
    ensureNumber(rawEntity.width, "entity.width");
    ensureNumber(rawEntity.height, "entity.height");

    return freezeCopy({
      id: rawEntity.id,
      type: rawEntity.type,
      x: rawEntity.x * tileSize,
      y: rawEntity.y * tileSize,
      width: rawEntity.width * tileSize,
      height: rawEntity.height * tileSize,
      properties: freezeCopy(rawEntity.properties || {})
    });
  }

  function createTiles(level) {
    var x;
    var y;
    var tiles = [];

    for (y = 0; y < level.world.tileHeight; y += 1) {
      var row = [];
      for (x = 0; x < level.world.tileWidth; x += 1) {
        row.push({ solid: false, isPortalable: false, surfaceId: null });
      }
      tiles.push(row);
    }

    level.surfaces.forEach(function markSurface(surface) {
      var startX = Math.round(surface.x / level.tileSize);
      var startY = Math.round(surface.y / level.tileSize);
      var width = Math.round(surface.width / level.tileSize);
      var height = Math.round(surface.height / level.tileSize);
      var tx;
      var ty;

      for (ty = startY; ty < startY + height; ty += 1) {
        for (tx = startX; tx < startX + width; tx += 1) {
          if (tiles[ty] && tiles[ty][tx]) {
            tiles[ty][tx] = {
              solid: true,
              isPortalable: surface.isPortalable,
              surfaceId: surface.id
            };
          }
        }
      }
    });

    return Object.freeze(tiles.map(function freezeRow(row) {
      return Object.freeze(row);
    }));
  }

  function parseLevelDefinition(rawLevel) {
    ensureString(rawLevel.version, "version");
    if (rawLevel.version !== LEVEL_SCHEMA_VERSION) {
      fail("version must equal " + LEVEL_SCHEMA_VERSION + ".");
    }

    ensureString(rawLevel.id, "id");
    ensureString(rawLevel.title, "title");
    ensureString(rawLevel.objective, "objective");
    ensureNumber(rawLevel.tileSize, "tileSize");
    ensureNumber(rawLevel.world.width, "world.width");
    ensureNumber(rawLevel.world.height, "world.height");

    var tileSize = rawLevel.tileSize;
    var parsed = {
      version: rawLevel.version,
      id: rawLevel.id,
      title: rawLevel.title,
      objective: rawLevel.objective,
      nextLevelId: rawLevel.nextLevelId || null,
      tileSize: tileSize,
      world: freezeCopy({
        tileWidth: rawLevel.world.width,
        tileHeight: rawLevel.world.height,
        width: rawLevel.world.width * tileSize,
        height: rawLevel.world.height * tileSize,
        gravity: freezeCopy({
          x: rawLevel.world.gravity.x,
          y: rawLevel.world.gravity.y
        }),
        spawn: freezeCopy({
          x: rawLevel.world.spawn.x * tileSize,
          y: rawLevel.world.spawn.y * tileSize
        }),
        exit: freezeCopy({
          x: rawLevel.world.exit.x * tileSize,
          y: rawLevel.world.exit.y * tileSize,
          width: rawLevel.world.exit.width * tileSize,
          height: rawLevel.world.exit.height * tileSize
        })
      }),
      surfaces: Object.freeze((rawLevel.surfaces || []).map(function mapSurface(surface) {
        return buildSurface(surface, tileSize);
      })),
      entities: Object.freeze((rawLevel.entities || []).map(function mapEntity(entity) {
        return buildEntity(entity, tileSize);
      })),
      triggers: Object.freeze((rawLevel.triggers || []).map(function mapTrigger(trigger) {
        return freezeCopy({
          id: trigger.id,
          type: trigger.type,
          sourceId: trigger.sourceId,
          targetId: trigger.targetId,
          action: trigger.action
        });
      })),
      art: freezeCopy({
        theme: rawLevel.art && rawLevel.art.theme || "lab-flash",
        publicDomainOnly: true
      })
    };

    parsed.tiles = createTiles(parsed);
    return Object.freeze(parsed);
  }

  function createBuiltinLevels() {
    return [
      {
        version: LEVEL_SCHEMA_VERSION,
        id: "test-chamber-alpha",
        title: "Test Chamber Alpha",
        objective: "Use momentum-link portals to reach the upper exit.",
        nextLevelId: "test-chamber-beta",
        tileSize: 32,
        world: {
          width: 30,
          height: 20,
          gravity: { x: 0, y: 900 },
          spawn: { x: 2.5, y: 15.2 },
          exit: { x: 25.2, y: 4.5, width: 2, height: 3 }
        },
        surfaces: [
          { id: "floor", x: 0, y: 19, width: 30, height: 1, normal: { x: 0, y: -1 }, isPortalable: false, material: "stone" },
          { id: "ceiling", x: 0, y: 0, width: 30, height: 1, normal: { x: 0, y: 1 }, isPortalable: false, material: "steel" },
          { id: "left-wall", x: 0, y: 0, width: 1, height: 20, normal: { x: 1, y: 0 }, isPortalable: true, material: "panel" },
          { id: "right-wall", x: 29, y: 0, width: 1, height: 20, normal: { x: -1, y: 0 }, isPortalable: true, material: "panel" },
          { id: "start-platform", x: 1, y: 17, width: 8, height: 1, normal: { x: 0, y: -1 }, isPortalable: false, material: "panel" },
          { id: "launch-well-left", x: 8, y: 9, width: 1, height: 10, normal: { x: 1, y: 0 }, isPortalable: true, material: "panel" },
          { id: "launch-well-right", x: 13, y: 9, width: 1, height: 10, normal: { x: -1, y: 0 }, isPortalable: true, material: "panel" },
          { id: "well-floor", x: 8, y: 18, width: 6, height: 1, normal: { x: 0, y: -1 }, isPortalable: true, material: "panel" },
          { id: "upper-ledge", x: 20, y: 8, width: 9, height: 1, normal: { x: 0, y: -1 }, isPortalable: true, material: "panel" },
          { id: "upper-column", x: 22, y: 8, width: 1, height: 7, normal: { x: 1, y: 0 }, isPortalable: false, material: "steel" }
        ],
        entities: [
          { id: "player", type: "player", x: 2.5, y: 15.2, width: 0.9, height: 1.8, properties: { moveSpeed: 240, jumpSpeed: 420, grabRange: 78 } },
          { id: "exit-door", type: "exitDoor", x: 25.2, y: 4.5, width: 2, height: 3, properties: { open: true } }
        ],
        triggers: [],
        art: { theme: "lab-flash", publicDomainOnly: true }
      },
      {
        version: LEVEL_SCHEMA_VERSION,
        id: "test-chamber-beta",
        title: "Test Chamber Beta",
        objective: "Park the weighted cube on the floor button and enter the open door.",
        nextLevelId: null,
        tileSize: 32,
        world: {
          width: 30,
          height: 20,
          gravity: { x: 0, y: 900 },
          spawn: { x: 2.2, y: 15.2 },
          exit: { x: 25.5, y: 14.2, width: 2, height: 3 }
        },
        surfaces: [
          { id: "floor", x: 0, y: 19, width: 30, height: 1, normal: { x: 0, y: -1 }, isPortalable: false, material: "stone" },
          { id: "ceiling", x: 0, y: 0, width: 30, height: 1, normal: { x: 0, y: 1 }, isPortalable: false, material: "steel" },
          { id: "left-wall", x: 0, y: 0, width: 1, height: 20, normal: { x: 1, y: 0 }, isPortalable: true, material: "panel" },
          { id: "right-wall", x: 29, y: 0, width: 1, height: 20, normal: { x: -1, y: 0 }, isPortalable: true, material: "panel" },
          { id: "spawn-platform", x: 1, y: 17, width: 9, height: 1, normal: { x: 0, y: -1 }, isPortalable: false, material: "panel" },
          { id: "cube-shelf", x: 10, y: 13, width: 5, height: 1, normal: { x: 0, y: -1 }, isPortalable: true, material: "panel" },
          { id: "button-platform", x: 19, y: 16, width: 5, height: 1, normal: { x: 0, y: -1 }, isPortalable: true, material: "panel" },
          { id: "door-platform", x: 23, y: 17, width: 6, height: 1, normal: { x: 0, y: -1 }, isPortalable: false, material: "panel" },
          { id: "center-column-left", x: 15, y: 8, width: 1, height: 11, normal: { x: 1, y: 0 }, isPortalable: true, material: "panel" },
          { id: "center-column-right", x: 18, y: 8, width: 1, height: 11, normal: { x: -1, y: 0 }, isPortalable: true, material: "panel" }
        ],
        entities: [
          { id: "player", type: "player", x: 2.2, y: 15.2, width: 0.9, height: 1.8, properties: { moveSpeed: 240, jumpSpeed: 420, grabRange: 78 } },
          { id: "cube-1", type: "weightedCube", x: 12.1, y: 12.05, width: 0.9, height: 0.9, properties: { mass: 2 } },
          { id: "button-1", type: "floorButton", x: 20.2, y: 15.7, width: 2.3, height: 0.6, properties: { targetId: "exit-door", weightThreshold: 1 } },
          { id: "exit-door", type: "exitDoor", x: 25.5, y: 14.2, width: 2, height: 3, properties: { open: false } }
        ],
        triggers: [
          { id: "button-opens-door", type: "buttonTarget", sourceId: "button-1", targetId: "exit-door", action: "open" }
        ],
        art: { theme: "lab-flash", publicDomainOnly: true }
      }
    ];
  }

  function parseLevels(rawLevels) {
    if (!Array.isArray(rawLevels)) {
      fail("parseLevels expects an array.");
    }
    return Object.freeze(rawLevels.map(parseLevelDefinition));
  }

  globalScope.LevelParser = Object.freeze({
    LEVEL_SCHEMA_VERSION: LEVEL_SCHEMA_VERSION,
    createBuiltinLevels: createBuiltinLevels,
    parseLevelDefinition: parseLevelDefinition,
    parseLevels: parseLevels
  });

  globalScope.createBuiltinLevels = createBuiltinLevels;
  globalScope.parseLevelDefinition = parseLevelDefinition;
})(window);
