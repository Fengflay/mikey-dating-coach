# Mikey情感导师 - Complete UX Architecture

## App Identity
- **Name**: Mikey情感导师
- **Tagline**: 你的私人恋爱顾问
- **Tone**: Confident friend, not clinical therapist
- **Speed promise**: Get advice in under 10 seconds

---

## Screen 1: Onboarding / First Use (3 swipeable panels)

### Panel 1 - Welcome
```
┌──────────────────────────┐
│                          │
│      [Illustration]      │
│      Man + phone +       │
│      speech bubbles       │
│                          │
│   聊天卡壳？Mikey来帮你     │
│                          │
│   粘贴她的消息，AI秒回       │
│   三种策略，一键复制         │
│                          │
│         ● ○ ○            │
│                          │
│    [ 下一步 →  ]          │
│                          │
│      跳过                 │
└──────────────────────────┘
```

### Panel 2 - How It Works
```
┌──────────────────────────┐
│                          │
│   1. 📋 粘贴她的消息       │
│      ──────────           │
│   2. 🔍 AI秒速分析         │
│      ──────────           │
│   3. 💬 选回复一键复制      │
│                          │
│   只需10秒，再也不纠结       │
│                          │
│         ○ ● ○            │
│                          │
│    [ 下一步 →  ]          │
│                          │
│      跳过                 │
└──────────────────────────┘
```

### Panel 3 - Quick Setup
```
┌──────────────────────────┐
│                          │
│      你正在：              │
│                          │
│   ┌─────────────────┐    │
│   │ 🌱 刚开始聊天    │ ← selected │
│   └─────────────────┘    │
│   ┌─────────────────┐    │
│   │ 💬 已经暧昧中    │    │
│   └─────────────────┘    │
│   ┌─────────────────┐    │
│   │ ❤️ 正在追求      │    │
│   └─────────────────┘    │
│   ┌─────────────────┐    │
│   │ 💑 恋爱中        │    │
│   └─────────────────┘    │
│                          │
│   (AI会根据阶段调整建议)    │
│                          │
│   [ 开始使用 Mikey ]      │
│                          │
└──────────────────────────┘
```

**Interaction notes**:
- Swipe left/right between panels
- Skip button always visible, takes to main screen
- Panel 3 selection is optional, stored locally
- After onboarding, never shown again (stored in localStorage)

---

## Screen 2: Main Conversation Analysis Screen (Primary Screen)

This is where users spend 90% of their time. It behaves like a chat app where the user pastes a message and gets coaching analysis back.

### Empty State (first visit after onboarding)
```
┌──────────────────────────┐
│ Mikey情感导师     [⚙️][🌓]│  ← Header
│──────────────────────────│
│                          │
│                          │
│      [ Chat icon ]       │
│                          │
│    粘贴她的消息            │
│    Mikey帮你秒回          │
│                          │
│    试试粘贴这个：          │
│   ┌──────────────────┐   │
│   │ "今天好累啊"       │   │  ← Tap to auto-fill
│   └──────────────────┘   │
│   ┌──────────────────┐   │
│   │ "你在干嘛呢"       │   │
│   └──────────────────┘   │
│   ┌──────────────────┐   │
│   │ "哈哈哈好吧"       │   │
│   └──────────────────┘   │
│                          │
│──────────────────────────│
│ [📷] [粘贴她的消息...] [➤]│  ← Input area
│━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ 💬分析  📚学习  📋历史  ⚙️ │  ← Tab bar
└──────────────────────────┘
```

### Active State (after user pastes a message)
```
┌──────────────────────────┐
│ Mikey情感导师     [⚙️][🌓]│
│──────────────────────────│
│                          │
│            她的消息：      │
│         ┌──────────────┐ │
│         │ 今天好累啊     │ │  ← User-pasted bubble (right)
│         └──────────────┘ │
│                          │
│  ┌─────────────────────┐ │
│  │ 🔍 Mikey分析中...    │ │  ← Loading animation
│  │ ███████░░░           │ │     (typing dots, then skeleton)
│  └─────────────────────┘ │
│                          │
│──────────────────────────│
│ [📷] [粘贴她的消息...] [➤]│
│━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ 💬分析  📚学习  📋历史  ⚙️ │
└──────────────────────────┘
```

### Analysis Complete State
```
┌──────────────────────────┐
│ Mikey情感导师     [⚙️][🌓]│
│──────────────────────────│
│                          │
│            她的消息：      │
│         ┌──────────────┐ │
│         │ 今天好累啊     │ │
│         └──────────────┘ │
│                          │
│  ┌─────────────────────┐ │
│  │ 🔍 情境诊断          │ │
│  │                      │ │
│  │ [暧昧初期]           │ │  ← Stage badge
│  │                      │ │
│  │ 话题温度：            │ │
│  │ ━━━━━━━░░░ 中等偏暖   │ │  ← Temperature meter
│  └─────────────────────┘ │
│                          │
│  ┌─────────────────────┐ │
│  │ 💭 潜台词分析         │ │
│  │                      │ │
│  │ 她说"今天好累"         │ │
│  │ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄    │ │
│  │ 她可能想表达：         │ │
│  │ 寻求关心和陪伴，       │ │
│  │ 向你展示脆弱面是       │ │
│  │ 信任的表现             │ │
│  └─────────────────────┘ │
│                          │
│  ┌─────────────────────┐ │
│  │ ⚠️ 排雷区             │ │
│  │                      │ │
│  │ ✕ 别说"多喝热水"      │ │
│  │ ✕ 别说"那你早点休息"   │ │
│  │ ✕ 别追问"为什么累"     │ │
│  └─────────────────────┘ │
│                          │
│  ┌─ A 幽默 ─────────────┐│
│  │ "累的话让我背你啊🙈   ││
│  │  虽然隔着屏幕有点难"   ││
│  │                      ││
│  │ 为什么：用轻松的方式   ││
│  │ 拉近距离，不给压力     ││
│  └──────────────────────┘│
│                          │
│  ┌─ B 共情 ─────────────┐│
│  │ "辛苦了，想听你说说   ││
│  │  今天怎么了"          ││
│  │                      ││
│  │ 为什么：展示你在意她   ││
│  │ 的感受，创造深聊机会   ││
│  └──────────────────────┘│
│                          │
│  ┌─ C 引导 ─────────────┐│
│  │ "你值得好好放松一下，  ││
│  │  周末一起去公园走走？" ││
│  │                      ││
│  │ 为什么：借机推进关系   ││
│  │ 制造线下见面的机会     ││
│  └──────────────────────┘│
│                          │
│──────────────────────────│
│ [📷] [粘贴她的消息...] [➤]│
│━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ 💬分析  📚学习  📋历史  ⚙️ │
└──────────────────────────┘
```

---

## Screen 3: Response Selection & Copy Screen

When user taps a response option, it expands into a focused view.

```
┌──────────────────────────┐
│ ← 返回          选择回复  │
│──────────────────────────│
│                          │
│  ┌──────────────────────┐│
│  │ A 幽默回复            ││  ← Selected option, expanded
│  │                      ││
│  │ "累的话让我背你啊🙈   ││
│  │  虽然隔着屏幕有点难"   ││
│  │                      ││
│  │ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄   ││
│  │                      ││
│  │ 💡 策略解析：          ││
│  │ 用轻松幽默的方式回应   ││
│  │ 她的疲惫，不会给她     ││
│  │ 压力，同时制造了亲     ││
│  │ 密感和画面感           ││
│  │                      ││
│  │ 预期她的回复：         ││
│  │ "哈哈哈你来吗😂"      ││
│  │ → 可以继续推进...      ││
│  └──────────────────────┘│
│                          │
│  ┌──────────────────────┐│
│  │ ✏️ 自定义修改          ││
│  │ ┌────────────────┐   ││
│  │ │ 累的话让我背你   │   ││  ← Editable text area
│  │ │ 啊🙈 虽然隔着    │   ││
│  │ │ 屏幕有点难       │   ││
│  │ └────────────────┘   ││
│  └──────────────────────┘│
│                          │
│  ┌──────────────────────┐│
│  │  [ 📋 复制回复 ]      ││  ← Primary CTA
│  │                      ││
│  │  [ ✏️ 让Mikey改一版 ] ││  ← Secondary option
│  └──────────────────────┘│
│                          │
└──────────────────────────┘
```

**After copying**:
```
┌──────────────────────────┐
│                          │
│    ┌───────────────┐     │
│    │  ✓ 已复制到剪贴板 │  │  ← Toast, auto-dismiss 2s
│    └───────────────┘     │
│                          │
│    快去发给她吧！          │  ← Encouraging message
│                          │
│    [ 分析下一条 ]          │
│    [ 查看她可能的回复 ]     │
│                          │
└──────────────────────────┘
```

---

## Screen 4: Knowledge Base / Learning Section

```
┌──────────────────────────┐
│ 恋爱学堂          [🔍]   │
│──────────────────────────│
│                          │
│  ┌─ 热门话题 ──────── > ─┐│  ← Horizontal scroll
│  │                      ││
│  │ [初次约会] [聊天技巧]  ││
│  │ [暧昧升级] [挽回攻略]  ││
│  └──────────────────────┘│
│                          │
│  📖 推荐阅读               │
│                          │
│  ┌────────┬─────────────┐│
│  │ [img]  │ 聊天冷场？    ││
│  │        │ 5个万能话题   ││
│  │        │ 救活对话      ││
│  │        │ 阅读 3min     ││
│  └────────┴─────────────┘│
│                          │
│  ┌────────┬─────────────┐│
│  │ [img]  │ 她说"随便"    ││
│  │        │ 到底什么意思？ ││
│  │        │              ││
│  │        │ 阅读 5min     ││
│  └────────┴─────────────┘│
│                          │
│  ┌────────┬─────────────┐│
│  │ [img]  │ 约会地点      ││
│  │        │ 选择终极指南   ││
│  │        │              ││
│  │        │ 阅读 4min     ││
│  └────────┴─────────────┘│
│                          │
│  📊 你的学习进度            │
│  ┌──────────────────────┐│
│  │ 已读 12 篇 / 共 50篇  ││
│  │ ━━━━━━░░░░░░░░░ 24%  ││
│  └──────────────────────┘│
│                          │
│━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ 💬分析  📚学习  📋历史  ⚙️ │
└──────────────────────────┘
```

### Article Detail View
```
┌──────────────────────────┐
│ ← 返回      阅读 5min    │
│──────────────────────────│
│                          │
│  [Full-width hero image]  │
│                          │
│  她说"随便"到底什么意思？   │
│                          │
│  作者：Mikey教练           │
│  2024.03.15 · 5min        │
│                          │
│  ─────────────────────── │
│                          │
│  [Article body text in    │
│   comfortable reading     │
│   format with proper      │
│   line height and         │
│   spacing]                │
│                          │
│  💡 实战练习               │
│  ┌──────────────────────┐│
│  │ 场景：她说"都行"       ││
│  │ [ 试试分析这条 → ]    ││  ← Links to main analysis
│  └──────────────────────┘│
│                          │
└──────────────────────────┘
```

---

## Screen 5: History / Past Analyses

```
┌──────────────────────────┐
│ 分析记录           [🔍]  │
│──────────────────────────│
│                          │
│  今天                     │
│                          │
│  ┌──────────────────────┐│
│  │ "今天好累啊"          ││
│  │ 暧昧初期 · 幽默回复    ││
│  │ 14:32             →  ││
│  └──────────────────────┘│
│                          │
│  ┌──────────────────────┐│
│  │ "你在干嘛呢"          ││
│  │ 暧昧升温 · 引导回复    ││
│  │ 12:15             →  ││
│  └──────────────────────┘│
│                          │
│  昨天                     │
│                          │
│  ┌──────────────────────┐│
│  │ "哈哈哈好吧"          ││
│  │ 初识阶段 · 共情回复    ││
│  │ 22:08             →  ││
│  └──────────────────────┘│
│                          │
│  ┌──────────────────────┐│
│  │ [Screenshot thumb]   ││
│  │ 截图分析              ││
│  │ 初识阶段 · 幽默回复    ││
│  │ 18:30             →  ││
│  └──────────────────────┘│
│                          │
│━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ 💬分析  📚学习  📋历史  ⚙️ │
└──────────────────────────┘
```

**Interaction**: Swipe left on any history item to reveal delete button (mobile). Tap to re-open the full analysis.

---

## Screen 6: Settings

```
┌──────────────────────────┐
│ ← 返回             设置   │
│──────────────────────────│
│                          │
│  个人信息                  │
│  ┌──────────────────────┐│
│  │ 当前阶段    暧昧初期 > ││
│  │──────────────────────││
│  │ 聊天对象    小美     > ││
│  │──────────────────────││
│  │ 你的风格    幽默型   > ││
│  └──────────────────────┘│
│                          │
│  偏好设置                  │
│  ┌──────────────────────┐│
│  │ 外观模式              ││
│  │ [浅色|深色|跟随系统]    ││  ← Segmented control
│  │──────────────────────││
│  │ 语言       简体中文  > ││
│  │──────────────────────││
│  │ 回复风格偏好         > ││
│  │──────────────────────││
│  │ 通知提醒      [开关]  ││
│  └──────────────────────┘│
│                          │
│  会员与订阅                │
│  ┌──────────────────────┐│
│  │ 今日剩余    3/5次   > ││
│  │──────────────────────││
│  │ 升级VIP             > ││
│  └──────────────────────┘│
│                          │
│  其他                     │
│  ┌──────────────────────┐│
│  │ 使用教程             > ││
│  │──────────────────────││
│  │ 反馈建议             > ││
│  │──────────────────────││
│  │ 隐私政策             > ││
│  │──────────────────────││
│  │ 关于Mikey            > ││
│  └──────────────────────┘│
│                          │
│  版本 1.0.0               │
│                          │
│━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ 💬分析  📚学习  📋历史  ⚙️ │
└──────────────────────────┘
```

---

## Mobile-First Responsive Layout Strategy

### Breakpoint Behavior Map

| Feature | Mobile (<480) | Phablet (480-767) | Tablet (768-1023) | Desktop (1024+) |
|---------|--------------|-------------------|-------------------|-----------------|
| Navigation | Bottom tab bar | Bottom tab bar | Sidebar (collapsed icons) | Sidebar (full) |
| Chat width | Full screen | Full screen | 680px centered | 680px centered |
| Response options | Stacked vertical | Stacked vertical | 3-column horizontal | 3-column horizontal |
| Analysis cards | Full width | Full width | 680px with padding | 680px with padding |
| Knowledge grid | 1 column | 2 columns | 2 columns | 3 columns |
| History list | Full width | Full width | 680px centered | 680px centered |
| Input area | Sticky bottom | Sticky bottom | Sticky bottom | Sticky bottom |
| Header | Visible | Visible | Hidden (sidebar) | Hidden (sidebar) |

### Tablet/Desktop Layout
```
┌────────────────────────────────────────────┐
│ Sidebar    │          Main Content          │
│            │                                │
│ [Logo]     │   ┌────────────────────────┐   │
│            │   │                        │   │
│ 💬 分析    │   │   Chat / Analysis      │   │
│ 📚 学习    │   │   (max 680px centered)  │   │
│ 📋 历史    │   │                        │   │
│ ⚙️ 设置    │   │                        │   │
│            │   │                        │   │
│            │   └────────────────────────┘   │
│            │                                │
│ ─────────  │   ┌────────────────────────┐   │
│ 🌓 主题    │   │ Input Area             │   │
│            │   └────────────────────────┘   │
│ [升级VIP]  │                                │
└────────────────────────────────────────────┘
```

---

## Interaction Patterns

### 1. Pasting Text (Primary Input)
- **Mobile**: Tap input field -> system paste menu appears -> paste -> tap send
- **Keyboard shortcut**: Ctrl/Cmd+V in focused input auto-detects pasted content
- **Long-press input area**: Shows "粘贴" quick action on mobile
- **Auto-detect**: If clipboard contains text when app opens, show "检测到剪贴板内容，是否分析？" banner

### 2. Screenshot Upload
- **Camera icon** in input area opens:
  - Photo library picker (select existing screenshot)
  - Camera (take photo of screen)
- **Drag & drop** supported on desktop
- **Paste image**: Ctrl/Cmd+V with image in clipboard auto-uploads
- OCR processes the screenshot server-side, extracts text, then analyzes

### 3. Response Selection
- **Tap** any of the 3 response cards to select
- Selected card **expands** with full explanation and edit option
- Other cards **collapse** but remain tappable to switch
- **Swipe left/right** between options on mobile (with snap points)
- **Keyboard**: Arrow keys to navigate, Enter to select (desktop)

### 4. Copy Flow
- Tap "复制回复" -> copies to clipboard + haptic feedback (mobile)
- Toast appears: "已复制到剪贴板"
- After copy, show: "分析下一条" CTA to reset input

### 5. Customize Response
- Tap "自定义修改" to open editable text area
- Pre-filled with selected response
- "让Mikey改一版" sends edited version back to AI for refinement
- "恢复原文" resets to AI original

### 6. History Navigation
- **Swipe left** on history item reveals delete (mobile)
- **Long press** opens context menu: 删除 / 重新分析 / 分享
- **Pull to refresh** loads any synced history
- **Search**: Tap search icon to filter history by keyword

### 7. Gesture Map (Mobile)
| Gesture | Location | Action |
|---------|----------|--------|
| Swipe left/right | Response cards | Switch between A/B/C |
| Swipe left | History item | Reveal delete |
| Pull down | Any scroll view | Refresh |
| Swipe right | Any sub-screen | Go back (iOS native) |
| Long press | Response text | Copy text |
| Double tap | Response card | Quick copy |
| Pinch | Screenshot preview | Zoom in/out |

---

## Component Inventory

### Core Components
1. **MessageBubble** - User-pasted text display
2. **AnalysisCard** - Container for AI analysis
3. **DiagnosisSection** - Stage badge + temperature meter
4. **SubtextCard** - Hidden meaning analysis
5. **MinefieldSection** - What NOT to say
6. **ResponseOption** - Selectable reply strategy card (x3)
7. **ActionBar** - Copy / Edit / Regenerate buttons
8. **InputComposer** - Text input + upload + send
9. **UploadZone** - Screenshot drag/drop area

### Navigation Components
10. **AppHeader** - Mobile top bar
11. **TabBar** - Mobile bottom navigation (4 tabs)
12. **Sidebar** - Desktop navigation
13. **ThemeToggle** - Light/Dark/System switcher

### Content Components
14. **ArticleCard** - Knowledge base article preview
15. **HistoryItem** - Past analysis list item
16. **CategoryPill** - Topic filter tags
17. **ProgressBar** - Reading progress / usage meter

### Feedback Components
18. **Toast** - Copy confirmation, errors
19. **SkeletonLoader** - Analysis loading state
20. **EmptyState** - No history / first use
21. **ClipboardBanner** - Auto-detect pasted content prompt

### Settings Components
22. **SettingsGroup** - Grouped settings with dividers
23. **SettingsItem** - Individual setting row
24. **SegmentedControl** - Theme selector inline

---

## Animation & Transition Spec

| Trigger | Animation | Duration | Easing |
|---------|-----------|----------|--------|
| Analysis loading | Skeleton shimmer + typing dots | 1.5s loop | ease |
| Analysis sections appear | Staggered fade-up (100ms between) | 400ms each | ease-out |
| Response option select | Scale 1.02 + border glow | 250ms | ease-bounce |
| Copy button success | Background color shift + checkmark | 150ms | ease |
| Toast appear | Slide up + fade in | 250ms | ease-bounce |
| Toast dismiss | Fade out + slide down | 200ms | ease |
| Theme switch | Cross-fade background/text colors | 300ms | ease |
| Tab switch | Content fade (no slide) | 200ms | ease |
| History swipe | Transform translateX | 250ms | ease |

---

## File Structure

```
mikey-dating-coach/
├── css/
│   ├── design-system.css     # Variables, colors, typography, spacing
│   ├── layout.css            # App shell, responsive grid, containers
│   ├── components.css        # All UI component styles
│   └── utilities.css         # Helper classes (spacing, display, etc.)
├── js/
│   ├── theme-manager.js      # Light/Dark/System toggle
│   ├── input-handler.js      # Paste detection, clipboard, upload
│   ├── response-selector.js  # Card selection, swipe, copy
│   └── main.js               # App initialization, routing
├── wireframes/
│   └── ux-architecture.md    # This document
├── ai/
│   └── memory-bank/
│       └── site-setup.md     # Project configuration
└── index.html                # Prototype entry point
```
