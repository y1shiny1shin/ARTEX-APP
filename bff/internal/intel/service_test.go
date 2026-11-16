package intel

import (
	"testing"
	"time"
)

func TestParseFeedTolerantFallsBackForInvalidXML(t *testing.T) {
	body := []byte(`<rss version="2.0"><channel>
	  <item>
	    <title>Test & News</title>
	    <link>https://example.com/a</link>
	    <description>Hello &amp; world</description>
	    <content:encoded><![CDATA[<p>Long body</p>]]></content:encoded>
	    <pubDate>Sat, 14 Nov 2026 17:41:50 +0800</pubDate>
	    <guid>item-1</guid>
	  </item>
	</channel></rss>`)
	items, err := parseFeed("freebuf", "FreeBuf", "article", body)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("items=%d, want 1", len(items))
	}
	item := items[0]
	if item.ID != "freebuf:item-1" || item.URL != "https://example.com/a" {
		t.Fatalf("unexpected item: %+v", item)
	}
	if item.Title != "Test & News" || item.Kind != "article" {
		t.Fatalf("unexpected title/kind: %+v", item)
	}
	if item.PublishedAt.IsZero() {
		t.Fatal("expected published time")
	}
}

func TestParseKEVFiltersOldEntries(t *testing.T) {
	recent := time.Now().Format("2006-01-02")
	body := []byte(`{"vulnerabilities":[
	  {"cveID":"CVE-2026-1111","vendorProject":"Acme","product":"Widget","vulnerabilityName":"RCE",
	   "dateAdded":"` + recent + `","shortDescription":"remote code execution","requiredAction":"patch"},
	  {"cveID":"CVE-2020-2222","vendorProject":"Old","product":"Thing","vulnerabilityName":"Old bug",
	   "dateAdded":"2020-01-01","shortDescription":"old"}
	]}`)
	items, err := parseKEV(body)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(items) != 1 || items[0].CVE != "CVE-2026-1111" {
		t.Fatalf("unexpected items: %+v", items)
	}
	if !items[0].Exploited || items[0].Source != "cisa-kev" {
		t.Fatalf("unexpected KEV flags: %+v", items[0])
	}
}

func TestParseGHSAAdvisory(t *testing.T) {
	body := []byte(`[{
	  "ghsa_id":"GHSA-aaaa-bbbb-cccc","cve_id":"CVE-2026-3333","summary":"Test advisory",
	  "description":"A detailed description","severity":"HIGH","html_url":"https://github.com/advisories/GHSA-aaaa-bbbb-cccc",
	  "published_at":"2026-11-14T10:00:00Z","cvss":{"score":7.5},
	  "vulnerabilities":[{"package":{"name":"example-pkg","ecosystem":"npm"}}]
	}]`)
	items, err := parseGHSA(body)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("items=%d, want 1", len(items))
	}
	item := items[0]
	if item.ID != "ghsa:GHSA-aaaa-bbbb-cccc" || item.CVE != "CVE-2026-3333" {
		t.Fatalf("unexpected item: %+v", item)
	}
	if item.CVSS != 7.5 || item.Severity != "high" || item.Product != "example-pkg" {
		t.Fatalf("unexpected vuln metadata: %+v", item)
	}
}

func TestParseAnquankeHome(t *testing.T) {
	body := []byte(`<ul><li class="item">
	  <a class="item-cover" href="/post/id/316483"><img src="x"></a>
	  <div class="item-main"><div class="title"><a target="_blank" href="/post/id/316483">一个被越狱的AI智能体</a></div>
	  <span class="bottom-item bottom-item-time">2026-11-16 10:00:38</span></div>
	</li><li class="item">
	  <div class="title"><a href="/post/id/316469">大模型狂奔三年</a></div>
	</li></ul>`)
	items, err := parseAnquanke(body)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("items=%d, want 2", len(items))
	}
	if items[0].ID != "anquanke:316483" || items[0].URL != "https://www.anquanke.com/post/id/316483" {
		t.Fatalf("unexpected item: %+v", items[0])
	}
	if items[0].PublishedAt.IsZero() {
		t.Fatalf("expected published time: %+v", items[0])
	}
}
