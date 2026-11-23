/** Fields whose value differs from the one loaded. */
export function changedFields<T extends object>(initial: T, current: T): Partial<T> {
  const changes: Partial<T> = {};
  (Object.keys(current) as Array<keyof T>).forEach((key) => {
    if (current[key] !== initial[key]) {
      changes[key] = current[key];
    }
  });
  return changes;
}
