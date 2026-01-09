import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'

const pkg = createRequire(import.meta.url)('../package.json')
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 写入 .debug.env（用于在调试模式下指定 dev server 端口等）
const envContent = Object.entries(pkg.debug.env || {}).map(([key, val]) => `${key}=${val}`)
fs.writeFileSync(path.join(__dirname, '.debug.env'), envContent.join('\n'))

// 选择包管理器（优先 pnpm，其次 yarn，最后 npm）
const root = path.join(__dirname, '..')
const isWin = process.platform === 'win32'
const candidates = []
if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) candidates.push(isWin ? 'pnpm.cmd' : 'pnpm')
if (fs.existsSync(path.join(root, 'yarn.lock'))) candidates.push(isWin ? 'yarn.cmd' : 'yarn')
candidates.push(isWin ? 'npm.cmd' : 'npm')
const pm = candidates[0]

// 在 Windows 某些环境下，直接 spawn 可出现 EINVAL；使用 shell 并传字符串命令更稳妥
const child = spawn(
  `${pm} run dev`,
  {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, VSCODE_DEBUG: 'true' },
  },
)

child.on('error', (err) => {
  console.error('[debug.script] 启动失败:', err)
})
