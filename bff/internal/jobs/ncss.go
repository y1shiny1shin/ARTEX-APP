package jobs

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/y1shiny1shin/ryagent/bff/internal/store"
)

const ncssEndpoint = "https://www.ncss.cn/student/jobs/jobslist/ajax/"

var ncssQueries = []string{
	"网络安全", "信息安全", "安全运营", "安全工程师", "安全运维",
	"渗透测试", "数据安全", "安全服务", "安全评估", "等保",
}

type ncssResponse struct {
	Flag bool   `json:"flag"`
	Msg  string `json:"msg"`
	Data struct {
		List []ncssJob `json:"list"`
	} `json:"data"`
}

type ncssJob struct {
	JobID        string  `json:"jobId"`
	JobName      string  `json:"jobName"`
	RecName      string  `json:"recName"`
	AreaCodeName string  `json:"areaCodeName"`
	DegreeName   string  `json:"degreeName"`
	RecProperty  string  `json:"recProperty"`
	SourceName   string  `json:"sourcesNameCh"`
	LowMonthPay  float64 `json:"lowMonthPay"`
	HighMonthPay float64 `json:"highMonthPay"`
	PublishDate  int64   `json:"publishDate"`
	UpdateDate   int64   `json:"updateDate"`
}

func (s *Service) crawlNCSS(ctx context.Context) ([]store.JobPosting, []string, error) {
	areaCode := ""
	if strings.Contains(s.cfg.City, "成都") || strings.Contains(s.cfg.City, "四川") {
		areaCode = "510100"
	}
	var matched []store.JobPosting
	var processed []string
	seen := map[string]bool{}
	var firstErr error
	const detailLimit = 30
	details := 0

	for _, keyword := range ncssQueries {
		jobs, err := s.ncssSearch(ctx, keyword, areaCode)
		if err != nil {
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		for _, job := range jobs {
			if job.JobID == "" || seen[job.JobID] {
				continue
			}
			seen[job.JobID] = true
			id := "ncss:" + job.JobID
			if s.store.HasJobSeen(id) {
				continue
			}
			location := job.AreaCodeName
			description := ""
			posted := time.UnixMilli(job.UpdateDate)
			if job.UpdateDate == 0 && job.PublishDate > 0 {
				posted = time.UnixMilli(job.PublishDate)
			}
			if details < detailLimit {
				detailBody, err := s.get(ctx, ncssJobURL(job.JobID), "")
				if err == nil {
					detailLocation, detailText := parseNCSSDetail(detailBody)
					if detailLocation != "" {
						location = detailLocation
					}
					description = detailText
					details++
					time.Sleep(requestGap)
				}
			}
			stateOwned := containsAny(job.RecProperty, "国有", "事业", "机关", "央企")
			salary := ncssSalary(job.LowMonthPay, job.HighMonthPay)
			published := posted
			jobPost, ok := s.buildJob(
				"ncss", job.JobID, job.JobName, job.RecName, location, salary,
				"", job.DegreeName, description, ncssJobURL(job.JobID),
				published, time.Time{}, false, stateOwned,
			)
			if ok {
				matched = append(matched, jobPost)
			}
			processed = append(processed, id)
		}
		time.Sleep(requestGap)
	}
	return matched, processed, firstErr
}

func ncssJobURL(jobID string) string {
	return "https://www.ncss.cn/student/jobs/" + url.PathEscape(jobID) + "/detail.html"
}

func (s *Service) ncssSearch(ctx context.Context, keyword, areaCode string) ([]ncssJob, error) {
	q := url.Values{}
	q.Set("jobName", keyword)
	q.Set("offset", "1")
	q.Set("limit", "30")
	if areaCode != "" {
		q.Set("areaCode", areaCode)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, ncssEndpoint+"?"+q.Encode(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json, text/javascript, */*; q=0.01")
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	req.Header.Set("Referer", "https://www.ncss.cn/student/jobs/index.html")
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36")
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("ncss %s: HTTP %d", keyword, resp.StatusCode)
	}
	var out ncssResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("ncss decode: %w", err)
	}
	if !out.Flag {
		return nil, fmt.Errorf("ncss %s: %s", keyword, out.Msg)
	}
	return out.Data.List, nil
}

func ncssSalary(low, high float64) string {
	switch {
	case low > 0 && high > 0 && low != high:
		return fmt.Sprintf("%gk-%gk", low, high)
	case low > 0:
		return fmt.Sprintf("%gk", low)
	case high > 0:
		return fmt.Sprintf("%gk", high)
	default:
		return "面议"
	}
}

func parseNCSSDetail(body []byte) (string, string) {
	text := stripHTML(string(body))
	location := ""
	if strings.Contains(text, "成都") {
		location = "成都"
	} else if strings.Contains(text, "四川") {
		location = "四川"
	}
	description := ""
	if i := strings.Index(text, "职位详情"); i >= 0 {
		description = text[i+len("职位详情"):]
	} else if i := strings.Index(text, "职位描述"); i >= 0 {
		description = text[i:]
	}
	for _, marker := range []string{"扫码快速投递简历", "公司信息", "企业信息", "投递简历"} {
		if j := strings.Index(description, marker); j >= 0 {
			description = description[:j]
		}
	}
	return location, strings.TrimSpace(description)
}
