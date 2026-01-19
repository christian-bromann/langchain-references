package com.example.enums;

/**
 * An example enum for testing.
 *
 * <p>This enum represents different status values.
 */
public enum MyEnum {
    /**
     * Indicates pending status.
     */
    PENDING("Pending"),

    /**
     * Indicates active status.
     */
    ACTIVE("Active"),

    /**
     * Indicates completed status.
     */
    COMPLETED("Completed"),

    /**
     * Indicates failed status.
     */
    FAILED("Failed");

    private final String displayName;

    /**
     * Creates a new enum constant.
     *
     * @param displayName The display name
     */
    MyEnum(String displayName) {
        this.displayName = displayName;
    }

    /**
     * Gets the display name.
     *
     * @return The display name
     */
    public String getDisplayName() {
        return displayName;
    }

    /**
     * Parse a status from a string.
     *
     * @param value The string value
     * @return The corresponding status, or PENDING if not found
     */
    public static MyEnum fromString(String value) {
        for (MyEnum status : values()) {
            if (status.displayName.equalsIgnoreCase(value)) {
                return status;
            }
        }
        return PENDING;
    }
}
