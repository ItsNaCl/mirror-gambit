/**
 * Rejects when `promise` has not settled in `ms`. The engine's evaluate() promise never settles
 * when another search replaces it, so anything waiting on one needs this to recover.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('The engine did not answer in time.')), ms)
    promise.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}
