package github

import (
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"testing"

	"github.com/y1shiny1shin/ryagent/bff/internal/store"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func jsonBody(status int, body string) *http.Response {
	return &http.Response{
		StatusCode: status,
		Header:     http.Header{"Content-Type": []string{"application/json"}},
		Body:       io.NopCloser(strings.NewReader(body)),
	}
}

func TestRefreshUsesReceivedEventsAndDedupes(t *testing.T) {
	st, err := store.Open(filepath.Join(t.TempDir(), "state.json"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	svc := New(st, "", "", "alice", 60, "all", "")

	const received = `[
	  {"id":"ev1","type":"WatchEvent","actor":{"login":"bob"},"repo":{"name":"alpha/one"},
	   "created_at":"2026-11-13T12:00:00Z","payload":{}},
	  {"id":"ev2","type":"WatchEvent","actor":{"login":"carol"},"repo":{"name":"alpha/one"},
	   "created_at":"2026-11-13T12:00:01Z","payload":{}},
	  {"id":"ev3","type":"WatchEvent","actor":{"login":"bob"},"repo":{"name":"gamma/three"},
	   "created_at":"2026-11-13T11:59:00Z","payload":{}},
	  {"id":"ev4","type":"PushEvent","actor":{"login":"bob"},"repo":{"name":"beta/two"},
	   "created_at":"2026-11-13T12:01:00Z","payload":{"ref":"refs/heads/main","commits":[{"message":"fix rce"}]}},
	  {"id":"ev5","type":"PullRequestEvent","actor":{"login":"bob"},"repo":{"name":"beta/two"},
	   "created_at":"2026-11-13T12:02:00Z","payload":{"action":"opened","number":7,
	     "pull_request":{"title":"Add auth bypass","html_url":"https://github.com/beta/two/pull/7"}}}
	]`

	svc.client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		path := r.URL.Path
		switch {
		case path == "/users/alice/following":
			return jsonBody(200, `[{"login":"bob"},{"login":"carol"}]`), nil
		case path == "/users/alice/received_events/public":
			return jsonBody(200, received), nil
		case path == "/repos/alpha/one":
			return jsonBody(200, `{"full_name":"alpha/one","description":"first tool",
			  "html_url":"https://github.com/alpha/one","language":"Go",
			  "stargazers_count":10,"forks_count":2,"topics":["security"]}`), nil
		case path == "/repos/gamma/three":
			return jsonBody(200, `{"full_name":"gamma/three","description":"third tool",
			  "html_url":"https://github.com/gamma/three","language":"Python",
			  "stargazers_count":5,"forks_count":1,"topics":[]}`), nil
		default:
			return jsonBody(404, `{"message":"not found"}`), nil
		}
	})}

	added, err := svc.Refresh(t.Context())
	if err != nil {
		t.Fatalf("refresh: %v", err)
	}
	if added != 4 {
		t.Fatalf("added=%d, want 4", added)
	}
	feed := svc.Feed(20)
	if len(feed) != 4 {
		t.Fatalf("feed len=%d, want 4", len(feed))
	}
	byKey := map[string]store.GitHubItem{}
	for _, item := range feed {
		byKey[item.Key] = item
	}
	star := byKey["star:alpha/one"]
	if star.Kind != "star" || star.Actor != "bob" || star.Description != "first tool" || star.Stars != 10 {
		t.Fatalf("unexpected star item: %+v", star)
	}
	pr := byKey["event:ev5"]
	if !strings.Contains(pr.EventSummary, "PR #7") || !strings.Contains(pr.EventSummary, "Add auth bypass") {
		t.Fatalf("unexpected PR summary: %q", pr.EventSummary)
	}
	if _, ok := byKey["event:ev1"]; ok {
		t.Fatal("WatchEvent should be folded into the star item, not emitted as an event")
	}
	if svc.FollowingCount() != 2 {
		t.Fatalf("following count=%d, want 2", svc.FollowingCount())
	}

	// A second refresh inside the cooldown window must not hit the API again.
	added, err = svc.Refresh(t.Context())
	if err != nil || added != 0 {
		t.Fatalf("cooldown refresh added=%d err=%v, want 0 nil", added, err)
	}
}

func TestEventTypeAndIgnoredUserFilters(t *testing.T) {
	st, err := store.Open(filepath.Join(t.TempDir(), "state.json"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	svc := New(st, "", "", "alice", 60, "watch,release", "NoiseUser")
	if !svc.eventAllowed("WatchEvent") || !svc.eventAllowed("ReleaseEvent") {
		t.Fatal("watch/release should be allowed by default")
	}
	if svc.eventAllowed("PushEvent") || svc.eventAllowed("ForkEvent") || svc.eventAllowed("IssuesEvent") {
		t.Fatal("push/fork/issue should be filtered out")
	}
	if !svc.userIgnored("noiseuser") || svc.userIgnored("useful") {
		t.Fatal("ignore-user filter mismatch")
	}
}
