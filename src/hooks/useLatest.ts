import { useEffect, useRef } from 'react'

/** A ref that always holds the latest value, for callbacks a hook must call without re-creating itself. */
export function useLatest<T>(value: T) {
  const ref = useRef(value)
  useEffect(() => {
    ref.current = value
  }, [value])
  return ref
}
