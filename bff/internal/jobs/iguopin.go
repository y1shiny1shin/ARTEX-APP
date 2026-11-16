package jobs

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/y1shiny1shin/ryagent/bff/internal/store"
)

const iguopinEndpoint = "https://gp-api.iguopin.com/api/jobs/v1/recom-job"

var iguopinBaseQueries = []string{
	"网络安全", "渗透测试", "信息安全", "安全运营", "安全工程师",
	"等保", "数据安全", "安全服务", "安全运维", "红队",
}

type iguopinResponse struct {
	Code int    `json:"code"`
	Msg  string `json:"msg"`
	Data struct {
		Total int          `json:"total"`
		List  []iguopinJob `json:"list"`
	} `json:"data"`
}

type iguopinJob struct {
	JobID             any    `json:"job_id"`
	JobName           string `json:"job_name"`
	CompanyName       string `json:"company_name"`
	RecruitmentTypeCN string `json:"recruitment_type_cn"`
	NatureCN          string `json:"nature_cn"`
	MinWage           any    `json:"min_wage"`
	MaxWage           any    `json:"max_wage"`
	WageUnitCN        string `json:"wage_unit_cn"`
	IsNegotiable      bool   `json:"is_negotiable"`
	EducationCN       string `json:"education_cn"`
	ExperienceCN      string `json:"experience_cn"`
	DistrictList      []struct {
		AreaCN string `json:"area_cn"`
	} `json:"district_list"`
	Contents    string `json:"contents"`
	RefreshTime string `json:"refresh_time"`
	UpdateTime  string `json:"update_time"`
	EndTime     string `json:"end_time"`
	CompanyInfo struct {
		NatureCN string `json:"nature_cn"`
	} `json:"company_info"`
}

func iguopinQueries(extra []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, 12)
	add := func(value string) {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] || len(out) >= 10 || !containsCJK(value) {
			return
		}
		seen[value] = true
		out = append(out, value)
	}
	for _, value := range iguopinBaseQueries {
		add(value)
	}
	for _, value := range extra {
		add(value)
	}
	return out
}

func containsCJK(value string) bool {
	for _, r := range value {
		if r >= 0x4e00 && r <= 0x9fff {
			return true
		}
	}
	return false
}

func (s *Service) crawlIguopin(ctx context.Context) ([]store.JobPosting, []string, error) {
	queries := iguopinQueries(s.cfg.Keywords)
	var matched []store.JobPosting
	var processed []string
	seenJobs := map[string]bool{}
	var firstErr error

	for _, query := range queries {
		for page := 1; page <= 4; page++ {
			resp, err := s.iguopinSearch(ctx, query, page, 20)
			if err != nil {
				if firstErr == nil {
					firstErr = err
				}
				break
			}
			if resp.Code != 200 {
				if firstErr == nil {
					firstErr = fmt.Errorf("iguopin %s: code=%d %s", query, resp.Code, resp.Msg)
				}
				break
			}
			for _, item := range resp.Data.List {
				externalID := strings.TrimSpace(fmt.Sprint(item.JobID))
				if externalID == "" || externalID == "<nil>" || seenJobs["iguopin:"+externalID] {
					continue
				}
				id := "iguopin:" + externalID
				seenJobs[id] = true
				if s.store.HasJobSeen(id) {
					continue
				}
				location := ""
				if len(item.DistrictList) > 0 {
					location = cleanText(item.DistrictList[0].AreaCN)
				}
				if !s.targetLocation(location, item.JobName) {
					continue
				}
				desc := item.Contents
				if item.RecruitmentTypeCN != "" {
					desc = "招聘类型：" + item.RecruitmentTypeCN + "\n" + desc
				}
				posted := parseIguopinTime(firstNonEmpty(item.UpdateTime, item.RefreshTime))
				endsAt := parseIguopinTime(item.EndTime)
				job, ok := s.buildJob(
					"iguopin", externalID, item.JobName, item.CompanyName, location,
					iguopinSalary(item), item.ExperienceCN, item.EducationCN,
					desc, "https://www.iguopin.com/job/detail?id="+externalID, posted, endsAt, false, iguopinIsSOE(item),
				)
				if ok {
					matched = append(matched, job)
				}
				processed = append(processed, id)
			}
			if len(resp.Data.List) < 20 {
				break
			}
			time.Sleep(requestGap)
		}
		time.Sleep(requestGap)
	}
	return matched, processed, firstErr
}

func (s *Service) iguopinSearch(ctx context.Context, keyword string, page, pageSize int) (iguopinResponse, error) {
	payload := map[string]any{
		"search": map[string]any{
			"page": page, "page_size": pageSize, "keyword": keyword,
		},
		"recom": map[string]any{
			"update_time": true, "company_nature": true, "hot_job": true,
		},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return iguopinResponse{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, iguopinEndpoint, bytes.NewReader(body))
	if err != nil {
		return iguopinResponse{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/plain, */*")
	req.Header.Set("Origin", "https://www.iguopin.com")
	req.Header.Set("Referer", "https://www.iguopin.com/")
	req.Header.Set("Device", "pc")
	req.Header.Set("Subsite", "iguopin")
	req.Header.Set("Version", "5.2.300")
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36")
	resp, err := s.client.Do(req)
	if err != nil {
		return iguopinResponse{}, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 12<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return iguopinResponse{}, fmt.Errorf("iguopin %s p%d: HTTP %d: %s", keyword, page, resp.StatusCode, truncateRunes(string(raw), 200))
	}
	var out iguopinResponse
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	if err := decoder.Decode(&out); err != nil {
		return iguopinResponse{}, fmt.Errorf("iguopin decode: %w", err)
	}
	return out, nil
}

func iguopinSalary(job iguopinJob) string {
	if job.IsNegotiable {
		return "面议"
	}
	lo, hi := toInt(job.MinWage), toInt(job.MaxWage)
	unit := strings.TrimSpace(job.WageUnitCN)
	if unit == "" {
		unit = "元/月"
	}
	switch {
	case lo > 0 && hi > 0 && lo != hi:
		return fmt.Sprintf("%d-%d%s", lo, hi, unit)
	case lo > 0:
		return fmt.Sprintf("%d%s", lo, unit)
	case hi > 0:
		return fmt.Sprintf("%d%s", hi, unit)
	default:
		return "面议"
	}
}

func parseIguopinTime(value string) time.Time {
	value = strings.TrimSpace(value)
	for _, layout := range []string{"2006-01-02 15:04:05", "2006-01-02 15:04"} {
		if parsed, err := time.ParseInLocation(layout, value, cst); err == nil {
			return parsed
		}
	}
	return time.Time{}
}

func iguopinIsSOE(job iguopinJob) bool {
	nature := job.NatureCN + " " + job.CompanyInfo.NatureCN
	if containsAny(nature, "民营", "私营", "外资", "合资", "上市") {
		return false
	}
	if containsAny(nature, "国企", "央企", "国有", "事业", "机关", "政府") {
		return true
	}
	company := job.CompanyName + " " + job.JobName
	return containsAny(company,
		"中国电子", "中国电科", "中国移动", "中国电信", "中国联通", "中国通服",
		"中国铁塔", "中国邮政", "中国烟草", "中国石油", "中国石化", "中国海油",
		"中国核", "中国航天", "中国航空", "中国船舶", "中国兵器", "中国建筑",
		"中国中铁", "中国铁建", "中国交建", "中国华能", "中国大唐", "中国华电",
		"中国能源", "中国广核", "中国联合网络", "中电", "电科", "国网", "中铁",
		"中核", "中石油", "中石化", "国家能源", "国家电投", "中储粮", "烟草",
		"航天科工", "航天科技", "航空工业", "成飞", "核动力", "东方电气",
		"蜀道", "川投", "四川能投",
	)
}
