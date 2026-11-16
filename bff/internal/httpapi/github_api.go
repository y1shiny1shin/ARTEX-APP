package httpapi

import (
	"net/http"
	"strconv"
)

func (s *Server) githubFeed(w http.ResponseWriter, r *http.Request) {
	limit := 80
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}
	items := []any{}
	owner := ""
	following := 0
	tokenConfigured := false
	refreshMinutes := 60
	if s.github != nil {
		for _, item := range s.github.Feed(limit) {
			items = append(items, item)
		}
		owner = s.github.Owner()
		following = s.github.FollowingCount()
		tokenConfigured = s.github.TokenConfigured()
		refreshMinutes = s.github.RefreshMinutes()
	}
	writeJSON(w, 200, map[string]any{
		"items": items, "owner": owner, "following": following,
		"token_configured": tokenConfigured, "refresh_minutes": refreshMinutes,
	})
}

func (s *Server) githubRefresh(w http.ResponseWriter, r *http.Request) {
	if s.github == nil {
		writeErr(w, 503, "github feed not configured")
		return
	}
	added, err := s.github.Refresh(r.Context())
	if err != nil {
		writeErr(w, 502, err.Error())
		return
	}
	d := deviceFrom(r)
	s.store.AppendAudit(d.ID, "github.refresh", "", strconv.Itoa(added)+" new")
	writeJSON(w, 200, map[string]any{"added": added})
}
