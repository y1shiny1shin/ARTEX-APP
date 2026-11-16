package jobs

import (
	"strings"
	"testing"
)

func TestParseKanxueList(t *testing.T) {
	html := `
<div class="pos-list-item">
  <div class="pos-info">
    <div class="pos-title"><a href="position-read-1451.htm">Web安全/渗透测试工程师</a></div>
    <div class="pos-meta">
      <span class="d-inline d-md-none">成都&nbsp;&nbsp;</span>
      <span class="d-none d-md-inline"><i class="icon icon-map-marker"></i> 成都&nbsp;&nbsp;</span>
      <span class="">3-5年</span>&nbsp;/&nbsp;<span class="">本科</span>
    </div>
    <div class="pos-date"><span class="d-none d-md-inline">2026-11-03 18:17</span></div>
  </div>
  <div class="pos-salary"><span>15-25k</span></div>
  <div class="pos-company d-none d-md-flex">
    <div class="pos-company-info">
      <div class="pos-company-name"><a href="company-read-1.htm">成都安全科技有限公司</a></div>
    </div>
  </div>
</div>`
	items := parseKanxueList([]byte(html))
	if len(items) != 1 {
		t.Fatalf("items=%d, want 1", len(items))
	}
	item := items[0]
	if item.ID != "1451" || item.Title != "Web安全/渗透测试工程师" {
		t.Fatalf("unexpected item: %+v", item)
	}
	if item.Location != "成都" || item.Experience != "3-5年" || item.Education != "本科" {
		t.Fatalf("unexpected meta: %+v", item)
	}
	if item.Salary != "15-25k" || item.Company != "成都安全科技有限公司" {
		t.Fatalf("unexpected company/salary: %+v", item)
	}
	if item.PostedAt.IsZero() {
		t.Fatal("expected posted time")
	}
}

func TestParseKanxueDetail(t *testing.T) {
	html := `
<h3 class="pos-title">Web安全/渗透测试工程师</h3>
<div class="pos-meta"><span><i class="icon icon-map-marker"></i> 成都 - 高新区</span></div>
<span class="pos-salary"><span>15-25k</span></span>
<span class="pos-exp-degree"><span class="">3-5年</span>&nbsp;/&nbsp;<span class="">本科</span></span>
<div class="pos-date">发布于 <span>2026-11-03 18:17</span></div>
<div class="job-desc-title">职位描述</div>
<div class="job-desc">
  【岗位职责】<br />负责渗透测试与漏洞挖掘。
  【任职要求】<br />本科，3年以上安全经验。
</div>
<div class="co-sidebar-name"><a href="company-read-1.htm">成都安全科技有限公司</a></div>`
	detail := parseKanxueDetail([]byte(html))
	if detail.Title != "Web安全/渗透测试工程师" || detail.Company != "成都安全科技有限公司" {
		t.Fatalf("unexpected detail: %+v", detail)
	}
	if !strings.Contains(detail.Location, "成都") || detail.Salary != "15-25k" {
		t.Fatalf("unexpected detail meta: %+v", detail)
	}
	if detail.Experience != "3-5年" || detail.Education != "本科" {
		t.Fatalf("unexpected exp/edu: %+v", detail)
	}
	if !strings.Contains(detail.Description, "渗透测试") {
		t.Fatalf("description=%q", detail.Description)
	}
}
