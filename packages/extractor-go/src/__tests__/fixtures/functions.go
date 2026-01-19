// Package example provides example functions for testing.
package example

import (
	"context"
	"errors"
	"fmt"
)

// DefaultTimeout is the default timeout in seconds.
const DefaultTimeout = 30

// MaxRetries is the maximum number of retry attempts.
const MaxRetries int = 3

// ErrNotFound indicates a resource was not found.
var ErrNotFound = errors.New("not found")

// ErrUnauthorized indicates an authentication failure.
var ErrUnauthorized error = errors.New("unauthorized")

// unexportedConst should not be extracted
const unexportedConst = "hidden"

// Connect establishes a connection to the specified host.
// It returns a Client ready for use or an error if connection fails.
//
// Example:
//
//	client, err := Connect("api.example.com", "my-api-key")
//	if err != nil {
//	    log.Fatal(err)
//	}
//	defer client.Close()
func Connect(host, apiKey string) (*Client, error) {
	return NewClient(host, apiKey), nil
}

// Ping checks if the service is available.
func Ping(ctx context.Context, host string) error {
	return nil
}

// ParseConfig reads configuration from the given path.
// DEPRECATED: Use LoadConfig instead.
func ParseConfig(path string) (map[string]string, error) {
	return nil, nil
}

// LoadConfig loads configuration with proper error handling.
func LoadConfig(ctx context.Context, path string) (*Config, error) {
	return &Config{}, nil
}

// Config holds application configuration.
type Config struct {
	// Host is the server host.
	Host string
	// Port is the server port.
	Port int
	// Debug enables debug mode.
	Debug bool `json:"debug"`
}

// Validate checks if the configuration is valid.
func (c *Config) Validate() error {
	if c.Host == "" {
		return errors.New("host is required")
	}
	if c.Port <= 0 {
		return errors.New("port must be positive")
	}
	return nil
}

// String returns a string representation of the config.
func (c *Config) String() string {
	return fmt.Sprintf("%s:%d", c.Host, c.Port)
}

// WithDefaults returns a new Config with default values.
func WithDefaults() *Config {
	return &Config{
		Host:  "localhost",
		Port:  8080,
		Debug: false,
	}
}

// Process handles multiple items concurrently.
// It returns the results and any errors encountered.
func Process(ctx context.Context, items []string) ([]Result, []error) {
	return nil, nil
}

// Result represents the result of a processing operation.
type Result struct {
	// ID is the unique identifier.
	ID string
	// Value is the processed value.
	Value interface{}
	// Error contains any error that occurred.
	Error error
}
