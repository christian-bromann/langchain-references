package com.example.annotations;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * A custom annotation for testing.
 *
 * <p>Use this annotation to mark classes for special processing.
 */
@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.TYPE, ElementType.METHOD})
public @interface MyAnnotation {

    /**
     * The name value.
     *
     * @return The name
     */
    String name() default "";

    /**
     * Whether this is enabled.
     *
     * @return true if enabled
     */
    boolean enabled() default true;

    /**
     * Priority level.
     *
     * @return The priority (higher = more important)
     */
    int priority() default 0;
}
