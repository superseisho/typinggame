type EntityWithId = { readonly id: PropertyKey };

export function indexById<const T extends EntityWithId>(items: readonly T[]) {
  return Object.fromEntries(items.map((item) => [item.id, item])) as unknown as {
    readonly [Id in T['id']]: Extract<T, { readonly id: Id }>;
  };
}
