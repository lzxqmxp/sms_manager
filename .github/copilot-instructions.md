# Copilot 使用说明（SMS Manager）

本项目是基于 Electron + Vue 3 + Vite 的桌面应用，用于对接 SMS-Activate 类 API（当前使用 hero-sms.com 兼容端点）。以下说明帮助 AI 代理快速理解架构与高效协作。

## 架构总览
- 三进程结构：
  - 主进程：窗口管理、业务编排、定时轮询与数据持久化（better-sqlite3）。见 electron/main/index.ts、electron/database/index.ts。
  - 预加载：用 contextBridge 仅暴露 `ipcRenderer` 的 `on/off/send/invoke`，保持安全边界。见 electron/preload/index.ts 与 src/types/ipc.d.ts。
  - 渲染进程（Vue 3）：负责 UI 与通过 IPC 调主进程能力。见 src/components/SmsManager.vue、src/main.ts。
- 数据流：渲染进程通过 `ipcRenderer.invoke()` 发起请求 → 主进程 `ipcMain.handle()` 调用服务/数据库 → 主进程通过 `win.webContents.send()` 向渲染进程推送事件（如短信到达）。
- 外部服务：electron/services/sms-activate.ts 封装 API。主进程内维护轮询与自动释放定时器，避免在渲染进程持有长周期副作用。

## 关键工作流
- 开发：
  - 包管理推荐 pnpm（仓库含 pnpm-lock.yaml、pnpm-workspace.yaml）。
  - 运行开发：`pnpm dev`（或 `npm run dev`）。Vite 启动，`vite-plugin-electron/simple` 同步构建主/预加载代码。
  - VS Code 调试：当存在 `VSCODE_DEBUG` 环境时，Vite dev server 使用 package.json.debug.env 中的端口（默认 3344），主进程 onstart 打印 `[startup] Electron App`。工作区提供任务 “Before Debug” 启动 .vscode/.debug.script.mjs。
- 构建与打包：`pnpm build` 等价 `vue-tsc --noEmit && vite build && electron-builder`，输出在 release/${version}（配置见 electron-builder.json5）。

## IPC 约定（双向）
- 渲染 → 主进程（invoke）：
  - `save-api-key(apiKey)`、`get-api-key()`、`get-balance()`、`request-number(service, country)`、`release-number(activationId)`、`get-active-numbers()`、`get-sms-messages(activationId)`、`request-resend-sms(activationId)`。
- 主进程 → 渲染（send 推送）：
  - `sms-received`：收到短信时推送；`number-released`：自动释放号码时推送；`main-process-message`：示例心跳。
- 统一返回结构：主进程 handler 采用 `{ success: boolean, data?/balance?/apiKey?, error? }`，并在主进程内做 try/catch 打日志。

## 数据与定时机制
- SQLite 表：
  - phone_numbers（活跃/等待/完成/释放/取消等状态，含到期时间）；
  - sms_messages（逐条短信保存，按时间排序）；
  - api_config（API Key/余额/更新时间）。
- 定时：
  - 轮询短信：每 5 秒根据 activationId 调 `getStatus()`；
  - 自动释放：到期前 2 分钟若无短信则 `cancelActivation()` 并停止轮询；二者均在主进程维护 Map 定时器，窗口关闭时统一清理。

## 外部 API 细节（服务封装）
- 端点：`https://hero-sms.com/stubs/handler_api.php`，以 query 形式传参（`api_key`、`action`、其他参数）。
- 动作与解析：
  - `getBalance` → `ACCESS_BALANCE:<num>`；
  - `getNumber` → `ACCESS_NUMBER:<activationId>:<phoneNumber>`；
  - `getStatus` → `STATUS_WAIT_CODE`/`STATUS_OK:<code>`/`STATUS_CANCEL`；
  - `setStatus`（完成=6，重发=3，取消=8）。
- 代码映射：`SERVICE_CODES`、`COUNTRY_CODES` 在服务内定义，主进程请求前做转换。

## 变更模式（建议遵循）
- 新增业务功能：
  1) 在主进程新增 `ipcMain.handle('channel', ...)`，统一 `{ success, data?, error? }` 返回；
  2) 若需持久化，先在 electron/database/index.ts 增加表/索引或语句，并注意 better-sqlite3 同步 API；
  3) 若需对接外部接口，优先在 electron/services 新增模块或复用 sms-activate.ts；
  4) 在渲染进程通过 `window.ipcRenderer.invoke('channel', ...)` 调用，并在 UI 中订阅可能的推送事件。
- 类型集中：渲染侧全量类型存放于 src/types（例如 ipc.d.ts），预加载仅暴露最小必要 API；不要开启 `nodeIntegration` 或关闭 `contextIsolation`。

## 注意事项 / 坑
- 原生依赖：better-sqlite3 属于原生模块，已通过 Vite external 排除构建；务必放在 dependencies 而非 devDependencies，确保被 electron-builder 收进 asar 外/内正确工作。
- 端口/调试：VSCODE_DEBUG 下 dev server 端口由 package.json.debug.env 控制；不要硬编码端口到渲染层。
- 定时器清理：主窗口关闭/应用退出时要清理所有轮询与释放定时器，避免悬挂任务。
- 打包信息：electron-builder.json5 中 `appId`、`productName` 为占位；发布前再行调整。
- 需要所有的注释均为中文，包括代码内的注释。

## 参考文件
- 主流程：electron/main/index.ts
- 预加载与暴露：electron/preload/index.ts、src/types/ipc.d.ts
- 外部服务：electron/services/sms-activate.ts
- 数据持久化：electron/database/index.ts
- 前端界面：src/components/SmsManager.vue
- 构建配置：vite.config.ts、electron-builder.json5、package.json