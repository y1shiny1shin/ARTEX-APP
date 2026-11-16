package httpapi

import (
	"strings"
	"testing"
	"unicode/utf8"
)

func TestCapDetailTruncatesLongText(t *testing.T) {
	raw := map[string]any{"detail": strings.Repeat("安", maxDetailRunes+100)}
	got, _ := capDetail(raw)["detail"].(string)
	if !strings.Contains(got, "已截断") {
		t.Fatalf("expected truncation marker, got %q", got)
	}
	if n := utf8.RuneCountInString(got); n > maxDetailRunes+32 {
		t.Fatalf("truncated detail has %d runes, want <= %d", n, maxDetailRunes+32)
	}
}

func TestCapDetailLeavesShortTextAlone(t *testing.T) {
	raw := map[string]any{"detail": "short"}
	if got, _ := capDetail(raw)["detail"].(string); got != "short" {
		t.Fatalf("detail=%q, want short", got)
	}
	if capDetail(nil) != nil {
		t.Fatal("capDetail(nil) should stay nil")
	}
}
