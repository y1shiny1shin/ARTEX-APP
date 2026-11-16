package jobs

import (
	"context"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/y1shiny1shin/ryagent/bff/internal/store"
)

// Liepin's city/keyword SEO pages are server-rendered and public. The path
// carries both the city (city-cd = 成都) and the keyword slug, so each page is
// already a relevant slice; we still run the normal match engine and dedupe.
var liepinSlugs = []string{
	"zpanquanyunwei", "zpwangluoanquan", "zpxinxianquan", "zpshujuanquan",
	"zpaqgcs", "zpaqhg", "zpaqyy", "zpaqyunwei", "zpxxaqgcs",
}

type liepinListItem struct {
	JobID      string
	Title      string
	Company    string
	Location   string
	Salary     string
	Experience string
	Education  string
	URL        string
}

var (
	lpHrefRE    = regexp.MustCompile(`href="https://www\.liepin\.com/job/(\d+)\.shtml"`)
	lpTitleRE   = regexp.MustCompile(`(?s)<div title="([^"]+)" class="ellipsis-1">`)
	lpLocRE     = regexp.MustCompile(`(?s)job-dq-box.*?<span class="ellipsis-1">([^<]+)</span>`)
	lpSalaryRE  = regexp.MustCompile(`(?s)<span class="job-salary">(.*?)</span>`)
	lpLabelRE   = regexp.MustCompile(`(?s)<span class="labels-tag"[^>]*>(.*?)</span>`)
	lpCompanyRE = regexp.MustCompile(`(?s)<span class="company-name ellipsis-1">(.*?)</span>`)
)

func parseLiepinList(body []byte) []liepinListItem {
	s := string(body)
	parts := strings.Split(s, `class="job-card-pc-container"`)
	items := make([]liepinListItem, 0, len(parts))
	for _, part := range parts[1:] {
		href := lpHrefRE.FindStringSubmatch(part)
		if len(href) < 2 {
			continue
		}
		item := liepinListItem{
			JobID: href[1],
			URL:   "https://www.liepin.com/job/" + href[1] + ".shtml",
		}
		if m := lpTitleRE.FindStringSubmatch(part); len(m) > 1 {
			item.Title = cleanText(m[1])
		}
		if m := lpLocRE.FindStringSubmatch(part); len(m) > 1 {
			item.Location = cleanText(m[1])
		}
		if m := lpSalaryRE.FindStringSubmatch(part); len(m) > 1 {
			item.Salary = cleanText(m[1])
		}
		if m := lpCompanyRE.FindStringSubmatch(part); len(m) > 1 {
			item.Company = cleanText(m[1])
		}
		labels := lpLabelRE.FindAllStringSubmatch(part, -1)
		for _, label := range labels {
			value := cleanText(label[1])
			switch {
			case value == "":
			case strings.Contains(value, "年") || strings.Contains(value, "应届") || strings.Contains(value, "经验"):
				if item.Experience == "" {
					item.Experience = value
				}
			case containsAny(value, "本科", "硕士", "博士", "大专", "学历"):
				if item.Education == "" {
					item.Education = value
				}
			}
		}
		if item.Title == "" {
			continue
		}
		items = append(items, item)
	}
	return items
}

func (s *Service) crawlLiepin(ctx context.Context) ([]store.JobPosting, []string, error) {
	type candidate struct {
		item  liepinListItem
		score int
	}
	var candidates []candidate
	seen := map[string]bool{}
	var firstErr error

	for _, slug := range liepinSlugs {
		for page := 0; page <= 1; page++ {
			u := fmt.Sprintf("https://www.liepin.com/city-cd/%s/pn%d/", slug, page)
			body, err := s.get(ctx, u, "")
			if err != nil {
				if firstErr == nil {
					firstErr = err
				}
				break
			}
			for _, item := range parseLiepinList(body) {
				if item.JobID == "" || seen[item.JobID] {
					continue
				}
				seen[item.JobID] = true
				if !s.targetLocation(item.Location, item.Title) {
					continue
				}
				id := "liepin:" + item.JobID
				if s.store.HasJobSeen(id) {
					continue
				}
				result := Match(MatchInput{
					Source: "liepin", Title: item.Title, Company: item.Company,
					Location: item.Location, Salary: item.Salary,
					Experience: item.Experience, Education: item.Education,
					Now: time.Now(),
				}, s.cfg)
				if result.Score < s.cfg.MinScore {
					continue
				}
				candidates = append(candidates, candidate{item: item, score: result.Score})
			}
			time.Sleep(requestGap)
		}
	}

	// De-duplicate candidates that appeared under several keyword slugs.
	sort.SliceStable(candidates, func(i, j int) bool {
		return candidates[i].score > candidates[j].score
	})
	unique := make([]candidate, 0, len(candidates))
	seenCandidate := map[string]bool{}
	for _, c := range candidates {
		if seenCandidate[c.item.JobID] {
			continue
		}
		seenCandidate[c.item.JobID] = true
		unique = append(unique, c)
	}

	// Enrich the best new postings with the full JD. List-level data is enough
	// for matching; detail is a bounded bonus so the first crawl stays polite.
	const detailLimit = 20
	var matched []store.JobPosting
	var processed []string
	for i, c := range unique {
		description := ""
		postedAt := time.Time{}
		if i < detailLimit {
			if detailBody, err := s.get(ctx, c.item.URL, ""); err == nil {
				description, postedAt = parseLiepinDetail(detailBody)
				time.Sleep(requestGap)
			}
		}
		job, ok := s.buildJob(
			"liepin", c.item.JobID, c.item.Title, c.item.Company, c.item.Location,
			c.item.Salary, c.item.Experience, c.item.Education, description,
			c.item.URL, postedAt, time.Time{}, false, false,
		)
		if ok {
			matched = append(matched, job)
		}
		processed = append(processed, "liepin:"+c.item.JobID)
	}
	return matched, processed, firstErr
}

func parseLiepinDetail(body []byte) (string, time.Time) {
	text := stripHTML(string(body))
	description := ""
	if i := strings.Index(text, "职位介绍"); i >= 0 {
		description = text[i+len("职位介绍"):]
		for _, marker := range []string{"其他信息", "公司简介", "猎聘温馨提示"} {
			if j := strings.Index(description, marker); j >= 0 {
				description = description[:j]
			}
		}
	} else if i := strings.Index(text, "职位描述"); i >= 0 {
		description = text[i+len("职位描述"):]
		if j := strings.Index(description, "公司简介"); j >= 0 {
			description = description[:j]
		}
	}
	description = strings.TrimSpace(description)
	posted := time.Time{}
	if m := regexp.MustCompile(`(\d+)\s*天前更新`).FindStringSubmatch(text); len(m) > 1 {
		days, _ := strconv.Atoi(m[1])
		posted = time.Now().AddDate(0, 0, -days)
	} else if m := regexp.MustCompile(`(\d+)\s*小时前更新`).FindStringSubmatch(text); len(m) > 1 {
		hours, _ := strconv.Atoi(m[1])
		posted = time.Now().Add(-time.Duration(hours) * time.Hour)
	}
	return description, posted
}
