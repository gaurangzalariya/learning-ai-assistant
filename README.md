# Learning AI Assistant 🤖

A Node.js application that logs chat conversations from Telegram and Discord platforms for AI training purposes. Features a modern Bootstrap dashboard for viewing and analyzing conversation data.

## 🚀 Features

- **🧠 Telegram Bot Integration** - Logs all incoming/outgoing messages with intelligent responses
- **🎮 Discord Bot Integration** - Comprehensive Discord message logging with server and DM support
- **📦 Supabase Database** - Stores messages, user data, and conversation threads
- **🌐 Express API** - RESTful endpoints for accessing chat data with pagination and filtering
- **📊 Bootstrap Dashboard** - Modern web interface with search, filters, and statistics
- **📤 Data Export** - Export chat data in JSON or CSV format with filtering options
- **🗑️ Data Management** - Clear all or filtered data with confirmation safeguards
- **📈 Advanced Statistics** - Detailed database statistics and analytics
- **🔐 Environment Configuration** - Secure API key management
- **⚡ Real-time Updates** - Live dashboard with auto-refresh capabilities
- **🛡️ Security Protection** - Comprehensive .gitignore and secure credential handling

## 🗂️ Project Structure

```
learning-ai-assistant/
├── backend/
│   ├── index.js             # Express server entry point
│   ├── telegram.js          # Telegram bot logic and message handling
│   ├── discord.js           # Discord bot logic and commands
│   ├── supabase.js          # Database client and helper functions
│   └── routes/
│       └── chats.js         # API endpoints for chat data
├── dashboard/
│   ├── index.html           # Bootstrap dashboard interface
│   └── main.js              # Frontend JavaScript for API calls
├── package.json             # Project dependencies and scripts
├── .env.example             # Environment variables template
├── .gitignore               # Git ignore file for security
├── .cursorrules             # Development guidelines
└── README.md               # This file
```

## 🛠️ Prerequisites

- **Node.js** (v16 or higher)
- **Supabase Account** ([Sign up here](https://supabase.com))
- **Telegram Bot Token** ([Create bot with @BotFather](https://core.telegram.org/bots#creating-a-new-bot))
- **Discord Bot Token** ([Discord Developer Portal](https://discord.com/developers/applications))

## ⚙️ Installation & Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd learning-ai-assistant
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Database Setup (Supabase)

1. Create a new Supabase project
2. Run this SQL query in the Supabase SQL editor:

```sql
-- Create messages table
CREATE TABLE messages (
  id BIGSERIAL PRIMARY KEY,
  platform VARCHAR(20) NOT NULL,
  platform_message_id VARCHAR(100),
  user_id VARCHAR(100),
  username VARCHAR(100),
  message_text TEXT,
  message_type VARCHAR(50),
  thread_id VARCHAR(100),
  chat_id VARCHAR(100),
  raw_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_messages_platform ON messages(platform);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX idx_messages_user_id ON messages(user_id);
CREATE INDEX idx_messages_message_type ON messages(message_type);
CREATE INDEX idx_messages_search ON messages USING gin(to_tsvector('english', message_text));
```

### 4. Create Telegram Bot

1. Message [@BotFather](https://t.me/botfather) on Telegram
2. Send `/newbot` and follow the instructions
3. Save the bot token for the next step

### 5. Create Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Go to "Bot" section and create a bot
4. Copy the bot token
5. Under "Privileged Gateway Intents", enable:
   - Message Content Intent
   - Server Members Intent (optional)

### 6. Environment Configuration

1. Copy the environment template:
```bash
cp env.example .env
```

2. Edit `.env` with your credentials:
```env
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_role_key

# Bot Tokens
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
DISCORD_BOT_TOKEN=your_discord_bot_token

# Server Configuration
PORT=3000
NODE_ENV=development
```

### 7. Bot Permissions Setup

#### Discord Bot Permissions:
- Read Messages/View Channels
- Send Messages
- Read Message History
- Use Slash Commands
- Mention Everyone (optional)

#### Discord Bot Invite:
Generate an invite URL in the Discord Developer Portal with these permissions and add the bot to your server.

#### Telegram Bot:
No additional setup required - just start a conversation with your bot!

## 🚀 Running the Application

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

The application will start on `http://localhost:3000` (or your specified PORT).

## 🎯 Usage

### Dashboard Access
- **Main Dashboard**: `http://localhost:3000`
- **API Documentation**: `http://localhost:3000/api/chats`
- **Health Check**: `http://localhost:3000/health`

### Telegram Bot Commands
- `/start` - Welcome message and bot introduction
- `/help` - Display available commands and features
- `/stats` - Show your personal chat statistics
- `/privacy` - View privacy and data usage information

### Discord Bot Commands
- **Mention the bot** (@YourBot) - Get the bot's attention
- **Direct Messages** - Private conversations with the bot
- **Server Commands**:
  - `!ai help` - Show command help
  - `!ai stats` - View your statistics
  - `!ai about` - Learn about the bot

## 📊 Dashboard Features

### Statistics Cards
- **Total Messages** - All recorded messages across platforms
- **Telegram Messages** - Platform-specific message count
- **Discord Messages** - Platform-specific message count
- **Recent Activity** - Messages from the last 24 hours

### Search & Filtering
- **Text Search** - Search within message content
- **Platform Filter** - Filter by Telegram or Discord
- **Message Type** - Filter by user messages or bot responses
- **Pagination** - Navigate through large datasets

### Data Management
- **Export JSON** - Export all or filtered data in JSON format
- **Export CSV** - Export all or filtered data in spreadsheet format
- **Database Statistics** - View detailed database analytics and usage
- **Clear Data** - Safely delete all or filtered data with double confirmation
- **Filtered Operations** - Apply current filters to export/clear operations

### Message Details
- Click any message row to view detailed information
- Raw message data from the platform APIs
- User information and timestamps
- Complete conversation context

## 🔧 API Endpoints

### GET `/api/chats`
Retrieve chat messages with pagination and filtering.

**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 50, max: 100)
- `platform` - Filter by platform ('telegram' or 'discord')
- `search` - Search in message text
- `messageType` - Filter by type ('user' or 'bot')

**Example:**
```bash
curl "http://localhost:3000/api/chats?platform=telegram&limit=25&search=hello"
```

### GET `/api/chats/stats`
Get overall statistics about messages.

### GET `/api/chats/detailed-stats`
Get detailed database statistics including platform breakdown, message types, and temporal data.

### GET `/api/chats/export`
Export chat data in JSON or CSV format with filtering support.

**Query Parameters:**
- `format` - Export format ('json' or 'csv', default: 'json')
- `platform` - Filter by platform ('telegram' or 'discord')
- `search` - Search in message text
- `messageType` - Filter by type ('user' or 'bot')

**Example:**
```bash
curl "http://localhost:3000/api/chats/export?format=csv&platform=telegram"
```

### DELETE `/api/chats/clear`
Clear (delete) chat data with filtering support. Requires double confirmation for safety.

**Query Parameters:**
- `platform` - Filter by platform ('telegram' or 'discord')
- `search` - Search in message text
- `messageType` - Filter by type ('user' or 'bot')
- `confirm` - Confirmation token (required for actual deletion)

**Example:**
```bash
curl -X DELETE "http://localhost:3000/api/chats/clear?platform=telegram&confirm=true"
```

### GET `/api/chats/:id`
Get detailed information about a specific message.

### GET `/health`
Check server and database connectivity status.

## 🛡️ Security & Privacy

### Data Collection
- Message text and timestamps
- User IDs and usernames
- Platform-specific metadata
- Complete raw message objects for analysis

### Data Usage
- AI conversation model training
- Response quality improvement
- Conversation pattern analysis

### Data Protection
- Secure database storage with Supabase
- Environment-based configuration
- No data sharing with third parties
- Data used exclusively for AI training

### Security Measures
- **Environment Variables** - All sensitive data stored in `.env` file
- **Git Protection** - Comprehensive `.gitignore` protects credentials and data
- **No Hardcoded Secrets** - All tokens and keys use environment variables
- **Export Security** - Data export includes only necessary fields
- **Deletion Safety** - Clear operations require double confirmation
- **Database Security** - Supabase handles encryption and access control

### Data Management
- **Export Controls** - All exports respect applied filters and permissions
- **Safe Deletion** - Clear operations include safeguards against accidental deletion
- **Data Retention** - Manual control over data lifecycle and storage
- **Audit Trail** - All operations logged for security and debugging

## 📊 Data Management

### Exporting Data

#### Export All Data
```bash
# Export all messages as JSON
curl "http://localhost:3000/api/chats/export" > messages.json

# Export all messages as CSV
curl "http://localhost:3000/api/chats/export?format=csv" > messages.csv
```

#### Export Filtered Data
```bash
# Export only Telegram messages
curl "http://localhost:3000/api/chats/export?platform=telegram&format=csv" > telegram_messages.csv

# Export user messages containing "hello"
curl "http://localhost:3000/api/chats/export?search=hello&messageType=user" > hello_messages.json
```

### Viewing Statistics

#### Basic Statistics
```bash
curl "http://localhost:3000/api/chats/stats"
```

#### Detailed Statistics
```bash
curl "http://localhost:3000/api/chats/detailed-stats"
```

### Clearing Data

#### Clear All Data (⚠️ Dangerous)
```bash
# This requires double confirmation
curl -X DELETE "http://localhost:3000/api/chats/clear?confirm=true"
```

#### Clear Filtered Data
```bash
# Clear only Discord messages
curl -X DELETE "http://localhost:3000/api/chats/clear?platform=discord&confirm=true"

# Clear bot messages containing "error"
curl -X DELETE "http://localhost:3000/api/chats/clear?search=error&messageType=bot&confirm=true"
```

### Dashboard Data Management

The dashboard includes a "Data Management" section with buttons for:
- **Export JSON** - Downloads filtered data as JSON file
- **Export CSV** - Downloads filtered data as CSV file
- **View Stats** - Shows detailed database statistics
- **Clear Filtered** - Deletes currently filtered messages (requires confirmation)
- **Clear All** - Deletes all messages (requires double confirmation)

> **Note**: Export and clear operations respect the current filter settings in the dashboard. Apply filters before using these features to target specific data.

## 🚨 Troubleshooting

### Common Issues

#### Bot Not Responding
1. Check that bot tokens are correct in `.env`
2. Verify network connectivity
3. Check console logs for error messages
4. Ensure bots have proper permissions

#### Database Connection Failed
1. Verify Supabase URL and keys in `.env`
2. Check Supabase project status
3. Ensure database table exists
4. Test connection with `/health` endpoint

#### Dashboard Not Loading Data
1. Check that the Express server is running
2. Verify API endpoints are accessible
3. Check browser console for JavaScript errors
4. Ensure CORS is properly configured

#### Data Export Issues
1. Check that the Express server is running and accessible
2. Verify the export API endpoint responds: `curl http://localhost:3000/api/chats/export`
3. For large datasets, allow time for export processing
4. Check browser download settings if using dashboard export

#### Data Clear/Delete Issues
1. Ensure you're using the `confirm=true` parameter for delete operations
2. Check that filters are applied correctly before clearing
3. Verify database permissions allow DELETE operations
4. Check console logs for detailed error messages

#### Button States in Dashboard
1. If buttons remain in "Processing..." state, refresh the page
2. Check browser console for JavaScript errors
3. Verify all API endpoints are accessible
4. Clear browser cache if experiencing persistent issues

### Debug Mode
Set `NODE_ENV=development` in your `.env` file for detailed error messages and stack traces.

### Logs
Monitor console output for:
- Bot connection status
- Message logging confirmations
- API request/response information
- Error details and stack traces

## 🔄 Development Workflow

### Adding New Features
1. Follow the patterns in `.cursorrules`
2. Use async/await for all database operations
3. Implement proper error handling
4. Add appropriate logging
5. Test with both platforms

### Database Schema Changes
1. Update the SQL schema in this README
2. Run migrations on your Supabase instance
3. Update the `normalizeMessage` function if needed
4. Test with sample data

## 📈 Scaling Considerations

### Production Deployment
- Use environment variables for all configuration
- Enable HTTPS and security headers
- Implement rate limiting (already included)
- Set up monitoring and logging
- Use connection pooling for database
- Consider using webhooks for Telegram in production

### Performance Optimization
- Database indexes are included for common queries
- Pagination prevents large data transfers
- Client-side caching reduces API calls
- Auto-refresh updates only statistics

## 📄 License

MIT License - feel free to use this project for learning and development purposes.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Follow the coding standards in `.cursorrules`
4. Add appropriate tests
5. Submit a pull request

## 📞 Support

For issues and questions:
1. Check the troubleshooting section
2. Review console logs for errors
3. Verify your environment configuration
4. Check that all services are running

---

**Happy Learning! 🚀** This assistant will help you collect valuable conversation data for AI training. The more conversations you have, the better the training data becomes! 