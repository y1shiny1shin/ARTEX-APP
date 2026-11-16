package store

import (
	"path/filepath"
	"testing"
	"time"
)

func TestMergeGitHubItemsNeverRepeats(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.json")
	st, err := Open(path)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	now := time.Now().UTC()

	first := []GitHubItem{
		{Key: "star:acme/alpha", Kind: "star", Actor: "alice", FullName: "acme/alpha", OccurredAt: now},
		{Key: "star:acme/alpha", Kind: "star", Actor: "bob", FullName: "acme/alpha", OccurredAt: now},
		{Key: "event:1", Kind: "event", Actor: "bob", FullName: "beta/gamma", EventType: "PushEvent", OccurredAt: now.Add(-time.Minute)},
	}
	if added := st.MergeGitHubItems(first); added != 2 {
		t.Fatalf("first merge added=%d, want 2", added)
	}

	second := []GitHubItem{
		{Key: "star:acme/alpha", Kind: "star", Actor: "carol", FullName: "acme/alpha"},
		{Key: "event:2", Kind: "event", Actor: "alice", FullName: "delta/epsilon", EventType: "ReleaseEvent"},
	}
	if added := st.MergeGitHubItems(second); added != 1 {
		t.Fatalf("second merge added=%d, want 1", added)
	}

	feed := st.GitHubFeed(10)
	if len(feed) != 3 {
		t.Fatalf("feed len=%d, want 3", len(feed))
	}
	seen := map[string]int{}
	for _, item := range feed {
		seen[item.Key]++
	}
	for _, key := range []string{"star:acme/alpha", "event:1", "event:2"} {
		if seen[key] != 1 {
			t.Fatalf("%s appears %d times, want 1", key, seen[key])
		}
	}

	// The seen set is persisted, so a restart still cannot re-emit an item.
	reopened, err := Open(path)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	if added := reopened.MergeGitHubItems([]GitHubItem{{Key: "event:1", Kind: "event"}}); added != 0 {
		t.Fatalf("reopened merge added=%d, want 0", added)
	}
}

func TestMergeJobsDedupesSameRoleAcrossSources(t *testing.T) {
	st, err := Open(filepath.Join(t.TempDir(), "state.json"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	jobs := []JobPosting{
		{ID: "liepin:1", Company: "Acme", Title: "安全工程师", Location: "成都-高新区", Score: 50},
		{ID: "ncss:2", Company: "Acme", Title: "安全工程师", Location: "成都-武侯区", Score: 60},
		{ID: "jobui:3", Company: "Acme", Title: "渗透测试工程师", Location: "成都", Score: 55},
	}
	if added := st.MergeJobs(jobs); added != 2 {
		t.Fatalf("added=%d, want 2 after cross-source fingerprint dedupe", added)
	}
}
