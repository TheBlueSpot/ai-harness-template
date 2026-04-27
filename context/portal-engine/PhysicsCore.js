(function initPhysicsCore(globalScope) {
  "use strict";

  var FIXED_DT = 1 / 60;
  var MAX_SUBSTEPS = 6;
  var EPSILON = 0.0001;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function sign(value) {
    if (value > 0) {
      return 1;
    }
    if (value < 0) {
      return -1;
    }
    return 0;
  }

  function Vec2(x, y) {
    this.x = typeof x === "number" ? x : 0;
    this.y = typeof y === "number" ? y : 0;
  }

  Vec2.prototype.clone = function clone() {
    return new Vec2(this.x, this.y);
  };

  Vec2.prototype.set = function set(x, y) {
    this.x = x;
    this.y = y;
    return this;
  };

  Vec2.prototype.add = function add(other) {
    return new Vec2(this.x + other.x, this.y + other.y);
  };

  Vec2.prototype.sub = function sub(other) {
    return new Vec2(this.x - other.x, this.y - other.y);
  };

  Vec2.prototype.scale = function scale(multiplier) {
    return new Vec2(this.x * multiplier, this.y * multiplier);
  };

  Vec2.prototype.dot = function dot(other) {
    return this.x * other.x + this.y * other.y;
  };

  Vec2.prototype.length = function length() {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  };

  Vec2.prototype.normalize = function normalize() {
    var magnitude = this.length();
    if (magnitude < EPSILON) {
      return new Vec2(0, 0);
    }
    return new Vec2(this.x / magnitude, this.y / magnitude);
  };

  function AABB(x, y, width, height) {
    this.x = typeof x === "number" ? x : 0;
    this.y = typeof y === "number" ? y : 0;
    this.width = typeof width === "number" ? width : 0;
    this.height = typeof height === "number" ? height : 0;
  }

  AABB.prototype.clone = function clone() {
    return new AABB(this.x, this.y, this.width, this.height);
  };

  AABB.prototype.left = function left() {
    return this.x;
  };

  AABB.prototype.right = function right() {
    return this.x + this.width;
  };

  AABB.prototype.top = function top() {
    return this.y;
  };

  AABB.prototype.bottom = function bottom() {
    return this.y + this.height;
  };

  AABB.prototype.centerX = function centerX() {
    return this.x + this.width * 0.5;
  };

  AABB.prototype.centerY = function centerY() {
    return this.y + this.height * 0.5;
  };

  AABB.prototype.intersects = function intersects(other) {
    return this.right() > other.left() + EPSILON &&
      this.left() < other.right() - EPSILON &&
      this.bottom() > other.top() + EPSILON &&
      this.top() < other.bottom() - EPSILON;
  };

  AABB.prototype.expand = function expand(amountX, amountY) {
    return new AABB(
      this.x - amountX,
      this.y - amountY,
      this.width + amountX * 2,
      this.height + amountY * 2
    );
  };

  function PhysicsEntity(type, bounds, options) {
    options = options || {};
    this.id = options.id || (type + "-" + Math.random().toString(36).slice(2, 8));
    this.type = type;
    this.bounds = bounds instanceof AABB ? bounds.clone() : new AABB();
    this.velocity = options.velocity instanceof Vec2 ? options.velocity.clone() : new Vec2();
    this.mass = typeof options.mass === "number" ? options.mass : 1;
    this.gravityScale = typeof options.gravityScale === "number" ? options.gravityScale : 1;
    this.dynamic = options.dynamic !== false;
    this.solid = options.solid !== false;
    this.carried = false;
    this.onGround = false;
    this.portalCooldown = 0;
    this.lastPortalId = null;
  }

  PhysicsEntity.prototype.getCenter = function getCenter() {
    return new Vec2(this.bounds.centerX(), this.bounds.centerY());
  };

  PhysicsEntity.prototype.setCenter = function setCenter(x, y) {
    this.bounds.x = x - this.bounds.width * 0.5;
    this.bounds.y = y - this.bounds.height * 0.5;
    return this;
  };

  PhysicsEntity.prototype.getState = function getState() {
    return {
      id: this.id,
      type: this.type,
      x: this.bounds.x,
      y: this.bounds.y,
      width: this.bounds.width,
      height: this.bounds.height,
      vx: this.velocity.x,
      vy: this.velocity.y,
      onGround: this.onGround,
      carried: this.carried
    };
  };

  function PlayerEntity(bounds, options) {
    options = options || {};
    PhysicsEntity.call(this, "player", bounds, options);
    this.moveSpeed = typeof options.moveSpeed === "number" ? options.moveSpeed : 230;
    this.jumpSpeed = typeof options.jumpSpeed === "number" ? options.jumpSpeed : 400;
    this.grabRange = typeof options.grabRange === "number" ? options.grabRange : 76;
    this.faceDir = 1;
    this.carryingId = null;
  }

  PlayerEntity.prototype = Object.create(PhysicsEntity.prototype);
  PlayerEntity.prototype.constructor = PlayerEntity;

  function WeightedCube(bounds, options) {
    options = options || {};
    PhysicsEntity.call(this, "weightedCube", bounds, options);
    this.mass = typeof options.mass === "number" ? options.mass : 2;
  }

  WeightedCube.prototype = Object.create(PhysicsEntity.prototype);
  WeightedCube.prototype.constructor = WeightedCube;

  function FloorButton(bounds, options) {
    options = options || {};
    this.id = options.id || ("floor-button-" + Math.random().toString(36).slice(2, 8));
    this.type = "floorButton";
    this.bounds = bounds instanceof AABB ? bounds.clone() : new AABB();
    this.pressed = false;
    this.pressedBy = [];
    this.weightThreshold = typeof options.weightThreshold === "number" ? options.weightThreshold : 1;
    this.targetId = options.targetId || null;
  }

  FloorButton.prototype.getState = function getState() {
    return {
      id: this.id,
      type: this.type,
      x: this.bounds.x,
      y: this.bounds.y,
      width: this.bounds.width,
      height: this.bounds.height,
      pressed: this.pressed,
      pressedBy: this.pressedBy.slice()
    };
  };

  function ExitDoor(bounds, options) {
    options = options || {};
    this.id = options.id || ("exit-door-" + Math.random().toString(36).slice(2, 8));
    this.type = "exitDoor";
    this.bounds = bounds instanceof AABB ? bounds.clone() : new AABB();
    this.open = !!options.open;
  }

  ExitDoor.prototype.getState = function getState() {
    return {
      id: this.id,
      type: this.type,
      x: this.bounds.x,
      y: this.bounds.y,
      width: this.bounds.width,
      height: this.bounds.height,
      open: this.open
    };
  };

  function makeBounds(definition) {
    return new AABB(definition.x, definition.y, definition.width, definition.height);
  }

  function rectOverlap(a, b) {
    var overlapX = Math.max(0, Math.min(a.right(), b.right()) - Math.max(a.left(), b.left()));
    var overlapY = Math.max(0, Math.min(a.bottom(), b.bottom()) - Math.max(a.top(), b.top()));
    return overlapX * overlapY;
  }

  function PhysicsWorld(levelState) {
    if (!levelState || typeof levelState !== "object") {
      throw new Error("PhysicsWorld requires a parsed level.");
    }

    this.levelState = levelState;
    this.tileSize = levelState.tileSize;
    this.bounds = new AABB(0, 0, levelState.world.width, levelState.world.height);
    this.gravity = new Vec2(levelState.world.gravity.x, levelState.world.gravity.y);
    this.entities = [];
    this.buttons = [];
    this.doors = [];
    this.staticSolids = [];
    this.player = null;
    this.accumulator = 0;
    this.complete = false;
    this.exitReached = false;
    this.lastStepSeconds = FIXED_DT;
    this._spawnLevel(levelState);
  }

  PhysicsWorld.prototype._spawnLevel = function _spawnLevel(levelState) {
    var i;
    for (i = 0; i < levelState.surfaces.length; i += 1) {
      this.staticSolids.push({
        id: levelState.surfaces[i].id,
        bounds: makeBounds(levelState.surfaces[i]),
        isPortalable: levelState.surfaces[i].isPortalable,
        normal: levelState.surfaces[i].normal
      });
    }

    for (i = 0; i < levelState.entities.length; i += 1) {
      var entityDef = levelState.entities[i];
      var entityBounds = makeBounds(entityDef);
      var props = entityDef.properties || {};

      if (entityDef.type === "player") {
        this.player = new PlayerEntity(entityBounds, {
          id: entityDef.id,
          moveSpeed: props.moveSpeed,
          jumpSpeed: props.jumpSpeed,
          grabRange: props.grabRange
        });
        this.addEntity(this.player);
      } else if (entityDef.type === "weightedCube") {
        this.addEntity(new WeightedCube(entityBounds, {
          id: entityDef.id,
          mass: props.mass
        }));
      } else if (entityDef.type === "floorButton") {
        this.buttons.push(new FloorButton(entityBounds, {
          id: entityDef.id,
          targetId: props.targetId,
          weightThreshold: props.weightThreshold
        }));
      } else if (entityDef.type === "exitDoor") {
        this.doors.push(new ExitDoor(entityBounds, {
          id: entityDef.id,
          open: !!props.open
        }));
      }
    }

    if (!this.player) {
      throw new Error("PhysicsWorld requires a player spawn.");
    }
  };

  PhysicsWorld.prototype.addEntity = function addEntity(entity) {
    this.entities.push(entity);
    return entity;
  };

  PhysicsWorld.prototype.queryButtons = function queryButtons() {
    return this.buttons.slice();
  };

  PhysicsWorld.prototype._getDynamicById = function _getDynamicById(id) {
    var i;
    for (i = 0; i < this.entities.length; i += 1) {
      if (this.entities[i].id === id) {
        return this.entities[i];
      }
    }
    return null;
  };

  PhysicsWorld.prototype._getSolidRects = function _getSolidRects() {
    var solids = [];
    var i;
    for (i = 0; i < this.staticSolids.length; i += 1) {
      solids.push(this.staticSolids[i].bounds);
    }
    for (i = 0; i < this.doors.length; i += 1) {
      if (!this.doors[i].open) {
        solids.push(this.doors[i].bounds);
      }
    }
    return solids;
  };

  PhysicsWorld.prototype._findNearestCube = function _findNearestCube() {
    var i;
    var best = null;
    var bestDistance = Infinity;
    var playerCenter = this.player.getCenter();

    for (i = 0; i < this.entities.length; i += 1) {
      var entity = this.entities[i];
      if (entity.type !== "weightedCube" || entity.carried) {
        continue;
      }
      var delta = entity.getCenter().sub(playerCenter);
      var distance = delta.length();
      if (distance <= this.player.grabRange && distance < bestDistance) {
        bestDistance = distance;
        best = entity;
      }
    }
    return best;
  };

  PhysicsWorld.prototype._updateCarryIntent = function _updateCarryIntent(inputState) {
    var carried;
    if (!this.player) {
      return;
    }

    if (inputState.dropPressed && this.player.carryingId) {
      carried = this._getDynamicById(this.player.carryingId);
      if (carried) {
        carried.carried = false;
        carried.velocity.x = this.player.velocity.x;
        carried.velocity.y = this.player.velocity.y;
      }
      this.player.carryingId = null;
      return;
    }

    if (inputState.grabPressed && !this.player.carryingId) {
      carried = this._findNearestCube();
      if (carried) {
        carried.carried = true;
        carried.velocity.x = this.player.velocity.x;
        carried.velocity.y = this.player.velocity.y;
        this.player.carryingId = carried.id;
      }
    }
  };

  PhysicsWorld.prototype._syncCarriedCube = function _syncCarriedCube() {
    var carried;
    if (!this.player.carryingId) {
      return;
    }

    carried = this._getDynamicById(this.player.carryingId);
    if (!carried) {
      this.player.carryingId = null;
      return;
    }

    carried.carried = true;
    carried.velocity.x = this.player.velocity.x;
    carried.velocity.y = this.player.velocity.y;
    carried.bounds.x = this.player.bounds.centerX() - carried.bounds.width * 0.5;
    carried.bounds.y = this.player.bounds.y - carried.bounds.height - 10;
  };

  PhysicsWorld.prototype._resolveAxis = function _resolveAxis(entity, axis, amount) {
    var solids = this._getSolidRects();
    var i;
    entity.bounds[axis] += amount;

    for (i = 0; i < solids.length; i += 1) {
      if (!entity.bounds.intersects(solids[i])) {
        continue;
      }

      if (axis === "x") {
        if (amount > 0) {
          entity.bounds.x = solids[i].left() - entity.bounds.width - EPSILON;
        } else if (amount < 0) {
          entity.bounds.x = solids[i].right() + EPSILON;
        }
        entity.velocity.x = 0;
      } else {
        if (amount > 0) {
          entity.bounds.y = solids[i].top() - entity.bounds.height - EPSILON;
          entity.onGround = true;
        } else if (amount < 0) {
          entity.bounds.y = solids[i].bottom() + EPSILON;
        }
        entity.velocity.y = 0;
      }
    }
  };

  PhysicsWorld.prototype._moveEntity = function _moveEntity(entity, dt, portalSystem) {
    var startBounds = entity.bounds.clone();
    var targetBounds = entity.bounds.clone();
    var resolvedBounds;

    targetBounds.x += entity.velocity.x * dt;
    targetBounds.y += entity.velocity.y * dt;

    if (portalSystem && typeof portalSystem.resolveEntityMovement === "function") {
      portalSystem.resolveEntityMovement(entity, startBounds, targetBounds, this);
    } else {
      entity.bounds = targetBounds;
    }

    resolvedBounds = entity.bounds.clone();
    entity.bounds = startBounds.clone();
    this._resolveAxis(entity, "x", resolvedBounds.x - startBounds.x);
    this._resolveAxis(entity, "y", resolvedBounds.y - startBounds.y);
    entity.bounds.x = clamp(entity.bounds.x, this.bounds.left(), this.bounds.right() - entity.bounds.width);
    entity.bounds.y = clamp(entity.bounds.y, this.bounds.top(), this.bounds.bottom() - entity.bounds.height);
  };

  PhysicsWorld.prototype._updateButtons = function _updateButtons() {
    var i;
    var j;

    for (i = 0; i < this.buttons.length; i += 1) {
      var button = this.buttons[i];
      var totalWeight = 0;
      button.pressedBy = [];

      for (j = 0; j < this.entities.length; j += 1) {
        var entity = this.entities[j];
        if (rectOverlap(button.bounds, entity.bounds) > 0) {
          totalWeight += entity.mass;
          button.pressedBy.push(entity.id);
        }
      }

      button.pressed = totalWeight >= button.weightThreshold;
    }
  };

  PhysicsWorld.prototype._updateDoors = function _updateDoors() {
    var i;
    var allPressed = true;

    for (i = 0; i < this.buttons.length; i += 1) {
      if (!this.buttons[i].pressed) {
        allPressed = false;
      }
    }

    for (i = 0; i < this.doors.length; i += 1) {
      this.doors[i].open = allPressed;
    }
  };

  PhysicsWorld.prototype._checkExit = function _checkExit() {
    var i;
    for (i = 0; i < this.doors.length; i += 1) {
      if (this.doors[i].open && this.player.bounds.intersects(this.doors[i].bounds)) {
        this.exitReached = true;
        this.complete = true;
        return;
      }
    }
  };

  PhysicsWorld.prototype.step = function step(dt, inputState, portalSystem) {
    var frameDt = typeof dt === "number" && dt > 0 ? dt : FIXED_DT;
    var substeps = 0;
    this.accumulator += Math.min(frameDt, 0.1);
    this._updateCarryIntent(inputState || {});

    while (this.accumulator >= FIXED_DT && substeps < MAX_SUBSTEPS) {
      var i;
      var moveX = clamp((inputState && inputState.moveX) || 0, -1, 1);

      this.player.faceDir = moveX === 0 ? this.player.faceDir : sign(moveX);
      this.player.velocity.x = moveX * this.player.moveSpeed;

      if (inputState && inputState.jumpPressed && this.player.onGround) {
        this.player.velocity.y = -this.player.jumpSpeed;
        this.player.onGround = false;
      }

      for (i = 0; i < this.entities.length; i += 1) {
        var entity = this.entities[i];
        if (!entity.dynamic) {
          continue;
        }
        if (entity.carried) {
          continue;
        }
        entity.onGround = false;
        entity.velocity.y += this.gravity.y * FIXED_DT * entity.gravityScale;
        this._moveEntity(entity, FIXED_DT, portalSystem);
        if (entity.portalCooldown > 0) {
          entity.portalCooldown = Math.max(0, entity.portalCooldown - FIXED_DT);
          if (entity.portalCooldown === 0) {
            entity.lastPortalId = null;
          }
        }
      }

      this._syncCarriedCube();
      this._updateButtons();
      this._updateDoors();
      this._checkExit();
      this.accumulator -= FIXED_DT;
      this.lastStepSeconds = FIXED_DT;
      substeps += 1;
    }

    return this.getSerializableState();
  };

  PhysicsWorld.prototype.getSerializableState = function getSerializableState() {
    var actors = [];
    var i;

    for (i = 0; i < this.entities.length; i += 1) {
      actors.push(this.entities[i].getState());
    }
    for (i = 0; i < this.buttons.length; i += 1) {
      actors.push(this.buttons[i].getState());
    }
    for (i = 0; i < this.doors.length; i += 1) {
      actors.push(this.doors[i].getState());
    }

    return {
      actors: actors,
      levelTitle: this.levelState.title,
      levelId: this.levelState.id,
      objective: this.levelState.objective,
      isComplete: this.complete,
      exitReached: this.exitReached,
      playerId: this.player.id,
      carryingId: this.player.carryingId,
      surfaces: this.levelState.surfaces,
      buttons: this.buttons.map(function mapButton(button) {
        return button.getState();
      }),
      doors: this.doors.map(function mapDoor(door) {
        return door.getState();
      })
    };
  };

  globalScope.PhysicsCore = Object.freeze({
    Vec2: Vec2,
    AABB: AABB,
    PhysicsEntity: PhysicsEntity,
    PlayerEntity: PlayerEntity,
    WeightedCube: WeightedCube,
    FloorButton: FloorButton,
    ExitDoor: ExitDoor,
    PhysicsWorld: PhysicsWorld
  });

  globalScope.Vec2 = Vec2;
  globalScope.AABB = AABB;
  globalScope.PhysicsEntity = PhysicsEntity;
  globalScope.PlayerEntity = PlayerEntity;
  globalScope.WeightedCube = WeightedCube;
  globalScope.FloorButton = FloorButton;
  globalScope.ExitDoor = ExitDoor;
  globalScope.PhysicsWorld = PhysicsWorld;
})(window);
