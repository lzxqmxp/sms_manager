# SMS Manager - 短信接码管理器

📱 基于 Electron + Vue 3 + Vite 开发的 SMS-Activate API 短信接码管理应用

## 功能特性

✨ **核心功能**
- 🔑 SMS-Activate API 集成
- 📞 一键请求虚拟手机号码
- 💬 实时接收短信验证码
- ⏱️ 自动释放未使用号码（到期前2分钟）
- 💰 实时查看账户余额
- 📊 SQLite3 数据库存储
- 🌐 支持多服务商（Tinder、Telegram、WhatsApp、Google、Facebook）
- 🇺🇸 支持多国家/地区（美国、俄罗斯、乌克兰、菲律宾、印尼）

✨ **用户体验**
- 🎨 现代化 UI 设计
- 📱 实时倒计时显示
- 🔔 即时通知提醒
- 📋 支持多条短信接收
- 🔄 支持请求重发短信
- 💾 本地数据持久化

## 快速开始

### 环境要求

- Node.js 16+
- npm 或 yarn

### 安装步骤

```bash
# 克隆项目
git clone https://github.com/lzxqmxp/sms_manager.git

# 进入项目目录
cd sms_manager

# 安装依赖
npm install

# 开发模式运行
npm run dev

# 构建应用
npm run build
```

## 使用说明

### 1. 配置 API Key

首次使用需要配置您的 SMS-Activate API Key：

1. 访问 [SMS-Activate](https://sms-activate.org/) 注册账户
2. 在个人中心获取 API Key
3. 在应用中输入 API Key 并点击"保存并连接"

### 2. 请求号码

1. 选择服务商（如 Tinder）
2. 选择国家/地区（如美国）
3. 点击"请求号码"按钮
4. 系统将自动获取可用号码并开始监听短信

### 3. 接收短信

- 号码请求成功后，应用会自动轮询检查短信
- 收到短信后会立即显示在界面上
- 支持接收多条短信（二次验证码等）
- 可以手动点击"重发"按钮请求重新发送短信

### 4. 号码管理

- 每个号码有效期 20 分钟
- 系统会在到期前 2 分钟自动释放未使用的号码
- 可以随时手动点击"释放"按钮释放号码
- 收到短信后号码状态自动变为"完成"

### 5. 余额查询

- 应用顶部实时显示账户余额
- 点击"刷新"按钮手动更新余额
- 每次操作后会自动刷新余额

## 项目结构

```
sms_manager/
├── electron/
│   ├── main/
│   │   └── index.ts          # 主进程入口
│   ├── preload/
│   │   └── index.ts          # 预加载脚本
│   ├── database/
│   │   └── index.ts          # 数据库模块（SQLite3）
│   └── services/
│       └── sms-activate.ts   # SMS-Activate API 服务
├── src/
│   ├── components/
│   │   └── SmsManager.vue    # 主界面组件
│   ├── types/
│   │   └── ipc.d.ts          # IPC 类型定义
│   ├── App.vue               # 根组件
│   └── main.ts               # 渲染进程入口
├── package.json
├── vite.config.ts
└── README.md
```

## 技术栈

- **前端框架**: Vue 3 (Composition API)
- **桌面框架**: Electron 29
- **构建工具**: Vite 5
- **数据库**: better-sqlite3
- **HTTP 客户端**: axios
- **类型检查**: TypeScript 5

## 数据存储

应用使用 SQLite3 数据库存储以下数据：

- **phone_numbers**: 号码记录表
  - 激活ID、手机号、服务商、国家、状态、时间等
  
- **sms_messages**: 短信记录表
  - 激活ID、手机号、短信内容、接收时间等
  
- **api_config**: API 配置表
  - API Key、余额、最后更新时间等

数据库文件位置：
- Windows: `%APPDATA%/electron-vue-vite/sms_manager.db`
- macOS: `~/Library/Application Support/electron-vue-vite/sms_manager.db`
- Linux: `~/.config/electron-vue-vite/sms_manager.db`

## API 说明

### SMS-Activate API 参考

- **getBalance**: 获取账户余额
- **getNumber**: 请求虚拟号码
- **getStatus**: 查询短信状态
- **setStatus**: 设置激活状态
- **cancelActivation**: 取消激活（释放号码）

详细 API 文档: [SMS-Activate API Docs](https://sms-activate.org/en/api2)

## 界面预览

应用包含以下主要界面：

1. **API 配置界面**: 输入和保存 API Key
2. **号码请求区**: 选择服务商和国家，请求号码
3. **号码列表区**: 显示所有活跃号码和接收到的短信
4. **倒计时显示**: 实时显示距离自动释放的剩余时间
5. **余额显示**: 顶部显示账户余额

## 注意事项

⚠️ **重要提示**：

1. 请妥善保管您的 API Key，不要分享给他人
2. 每个号码都有时间限制，请及时使用
3. 号码会在到期前 2 分钟自动释放以避免浪费
4. 建议定期检查账户余额
5. 某些服务商和国家的号码价格可能不同

## 常见问题

**Q: 如何获取 API Key？**  
A: 访问 SMS-Activate 官网注册账户后，在个人中心可以找到 API Key。

**Q: 为什么没有收到短信？**  
A: 可能的原因：
- 网络连接问题
- 服务商延迟发送
- 号码已被使用
- 可以尝试点击"重发"按钮

**Q: 号码会自动释放吗？**  
A: 是的，系统会在号码到期前 2 分钟自动释放未收到短信的号码。

**Q: 数据存储在哪里？**  
A: 数据存储在本地 SQLite 数据库中，位于系统用户数据目录。

**Q: 支持哪些服务商？**  
A: 目前支持 Tinder、Telegram、WhatsApp、Google、Facebook 等主流服务。

**Q: 可以同时请求多个号码吗？**  
A: 可以，应用支持同时管理多个活跃号码。

**Q: 短信内容会保存吗？**  
A: 是的，所有接收到的短信都会保存在本地数据库中。

## 开发说明

### 调试模式

```bash
npm run dev
```

开发模式会自动打开 DevTools，方便调试。

### 构建生产版本

```bash
npm run build
```

构建完成后，可执行文件会生成在 `release` 目录中。

### 代码注释

所有代码均包含详细的中文注释，便于理解和维护。

## 贡献指南

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License

## 作者

开发：基于 electron-vite-vue 模板  
SMS Manager 功能实现：2024

## 致谢

- [electron-vite-vue](https://github.com/electron-vite/electron-vite-vue) - 优秀的 Electron + Vue + Vite 模板
- [SMS-Activate](https://sms-activate.org/) - 提供短信接码服务
- [Vue 3](https://vuejs.org/) - 渐进式 JavaScript 框架
- [Electron](https://www.electronjs.org/) - 跨平台桌面应用框架
