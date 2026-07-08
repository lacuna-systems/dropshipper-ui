package main

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/lacuna-systems/dropshipper-ui/pkg/version"
)

const maxProxyBody = 25 << 20

type Config struct {
	BaseAPIURL string `json:"baseApiUrl"`
	Version    string `json:"version,omitempty"`
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

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.ServeFile(w, r, filepath.Join("web", "index.html"))
			return
		}
		http.ServeFile(w, r, filepath.Join("web", "index.html"))
	})

	mux.Handle("/web/", http.StripPrefix("/web/", http.FileServer(http.Dir("web"))))
	mux.Handle("/assets/", http.StripPrefix("/assets/", http.FileServer(http.Dir("assets"))))

	mux.HandleFunc("/config", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(Config{BaseAPIURL: getBaseAPIURL(), Version: version.VERSION})
	})

	mux.HandleFunc("/proxy/gossip", func(w http.ResponseWriter, r *http.Request) {
		base := r.URL.Query().Get("base")
		if strings.TrimSpace(base) == "" {
			base = getBaseAPIURL()
		}
		baseURL, err := sanitizeBaseURL(base)
		if err != nil {
			http.Error(w, "invalid base url: "+err.Error(), http.StatusBadRequest)
			return
		}

		client := &http.Client{Timeout: 10 * time.Second}
		req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, baseURL+"/gossip", nil)
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
		if contentType := resp.Header.Get("Content-Type"); contentType != "" {
			w.Header().Set("Content-Type", contentType)
		} else {
			w.Header().Set("Content-Type", "application/json")
		}
		w.WriteHeader(resp.StatusCode)
		if _, err := io.Copy(w, io.LimitReader(resp.Body, maxProxyBody)); err != nil {
			log.Printf("proxy copy failed: %v", err)
		}
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
	log.Printf("Starting dropshipper UI v%s", version.VERSION)
	log.Printf("Listening on http://localhost:%s", port)
	log.Fatal(server.ListenAndServe())
}

func sanitizeBaseURL(base string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(base))
	if err != nil {
		return "", err
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", errors.New("must start with http or https")
	}
	if parsed.Host == "" {
		return "", errors.New("host is empty")
	}
	parsed.RawQuery = ""
	parsed.Fragment = ""
	parsed.Path = strings.TrimRight(parsed.Path, "/")
	return strings.TrimRight(parsed.String(), "/"), nil
}

func logRequest(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start))
	})
}
