package httpapi

import (
	"fmt"
	"net/http"
	"strings"
)

func (s *Server) agents(w http.ResponseWriter, r *http.Request) {
	list, err := s.artex.Agents(r.Context())
	if err != nil {
		writeErr(w, 502, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"agents": list})
}

func (s *Server) createTask(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name            string `json:"name"`
		Description     string `json:"description"`
		Goal            string `json:"goal"`
		HardRequirement string `json:"hard_requirement"`
		WorkerCount     int    `json:"worker_count"`
		TimeoutSeconds  int    `json:"timeout_seconds"`
		SeedFirstIntent bool   `json:"seed_first_intent"`
	}
	if err := decode(r, &req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	description := strings.TrimSpace(req.Description)
	if description == "" {
		writeErr(w, 400, "description is required")
		return
	}
	if len([]rune(description)) > 4000 {
		writeErr(w, 400, "description too long")
		return
	}
	if len([]rune(req.Goal)) > 4000 {
		writeErr(w, 400, "goal too long")
		return
	}
	if len([]rune(req.HardRequirement)) > 20000 {
		writeErr(w, 400, "hard_requirement too long")
		return
	}
	if req.WorkerCount < 0 || req.WorkerCount > 50 {
		writeErr(w, 400, "worker_count must be 0-50")
		return
	}
	if req.TimeoutSeconds < 0 {
		writeErr(w, 400, "timeout_seconds must be >= 0")
		return
	}
	payload := map[string]any{
		"description": description,
		"goal":        strings.TrimSpace(req.Goal),
	}
	if name := strings.TrimSpace(req.Name); name != "" {
		payload["name"] = name
	}
	if hard := strings.TrimSpace(req.HardRequirement); hard != "" {
		payload["hard_requirement"] = hard
	}
	if req.WorkerCount > 0 {
		payload["worker_count"] = req.WorkerCount
	}
	if req.TimeoutSeconds > 0 {
		payload["timeout_seconds"] = req.TimeoutSeconds
	}
	if req.SeedFirstIntent {
		payload["seed_first_intent"] = true
	}
	task, err := s.artex.CreateTask(r.Context(), payload)
	if err != nil {
		writeErr(w, 502, err.Error())
		return
	}
	d := deviceFrom(r)
	s.store.AppendAudit(d.ID, "artex.task.create", digest(description), "created task "+taskID(task))
	writeJSON(w, 201, map[string]any{"task": task})
}

func (s *Server) createConversation(w http.ResponseWriter, r *http.Request) {
	var req struct {
		AgentKey string `json:"agent_key"`
		Title    string `json:"title"`
	}
	if err := decode(r, &req); err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	agentKey := strings.TrimSpace(req.AgentKey)
	if agentKey == "" {
		writeErr(w, 400, "agent_key is required")
		return
	}
	if len([]rune(agentKey)) > 120 {
		writeErr(w, 400, "agent_key too long")
		return
	}
	if len([]rune(req.Title)) > 200 {
		writeErr(w, 400, "title too long")
		return
	}
	conversation, err := s.artex.CreateConversation(r.Context(), agentKey, req.Title)
	if err != nil {
		writeErr(w, 502, err.Error())
		return
	}
	d := deviceFrom(r)
	s.store.AppendAudit(d.ID, "artex.conversation.create", digest(agentKey+req.Title), "created conversation for "+agentKey)
	writeJSON(w, 201, map[string]any{"conversation": conversation})
}

func taskID(task map[string]any) string {
	if task == nil || task["id"] == nil {
		return "?"
	}
	return strings.TrimSpace(fmt.Sprint(task["id"]))
}
