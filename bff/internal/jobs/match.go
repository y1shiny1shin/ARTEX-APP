package jobs

import (
	"regexp"
	"strings"
	"time"
)

// Config is the matching profile derived from ~/Downloads/job: Chengdu-based
// security roles, about three years of experience, bachelor degree, central /
// state-owned employers preferred, security vendors slightly down-ranked.
type Config struct {
	City       string
	Keywords   []string
	MinScore   int
	MaxAgeDays int
	Sources    map[string]bool
}

type MatchInput struct {
	Source      string
	Title       string
	Company     string
	Location    string
	Description string
	Experience  string
	Education   string
	Salary      string
	PostedAt    time.Time
	EndsAt      time.Time
	Remote      bool
	StateOwned  bool
	Now         time.Time
}

type MatchResult struct {
	Score      int
	Tags       []string
	Matched    []string
	Reasons    []string
	Remote     bool
	StateOwned bool
	Vendor     bool
}

var defaultKeywords = []string{
	"渗透测试", "安全运营", "信息安全", "网络安全", "安全工程师", "安全服务",
	"安全评估", "安全研发", "安全研究", "安全建设", "安全运维", "安全管理",
	"数据安全", "应用安全", "web安全", "Web安全", "红队", "蓝队", "攻防",
	"护网", "等保", "应急响应", "漏洞挖掘", "漏洞分析", "代码审计", "逆向工程",
	"恶意代码", "威胁情报", "安全产品", "安全开发", "甲方安全", "安全合规",
	"安全咨询", "等级保护", "驻场", "值守",
	"penetration testing", "pentest", "security engineer", "security operations",
	"red team", "blue team", "appsec", "application security",
	"vulnerability research", "malware analysis", "incident response",
	"soc analyst", "threat intelligence", "offensive security",
	"reverse engineering", "security research", "cybersecurity",
	"information security", "security analyst", "security specialist",
	"infosec", "penetration tester", "security consultant", "security architect",
	"security researcher", "application security engineer",
}

var soeKeywords = []string{
	"中国电子", "中国电科", "中国移动", "中国电信", "中国联通", "中国通服",
	"中国铁塔", "中国邮政", "中国烟草", "中国石油", "中国石化", "中国海油",
	"中国核", "中国航天", "中国航空", "中国船舶", "中国兵器", "中国建筑",
	"中国中铁", "中国铁建", "中国交建", "中国华能", "中国大唐", "中国华电",
	"中国能源", "中国广核", "中国联合网络", "中电", "电科", "国网", "中铁",
	"中核", "中石油", "中石化", "中海油", "国家能源", "国家电投",
	"中储粮", "四川航空", "成都燃气", "成都交投", "成都轨道", "成都银行",
	"四川银行", "四川数据", "四川能投", "川投", "蜀道", "东方电气",
	"成飞", "航空工业", "航天", "核动力", "研究院", "国企", "央企",
	"事业单位", "国有资产",
}

var vendorKeywords = []string{
	"奇安信", "绿盟", "深信服", "启明星辰", "天融信", "安恒", "360", "长亭",
	"梆梆", "斗象", "火线", "知道创宇", "腾讯安全", "阿里云安全", "华为安全",
	"新华三", "山石", "亚信", "迪普", "安天", "恒安嘉新", "观安", "默安",
	"青藤", "小佑", "安全厂商", "安服",
}

// Roles that are technically security-adjacent but not what this profile is
// looking for (the source documents target hands-on security engineering).
var negativeRoleKeywords = []string{
	"销售", "大客户", "渠道", "商务", "售前", "产品经理", "市场", "客户经理",
	"招商", "bd", "fpga", "讲师", "培训师", "实习", "法律", "法务", "律师",
}

var negativeSafetyKeywords = []string{
	"消防", "安全生产", "安全员", "ehs", "环保", "职业健康", "功能安全",
	"食品安全", "生产安全", "建筑施工安全",
}

var strongCyberTitleKeywords = []string{
	"网络安全", "信息安全", "渗透", "安全运营", "安全服务", "安全研发",
	"安全研究", "安全评估", "安全运维", "数据安全", "应用安全", "web安全",
	"红队", "攻防", "等保", "漏洞", "代码审计", "安全开发", "安全架构",
	"安全合规", "安全咨询", "安全测试", "安全技术", "安全专家", "安全经理",
	"安全主管", "安全总监", "security", "pentest", "appsec", "soc",
}

var cyberContextKeywords = []string{
	"网络安全", "信息安全", "渗透", "安全运营", "安全服务", "数据安全",
	"应用安全", "web安全", "等保", "漏洞", "代码审计", "攻防", "红队",
	"安全研发", "安全研究", "安全评估", "安全运维", "安全技术", "安全设备",
	"安全防护", "安全体系", "安全合规",
}

func DefaultKeywords() []string {
	out := make([]string, len(defaultKeywords))
	copy(out, defaultKeywords)
	return out
}

func MergeKeywords(extra []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(defaultKeywords)+len(extra))
	for _, list := range [][]string{defaultKeywords, extra} {
		for _, raw := range list {
			kw := strings.TrimSpace(raw)
			if kw == "" {
				continue
			}
			key := strings.ToLower(kw)
			if seen[key] {
				continue
			}
			seen[key] = true
			out = append(out, kw)
		}
	}
	return out
}

// Match scores one posting. A zero score means the posting should be discarded
// (wrong location, no security keyword, or too old).
func Match(in MatchInput, cfg Config) MatchResult {
	result := MatchResult{}
	now := in.Now
	if now.IsZero() {
		now = time.Now()
	}
	city := strings.TrimSpace(cfg.City)
	if city == "" {
		city = "成都"
	}
	locationText := strings.ToLower(in.Location + " " + in.Title)
	remote := in.Remote || containsAny(locationText, "远程", "remote", "anywhere", "worldwide", "全球")
	chengdu := strings.Contains(locationText, strings.ToLower(city)) || strings.Contains(locationText, "成都")
	sichuan := strings.Contains(locationText, "四川")
	if !remote && !chengdu && !sichuan {
		return result
	}
	if cfg.MaxAgeDays > 0 && !in.PostedAt.IsZero() {
		expired := !in.EndsAt.IsZero() && !now.Before(in.EndsAt)
		if expired {
			return result
		}
		// Postings with a future deadline stay eligible even when they were
		// published more than MaxAgeDays ago; they just lose the freshness bonus.
		if in.EndsAt.IsZero() && now.Sub(in.PostedAt) > time.Duration(cfg.MaxAgeDays)*24*time.Hour {
			return result
		}
	}

	edu := lowerNorm(in.Education)
	if (strings.Contains(edu, "硕士") || strings.Contains(edu, "博士")) && !strings.Contains(edu, "本科") {
		return result
	}

	text := strings.ToLower(strings.Join([]string{
		in.Title, in.Company, in.Location, in.Description,
		in.Experience, in.Education, in.Salary,
	}, " "))
	titleLower := strings.ToLower(in.Title)
	if containsAny(titleLower, negativeRoleKeywords...) ||
		containsAny(titleLower, negativeSafetyKeywords...) {
		return result
	}
	// Keep only roles whose title is security-specific, or whose ambiguous
	// "安全工程师" title is backed by cyber context in the description.
	if !containsAny(titleLower, strongCyberTitleKeywords...) {
		if !containsAny(titleLower, "安全", "security", "grc", "compliance") {
			return result
		}
		if !containsAny(text, cyberContextKeywords...) {
			return result
		}
	}

	matched := []string{}
	matchedLower := map[string]bool{}
	for _, kw := range cfg.Keywords {
		key := strings.ToLower(kw)
		if matchedLower[key] {
			continue
		}
		if strings.Contains(text, key) {
			matchedLower[key] = true
			matched = append(matched, kw)
		}
	}
	if len(matched) == 0 {
		return result
	}
	keywordScore := len(matched) * 12
	if keywordScore > 30 {
		keywordScore = 30
	}
	titleBonus := 0
	for key := range matchedLower {
		if strings.Contains(titleLower, key) {
			titleBonus = 8
			break
		}
	}

	score := keywordScore + titleBonus
	reasons := []string{}
	tags := []string{}

	if chengdu {
		score += 25
		tags = append(tags, "成都")
		reasons = append(reasons, "地点：成都")
	} else if remote {
		score += 18
		tags = append(tags, "远程")
		reasons = append(reasons, "远程岗位")
	} else {
		score += 15
		reasons = append(reasons, "地点：四川")
	}
	result.Remote = remote
	if remote && chengdu {
		tags = append(tags, "远程")
		reasons = append(reasons, "支持远程")
	}

	if len(matched) > 0 {
		reasons = append(reasons, "匹配关键词："+strings.Join(limitStrings(matched, 5), "、"))
	}
	result.Matched = limitStrings(matched, 8)

	exp := normalizeExperience(in.Experience)
	if exp == "" || containsAny(exp, "不限", "应届", "1年", "3年及以下", "3-5") {
		score += 8
		if exp != "" {
			reasons = append(reasons, "经验："+in.Experience)
		}
	} else if containsAny(exp, "5-10", "10年") {
		score -= 6
		reasons = append(reasons, "经验偏资深："+in.Experience)
	}
	if strings.Contains(exp, "应届") || containsAny(in.Title+in.Description, "校招", "校园招聘", "2026届", "2027届", "应届") {
		tags = append(tags, "校招")
	}

	if strings.Contains(edu, "本科") {
		score += 5
		tags = append(tags, "本科")
		reasons = append(reasons, "学历：本科")
	} else if containsAny(edu, "不限", "大专") {
		score += 3
	}

	companyText := strings.ToLower(in.Company + " " + in.Title)
	if in.StateOwned {
		score += 15
		result.StateOwned = true
		tags = append(tags, "央国企")
		reasons = append(reasons, "国企/央企岗位")
	} else if containsAny(companyText, soeKeywords...) {
		score += 15
		result.StateOwned = true
		tags = append(tags, "央国企")
		reasons = append(reasons, "央国企 / 甲方")
	} else if containsAny(strings.ToLower(in.Description), "国企", "央企", "事业单位") {
		score += 8
		result.StateOwned = true
		tags = append(tags, "央国企")
		reasons = append(reasons, "描述提到国企背景")
	}
	if containsAny(companyText, vendorKeywords...) {
		score -= 8
		result.Vendor = true
		tags = append(tags, "安全厂商")
		reasons = append(reasons, "安全厂商（降权）")
	}

	if salary := parseSalary(in.Salary); salary > 0 {
		switch {
		case salary >= 20000:
			score += 7
			tags = append(tags, "高薪")
		case salary >= 12000:
			score += 5
		case salary < 8000:
			score -= 5
		}
		reasons = append(reasons, "薪资："+in.Salary)
	}

	if !in.PostedAt.IsZero() {
		days := now.Sub(in.PostedAt).Hours() / 24
		if days <= 7 {
			score += 10
			reasons = append(reasons, "近 7 天发布")
		} else if days <= 30 {
			score += 5
			reasons = append(reasons, "近 30 天发布")
		}
	}
	if !in.EndsAt.IsZero() && now.Before(in.EndsAt) {
		tags = append(tags, "在招")
		reasons = append(reasons, "截止："+in.EndsAt.Format("2006-01-02"))
	}

	switch in.Source {
	case "iguopin":
		score += 5
	case "liepin":
		score += 3
	case "jobui":
		score += 3
	case "ncss":
		score += 5
	case "kanxue":
		score += 5
	case "remoteok":
		score += 2
	}

	if score > 100 {
		score = 100
	}
	if score < 0 {
		score = 0
	}
	result.Score = score
	result.Tags = dedupe(tags)
	result.Reasons = reasons
	return result
}

func normalizeExperience(value string) string {
	value = strings.TrimSpace(value)
	value = strings.ReplaceAll(value, "~", "-")
	value = strings.ReplaceAll(value, "－", "-")
	return value
}

func lowerNorm(value string) string {
	return strings.ToLower(strings.ReplaceAll(strings.TrimSpace(value), "～", "~"))
}

var (
	salaryK = regexp.MustCompile(`(\d+)(?:\s*[-~到]\s*(\d+))?\s*[kK]`)
	salaryW = regexp.MustCompile(`(\d+)(?:\s*[-~到]\s*(\d+))?\s*万`)
)

func parseSalary(value string) int {
	value = strings.TrimSpace(value)
	if value == "" || strings.Contains(value, "面议") {
		return 0
	}
	if m := salaryW.FindStringSubmatch(value); m != nil {
		low, high := atoi(m[1]), atoi(m[2])
		if high == 0 {
			high = low
		}
		return (low + high) * 10000 / 2
	}
	if m := salaryK.FindStringSubmatch(value); m != nil {
		low, high := atoi(m[1]), atoi(m[2])
		if high == 0 {
			high = low
		}
		return (low + high) * 1000 / 2
	}
	return 0
}

func atoi(value string) int {
	n := 0
	for _, ch := range value {
		if ch < '0' || ch > '9' {
			break
		}
		n = n*10 + int(ch-'0')
	}
	return n
}

func containsAny(value string, needles ...string) bool {
	for _, needle := range needles {
		if needle != "" && strings.Contains(value, strings.ToLower(needle)) {
			return true
		}
	}
	return false
}

func limitStrings(values []string, max int) []string {
	if len(values) <= max {
		return values
	}
	return values[:max]
}

func dedupe(values []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(values))
	for _, value := range values {
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}
	return out
}
