# dsh-tweaks 以 bundle 包形态交付

`dsh-tweaks` 需要被 DSH 加载才能生效，而 `dsh` 有两种可安装形态：**bundle 包**（声明 `dsh.bundle.patch`，被 `dsh plugin add` 一步装进 profile 的 `dsh.profile.bundles`）与**纯浏览器插件**（只有 `dsh.client`，必须手工 link 并手工往 profile 的 `cordis.patch.yml` 写一行才激活）。我们选 bundle 包：安装是一条命令、可以发布到 npm、且 bundle 层正是"一个包如何被激活"的官方机制。

代价是它同时要求宿主半边存在（可以如官方 `ui-brand-official` 一样是空 `apply()`）与一份 `cordis.patch.yml`。这两样都只是声明，不增加运行时代码。
