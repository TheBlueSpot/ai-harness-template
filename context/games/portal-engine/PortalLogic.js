(function initPortalLogic(globalScope) {
  "use strict";

  var EPSILON = 0.0001;
  var ENTRY_PADDING = 6;
  var ENTRY_TANGENT_GRACE = 12;
  var DEFAULT_PORTAL_LENGTH = 108;
  var DEFAULT_PORTAL_THICKNESS = 14;

  function vec(x, y) {
    return { x: x, y: y };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function add(a, b) {
    return vec(a.x + b.x, a.y + b.y);
  }

  function sub(a, b) {
    return vec(a.x - b.x, a.y - b.y);
  }

  function scale(v, amount) {
    return vec(v.x * amount, v.y * amount);
  }

  function dot(a, b) {
    return a.x * b.x + a.y * b.y;
  }

  function length(v) {
    return Math.sqrt(v.x * v.x + v.y * v.y);
  }

  function normalize(v) {
    var magnitude = length(v);
    if (magnitude < EPSILON) {
      return vec(1, 0);
    }
    return vec(v.x / magnitude, v.y / magnitude);
  }

  function clonePortal(portal) {
    if (!portal) {
      return null;
    }
    return {
      id: portal.id,
      color: portal.color,
      surfaceId: portal.surfaceId,
      center: vec(portal.center.x, portal.center.y),
      normal: vec(portal.normal.x, portal.normal.y),
      tangent: vec(portal.tangent.x, portal.tangent.y),
      width: portal.width,
      height: portal.height,
      length: portal.length,
      thickness: portal.thickness
    };
  }

  function rotateVelocityThroughPortal(velocity, entryNormal, exitNormal) {
    var entry = normalize(entryNormal);
    var exit = normalize(exitNormal);
    var entryForward = scale(entry, -1);
    var entryTangent = vec(-entry.y, entry.x);
    var exitTangent = vec(-exit.y, exit.x);
    var forwardMagnitude = dot(velocity, entryForward);
    var lateralMagnitude = dot(velocity, entryTangent);

    return add(scale(exit, forwardMagnitude), scale(exitTangent, lateralMagnitude));
  }

  function PortalSurfaceRaycaster(levelState) {
    this.levelState = levelState || { surfaces: [] };
  }

  PortalSurfaceRaycaster.prototype.cast = function cast(origin, direction) {
    var ray = normalize(direction);
    var surfaces = (this.levelState && this.levelState.surfaces) || [];
    var bestHit = null;
    var i;

    for (i = 0; i < surfaces.length; i += 1) {
      var surface = surfaces[i];
      var planeValue;
      var travel;
      var hitPoint;

      if (!surface.isPortalable) {
        continue;
      }

      if (Math.abs(surface.normal.x) > EPSILON) {
        if (Math.abs(ray.x) < EPSILON) {
          continue;
        }

        planeValue = surface.normal.x > 0 ? surface.x : surface.x + surface.width;
        travel = (planeValue - origin.x) / ray.x;
        if (travel <= 0) {
          continue;
        }
        hitPoint = vec(origin.x + ray.x * travel, origin.y + ray.y * travel);
        if (hitPoint.y < surface.y || hitPoint.y > surface.y + surface.height) {
          continue;
        }
      } else {
        if (Math.abs(ray.y) < EPSILON) {
          continue;
        }

        planeValue = surface.normal.y > 0 ? surface.y : surface.y + surface.height;
        travel = (planeValue - origin.y) / ray.y;
        if (travel <= 0) {
          continue;
        }
        hitPoint = vec(origin.x + ray.x * travel, origin.y + ray.y * travel);
        if (hitPoint.x < surface.x || hitPoint.x > surface.x + surface.width) {
          continue;
        }
      }

      if (!bestHit || travel < bestHit.distance) {
        bestHit = {
          surface: surface,
          point: hitPoint,
          normal: vec(surface.normal.x, surface.normal.y),
          distance: travel
        };
      }
    }

    return bestHit;
  };

  function PortalPair() {
    this.blue = null;
    this.orange = null;
  }

  PortalPair.prototype.setPortal = function setPortal(color, portal) {
    if (color === "orange") {
      this.orange = portal;
    } else {
      this.blue = portal;
    }
    return portal;
  };

  PortalPair.prototype.getPortal = function getPortal(color) {
    return color === "orange" ? this.orange : this.blue;
  };

  PortalPair.prototype.getLinked = function getLinked(color) {
    return color === "orange" ? this.blue : this.orange;
  };

  PortalPair.prototype.isComplete = function isComplete() {
    return !!(this.blue && this.orange);
  };

  function buildPortalPlacement(color, hit) {
    var normal = normalize(hit.normal);
    var tangent = vec(-normal.y, normal.x);
    var lengthLimit = Math.abs(normal.x) > EPSILON ? hit.surface.height : hit.surface.width;
    var portalLength = Math.min(DEFAULT_PORTAL_LENGTH, Math.max(64, lengthLimit - 12));
    var center = vec(hit.point.x, hit.point.y);

    if (portalLength > lengthLimit - 4) {
      return null;
    }

    if (Math.abs(normal.x) > EPSILON) {
      center.y = Math.max(
        hit.surface.y + portalLength * 0.5 + 2,
        Math.min(hit.point.y, hit.surface.y + hit.surface.height - portalLength * 0.5 - 2)
      );
      center.x = normal.x > 0 ? hit.surface.x + hit.surface.width : hit.surface.x;
    } else {
      center.x = Math.max(
        hit.surface.x + portalLength * 0.5 + 2,
        Math.min(hit.point.x, hit.surface.x + hit.surface.width - portalLength * 0.5 - 2)
      );
      center.y = normal.y > 0 ? hit.surface.y + hit.surface.height : hit.surface.y;
    }

    return {
      id: color,
      color: color,
      surfaceId: hit.surface.id,
      center: center,
      normal: normal,
      tangent: tangent,
      width: Math.abs(normal.x) > EPSILON ? DEFAULT_PORTAL_THICKNESS : portalLength,
      height: Math.abs(normal.x) > EPSILON ? portalLength : DEFAULT_PORTAL_THICKNESS,
      length: portalLength,
      thickness: DEFAULT_PORTAL_THICKNESS
    };
  }

  function entityHalfExtent(entity, axis) {
    return axis === "x" ? entity.bounds.width * 0.5 : entity.bounds.height * 0.5;
  }

  function getPortalStateForEntity(entity, portal) {
    var center = {
      x: entity.bounds.centerX(),
      y: entity.bounds.centerY()
    };
    var halfNormal = Math.abs(portal.normal.x) > EPSILON ?
      entityHalfExtent(entity, "x") :
      entityHalfExtent(entity, "y");
    var halfTangent = Math.abs(portal.tangent.x) > EPSILON ?
      entityHalfExtent(entity, "x") :
      entityHalfExtent(entity, "y");

    return {
      center: center,
      signedDistance: dot(sub(center, portal.center), portal.normal),
      tangentDistance: dot(sub(center, portal.center), portal.tangent),
      halfNormal: halfNormal,
      halfTangent: halfTangent
    };
  }

  function setEntityCenter(entity, point) {
    entity.bounds.x = point.x - entity.bounds.width * 0.5;
    entity.bounds.y = point.y - entity.bounds.height * 0.5;
  }

  function PortalSystem(levelState) {
    this.levelState = levelState || { surfaces: [] };
    this.raycaster = new PortalSurfaceRaycaster(this.levelState);
    this.pair = new PortalPair();
    this.transitionLog = [];
  }

  PortalSystem.prototype.tryPlacePortal = function tryPlacePortal(color, origin, direction, levelState) {
    var state = levelState || this.levelState;
    var hit;
    var placement;

    this.levelState = state;
    this.raycaster.levelState = state;
    hit = this.raycaster.cast(origin, direction);

    if (!hit) {
      return { placed: false, reason: "no-surface" };
    }

    placement = buildPortalPlacement(color, hit);
    if (!placement) {
      return { placed: false, reason: "surface-too-small" };
    }

    this.pair.setPortal(color, placement);
    return { placed: true, portal: clonePortal(placement) };
  };

  PortalSystem.prototype.previewPortalPlacement = function previewPortalPlacement(color, origin, direction, levelState) {
    var state = levelState || this.levelState;
    var hit;
    var placement;

    this.levelState = state;
    this.raycaster.levelState = state;
    hit = this.raycaster.cast(origin, direction);

    if (!hit) {
      return { placed: false, reason: "no-surface", hit: null, portal: null };
    }

    placement = buildPortalPlacement(color, hit);
    if (!placement) {
      return { placed: false, reason: "surface-too-small", hit: hit, portal: null };
    }

    return {
      placed: true,
      reason: null,
      hit: {
        surfaceId: hit.surface.id,
        isPortalable: hit.surface.isPortalable,
        point: vec(hit.point.x, hit.point.y),
        normal: vec(hit.normal.x, hit.normal.y)
      },
      portal: clonePortal(placement)
    };
  };

  PortalSystem.prototype.resolveEntityMovement = function resolveEntityMovement(entity, fromBounds, toBounds) {
    var activePortals = [this.pair.blue, this.pair.orange];
    var i;

    entity.bounds = toBounds.clone();

    for (i = 0; i < activePortals.length; i += 1) {
      var entry = activePortals[i];
      var exit = this.pair.getLinked(entry && entry.color);
      var fromState;
      var toState;
      var tangentLimit;
      var offset;
      var exitState;
      var rotatedVelocity;

      if (!entry || !exit) {
        continue;
      }
      if (entity.portalCooldown > 0 && entity.lastPortalId === entry.id) {
        continue;
      }

      entity.bounds = fromBounds.clone();
      fromState = getPortalStateForEntity(entity, entry);
      entity.bounds = toBounds.clone();
      toState = getPortalStateForEntity(entity, entry);

      tangentLimit = entry.length * 0.5 + toState.halfTangent + ENTRY_TANGENT_GRACE;
      if (Math.abs(toState.tangentDistance) > tangentLimit) {
        continue;
      }

      if (fromState.signedDistance <= toState.halfNormal + ENTRY_PADDING) {
        continue;
      }
      if (toState.signedDistance > toState.halfNormal + ENTRY_PADDING) {
        continue;
      }
      if (dot({ x: entity.velocity.x, y: entity.velocity.y }, entry.normal) >= 0) {
        continue;
      }

      offset = clamp(toState.tangentDistance, -exit.length * 0.5 + toState.halfTangent, exit.length * 0.5 - toState.halfTangent);
      exitState = add(add(exit.center, scale(exit.tangent, offset)), scale(exit.normal, toState.halfNormal + ENTRY_PADDING));
      rotatedVelocity = rotateVelocityThroughPortal({ x: entity.velocity.x, y: entity.velocity.y }, entry.normal, exit.normal);

      setEntityCenter(entity, exitState);
      entity.velocity.x = rotatedVelocity.x;
      entity.velocity.y = rotatedVelocity.y;
      entity.portalCooldown = 0.16;
      entity.lastPortalId = exit.id;
      this.transitionLog.push({
        entityId: entity.id,
        from: entry.id,
        to: exit.id
      });

      return { teleported: true, portalId: entry.id };
    }

    entity.bounds = toBounds.clone();
    return { teleported: false };
  };

  PortalSystem.prototype.updateEntityTransitions = function updateEntityTransitions() {
    var transitions = this.transitionLog.slice();
    this.transitionLog.length = 0;
    return transitions;
  };

  PortalSystem.prototype.getRenderState = function getRenderState() {
    var renderPortals = [];

    function pushPortal(portal, linkedPortal) {
      if (!portal) {
        return;
      }
      renderPortals.push({
        id: portal.id,
        color: portal.color,
        center: vec(portal.center.x, portal.center.y),
        normal: vec(portal.normal.x, portal.normal.y),
        tangent: vec(portal.tangent.x, portal.tangent.y),
        width: portal.width,
        height: portal.height,
        linkedPortal: linkedPortal ? {
          id: linkedPortal.id,
          center: vec(linkedPortal.center.x, linkedPortal.center.y),
          normal: vec(linkedPortal.normal.x, linkedPortal.normal.y)
        } : null
      });
    }

    pushPortal(this.pair.blue, this.pair.orange);
    pushPortal(this.pair.orange, this.pair.blue);

    return {
      portals: renderPortals,
      linked: this.pair.isComplete()
    };
  };

  globalScope.PortalLogic = Object.freeze({
    PortalSurfaceRaycaster: PortalSurfaceRaycaster,
    PortalPair: PortalPair,
    PortalSystem: PortalSystem,
    rotateVelocityThroughPortal: rotateVelocityThroughPortal
  });

  globalScope.PortalSystem = PortalSystem;
})(window);
