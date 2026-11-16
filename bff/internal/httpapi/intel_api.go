package httpapi

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/y1shiny1shin/ryagent/bff/internal/store"
)

func (s *Server) intelFeed(w http.ResponseWriter, r *http.Request) {
	limit := 200
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 500 {
			limit = n
		}
	}
	kind := strings.TrimSpace(r.URL.Query().Get("kind"))
	source := strings.TrimSpace(r.URL.Query().Get("source"))

	all := []store.IntelItem{}
	updated := time.Time{}
	labels := map[string]string{}
	refreshMinutes := 30
	if s.intel != nil {
		all = s.intel.Feed(500)
		updated = s.intel.UpdatedAt()
		labels = s.intel.SourceLabels()
		refreshMinutes = s.intel.RefreshMinutes()
	}
	items := make([]store.IntelItem, 0, limit)
	counts := map[string]int{"total": 0, "articles": 0, "vulns": 0, "new_24h": 0, "exploited": 0}
	for _, item := range all {
		counts["total"]++
		if item.Kind == "article" {
			counts["articles"]++
		} else {
			counts["vulns"]++
		}
		if item.Exploited {
			counts["exploited"]++
		}
		if !item.FirstSeen.IsZero() && time.Since(item.FirstSeen) <= 24*time.Hour {
			counts["new_24h"]++
		}
		if kind != "" && kind != "all" && item.Kind != kind {
			continue
		}
		if source != "" && item.Source != source {
			continue
		}
		if len(items) < limit {
			items = append(items, item)
		}
	}
	type sourceInfo struct {
		Key   string `json:"key"`
		Label string `json:"label"`
	}
	sources := make([]sourceInfo, 0, len(labels))
	for key, label := range labels {
		sources = append(sources, sourceInfo{Key: key, Label: label})
	}
	writeJSON(w, 200, map[string]any{
		"items": items, "sources": sources, "counts": counts, "updated_at": updated,
		"refresh_minutes": refreshMinutes,
	})
}

func (s *Server) intelRefresh(w http.ResponseWriter, r *http.Request) {
	if s.intel == nil {
		writeErr(w, 503, "intel service not configured")
		return
	}
	added, err := s.intel.Refresh(r.Context())
	if err != nil {
		writeErr(w, 502, err.Error())
		return
	}
	d := deviceFrom(r)
	s.store.AppendAudit(d.ID, "intel.refresh", "", strconv.Itoa(added)+" new")
	writeJSON(w, 200, map[string]any{"added": added})
}
