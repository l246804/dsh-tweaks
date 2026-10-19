# dsh-tweaks

针对 DeepSeek Harness（DSH）Web GUI 的体验修正插件。本上下文只描述"如何在不改动 DSH 自身文件的前提下，把一个 DSH 插件做出来、装上去、验得了"。

上游源码只读地位于 `deepseek-harness/`（Git submodule），是事实来源，但它的 pin 可能滞后于正在运行的 DSH；两者冲突时以 `dsh --version` 报告的版本为准。

## 语言

### 插件形态

**双面插件（Dual-face plugin）**：
一个在 `package.json` 里同时声明宿主入口与 `dsh.client` 的插件包，加载后既有宿主半边、又有浏览器半边。
_Avoid_: 前端插件、客户端插件、两半插件

**宿主半边（Host half）**：
插件的 Node 侧入口，在 DSH 宿主进程里 `apply()`，能拿到 Cordis 服务。
_Avoid_: 后端、服务端

**浏览器半边（Client half）**：
插件的浏览器侧产物，由 `package.json` 的 `dsh.client` 声明，经 `./client` 导出，形态是 `window.__ModuleLoader__.load({id, factory})` 的闭包工厂。
_Avoid_: 前端、UI 半、client bundle

**浏览器插件**：
只有浏览器半边、宿主半边是空 `apply()` 的插件。DSH 自身的 `ui-*` 包几乎都是这种。
_Avoid_: 纯前端插件

### 装载

**插件行（Plugin row）**：
profile 的 `cordis.yml` 树里的一行，`id` + `name` + `config`，代表"这个插件被挂上了"。
_Avoid_: 条目、节点、entry

**bundle 层（Bundle layer）**：
profile 由若干 bundle 按顺序叠成的 patch 层，每层是一个 `cordis.patch.yml`。
_Avoid_: 预设、合集

**profile 补丁（Profile patch）**：
`~/.dsh/profiles/<name>/cordis.patch.yml`，叠在所有 bundle 层之上的用户覆盖层，可改 `config`、置 `disabled`、或 `insert` 新行。
_Avoid_: 用户配置、覆盖层

### 扩展方式

**官方通道（Official channel）**：
DSH 明确为插件提供的扩展面：插槽（`ctx.slots`）、快捷键注册、`InputTriggerSource`、bundle patch 等。走这条路不依赖 DOM 结构。
_Avoid_: 正规做法、API

**DOM 补丁（DOM patch）**：
插件在浏览器里直接读/写宿主渲染出来的 DOM，以补上官方通道没开的扩展点。
_Avoid_: hack、DOM 注入、猴子补丁

**稳定锚点（Stable anchor）**：
DOM 补丁所依赖的、不会随构建哈希变化的定位依据，实际只用 `data-*` 属性；构建产物里的类名是哈希过的，不能作为依据。
_Avoid_: 选择器、hook 点、class 后缀

**兜底（Fallback）**：
官方通道不存在时采用的 DOM 补丁；一旦上游开出对应通道，应改走官方通道。
_Avoid_: 临时方案、降级

### 右侧栏

**右侧栏（Right sidebar）**：
窗口右侧可停靠的 tab 容器，由 `ui-sidebar-right` 拥有；每个会话各自持有一份布局。
_Avoid_: 侧栏、右栏、侧边栏
<!-- check:copy -->

**停靠（Dock）**：
一个 tab 画在右侧栏的停靠面上，与画在浮动窗里的状态相对。它不是"侧边"的同义词，而是宿主自己命名的一种摆放状态（`data-dockkit-host`）。
_Avoid_: 侧栏、贴边

**浮动（Float）**：
一个 tab 画在可自由移动的浮动窗里，而不是停靠面里。面板与 tab 动作都要先分清这两种摆放，否则会把浮动 tab 当成停靠 tab。
_Avoid_: 弹窗、浮层

**tab 类型（Tab kind）**：
右侧栏里一种可打开的页面类别，有一个字符串标识（如 `files`、`text`、`terminal`）与一个匹配地址的语法。一个类型可同时挂着**在force的一档**和被它遮蔽的**另一档**，所以"谁在force"要按优先级带读，不能只看有没有注册。
_Avoid_: 标签类型、页签

**tab 记录（Tab record）**：
右侧栏里一个已打开的 tab，含 id、类型、内容地址与标题。
_Avoid_: 标签、页签实例

**文件列表 tab（Files tab）**：
类型为 `files` 的 tab，正文是一棵工作区文件树。它是**一个 tab**，不是面板。
_Avoid_: 文件树、文件页、Files
<!-- check:copy -->

**文件面板（File panel）**：
由本插件提供的文件列表，**全局单实例**，在文件 tab 之间搬移而不是重建。它有两个家：在文件列表 tab 里它就是整个正文（`page`），在文件 tab 里它停靠在正文右侧（`dock`）。
_Avoid_: 文件列表、侧栏树
<!-- check:copy -->

**面板两态（Panel mode）**：
文件面板当前占的是整个正文（`page`）还是右侧一列（`dock`）。先按屏上那个 tab 的类型判：类型是 `files` 就占满整个正文；否则再看它的地址能否解析成会话内的文件，能则停靠，不能则离场。
_Avoid_: 面板布局、显示模式

**激活行（Active row）**：
面板里代表"当前 tab 正在看的这个文件"的那一行。切换文件 tab 时它要同时被标出并被滚动到列表中间。
_Avoid_: 选中项、高亮行、当前行

**揭示（Reveal）**：
把激活行滚到列表中间的动作。它依赖树按层级加载，所以必须先展开祖先目录、等目录读完才能滚，否则滚的是一个还没长出来的行。
_Avoid_: 居中、滚动定位

**层级（Level）**：
文件树里一个目录的加载状态，三态为读取中、已就绪、失败。失败时旧行要留着，因为"读失败"与"这个目录是空的"是两句不同的话。
_Avoid_: 节点、层

**拖拽手柄（Resizer）**：
面板左缘那道可拖的接缝，用来改面板宽度。宽度有三个数：拖拽提案、边界（下限、半个宿主宽的上限）、双击复位值。
_Avoid_: 分隔条、拉杆、拖拽条

**提案宽度（Proposed width）**：
拖拽当前要求的宽度，与真正应用的宽度不同：被窄窗口夹到上限时，记住的是提案而不是被压窄的结果。
_Avoid_: 当前宽度、设定宽度

**接管（Takeover）**：
本插件以 `extension` 优先级带注册一个 tab 类型，让内建同类型退居被遮蔽的位置，但仍然挂载运行。
_Avoid_: 覆盖、替换、劫持

**遮蔽（Shadow）**：
让宿主某个入口在本插件手里重新渲染一次，代价是要把它原本的职责整套接过来。与接管不同：接管换的是注册表里的一档，遮蔽换的是一个渲染器。
_Avoid_: 覆盖、代理、包装

**原地替换（Replace in place）**：
打开一个资源时，让它顶替某个已存在 tab 的槽位并关闭后者，而不是新开一个 tab。只有文件列表 tab 会借出自己的槽位；文件 tab 里的面板点文件**从不**替换当前 tab。
_Avoid_: 覆盖、替换标签

### 输入框

> 本小节的后三条描述的是**上游语义**：引用高亮、引用 chip 与光标漂移都由宿主产生。本插件的对应补丁已下线（`0e38d7a`，见 ADR-0002 的反例），这些词条保留是为了读懂宿主行为与相关 issue，不表示插件要修它们。

**输入条（Composer）**：
会话底部的输入区域，含可编辑面、工具行、提交动作与附件轨道。插件可通过链槽整体替换它。
_Avoid_: 输入框、输入区、input bar

**可编辑面（Editable surface）**：
输入条里真正接收键盘输入的部分；它是 Lexical 驱动的 `contenteditable`，不是 textarea。
_Avoid_: 文本框、输入区

**引用高亮（Reference decoration）**：
扫描草稿文本后给一段文本加上的样式，表示"这段像是一个引用目标"。它是**纯派生**的，不是状态。
_Avoid_: 引用、chip、标签

**引用 chip（Reference chip）**：
从候选列表里**选中**一个引用后插入的独立节点，与引用高亮是两种不同的东西；chip 是状态，高亮是派生。
_Avoid_: 引用、胶囊、tag

**光标漂移（Caret drift）**：
引用高亮所对应的节点在吸收相邻文本变长后，插入符停在旧偏移上，导致光标位置比实际短。
_Avoid_: 光标跳、caret bug

### 会话

**轮次（Turn）**：
一次从用户输入到助手停止的完整过程。轮次持有工具调用、推理与最终回答。
_Avoid_: 回合、对话轮

**轮次过程（Turn process）**：
一个轮次中工具调用与推理的部分，折叠后只留一行摘要；最终回答留在折叠之外。
_Avoid_: 过程、工具链

**交错输入（Interleaved input）**：
落在轮次过程起点之后的人类输入。它的存在使该轮次过程**永不自动折叠**。
_Avoid_: 中途输入、打断

**失败轮次（Failed turn）**：
以错误、中止或中断结束的轮次。它按设计保持展开，不提供折叠。
_Avoid_: 出错轮次

### 附件

**附件（Attachment）**：
消息里除文本外的图片或文件，以不透明 ID 持久引用。
_Avoid_: 资源、媒体

**图片附件（Image attachment）**：
媒体类型为 png/jpeg/webp/gif 的附件。它的字节可经会话读回，因此可写入剪贴板。
_Avoid_: 图片、图像
<!-- check:copy -->

**文件附件（File attachment）**：
除图片外的附件，按字节原样存储。**它的字节不能经会话读回**，因此无法写入剪贴板。
_Avoid_: 文件、文档附件

**剪贴板载荷（Clipboard payload）**：
一次复制真正写进剪贴板的东西：文本、可还原成图片附件的图片数据，以及文件附件的可读描述。它由消息节点上的持久引用组装，而不是从屏上 DOM 反推。
_Avoid_: 复制内容、剪贴板数据

**提示行（Notice）**：
复制后挂在消息行下方的一句话，用来说明这次复制没能带走什么。凡是没能完整带走的，都要说出来，不许静默丢。
_Avoid_: 提示、toast、报错
