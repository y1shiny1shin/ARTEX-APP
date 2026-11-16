package store

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// Store is a tiny single-user persistent state file. P0 deliberately avoids a
// database dependency: the state is small, writes are infrequent, and the file
// is easy to back up. The interface is designed so it can be replaced by SQLite
// or Postgres later without touching the HTTP layer.
type Store struct {
	mu    sync.Mutex
	path  string
	state State
}

type State struct {
	Devices       map[string]Device       `json:"devices"`
	Messages      []Message               `json:"messages"`
	Confirmations map[string]Confirmation `json:"confirmations"`
	Audit         []Audit                 `json:"audit"`
	NextMessageID int64                   `json:"next_message_id"`
	NextAuditID   int64                   `json:"next_audit_id"`
	GitHubSeen    map[string]bool         `json:"github_seen"`
	GitHubFeed    []GitHubItem            `json:"github_feed"`
	// GitHubSourceVersion migrates the feed when the discovery source changes.
	// v2 = followed users' stars + public activity, v3 = GitHub received_events,
	// v5 = stars + releases only (noise events filtered by GITHUB_EVENT_TYPES).
	GitHubSourceVersion int `json:"github_source_version"`

	Jobs         []JobPosting    `json:"jobs"`
	JobSeen      map[string]bool `json:"job_seen"`
	JobUpdatedAt time.Time       `json:"job_updated_at"`
	// JobSourceVersion resets the feed when the source set or matching profile
	// changes materially (v2 = multi-source precision matching).
	JobSourceVersion int `json:"job_source_version"`

	IntelFeed      []IntelItem                 `json:"intel_feed"`
	IntelSeen      map[string]bool             `json:"intel_seen"`
	IntelUpdatedAt time.Time                   `json:"intel_updated_at"`
	IntelSources   map[string]IntelSourceState `json:"intel_sources"`
	// IntelSourceVersion v2 = article-only technical feed.
	IntelSourceVersion int `json:"intel_source_version"`
}

const githubSourceVersion = 5
const jobSourceVersion = 2
const intelSourceVersion = 2

// IntelItem is one article or vulnerability advisory. Articles are stored as-is
// (no keyword filtering); vulnerabilities carry CVE/CVSS/exploit metadata.
type IntelItem struct {
	ID          string    `json:"id"`
	Kind        string    `json:"kind"` // article | vuln
	Source      string    `json:"source"`
	Title       string    `json:"title"`
	Summary     string    `json:"summary,omitempty"`
	URL         string    `json:"url"`
	PublishedAt time.Time `json:"published_at"`
	FirstSeen   time.Time `json:"first_seen"`
	CVE         string    `json:"cve,omitempty"`
	CVSS        float64   `json:"cvss,omitempty"`
	Severity    string    `json:"severity,omitempty"`
	Vendor      string    `json:"vendor,omitempty"`
	Product     string    `json:"product,omitempty"`
	Exploited   bool      `json:"exploited,omitempty"`
	Tags        []string  `json:"tags,omitempty"`
}

// IntelSourceState persists HTTP validators and fetch timing so periodic
// refreshes can use conditional requests and cooldowns across restarts.
type IntelSourceState struct {
	ETag         string    `json:"etag,omitempty"`
	LastModified string    `json:"last_modified,omitempty"`
	LastFetch    time.Time `json:"last_fetch,omitempty"`
	NextFetch    time.Time `json:"next_fetch,omitempty"`
}

// JobPosting is one matched recruitment posting. Description is the full text
// (job duties + requirements) and is bounded before it enters the state file.
type JobPosting struct {
	ID          string    `json:"id"`
	Source      string    `json:"source"`
	ExternalID  string    `json:"external_id"`
	Title       string    `json:"title"`
	Company     string    `json:"company"`
	Location    string    `json:"location"`
	Salary      string    `json:"salary"`
	Experience  string    `json:"experience"`
	Education   string    `json:"education"`
	Summary     string    `json:"summary"`
	Description string    `json:"description"`
	URL         string    `json:"url"`
	PostedAt    time.Time `json:"posted_at"`
	EndsAt      time.Time `json:"ends_at"`
	FirstSeen   time.Time `json:"first_seen"`
	Score       int       `json:"score"`
	Tags        []string  `json:"tags,omitempty"`
	Matched     []string  `json:"matched,omitempty"`
	Reasons     []string  `json:"reasons,omitempty"`
	Remote      bool      `json:"remote"`
	StateOwned  bool      `json:"state_owned"`
	Vendor      bool      `json:"vendor"`
}

// GitHubItem is one deduped entry in the social feed: either a repository one
// of the followed users starred, or a public activity event about a repo.
type GitHubItem struct {
	Key          string    `json:"key"`
	Kind         string    `json:"kind"` // star | event
	Actor        string    `json:"actor"`
	FullName     string    `json:"full_name"`
	Description  string    `json:"description,omitempty"`
	HTMLURL      string    `json:"html_url"`
	Language     string    `json:"language,omitempty"`
	Stars        int       `json:"stars,omitempty"`
	Forks        int       `json:"forks,omitempty"`
	Topics       []string  `json:"topics,omitempty"`
	EventType    string    `json:"event_type,omitempty"`
	EventSummary string    `json:"event_summary,omitempty"`
	OccurredAt   time.Time `json:"occurred_at"`
	FirstSeen    time.Time `json:"first_seen"`
}

type Device struct {
	ID        string     `json:"id"`
	Name      string     `json:"name"`
	TokenHash string     `json:"token_hash"`
	CreatedAt time.Time  `json:"created_at"`
	LastSeen  time.Time  `json:"last_seen"`
	RevokedAt *time.Time `json:"revoked_at,omitempty"`
}

type Message struct {
	ID        int64     `json:"id"`
	Role      string    `json:"role"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
}

type Confirmation struct {
	ID         string    `json:"id"`
	DeviceID   string    `json:"device_id"`
	Capability string    `json:"capability"`
	Input      string    `json:"input"`
	Summary    string    `json:"summary"`
	State      string    `json:"state"` // pending | approved | rejected | expired | done | failed
	Result     string    `json:"result,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
	ExpiresAt  time.Time `json:"expires_at"`
}

type Audit struct {
	ID          int64     `json:"id"`
	DeviceID    string    `json:"device_id"`
	Action      string    `json:"action"`
	InputDigest string    `json:"input_digest"`
	Result      string    `json:"result"`
	CreatedAt   time.Time `json:"created_at"`
}

var ErrNotFound = errors.New("not found")

func Open(path string) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, err
	}
	s := &Store{path: path, state: State{
		Devices:       map[string]Device{},
		Confirmations: map[string]Confirmation{},
		GitHubSeen:    map[string]bool{},
		GitHubFeed:    []GitHubItem{},
		JobSeen:       map[string]bool{},
		Jobs:          []JobPosting{},
		IntelSeen:     map[string]bool{},
		IntelFeed:     []IntelItem{},
		IntelSources:  map[string]IntelSourceState{},
	}}
	raw, err := os.ReadFile(path)
	if err == nil && len(raw) > 0 {
		if err := json.Unmarshal(raw, &s.state); err != nil {
			return nil, fmt.Errorf("parse state: %w", err)
		}
	}
	if s.state.Devices == nil {
		s.state.Devices = map[string]Device{}
	}
	if s.state.Confirmations == nil {
		s.state.Confirmations = map[string]Confirmation{}
	}
	if s.state.GitHubSeen == nil {
		s.state.GitHubSeen = map[string]bool{}
	}
	if s.state.GitHubFeed == nil {
		s.state.GitHubFeed = []GitHubItem{}
	}
	if s.state.JobSeen == nil {
		s.state.JobSeen = map[string]bool{}
	}
	if s.state.Jobs == nil {
		s.state.Jobs = []JobPosting{}
	}
	if s.state.IntelSeen == nil {
		s.state.IntelSeen = map[string]bool{}
	}
	if s.state.IntelFeed == nil {
		s.state.IntelFeed = []IntelItem{}
	}
	if s.state.IntelSources == nil {
		s.state.IntelSources = map[string]IntelSourceState{}
	}
	if s.state.IntelSourceVersion < intelSourceVersion {
		s.state.IntelFeed = []IntelItem{}
		s.state.IntelSeen = map[string]bool{}
		s.state.IntelSources = map[string]IntelSourceState{}
		s.state.IntelSourceVersion = intelSourceVersion
	}
	if s.state.JobSourceVersion < jobSourceVersion {
		s.state.Jobs = []JobPosting{}
		s.state.JobSeen = map[string]bool{}
		s.state.JobSourceVersion = jobSourceVersion
	}
	// The feed source changed from topic search (v1) to followed users' stars and
	// activity (v2), then to GitHub received_events (v3/v4). Old entries and their
	// seen keys are dropped exactly once so the feed starts clean instead of
	// mixing discovery models.
	if s.state.GitHubSourceVersion < githubSourceVersion {
		s.state.GitHubSeen = map[string]bool{}
		s.state.GitHubFeed = []GitHubItem{}
		s.state.GitHubSourceVersion = githubSourceVersion
	}
	return s, nil
}

func HashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func (s *Store) saveLocked() error {
	raw, err := json.MarshalIndent(s.state, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

func (s *Store) CreateDevice(d Device) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.state.Devices[d.ID]; ok {
		return fmt.Errorf("device %s already exists", d.ID)
	}
	s.state.Devices[d.ID] = d
	return s.saveLocked()
}

func (s *Store) DeviceByTokenHash(hash string) (Device, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, d := range s.state.Devices {
		if d.TokenHash == hash {
			return d, true
		}
	}
	return Device{}, false
}

func (s *Store) TouchDevice(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if d, ok := s.state.Devices[id]; ok {
		d.LastSeen = time.Now().UTC()
		s.state.Devices[id] = d
		_ = s.saveLocked()
	}
}

func (s *Store) RevokeDevice(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	d, ok := s.state.Devices[id]
	if !ok {
		return ErrNotFound
	}
	now := time.Now().UTC()
	d.RevokedAt = &now
	s.state.Devices[id] = d
	return s.saveLocked()
}

func (s *Store) AppendMessage(role, content string) Message {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.state.NextMessageID++
	m := Message{ID: s.state.NextMessageID, Role: role, Content: content, CreatedAt: time.Now().UTC()}
	s.state.Messages = append(s.state.Messages, m)
	if len(s.state.Messages) > 500 {
		s.state.Messages = s.state.Messages[len(s.state.Messages)-500:]
	}
	_ = s.saveLocked()
	return m
}

func (s *Store) Messages() []Message {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]Message, len(s.state.Messages))
	copy(out, s.state.Messages)
	return out
}

func (s *Store) CreateConfirmation(c Confirmation) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.state.Confirmations[c.ID] = c
	return s.saveLocked()
}

func (s *Store) GetConfirmation(id string) (Confirmation, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	c, ok := s.state.Confirmations[id]
	return c, ok
}

func (s *Store) ListConfirmations() []Confirmation {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]Confirmation, 0, len(s.state.Confirmations))
	for _, c := range s.state.Confirmations {
		out = append(out, c)
	}
	return out
}

func (s *Store) ResolveConfirmation(id, state, result string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	c, ok := s.state.Confirmations[id]
	if !ok {
		return ErrNotFound
	}
	c.State = state
	c.Result = result
	s.state.Confirmations[id] = c
	return s.saveLocked()
}

func (s *Store) AppendAudit(deviceID, action, inputDigest, result string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.state.NextAuditID++
	s.state.Audit = append(s.state.Audit, Audit{
		ID: s.state.NextAuditID, DeviceID: deviceID, Action: action,
		InputDigest: inputDigest, Result: result, CreatedAt: time.Now().UTC(),
	})
	if len(s.state.Audit) > 2000 {
		s.state.Audit = s.state.Audit[len(s.state.Audit)-2000:]
	}
	_ = s.saveLocked()
}

func (s *Store) Audit() []Audit {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]Audit, len(s.state.Audit))
	copy(out, s.state.Audit)
	return out
}

// MergeGitHubItems adds only unseen entries and returns how many were new. Star
// entries are keyed by repository, so two followed users starring the same repo
// produce one card; activity entries are keyed by GitHub event id, so distinct
// actions on one repo remain distinct. The feed is sorted newest activity first.
func (s *Store) MergeGitHubItems(items []GitHubItem) (added int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now().UTC()
	fresh := make([]GitHubItem, 0, len(items))
	for _, item := range items {
		key := item.Key
		if key == "" {
			if item.FullName == "" {
				continue
			}
			key = item.Kind + ":" + item.FullName
		}
		if s.state.GitHubSeen[key] {
			continue
		}
		s.state.GitHubSeen[key] = true
		if item.OccurredAt.IsZero() {
			item.OccurredAt = now
		}
		item.FirstSeen = now
		item.Key = key
		fresh = append(fresh, item)
		added++
	}
	if added == 0 {
		return 0
	}
	s.state.GitHubFeed = append(fresh, s.state.GitHubFeed...)
	sort.SliceStable(s.state.GitHubFeed, func(i, j int) bool {
		a, b := s.state.GitHubFeed[i], s.state.GitHubFeed[j]
		if a.OccurredAt.Equal(b.OccurredAt) {
			return a.FirstSeen.After(b.FirstSeen)
		}
		return a.OccurredAt.After(b.OccurredAt)
	})
	if len(s.state.GitHubFeed) > 400 {
		s.state.GitHubFeed = s.state.GitHubFeed[:400]
	}
	_ = s.saveLocked()
	return added
}

func (s *Store) GitHubFeed(limit int) []GitHubItem {
	s.mu.Lock()
	defer s.mu.Unlock()
	if limit <= 0 || limit > len(s.state.GitHubFeed) {
		limit = len(s.state.GitHubFeed)
	}
	out := make([]GitHubItem, limit)
	copy(out, s.state.GitHubFeed[:limit])
	return out
}

func (s *Store) HasJobSeen(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.state.JobSeen[id]
}

func (s *Store) MarkJobsSeen(ids []string) {
	if len(ids) == 0 {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	changed := false
	for _, id := range ids {
		if id == "" || s.state.JobSeen[id] {
			continue
		}
		s.state.JobSeen[id] = true
		changed = true
	}
	if changed {
		_ = s.saveLocked()
	}
}

// MergeJobs adds only unseen postings, keeps the list sorted by match score and
// freshness, and refreshes the last-updated timestamp.
func (s *Store) MergeJobs(jobs []JobPosting) (added int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now().UTC()
	for _, job := range jobs {
		if job.ID == "" || s.state.JobSeen[job.ID] {
			continue
		}
		fingerprint := jobFingerprint(job)
		if fingerprint != "" && s.state.JobSeen[fingerprint] {
			continue
		}
		s.state.JobSeen[job.ID] = true
		if fingerprint != "" {
			s.state.JobSeen[fingerprint] = true
		}
		if job.FirstSeen.IsZero() {
			job.FirstSeen = now
		}
		s.state.Jobs = append(s.state.Jobs, job)
		added++
	}
	s.state.JobUpdatedAt = now
	if len(s.state.Jobs) > 300 {
		s.state.Jobs = s.state.Jobs[:300]
	}
	sort.SliceStable(s.state.Jobs, func(i, j int) bool {
		a, b := s.state.Jobs[i], s.state.Jobs[j]
		if a.Score != b.Score {
			return a.Score > b.Score
		}
		return a.PostedAt.After(b.PostedAt)
	})
	_ = s.saveLocked()
	return added
}

func (s *Store) JobsList(limit int) []JobPosting {
	s.mu.Lock()
	defer s.mu.Unlock()
	if limit <= 0 || limit > len(s.state.Jobs) {
		limit = len(s.state.Jobs)
	}
	out := make([]JobPosting, limit)
	copy(out, s.state.Jobs[:limit])
	return out
}

func (s *Store) Job(id string) (JobPosting, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, job := range s.state.Jobs {
		if job.ID == id {
			return job, true
		}
	}
	return JobPosting{}, false
}

func (s *Store) JobUpdatedAt() time.Time {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.state.JobUpdatedAt
}

func (s *Store) MergeIntel(items []IntelItem) (added int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now().UTC()
	fresh := make([]IntelItem, 0, len(items))
	for _, item := range items {
		if item.ID == "" || s.state.IntelSeen[item.ID] {
			continue
		}
		s.state.IntelSeen[item.ID] = true
		if item.FirstSeen.IsZero() {
			item.FirstSeen = now
		}
		fresh = append(fresh, item)
		added++
	}
	if added == 0 {
		s.state.IntelUpdatedAt = now
		_ = s.saveLocked()
		return 0
	}
	s.state.IntelFeed = append(fresh, s.state.IntelFeed...)
	sort.SliceStable(s.state.IntelFeed, func(i, j int) bool {
		a, b := s.state.IntelFeed[i], s.state.IntelFeed[j]
		if a.PublishedAt.Equal(b.PublishedAt) {
			return a.FirstSeen.After(b.FirstSeen)
		}
		return a.PublishedAt.After(b.PublishedAt)
	})
	if len(s.state.IntelFeed) > 500 {
		s.state.IntelFeed = s.state.IntelFeed[:500]
	}
	s.state.IntelUpdatedAt = now
	_ = s.saveLocked()
	return added
}

func (s *Store) IntelFeedList(limit int) []IntelItem {
	s.mu.Lock()
	defer s.mu.Unlock()
	if limit <= 0 || limit > len(s.state.IntelFeed) {
		limit = len(s.state.IntelFeed)
	}
	out := make([]IntelItem, limit)
	copy(out, s.state.IntelFeed[:limit])
	return out
}

func (s *Store) IntelUpdatedAt() time.Time {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.state.IntelUpdatedAt
}

func (s *Store) IntelSource(name string) IntelSourceState {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.state.IntelSources[name]
}

func (s *Store) SetIntelSource(name string, state IntelSourceState) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.state.IntelSources[name] = state
	_ = s.saveLocked()
}

// jobFingerprint collapses cross-source duplicates of the same role at the same
// company and city (e.g. the same posting syndicated to several boards).
func jobFingerprint(job JobPosting) string {
	company := strings.ToLower(strings.TrimSpace(job.Company))
	title := strings.ToLower(strings.TrimSpace(job.Title))
	location := strings.ToLower(strings.TrimSpace(job.Location))
	for _, sep := range []string{"-", "－", "·", "/", " "} {
		if i := strings.Index(location, sep); i > 0 {
			location = location[:i]
		}
	}
	if company == "" || title == "" {
		return ""
	}
	return "fp:" + company + "|" + title + "|" + location
}
