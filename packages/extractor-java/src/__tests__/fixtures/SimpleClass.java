package com.example;

/**
 * A simple class for testing.
 * This is the second line of description.
 *
 * @since 1.0.0
 */
public class SimpleClass extends BaseClass implements Runnable, Comparable<SimpleClass> {

    /**
     * A public static final field.
     */
    public static final String CONSTANT = "value";

    /**
     * A private field.
     */
    private int count;

    /**
     * A protected field.
     */
    protected String name;

    /**
     * Default constructor.
     */
    public SimpleClass() {
        this.count = 0;
    }

    /**
     * Constructor with parameters.
     *
     * @param count The initial count
     * @param name The name
     */
    public SimpleClass(int count, String name) {
        this.count = count;
        this.name = name;
    }

    /**
     * Gets the count.
     *
     * @return The current count value
     */
    public int getCount() {
        return count;
    }

    /**
     * Sets the count value.
     *
     * @param count The new count value
     */
    public void setCount(int count) {
        this.count = count;
    }

    /**
     * A method with multiple parameters.
     *
     * @param first The first parameter
     * @param second The second parameter
     * @return A combined string
     * @throws IllegalArgumentException if first is null
     */
    public String combine(String first, String second) throws IllegalArgumentException {
        if (first == null) {
            throw new IllegalArgumentException("first cannot be null");
        }
        return first + second;
    }

    /**
     * Static method example.
     *
     * @param value The input value
     * @return The doubled value
     */
    public static int doubleValue(int value) {
        return value * 2;
    }

    @Override
    public void run() {
        // Implementation
    }

    @Override
    public int compareTo(SimpleClass other) {
        return Integer.compare(this.count, other.count);
    }
}
