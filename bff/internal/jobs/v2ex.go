package jobs

import (
	"context"
	"encoding/json"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/y1shiny1shin/ryagent/bff/internal/store"
)

type v2exTopic struct {
	ID      int    `json:"id"`
	Title   string `json:"title"`
	URL     string `json:"url"`
	Content string `json:"content"`
	Created int64  `json:"created"`
}

var (
	v2exCompanyRE  = regexp.MustCompile(`(?im)^\s*(?:公司|团队|公司名称)[:：]\s*(.+)$`)
	v2exSalaryRE   = regexp.MustCompile(`(\d+\s*[-~]\s*\d+\s*[kK]|\d+\s*[kK]\s*[-~]\s*\d+\s*[kK])`)
	v2exExperience = regexp.MustCompile(`(\d+\s*[-~]?\s*\d*\s*年(?:以上)?(?:安全|研发|渗透|运营)?(?:工作)?经验)`)
	v2exCityList   = []string{"成都", "四川", "北京", "上海", "深圳", "杭州", "广州", "南京", "武汉", "西安", "重庆", "苏州", "长沙", "厦门", "珠海", "远程", "remote"}
)

func (s *Service) crawlV2EX(ctx context.Context) ([]store.JobPosting, []string, error) {
	body, err := s.get(ctx, "https://www.v2ex.com/api/topics/show.json?node_name=jobs", "application/json")
	if err != nil {
		return nil, nil, err
	}
	var topics []v2exTopic
	if err := json.Unmarshal(body, &topics); err != nil {
		return nil, nil, err
	}
	var matched []store.JobPosting
	var processed []string
	for _, topic := range topics {
		id := "v2ex:" + strconv.Itoa(topic.ID)
		if topic.ID == 0 || s.store.HasJobSeen(id) {
			continue
		}
		description := stripHTML(topic.Content)
		location := extractV2EXLocation(topic.Title + "\n" + description)
		remote := location == "远程" || location == "remote"
		company := ""
		if m := v2exCompanyRE.FindStringSubmatch(description); len(m) > 1 {
			company = cleanText(m[1])
		}
		salary := ""
		if m := v2exSalaryRE.FindString(description); m != "" {
			salary = m
		}
		experience := ""
		if m := v2exExperience.FindString(description); m != "" {
			experience = m
		}
		education := ""
		if strings.Contains(description, "本科") {
			education = "本科"
		} else if strings.Contains(description, "硕士") {
			education = "硕士"
		}
		if location == "" {
			// Keep non-target topics out of the store; V2EX only gives the latest
			// ten, so a later refresh naturally drops them.
			continue
		}
		job, ok := s.buildJob(
			"v2ex", strconv.Itoa(topic.ID), topic.Title, company, location,
			salary, experience, education, description, topic.URL,
			time.Unix(topic.Created, 0), time.Time{}, remote, false,
		)
		if ok {
			matched = append(matched, job)
		}
		processed = append(processed, id)
	}
	return matched, processed, nil
}

func extractV2EXLocation(text string) string {
	lower := strings.ToLower(text)
	for _, city := range v2exCityList {
		if strings.Contains(lower, strings.ToLower(city)) {
			return city
		}
	}
	return ""
}
