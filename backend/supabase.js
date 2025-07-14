/**
 * Supabase client configuration for the Learning AI Assistant
 * Handles database connections and provides helper functions for message logging
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Validate required environment variables
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

// Initialize Supabase client with service key for backend operations
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

/**
 * Normalize message data from different platforms into consistent format
 * @param {string} platform - 'telegram' or 'discord'
 * @param {Object} messageData - Raw message data from platform
 * @returns {Object} Normalized message object
 */
function normalizeMessage(platform, messageData) {
  const baseMessage = {
    platform,
    created_at: new Date().toISOString(),
    raw_data: messageData
  };

  if (platform === 'telegram') {
    return {
      ...baseMessage,
      platform_message_id: messageData.message_id?.toString(),
      user_id: messageData.from?.id?.toString(),
      username: messageData.from?.username || messageData.from?.first_name,
      message_text: messageData.text || messageData.caption || null,
      message_type: messageData.from?.is_bot ? 'bot' : 'user',
      chat_id: messageData.chat?.id?.toString(),
      thread_id: messageData.message_thread_id?.toString() || null
    };
  } else if (platform === 'discord') {
    return {
      ...baseMessage,
      platform_message_id: messageData.id,
      user_id: messageData.author?.id,
      username: messageData.author?.username,
      message_text: messageData.content || null,
      message_type: messageData.author?.bot ? 'bot' : 'user',
      chat_id: messageData.channel?.id || messageData.channelId,
      thread_id: messageData.thread?.id || null
    };
  }

  throw new Error(`Unsupported platform: ${platform}`);
}

/**
 * Log a message to the database
 * @param {string} platform - 'telegram' or 'discord'
 * @param {Object} messageData - Raw message data from platform
 * @returns {Promise<Object>} Database insert result
 */
async function logMessage(platform, messageData) {
  try {
    const normalizedMessage = normalizeMessage(platform, messageData);
    
    const { data, error } = await supabase
      .from('messages')
      .insert(normalizedMessage)
      .select();
    
    if (error) {
      console.error(`Supabase error logging ${platform} message:`, error);
      throw error;
    }
    
    console.log(`Successfully logged ${platform} message:`, data[0]?.id);
    return data[0];
  } catch (error) {
    console.error(`Failed to log ${platform} message:`, error);
    throw error;
  }
}

/**
 * Retrieve messages with pagination and filtering
 * @param {Object} options - Query options
 * @param {number} options.page - Page number (1-based)
 * @param {number} options.limit - Items per page
 * @param {string} options.platform - Filter by platform
 * @param {string} options.search - Search in message text
 * @param {string} options.messageType - Filter by message type
 * @returns {Promise<Object>} Messages and pagination info
 */
async function getMessages(options = {}) {
  try {
    const {
      page = 1,
      limit = 50,
      platform,
      search,
      messageType
    } = options;

    const offset = (page - 1) * limit;
    
    let query = supabase
      .from('messages')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (platform) {
      query = query.eq('platform', platform);
    }
    
    if (messageType) {
      query = query.eq('message_type', messageType);
    }
    
    if (search) {
      query = query.ilike('message_text', `%${search}%`);
    }

    const { data, error, count } = await query;
    
    if (error) {
      console.error('Supabase error retrieving messages:', error);
      throw error;
    }

    return {
      data,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit)
      }
    };
  } catch (error) {
    console.error('Failed to retrieve messages:', error);
    throw error;
  }
}

/**
 * Test database connection
 * @returns {Promise<boolean>} Connection status
 */
async function testConnection() {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('count')
      .limit(1);
    
    if (error) {
      console.error('Database connection test failed:', error);
      return false;
    }
    
    console.log('Database connection successful');
    return true;
  } catch (error) {
    console.error('Database connection test error:', error);
    return false;
  }
}

/**
 * Export all messages with optional filtering
 * @param {Object} filters - Optional filters (platform, dateFrom, dateTo, messageType)
 * @returns {Object} Result with data array
 */
async function exportMessages(filters = {}) {
  try {
    let query = supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: true });

    // Apply filters
    if (filters.platform) {
      query = query.eq('platform', filters.platform);
    }
    
    if (filters.messageType) {
      query = query.eq('message_type', filters.messageType);
    }
    
    if (filters.dateFrom) {
      query = query.gte('created_at', filters.dateFrom);
    }
    
    if (filters.dateTo) {
      query = query.lte('created_at', filters.dateTo);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('Export messages error:', error);
    return { data: null, error };
  }
}

/**
 * Clear all messages with optional filtering
 * @param {Object} filters - Optional filters (platform, dateFrom, dateTo, messageType)
 * @returns {Object} Result with count of deleted messages
 */
async function clearMessages(filters = {}) {
  try {
    // Build query using the working pattern
    let query = supabase.from('messages').delete().select();

    // Apply filters
    if (filters.platform) {
      query = query.eq('platform', filters.platform);
    }
    
    if (filters.messageType) {
      query = query.eq('message_type', filters.messageType);
    }
    
    if (filters.dateFrom) {
      query = query.gte('created_at', filters.dateFrom);
    }
    
    if (filters.dateTo) {
      query = query.lte('created_at', filters.dateTo);
    }

    // If no filters provided, delete everything (with safety WHERE clause)
    const hasFilters = filters.platform || filters.messageType || filters.dateFrom || filters.dateTo;
    if (!hasFilters) {
      query = query.gte('id', 1); // All IDs are >= 1
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return { count: data ? data.length : 0, error: null };
  } catch (error) {
    console.error('Clear messages error:', error);
    return { count: 0, error };
  }
}

/**
 * Get database statistics
 * @returns {Object} Database statistics
 */
async function getDatabaseStats() {
  try {
    // Get total count
    const { count: totalCount, error: totalError } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true });

    if (totalError) throw totalError;

    // Get platform breakdown
    const { data: platforms, error: platformError } = await supabase
      .from('messages')
      .select('platform');

    if (platformError) throw platformError;

    const platformCounts = platforms.reduce((acc, msg) => {
      if (msg.platform) {
        acc[msg.platform] = (acc[msg.platform] || 0) + 1;
      }
      return acc;
    }, {});

    // Get date range
    const { data: oldest, error: oldestError } = await supabase
      .from('messages')
      .select('created_at')
      .order('created_at', { ascending: true })
      .limit(1);

    const { data: newest, error: newestError } = await supabase
      .from('messages')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1);

    return {
      totalMessages: totalCount || 0,
      platformCounts,
      dateRange: {
        oldest: oldest?.[0]?.created_at || null,
        newest: newest?.[0]?.created_at || null
      },
      error: null
    };
  } catch (error) {
    console.error('Database stats error:', error);
    return { error };
  }
}

module.exports = {
  supabase,
  logMessage,
  getMessages,
  normalizeMessage,
  testConnection,
  exportMessages,
  clearMessages,
  getDatabaseStats
}; 