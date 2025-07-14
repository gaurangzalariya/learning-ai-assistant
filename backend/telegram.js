/**
 * Telegram Bot Implementation
 * Forwards messages to a group with topics for organized conversations
 */

const TelegramBot = require('node-telegram-bot-api');
const { logMessage } = require('./supabase');

// Validate required environment variables
if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN is required');
}

// Group configuration - can be personal chat ID or group chat ID
const MANAGEMENT_CHAT_ID = process.env.MANAGEMENT_CHAT_ID || process.env.PERSONAL_TELEGRAM_ID || null;
const USE_TOPICS = process.env.USE_TOPICS === 'true'; // Enable topic-based organization

// Initialize bot
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  polling: {
    interval: 1000,
    autoStart: true,
    params: {
      timeout: 30
    }
  }
});

// Store conversation mappings
const conversationMap = new Map(); // Maps your personal messages to original chat IDs
const pendingReplies = new Map(); // Maps original chat IDs to user info for context
const forwardedMessageMap = new Map(); // Maps forwarded message IDs to original chat IDs
const userTopics = new Map(); // Maps user chat IDs to their topic thread IDs
const topicUsers = new Map(); // Maps topic thread IDs to user chat IDs (reverse lookup)
let managementChatVerified = false; // Track if management chat is working

/**
 * Test connection to management chat (personal or group)
 */
async function testManagementChat() {
  if (!MANAGEMENT_CHAT_ID) {
    console.log('⚠️ MANAGEMENT_CHAT_ID not set in .env file');
    return false;
  }

  try {
    console.log(`🔍 Testing connection to management chat: ${MANAGEMENT_CHAT_ID}`);
    
    const testMessage = `🤖 Bot Setup Complete!

✅ Your bot is now connected to this ${USE_TOPICS ? 'group with topics' : 'chat'}
📱 You'll receive forwarded messages here
💬 ${USE_TOPICS ? '*Just type normally in each user\'s topic*' : '*Reply directly to messages*'} in ${USE_TOPICS ? 'each user\'s topic' : 'this chat'}

${USE_TOPICS ? `🧵 *Topic Mode Enabled:*
• Each user gets their own topic thread
• Just type messages normally - no need to reply!
• Much better organization for multiple conversations

` : ''}Commands:
/test - Test connection
/help - Show help
/info [chatId] - Get user details
${USE_TOPICS ? '/topics - List all user topics' : ''}`;
    
    await bot.sendMessage(MANAGEMENT_CHAT_ID, testMessage);
    console.log('✅ Management chat connection successful!');
    managementChatVerified = true;
    return true;
    
  } catch (error) {
    console.error('❌ Failed to send test message to management chat:', error.message);
    managementChatVerified = false;
    
    if (error.message.includes('chat not found')) {
      console.log('\n🔧 TROUBLESHOOTING:');
      console.log('1. For personal chat: Send /start to your bot first');
      console.log('2. For group: Add the bot to your group and make it admin');
      console.log('3. Get chat ID and add MANAGEMENT_CHAT_ID=your_chat_id to .env');
      console.log('4. For topics: Enable "Topics" in group settings');
      console.log('5. Add USE_TOPICS=true to .env file');
      console.log('6. Restart the server\n');
    }
    
    return false;
  }
}

/**
 * Setup management chat ID automatically
 */
async function setupManagementChatId(msg) {
  if (msg.from?.is_bot) return;
  
  console.log(`🔧 Setting up management chat ID: ${msg.chat.id}`);
  
  try {
    const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';
    
    const setupMessage = `🚀 *Setup Complete!*

Your ${isGroup ? 'group' : 'personal'} chat ID has been detected: \`${msg.chat.id}\`

To complete setup:
1. Add this to your .env file:
   \`MANAGEMENT_CHAT_ID=${msg.chat.id}\`
${isGroup ? `2. *For better organization, enable Topics:*
   • Go to group settings → Topics → Enable
   • Add \`USE_TOPICS=true\` to your .env file
   • Each user will get their own topic thread!
3.` : '2.'} Restart your server
${isGroup ? '4.' : '3.'} Send /test to verify the connection

${isGroup ? 'The bot will create separate topics for each user!' : 'The bot will forward all user messages to this chat!'}`;

    await bot.sendMessage(msg.chat.id, setupMessage, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Failed to send setup message:', error);
  }
}

/**
 * Create or get topic for a user in the group
 */
async function getOrCreateUserTopic(chatId, username) {
  if (!USE_TOPICS) return null;
  
  const userKey = chatId.toString();
  
  // Check if we already have a topic for this user
  if (userTopics.has(userKey)) {
    return userTopics.get(userKey);
  }
  
  try {
    // Try to create a new forum topic for this user
    const topicName = `💬 ${username} (${chatId})`;
    
    const result = await bot.createForumTopic(MANAGEMENT_CHAT_ID, topicName, {
      icon_custom_emoji_id: null // You can add a custom emoji if needed
    });
    
    const topicId = result.message_thread_id;
    userTopics.set(userKey, topicId);
    topicUsers.set(topicId, userKey); // Store reverse lookup
    
    console.log(`🧵 Created new topic for ${username}: ${topicName} (ID: ${topicId})`);
    
    // Send welcome message in the new topic
    await bot.sendMessage(MANAGEMENT_CHAT_ID, `🎉 *New conversation started*

👤 User: ${username}
🆔 Chat ID: ${chatId}
🧵 This topic is dedicated to your conversation with this user.

💬 *Just type your messages normally in this topic - they'll be sent automatically!*`, 
      { 
        message_thread_id: topicId,
        parse_mode: 'Markdown'
      });
    
    return topicId;
    
  } catch (error) {
    console.error(`❌ Failed to create topic for ${username}:`, error.message);
    
    if (error.message.includes('not enough rights') || error.message.includes('not found') || error.message.includes('forum')) {
      
      // FALLBACK: Send a helpful message about manual topic creation
      const helpMessage = `🧵 *Manual Topic Creation Needed*

I couldn't auto-create a topic for *${username}* due to permissions.

*Quick Fix:*
1. Tap "+" in your group to create a new topic
2. Name it: "💬 ${username} (${chatId})"
3. I'll detect and use it for future messages!

*OR Enable Auto-Topics:*
• Group Settings → Topics → Enable  
• Make bot admin with "Manage Topics" permission

📱 *For now, messages will go to main chat* with user labels.`;

      // Send to main chat (not as topic since we can't create them)
      try {
        await bot.sendMessage(MANAGEMENT_CHAT_ID, helpMessage, { parse_mode: 'Markdown' });
      } catch (e) {
        console.error('Failed to send help message:', e.message);
      }
      
      console.log('\n🔧 TOPICS TROUBLESHOOTING:');
      console.log('1. Make sure your group has "Topics" enabled in settings');
      console.log('2. Bot must be admin in the group with "Manage Topics" permission');
      console.log('3. Group must support topics (enable in group settings)');
      console.log('4. Alternatively: Create topics manually and I\'ll use them\n');
    }
    
    return null; // Continue without topics for now
  }
}

/**
 * Find existing topic for user by scanning recent messages
 */
async function findExistingUserTopic(chatId, username) {
  // This would require scanning group topics, but Telegram Bot API has limited topic scanning
  // For now, we'll rely on userTopics cache and manual setup
  return null;
}

/**
 * Forward user messages to management chat (with topics if enabled)
 */
async function forwardToManagement(originalMsg) {
  if (!MANAGEMENT_CHAT_ID) {
    console.log('⚠️ MANAGEMENT_CHAT_ID not set - cannot forward messages');
    return;
  }

  if (!managementChatVerified) {
    console.log('⚠️ Management chat not verified - attempting to test connection');
    const success = await testManagementChat();
    if (!success) {
      return;
    }
  }

  try {
    const username = originalMsg.from?.username || originalMsg.from?.first_name || 'Unknown';
    const chatId = originalMsg.chat.id;
    const messageText = originalMsg.text || 'No text content';
    
    let topicId = null;
    let contextMessage = `*${username}*: ${messageText}`;

    // Try to get or create topic if using topics
    if (USE_TOPICS) {
      topicId = await getOrCreateUserTopic(chatId, username);
      if (topicId) {
        contextMessage = `${messageText}`;
      } else {
        // No topic available - use enhanced main chat format
        contextMessage = `*${username}*: ${messageText}`;
      }
    }
    
    // Send the message (with topic if available)
    const messageOptions = topicId ? { message_thread_id: topicId } : {};
    const forwardedMsg = await bot.sendMessage(MANAGEMENT_CHAT_ID, contextMessage, messageOptions);
    
    // Store the mapping for reply detection
    pendingReplies.set(chatId.toString(), {
      username: username,
      originalMessage: messageText,
      forwardedMessageId: forwardedMsg.message_id,
      topicId: topicId,
      timestamp: new Date()
    });
    
    // Map the forwarded message ID to the original chat ID for direct replies
    forwardedMessageMap.set(forwardedMsg.message_id.toString(), chatId.toString());
    
    const location = topicId ? `topic "${username}"` : 'management chat';
    console.log(`📨 Forwarded message from ${username} to ${location} (msg ID: ${forwardedMsg.message_id})`);
    
  } catch (error) {
    console.error('❌ Failed to forward message to management chat:', error.message);
    
    if (error.message.includes('chat not found')) {
      console.log('\n🔧 TROUBLESHOOTING:');
      console.log('1. Send /start to your bot from your management chat first');
      console.log('2. Verify MANAGEMENT_CHAT_ID in .env file');
      console.log('3. For groups: Make sure bot is admin');
      console.log('4. Restart the server after updating .env\n');
      managementChatVerified = false;
    }
  }
}

/**
 * Handle replies from your management chat
 */
async function handleManagementReply(msg) {
  const text = msg.text || '';
  
  // NEW: Check if this is a normal message in a topic thread (not a reply)
  if (USE_TOPICS && msg.message_thread_id && !msg.reply_to_message) {
    const topicId = msg.message_thread_id;
    const targetChatId = topicUsers.get(topicId);
    
    if (targetChatId) {
      try {
        // Send message to user as the bot
        const sentMessage = await bot.sendMessage(targetChatId, text);
        await logMessage('telegram', sentMessage);
        
        // Confirm in the same topic
        await bot.sendMessage(MANAGEMENT_CHAT_ID, `✅ Message sent to ${pendingReplies.get(targetChatId)?.username || 'user'}!`, {
          message_thread_id: topicId,
          reply_to_message_id: msg.message_id
        });
        
        console.log(`✅ Sent topic message to chat ${targetChatId}: "${text}"`);
        
      } catch (error) {
        console.error(`Failed to send topic message to chat ${targetChatId}:`, error.message);
        await bot.sendMessage(MANAGEMENT_CHAT_ID, `❌ Failed to send message: ${error.message}`, {
          message_thread_id: topicId,
          reply_to_message_id: msg.message_id
        });
      }
      return true;
    }
  }
  
  // Check if this is a reply to a forwarded message (existing behavior)
  if (msg.reply_to_message && msg.reply_to_message.message_id) {
    const repliedToMessageId = msg.reply_to_message.message_id.toString();
    const originalChatId = forwardedMessageMap.get(repliedToMessageId);
    
    if (originalChatId) {
      try {
        // Send reply to original user as the bot
        const sentMessage = await bot.sendMessage(originalChatId, text);
        await logMessage('telegram', sentMessage);
        
        // Confirm in management chat
        const confirmOptions = {};
        const userInfo = pendingReplies.get(originalChatId);
        
        if (userInfo?.topicId && USE_TOPICS) {
          confirmOptions.message_thread_id = userInfo.topicId;
        }
        
        await bot.sendMessage(MANAGEMENT_CHAT_ID, `✅ Reply sent to ${userInfo?.username || 'user'}!`, {
          reply_to_message_id: msg.message_id,
          ...confirmOptions
        });
        
        // Don't clean up mappings immediately - keep them for future messages
        // pendingReplies.delete(originalChatId);
        // forwardedMessageMap.delete(repliedToMessageId);
        
        console.log(`✅ Sent reply via direct reply to chat ${originalChatId}: "${text}"`);
        
      } catch (error) {
        console.error(`Failed to send reply to chat ${originalChatId}:`, error.message);
        await bot.sendMessage(MANAGEMENT_CHAT_ID, `❌ Failed to send reply: ${error.message}`, {
          reply_to_message_id: msg.message_id
        });
      }
      return true;
    } else {
      // If no mapping found, but we're in a topic, try to use topic mapping as fallback
      if (USE_TOPICS && msg.message_thread_id) {
        const topicId = msg.message_thread_id;
        const targetChatId = topicUsers.get(topicId);
        
        if (targetChatId) {
          try {
            const sentMessage = await bot.sendMessage(targetChatId, text);
            await logMessage('telegram', sentMessage);
            
            await bot.sendMessage(MANAGEMENT_CHAT_ID, `✅ Reply sent to ${pendingReplies.get(targetChatId)?.username || 'user'}!`, {
              message_thread_id: topicId,
              reply_to_message_id: msg.message_id
            });
            
            console.log(`✅ Sent message to chat ${targetChatId}: "${text}"`);
            return true;
                      } catch (error) {
              console.error(`Failed to send message:`, error.message);
              await bot.sendMessage(MANAGEMENT_CHAT_ID, `❌ Failed to send: ${error.message}`, {
                message_thread_id: topicId,
                reply_to_message_id: msg.message_id
              });
            }
        }
      }
    }
  }
  
  // FALLBACK: Check if it's a legacy reply command: r123456789 your message here
  const replyMatch = text.match(/^r(\d+)\s+(.+)$/);
  if (replyMatch) {
    const targetChatId = replyMatch[1];
    const replyText = replyMatch[2];
    
    try {
      // Send reply to original user as the bot
      const sentMessage = await bot.sendMessage(targetChatId, replyText);
      await logMessage('telegram', sentMessage);
      
      // Confirm to management chat
      await bot.sendMessage(MANAGEMENT_CHAT_ID, `✅ Reply sent to ${pendingReplies.get(targetChatId)?.username || 'user'}: "${replyText}"`);
      
      // Clean up pending reply
      pendingReplies.delete(targetChatId);
      
      console.log(`✅ Sent reply to chat ${targetChatId}: "${replyText}"`);
      
    } catch (error) {
      console.error(`Failed to send reply to chat ${targetChatId}:`, error.message);
      await bot.sendMessage(MANAGEMENT_CHAT_ID, `❌ Failed to send reply: ${error.message}`);
    }
    return true;
  }
  
  return false;
}

/**
 * Handle info commands from your personal account
 */
async function handleInfoCommand(msg) {
  const text = msg.text || '';
  const infoMatch = text.match(/^\/info\s+(\d+)$/);
  
  if (infoMatch) {
    const chatId = infoMatch[1];
    const pendingInfo = pendingReplies.get(chatId);
    
    if (pendingInfo) {
      const infoMessage = `👤 User Info for Chat ID: ${chatId}
      
📝 Username: ${pendingInfo.username}
💬 Last Message: "${pendingInfo.originalMessage}"
🕒 Received: ${pendingInfo.timestamp.toLocaleString()}

💡 Reply with: r${chatId} your message here`;
      
      await bot.sendMessage(MANAGEMENT_CHAT_ID, infoMessage);
    } else {
      await bot.sendMessage(MANAGEMENT_CHAT_ID, `❌ No pending conversation found for chat ID: ${chatId}`);
    }
    return true;
  }
  
  return false;
}

/**
 * Handle bot errors
 */
bot.on('error', (error) => {
  console.error('Telegram bot error:', {
    message: error.message,
    code: error.code,
    timestamp: new Date().toISOString()
  });
});

/**
 * Handle polling errors
 */
bot.on('polling_error', (error) => {
  console.error('Telegram polling error:', {
    message: error.message,
    code: error.code,
    timestamp: new Date().toISOString()
  });
});

/**
 * Log all incoming messages and handle forwarding/replies
 */
bot.on('message', async (msg) => {
  try {
    const messageType = msg.from?.is_bot ? 'bot' : 'user';
    const username = msg.from?.username || msg.from?.first_name || 'Unknown';
    const preview = msg.text?.substring(0, 50) || 'No text';
    
    // SETUP MODE: If no MANAGEMENT_CHAT_ID is set, any message will trigger setup
    if (!MANAGEMENT_CHAT_ID && !msg.from?.is_bot) {
      await setupManagementChatId(msg);
      return;
    }
    
    // Handle messages from your personal account (replies) - DON'T LOG THESE
    if (MANAGEMENT_CHAT_ID && msg.chat.id.toString() === MANAGEMENT_CHAT_ID.toString() && !msg.from?.is_bot) {
      
      // Handle reply commands
      if (await handleManagementReply(msg)) {
        return;
      }
      
      // Handle info commands
      if (await handleInfoCommand(msg)) {
        return;
      }
      
      // Handle test command
      if (msg.text === '/test') {
        await bot.sendMessage(MANAGEMENT_CHAT_ID, '✅ Management chat connection is working! Bot is ready to forward messages.');
        return;
      }
      
              // Handle topics command (if topics enabled)
        if (msg.text === '/topics' && USE_TOPICS) {
          if (userTopics.size === 0) {
            const helpMessage = `📝 *No user topics created yet*

🔧 *To create topics manually:*
1. Tap "+" in your group
2. Create topic: "💬 Username (ChatID)"
3. Send /link_topic [chatId] [topicId] to connect them

📋 *Recent users to create topics for:*`;

            let recentUsers = '';
            for (const [chatId, userInfo] of pendingReplies.entries()) {
              recentUsers += `\n• ${userInfo.username} (${chatId})`;
            }

            await bot.sendMessage(MANAGEMENT_CHAT_ID, helpMessage + (recentUsers || '\n• No recent users'), { parse_mode: 'Markdown' });
            return;
          }
          
          let topicsList = '🧵 *Active User Topics:*\n\n';
          for (const [chatId, topicId] of userTopics.entries()) {
            const userInfo = pendingReplies.get(chatId);
            const username = userInfo?.username || 'Unknown';
            topicsList += `• ${username} (${chatId}) - Topic ID: ${topicId}\n`;
          }
          
          topicsList += '\n💡 Click on any topic in the group to view that conversation!';
          
          await bot.sendMessage(MANAGEMENT_CHAT_ID, topicsList, { parse_mode: 'Markdown' });
          return;
        }

        // Handle manual topic linking
        const linkMatch = msg.text?.match(/^\/link_topic\s+(\d+)\s+(\d+)$/);
        if (linkMatch && USE_TOPICS) {
          const chatId = linkMatch[1];
          const topicId = parseInt(linkMatch[2]);
          
          userTopics.set(chatId, topicId);
          topicUsers.set(topicId, chatId); // Store reverse lookup
          
          await bot.sendMessage(MANAGEMENT_CHAT_ID, `✅ *Topic linked successfully!*

👤 User Chat ID: ${chatId}
🧵 Topic ID: ${topicId}

Future messages from this user will go to this topic!`, { parse_mode: 'Markdown' });
          return;
        }

        // Handle help command for management account
        if (msg.text === '/help' || msg.text === 'help') {
          const helpMessage = `🔧 Management ${USE_TOPICS ? 'Group' : 'Chat'} Commands:

${USE_TOPICS ? `🧵 *Topic Mode (ENABLED):*
✨ Each user gets their own topic thread!
📝 Just type messages normally in each topic
🎯 Perfect organization for multiple conversations

` : ''}📱 *Reply to users:*
${USE_TOPICS ? '✨ Simply type your message in the user\'s topic thread!' : '✨ Simply reply directly to forwarded messages!'}
📝 Alternative: Reply directly to forwarded messages
📝 Legacy format: r[chatId] your message here

📋 *Get user info:*
/info [chatId] - Get details about a user
Example: /info 123456789

${USE_TOPICS ? `🧵 *Topics:*
/topics - List all active user topics
/link_topic [chatId] [topicId] - Link existing topic to user

` : ''}🔧 *Test connection:*
/test - Check if bot can send messages

💡 *How it works:*
1. Users message your bot → ${USE_TOPICS ? 'forwarded to separate topics' : 'forwarded to this chat'}
2. ${USE_TOPICS ? 'Type your message normally in their topic thread' : 'Reply directly to the forwarded message'}
3. Your message gets sent as the bot automatically!

💡 *Tips:*
${USE_TOPICS ? '• *EASIEST*: Just type normally in each user\'s topic - automatic delivery!' : '• *NEW*: Just tap "Reply" on forwarded messages - no chat IDs needed!'}
${USE_TOPICS ? '• Each user has their own topic thread for perfect organization' : ''}
• Legacy: Use 'r' + chat ID + message (no spaces)
• Chat IDs are shown in forwarded messages for reference

🤖 All your replies will be sent as the bot and logged for AI training!`;
          
          await bot.sendMessage(MANAGEMENT_CHAT_ID, helpMessage);
          return;
        }
      
      return; // Don't process other personal account messages
    }
    
    // Handle messages to the bot from other users (LOG THESE)
    if (!msg.from?.is_bot && (!MANAGEMENT_CHAT_ID || msg.chat.id.toString() !== MANAGEMENT_CHAT_ID?.toString())) {
      // Log user messages to the bot
      await logMessage('telegram', msg);
      console.log(`📱 Telegram ${messageType} message logged: ${username} - "${preview}..."`);
      console.log(`💬 New message from ${username} in chat ${msg.chat.id}`);
      
      // Forward to your personal account
      await forwardToManagement(msg);
    }
    
  } catch (error) {
    console.error('Failed to process Telegram message:', error);
  }
});

/**
 * Handle /start command
 */
bot.onText(/\/start/, async (msg) => {
  // If no personal chat ID is set, this could be the setup message
  if (!MANAGEMENT_CHAT_ID && !msg.from?.is_bot) {
    await setupManagementChatId(msg);
    return;
  }
  
  // Skip if it's from personal account
  if (MANAGEMENT_CHAT_ID && msg.chat.id.toString() === MANAGEMENT_CHAT_ID.toString()) {
    return;
  }
  
  const chatId = msg.chat.id;
  
  try {
    // Log the user's /start command
    await logMessage('telegram', msg);
    
    const welcomeMessage = `👋 Hello! 

This bot connects you with a human for conversation. Your messages will be forwarded to a real person who will respond personally.

All conversations are logged for AI training to help improve future responses.

Start chatting! 💬`;

    const sentMessage = await bot.sendMessage(chatId, welcomeMessage);
    await logMessage('telegram', sentMessage);
    
    const username = msg.from?.username || msg.from?.first_name || 'Unknown';
    console.log(`📱 Telegram user message logged: ${username} - "/start"`);
    console.log(`📱 Sent welcome message to ${username}`);
    
  } catch (error) {
    console.error('Error handling /start command:', error);
  }
});

/**
 * Handle /help command
 */
bot.onText(/\/help/, async (msg) => {
  // Skip if it's from personal account  
  if (MANAGEMENT_CHAT_ID && msg.chat.id.toString() === MANAGEMENT_CHAT_ID.toString()) {
    return;
  }
  
  const chatId = msg.chat.id;
  
  try {
    // Log the user's /help command
    await logMessage('telegram', msg);
    
    const helpMessage = `🔧 About this bot:

• This bot connects you with a real person
• Your messages are forwarded to a human who replies personally
• All conversations are saved for AI training
• Just chat naturally - someone will respond!

Commands:
/start - Welcome message
/help - This help message

Questions? Just ask! 😊`;

    const sentMessage = await bot.sendMessage(chatId, helpMessage);
    await logMessage('telegram', sentMessage);
    
    const username = msg.from?.username || msg.from?.first_name || 'Unknown';
    console.log(`📱 Telegram user message logged: ${username} - "/help"`);
    
  } catch (error) {
    console.error('Error handling /help command:', error);
  }
});

console.log('📱 Telegram bot initialized');

// Test personal chat connection on startup
if (MANAGEMENT_CHAT_ID) {
  console.log(`📨 Management chat ID: ${MANAGEMENT_CHAT_ID}`);
  console.log('🔍 Testing management chat connection...');
  
  // Test connection after a short delay
  setTimeout(async () => {
    await testManagementChat();
  }, 2000);
} else {
  console.log('⚠️ MANAGEMENT_CHAT_ID not set - setup mode enabled');
  console.log('💡 Send /start to your bot from your management chat to get your chat ID');
}

module.exports = { bot }; 