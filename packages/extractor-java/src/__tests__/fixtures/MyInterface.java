package com.example.interfaces;

/**
 * An example interface demonstrating various features.
 *
 * <p>This interface defines methods for processing items.
 *
 * @param <T> The type of items to process
 */
public interface MyInterface<T> {

    /**
     * Process a single item.
     *
     * @param item The item to process
     * @return The processed result
     */
    String process(T item);

    /**
     * Process multiple items.
     *
     * @param items The items to process
     * @return A list of results
     */
    java.util.List<String> processAll(java.util.List<T> items);

    /**
     * A default method implementation.
     *
     * @return A default value
     */
    default String getDefaultValue() {
        return "default";
    }

    /**
     * A static factory method.
     *
     * @param <T> The type parameter
     * @return A new instance
     */
    static <T> MyInterface<T> create() {
        return null;
    }
}
