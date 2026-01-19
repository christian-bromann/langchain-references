package com.example.generics;

import java.util.List;
import java.util.Map;

/**
 * A generic class with type parameters.
 *
 * @param <T> The element type
 * @param <K> The key type
 */
public class GenericClass<T extends Comparable<T>, K> {

    private T value;
    private K key;

    /**
     * Creates a new instance with the specified value.
     *
     * @param value The initial value
     * @param key The key
     */
    public GenericClass(T value, K key) {
        this.value = value;
        this.key = key;
    }

    /**
     * Gets the value.
     *
     * @return The current value
     */
    public T getValue() {
        return value;
    }

    /**
     * Sets the value.
     *
     * @param value The new value
     */
    public void setValue(T value) {
        this.value = value;
    }

    /**
     * A generic method with its own type parameter.
     *
     * @param <R> The result type
     * @param transformer A function to transform the value
     * @return The transformed value
     */
    public <R> R transform(java.util.function.Function<T, R> transformer) {
        return transformer.apply(value);
    }

    /**
     * Returns a map of values.
     *
     * @return A map with key-value pairs
     */
    public Map<K, List<T>> getMapping() {
        return null;
    }
}
