package barry

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	commonHTTP "common/middleware/http"
	"common/middleware/vipper"
)

const (
	defaultBarryTimeout = 30 * time.Second
)

type Client struct {
	baseURL string
	token   string
	appKey  string
	proxyIP string
	timeout time.Duration
}

func NewClient() *Client {
	timeout := vipper.GetDuration("barry.timeout")
	if timeout <= 0 {
		timeout = defaultBarryTimeout
	}
	return &Client{
		baseURL: strings.TrimRight(vipper.GetString("barry.base-url"), "/"),
		token:   strings.TrimSpace(vipper.GetString("barry.token")),
		appKey:  strings.TrimSpace(vipper.GetString("barry.app-key")),
		proxyIP: strings.TrimSpace(vipper.GetString("barry.proxy-ip")),
		timeout: timeout,
	}
}

func (c *Client) IsConfigured() bool {
	return strings.TrimSpace(c.baseURL) != ""
}

func (c *Client) Get(ctx context.Context, path string, query url.Values, response any) error {
	requestURL, err := c.buildURL(path, query)
	if err != nil {
		return err
	}
	return c.do(ctx, http.MethodGet, requestURL, nil, response)
}

func (c *Client) GetAbsolute(ctx context.Context, requestURL string, query url.Values, response any) error {
	requestURL, err := c.buildAbsoluteURL(requestURL, query)
	if err != nil {
		return err
	}
	return c.do(ctx, http.MethodGet, requestURL, nil, response)
}

func (c *Client) Post(ctx context.Context, path string, requestBody any, response any) error {
	requestURL, err := c.buildURL(path, nil)
	if err != nil {
		return err
	}
	return c.do(ctx, http.MethodPost, requestURL, requestBody, response)
}

func (c *Client) PostAbsolute(ctx context.Context, requestURL string, requestBody any, response any) error {
	requestURL, err := c.buildAbsoluteURL(requestURL, nil)
	if err != nil {
		return err
	}
	return c.do(ctx, http.MethodPost, requestURL, requestBody, response)
}

func (c *Client) buildURL(path string, query url.Values) (string, error) {
	if !c.IsConfigured() {
		return "", fmt.Errorf("barry base url is not configured")
	}
	return c.buildAbsoluteURL(c.baseURL+"/"+strings.TrimLeft(strings.TrimSpace(path), "/"), query)
}

func (c *Client) buildAbsoluteURL(requestURL string, query url.Values) (string, error) {
	trimmedURL := strings.TrimSpace(requestURL)
	if trimmedURL == "" {
		return "", fmt.Errorf("barry request url is empty")
	}
	if len(query) == 0 {
		return trimmedURL, nil
	}
	parsedURL, err := url.Parse(trimmedURL)
	if err != nil {
		return "", err
	}
	encodedQuery := parsedURL.Query()
	for key, values := range query {
		for _, value := range values {
			encodedQuery.Add(key, value)
		}
	}
	parsedURL.RawQuery = encodedQuery.Encode()
	return parsedURL.String(), nil
}

func (c *Client) do(ctx context.Context, method, requestURL string, requestBody any, response any) error {
	var body io.Reader
	if requestBody != nil {
		payload, err := json.Marshal(requestBody)
		if err != nil {
			return err
		}
		body = strings.NewReader(string(payload))
	}
	request, err := http.NewRequestWithContext(ctx, method, requestURL, body)
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json")
	if c.token != "" {
		request.Header.Set("Authorization", c.token)
	}
	if c.appKey != "" {
		request.Header.Set("X-App-Key", c.appKey)
	}

	httpClient := commonHTTP.InitHttpClient(c.proxyIP)
	httpClient.Timeout = c.timeout
	resp, err := httpClient.Do(request)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf("barry request failed: status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}
	if response == nil || len(respBody) == 0 {
		return nil
	}
	if err := json.Unmarshal(respBody, response); err != nil {
		return fmt.Errorf("barry response decode failed: %w", err)
	}
	return nil
}
