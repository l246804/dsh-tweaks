# 接管内建 tab 类型，但保留内建插件继续运行

本插件的文件面板以 `extension` 档接管了内建 `files` tab **类型**（`ctx.sidebarRightTabs.register` 的 `priority: 'extension'`）。被接管的是**类型**这一层：注册表按 `kind` 只让一档在 force，内建的 `builtin` 定义退居 `shadowed`。

但内建插件 `@deepseek-ai/dsh-client-ui-sidebar-files` **本身仍在运行**。它注册的 tab 类型被遮蔽了，别的贡献没有：`workspace.files` 快捷键照旧在册，它声明的子座位照旧占着。这带来两个非显然的后果，写下来免得后来者"顺手修好"。

## 不要重新注册 `workspace.files` 快捷键

直觉上接管了类型就该接管它的命令，但快捷键注册表对重复 id **直接抛错**（上游 `packages/client/shortcuts/src/client/registry.ts:85`），对默认键位重叠也抛错（同文件 `:98`）。内建插件已经在册，再注册一次会让本插件**安装阶段就崩**。

不注册没有功能损失：该命令的 `resolve` 调 `openTabFromTarget('files', …)`，而 `files` 这个 kind 现在路由到本插件的类型。命令照常可用，只是它的注册者仍是内建插件。

代价是耦合：本插件依赖"内建插件仍然挂载"这一事实。它成立是因为我们只遮蔽类型、不禁用插件行。如果哪天上游把类型注册和命令注册拆成两个包，或者我们改用禁用内建插件行的做法，这条就要重评。

## 不要声明 `sidebar.right.tab.files.actions` 子座位

内建 `ui-sidebar-files` 的 entry 声明了它，而插槽注册表对重复声明的 childKey 抛错（上游 `packages/client/ui-slots/src/index.ts:1249`，实测确认两个 entry 声明同一 childKey 时后者抛 `slot "…" is already declared`）。所以要转发宿主 `ui-open-in-app` 往这个座位里放的按钮，在**官方通道内做不到**。

这是**已知缺口**，不是可以静默吞掉的小事：内建的"用其他应用打开"按钮在当前实现下不会出现在文件列表 tab 的头部。替代路径只有两条，都不便宜：等上游把该座位提升为可被多个 entry 声明的形态，或本插件在自己头部用 DOM 补丁复刻那个按钮（引入对 `ui-open-in-app` 这个第三方插件 UI 的复制，违背"不复制别的插件运行时身份"的约束）。**暂时接受缺口并记录在此。**

## 已复刻的部分

接管类型必须补回它自带的东西，否则读者能看出接管发生过：`sidebar.right.pane.tab.title` 座位的标题组件（文件夹图标 + 文案；不注册则 chip 只剩裸文本），以及 guide 条目的 `icon`（不填则开始页显示占位方块）与 `commandId`（不填则丢掉 chip 上的键位提示）。
