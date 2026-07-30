import {
  type FurnitureDefinition,
  type FurnitureDefinitionInput,
  type FurnitureDefinitionUpdate
} from "@smarchitect/core";
import { useEffect, useState } from "react";
import type { FurnitureLibraryController } from "./use-furniture-library.js";

const EMPTY_FURNITURE_DRAFT: FurnitureDefinitionInput = {
  name: "",
  widthMm: 1000,
  depthMm: 600,
  heightMm: 800
};

type DefinitionDraft = Pick<
  FurnitureDefinition,
  "name" | "widthMm" | "depthMm" | "heightMm"
>;

interface ItemLibraryProps {
  controller: FurnitureLibraryController;
  disabled: boolean;
  onPlace(id: string): void;
}

function draftFor(definition: FurnitureDefinition): DefinitionDraft {
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
  const [newDefinition, setNewDefinition] = useState(EMPTY_FURNITURE_DRAFT);
  const [drafts, setDrafts] = useState<Record<string, DefinitionDraft>>({});

  useEffect(() => {
    setDrafts(Object.fromEntries(
      controller.definitions.map((definition) => [
        definition.id,
        draftFor(definition)
      ])
    ));
  }, [controller.definitions]);

  async function commitDraft(
    definition: FurnitureDefinition,
    update: FurnitureDefinitionUpdate
  ): Promise<void> {
    if (!await controller.update(definition.id, update)) {
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
      <div className="library-history-actions">
        <button
          type="button"
          disabled={!controller.history.canUndo}
          onClick={() => void controller.navigate("undo")}
        >
          Undo Item Library
        </button>
        <button
          type="button"
          disabled={!controller.history.canRedo}
          onClick={() => void controller.navigate("redo")}
        >
          Redo Item Library
        </button>
      </div>
      <div className="furniture-definition-form">
        <label>
          <span>Name</span>
          <input
            aria-label="New Furniture name"
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
              aria-label={`New Furniture ${field}`}
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
            if (await controller.create(newDefinition)) {
              setNewDefinition(EMPTY_FURNITURE_DRAFT);
            }
          }}
        >
          Create Furniture
        </button>
      </div>
      <div className="library-list">
        {controller.definitions.map((definition) => {
          const draft = drafts[definition.id] ?? draftFor(definition);
          return (
            <article key={definition.id} className="library-card">
              <label>
                <span>Name</span>
                <input
                  aria-label={`${definition.name} name`}
                  value={draft.name}
                  onChange={(event) => setDrafts((current) => ({
                    ...current,
                    [definition.id]: {
                      ...draft,
                      name: event.target.value
                    }
                  }))}
                  onBlur={() => void commitDraft(definition, {
                    name: draft.name
                  })}
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
                  onClick={() => onPlace(definition.id)}
                >
                  Place
                </button>
                <button
                  type="button"
                  className="danger-button"
                  disabled={disabled}
                  onClick={() => void controller.remove(definition.id)}
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
