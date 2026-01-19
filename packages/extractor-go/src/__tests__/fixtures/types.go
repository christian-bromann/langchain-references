// Package example provides example types for testing.
package example

import (
	"context"
	"io"
)

// Client represents a client connection to a service.
// It handles authentication and request management.
type Client struct {
	// BaseURL is the base URL for API requests.
	BaseURL string
	// APIKey is the authentication key.
	APIKey string `json:"api_key,omitempty"`
	// Timeout specifies the request timeout in seconds.
	Timeout int
	// internal unexported field
	internal string
}

// NewClient creates a new Client with the given configuration.
// It returns a fully initialized client ready for use.
func NewClient(baseURL, apiKey string) *Client {
	return &Client{
		BaseURL: baseURL,
		APIKey:  apiKey,
		Timeout: 30,
	}
}

// Get performs an HTTP GET request to the specified path.
// It returns the response body and any error encountered.
func (c *Client) Get(ctx context.Context, path string) ([]byte, error) {
	return nil, nil
}

// Post performs an HTTP POST request with the given body.
func (c *Client) Post(ctx context.Context, path string, body io.Reader) ([]byte, error) {
	return nil, nil
}

// SetTimeout configures the client timeout.
func (c *Client) SetTimeout(seconds int) {
	c.Timeout = seconds
}

// Close releases all resources associated with the client.
func (c *Client) Close() error {
	return nil
}

// Response represents an API response.
type Response struct {
	// StatusCode is the HTTP status code.
	StatusCode int
	// Body contains the response body.
	Body []byte
	// Headers contains the response headers.
	Headers map[string]string
}

// IsSuccess returns true if the response indicates success.
func (r *Response) IsSuccess() bool {
	return r.StatusCode >= 200 && r.StatusCode < 300
}

// Handler defines the interface for request handlers.
type Handler interface {
	// Handle processes a request and returns a response.
	Handle(ctx context.Context, req *Request) (*Response, error)
	// Validate checks if the request is valid.
	Validate(req *Request) error
}

// Request represents an API request.
type Request struct {
	// Method is the HTTP method.
	Method string
	// Path is the request path.
	Path string
	// Body is the request body.
	Body io.Reader
}

// Middleware represents a function that wraps a Handler.
type Middleware = func(Handler) Handler
