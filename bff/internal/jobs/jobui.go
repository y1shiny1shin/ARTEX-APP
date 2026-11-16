package jobs

import (
	"context"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/y1shiny1shin/ryagent/bff/internal/store"
)

var jobuiQueries = []string{
	"网络安全", "信息安全", "安全运营", "渗透测试", "数据安全", "安全工程师",
}

type jobuiListItem struct {
	JobID      string
	Title      string
	Company    string
	Experience string
	Education  string
	Salary     string
	PostedAt   time.Time
}

var (
	jobuiHrefRE     = regexp.MustCompile(`(?s)<a class="job-name" href="/job/(\d+)/"`)
	jobuiTitleRE    = regexp.MustCompile(`(?s)<h3>(.*?)</h3>`)
	jobuiExpRE      = regexp.MustCompile(`title="工作经验要求：([^"]+)"`)
	jobuiEduRE      = regexp.MustCompile(`title="学历要求：([^"]+)"`)
	jobuiSalaryRE   = regexp.MustCompile(`title="工资：([^"]+)"`)
	jobuiCompanyRE  = regexp.MustCompile(`(?s)class="job-company-name"[^>]*>(.*?)</a>`)
	jobuiPostedRE   = regexp.MustCompile(`(?s)class="job-add-date">(.*?)</div>`)
	jobuiDaysRE     = regexp.MustCompile(`(\d+)\s*天前`)
	jobuiHoursRE    = regexp.MustCompile(`(\d+)\s*小时前`)
	jobuiMinutesRE  = regexp.MustCompile(`(\d+)\s*分钟前`)
	jobuiDateLayout = "2006-01-02"
)

func parseJobuiList(body []byte, city string) []jobuiListItem {
	s := string(body)
	parts := strings.Split(s, `<div class="c-job-list">`)
	items := make([]jobuiListItem, 0, len(parts))
	for _, part := range parts[1:] {
		href := jobuiHrefRE.FindStringSubmatch(part)
		if len(href) < 2 {
			continue
		}
		item := jobuiListItem{JobID: href[1], PostedAt: time.Time{}}
		if m := jobuiTitleRE.FindStringSubmatch(part); len(m) > 1 {
			item.Title = cleanText(m[1])
		}
		if m := jobuiExpRE.FindStringSubmatch(part); len(m) > 1 {
			item.Experience = cleanText(m[1])
		}
		if m := jobuiEduRE.FindStringSubmatch(part); len(m) > 1 {
			item.Education = cleanText(m[1])
		}
		if m := jobuiSalaryRE.FindStringSubmatch(part); len(m) > 1 {
			item.Salary = cleanText(m[1])
		}
		if m := jobuiCompanyRE.FindStringSubmatch(part); len(m) > 1 {
			item.Company = cleanText(m[1])
		}
		if m := jobuiPostedRE.FindStringSubmatch(part); len(m) > 1 {
			item.PostedAt = parseJobuiDate(cleanText(m[1]))
		}
		if item.Title == "" {
			continue
		}
		items = append(items, item)
	}
	return items
}

func parseJobuiDate(value string) time.Time {
	value = strings.TrimSpace(value)
	now := time.Now()
	if parsed, err := time.ParseInLocation(jobuiDateLayout, value, cst); err == nil {
		return parsed
	}
	if m := jobuiDaysRE.FindStringSubmatch(value); len(m) > 1 {
		days, _ := strconv.Atoi(m[1])
		return now.AddDate(0, 0, -days)
	}
	if m := jobuiHoursRE.FindStringSubmatch(value); len(m) > 1 {
		hours, _ := strconv.Atoi(m[1])
		return now.Add(-time.Duration(hours) * time.Hour)
	}
	if m := jobuiMinutesRE.FindStringSubmatch(value); len(m) > 1 {
		minutes, _ := strconv.Atoi(m[1])
		return now.Add(-time.Duration(minutes) * time.Minute)
	}
	return time.Time{}
}

func (s *Service) crawlJobui(ctx context.Context) ([]store.JobPosting, []string, error) {
	city := s.cfg.City
	if city == "" {
		city = "成都"
	}
	var matched []store.JobPosting
	var processed []string
	seen := map[string]bool{}
	var firstErr error
	for _, keyword := range jobuiQueries {
		u := "https://www.jobui.com/jobs?jobKw=" + url.QueryEscape(keyword) +
			"&cityKw=" + url.QueryEscape(city)
		body, err := s.get(ctx, u, "")
		if err != nil {
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		items := parseJobuiList(body, city)
		// Jobui sometimes returns a tiny block page with HTTP 200 when requests
		// come too quickly. Retry once with a pause before giving up.
		if len(items) == 0 && len(body) < 50000 {
			time.Sleep(2 * time.Second)
			if retryBody, retryErr := s.get(ctx, u, ""); retryErr == nil {
				items = parseJobuiList(retryBody, city)
			}
		}
		for _, item := range items {
			if item.JobID == "" || seen[item.JobID] {
				continue
			}
			seen[item.JobID] = true
			id := "jobui:" + item.JobID
			if s.store.HasJobSeen(id) {
				continue
			}
			job, ok := s.buildJob(
				"jobui", item.JobID, item.Title, item.Company, city,
				item.Salary, item.Experience, item.Education, "",
				"https://www.jobui.com/job/"+item.JobID+"/", item.PostedAt, time.Time{}, false, false,
			)
			if ok {
				matched = append(matched, job)
			}
			processed = append(processed, id)
		}
		time.Sleep(1200 * time.Millisecond)
	}
	return matched, processed, firstErr
}
