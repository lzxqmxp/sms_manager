# SMS Manager - SMS Verification Manager

📱 Desktop application for SMS verification code management, built with Electron + Vue 3 + Vite

> **API Endpoint Note**: This application uses [hero-sms.com](https://hero-sms.com) API endpoint, which is compatible with SMS-Activate protocol

## Features

✨ **Core Features**
- 🔑 SMS-Activate Protocol Compatible API Integration
- 📞 One-click virtual phone number request
- 💬 Real-time SMS verification code reception
- ⏱️ Auto-release unused numbers (2 minutes before expiry)
- 💰 Real-time account balance display
- 📊 SQLite3 database storage
- 🌐 Multi-service support (Tinder, Telegram, WhatsApp, Google, Facebook)
- 🇺🇸 Multi-country/region support (USA, Russia, Ukraine, Philippines, Indonesia)

✨ **User Experience**
- 🎨 Modern UI design
- 📱 Real-time countdown display
- 🔔 Instant notifications
- 📋 Multiple SMS reception support
- 🔄 SMS resend request support
- 💾 Local data persistence

## System Architecture

This application uses Electron's three-process architecture:

- **Main Process**: Handles window management, business logic orchestration, database operations, and scheduled tasks
- **Renderer Process**: Vue 3-based user interface that communicates with the main process via IPC
- **Preload Script**: Securely exposes IPC interfaces using contextBridge

**Core Mechanisms**:
- 📡 Automatic SMS status polling every 5 seconds
- ⏰ Auto-release numbers 2 minutes before expiry
- 💾 SQLite3 local data persistence
- 🔄 Real-time event push (SMS arrival, number release)

## Quick Start

### Requirements

- Node.js 16+
- npm or pnpm (pnpm recommended)

### Installation

```bash
# Clone the repository
git clone https://github.com/lzxqmxp/sms_manager.git

# Navigate to project directory
cd sms_manager

# Install dependencies (using pnpm recommended)
pnpm install
# or use npm
npm install

# Run in development mode
pnpm dev
# or
npm run dev

# Build the application
pnpm build
# or
npm run build
```

## Usage Guide

### 1. Configure API Key

First-time setup requires API Key configuration:

1. Visit [hero-sms.com](https://hero-sms.com) or other SMS-Activate protocol compatible service provider to register
2. Get your API Key from the user dashboard
3. Enter the API Key in the application and click "Save and Connect"

> **Tip**: This application supports all service providers compatible with SMS-Activate protocol

### 2. Request Phone Number

1. Select service provider (e.g., Tinder)
2. Select country/region (e.g., USA)
3. Click "Request Number" button
4. System will automatically fetch available number and start listening for SMS

### 3. Receive SMS

- After successful number request, the app automatically polls for SMS
- SMS will be displayed immediately upon receipt
- Supports multiple SMS reception (for secondary verification codes, etc.)
- Manual "Resend" button available to request SMS resend

### 4. Number Management

- Each number has a 20-minute validity period
- System auto-releases unused numbers 2 minutes before expiry
- Manual "Release" button available to release number anytime
- Number status automatically changes to "Completed" upon SMS receipt

### 5. Balance Query

- Account balance displayed in real-time at the top of the app
- "Refresh" button available for manual balance update
- Balance automatically refreshed after each operation

## Project Structure

```
sms_manager/
├── electron/
│   ├── main/
│   │   └── index.ts          # Main process entry
│   ├── preload/
│   │   └── index.ts          # Preload script
│   ├── database/
│   │   └── index.ts          # Database module (SQLite3)
│   └── services/
│       └── sms-activate.ts   # SMS-Activate compatible API service
├── src/
│   ├── components/
│   │   └── SmsManager.vue    # Main UI component
│   ├── types/
│   │   └── ipc.d.ts          # IPC type definitions
│   ├── App.vue               # Root component
│   └── main.ts               # Renderer process entry
├── package.json
├── vite.config.ts
└── README.md
```

## Tech Stack

- **Frontend Framework**: Vue 3 (Composition API)
- **Desktop Framework**: Electron 29
- **Build Tool**: Vite 5
- **Database**: better-sqlite3
- **HTTP Client**: axios
- **Type Checking**: TypeScript 5

## Data Storage

The application uses SQLite3 database to store:

- **phone_numbers**: Phone number records
  - Activation ID, phone number, service, country, status, timestamps, etc.
  
- **sms_messages**: SMS message records
  - Activation ID, phone number, message content, receive time, etc.
  
- **api_config**: API configuration
  - API Key, balance, last update time, etc.

Database file locations:
- Windows: `%APPDATA%/electron-vue-vite/sms_manager.db`
- macOS: `~/Library/Application Support/electron-vue-vite/sms_manager.db`
- Linux: `~/.config/electron-vue-vite/sms_manager.db`

## API Documentation

### API Endpoint

The application uses `https://hero-sms.com/stubs/handler_api.php` as the default API endpoint, which is compatible with SMS-Activate protocol.

### Supported API Operations

- **getBalance**: Get account balance
- **getNumber**: Request virtual phone number
- **getStatus**: Query SMS status
- **setStatus**: Set activation status
- **cancelActivation**: Cancel activation (release number)

### API Protocol Reference

This application implements SMS-Activate compatible protocol. For detailed protocol specifications, refer to: [SMS-Activate API Docs](https://sms-activate.org/en/api2)

## Important Notes

⚠️ **Important Reminders**:

1. Keep your API Key secure and do not share it with others
2. Each number has a time limit, please use promptly
3. Numbers are auto-released 2 minutes before expiry to avoid waste
4. Regularly check your account balance
5. Prices may vary by service provider and country

## Frequently Asked Questions

**Q: How to get an API Key?**  
A: Visit [hero-sms.com](https://hero-sms.com) or other compatible service provider's website to register an account, then find the API Key in the user dashboard.

**Q: Why didn't I receive the SMS?**  
A: Possible reasons:
- Network connection issues
- Service provider sending delay
- Number already in use
- Try clicking the "Resend" button

**Q: Will numbers be automatically released?**  
A: Yes, the system automatically releases numbers that haven't received SMS 2 minutes before expiry.

**Q: Where is the data stored?**  
A: Data is stored in a local SQLite database in the system's user data directory.

**Q: Which service providers are supported?**  
A: Currently supports mainstream services like Tinder, Telegram, WhatsApp, Google, Facebook, etc.

**Q: Can I request multiple numbers simultaneously?**  
A: Yes, the application supports managing multiple active numbers at the same time.

**Q: Are SMS messages saved?**  
A: Yes, all received SMS messages are saved in the local database.

## Development Guide

### Debug Mode

```bash
pnpm dev
# or
npm run dev
```

Development mode automatically opens DevTools for debugging.

### Build Production Version

```bash
pnpm build
# or
npm run build
```

After building, the executable will be generated in the `release` directory.

### Code Comments

All code includes detailed Chinese comments for easy understanding and maintenance.

## Contributing

Issues and Pull Requests are welcome!

## License

MIT License

## Author

Development: Based on electron-vite-vue template  
SMS Manager Implementation: 2024

## Acknowledgments

- [electron-vite-vue](https://github.com/electron-vite/electron-vite-vue) - Excellent Electron + Vue + Vite template
- [hero-sms.com](https://hero-sms.com) - SMS verification service provider
- [Vue 3](https://vuejs.org/) - Progressive JavaScript framework
- [Electron](https://www.electronjs.org/) - Cross-platform desktop application framework
