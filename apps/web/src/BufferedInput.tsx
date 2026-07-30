import {
  useEffect,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent
} from "react";

interface BufferedInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "defaultValue" | "onChange" | "value"
> {
  onCommit(value: string): void;
  resetKey?: unknown;
  value: number | string;
}

export function BufferedInput({
  onCommit,
  resetKey,
  value,
  ...inputProps
}: BufferedInputProps) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value, resetKey]);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    } else if (event.key === "Escape") {
      setDraft(String(value));
      event.currentTarget.blur();
    }
  }

  return (
    <input
      {...inputProps}
      value={draft}
      onBlur={() => {
        if (draft !== String(value)) onCommit(draft);
      }}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={handleKeyDown}
    />
  );
}
