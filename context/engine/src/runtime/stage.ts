export type StageEntity = {
  active?: boolean;
  visible?: boolean;
  layer?: number;
  order?: number;
  update?: (entity: StageEntity, delta: number) => void;
  render?: (entity: StageEntity, target: unknown, alpha: number) => void;
};

export type StageOptions<T extends StageEntity = StageEntity> = {
  updateEntity?: (entity: T, delta: number) => void;
  renderEntity?: (entity: T, target: unknown, alpha: number) => void;
};

export function createStage<T extends StageEntity = StageEntity>({ updateEntity, renderEntity }: StageOptions<T> = {}) {
  const entities: T[] = [];
  let nextOrder = 1;
  let renderOrderDirty = false;

  function sortForRender() {
    if (!renderOrderDirty) return;
    entities.sort((a, b) => {
      const layerDelta = (a.layer || 0) - (b.layer || 0);
      if (layerDelta !== 0) return layerDelta;
      return (a.order ?? 0) - (b.order ?? 0);
    });
    renderOrderDirty = false;
  }

  function spawn(entity: T, options: Pick<StageEntity, "active" | "layer"> = {}) {
    entity.active = options.active ?? entity.active ?? true;
    entity.layer = options.layer ?? entity.layer ?? 0;
    entity.order = nextOrder;
    nextOrder += 1;
    entities.push(entity);
    renderOrderDirty = true;
    return entity;
  }

  function remove(entity: T) {
    const index = entities.indexOf(entity);
    if (index === -1) return false;
    entities.splice(index, 1);
    return true;
  }

  function setLayer(entity: T, layer: number) {
    if (entity.layer === layer) return;
    entity.layer = layer;
    renderOrderDirty = true;
  }

  function update(delta: number) {
    for (let i = 0; i < entities.length; i += 1) {
      const entity = entities[i];
      if (entity.active === false) continue;
      if (entity.update) {
        entity.update(entity, delta);
      } else if (updateEntity) {
        updateEntity(entity, delta);
      }
    }
  }

  function render(target: unknown, alpha = 1) {
    sortForRender();
    for (let i = 0; i < entities.length; i += 1) {
      const entity = entities[i];
      if (entity.active === false || entity.visible === false) continue;
      if (entity.render) {
        entity.render(entity, target, alpha);
      } else if (renderEntity) {
        renderEntity(entity, target, alpha);
      }
    }
  }

  return {
    spawn,
    remove,
    setLayer,
    update,
    render,
    clear() {
      entities.length = 0;
      nextOrder = 1;
      renderOrderDirty = false;
    },
    entities() {
      return entities;
    },
    count() {
      return entities.length;
    }
  };
}
