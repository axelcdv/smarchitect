import {
  useEffect,
  useRef,
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
  const cancelBlurCommit = useRef(false);

  useEffect(() => {
    setDraft(String(value));
  }, [value, resetKey]);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    } else if (event.key === "Escape") {
      cancelBlurCommit.current = true;
      setDraft(String(value));
      event.currentTarget.blur();
    }
  }

  return (
    <input
      {...inputProps}
      value={draft}
      onBlur={() => {
        if (cancelBlurCommit.current) {
          cancelBlurCommit.current = false;
          setDraft(String(value));
          return;
        }
        if (draft !== String(value)) onCommit(draft);
        setDraft(String(value));
      }}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={handleKeyDown}
    />
  );
}
