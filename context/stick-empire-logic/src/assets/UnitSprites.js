import {
  ASSET_SLOT_NOTES,
  ENTITY_TYPES,
  RESOURCE_TYPES,
  STRUCTURE_TYPES,
  TEAM_COLORS,
  TEAM_IDS,
  UNIT_TYPES,
} from "../game/config.js";

const assetOverrides = new Map();

function encodeSvg(markup) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(markup)}`;
}

function buildSvg(width, height, body) {
  return encodeSvg(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" fill="none">${body}</svg>`,
  );
}

function getPalette(team) {
  return TEAM_COLORS[team] ?? TEAM_COLORS[TEAM_IDS.NEUTRAL];
}

function buildMinerBody(palette) {
  return `
    <ellipse cx="50" cy="108" rx="30" ry="8" fill="${palette.shadow}" />
    <path d="M34 92 L45 50" stroke="${palette.fill}" stroke-width="6" stroke-linecap="round" />
    <path d="M66 92 L55 50" stroke="${palette.fill}" stroke-width="6" stroke-linecap="round" />
    <path d="M50 28 L50 74" stroke="${palette.fill}" stroke-width="6" stroke-linecap="round" />
    <circle cx="50" cy="19" r="10" stroke="${palette.fill}" stroke-width="6" />
    <path d="M50 42 L28 60" stroke="${palette.fill}" stroke-width="6" stroke-linecap="round" />
    <path d="M50 44 L77 54" stroke="${palette.fill}" stroke-width="6" stroke-linecap="round" />
    <path d="M74 52 L88 44 L83 34" stroke="${palette.accent}" stroke-width="6" stroke-linecap="round" />
    <path d="M35 16 L50 8 L65 16" stroke="${palette.accent}" stroke-width="4" stroke-linecap="round" />
  `;
}

function buildSwordwrathBody(palette) {
  return `
    <ellipse cx="50" cy="108" rx="32" ry="8" fill="${palette.shadow}" />
    <path d="M36 94 L47 48" stroke="${palette.fill}" stroke-width="6" stroke-linecap="round" />
    <path d="M64 94 L53 48" stroke="${palette.fill}" stroke-width="6" stroke-linecap="round" />
    <path d="M50 28 L50 74" stroke="${palette.fill}" stroke-width="6" stroke-linecap="round" />
    <circle cx="50" cy="19" r="10" stroke="${palette.fill}" stroke-width="6" />
    <path d="M50 42 L29 56" stroke="${palette.fill}" stroke-width="6" stroke-linecap="round" />
    <path d="M50 44 L72 30" stroke="${palette.fill}" stroke-width="6" stroke-linecap="round" />
    <path d="M72 30 L89 11" stroke="${palette.accent}" stroke-width="5" stroke-linecap="round" />
    <path d="M89 11 L95 17" stroke="${palette.fill}" stroke-width="5" stroke-linecap="round" />
    <path d="M31 58 L21 45 L28 32 L41 37 Z" fill="${palette.accent}" fill-opacity="0.75" />
  `;
}

function buildArchidonBody(palette) {
  return `
    <ellipse cx="50" cy="108" rx="30" ry="8" fill="${palette.shadow}" />
    <path d="M34 94 L47 52" stroke="${palette.fill}" stroke-width="6" stroke-linecap="round" />
    <path d="M66 94 L53 52" stroke="${palette.fill}" stroke-width="6" stroke-linecap="round" />
    <path d="M50 28 L50 76" stroke="${palette.fill}" stroke-width="6" stroke-linecap="round" />
    <circle cx="50" cy="19" r="10" stroke="${palette.fill}" stroke-width="6" />
    <path d="M50 44 L28 58" stroke="${palette.fill}" stroke-width="6" stroke-linecap="round" />
    <path d="M50 42 L73 48" stroke="${palette.fill}" stroke-width="6" stroke-linecap="round" />
    <path d="M76 36 C88 44 88 66 76 74" stroke="${palette.accent}" stroke-width="5" stroke-linecap="round" />
    <path d="M74 48 L92 32" stroke="${palette.fill}" stroke-width="4" stroke-linecap="round" />
    <path d="M74 62 L92 46" stroke="${palette.fill}" stroke-width="4" stroke-linecap="round" />
  `;
}

function buildStatueBody(palette) {
  return `
    <ellipse cx="82" cy="190" rx="54" ry="12" fill="${palette.shadow}" />
    <path d="M26 186 H138" stroke="${palette.accent}" stroke-width="12" stroke-linecap="round" />
    <path d="M58 182 V78" stroke="${palette.fill}" stroke-width="10" stroke-linecap="round" />
    <path d="M106 182 V70" stroke="${palette.fill}" stroke-width="10" stroke-linecap="round" />
    <path d="M82 48 V140" stroke="${palette.fill}" stroke-width="12" stroke-linecap="round" />
    <circle cx="82" cy="28" r="18" stroke="${palette.fill}" stroke-width="10" />
    <path d="M82 86 L46 110" stroke="${palette.fill}" stroke-width="10" stroke-linecap="round" />
    <path d="M82 88 L118 68" stroke="${palette.fill}" stroke-width="10" stroke-linecap="round" />
    <path d="M118 68 L136 44" stroke="${palette.accent}" stroke-width="8" stroke-linecap="round" />
  `;
}

function buildGoldVeinBody() {
  return `
    <ellipse cx="52" cy="94" rx="34" ry="8" fill="rgba(248, 203, 116, 0.25)" />
    <path d="M19 86 L38 34 L57 55 L77 22 L89 72 L68 90 Z" fill="#f8cb74" fill-opacity="0.92" />
    <path d="M34 48 L45 58 L62 40" stroke="#fff0c5" stroke-width="4" stroke-linecap="round" />
  `;
}

function buildPlaceholderSrc(entity) {
  const palette = getPalette(entity.team);

  if (entity.entityType === ENTITY_TYPES.UNIT) {
    if (entity.unitType === UNIT_TYPES.MINER) {
      return buildSvg(100, 120, buildMinerBody(palette));
    }
    if (entity.unitType === UNIT_TYPES.ARCHIDON) {
      return buildSvg(100, 120, buildArchidonBody(palette));
    }
    return buildSvg(100, 120, buildSwordwrathBody(palette));
  }

  if (entity.entityType === ENTITY_TYPES.STRUCTURE && entity.structureType === STRUCTURE_TYPES.STATUE) {
    return buildSvg(164, 220, buildStatueBody(palette));
  }

  if (entity.entityType === ENTITY_TYPES.RESOURCE && entity.resourceType === RESOURCE_TYPES.GOLD_VEIN) {
    return buildSvg(104, 104, buildGoldVeinBody());
  }

  return buildSvg(64, 64, `<circle cx="32" cy="32" r="18" stroke="${palette.fill}" stroke-width="5" />`);
}

function resolveSlot(entity) {
  if (entity.entityType === ENTITY_TYPES.UNIT) {
    return `units/${entity.unitType.toLowerCase()}/${entity.team}`;
  }
  if (entity.entityType === ENTITY_TYPES.STRUCTURE) {
    return `structures/${entity.structureType.toLowerCase()}/${entity.team}`;
  }
  if (entity.entityType === ENTITY_TYPES.RESOURCE) {
    return `resources/${entity.resourceType.toLowerCase()}`;
  }
  return `misc/${entity.entityType}`;
}

export function getAssetDescriptor(entity) {
  const slot = resolveSlot(entity);
  return {
    slot,
    notes:
      slot.startsWith("units/") ? ASSET_SLOT_NOTES.units
      : slot.startsWith("structures/") ? ASSET_SLOT_NOTES.structures
      : ASSET_SLOT_NOTES.resources,
    src: assetOverrides.get(slot) ?? buildPlaceholderSrc(entity),
  };
}

export function setAssetOverride(slot, src) {
  assetOverrides.set(slot, src);
}

export function clearAssetOverrides() {
  assetOverrides.clear();
}
