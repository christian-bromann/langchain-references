// Package example provides example interfaces for testing.
package example

import (
	"context"
	"io"
)

// Storage defines the interface for data storage.
// Implementations must be thread-safe.
type Storage interface {
	// Get retrieves a value by key.
	Get(ctx context.Context, key string) ([]byte, error)
	// Set stores a value with the given key.
	Set(ctx context.Context, key string, value []byte) error
	// Delete removes a value by key.
	Delete(ctx context.Context, key string) error
	// List returns all keys matching the prefix.
	List(ctx context.Context, prefix string) ([]string, error)
}

// Closer represents any resource that can be closed.
type Closer interface {
	// Close releases any resources.
	Close() error
}

// ReadWriteCloser combines read, write, and close capabilities.
type ReadWriteCloser interface {
	io.Reader
	io.Writer
	Closer
}

// Logger defines the logging interface.
type Logger interface {
	// Debug logs a debug message.
	Debug(msg string, args ...interface{})
	// Info logs an informational message.
	Info(msg string, args ...interface{})
	// Warn logs a warning message.
	Warn(msg string, args ...interface{})
	// Error logs an error message.
	Error(msg string, args ...interface{})
}

// Validator validates objects.
type Validator interface {
	// Validate checks if the object is valid.
	// Returns nil if valid, or an error describing what's wrong.
	Validate() error
}

// Stringer is an alias for fmt.Stringer for testing.
type Stringer = interface {
	String() string
}
