param(
  [string]$ReviewDate
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not $ReviewDate) {
  $tz = [System.TimeZoneInfo]::FindSystemTimeZoneById('China Standard Time')
  $ReviewDate = [System.TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $tz).ToString('yyyy-MM-dd')
}

$ledgerPath = Join-Path $root 'ledger.json'
$ledger = Get-Content -LiteralPath $ledgerPath -Raw -Encoding UTF8 | ConvertFrom-Json

function RichExample([string]$meaning, [string]$explanation, [string]$usageTip, [object[]]$examples) {
  return ([pscustomobject]@{ meaning=$meaning; explanation=$explanation; usageTip=$usageTip; examples=$examples } | ConvertTo-Json -Compress -Depth 5)
}
function Item([string]$id, [string]$type, [string]$key, [string]$cue, [string]$answer, [string]$meaning, [string]$explanation, [string]$tip, [object[]]$examples, [string]$source, [int]$occurrences, [string]$priority, [string]$due, [string]$shown) {
  return [pscustomobject]@{ id=$id; type=$type; normalized_key=$key; cue=$cue; answer=$answer; example=(RichExample $meaning $explanation $tip $examples); source_chat=$source; occurrences=$occurrences; priority=$priority; status='learning'; attempts=0; correct=0; next_due=$due; last_shown=$shown; review_stage=0; correct_streak=0; last_result=$null; last_answered_at=$null; pending_answer=$true }
}
function Examples([string]$a,[string]$b,[string]$c,[string]$d,[string]$e,[string]$f,[string]$g,[string]$h,[string]$i,[string]$j,[string]$k,[string]$l) {
  return @([pscustomobject]@{scenario=$a;english=$b;chinese=$c},[pscustomobject]@{scenario=$d;english=$e;chinese=$f},[pscustomobject]@{scenario=$g;english=$h;chinese=$i},[pscustomobject]@{scenario=$j;english=$k;chinese=$l})
}

# Old multi-point records are split into independently schedulable items before selection.
$old = @{}
foreach ($i in $ledger.items) { $old[$i.id] = $i }
($old['v-carve-valid']).normalized_key = 'valid feelings concerns'
($old['v-carve-valid']).cue = '用 valid 表达【感受或担心是合理且值得认可的】'
($old['v-carve-valid']).answer = 'valid = 合理的、有根据的；谈感受时表示值得被理解和认可。'
($old['v-insist-persist']).normalized_key = 'insist on doing'
($old['v-insist-persist']).cue = '用 insist on doing 表达【坚持要求或主张做某事】'
($old['v-insist-persist']).answer = 'insist on doing = 坚持要求或主张做某事。'
($old['v-wrap-sum']).normalized_key = 'wrap up an activity'
($old['v-wrap-sum']).cue = '用 wrap up 表达【结束一项活动或谈话】'
($old['v-wrap-sum']).answer = 'wrap up = 结束一项活动、谈话或会议。'
($old['v-grounded-weigh-against']).normalized_key = 'keep someone grounded'
($old['v-grounded-weigh-against']).cue = '用 keep someone grounded 表达【让人保持现实、脚踏实地】'
($old['v-grounded-weigh-against']).answer = 'keep someone grounded = 让某人保持现实、脚踏实地。'
($old['e-verb-forms']).normalized_key = 'to plus base verb'
($old['e-verb-forms']).cue = '纠正 to reported：to 后接动词原形'
($old['e-verb-forms']).answer = 'to + 动词原形：to report，不说 to reported。'

($old['v-carve-valid']).example = RichExample '合理的、有根据的；谈感受时表示值得被理解和认可。' 'valid 不只表示证件或票据有效。描述 feelings、concerns 或 reasons 时，它表示这些感受、担心或理由有合理依据。' '常用：Your feelings are valid / That is a valid concern。valid 不等于一定正确，而是表示有合理依据。' (Examples '工作沟通' 'Your concern about the deadline is valid.' '你对截止日期的担心是合理的。' '家庭生活' 'It is valid to feel upset when nobody listens to you.' '没人听你说话时感到难过是可以理解的。' '英语学习' 'Her fear of speaking English is valid, but practice will help.' '她害怕说英语是可以理解的，但练习会有帮助。' '购物售后' 'That is a valid reason to return a damaged product.' '商品损坏是合理的退货理由。')
($old['v-insist-persist']).example = RichExample '坚持要求或主张做某事。' 'insist on 强调态度坚定：你要求某事发生，或坚持自己的做法。' '后接名词或动名词：insist on doing；它不表示单纯长期坚持，那个意思更适合 persist in 或 keep doing。' (Examples '工作会议' 'She insisted on testing the feature before release.' '她坚持要求在发布前测试这个功能。' '家庭生活' 'My dad insisted on paying for dinner.' '我爸爸坚持要付晚餐的钱。' '英语学习' 'I insist on reviewing new words every day.' '我坚持每天复习新单词。' '出行安排' 'They insisted on taking the earlier train.' '他们坚持坐更早的那班火车。')
($old['v-wrap-sum']).example = RichExample '结束一项活动、谈话或会议。' 'wrap up 关注把事情收尾并结束，不强调复述内容。' '需要【总结要点】时用 sum up；需要【结束会议】时用 wrap up。' (Examples '工作会议' 'Let us wrap up the meeting by five.' '我们五点前结束会议吧。' '家庭生活' 'I need to wrap up dinner before the kids get home.' '孩子回家前我得把晚饭收尾。' '英语学习' 'We wrapped up the lesson with a short speaking task.' '我们用一个简短口语任务结束了课程。' '电话沟通' 'I have another call, so I should wrap this up.' '我还有另一个电话，所以该结束这次通话了。')
($old['v-grounded-weigh-against']).example = RichExample '让某人保持现实、脚踏实地。' 'grounded 在这里不是【接地】，而是冷静、务实，不被不切实际的想法带走。' '常说 keep someone grounded；形容自己可说 stay grounded。' (Examples '职业选择' 'My savings keep me grounded when I think about changing jobs.' '当我考虑换工作时，存款让我保持现实。' '家庭生活' 'Talking with my parents keeps me grounded.' '和父母聊天让我保持脚踏实地。' '英语学习' 'Small weekly goals keep me grounded.' '小的每周目标让我保持务实。' '购物消费' 'My budget keeps me grounded before a big sale.' '大促前预算让我保持理性。')
($old['e-verb-forms']).example = RichExample 'to 后接动词原形。' '不定式标记 to 后面用动词原形，所以是 to report，不是 to reported。' '这条只适用于不定式 to；介词 to 后可接动名词，如 look forward to meeting you。' (Examples '工作汇报' 'He joined the meeting to report the results.' '他参加会议是为了汇报结果。' '家庭计划' 'We decided to visit my grandparents this weekend.' '我们决定这周末去看望祖父母。' '英语学习' 'I want to improve my pronunciation.' '我想提高发音。' '出行安排' 'She called to confirm the booking.' '她打电话确认预订。')

$newItems = @(
  (Item 'v-persist-in' 'vocabulary' 'persist in doing' '用 persist in doing 表达【尽管困难仍持续做某事】' 'persist in doing = 尽管困难或反对仍持续做某事。' '尽管困难仍持续做某事。' 'persist in 的重点是遇到阻力也不放弃，语气比 keep doing 更正式。' '后接动名词：persist in doing。不要说 persist to do；日常口语常用 keep doing。' (Examples '工作项目' 'He persisted in fixing the bug after several failed attempts.' '几次失败后，他仍坚持修复这个漏洞。' '家庭生活' 'She persisted in teaching her child to ride a bike.' '她坚持教孩子骑自行车。' '英语学习' 'I persisted in speaking English even when I made mistakes.' '即使犯错，我仍坚持说英语。' '健身计划' 'They persisted in training through the rainy season.' '他们在雨季仍坚持训练。') 'Meaning in Chinese' 6 'high' '2026-08-07' '2026-08-10'),
  (Item 'v-sum-up' 'vocabulary' 'sum up key points' '用 sum up 表达【概括要点】' 'sum up = 概括、总结主要内容。' '概括、总结主要内容。' 'sum up 是把信息压缩成主要结论，不是结束活动本身。' '常说 sum up the main points；结束会议本身用 wrap up。' (Examples '工作会议' 'Can you sum up the decision for the team?' '你能为团队概括一下这个决定吗？' '家庭沟通' 'Let me sum up what we need to buy.' '我来总结一下我们需要买什么。' '英语学习' 'At the end of class, she summed up the grammar rule.' '课结束时，她总结了这条语法规则。' '旅行计划' 'He summed up the route in two minutes.' '他用两分钟概括了路线。') 'English word review' 2 'medium' '2026-08-10' '2026-08-10'),
  (Item 'v-weigh-options-against' 'vocabulary' 'weigh A against B' '用 weigh A against B 表达【权衡两个选择】' 'weigh A against B = 权衡 A 与 B。' '权衡 A 与 B。' 'weigh 在这里是认真比较两边的好处、风险或代价后再决定。' '结构是 weigh A against B；不要用 weigh A with B。' (Examples '职业选择' 'I am weighing a higher salary against more free time.' '我在权衡更高薪水和更多自由时间。' '家庭决定' 'We weighed moving closer to school against a longer commute.' '我们在权衡搬到离学校近的地方和更长的通勤。' '英语学习' 'She weighed speed against accuracy during the speaking test.' '她在口语考试中权衡速度与准确性。' '购物选择' 'I weighed the lower price against the shorter warranty.' '我在权衡较低价格和较短保修期。') 'Economic marketing concerns' 3 'medium' '2026-08-10' '2026-08-10'),
  (Item 'e-instead-of-gerund' 'error' 'instead of plus gerund' '纠正 instead of focus：instead of 后接动名词' 'instead of + doing：instead of focusing。' 'instead of 后接动名词。' 'instead of 表示【而不是】，后面接动作时用 -ing 形式。' '不要说 instead of focus；若后面是名词则直接接名词，如 instead of coffee。' (Examples '工作安排' 'Try testing the feature instead of guessing.' '试着测试这个功能，而不是猜测。' '家庭生活' 'We cooked at home instead of ordering food.' '我们在家做饭，而不是点外卖。' '英语学习' 'Practice speaking instead of only reading.' '练习说，而不是只读。' '出行选择' 'She walked instead of taking a taxi.' '她走路，而不是坐出租车。') 'multiple' 4 'high' '2026-08-10' '2026-08-10'),
  (Item 'e-present-perfect-progressive-try' 'error' 'have been trying to do' '表达【这段时间一直在尝试减肥】' 'I have been trying to lose weight. ' '这段时间一直在尝试做某事。' 'have been trying 表示从过去开始、持续到现在的一段努力；这里用 lose weight，不说 lost the weight。' '结构：have/has been trying to + 动词原形。' (Examples '健康管理' 'I have been trying to lose weight for two weeks.' '我两周来一直在尝试减肥。' '工作项目' 'We have been trying to solve this problem since Monday.' '从周一开始我们一直在尝试解决这个问题。' '英语学习' 'She has been trying to speak more confidently.' '她一直在尝试更自信地说英语。' '家庭生活' 'I have been trying to sleep earlier this month.' '这个月我一直在尝试早点睡。') 'multiple' 4 'high' '2026-08-10' '2026-08-10')
)

foreach ($n in $newItems) { if (-not $old.ContainsKey($n.id)) { $ledger.items += $n; $old[$n.id] = $n } }
$selectedIds = @('v-carve-valid','v-insist-persist','v-persist-in','v-wrap-sum','v-sum-up','v-grounded-weigh-against','v-weigh-options-against','e-verb-forms','e-instead-of-gerund','e-present-perfect-progressive-try')
$selected = @($selectedIds | ForEach-Object { $old[$_] })
foreach ($item in $selected) {
  $item.last_shown = $ReviewDate
  if ($item.PSObject.Properties.Name -contains 'pending_answer') { $item.pending_answer = $true }
  else { $item | Add-Member -NotePropertyName pending_answer -NotePropertyValue $true }
}
$ledger.last_generated_date = $ReviewDate

$md = @"
# ☀️ 今日口语复习｜$ReviewDate

## 先别看答案

1. 中译英：你的担心是合理的。
2. 中译英：她坚持要求在发布前测试这个功能。
3. 中译英：即使犯错，我仍坚持说英语。
4. 中译英：我们五点前结束会议吧。
5. 纠错：I persist on studying English even when it is hard.
6. 纠错：Let's sum up the meeting now.（你的意思是【结束会议】，不是【总结要点】）
7. 听力/连读：快速说 *We need to wrap up the meeting.*；注意 *to* 常弱读成 /tə/。你能听出并复述 **wrap up** 吗？

## 地道表达替换

- 你想说【我在权衡更高薪水和更多自由时间】。
- 你想说【我两周来一直在尝试减肥】。

## 口语挑战

用 30–60 秒说说你最近在做的一件需要坚持的事。至少用两个今日项，例如 **persist in**、**keep me grounded**、**weigh A against B** 或 **have been trying to**。

## 答案与提示

### 1. valid

- 中文核心含义：合理的、有根据的；谈感受时表示值得被理解和认可。
- 通俗解释：它不只说证件【有效】。描述感受、担心或理由时，表示有合理依据。
- 生活场景例句：工作：Your concern about the deadline is valid.（你对截止日期的担心是合理的。）家庭：It is valid to feel upset when nobody listens to you.（没人听你说话时感到难过是可以理解的。）学习：Her fear of speaking English is valid, but practice will help.（她害怕说英语是可以理解的，但练习会有帮助。）
- 易混 / 使用提示：valid 不等于【一定正确】；它表示有合理依据。

### 2. insist on doing

- 中文核心含义：坚持要求或主张做某事。
- 通俗解释：强调你对一个安排或做法态度坚定。
- 生活场景例句：工作：She insisted on testing the feature before release.（她坚持要求发布前测试功能。）家庭：My dad insisted on paying for dinner.（我爸爸坚持付晚餐的钱。）学习：I insist on reviewing new words every day.（我坚持每天复习新词。）
- 易混 / 使用提示：后接名词或动名词；长期不放弃更常用 persist in 或 keep doing。

### 3. persist in doing

- 中文核心含义：尽管困难仍持续做某事。
- 通俗解释：突出有阻力也不放弃，语气比 keep doing 更正式。
- 生活场景例句：工作：He persisted in fixing the bug after several failed attempts.（多次失败后他仍坚持修 bug。）家庭：She persisted in teaching her child to ride a bike.（她坚持教孩子骑车。）学习：I persisted in speaking English even when I made mistakes.（即使犯错我仍坚持说英语。）
- 易混 / 使用提示：说 persist in doing，不说 persist to do。

### 4. wrap up

- 中文核心含义：结束一项活动、谈话或会议。
- 通俗解释：重点是收尾结束，不是复述内容。
- 生活场景例句：工作：Let us wrap up the meeting by five.（我们五点前结束会议吧。）家庭：I need to wrap up dinner before the kids get home.（孩子回家前我得把晚饭收尾。）电话：I have another call, so I should wrap this up.（我还有电话，该结束这次通话了。）
- 易混 / 使用提示：总结要点用 sum up；结束会议用 wrap up。

### 5. sum up

- 中文核心含义：概括、总结主要内容。
- 通俗解释：把许多信息压缩成关键结论。
- 生活场景例句：工作：Can you sum up the decision for the team?（你能为团队概括这个决定吗？）家庭：Let me sum up what we need to buy.（我总结一下需要买什么。）学习：She summed up the grammar rule at the end of class.（课末她总结了语法规则。）
- 易混 / 使用提示：sum up 不等于结束活动；结束活动用 wrap up。

### 6. keep someone grounded

- 中文核心含义：让某人保持现实、脚踏实地。
- 通俗解释：表示冷静务实，不被不切实际的想法带走。
- 生活场景例句：职业：My savings keep me grounded when I think about changing jobs.（考虑换工作时，存款让我保持现实。）家庭：Talking with my parents keeps me grounded.（和父母聊天让我脚踏实地。）购物：My budget keeps me grounded before a big sale.（大促前预算让我保持理性。）
- 易混 / 使用提示：常说 keep someone grounded；描述自己可说 stay grounded。

### 7. weigh A against B

- 中文核心含义：权衡 A 与 B。
- 通俗解释：认真比较两边的好处、风险或代价后再决定。
- 生活场景例句：职业：I am weighing a higher salary against more free time.（我在权衡更高薪水和更多自由时间。）家庭：We weighed moving closer to school against a longer commute.（我们权衡离学校近和更长通勤。）购物：I weighed the lower price against the shorter warranty.（我权衡较低价格和较短保修。）
- 易混 / 使用提示：固定结构 weigh A against B，不说 weigh A with B。

### 8. to + 动词原形

- 中文核心含义：to 后接动词原形。
- 通俗解释：不定式中的 to 后面不能用过去式。
- 生活场景例句：工作：He joined the meeting to report the results.（他参会是为了汇报结果。）家庭：We decided to visit my grandparents.（我们决定去看望祖父母。）学习：I want to improve my pronunciation.（我想提高发音。）
- 易混 / 使用提示：这是不定式 to；介词 to 后可接动名词，如 look forward to meeting you。

### 9. instead of + doing

- 中文核心含义：instead of 后接动名词。
- 通俗解释：表达【而不是做某事】时，把动作变成 -ing 形式。
- 生活场景例句：工作：Try testing the feature instead of guessing.（试着测试功能，而不是猜。）家庭：We cooked at home instead of ordering food.（我们在家做饭而不是点外卖。）学习：Practice speaking instead of only reading.（练习说，而不是只读。）
- 易混 / 使用提示：不要说 instead of focus；后接名词时直接接名词。

### 10. have been trying to

- 中文核心含义：这段时间一直在尝试做某事。
- 通俗解释：从过去开始、持续到现在的一段努力。
- 生活场景例句：健康：I have been trying to lose weight for two weeks.（我两周来一直尝试减肥。）工作：We have been trying to solve this problem since Monday.（从周一我们一直尝试解决问题。）学习：She has been trying to speak more confidently.（她一直尝试更自信地说英语。）
- 易混 / 使用提示：结构是 have/has been trying to + 动词原形。

## 今天最值得记住的一件事

想表达【坚持】时先分清：**insist on** 是坚持要求，**persist in** 是遇到困难仍不放弃。
"@

$audio = @(
  [pscustomobject]@{id='v-carve-valid';prompt='说出 valid 用于感受时的意思。';normal='Your concern about the deadline is valid.'},
  [pscustomobject]@{id='v-insist-persist';prompt='用 insist on 说一句工作场景的话。';normal='She insisted on testing the feature before release.'},
  [pscustomobject]@{id='v-persist-in';prompt='用 persist in 说一句坚持练习的话。';normal='I persisted in speaking English even when I made mistakes.'},
  [pscustomobject]@{id='v-wrap-sum';prompt='说出 wrap up。';normal='We need to wrap up the meeting by five.';slow='We need to | wrap up | the meeting | by five.'},
  [pscustomobject]@{id='v-sum-up';prompt='用 sum up 概括要点。';normal='Can you sum up the main points for the team?'},
  [pscustomobject]@{id='v-grounded-weigh-against';prompt='说出 keep someone grounded。';normal='My savings keep me grounded when I think about changing jobs.'},
  [pscustomobject]@{id='v-weigh-options-against';prompt='用 weigh A against B 权衡选择。';normal='I am weighing a higher salary against more free time.'},
  [pscustomobject]@{id='e-verb-forms';prompt='纠正 to reported。';normal='He joined the meeting to report the results.'},
  [pscustomobject]@{id='e-instead-of-gerund';prompt='纠正 instead of focus。';normal='Practice speaking instead of only reading.'},
  [pscustomobject]@{id='e-present-perfect-progressive-try';prompt='说出持续尝试的结构。';normal='I have been trying to lose weight for two weeks.'}
)

$reviews = Join-Path $root 'reviews'
New-Item -ItemType Directory -Force -Path $reviews | Out-Null
$mdPath = Join-Path $reviews "$ReviewDate.md"
$audioPath = Join-Path $reviews "$ReviewDate.audio.json"
[System.IO.File]::WriteAllText($mdPath, $md.Trim() + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText($audioPath, ([pscustomobject]@{date=$ReviewDate;cards=$audio} | ConvertTo-Json -Depth 4), [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText($ledgerPath, ($ledger | ConvertTo-Json -Depth 12), [System.Text.UTF8Encoding]::new($false))

[pscustomobject]@{ok=$true;reviewDate=$ReviewDate;markdownFile=$mdPath;audioFile=$audioPath;cards=$audio.Count;selectedIds=$selectedIds}
