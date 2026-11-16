package github

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/y1shiny1shin/ryagent/bff/internal/store"
)

const (
	defaultOwner     = "y1shiny1shin"
	followingTTL     = 6 * time.Hour
	requestGap       = 800 * time.Millisecond
	maxFollowingPage = 5
	maxReceivedPages = 3
	receivedPerPage  = 100
	enrichToken      = 20
	enrichAnonymous  = 8
	// One prolific account can otherwise drown the whole feed. Keep the newest
	// events per actor; stars are never capped.
	maxEventsPerActor = 20
)

var errRateLimited = errors.New("github rate limit reached")

// Service watches the public activity of the accounts followed by one GitHub
// user. GitHub's /received_events endpoint returns events performed by everyone
// that user follows, so one paginated call covers the whole following list —
// no per-user scanning. Star events are enriched with repository metadata in a
// bounded pass, and the store dedupes stars by repository and activity by event
// id, so nothing is ever emitted twice.
type Service struct {
	store    *store.Store
	token    string
	owner    string
	interval time.Duration
	client   *http.Client

	mu          sync.Mutex
	refreshMu   sync.Mutex
	following   []string
	followingAt time.Time
	lastRefresh time.Time

	eventTypes  map[string]bool
	ignoreUsers map[string]bool
}

func New(st *store.Store, token, proxy, owner string, minutes int, eventTypes, ignoreUsers string) *Service {
	if minutes <= 0 {
		minutes = 60
	}
	owner = strings.TrimSpace(strings.TrimPrefix(owner, "@"))
	if owner == "" {
		owner = defaultOwner
	}
	tr := http.DefaultTransport.(*http.Transport).Clone()
	if p := strings.TrimSpace(proxy); p != "" {
		if u, err := url.Parse(p); err == nil && u.Scheme != "" && u.Host != "" {
			tr.Proxy = http.ProxyURL(u)
		}
	}
	return &Service{
		store: st, token: strings.TrimSpace(token), owner: owner,
		interval:    time.Duration(minutes) * time.Minute,
		client:      &http.Client{Timeout: 30 * time.Second, Transport: tr},
		eventTypes:  parseEventTypes(eventTypes),
		ignoreUsers: parseIgnoreUsers(ignoreUsers),
	}
}

func (s *Service) RefreshMinutes() int { return int(s.interval / time.Minute) }

var githubEventAliases = map[string]string{
	"watch": "WatchEvent", "star": "WatchEvent", "stars": "WatchEvent",
	"release": "ReleaseEvent", "releases": "ReleaseEvent",
	"push": "PushEvent", "fork": "ForkEvent", "forks": "ForkEvent",
	"pr": "PullRequestEvent", "pull": "PullRequestEvent", "pull_request": "PullRequestEvent",
	"issue": "IssuesEvent", "issues": "IssuesEvent",
	"comment": "IssueCommentEvent", "review": "PullRequestReviewEvent",
	"create": "CreateEvent", "public": "PublicEvent", "member": "MemberEvent",
	"delete": "DeleteEvent",
}

func parseEventTypes(raw string) map[string]bool {
	raw = strings.TrimSpace(strings.ToLower(raw))
	if raw == "" {
		raw = "watch,release"
	}
	out := map[string]bool{}
	for _, part := range strings.Split(raw, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		if part == "all" {
			return map[string]bool{
				"WatchEvent": true, "ReleaseEvent": true, "PushEvent": true,
				"ForkEvent": true, "PullRequestEvent": true, "IssuesEvent": true,
				"IssueCommentEvent": true, "PullRequestReviewEvent": true,
				"CreateEvent": true, "PublicEvent": true, "MemberEvent": true,
				"DeleteEvent": true,
			}
		}
		if event, ok := githubEventAliases[part]; ok {
			out[event] = true
			continue
		}
		if strings.HasSuffix(part, "event") {
			part = strings.ToUpper(part[:1]) + part[1:]
			out[part] = true
		}
	}
	if len(out) == 0 {
		out["WatchEvent"] = true
		out["ReleaseEvent"] = true
	}
	return out
}

func parseIgnoreUsers(raw string) map[string]bool {
	out := map[string]bool{}
	for _, part := range strings.Split(raw, ",") {
		part = strings.ToLower(strings.TrimSpace(part))
		if part != "" {
			out[part] = true
		}
	}
	return out
}

func (s *Service) eventAllowed(eventType string) bool {
	if len(s.eventTypes) == 0 {
		return eventType == "WatchEvent" || eventType == "ReleaseEvent"
	}
	return s.eventTypes[eventType]
}

func (s *Service) userIgnored(login string) bool {
	return s.ignoreUsers[strings.ToLower(strings.TrimSpace(login))]
}

func (s *Service) Start(ctx context.Context) {
	go func() {
		select {
		case <-ctx.Done():
			return
		case <-time.After(8 * time.Second):
		}
		if n, err := s.Refresh(ctx); err != nil {
			log.Printf("[github] initial refresh: %v", err)
		} else if n > 0 {
			log.Printf("[github] initial refresh: %d new items", n)
		}
		t := time.NewTicker(s.interval)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				if n, err := s.Refresh(ctx); err != nil {
					log.Printf("[github] refresh: %v", err)
				} else if n > 0 {
					log.Printf("[github] refresh: %d new items", n)
				}
			}
		}
	}()
}

func (s *Service) Feed(limit int) []store.GitHubItem { return s.store.GitHubFeed(limit) }

func (s *Service) Owner() string { return s.owner }

func (s *Service) TokenConfigured() bool { return s.token != "" }

func (s *Service) FollowingCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.following)
}

func (s *Service) enrichLimit() int {
	if s.token != "" {
		return enrichToken
	}
	return enrichAnonymous
}

func (s *Service) Refresh(ctx context.Context) (int, error) {
	s.refreshMu.Lock()
	defer s.refreshMu.Unlock()
	// Anonymous GitHub REST is only 60 requests/hour. A 90-second floor keeps
	// double-taps and reconnect bursts from eating the budget; the scheduled
	// hourly refresh always passes.
	s.mu.Lock()
	if !s.lastRefresh.IsZero() && time.Since(s.lastRefresh) < 90*time.Second {
		s.mu.Unlock()
		return 0, nil
	}
	s.lastRefresh = time.Now()
	s.mu.Unlock()

	// The following list is used for the UI count. If it fails we still try the
	// received-events feed, because that is the actual content source.
	if _, err := s.followingList(ctx); err != nil {
		log.Printf("[github] following list: %v", err)
	}

	items, err := s.receivedEvents(ctx)
	if err != nil && len(items) == 0 {
		return 0, err
	}
	if err != nil {
		log.Printf("[github] partial received events: %v", err)
	}

	s.enrichStars(ctx, items, s.enrichLimit())

	added := s.store.MergeGitHubItems(items)
	return added, nil
}

// followingList returns the owner's public following list, cached for six hours.
func (s *Service) followingList(ctx context.Context) ([]string, error) {
	s.mu.Lock()
	cached := append([]string(nil), s.following...)
	fetchedAt := s.followingAt
	s.mu.Unlock()
	if len(cached) > 0 && time.Since(fetchedAt) < followingTTL {
		return cached, nil
	}

	var all []string
	for page := 1; page <= maxFollowingPage; page++ {
		var batch []struct {
			Login string `json:"login"`
		}
		u := fmt.Sprintf("https://api.github.com/users/%s/following?per_page=100&page=%d",
			url.PathEscape(s.owner), page)
		if err := s.getJSON(ctx, u, &batch, "application/vnd.github+json"); err != nil {
			if len(cached) > 0 {
				return cached, nil // keep serving the cached list on transient failures
			}
			return nil, err
		}
		for _, entry := range batch {
			if entry.Login != "" {
				all = append(all, entry.Login)
			}
		}
		if len(batch) < 100 {
			break
		}
		time.Sleep(requestGap)
	}
	if len(all) == 0 {
		if len(cached) > 0 {
			return cached, nil
		}
		return nil, fmt.Errorf("no public following users for %s", s.owner)
	}
	s.mu.Lock()
	s.following = all
	s.followingAt = time.Now()
	s.mu.Unlock()
	return all, nil
}

func (s *Service) receivedEvents(ctx context.Context) ([]store.GitHubItem, error) {
	var items []store.GitHubItem
	actorEvents := map[string]int{}
	for page := 1; page <= maxReceivedPages; page++ {
		u := fmt.Sprintf("https://api.github.com/users/%s/received_events/public?per_page=%d&page=%d",
			url.PathEscape(s.owner), receivedPerPage, page)
		var events []gitHubEvent
		if err := s.getJSON(ctx, u, &events, "application/vnd.github+json"); err != nil {
			return items, err
		}
		for _, event := range events {
			if s.userIgnored(event.Actor.Login) || !s.eventAllowed(event.Type) {
				continue
			}
			for _, item := range s.eventItems(event) {
				if item.Kind == "event" {
					if strings.HasSuffix(item.Actor, "[bot]") {
						continue
					}
					if actorEvents[item.Actor] >= maxEventsPerActor {
						continue
					}
					actorEvents[item.Actor]++
				}
				items = append(items, item)
			}
		}
		if len(events) < receivedPerPage {
			break
		}
		time.Sleep(requestGap)
	}
	return items, nil
}

func (s *Service) eventItems(ev gitHubEvent) []store.GitHubItem {
	if ev.Repo.Name == "" {
		return nil
	}
	repoURL := "https://github.com/" + ev.Repo.Name
	if ev.Type == "WatchEvent" {
		return []store.GitHubItem{{
			Key: "star:" + ev.Repo.Name, Kind: "star", Actor: ev.Actor.Login,
			FullName: ev.Repo.Name, HTMLURL: repoURL, OccurredAt: ev.CreatedAt,
		}}
	}
	summary, link := describeEvent(ev)
	key := "event:" + ev.ID
	if ev.ID == "" {
		key = fmt.Sprintf("event:%s:%s:%d", ev.Type, ev.Repo.Name, ev.CreatedAt.Unix())
	}
	if link == "" {
		link = repoURL
	}
	return []store.GitHubItem{{
		Key: key, Kind: "event", Actor: ev.Actor.Login, FullName: ev.Repo.Name,
		HTMLURL: link, EventType: ev.Type, EventSummary: summary, OccurredAt: ev.CreatedAt,
	}}
}

type repoMeta struct {
	Description string
	HTMLURL     string
	Language    string
	Stars       int
	Forks       int
	Topics      []string
}

// enrichStars fills description/language/stars for recent stars, newest first.
// It is deliberately bounded: older star cards stay as a repo name + link.
func (s *Service) enrichStars(ctx context.Context, items []store.GitHubItem, limit int) {
	seen := map[string]bool{}
	done := 0
	for i := range items {
		item := &items[i]
		if item.Kind != "star" || item.Description != "" || seen[item.FullName] {
			continue
		}
		if done >= limit {
			return
		}
		seen[item.FullName] = true
		meta, err := s.repoMeta(ctx, item.FullName)
		if err != nil {
			if errors.Is(err, errRateLimited) {
				return
			}
			continue
		}
		item.Description = meta.Description
		if meta.HTMLURL != "" {
			item.HTMLURL = meta.HTMLURL
		}
		item.Language = meta.Language
		item.Stars = meta.Stars
		item.Forks = meta.Forks
		item.Topics = meta.Topics
		done++
		time.Sleep(requestGap)
	}
}

func (s *Service) repoMeta(ctx context.Context, fullName string) (repoMeta, error) {
	if strings.Count(fullName, "/") != 1 {
		return repoMeta{}, fmt.Errorf("invalid repo name %q", fullName)
	}
	var out struct {
		Description string   `json:"description"`
		HTMLURL     string   `json:"html_url"`
		Language    string   `json:"language"`
		Stars       int      `json:"stargazers_count"`
		Forks       int      `json:"forks_count"`
		Topics      []string `json:"topics"`
	}
	if err := s.getJSON(ctx, "https://api.github.com/repos/"+fullName, &out, "application/vnd.github+json"); err != nil {
		return repoMeta{}, err
	}
	return repoMeta{
		Description: out.Description, HTMLURL: out.HTMLURL, Language: out.Language,
		Stars: out.Stars, Forks: out.Forks, Topics: out.Topics,
	}, nil
}

func (s *Service) getJSON(ctx context.Context, rawURL string, out any, accept string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", accept)
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("User-Agent", "RyAgent-following-feed/0.3")
	if s.token != "" {
		req.Header.Set("Authorization", "Bearer "+s.token)
	}
	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusTooManyRequests {
		return fmt.Errorf("%w: remaining=%s: %s", errRateLimited,
			resp.Header.Get("X-RateLimit-Remaining"), truncate(string(raw), 300))
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("github %s: HTTP %d: %s",
			strings.TrimPrefix(rawURL, "https://api.github.com"), resp.StatusCode, truncate(string(raw), 300))
	}
	if out != nil && len(raw) > 0 {
		if err := json.Unmarshal(raw, out); err != nil {
			return fmt.Errorf("github decode: %w", err)
		}
	}
	return nil
}

type gitHubEvent struct {
	ID    string `json:"id"`
	Type  string `json:"type"`
	Actor struct {
		Login string `json:"login"`
	} `json:"actor"`
	Repo struct {
		Name string `json:"name"`
	} `json:"repo"`
	CreatedAt time.Time       `json:"created_at"`
	Payload   json.RawMessage `json:"payload"`
}

func describeEvent(ev gitHubEvent) (string, string) {
	switch ev.Type {
	case "PushEvent":
		var p struct {
			Ref     string `json:"ref"`
			Commits []struct {
				Message string `json:"message"`
			} `json:"commits"`
		}
		_ = json.Unmarshal(ev.Payload, &p)
		branch := strings.TrimPrefix(p.Ref, "refs/heads/")
		if branch == "" {
			branch = "默认分支"
		}
		if len(p.Commits) == 0 {
			return "推送了代码到 " + branch, ""
		}
		return fmt.Sprintf("推送 %d 个提交到 %s：%s", len(p.Commits), branch, firstLine(p.Commits[0].Message, 60)), ""
	case "ForkEvent":
		var p struct {
			Forkee struct {
				FullName string `json:"full_name"`
				HTMLURL  string `json:"html_url"`
			} `json:"forkee"`
		}
		_ = json.Unmarshal(ev.Payload, &p)
		summary := "Fork 了仓库"
		if p.Forkee.FullName != "" {
			summary = "Fork 到 " + p.Forkee.FullName
		}
		return summary, p.Forkee.HTMLURL
	case "CreateEvent":
		var p struct {
			RefType string `json:"ref_type"`
			Ref     string `json:"ref"`
		}
		_ = json.Unmarshal(ev.Payload, &p)
		if p.RefType == "repository" || p.RefType == "" {
			return "创建了仓库", ""
		}
		return fmt.Sprintf("创建了 %s %s", p.RefType, p.Ref), ""
	case "ReleaseEvent":
		var p struct {
			Release struct {
				Name    string `json:"name"`
				TagName string `json:"tag_name"`
				HTMLURL string `json:"html_url"`
			} `json:"release"`
		}
		_ = json.Unmarshal(ev.Payload, &p)
		name := firstNonEmpty(p.Release.Name, p.Release.TagName, "新版本")
		return "发布了 " + name, p.Release.HTMLURL
	case "PullRequestEvent":
		var p struct {
			Action      string `json:"action"`
			Number      int    `json:"number"`
			PullRequest struct {
				Title   string `json:"title"`
				HTMLURL string `json:"html_url"`
				Merged  bool   `json:"merged"`
			} `json:"pull_request"`
		}
		_ = json.Unmarshal(ev.Payload, &p)
		action := actionLabel(p.Action)
		if p.PullRequest.Merged {
			action = "合并"
		}
		return withTitle(fmt.Sprintf("%s PR #%d", action, p.Number), p.PullRequest.Title, 70), p.PullRequest.HTMLURL
	case "PullRequestReviewEvent":
		var p struct {
			Action string `json:"action"`
			Review struct {
				State   string `json:"state"`
				HTMLURL string `json:"html_url"`
			} `json:"review"`
			PullRequest struct {
				Number  int    `json:"number"`
				Title   string `json:"title"`
				HTMLURL string `json:"html_url"`
			} `json:"pull_request"`
		}
		_ = json.Unmarshal(ev.Payload, &p)
		summary := "审查了 PR"
		if p.PullRequest.Number > 0 {
			summary = fmt.Sprintf("审查了 PR #%d", p.PullRequest.Number)
		}
		if p.Review.State != "" {
			summary += "（" + reviewStateLabel(p.Review.State) + "）"
		}
		link := firstNonEmpty(p.Review.HTMLURL, p.PullRequest.HTMLURL)
		return withTitle(summary, p.PullRequest.Title, 70), link
	case "PullRequestReviewCommentEvent":
		var p struct {
			PullRequest struct {
				Number  int    `json:"number"`
				Title   string `json:"title"`
				HTMLURL string `json:"html_url"`
			} `json:"pull_request"`
			Comment struct {
				HTMLURL string `json:"html_url"`
			} `json:"comment"`
		}
		_ = json.Unmarshal(ev.Payload, &p)
		summary := "评论了 PR"
		if p.PullRequest.Number > 0 {
			summary = fmt.Sprintf("评论了 PR #%d", p.PullRequest.Number)
		}
		return withTitle(summary, p.PullRequest.Title, 70), firstNonEmpty(p.Comment.HTMLURL, p.PullRequest.HTMLURL)
	case "IssuesEvent":
		var p struct {
			Action string `json:"action"`
			Issue  struct {
				Number  int    `json:"number"`
				Title   string `json:"title"`
				HTMLURL string `json:"html_url"`
			} `json:"issue"`
		}
		_ = json.Unmarshal(ev.Payload, &p)
		return withTitle(fmt.Sprintf("%s issue #%d", actionLabel(p.Action), p.Issue.Number), p.Issue.Title, 70), p.Issue.HTMLURL
	case "IssueCommentEvent":
		var p struct {
			Issue struct {
				Number  int    `json:"number"`
				Title   string `json:"title"`
				HTMLURL string `json:"html_url"`
			} `json:"issue"`
			Comment struct {
				HTMLURL string `json:"html_url"`
			} `json:"comment"`
		}
		_ = json.Unmarshal(ev.Payload, &p)
		summary := "评论了 issue"
		if p.Issue.Number > 0 {
			summary = fmt.Sprintf("评论了 issue #%d", p.Issue.Number)
		}
		return withTitle(summary, p.Issue.Title, 70), firstNonEmpty(p.Comment.HTMLURL, p.Issue.HTMLURL)
	case "GollumEvent":
		return "更新了 Wiki", ""
	case "PublicEvent":
		return "公开了仓库", ""
	case "DeleteEvent":
		var p struct {
			RefType string `json:"ref_type"`
			Ref     string `json:"ref"`
		}
		_ = json.Unmarshal(ev.Payload, &p)
		return fmt.Sprintf("删除了 %s %s", p.RefType, p.Ref), ""
	case "MemberEvent":
		var p struct {
			Member struct {
				Login string `json:"login"`
			} `json:"member"`
		}
		_ = json.Unmarshal(ev.Payload, &p)
		if p.Member.Login != "" {
			return "添加协作者 " + p.Member.Login, ""
		}
		return "更新了协作者", ""
	case "CommitCommentEvent":
		return "评论了提交", ""
	default:
		return strings.TrimSuffix(ev.Type, "Event"), ""
	}
}

func actionLabel(action string) string {
	switch action {
	case "opened":
		return "打开"
	case "closed":
		return "关闭"
	case "reopened":
		return "重新打开"
	case "created":
		return "创建"
	case "edited":
		return "编辑"
	case "published":
		return "发布"
	case "merged":
		return "合并"
	case "":
		return "更新"
	default:
		return action
	}
}

func reviewStateLabel(state string) string {
	switch state {
	case "approved":
		return "已批准"
	case "changes_requested":
		return "要求修改"
	case "commented":
		return "已评论"
	case "dismissed":
		return "已忽略"
	default:
		return state
	}
}

func withTitle(summary, title string, max int) string {
	title = firstLine(title, max)
	if title == "" {
		return summary
	}
	return summary + "：" + title
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func firstLine(value string, max int) string {
	value = strings.TrimSpace(value)
	if i := strings.IndexAny(value, "\r\n"); i >= 0 {
		value = value[:i]
	}
	return truncate(value, max)
}

func truncate(value string, max int) string {
	runes := []rune(value)
	if len(runes) <= max {
		return value
	}
	return string(runes[:max]) + "…"
}
