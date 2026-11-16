package intel

import (
	"context"
	"encoding/json"
	"encoding/xml"
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
	defaultRefreshMinutes = 30
	requestGap            = 900 * time.Millisecond
	maxArticleSummary     = 700
	maxFeedItems          = 80
)

type source struct {
	key      string
	stateKey string
	label    string
	url      string
	accept   string
	kind     string
	cooldown time.Duration
	parse    func([]byte) ([]store.IntelItem, error)
}

func (src source) stateName() string {
	if src.stateKey != "" {
		return src.stateKey
	}
	return src.key
}

// Service pulls public RSS/JSON feeds. It never scrapes search result pages and
// uses conditional requests + per-source cooldowns to stay polite.
type Service struct {
	store       *store.Store
	githubToken string
	interval    time.Duration
	client      *http.Client

	refreshMu sync.Mutex
	sources   []source
}

func New(st *store.Store, proxy, githubToken string, minutes int, sources string) *Service {
	if minutes <= 0 {
		minutes = defaultRefreshMinutes
	}
	tr := http.DefaultTransport.(*http.Transport).Clone()
	if p := strings.TrimSpace(proxy); p != "" {
		if u, err := url.Parse(p); err == nil && u.Scheme != "" && u.Host != "" {
			tr.Proxy = http.ProxyURL(u)
		}
	}
	s := &Service{
		store: st, githubToken: strings.TrimSpace(githubToken),
		interval: time.Duration(minutes) * time.Minute,
		client:   &http.Client{Timeout: 30 * time.Second, Transport: tr},
	}
	allSources := []source{
		{key: "freebuf", stateKey: "freebuf@2", label: "FreeBuf", url: "https://www.freebuf.com/feed", accept: rssAccept, kind: "article", cooldown: 30 * time.Minute, parse: parseArticleFeed("freebuf", "FreeBuf")},
		{key: "xz", label: "先知社区", url: "https://xz.aliyun.com/feed", accept: atomAccept, kind: "article", cooldown: 30 * time.Minute, parse: parseArticleFeed("xz", "先知社区")},
		{key: "thn", label: "The Hacker News", url: "https://feeds.feedburner.com/TheHackersNews", accept: rssAccept, kind: "article", cooldown: 30 * time.Minute, parse: parseArticleFeed("thn", "The Hacker News")},
		{key: "bleepingcomputer", label: "BleepingComputer", url: "https://www.bleepingcomputer.com/feed/", accept: rssAccept, kind: "article", cooldown: 30 * time.Minute, parse: parseArticleFeed("bleepingcomputer", "BleepingComputer")},
		{key: "krebs", label: "Krebs on Security", url: "https://krebsonsecurity.com/feed/", accept: rssAccept, kind: "article", cooldown: 60 * time.Minute, parse: parseArticleFeed("krebs", "Krebs on Security")},
		{key: "securityweek", label: "SecurityWeek", url: "https://www.securityweek.com/feed/", accept: rssAccept, kind: "article", cooldown: 60 * time.Minute, parse: parseArticleFeed("securityweek", "SecurityWeek")},
		{key: "seebug", label: "Seebug Paper", url: "https://paper.seebug.org/rss/", accept: rssAccept, kind: "article", cooldown: 60 * time.Minute, parse: parseArticleFeed("seebug", "Seebug Paper")},
		{key: "4hou", label: "嘶吼", url: "https://www.4hou.com/feed", accept: rssAccept, kind: "article", cooldown: 30 * time.Minute, parse: parseArticleFeed("4hou", "嘶吼")},
		{key: "cnsec", label: "CN-SEC", url: "https://cn-sec.com/feed", accept: rssAccept, kind: "article", cooldown: 30 * time.Minute, parse: parseArticleFeed("cnsec", "CN-SEC")},
		{key: "xlab", label: "腾讯玄武实验室", url: "https://xlab.tencent.com/cn/feed/", accept: atomAccept, kind: "article", cooldown: 60 * time.Minute, parse: parseArticleFeed("xlab", "腾讯玄武实验室")},
		{key: "anquanke", stateKey: "anquanke@1", label: "安全客", url: "https://www.anquanke.com/", accept: "text/html, */*", kind: "article", cooldown: 30 * time.Minute, parse: parseAnquanke},
	}
	s.sources = filterSources(allSources, sources)
	return s
}

func filterSources(all []source, raw string) []source {
	raw = strings.TrimSpace(strings.ToLower(raw))
	if raw == "" || raw == "all" {
		return all
	}
	enabled := map[string]bool{}
	for _, part := range strings.Split(raw, ",") {
		enabled[strings.TrimSpace(part)] = true
	}
	out := make([]source, 0, len(all))
	for _, src := range all {
		if enabled[src.key] {
			out = append(out, src)
		}
	}
	if len(out) == 0 {
		return all
	}
	return out
}

const (
	rssAccept  = "application/rss+xml, application/xml, text/xml, */*"
	atomAccept = "application/atom+xml, application/xml, text/xml, */*"
	jsonAccept = "application/json, */*"
)

func (s *Service) Start(ctx context.Context) {
	go func() {
		select {
		case <-ctx.Done():
			return
		case <-time.After(10 * time.Second):
		}
		if n, err := s.Refresh(ctx); err != nil {
			logf("initial refresh: %v", err)
		} else if n > 0 {
			logf("initial refresh: %d new items", n)
		}
		t := time.NewTicker(s.interval)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				if n, err := s.Refresh(ctx); err != nil {
					logf("refresh: %v", err)
				} else if n > 0 {
					logf("refresh: %d new items", n)
				}
			}
		}
	}()
}

func (s *Service) Refresh(ctx context.Context) (int, error) {
	s.refreshMu.Lock()
	defer s.refreshMu.Unlock()

	now := time.Now()
	added := 0
	var firstErr error
	for _, src := range s.sources {
		stateName := src.stateName()
		state := s.store.IntelSource(stateName)
		if !state.NextFetch.IsZero() && now.Before(state.NextFetch) {
			continue
		}
		if !state.LastFetch.IsZero() && now.Sub(state.LastFetch) < src.cooldown {
			continue
		}
		body, nextState, notModified, err := s.fetch(ctx, src, state)
		if err != nil {
			if firstErr == nil {
				firstErr = err
			}
			s.store.SetIntelSource(stateName, nextState)
			continue
		}
		nextState.LastFetch = time.Now()
		nextState.NextFetch = time.Time{}
		if notModified {
			s.store.SetIntelSource(stateName, nextState)
			continue
		}
		items, err := src.parse(body)
		if err != nil {
			if firstErr == nil {
				firstErr = err
			}
			nextState.LastFetch = time.Time{}
			nextState.NextFetch = time.Now().Add(6 * time.Hour)
			s.store.SetIntelSource(stateName, nextState)
			continue
		}
		added += s.store.MergeIntel(items)
		s.store.SetIntelSource(stateName, nextState)
		time.Sleep(requestGap)
	}
	if firstErr != nil && added == 0 {
		return 0, firstErr
	}
	if firstErr != nil {
		logf("partial refresh: %v", firstErr)
	}
	return added, nil
}

func (s *Service) Feed(limit int) []store.IntelItem { return s.store.IntelFeedList(limit) }

func (s *Service) UpdatedAt() time.Time { return s.store.IntelUpdatedAt() }

func (s *Service) RefreshMinutes() int { return int(s.interval / time.Minute) }

func (s *Service) SourceLabels() map[string]string {
	out := map[string]string{}
	for _, src := range s.sources {
		out[src.key] = src.label
	}
	return out
}

func (s *Service) fetch(ctx context.Context, src source, state store.IntelSourceState) ([]byte, store.IntelSourceState, bool, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, src.url, nil)
	if err != nil {
		return nil, state, false, err
	}
	req.Header.Set("Accept", src.accept)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36")
	req.Header.Set("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
	if state.ETag != "" {
		req.Header.Set("If-None-Match", state.ETag)
	}
	if state.LastModified != "" {
		req.Header.Set("If-Modified-Since", state.LastModified)
	}
	if src.key == "ghsa" && s.githubToken != "" {
		req.Header.Set("Authorization", "Bearer "+s.githubToken)
	}
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, state, false, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotModified {
		if etag := resp.Header.Get("ETag"); etag != "" {
			state.ETag = etag
		}
		if lm := resp.Header.Get("Last-Modified"); lm != "" {
			state.LastModified = lm
		}
		return nil, state, true, nil
	}
	if resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode == http.StatusServiceUnavailable {
		state.NextFetch = time.Now().Add(retryAfter(resp, 15*time.Minute))
		return nil, state, false, fmt.Errorf("%s: HTTP %d (backing off)", src.key, resp.StatusCode)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, state, false, fmt.Errorf("%s: HTTP %d", src.key, resp.StatusCode)
	}
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 16<<20))
	if etag := resp.Header.Get("ETag"); etag != "" {
		state.ETag = etag
	}
	if lm := resp.Header.Get("Last-Modified"); lm != "" {
		state.LastModified = lm
	}
	return body, state, false, nil
}

func retryAfter(resp *http.Response, fallback time.Duration) time.Duration {
	value := strings.TrimSpace(resp.Header.Get("Retry-After"))
	if value == "" {
		return fallback
	}
	if seconds, err := time.ParseDuration(value + "s"); err == nil {
		return seconds
	}
	if when, err := http.ParseTime(value); err == nil {
		if d := time.Until(when); d > 0 {
			return d
		}
	}
	return fallback
}

// ---- feed parsing ----

type rssDoc struct {
	Channel struct {
		Items []rssItem `xml:"item"`
	} `xml:"channel"`
}

type rssItem struct {
	Title       string `xml:"title"`
	Link        string `xml:"link"`
	Description string `xml:"description"`
	Content     string `xml:"encoded"`
	GUID        string `xml:"guid"`
	PubDate     string `xml:"pubDate"`
}

type atomDoc struct {
	Entries []atomEntry `xml:"entry"`
}

type atomEntry struct {
	ID        string `xml:"id"`
	Title     string `xml:"title"`
	Summary   string `xml:"summary"`
	Content   string `xml:"content"`
	Published string `xml:"published"`
	Updated   string `xml:"updated"`
	Links     []struct {
		Href string `xml:"href,attr"`
		Rel  string `xml:"rel,attr"`
	} `xml:"link"`
}

func parseArticleFeed(key, label string) func([]byte) ([]store.IntelItem, error) {
	return func(body []byte) ([]store.IntelItem, error) {
		return parseFeed(key, label, "article", body)
	}
}

func parseFeed(key, label, kind string, body []byte) ([]store.IntelItem, error) {
	var rss rssDoc
	if err := xml.Unmarshal(body, &rss); err == nil && len(rss.Channel.Items) > 0 {
		items := make([]store.IntelItem, 0, len(rss.Channel.Items))
		for _, raw := range rss.Channel.Items {
			items = append(items, feedItem(key, label, kind, raw.Title, raw.Link, raw.GUID, raw.Description, raw.Content, raw.PubDate))
		}
		return items, nil
	}
	var atom atomDoc
	if err := xml.Unmarshal(body, &atom); err == nil && len(atom.Entries) > 0 {
		items := make([]store.IntelItem, 0, len(atom.Entries))
		for _, raw := range atom.Entries {
			link := ""
			for _, l := range raw.Links {
				if l.Rel == "alternate" || l.Rel == "" {
					link = l.Href
					break
				}
			}
			items = append(items, feedItem(key, label, kind, raw.Title, link, raw.ID, raw.Summary, raw.Content, firstNonEmpty(raw.Published, raw.Updated)))
		}
		return items, nil
	}
	// Some feeds contain HTML-escaped entities that encoding/xml rejects. Fall
	// back to a tolerant block parser rather than dropping the whole source.
	if items := parseFeedBlocks(key, label, kind, body); len(items) > 0 {
		return items, nil
	}
	return nil, fmt.Errorf("%s: unsupported feed", key)
}

var (
	feedItemRE  = regexp.MustCompile(`(?is)<item[^>]*>(.*?)</item>`)
	feedEntryRE = regexp.MustCompile(`(?is)<entry[^>]*>(.*?)</entry>`)
)

func parseFeedBlocks(key, label, kind string, body []byte) []store.IntelItem {
	s := string(body)
	blocks := feedItemRE.FindAllStringSubmatch(s, -1)
	atom := false
	if len(blocks) == 0 {
		blocks = feedEntryRE.FindAllStringSubmatch(s, -1)
		atom = true
	}
	items := make([]store.IntelItem, 0, len(blocks))
	for _, block := range blocks {
		content := block[1]
		title := xmlField(content, "title")
		link := xmlField(content, "link")
		if atom && link == "" {
			link = atomLinkHref(content)
		}
		guid := firstNonEmpty(xmlField(content, "guid"), xmlField(content, "id"))
		description := xmlField(content, "description")
		encoded := firstNonEmpty(xmlField(content, "content:encoded"), xmlField(content, "encoded"))
		published := firstNonEmpty(xmlField(content, "pubDate"), xmlField(content, "published"), xmlField(content, "updated"))
		items = append(items, feedItem(key, label, kind, title, link, guid, description, encoded, published))
	}
	return items
}

func xmlField(block, tag string) string {
	re := regexp.MustCompile(`(?is)<` + regexp.QuoteMeta(tag) + `[^>]*>(.*?)</` + regexp.QuoteMeta(tag) + `>`)
	if m := re.FindStringSubmatch(block); len(m) > 1 {
		value := strings.TrimSpace(m[1])
		value = strings.TrimPrefix(value, "<![CDATA[")
		value = strings.TrimSuffix(value, "]]>")
		return strings.TrimSpace(value)
	}
	return ""
}

func atomLinkHref(block string) string {
	re := regexp.MustCompile(`(?is)<link[^>]*href="([^"]+)"`)
	if m := re.FindStringSubmatch(block); len(m) > 1 {
		return m[1]
	}
	return ""
}

func feedItem(key, label, kind, title, link, guid, description, content, published string) store.IntelItem {
	body := firstNonEmpty(content, description)
	summary := truncateRunes(stripHTML(body), maxArticleSummary)
	item := store.IntelItem{
		Kind: kind, Source: key, Title: cleanText(title), Summary: summary, URL: strings.TrimSpace(link),
		PublishedAt: parseFeedTime(published),
	}
	if item.Title == "" {
		item.Title = "（无标题）"
	}
	identity := firstNonEmpty(guid, link, title)
	item.ID = key + ":" + identity
	if kind == "vuln" && key == "exploitdb" {
		item.Exploited = true
		item.Tags = []string{"Exploit-DB", "PoC"}
		if cve := cveRE.FindString(item.Title + " " + summary); cve != "" {
			item.CVE = cve
		}
	}
	return item
}

var cveRE = regexp.MustCompile(`CVE-\d{4}-\d{4,}`)

// ---- vulnerability parsers ----

type kevDoc struct {
	Vulnerabilities []struct {
		CVEID                      string `json:"cveID"`
		VendorProject              string `json:"vendorProject"`
		Product                    string `json:"product"`
		VulnerabilityName          string `json:"vulnerabilityName"`
		DateAdded                  string `json:"dateAdded"`
		ShortDescription           string `json:"shortDescription"`
		RequiredAction             string `json:"requiredAction"`
		KnownRansomwareCampaignUse string `json:"knownRansomwareCampaignUse"`
	} `json:"vulnerabilities"`
}

func parseKEV(body []byte) ([]store.IntelItem, error) {
	var doc kevDoc
	if err := json.Unmarshal(body, &doc); err != nil {
		return nil, fmt.Errorf("cisa-kev decode: %w", err)
	}
	items := make([]store.IntelItem, 0, len(doc.Vulnerabilities))
	cutoff := time.Now().AddDate(0, 0, -180)
	for _, v := range doc.Vulnerabilities {
		if v.CVEID == "" {
			continue
		}
		added := parseDateOnly(v.DateAdded)
		if !added.IsZero() && added.Before(cutoff) {
			continue
		}
		summary := v.ShortDescription
		if v.RequiredAction != "" {
			summary = strings.TrimSpace(summary + "\n\n处置建议：" + v.RequiredAction)
		}
		item := store.IntelItem{
			ID: "cisa-kev:" + v.CVEID, Kind: "vuln", Source: "cisa-kev",
			Title:   v.CVEID + " · " + v.VulnerabilityName,
			Summary: truncateRunes(summary, maxArticleSummary),
			URL:     "https://nvd.nist.gov/vuln/detail/" + v.CVEID,
			CVE:     v.CVEID, Severity: "KEV", Vendor: v.VendorProject, Product: v.Product,
			Exploited: true, PublishedAt: parseDateOnly(v.DateAdded),
			Tags: []string{"CISA KEV", "已利用"},
		}
		if strings.EqualFold(v.KnownRansomwareCampaignUse, "Known") {
			item.Tags = append(item.Tags, "勒索软件利用")
		}
		items = append(items, item)
	}
	return items, nil
}

type ghsaDoc []struct {
	GHSAID      string `json:"ghsa_id"`
	CVEID       string `json:"cve_id"`
	Summary     string `json:"summary"`
	Description string `json:"description"`
	Severity    string `json:"severity"`
	HTMLURL     string `json:"html_url"`
	PublishedAt string `json:"published_at"`
	CVSS        struct {
		Score float64 `json:"score"`
	} `json:"cvss"`
	Vulnerabilities []struct {
		Package struct {
			Name      string `json:"name"`
			Ecosystem string `json:"ecosystem"`
		} `json:"package"`
	} `json:"vulnerabilities"`
}

func parseGHSA(body []byte) ([]store.IntelItem, error) {
	var doc ghsaDoc
	if err := json.Unmarshal(body, &doc); err != nil {
		return nil, fmt.Errorf("ghsa decode: %w", err)
	}
	items := make([]store.IntelItem, 0, len(doc))
	for _, a := range doc {
		if a.GHSAID == "" {
			continue
		}
		products := make([]string, 0, 3)
		ecosystems := make([]string, 0, 2)
		for _, v := range a.Vulnerabilities {
			if v.Package.Name != "" && len(products) < 3 {
				products = append(products, v.Package.Name)
			}
			if v.Package.Ecosystem != "" && len(ecosystems) < 2 {
				ecosystems = append(ecosystems, v.Package.Ecosystem)
			}
		}
		item := store.IntelItem{
			ID: "ghsa:" + a.GHSAID, Kind: "vuln", Source: "ghsa",
			Title:   a.GHSAID + " · " + a.Summary,
			Summary: truncateRunes(strings.TrimSpace(a.Description), maxArticleSummary),
			URL:     a.HTMLURL, CVE: a.CVEID, CVSS: a.CVSS.Score,
			Severity:    strings.ToLower(a.Severity),
			Vendor:      strings.Join(ecosystems, "/"),
			Product:     strings.Join(products, ", "),
			PublishedAt: parseFeedTime(a.PublishedAt),
			Tags:        []string{"GitHub Advisory"},
		}
		items = append(items, item)
	}
	return items, nil
}

func parseExploitDB(body []byte) ([]store.IntelItem, error) {
	return parseFeed("exploitdb", "Exploit-DB", "vuln", body)
}

var dateLayouts = []string{
	time.RFC1123Z, time.RFC1123, time.RFC822Z, time.RFC822,
	time.RFC3339, "2006-01-02 15:04:05", "2006-01-02T15:04:05Z07:00", "2006-01-02",
}

func parseFeedTime(value string) time.Time {
	value = strings.TrimSpace(value)
	for _, layout := range dateLayouts {
		if parsed, err := time.Parse(layout, value); err == nil {
			return parsed
		}
	}
	return time.Time{}
}

func parseDateOnly(value string) time.Time {
	parsed, _ := time.ParseInLocation("2006-01-02", strings.TrimSpace(value), time.Local)
	return parsed
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

var htmlTagRE = regexp.MustCompile(`(?s)<[^>]+>`)

func stripHTML(value string) string {
	value = strings.ReplaceAll(value, "<br />", "\n")
	value = strings.ReplaceAll(value, "<br>", "\n")
	value = strings.ReplaceAll(value, "</p>", "\n")
	value = htmlTagRE.ReplaceAllString(value, "")
	value = html.UnescapeString(value)
	value = strings.ReplaceAll(value, " ", " ")
	lines := strings.Split(value, "\n")
	out := make([]string, 0, len(lines))
	for _, line := range lines {
		if line = strings.TrimSpace(line); line != "" {
			out = append(out, line)
		}
	}
	return strings.TrimSpace(strings.Join(out, "\n"))
}

func cleanText(value string) string {
	return strings.TrimSpace(stripHTML(value))
}

func truncateRunes(value string, max int) string {
	runes := []rune(value)
	if len(runes) <= max {
		return value
	}
	return string(runes[:max]) + "…"
}

func logf(format string, args ...any) {
	// keep logging centralized so the source adapters stay small
	log.Printf("[intel] "+format, args...)
}

var anquankePostRE = regexp.MustCompile(`(?s)href="/post/id/(\d+)"[^>]*>(.*?)</a>`)
var anquankeTimeRE = regexp.MustCompile(`(?s)bottom-item-time">([^<]+)<`)

func parseAnquanke(body []byte) ([]store.IntelItem, error) {
	s := string(body)
	blocks := strings.Split(s, `<li class="item">`)
	items := make([]store.IntelItem, 0, 50)
	seen := map[string]bool{}
	for _, block := range blocks[1:] {
		id := ""
		title := ""
		for _, m := range anquankePostRE.FindAllStringSubmatch(block, -1) {
			t := cleanText(m[2])
			if t != "" {
				id, title = m[1], t
				break
			}
		}
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		item := store.IntelItem{
			ID: "anquanke:" + id, Kind: "article", Source: "anquanke",
			Title: title, URL: "https://www.anquanke.com/post/id/" + id,
		}
		if m := anquankeTimeRE.FindStringSubmatch(block); len(m) > 1 {
			item.PublishedAt = parseFeedTime(m[1])
		}
		items = append(items, item)
		if len(items) >= 50 {
			break
		}
	}
	if len(items) == 0 {
		return nil, fmt.Errorf("anquanke: no articles parsed")
	}
	return items, nil
}
