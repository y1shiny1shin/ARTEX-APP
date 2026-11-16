package jobs

import (
	"context"
	"fmt"
	"html"
	"io"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/y1shiny1shin/ryagent/bff/internal/store"
)

const (
	defaultCity       = "成都"
	defaultMinScore   = 45
	defaultMaxAgeDays = 30
	requestGap        = 700 * time.Millisecond
	maxDescription    = 12000
	maxJobs           = 300
)

// Service periodically crawls public job sources, keeps only postings that match
// the Chengdu security profile, and dedupes them across refreshes.
type Service struct {
	store    *store.Store
	cfg      Config
	client   *http.Client
	interval time.Duration

	mu          sync.Mutex
	refreshMu   sync.Mutex
	lastRefresh time.Time
}

func New(st *store.Store, proxy string, hours int, city, keywords string, minScore, maxAgeDays int, sources string) *Service {
	if hours <= 0 {
		hours = 6
	}
	city = strings.TrimSpace(city)
	if city == "" {
		city = defaultCity
	}
	if minScore <= 0 {
		minScore = defaultMinScore
	}
	if maxAgeDays <= 0 {
		maxAgeDays = defaultMaxAgeDays
	}
	cfg := Config{
		City: city, Keywords: MergeKeywords(splitCSV(keywords)),
		MinScore: minScore, MaxAgeDays: maxAgeDays, Sources: splitSources(sources),
	}
	tr := http.DefaultTransport.(*http.Transport).Clone()
	if p := strings.TrimSpace(proxy); p != "" {
		if u, err := url.Parse(p); err == nil && u.Scheme != "" && u.Host != "" {
			tr.Proxy = http.ProxyURL(u)
		}
	}
	return &Service{
		store: st, cfg: cfg, interval: time.Duration(hours) * time.Hour,
		client: &http.Client{Timeout: 30 * time.Second, Transport: tr},
	}
}

func (s *Service) Start(ctx context.Context) {
	go func() {
		select {
		case <-ctx.Done():
			return
		case <-time.After(12 * time.Second):
		}
		if n, err := s.Refresh(ctx); err != nil {
			log.Printf("[jobs] initial refresh: %v", err)
		} else if n > 0 {
			log.Printf("[jobs] initial refresh: %d new postings", n)
		}
		t := time.NewTicker(s.interval)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				if n, err := s.Refresh(ctx); err != nil {
					log.Printf("[jobs] refresh: %v", err)
				} else if n > 0 {
					log.Printf("[jobs] refresh: %d new postings", n)
				}
			}
		}
	}()
}

func (s *Service) Refresh(ctx context.Context) (int, error) {
	s.refreshMu.Lock()
	defer s.refreshMu.Unlock()
	s.mu.Lock()
	if !s.lastRefresh.IsZero() && time.Since(s.lastRefresh) < 2*time.Minute {
		s.mu.Unlock()
		return 0, nil
	}
	s.lastRefresh = time.Now()
	s.mu.Unlock()

	var matched []store.JobPosting
	var processed []string
	var firstErr error
	run := func(name string, fn func(context.Context) ([]store.JobPosting, []string, error)) {
		if !s.cfg.Sources[name] {
			return
		}
		items, ids, err := fn(ctx)
		matched = append(matched, items...)
		processed = append(processed, ids...)
		if err != nil {
			if firstErr == nil {
				firstErr = err
			}
			log.Printf("[jobs] %s: %v", name, err)
		}
	}
	run("iguopin", s.crawlIguopin)
	run("liepin", s.crawlLiepin)
	run("jobui", s.crawlJobui)
	run("ncss", s.crawlNCSS)
	run("kanxue", s.crawlKanxue)
	run("v2ex", s.crawlV2EX)
	run("remoteok", s.crawlRemoteOK)

	added := s.store.MergeJobs(matched)
	s.store.MarkJobsSeen(processed)
	if firstErr != nil && added == 0 && len(matched) == 0 {
		return 0, firstErr
	}
	if firstErr != nil {
		log.Printf("[jobs] partial refresh: %v", firstErr)
	}
	return added, nil
}

func (s *Service) Jobs(limit int) []store.JobPosting { return s.store.JobsList(limit) }

func (s *Service) Job(id string) (store.JobPosting, bool) { return s.store.Job(id) }

func (s *Service) UpdatedAt() time.Time { return s.store.JobUpdatedAt() }

func (s *Service) Config() Config { return s.cfg }

func (s *Service) SourceList() []string {
	out := []string{}
	for _, name := range []string{"iguopin", "liepin", "jobui", "ncss", "kanxue", "v2ex", "remoteok"} {
		if s.cfg.Sources[name] {
			out = append(out, name)
		}
	}
	return out
}

func (s *Service) buildJob(
	source, externalID, title, company, location, salary, experience, education,
	description, jobURL string, postedAt, endsAt time.Time, remote, stateOwned bool,
) (store.JobPosting, bool) {
	id := source + ":" + externalID
	description = truncateRunes(strings.TrimSpace(description), maxDescription)
	result := Match(MatchInput{
		Source: source, Title: title, Company: company, Location: location,
		Description: description, Experience: experience, Education: education,
		Salary: salary, PostedAt: postedAt, EndsAt: endsAt, Remote: remote,
		StateOwned: stateOwned, Now: time.Now(),
	}, s.cfg)
	if result.Score < s.cfg.MinScore {
		return store.JobPosting{}, false
	}
	job := store.JobPosting{
		ID: id, Source: source, ExternalID: externalID, Title: strings.TrimSpace(title),
		Company: strings.TrimSpace(company), Location: strings.TrimSpace(location),
		Salary: strings.TrimSpace(salary), Experience: strings.TrimSpace(experience),
		Education: strings.TrimSpace(education), Description: description, URL: jobURL,
		PostedAt: postedAt, EndsAt: endsAt, Score: result.Score, Tags: result.Tags,
		Matched: result.Matched, Reasons: result.Reasons, Remote: result.Remote,
		StateOwned: result.StateOwned, Vendor: result.Vendor,
	}
	job.Summary = summarize(job)
	return job, true
}

func summarize(job store.JobPosting) string {
	text := strings.TrimSpace(job.Description)
	if text == "" {
		if job.Company != "" {
			return job.Title + " · " + job.Company
		}
		return job.Title
	}
	text = firstLine(text, 220)
	return text
}

func (s *Service) get(ctx context.Context, rawURL, accept string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	if accept == "" {
		accept = "text/html,application/xhtml+xml"
	}
	req.Header.Set("Accept", accept)
	// Chinese job boards reject non-browser agents with a tiny block page, so
	// use a normal desktop Chrome UA for every source.
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36")
	req.Header.Set("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 12<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("%s: HTTP %d", rawURL, resp.StatusCode)
	}
	return body, nil
}

func (s *Service) targetLocation(location, title string) bool {
	text := strings.ToLower(location + " " + title)
	city := strings.ToLower(s.cfg.City)
	return strings.Contains(text, city) || strings.Contains(text, "成都") ||
		strings.Contains(text, "四川") ||
		containsAny(text, "远程", "remote", "anywhere", "worldwide", "全球")
}

func splitCSV(raw string) []string {
	var out []string
	seen := map[string]bool{}
	for _, part := range strings.Split(raw, ",") {
		part = strings.TrimSpace(part)
		if part == "" || seen[part] {
			continue
		}
		seen[part] = true
		out = append(out, part)
	}
	return out
}

func splitSources(raw string) map[string]bool {
	known := map[string]bool{"iguopin": true, "liepin": true, "jobui": true, "ncss": true, "kanxue": true, "v2ex": true, "remoteok": true}
	raw = strings.TrimSpace(strings.ToLower(raw))
	if raw == "" || raw == "all" {
		return known
	}
	out := map[string]bool{}
	for _, part := range strings.Split(raw, ",") {
		part = strings.TrimSpace(part)
		if known[part] {
			out[part] = true
		}
	}
	if len(out) == 0 {
		return known
	}
	return out
}

var (
	htmlTagRE   = regexp.MustCompile(`(?s)<[^>]+>`)
	htmlBreakRE = regexp.MustCompile(`(?i)<br\s*/?>`)
	htmlParaRE  = regexp.MustCompile(`(?i)</p>`)
)

func stripHTML(s string) string {
	s = htmlBreakRE.ReplaceAllString(s, "\n")
	s = htmlParaRE.ReplaceAllString(s, "\n")
	s = htmlTagRE.ReplaceAllString(s, "")
	s = html.UnescapeString(s)
	s = strings.ReplaceAll(s, " ", " ")
	lines := strings.Split(s, "\n")
	out := make([]string, 0, len(lines))
	blank := false
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			if !blank {
				out = append(out, "")
			}
			blank = true
			continue
		}
		blank = false
		out = append(out, line)
	}
	return strings.TrimSpace(strings.Join(out, "\n"))
}

func firstLine(value string, max int) string {
	value = strings.TrimSpace(value)
	if i := strings.IndexAny(value, "\r\n"); i >= 0 {
		value = value[:i]
	}
	return truncateRunes(value, max)
}

func truncateRunes(value string, max int) string {
	runes := []rune(value)
	if len(runes) <= max {
		return value
	}
	return string(runes[:max]) + "…"
}

var cst = time.FixedZone("CST", 8*3600)

func parseCST(value string) time.Time {
	value = strings.TrimSpace(value)
	for _, layout := range []string{"2006-01-02 15:04", "2006-01-02"} {
		if parsed, err := time.ParseInLocation(layout, value, cst); err == nil {
			return parsed
		}
	}
	return time.Time{}
}
