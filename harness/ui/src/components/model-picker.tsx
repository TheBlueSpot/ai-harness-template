import { useHarnessStore } from "../store/use-harness-store";

export function ModelPicker() {
  const models = useHarnessStore((state) => state.availableModels);
  const selectedModelId = useHarnessStore((state) => state.selectedModelId);
  const setSelectedModelId = useHarnessStore((state) => state.setSelectedModelId);

  return (
    <label className="model-picker">
      <span className="model-picker__label">Model</span>
      <select
        className="model-picker__select"
        value={selectedModelId}
        onChange={(event) => setSelectedModelId(event.target.value)}
      >
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.label}
          </option>
        ))}
      </select>
    </label>
  );
}

