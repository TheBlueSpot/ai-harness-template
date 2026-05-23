import { expect, test } from "bun:test";
import { createStage } from "./stage.ts";

type TestEntity = {
  id: string;
  active?: boolean;
  layer?: number;
};

test("stage renders lower layers before higher layers", () => {
  const rendered: string[] = [];
  const stage = createStage<TestEntity>({
    renderEntity: (entity) => {
      rendered.push(entity.id);
    }
  });

  stage.spawn({ id: "player" }, { layer: 10 });
  stage.spawn({ id: "background" }, { layer: -10 });
  stage.spawn({ id: "effect" }, { layer: 20 });

  stage.render(null);

  expect(rendered).toEqual(["background", "player", "effect"]);
});

test("stage preserves spawn order inside the same layer", () => {
  const rendered: string[] = [];
  const stage = createStage<TestEntity>({
    renderEntity: (entity) => {
      rendered.push(entity.id);
    }
  });

  stage.spawn({ id: "first" }, { layer: 1 });
  stage.spawn({ id: "second" }, { layer: 1 });

  stage.render(null);

  expect(rendered).toEqual(["first", "second"]);
});

test("stage can move an entity to a different render layer", () => {
  const rendered: string[] = [];
  const stage = createStage<TestEntity>({
    renderEntity: (entity) => {
      rendered.push(entity.id);
    }
  });
  const background = stage.spawn({ id: "background" }, { layer: -10 });

  stage.spawn({ id: "player" }, { layer: 0 });
  stage.setLayer(background, 10);
  stage.render(null);

  expect(rendered).toEqual(["player", "background"]);
});

test("stage updates only active entities", () => {
  const updated: string[] = [];
  const stage = createStage<TestEntity>({
    updateEntity: (entity) => {
      updated.push(entity.id);
    }
  });

  stage.spawn({ id: "active" });
  stage.spawn({ id: "inactive", active: false });
  stage.update(1 / 60);

  expect(updated).toEqual(["active"]);
});
