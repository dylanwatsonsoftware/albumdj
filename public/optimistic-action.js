export async function runOptimisticAction({ apply, persist, reconcile, rollback, onError = () => {} }) {
  apply();
  try {
    const value = await persist();
    reconcile(value);
    return { ok: true, value };
  } catch (error) {
    rollback();
    onError(error);
    return { ok: false, error };
  }
}
