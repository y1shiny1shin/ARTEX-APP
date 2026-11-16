package jobs

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/y1shiny1shin/ryagent/bff/internal/store"
)

type remoteOKJob struct {
	ID          any      `json:"id"`
	Slug        string   `json:"slug"`
	Date        string   `json:"date"`
	Company     string   `json:"company"`
	Position    string   `json:"position"`
	Tags        []string `json:"tags"`
	Description string   `json:"description"`
	Location    string   `json:"location"`
	SalaryMin   any      `json:"salary_min"`
	SalaryMax   any      `json:"salary_max"`
	URL         string   `json:"url"`
	ApplyURL    string   `json:"apply_url"`
}

var remoteOKSecurityTerms = []string{
	"security", "infosec", "cyber", "pentest", "soc", "appsec", "vulnerability",
	"threat", "malware", "reverse engineering", "red team", "blue team", "grc",
}

func (s *Service) crawlRemoteOK(ctx context.Context) ([]store.JobPosting, []string, error) {
	body, err := s.get(ctx, "https://remoteok.com/api", "application/json")
	if err != nil {
		return nil, nil, err
	}
	var jobs []remoteOKJob
	if err := json.Unmarshal(body, &jobs); err != nil {
		return nil, nil, err
	}
	var matched []store.JobPosting
	var processed []string
	for _, item := range jobs {
		if item.Position == "" {
			continue
		}
		externalID := strings.TrimSpace(item.Slug)
		if externalID == "" {
			externalID = strings.TrimSpace(fmt.Sprint(item.ID))
		}
		if externalID == "" {
			continue
		}
		id := "remoteok:" + externalID
		if s.store.HasJobSeen(id) {
			continue
		}
		if !remoteOKLooksSecurity(item) {
			continue
		}
		description := stripHTML(item.Description)
		if len(item.Tags) > 0 {
			description += "\n\nTags: " + strings.Join(item.Tags, ", ")
		}
		location := "远程"
		if strings.TrimSpace(item.Location) != "" {
			location = "远程 · " + strings.TrimSpace(item.Location)
		}
		salary := remoteOKSalary(item.SalaryMin, item.SalaryMax)
		url := item.URL
		if url == "" {
			url = item.ApplyURL
		}
		posted := time.Time{}
		if parsed, err := time.Parse(time.RFC3339, item.Date); err == nil {
			posted = parsed
		}
		job, ok := s.buildJob(
			"remoteok", externalID, item.Position, item.Company, location,
			salary, "", "", description, url, posted, time.Time{}, true, false,
		)
		if ok {
			matched = append(matched, job)
		}
		processed = append(processed, id)
	}
	return matched, processed, nil
}

func remoteOKLooksSecurity(item remoteOKJob) bool {
	position := strings.ToLower(item.Position)
	for _, term := range remoteOKSecurityTerms {
		if strings.Contains(position, term) {
			return true
		}
	}
	return false
}

func remoteOKSalary(min, max any) string {
	lo := toInt(min)
	hi := toInt(max)
	switch {
	case lo > 0 && hi > 0 && lo != hi:
		return fmt.Sprintf("$%d-$%d", lo, hi)
	case lo > 0:
		return fmt.Sprintf("$%d+", lo)
	case hi > 0:
		return fmt.Sprintf("$%d+", hi)
	default:
		return ""
	}
}

func toInt(value any) int {
	switch v := value.(type) {
	case float64:
		return int(v)
	case string:
		n, _ := strconv.Atoi(strings.TrimSpace(v))
		return n
	case json.Number:
		n, _ := v.Int64()
		return int(n)
	default:
		return 0
	}
}
