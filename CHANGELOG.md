# 更新日志 / Changelog

所有重要的项目变更都将记录在此文件中。

## [1.0.0] - 2024

### 新增功能 (Added)
- ✨ SMS-Activate 兼容协议 API 集成
- 📞 一键请求虚拟手机号码功能
- 💬 实时接收短信验证码
- ⏱️ 自动释放未使用号码（到期前2分钟）
- 💰 实时查看账户余额
- 📊 SQLite3 数据库本地存储
- 🌐 支持多服务商（Tinder、Telegram、WhatsApp、Google、Facebook）
- 🇺🇸 支持多国家/地区（美国、俄罗斯、乌克兰、菲律宾、印尼）
- 🎨 现代化 UI 设计
- 📱 实时倒计时显示
- 🔔 即时通知提醒
- 📋 支持多条短信接收
- 🔄 支持请求重发短信
- 💾 本地数据持久化

### 技术实现 (Technical)
- Electron 三进程架构
- Vue 3 Composition API
- Vite 5 构建工具
- TypeScript 类型检查
- better-sqlite3 数据库
- IPC 进程间通信
- 自动轮询机制（每5秒）
- 定时释放机制

### 配置 (Configuration)
- 使用 hero-sms.com API 端点
- 兼容 SMS-Activate 协议
- 跨平台支持（Windows、macOS、Linux）

---

## 模板历史 (Template History)

本项目基于 electron-vite-vue 模板构建。

### 2022-10-03 - Template v2.1.0
- 使用 `vite-electron-plugin` 替代 `vite-plugin-electron`

### 2022-06-04 - Template v2.0.0
- 基于 `vue-ts` 模板创建
- 集成 `vite-plugin-electron`
- 简化项目结构

### 2022-01-30 - Template v1.0.0
- 主进程、渲染进程、预加载脚本全部使用 Vite 构建

