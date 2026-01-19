package com.example.records;

/**
 * A record class (Java 16+).
 *
 * Records are immutable data carriers.
 *
 * @param id The unique identifier
 * @param name The name
 * @param value The numeric value
 */
public record MyRecord(String id, String name, int value) {

    /**
     * Compact constructor for validation.
     */
    public MyRecord {
        if (id == null || id.isBlank()) {
            throw new IllegalArgumentException("id cannot be null or blank");
        }
    }

    /**
     * Creates a record with a generated ID.
     *
     * @param name The name
     * @param value The value
     * @return A new record with a generated ID
     */
    public static MyRecord withGeneratedId(String name, int value) {
        return new MyRecord(java.util.UUID.randomUUID().toString(), name, value);
    }

    /**
     * Returns the value doubled.
     *
     * @return The doubled value
     */
    public int doubledValue() {
        return value * 2;
    }
}
