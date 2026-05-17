import { useRef, useState } from "react";

export function useChangedSetState<T>(
  initial: T,
  getKey: (value: T) => string = (value) => JSON.stringify(value),
): [T, (next: T) => void] {
  const keyRef = useRef(getKey(initial));
  const [value, setValue] = useState(initial);
  function set(next: T) {
    const key = getKey(next);
    if (keyRef.current === key) return;
    keyRef.current = key;
    setValue(next);
  }
  return [value, set];
}
