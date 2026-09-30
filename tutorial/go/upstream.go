package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"time"

	"github.com/google/uuid"
)

var (
	// errUnknownProject means the projects API answered 404.
	errUnknownProject = errors.New("unknown project")
	// errCatalogUnavailable covers network errors, timeouts and non-200 answers.
	errCatalogUnavailable = errors.New("catalog unavailable")
)

// Project is the part of an upstream project object the service uses.
type Project struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Maturity string `json:"maturity"`
}

// PriceCents prices a project by maturity.
func PriceCents(maturity string) int {
	switch maturity {
	case "Graduated":
		return 1200
	case "Incubating":
		return 800
	case "Sandbox":
		return 500
	default:
		return 1000
	}
}

// Upstream is a client for the CNCF projects API. It uses the default
// transport, so http_proxy/https_proxy and SSL_CERT_FILE apply.
type Upstream struct {
	base   string
	client *http.Client
	now    func() time.Time
}

func NewUpstream(base string) *Upstream {
	return &Upstream{
		base:   base,
		client: &http.Client{Timeout: 5 * time.Second},
		now:    time.Now,
	}
}

func (u *Upstream) get(ctx context.Context, path string, out any) error {
	target := fmt.Sprintf("%s%s?ts=%d", u.base, path, u.now().UnixMilli())
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return errCatalogUnavailable
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "tutorial-orders/1")
	req.Header.Set("X-Request-Id", uuid.NewString())

	resp, err := u.client.Do(req)
	if err != nil {
		return errCatalogUnavailable
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusOK:
	case http.StatusNotFound:
		return errUnknownProject
	default:
		return errCatalogUnavailable
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return errCatalogUnavailable
	}
	return nil
}

// Catalog fetches the whole catalog, in upstream order.
func (u *Upstream) Catalog(ctx context.Context) ([]Project, error) {
	var projects []Project
	if err := u.get(ctx, "/v1/projects", &projects); err != nil {
		if errors.Is(err, errUnknownProject) {
			return nil, errCatalogUnavailable
		}
		return nil, err
	}
	return projects, nil
}

// Project fetches one project.
func (u *Upstream) Project(ctx context.Context, id string) (Project, error) {
	var p Project
	err := u.get(ctx, "/v1/project/"+url.PathEscape(id), &p)
	return p, err
}
