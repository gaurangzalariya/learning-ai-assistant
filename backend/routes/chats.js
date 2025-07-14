/**
 * Chat API Routes
 * Provides endpoints for retrieving and managing chat messages
 */

const express = require('express');
const { getMessages, exportMessages, clearMessages, getDatabaseStats } = require('../supabase');

const router = express.Router();

/**
 * GET /api/chats
 * Retrieve chat messages with pagination and filtering
 * 
 * Query parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 50, max: 100)
 * - platform: Filter by platform ('telegram' or 'discord')
 * - search: Search in message text
 * - messageType: Filter by message type ('user' or 'bot')
 * - sortBy: Sort field (default: 'created_at')
 * - sortOrder: Sort order ('asc' or 'desc', default: 'desc')
 */
router.get('/', async (req, res) => {
  try {
    // Extract and validate query parameters
    const {
      page = 1,
      limit = 50,
      platform,
      search,
      messageType,
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = req.query;

    // Validate pagination parameters
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({
        success: false,
        error: 'Page must be a positive integer',
        code: 'INVALID_PAGE'
      });
    }

    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        success: false,
        error: 'Limit must be between 1 and 100',
        code: 'INVALID_LIMIT'
      });
    }

    // Validate platform filter
    if (platform && !['telegram', 'discord'].includes(platform)) {
      return res.status(400).json({
        success: false,
        error: 'Platform must be either "telegram" or "discord"',
        code: 'INVALID_PLATFORM'
      });
    }

    // Validate message type filter
    if (messageType && !['user', 'bot'].includes(messageType)) {
      return res.status(400).json({
        success: false,
        error: 'Message type must be either "user" or "bot"',
        code: 'INVALID_MESSAGE_TYPE'
      });
    }

    // Get messages from database
    const result = await getMessages({
      page: pageNum,
      limit: limitNum,
      platform,
      search: search ? search.trim() : undefined,
      messageType,
      sortBy,
      sortOrder
    });

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      filters: {
        platform: platform || null,
        search: search || null,
        messageType: messageType || null
      }
    });

  } catch (error) {
    console.error('Error fetching chat messages:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch chat messages',
      code: 'FETCH_MESSAGES_ERROR'
    });
  }
});

/**
 * GET /api/chats/stats
 * Get statistics about chat messages
 */
router.get('/stats', async (req, res) => {
  try {
    const { supabase } = require('../supabase');

    // Get total message count
    const { count: totalMessages, error: totalError } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true });

    if (totalError) throw totalError;

    // Get platform breakdown
    const { data: platformStats, error: platformError } = await supabase
      .from('messages')
      .select('platform')
      .then(async ({ data, error }) => {
        if (error) throw error;
        
        const stats = data.reduce((acc, msg) => {
          acc[msg.platform] = (acc[msg.platform] || 0) + 1;
          return acc;
        }, {});
        
        return { data: stats, error: null };
      });

    if (platformError) throw platformError;

    // Get message type breakdown
    const { data: typeStats, error: typeError } = await supabase
      .from('messages')
      .select('message_type')
      .then(async ({ data, error }) => {
        if (error) throw error;
        
        const stats = data.reduce((acc, msg) => {
          acc[msg.message_type] = (acc[msg.message_type] || 0) + 1;
          return acc;
        }, {});
        
        return { data: stats, error: null };
      });

    if (typeError) throw typeError;

    // Get recent activity (last 24 hours)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const { count: recentMessages, error: recentError } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', yesterday.toISOString());

    if (recentError) throw recentError;

    res.json({
      success: true,
      data: {
        totalMessages: totalMessages || 0,
        recentMessages: recentMessages || 0,
        platformBreakdown: platformStats || {},
        messageTypeBreakdown: typeStats || {},
        lastUpdated: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error fetching chat statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch chat statistics',
      code: 'FETCH_STATS_ERROR'
    });
  }
});

/**
 * GET /api/chats/export
 * Export all messages with optional filtering
 * 
 * Query parameters:
 * - platform: Filter by platform ('telegram' or 'discord')
 * - messageType: Filter by message type ('user' or 'bot')
 * - dateFrom: Start date (ISO string)
 * - dateTo: End date (ISO string)
 * - format: Export format ('json' or 'csv', default: 'json')
 */
router.get('/export', async (req, res) => {
  try {
    const { platform, messageType, dateFrom, dateTo, format = 'json' } = req.query;

    // Build filters object
    const filters = {};
    if (platform) filters.platform = platform;
    if (messageType) filters.messageType = messageType;
    if (dateFrom) filters.dateFrom = dateFrom;
    if (dateTo) filters.dateTo = dateTo;

    const { data, error } = await exportMessages(filters);

    if (error) {
      throw error;
    }

    if (format === 'csv') {
      // Convert to CSV format
      if (data.length === 0) {
        return res.status(200)
          .set({
            'Content-Type': 'text/csv',
            'Content-Disposition': 'attachment; filename="messages.csv"'
          })
          .send('No data to export');
      }

      const headers = Object.keys(data[0]).join(',');
      const rows = data.map(row => 
        Object.values(row).map(value => 
          typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value
        ).join(',')
      );
      
      const csv = [headers, ...rows].join('\n');
      
      return res.status(200)
        .set({
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="messages.csv"'
        })
        .send(csv);
    }

    // Default JSON format
    const filename = `messages_${new Date().toISOString().split('T')[0]}.json`;
    res.status(200)
      .set({
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`
      })
      .json({
        success: true,
        data,
        exportInfo: {
          totalMessages: data.length,
          filters,
          exportedAt: new Date().toISOString()
        }
      });

  } catch (error) {
    console.error('Error exporting messages:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export messages',
      code: 'EXPORT_ERROR'
    });
  }
});

/**
 * DELETE /api/chats/clear
 * Clear messages with optional filtering
 * 
 * Query parameters:
 * - platform: Filter by platform ('telegram' or 'discord')
 * - messageType: Filter by message type ('user' or 'bot')
 * - dateFrom: Start date (ISO string)
 * - dateTo: End date (ISO string)
 * - confirm: Must be 'true' to proceed with deletion
 */
router.delete('/clear', async (req, res) => {
  try {
    const { platform, messageType, dateFrom, dateTo, confirm } = req.query;

    // Safety check - require explicit confirmation
    if (confirm !== 'true') {
      return res.status(400).json({
        success: false,
        error: 'Deletion requires explicit confirmation. Add ?confirm=true to proceed.',
        code: 'CONFIRMATION_REQUIRED'
      });
    }

    // Build filters object
    const filters = {};
    if (platform) filters.platform = platform;
    if (messageType) filters.messageType = messageType;
    if (dateFrom) filters.dateFrom = dateFrom;
    if (dateTo) filters.dateTo = dateTo;

    const { count, error } = await clearMessages(filters);

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      message: `Successfully deleted ${count} messages`,
      deletedCount: count,
      filters
    });

  } catch (error) {
    console.error('Error clearing messages:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear messages',
      code: 'CLEAR_ERROR'
    });
  }
});

/**
 * GET /api/chats/detailed-stats
 * Get detailed database statistics
 */
router.get('/detailed-stats', async (req, res) => {
  try {
    const stats = await getDatabaseStats();

    if (stats.error) {
      throw stats.error;
    }

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Error fetching database stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch database statistics',
      code: 'STATS_ERROR'
    });
  }
});



/**
 * GET /api/chats/:id
 * Get a specific message by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { supabase } = require('../supabase');

    if (!id || isNaN(parseInt(id, 10))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid message ID',
        code: 'INVALID_MESSAGE_ID'
      });
    }

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('id', parseInt(id, 10))
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Message not found',
          code: 'MESSAGE_NOT_FOUND'
        });
      }
      throw error;
    }

    res.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('Error fetching message:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch message',
      code: 'FETCH_MESSAGE_ERROR'
    });
  }
});

module.exports = router; 