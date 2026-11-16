package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/y1shiny1shin/ryagent/bff/internal/artex"
	"github.com/y1shiny1shin/ryagent/bff/internal/conductor"
	githubfeed "github.com/y1shiny1shin/ryagent/bff/internal/github"
	"github.com/y1shiny1shin/ryagent/bff/internal/httpapi"
	"github.com/y1shiny1shin/ryagent/bff/internal/intel"
	jobfeed "github.com/y1shiny1shin/ryagent/bff/internal/jobs"
	"github.com/y1shiny1shin/ryagent/bff/internal/store"
)

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func main() {
	addr := env("RYAGENT_ADDR", ":8788")
	dataDir := env("RYAGENT_DATA", "./data")
	ownerPassword := os.Getenv("RYAGENT_OWNER_PASSWORD")
	if ownerPassword == "" {
		log.Fatal("RYAGENT_OWNER_PASSWORD is required (device pairing password)")
	}
	statePath := filepath.Join(dataDir, "state.json")
	st, err := store.Open(statePath)
	if err != nil {
		log.Fatalf("open store: %v", err)
	}
	ac := artex.New(
		env("ARTEX_BASE_URL", "http://127.0.0.1:8787"),
		os.Getenv("ARTEX_TOKEN"),
		env("ARTEX_USERNAME", "ARTEX"),
		os.Getenv("ARTEX_PASSWORD"),
	)
	ds := conductor.New(
		env("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
		os.Getenv("DEEPSEEK_API_KEY"),
		env("DEEPSEEK_MODEL", "deepseek-chat"),
	)
	minutes, _ := strconv.Atoi(env("GITHUB_REFRESH_MINUTES", "4320"))
	gh := githubfeed.New(
		st,
		os.Getenv("GITHUB_TOKEN"),
		os.Getenv("GITHUB_PROXY"),
		env("GITHUB_OWNER", "y1shiny1shin"),
		minutes,
		os.Getenv("GITHUB_EVENT_TYPES"),
		os.Getenv("GITHUB_IGNORE_USERS"),
	)
	gh.Start(context.Background())

	jobHours, _ := strconv.Atoi(env("JOB_REFRESH_HOURS", "72"))
	jobMin, _ := strconv.Atoi(env("JOB_MIN_SCORE", "45"))
	jobAge, _ := strconv.Atoi(env("JOB_MAX_AGE_DAYS", "30"))
	js := jobfeed.New(
		st,
		os.Getenv("JOB_PROXY"),
		jobHours,
		env("JOB_CITY", "成都"),
		os.Getenv("JOB_KEYWORDS"),
		jobMin,
		jobAge,
		os.Getenv("JOB_SOURCES"),
	)
	js.Start(context.Background())

	intelMinutes, _ := strconv.Atoi(env("INTEL_REFRESH_MINUTES", "4320"))
	is := intel.New(st, os.Getenv("INTEL_PROXY"), os.Getenv("GITHUB_TOKEN"), intelMinutes, os.Getenv("INTEL_SOURCES"))
	is.Start(context.Background())

	srv := httpapi.New(st, ac, gh, js, is, ds, ownerPassword)
	httpSrv := &http.Server{
		Addr:              addr,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Printf("RyAgent BFF listening on %s (data=%s, artex=%s, deepseek=%v)", addr, statePath, ac.BaseURL(), ds.Configured())
	if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("serve: %v", err)
	}
}
