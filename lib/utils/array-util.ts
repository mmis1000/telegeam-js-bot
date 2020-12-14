export function findOrCreate<T> (
    array: T[],
    predicate: (v: T) => boolean,
    factory: () => T
) {
    const current = array.find(predicate)

    if (current === undefined) {
        const newVal = factory()
        array.push(newVal)
        return newVal
    } else {
        return current
    }
}