package httpapi

import (
	"net/http"
	"strings"
)

func (s *Server) taskConversation(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	since := strings.TrimSpace(r.URL.Query().Get("since"))
	raw, err := s.artex.TaskActivity(r.Context(), id, since)
	if err != nil {
		writeErr(w, 502, err.Error())
		return
	}
	// Return the whole task activity stream, not only mainagent rows: planner and
	// worker steps are part of the ARTEX story and many tasks have no mainagent
	// turn at all, which previously made the task conversation tab look empty.
	writeJSON(w, 200, map[string]any{"items": raw["items"], "cursor": raw["cursor"]})
}

func (s *Server) conversations(w http.ResponseWriter, r *http.Request) {
	list, err := s.artex.Conversations(r.Context())
	if err != nil {
		writeErr(w, 502, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"conversations": list})
}

func (s *Server) conversationMessages(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	since := strings.TrimSpace(r.URL.Query().Get("since"))
	raw, err := s.artex.ConversationMessages(r.Context(), id, since)
	if err != nil {
		writeErr(w, 502, err.Error())
		return
	}
	writeJSON(w, 200, raw)
}

func (s *Server) conversationMessageDetail(w http.ResponseWriter, r *http.Request) {
	id, seq := r.PathValue("id"), r.PathValue("seq")
	if strings.TrimSpace(id) == "" || strings.TrimSpace(seq) == "" {
		writeErr(w, 400, "conversation id and seq are required")
		return
	}
	raw, err := s.artex.ConversationMessageDetail(r.Context(), id, seq)
	if err != nil {
		writeErr(w, 502, err.Error())
		return
	}
	writeJSON(w, 200, capDetail(raw))
}

// capDetail keeps a pathological tool output (multi-megabyte HTTP dump, file
// contents) from crossing the phone's network and rendering path. Detail is
// already lazy; this is the final belt-and-braces bound.
const maxDetailRunes = 24000

func capDetail(raw map[string]any) map[string]any {
	if raw == nil {
		return raw
	}
	if detail, ok := raw["detail"].(string); ok {
		runes := []rune(detail)
		if len(runes) > maxDetailRunes {
			raw["detail"] = string(runes[:maxDetailRunes]) + "\n\n…（详情过长，已截断）"
		}
	}
	return raw
}

func (s *Server) taskActivityDetail(w http.ResponseWriter, r *http.Request) {
	id, seq := r.PathValue("id"), r.PathValue("seq")
	if strings.TrimSpace(id) == "" || strings.TrimSpace(seq) == "" {
		writeErr(w, 400, "task id and seq are required")
		return
	}
	raw, err := s.artex.TaskActivityDetail(r.Context(), id, seq)
	if err != nil {
		writeErr(w, 502, err.Error())
		return
	}
	writeJSON(w, 200, capDetail(raw))
}

func (s *Server) sendConversationMessage(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req struct {
		Message string `json:"message"`
	}
	if err := decode(r, &req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	msg := strings.TrimSpace(req.Message)
	if msg == "" {
		writeErr(w, 400, "message is required")
		return
	}
	if len([]rune(msg)) > 4000 {
		writeErr(w, 400, "message too long")
		return
	}
	if err := s.artex.SendConversationMessage(r.Context(), id, msg); err != nil {
		writeErr(w, 502, err.Error())
		return
	}
	d := deviceFrom(r)
	s.store.AppendAudit(d.ID, "artex.conversation.message", digest(id+msg), "sent to conversation "+id)
	writeJSON(w, 200, map[string]any{"ok": true})
}
