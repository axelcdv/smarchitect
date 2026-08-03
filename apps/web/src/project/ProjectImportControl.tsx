import {
  type ChangeEventHandler,
  type RefObject
} from "react";

interface ProjectImportControlProps {
  buttonClassName: string;
  disabled?: boolean;
  importInputRef: RefObject<HTMLInputElement | null>;
  onImport: ChangeEventHandler<HTMLInputElement>;
}

export function ProjectImportControl({
  buttonClassName,
  disabled = false,
  importInputRef,
  onImport
}: ProjectImportControlProps) {
  return (
    <>
      <button
        className={buttonClassName}
        type="button"
        disabled={disabled}
        onClick={() => importInputRef.current?.click()}
      >
        Import YAML
      </button>
      <input
        ref={importInputRef}
        className="visually-hidden"
        type="file"
        accept=".yaml,.yml,application/yaml,text/yaml"
        onChange={onImport}
        aria-label="Import Project Document"
        disabled={disabled}
      />
    </>
  );
}
