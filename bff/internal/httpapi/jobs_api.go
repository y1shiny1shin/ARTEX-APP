package httpapi

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	jobfeed "github.com/y1shiny1shin/ryagent/bff/internal/jobs"
	"github.com/y1shiny1shin/ryagent/bff/internal/store"
)

type jobSummary struct {
	ID         string    `json:"id"`
	Source     string    `json:"source"`
	Title      string    `json:"title"`
	Company    string    `json:"company"`
	Location   string    `json:"location"`
	Salary     string    `json:"salary"`
	Experience string    `json:"experience"`
	Education  string    `json:"education"`
	Summary    string    `json:"summary"`
	URL        string    `json:"url"`
	PostedAt   time.Time `json:"posted_at"`
	EndsAt     time.Time `json:"ends_at"`
	FirstSeen  time.Time `json:"first_seen"`
	Score      int       `json:"score"`
	Tags       []string  `json:"tags,omitempty"`
	Matched    []string  `json:"matched,omitempty"`
	Reasons    []string  `json:"reasons,omitempty"`
	Remote     bool      `json:"remote"`
	StateOwned bool      `json:"state_owned"`
	Vendor     bool      `json:"vendor"`
}

func jobSummaryOf(job store.JobPosting) jobSummary {
	return jobSummary{
		ID: job.ID, Source: job.Source, Title: job.Title, Company: job.Company,
		Location: job.Location, Salary: job.Salary, Experience: job.Experience,
		Education: job.Education, Summary: job.Summary, URL: job.URL,
		PostedAt: job.PostedAt, EndsAt: job.EndsAt, FirstSeen: job.FirstSeen, Score: job.Score,
		Tags: job.Tags, Matched: job.Matched, Reasons: job.Reasons,
		Remote: job.Remote, StateOwned: job.StateOwned, Vendor: job.Vendor,
	}
}

func (s *Server) jobsFeed(w http.ResponseWriter, r *http.Request) {
	limit := 200
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 300 {
			limit = n
		}
	}
	jobs := []store.JobPosting{}
	updated := time.Time{}
	cfg := jobfeed.Config{City: "成都"}
	sources := []string{}
	if s.jobs != nil {
		jobs = s.jobs.Jobs(300)
		updated = s.jobs.UpdatedAt()
		cfg = s.jobs.Config()
		sources = s.jobs.SourceList()
	}
	summaries := make([]jobSummary, 0, len(jobs))
	chengdu, remote, stateOwned, vendor, fresh := 0, 0, 0, 0, 0
	for _, job := range jobs {
		if len(summaries) < limit {
			summaries = append(summaries, jobSummaryOf(job))
		}
		if job.Remote {
			remote++
		}
		if strings.Contains(job.Location, "成都") || hasTag(job.Tags, "成都") {
			chengdu++
		}
		if job.StateOwned {
			stateOwned++
		}
		if job.Vendor {
			vendor++
		}
		if !job.FirstSeen.IsZero() && time.Since(job.FirstSeen) <= 24*time.Hour {
			fresh++
		}
	}
	writeJSON(w, 200, map[string]any{
		"jobs":       summaries,
		"updated_at": updated,
		"city":       cfg.City,
		"keywords":   cfg.Keywords,
		"sources":    sources,
		"counts": map[string]any{
			"total": len(jobs), "new_24h": fresh, "chengdu": chengdu,
			"remote": remote, "state_owned": stateOwned, "vendor": vendor,
		},
	})
}

func (s *Server) jobDetail(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		writeErr(w, 400, "job id is required")
		return
	}
	job, ok := s.jobs.Job(id)
	if !ok {
		writeErr(w, 404, "job not found")
		return
	}
	writeJSON(w, 200, job)
}

func (s *Server) jobsRefresh(w http.ResponseWriter, r *http.Request) {
	added, err := s.jobs.Refresh(r.Context())
	if err != nil {
		writeErr(w, 502, err.Error())
		return
	}
	d := deviceFrom(r)
	s.store.AppendAudit(d.ID, "jobs.refresh", "", strconv.Itoa(added)+" new")
	writeJSON(w, 200, map[string]any{"added": added})
}

func hasTag(tags []string, tag string) bool {
	for _, value := range tags {
		if value == tag {
			return true
		}
	}
	return false
}
