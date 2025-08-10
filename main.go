package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type Config struct {
	BaseAPIURL string `json:"baseApiUrl"`
}

func getBaseAPIURL() string {
	base := strings.TrimSpace(os.Getenv("API_BASE_URL"))
	if base == "" {
		base = "http://localhost:25566"
	}
	return base
}

func main() {
	mux := http.NewServeMux()

	// Serve the single page at root
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			// For any unknown path under root, serve index.html to keep it single-page feel
			http.ServeFile(w, r, filepath.Join("web", "index.html"))
			return
		}
		http.ServeFile(w, r, filepath.Join("web", "index.html"))
	})

	// Static files for css/js
	mux.Handle("/web/", http.StripPrefix("/web/", http.FileServer(http.Dir("web"))))
	// Assets (logos)
	mux.Handle("/assets/", http.StripPrefix("/assets/", http.FileServer(http.Dir("assets"))))

	// Config endpoint
	mux.HandleFunc("/config", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(Config{BaseAPIURL: getBaseAPIURL()})
	})

	// Simple proxy for /gossip to avoid CORS issues
	mux.HandleFunc("/proxy/gossip", func(w http.ResponseWriter, r *http.Request) {
		base := r.URL.Query().Get("base")
		if strings.TrimSpace(base) == "" {
			base = getBaseAPIURL()
		}
		u, err := sanitizeBaseURL(base)
		if err != nil {
			http.Error(w, fmt.Sprintf("invalid base url: %v", err), http.StatusBadRequest)
			return
		}
		gossipURL := u + "/gossip"

		client := &http.Client{Timeout: 10 * time.Second}
		req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, gossipURL, nil)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		resp, err := client.Do(req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		for k, vv := range resp.Header {
			// Only pass through content type and caching headers minimally
			if strings.EqualFold(k, "Content-Type") || strings.HasPrefix(strings.ToLower(k), "cache-") {
				for _, v := range vv {
					w.Header().Add(k, v)
				}
			}
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		// Copy response body with a max of 25MB to avoid abuse
		io.Copy(w, io.LimitReader(resp.Body, 25<<20))
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	server := &http.Server{
		Addr:              ":" + port,
		Handler:           logRequest(mux),
		ReadHeaderTimeout: 5 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	log.Printf("Starting dropshipper UI v%s", VERSION)
	log.Printf("Listening on http://localhost:%s", port)
	log.Fatal(server.ListenAndServe())
}

func sanitizeBaseURL(base string) (string, error) {
	parsed, err := url.Parse(base)
	if err != nil {
		return "", err
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", errors.New("must start with http or https")
	}
	if parsed.Host == "" {
		return "", errors.New("host is empty")
	}
	// Remove trailing slash for consistent joining
	return strings.TrimRight(parsed.String(), "/"), nil
}

func logRequest(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start))
	})
}
