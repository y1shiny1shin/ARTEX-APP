package jobs

import (
	"strings"
	"testing"
	"time"
)

func testConfig() Config {
	return Config{City: "成都", Keywords: MergeKeywords(nil), MinScore: 45, MaxAgeDays: 30}
}

func TestMatchChengduStateOwnedActiveJob(t *testing.T) {
	now := time.Now()
	result := Match(MatchInput{
		Source: "iguopin", Title: "网络与信息安全工程师",
		Company: "中讯邮电咨询设计院有限公司", Location: "成都-武侯区",
		Description: "负责网络与信息安全、渗透测试、等保与应急响应。",
		Experience:  "应届生", Education: "本科",
		PostedAt: now.AddDate(0, 0, -60), EndsAt: now.AddDate(0, 0, 90),
		StateOwned: true, Now: now,
	}, testConfig())
	if result.Score < 45 {
		t.Fatalf("score=%d, want >=45", result.Score)
	}
	for _, tag := range []string{"成都", "央国企", "在招"} {
		if !contains(result.Tags, tag) {
			t.Fatalf("missing tag %q in %v", tag, result.Tags)
		}
	}
	if !containsReason(result.Reasons, "截止") {
		t.Fatalf("missing deadline reason in %v", result.Reasons)
	}
}

func TestMatchRejectsOtherCity(t *testing.T) {
	result := Match(MatchInput{
		Source: "iguopin", Title: "网络安全工程师", Company: "某安全公司",
		Location: "北京-海淀区", Description: "渗透测试与安全运营",
		Experience: "3-5年", Education: "本科", Now: time.Now(),
	}, testConfig())
	if result.Score != 0 {
		t.Fatalf("score=%d, want 0 for a non-target city", result.Score)
	}
}

func TestMatchMarksSecurityVendor(t *testing.T) {
	now := time.Now()
	result := Match(MatchInput{
		Source: "iguopin", Title: "安全服务工程师", Company: "绿盟科技集团股份有限公司",
		Location: "成都-高新区", Description: "安全服务、渗透测试",
		Experience: "应届生", Education: "本科",
		EndsAt: now.AddDate(0, 0, 30), Now: now,
	}, testConfig())
	if !result.Vendor || !contains(result.Tags, "安全厂商") {
		t.Fatalf("expected vendor tag, got %v", result.Tags)
	}
	if result.StateOwned {
		t.Fatalf("vendor must not be marked state-owned")
	}
}

func TestMatchRemoteJob(t *testing.T) {
	result := Match(MatchInput{
		Source: "remoteok", Title: "Senior Security Engineer", Company: "Acme",
		Location: "远程 · Boston", Description: "Application security and incident response.",
		Remote: true, Now: time.Now(),
	}, testConfig())
	if result.Score < 45 || !contains(result.Tags, "远程") {
		t.Fatalf("score=%d tags=%v, want remote match", result.Score, result.Tags)
	}
}

func contains(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

func containsReason(reasons []string, fragment string) bool {
	for _, reason := range reasons {
		if strings.Contains(reason, fragment) {
			return true
		}
	}
	return false
}

func TestMatchRejectsNonCyberSafetyAndAlgorithmRoles(t *testing.T) {
	now := time.Now()
	inputs := []MatchInput{
		{Source: "ncss", Title: "消防安全工程师", Company: "四川科伦药业", Location: "成都", Description: "负责消防设施与安全生产", Education: "本科", Now: now},
		{Source: "ncss", Title: "算法工程师", Company: "中国电子科技网络信息安全有限公司", Location: "成都", Description: "算法建模与优化", Education: "本科", Now: now},
		{Source: "jobui", Title: "安全工程师", Company: "某能源公司", Location: "成都", Description: "负责消防、环保与生产安全", Education: "本科", Now: now},
	}
	for _, in := range inputs {
		if result := Match(in, testConfig()); result.Score != 0 {
			t.Fatalf("title %q should be rejected, got score=%d", in.Title, result.Score)
		}
	}
}

func TestMatchAmbiguousSecurityTitleNeedsCyberContext(t *testing.T) {
	result := Match(MatchInput{
		Source: "ncss", Title: "安全工程师", Company: "某科技公司",
		Location: "成都", Description: "负责网络安全、渗透测试、等保与应急响应。",
		Education: "本科", Now: time.Now(),
	}, testConfig())
	if result.Score < 45 {
		t.Fatalf("score=%d, want cyber-context match", result.Score)
	}
}
