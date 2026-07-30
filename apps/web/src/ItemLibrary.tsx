import {
  type FixtureDefinition,
  type FurnitureDefinition
} from "@smarchitect/core";
import { useEffect, useState } from "react";
import {
  type ItemKind,
  type ItemLibraryController
} from "./use-item-library.js";

const EMPTY_DRAFT = {
  name: "",
  widthMm: 1000,
  depthMm: 600,
  heightMm: 800
};

type Definition = FurnitureDefinition | FixtureDefinition;
type DefinitionDraft = Pick<
  Definition,
  "name" | "widthMm" | "depthMm" | "heightMm"
>;

interface ItemLibraryProps {
  controller: ItemLibraryController;
  disabled: boolean;
  onPlace(kind: ItemKind, id: string): void;
}

function draftFor(definition: Definition): DefinitionDraft {
  return {
    name: definition.name,
    widthMm: definition.widthMm,
    depthMm: definition.depthMm,
    heightMm: definition.heightMm
  };
}

export function ItemLibrary({
  controller,
  disabled,
  onPlace
}: ItemLibraryProps) {
  const [kind, setKind] = useState<ItemKind>("furniture");
  const [newDefinition, setNewDefinition] = useState(EMPTY_DRAFT);
  const [drafts, setDrafts] = useState<Record<string, DefinitionDraft>>({});
  const label = kind === "furniture" ? "Furniture" : "Fixture";
  const definitions: Definition[] = kind === "furniture"
    ? controller.furnitureDefinitions
    : controller.fixtureDefinitions;
  const history = controller.history;

  useEffect(() => {
    setDrafts(Object.fromEntries(
      definitions.map((definition) => [
        definition.id,
        draftFor(definition)
      ])
    ));
  }, [definitions]);

  async function commitDraft(
    definition: Definition,
    update: Partial<DefinitionDraft>
  ): Promise<void> {
    const accepted = kind === "furniture"
      ? await controller.updateFurniture(definition.id, update)
      : await controller.updateFixture(definition.id, update);
    if (!accepted) {
      setDrafts((current) => ({
        ...current,
        [definition.id]: draftFor(definition)
      }));
    }
  }

  return (
    <section className="item-library" aria-labelledby="item-library-title">
      <div>
        <p className="eyebrow">Reusable items</p>
        <h2 id="item-library-title">Item Library</h2>
      </div>
      <div className="item-kind-tabs" role="tablist" aria-label="Item kind">
        {(["furniture", "fixture"] as const).map((candidate) => (
          <button
            key={candidate}
            type="button"
            role="tab"
            aria-selected={kind === candidate}
            onClick={() => {
              setKind(candidate);
              setNewDefinition(EMPTY_DRAFT);
            }}
          >
            {candidate === "furniture" ? "Furniture" : "Fixtures"}
          </button>
        ))}
      </div>
      <div className="library-history-actions">
        <button
          type="button"
          disabled={!history.canUndo}
          onClick={() => void controller.navigate("undo")}
        >
          Undo Item Library
        </button>
        <button
          type="button"
          disabled={!history.canRedo}
          onClick={() => void controller.navigate("redo")}
        >
          Redo Item Library
        </button>
      </div>
      <div className="furniture-definition-form">
        <label>
          <span>Name</span>
          <input
            aria-label={`New ${label} name`}
            value={newDefinition.name}
            onChange={(event) => setNewDefinition((draft) => ({
              ...draft,
              name: event.target.value
            }))}
          />
        </label>
        {(["widthMm", "depthMm", "heightMm"] as const).map((field) => (
          <label key={field}>
            <span>
              {field === "widthMm" ? "Width" : field === "depthMm" ? "Depth" : "Height"} (mm)
            </span>
            <input
              aria-label={`New ${label} ${field}`}
              type="number"
              min="1"
              step="1"
              value={newDefinition[field]}
              onChange={(event) => setNewDefinition((draft) => ({
                ...draft,
                [field]: Number(event.target.value)
              }))}
            />
          </label>
        ))}
        <button
          type="button"
          className="primary-button"
          disabled={disabled || !newDefinition.name.trim()}
          onClick={async () => {
            const accepted = kind === "furniture"
              ? await controller.createFurniture(newDefinition)
              : await controller.createFixture(newDefinition);
            if (accepted) setNewDefinition(EMPTY_DRAFT);
          }}
        >
          Create {label}
        </button>
      </div>
      <div className="library-list">
        {definitions.map((definition) => {
          const draft = drafts[definition.id] ?? draftFor(definition);
          return (
            <article key={definition.id} className="library-card">
              <strong className="item-kind-badge">{label}</strong>
              <label>
                <span>Name</span>
                <input
                  aria-label={`${definition.name} name`}
                  value={draft.name}
                  onChange={(event) => setDrafts((current) => ({
                    ...current,
                    [definition.id]: { ...draft, name: event.target.value }
                  }))}
                  onBlur={() => void commitDraft(definition, { name: draft.name })}
                />
              </label>
              {(["widthMm", "depthMm", "heightMm"] as const).map((field) => (
                <label key={field}>
                  <span>{field.replace("Mm", "")}</span>
                  <input
                    aria-label={`${definition.name} ${field}`}
                    type="number"
                    min="1"
                    step="1"
                    value={draft[field]}
                    onChange={(event) => setDrafts((current) => ({
                      ...current,
                      [definition.id]: {
                        ...draft,
                        [field]: Number(event.target.value)
                      }
                    }))}
                    onBlur={() => void commitDraft(definition, {
                      [field]: draft[field]
                    })}
                  />
                </label>
              ))}
              <div className="library-actions">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onPlace(kind, definition.id)}
                >
                  Place
                </button>
                <button
                  type="button"
                  className="danger-button"
                  disabled={disabled}
                  onClick={() => void (kind === "furniture"
                    ? controller.removeFurniture(definition.id)
                    : controller.removeFixture(definition.id))}
                >
                  Delete
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
