package jobs

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/y1shiny1shin/ryagent/bff/internal/store"
)

type kanxueListItem struct {
	ID         string
	Title      string
	Company    string
	Location   string
	Salary     string
	Experience string
	Education  string
	PostedAt   time.Time
	URL        string
}

type kanxueDetail struct {
	Title       string
	Company     string
	Location    string
	Salary      string
	Experience  string
	Education   string
	Description string
	PostedAt    time.Time
}

var (
	kxTitleRE    = regexp.MustCompile(`(?s)<div class="pos-title">\s*<a href="position-read-(\d+)\.htm">(.*?)</a>`)
	kxCompanyRE  = regexp.MustCompile(`(?s)<div class="pos-company-name">\s*<a[^>]*>(.*?)</a>`)
	kxSalaryRE   = regexp.MustCompile(`(?s)<div class="pos-salary"><span>(.*?)</span></div>`)
	kxLocRE      = regexp.MustCompile(`(?s)<i class="icon icon-map-marker"></i>\s*(.*?)</span>`)
	kxMetaRE     = regexp.MustCompile(`(?s)<div class="pos-meta">(.*?)</div>`)
	kxMetaSpanRE = regexp.MustCompile(`(?s)<span class="">(.*?)</span>`)
	kxDateRE     = regexp.MustCompile(`(?s)<div class="pos-date">\s*<span class="d-none d-md-inline">(.*?)</span>`)

	kxDetailTitleRE = regexp.MustCompile(`(?s)<h3 class="pos-title">(.*?)</h3>`)
	kxDetailLocRE   = regexp.MustCompile(`(?s)<div class="pos-meta">\s*<span><i class="icon icon-map-marker"></i>\s*(.*?)</span>`)
	kxDetailSalRE   = regexp.MustCompile(`(?s)<span class="pos-salary"><span>(.*?)</span></span>`)
	kxDetailExpRE   = regexp.MustCompile(`(?s)<span class="pos-exp-degree"><span[^>]*>(.*?)</span>&nbsp;/&nbsp;<span[^>]*>(.*?)</span>`)
	kxDetailDateRE  = regexp.MustCompile(`(?s)发布于\s*<span>(.*?)</span>`)
	kxDetailCoRE    = regexp.MustCompile(`(?s)<div class="co-sidebar-name">\s*<a[^>]*>(.*?)</a>`)
)

func parseKanxueList(body []byte) []kanxueListItem {
	s := string(body)
	parts := strings.Split(s, `<div class="pos-list-item">`)
	items := make([]kanxueListItem, 0, len(parts))
	for _, part := range parts[1:] {
		titleMatch := kxTitleRE.FindStringSubmatch(part)
		if len(titleMatch) < 3 {
			continue
		}
		item := kanxueListItem{
			ID:    titleMatch[1],
			Title: cleanText(titleMatch[2]),
			URL:   "https://job.kanxue.com/position-read-" + titleMatch[1] + ".htm",
		}
		if m := kxCompanyRE.FindStringSubmatch(part); len(m) > 1 {
			item.Company = cleanText(m[1])
		}
		if m := kxSalaryRE.FindStringSubmatch(part); len(m) > 1 {
			item.Salary = cleanText(m[1])
		}
		if m := kxLocRE.FindStringSubmatch(part); len(m) > 1 {
			item.Location = cleanText(m[1])
		}
		if m := kxMetaRE.FindStringSubmatch(part); len(m) > 1 {
			spans := kxMetaSpanRE.FindAllStringSubmatch(m[1], -1)
			if len(spans) > 0 {
				item.Experience = cleanText(spans[0][1])
			}
			if len(spans) > 1 {
				item.Education = cleanText(spans[1][1])
			}
		}
		if m := kxDateRE.FindStringSubmatch(part); len(m) > 1 {
			item.PostedAt = parseCST(m[1])
		}
		items = append(items, item)
	}
	return items
}

func parseKanxueDetail(body []byte) kanxueDetail {
	s := string(body)
	d := kanxueDetail{}
	if m := kxDetailTitleRE.FindStringSubmatch(s); len(m) > 1 {
		d.Title = cleanText(m[1])
	}
	if m := kxDetailCoRE.FindStringSubmatch(s); len(m) > 1 {
		d.Company = cleanText(m[1])
	}
	if m := kxDetailLocRE.FindStringSubmatch(s); len(m) > 1 {
		d.Location = cleanText(m[1])
	}
	if m := kxDetailSalRE.FindStringSubmatch(s); len(m) > 1 {
		d.Salary = cleanText(m[1])
	}
	if m := kxDetailExpRE.FindStringSubmatch(s); len(m) > 2 {
		d.Experience = cleanText(m[1])
		d.Education = cleanText(m[2])
	}
	if m := kxDetailDateRE.FindStringSubmatch(s); len(m) > 1 {
		d.PostedAt = parseCST(m[1])
	}
	const marker = `<div class="job-desc">`
	if i := strings.Index(s, marker); i >= 0 {
		rest := s[i+len(marker):]
		if j := strings.Index(rest, `</div>`); j >= 0 {
			d.Description = stripHTML(rest[:j])
		}
	}
	return d
}

func (s *Service) crawlKanxue(ctx context.Context) ([]store.JobPosting, []string, error) {
	urls := make([]string, 0, 5)
	// City code 3 = 成都; city code 99 = all locations (used to catch remote posts).
	for page := 1; page <= 3; page++ {
		urls = append(urls, fmt.Sprintf("https://job.kanxue.com/position-list-%d-3-99-99-99-99.htm", page))
	}
	for page := 1; page <= 2; page++ {
		urls = append(urls, fmt.Sprintf("https://job.kanxue.com/position-list-%d-99-99-99-99-99.htm", page))
	}

	var matched []store.JobPosting
	var processed []string
	seen := map[string]bool{}
	var firstErr error
	maxAge := time.Duration(s.cfg.MaxAgeDays) * 24 * time.Hour

	for _, listURL := range urls {
		body, err := s.get(ctx, listURL, "")
		if err != nil {
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		for _, item := range parseKanxueList(body) {
			if item.ID == "" || seen[item.ID] {
				continue
			}
			seen[item.ID] = true
			if !s.targetLocation(item.Location, item.Title) {
				continue
			}
			if !item.PostedAt.IsZero() && time.Since(item.PostedAt) > maxAge {
				continue
			}
			id := "kanxue:" + item.ID
			if s.store.HasJobSeen(id) {
				continue
			}

			detail := kanxueDetail{}
			if detailBody, err := s.get(ctx, item.URL, ""); err == nil {
				detail = parseKanxueDetail(detailBody)
				time.Sleep(requestGap)
			}
			title := firstNonEmpty(detail.Title, item.Title)
			company := firstNonEmpty(detail.Company, item.Company)
			location := firstNonEmpty(detail.Location, item.Location)
			salary := firstNonEmpty(detail.Salary, item.Salary)
			experience := firstNonEmpty(detail.Experience, item.Experience)
			education := firstNonEmpty(detail.Education, item.Education)
			posted := detail.PostedAt
			if posted.IsZero() {
				posted = item.PostedAt
			}
			job, ok := s.buildJob(
				"kanxue", item.ID, title, company, location, salary, experience,
				education, detail.Description, item.URL, posted, time.Time{}, false, false,
			)
			if ok {
				matched = append(matched, job)
			}
			processed = append(processed, id)
		}
		time.Sleep(requestGap)
	}
	return matched, processed, firstErr
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func cleanText(value string) string {
	value = stripHTML(value)
	return strings.TrimSpace(value)
}
