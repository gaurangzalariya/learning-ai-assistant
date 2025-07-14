/**
 * Discord Bot Implementation  
 * Forwards messages to management server with thread-based organization
 */

const { Client, GatewayIntentBits, Events, ChannelType, Partials } = require('discord.js');
const { logMessage } = require('./supabase');

// Validate required environment variables
if (!process.env.DISCORD_BOT_TOKEN) {
  throw new Error('DISCORD_BOT_TOKEN is required');
}

// Management configuration
const MANAGEMENT_GUILD_ID = process.env.MANAGEMENT_GUILD_ID || null; // Discord Server ID
const MANAGEMENT_CHANNEL_ID = process.env.MANAGEMENT_CHANNEL_ID || null; // Channel ID for conversations
const USE_THREADS = process.env.USE_THREADS !== 'false'; // Enable thread-based organization

// Create Discord client with necessary intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageReactions,
    GatewayIntentBits.DirectMessageTyping
  ],
  partials: [Partials.Channel] // Needed for DMs
});

// Store conversation mappings
const userThreads = new Map(); // Maps user IDs to their thread IDs
const threadUsers = new Map(); // Maps thread IDs to user IDs (reverse lookup)
const pendingReplies = new Map(); // Maps user IDs to user info
let managementChannelVerified = false;

/**
 * Test connection to management channel
 */
async function testManagementChannel() {
  if (!MANAGEMENT_GUILD_ID || !MANAGEMENT_CHANNEL_ID) {
    console.log('⚠️ MANAGEMENT_GUILD_ID or MANAGEMENT_CHANNEL_ID not set in .env file');
    return false;
  }

  try {
    console.log(`🔍 Testing connection to management channel: ${MANAGEMENT_CHANNEL_ID}`);
    
    const guild = await client.guilds.fetch(MANAGEMENT_GUILD_ID);
    const channel = await guild.channels.fetch(MANAGEMENT_CHANNEL_ID);
    
    if (!channel) {
      throw new Error('Management channel not found');
    }
    
    const testMessage = `🤖 **Discord Bot Setup Complete!**

✅ Your bot is now connected to this ${USE_THREADS ? 'channel with threads' : 'channel'}
📱 You'll receive forwarded messages here
💬 ${USE_THREADS ? '*Just type normally in each user\'s thread*' : '*Reply directly to messages*'}

${USE_THREADS ? `🧵 **Thread Mode Enabled:**
• Each user gets their own thread
• Just type messages normally - no need to reply!
• Much better organization for multiple conversations

` : ''}Commands:
!test - Test connection
!help - Show help
!threads - List active user threads (if enabled)`;
    
    await channel.send(testMessage);
    console.log('✅ Management channel connection successful!');
    managementChannelVerified = true;
    return true;
    
  } catch (error) {
    console.error('❌ Failed to send test message to management channel:', error.message);
    managementChannelVerified = false;
    
    console.log('\n🔧 TROUBLESHOOTING:');
    console.log('1. Make sure bot is added to your Discord server');
    console.log('2. Bot needs "Send Messages" and "Create Public Threads" permissions');
    console.log('3. Get server ID and channel ID, add to .env file');
    console.log('4. MANAGEMENT_GUILD_ID=your_server_id');
    console.log('5. MANAGEMENT_CHANNEL_ID=your_channel_id');
    console.log('6. Restart the server\n');
    
    return false;
  }
}

/**
 * Get or create thread for a user
 */
async function getOrCreateUserThread(userId, username) {
  if (!USE_THREADS) return null;
  
  const userKey = userId.toString();
  
  // Check if we already have a thread for this user
  if (userThreads.has(userKey)) {
    const threadId = userThreads.get(userKey);
    try {
      // Verify thread still exists
      const guild = await client.guilds.fetch(MANAGEMENT_GUILD_ID);
      const thread = await guild.channels.fetch(threadId);
      if (thread) {
        return thread;
      }
    } catch (error) {
      // Thread no longer exists, remove from cache
      userThreads.delete(userKey);
      threadUsers.delete(threadId);
    }
  }
  
  try {
    const guild = await client.guilds.fetch(MANAGEMENT_GUILD_ID);
    const channel = await guild.channels.fetch(MANAGEMENT_CHANNEL_ID);
    
    // Create a new thread for this user
    const threadName = `💬 ${username} (${userId})`;
    
    const thread = await channel.threads.create({
      name: threadName,
      autoArchiveDuration: 10080, // 7 days
      type: ChannelType.PublicThread,
      reason: `Conversation thread for user ${username}`
    });
    
    userThreads.set(userKey, thread.id);
    threadUsers.set(thread.id, userKey);
    
    console.log(`🧵 Created new thread for ${username}: ${threadName} (ID: ${thread.id})`);
    
    // Send welcome message in the new thread
    await thread.send(`🎉 **New conversation started**

👤 User: ${username}
🆔 User ID: ${userId}
🧵 This thread is dedicated to your conversation with this user.

💬 *Just type your messages normally in this thread - they'll be sent automatically!*`);
    
    return thread;
    
  } catch (error) {
    console.error(`❌ Failed to create thread for ${username}:`, error.message);
    
    console.log('\n🔧 THREAD TROUBLESHOOTING:');
    console.log('1. Bot needs "Create Public Threads" permission');
    console.log('2. Bot needs "Send Messages in Threads" permission');
    console.log('3. Channel must support threads (text channels do)');
    console.log('4. Set USE_THREADS=false in .env to disable\n');
    
    return null;
  }
}

/**
 * Forward user messages to management channel
 */
async function forwardToManagement(message) {
  if (!MANAGEMENT_GUILD_ID || !MANAGEMENT_CHANNEL_ID) {
    console.log('⚠️ Management channel not configured - cannot forward messages');
    return;
  }

  if (!managementChannelVerified) {
    console.log('⚠️ Management channel not verified - attempting to test connection');
    const success = await testManagementChannel();
    if (!success) {
      return;
    }
  }

  try {
    const username = message.author.username || 'Unknown';
    const userId = message.author.id;
    const messageText = message.content || 'No text content';
    
    let targetChannel = null;
    let contextMessage = messageText;

    // Try to get or create thread if using threads
    if (USE_THREADS) {
      const thread = await getOrCreateUserThread(userId, username);
      if (thread) {
        targetChannel = thread;
        contextMessage = messageText; // Clean message in thread
      }
    }
    
    // Fallback to main channel if no thread
    if (!targetChannel) {
      const guild = await client.guilds.fetch(MANAGEMENT_GUILD_ID);
      targetChannel = await guild.channels.fetch(MANAGEMENT_CHANNEL_ID);
      contextMessage = `**${username}**: ${messageText}`; // Labeled message in main channel
    }
    
    const forwardedMsg = await targetChannel.send(contextMessage);
    
    // Store the mapping for user info
    pendingReplies.set(userId, {
      username: username,
      originalMessage: messageText,
      threadId: targetChannel.id !== MANAGEMENT_CHANNEL_ID ? targetChannel.id : null,
      timestamp: new Date()
    });
    
    const location = targetChannel.id !== MANAGEMENT_CHANNEL_ID ? `thread "${username}"` : 'management channel';
    console.log(`📨 Forwarded message from ${username} to ${location}`);
    
  } catch (error) {
    console.error('❌ Failed to forward message to management channel:', error.message);
    managementChannelVerified = false;
  }
}

/**
 * Handle replies from management channel/threads
 */
async function handleManagementReply(message) {
  const text = message.content || '';
  
  // Skip bot messages
  if (message.author.bot) return false;
  
  // Handle commands
  if (text.startsWith('!')) {
    return await handleManagementCommands(message);
  }
  
  // Check if this is a message in a user thread
  if (USE_THREADS && message.channel.isThread()) {
    const threadId = message.channel.id;
    const targetUserId = threadUsers.get(threadId);
    
    if (targetUserId) {
      try {
        // Find the user and send message
        const user = await client.users.fetch(targetUserId);
        if (user) {
          await user.send(text);
          await logMessage('discord', { 
            id: Date.now(), 
            content: text, 
            author: { id: client.user.id, username: client.user.username, bot: true },
            channel: { id: user.id },
            createdAt: new Date()
          });
          
          // Confirm in thread
          await message.react('✅');
          
          console.log(`✅ Sent message to user ${targetUserId}: "${text}"`);
          return true;
        }
      } catch (error) {
        console.error(`Failed to send message to user ${targetUserId}:`, error.message);
        await message.react('❌');
        await message.reply(`❌ Failed to send message: ${error.message}`);
      }
      return true;
    }
  }
  
  // Handle direct user ID commands: @userId message
  const userIdMatch = text.match(/^@(\d+)\s+(.+)$/);
  if (userIdMatch) {
    const targetUserId = userIdMatch[1];
    const messageText = userIdMatch[2];
    
    try {
      const user = await client.users.fetch(targetUserId);
      if (user) {
        await user.send(messageText);
        await logMessage('discord', {
          id: Date.now(),
          content: messageText,
          author: { id: client.user.id, username: client.user.username, bot: true },
          channel: { id: user.id },
          createdAt: new Date()
        });
        
        await message.react('✅');
        console.log(`✅ Sent message to user ${targetUserId}: "${messageText}"`);
        return true;
      }
    } catch (error) {
      console.error(`Failed to send message to user ${targetUserId}:`, error.message);
      await message.react('❌');
      await message.reply(`❌ Failed to send message: ${error.message}`);
    }
    return true;
  }
  
  return false;
}

/**
 * Handle management commands
 */
async function handleManagementCommands(message) {
  const command = message.content.toLowerCase();
  
  if (command === '!test') {
    await message.reply('✅ Management channel connection is working! Bot is ready to forward messages.');
    return true;
  }
  
  if (command === '!threads' && USE_THREADS) {
    if (userThreads.size === 0) {
      await message.reply('📝 No user threads created yet. Threads will be created automatically when users first message the bot.');
      return true;
    }
    
    let threadsList = '🧵 **Active User Threads:**\n\n';
    for (const [userId, threadId] of userThreads.entries()) {
      const userInfo = pendingReplies.get(userId);
      const username = userInfo?.username || 'Unknown';
      threadsList += `• ${username} (${userId}) - <#${threadId}>\n`;
    }
    
    await message.reply(threadsList);
    return true;
  }
  
  if (command === '!help') {
    const helpMessage = `🔧 **Management ${USE_THREADS ? 'Server' : 'Channel'} Commands:**

${USE_THREADS ? `🧵 **Thread Mode (ENABLED):**
✨ Each user gets their own thread!
📝 Just type messages normally in each thread
🎯 Perfect organization for multiple conversations

` : ''}📱 **Reply to users:**
${USE_THREADS ? '✨ Simply type your message in the user\'s thread!' : '✨ Use @userId your message here'}
📝 Alternative: @userId your message here

🔧 **Commands:**
!test - Test connection
!help - Show this help
${USE_THREADS ? '!threads - List all active user threads' : ''}

💡 **How it works:**
1. Users message your bot → ${USE_THREADS ? 'forwarded to separate threads' : 'forwarded to this channel'}
2. ${USE_THREADS ? 'Type your message normally in their thread' : 'Use @userId format to reply'}
3. Your message gets sent as the bot automatically!

🤖 All conversations are logged for AI training!`;
    
    await message.reply(helpMessage);
    return true;
  }
  
  return false;
}

/**
 * Debug DM channel creation
 */
client.on(Events.ChannelCreate, (channel) => {
  if (channel.type === ChannelType.DM) {
    console.log(`🔍 DEBUG: DM channel created with user: ${channel.recipient?.username}`);
  }
});

/**
 * Bot ready event
 */
client.once(Events.ClientReady, (readyClient) => {
  console.log(`🎮 Discord bot logged in as ${readyClient.user.tag}`);
  
  // Set bot activity status and online presence
  client.user.setPresence({
    activities: [{ name: 'Forwarding conversations 📬', type: 3 }], // type 3 = WATCHING
    status: 'online'
  });
  
  // Force status update every 5 minutes (optional)
  setInterval(() => {
    client.user.setPresence({
      activities: [{ name: 'Forwarding conversations 📬', type: 3 }],
      status: 'online'
    });
  }, 5 * 60 * 1000);
  
  // Test management channel connection after a short delay
  if (MANAGEMENT_GUILD_ID && MANAGEMENT_CHANNEL_ID) {
    console.log(`📨 Management server: ${MANAGEMENT_GUILD_ID}, channel: ${MANAGEMENT_CHANNEL_ID}`);
    console.log('🔍 Testing management channel connection...');
    
    setTimeout(async () => {
      await testManagementChannel();
    }, 2000);
  } else {
    console.log('⚠️ Management server/channel not configured - setup mode enabled');
    console.log('💡 Add MANAGEMENT_GUILD_ID and MANAGEMENT_CHANNEL_ID to .env file');
  }
});

/**
 * Handle incoming messages
 */
client.on(Events.MessageCreate, async (message) => {
  try {
    const messageType = message.author.bot ? 'bot' : 'user';
    const username = message.author.username;
    const preview = message.content?.substring(0, 50) || 'No content';
    
    // DEBUG: Log ALL incoming messages
    console.log(`🔍 DEBUG: Message received - Type: ${message.channel.type}, From: ${username}, Bot: ${message.author.bot}, Content: "${preview}"`);
    console.log(`🔍 DEBUG: Channel details - ID: ${message.channel.id}, Guild: ${message.guild?.id || 'DM'}`);;
    
    // Handle messages from management server/channel - DON'T LOG THESE
    if (MANAGEMENT_GUILD_ID && message.guild?.id === MANAGEMENT_GUILD_ID) {
      await handleManagementReply(message);
      return;
    }
    
    // Handle DMs to the bot from users (LOG THESE)
    if (message.channel.type === ChannelType.DM && !message.author.bot) {
      // Log user messages to the bot
      await logMessage('discord', message);
      console.log(`🎮 Discord ${messageType} message logged: ${username} - "${preview}..."`);
      console.log(`💬 New DM from ${username} (${message.author.id})`);
      
      // Forward to management channel
      await forwardToManagement(message);
      return;
    }
    
    // Handle mentions in servers (if not management server)
    if (message.mentions.has(client.user) && !message.author.bot && message.guild?.id !== MANAGEMENT_GUILD_ID) {
      const content = message.content?.toLowerCase() || '';
      
      if (content.includes('what') || content.includes('who') || content.includes('help')) {
        // Log the mention
        await logMessage('discord', message);
        
        const response = `👋 Hi! I'm a conversation logging bot. 

• A human reads messages and replies personally
• All conversations are saved for AI training  
• Send me a DM to start chatting!

💬 Just message me directly and someone will respond! 😊`;

        const sentMessage = await message.reply(response);
        await logMessage('discord', sentMessage);
        
        console.log(`🎮 Discord user message logged: ${username} - "${preview}..."`);
        console.log(`📱 Sent mention response to ${username}`);
      }
    }
    
  } catch (error) {
    console.error('Failed to process Discord message:', error);
  }
});

/**
 * Handle bot errors
 */
client.on(Events.Error, (error) => {
  console.error('Discord client error:', {
    message: error.message,
    timestamp: new Date().toISOString()
  });
});

/**
 * Handle rate limit warnings
 */
client.on(Events.Warn, (warning) => {
  console.warn('Discord client warning:', warning);
});

// Login to Discord
client.login(process.env.DISCORD_BOT_TOKEN)
  .then(() => {
    console.log('🎮 Discord bot login successful - conversation forwarding enabled');
    console.log('💡 Messages will be forwarded to your management server with thread organization');
  })
  .catch((error) => {
    console.error('❌ Discord bot login failed:', error);
  });

module.exports = client; 