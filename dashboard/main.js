/**
 * Learning AI Assistant Dashboard JavaScript
 * Handles API calls, search, filtering, and pagination
 */

class Dashboard {
  constructor() {
    this.currentPage = 1;
    this.currentFilters = {};
    this.messages = [];
    this.pagination = {};
    this.stats = {};
    
    this.init();
  }

  /**
   * Initialize the dashboard
   */
  async init() {
    console.log('🚀 Initializing Learning AI Assistant Dashboard...');
    
    // Bind event listeners
    this.bindEventListeners();
    
    // Check server health
    await this.checkHealth();
    
    // Load initial data
    await this.loadStats();
    await this.loadMessages();
    
    console.log('✅ Dashboard initialized successfully');
  }

  /**
   * Bind event listeners
   */
  bindEventListeners() {
    // Search input with debounce
    const searchInput = document.getElementById('searchInput');
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        this.currentFilters.search = e.target.value.trim() || undefined;
        this.currentPage = 1;
        this.loadMessages();
      }, 500);
    });

    // Filter dropdowns
    document.getElementById('platformFilter').addEventListener('change', (e) => {
      this.currentFilters.platform = e.target.value || undefined;
      this.currentPage = 1;
      this.loadMessages();
    });

    document.getElementById('messageTypeFilter').addEventListener('change', (e) => {
      this.currentFilters.messageType = e.target.value || undefined;
      this.currentPage = 1;
      this.loadMessages();
    });

    document.getElementById('limitSelect').addEventListener('change', (e) => {
      this.currentFilters.limit = parseInt(e.target.value);
      this.currentPage = 1;
      this.loadMessages();
    });

    // Refresh button
    document.getElementById('refreshBtn').addEventListener('click', () => {
      this.refresh();
    });

    // Export buttons
    document.getElementById('exportJsonBtn').addEventListener('click', () => {
      this.exportData('json');
    });

    document.getElementById('exportCsvBtn').addEventListener('click', () => {
      this.exportData('csv');
    });

    // Clear buttons
    document.getElementById('clearAllBtn').addEventListener('click', () => {
      this.clearData(false);
    });

    document.getElementById('clearFilteredBtn').addEventListener('click', () => {
      this.clearData(true);
    });

    // Stats button
    document.getElementById('showStatsBtn').addEventListener('click', () => {
      this.showDatabaseStats();
    });

    // Auto-refresh every 30 seconds
    setInterval(() => {
      this.loadStats();
    }, 30000);
  }

  /**
   * Check server health
   */
  async checkHealth() {
    try {
      const response = await fetch('/health');
      const data = await response.json();
      
      const statusIndicator = document.getElementById('statusIndicator');
      const statusText = document.getElementById('statusText');
      
      if (data.success && data.database === 'connected') {
        statusIndicator.className = 'status-indicator status-online';
        statusText.textContent = 'Online';
      } else {
        statusIndicator.className = 'status-indicator status-offline';
        statusText.textContent = 'Database Offline';
      }
    } catch (error) {
      console.error('Health check failed:', error);
      const statusIndicator = document.getElementById('statusIndicator');
      const statusText = document.getElementById('statusText');
      statusIndicator.className = 'status-indicator status-offline';
      statusText.textContent = 'Server Offline';
    }
  }

  /**
   * Load statistics
   */
  async loadStats() {
    try {
      const response = await fetch('/api/chats/stats');
      const data = await response.json();
      
      if (data.success) {
        this.stats = data.data;
        this.updateStatsCards();
      } else {
        console.error('Failed to load stats:', data.error);
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  }

  /**
   * Update statistics cards
   */
  updateStatsCards() {
    document.getElementById('totalMessages').textContent = this.stats.totalMessages || 0;
    document.getElementById('telegramMessages').textContent = this.stats.platformBreakdown?.telegram || 0;
    document.getElementById('discordMessages').textContent = this.stats.platformBreakdown?.discord || 0;
    document.getElementById('recentMessages').textContent = this.stats.recentMessages || 0;
  }

  /**
   * Load messages with current filters and pagination
   */
  async loadMessages() {
    this.showLoading(true);
    
    try {
      const params = new URLSearchParams({
        page: this.currentPage,
        limit: this.currentFilters.limit || 50,
        ...this.currentFilters
      });

      const response = await fetch(`/api/chats?${params}`);
      const data = await response.json();
      
      if (data.success) {
        this.messages = data.data;
        this.pagination = data.pagination;
        this.renderMessages();
        this.renderPagination();
        this.updateMessageCount();
      } else {
        console.error('Failed to load messages:', data.error);
        this.showError('Failed to load messages');
      }
    } catch (error) {
      console.error('Error loading messages:', error);
      this.showError('Network error occurred');
    } finally {
      this.showLoading(false);
    }
  }

  /**
   * Render messages in the table
   */
  renderMessages() {
    const tbody = document.getElementById('messagesTableBody');
    const emptyState = document.getElementById('emptyState');
    
    if (this.messages.length === 0) {
      tbody.innerHTML = '';
      emptyState.classList.remove('d-none');
      return;
    }
    
    emptyState.classList.add('d-none');
    
    tbody.innerHTML = this.messages.map(message => `
      <tr class="message-card ${message.platform}" data-message-id="${message.id}">
        <td>
          <span class="badge platform-badge ${message.platform}">
            <i class="bi bi-${message.platform === 'telegram' ? 'telegram' : 'discord'}"></i>
            ${message.platform}
          </span>
        </td>
        <td>
          <div class="d-flex align-items-center">
            <div class="me-2">
              <i class="bi bi-person-circle fs-5"></i>
            </div>
            <div>
              <div class="fw-semibold">${this.escapeHtml(message.username || 'Unknown')}</div>
              <small class="text-muted">${message.user_id || 'N/A'}</small>
            </div>
          </div>
        </td>
        <td>
          <span class="badge ${message.message_type === 'user' ? 'bg-primary' : 'bg-secondary'}">
            <i class="bi bi-${message.message_type === 'user' ? 'person' : 'robot'}"></i>
            ${message.message_type}
          </span>
        </td>
        <td>
          <div class="message-content">
            ${this.formatMessageText(message.message_text)}
          </div>
        </td>
        <td>
          <div class="text-muted">
            <i class="bi bi-clock"></i>
            <div>${this.formatDate(message.created_at)}</div>
            <small>${this.formatTime(message.created_at)}</small>
          </div>
        </td>
      </tr>
    `).join('');
    
    // Add click handlers for message details
    tbody.querySelectorAll('tr[data-message-id]').forEach(row => {
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => {
        const messageId = row.dataset.messageId;
        this.showMessageDetails(messageId);
      });
    });
  }

  /**
   * Format message text for display
   */
  formatMessageText(text) {
    if (!text) return '<em class="text-muted">No text content</em>';
    
    const escaped = this.escapeHtml(text);
    const truncated = escaped.length > 100 ? escaped.substring(0, 100) + '...' : escaped;
    
    return `<span class="message-text">${truncated}</span>`;
  }

  /**
   * Format date for display
   */
  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  }

  /**
   * Format time for display
   */
  formatTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleTimeString();
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe;
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /**
   * Render pagination
   */
  renderPagination() {
    const pagination = document.getElementById('pagination');
    const { page, totalPages } = this.pagination;
    
    if (totalPages <= 1) {
      pagination.innerHTML = '';
      return;
    }
    
    let html = '';
    
    // Previous button
    html += `
      <li class="page-item ${page === 1 ? 'disabled' : ''}">
        <a class="page-link" href="#" data-page="${page - 1}">
          <i class="bi bi-chevron-left"></i>
        </a>
      </li>
    `;
    
    // Page numbers
    const startPage = Math.max(1, page - 2);
    const endPage = Math.min(totalPages, page + 2);
    
    if (startPage > 1) {
      html += `<li class="page-item"><a class="page-link" href="#" data-page="1">1</a></li>`;
      if (startPage > 2) {
        html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
      }
    }
    
    for (let i = startPage; i <= endPage; i++) {
      html += `
        <li class="page-item ${i === page ? 'active' : ''}">
          <a class="page-link" href="#" data-page="${i}">${i}</a>
        </li>
      `;
    }
    
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
      }
      html += `<li class="page-item"><a class="page-link" href="#" data-page="${totalPages}">${totalPages}</a></li>`;
    }
    
    // Next button
    html += `
      <li class="page-item ${page === totalPages ? 'disabled' : ''}">
        <a class="page-link" href="#" data-page="${page + 1}">
          <i class="bi bi-chevron-right"></i>
        </a>
      </li>
    `;
    
    pagination.innerHTML = html;
    
    // Add click handlers
    pagination.querySelectorAll('a[data-page]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const newPage = parseInt(link.dataset.page);
        if (newPage !== this.currentPage) {
          this.currentPage = newPage;
          this.loadMessages();
        }
      });
    });
  }

  /**
   * Update message count display
   */
  updateMessageCount() {
    const messageCount = document.getElementById('messageCount');
    const { total } = this.pagination;
    messageCount.textContent = `${total || 0} message${total !== 1 ? 's' : ''}`;
  }

  /**
   * Show loading state
   */
  showLoading(show) {
    const spinner = document.getElementById('loadingSpinner');
    if (show) {
      spinner.style.display = 'block';
    } else {
      spinner.style.display = 'none';
    }
  }

  /**
   * Show error message
   */
  showError(message) {
    // Create toast notification
    const toastHtml = `
      <div class="toast align-items-center text-white bg-danger border-0" role="alert">
        <div class="d-flex">
          <div class="toast-body">
            <i class="bi bi-exclamation-triangle"></i>
            ${message}
          </div>
          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
      </div>
    `;
    
    // Add toast container if it doesn't exist
    let toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.className = 'toast-container position-fixed top-0 end-0 p-3';
      document.body.appendChild(toastContainer);
    }
    
    // Add toast
    toastContainer.insertAdjacentHTML('beforeend', toastHtml);
    const toast = toastContainer.lastElementChild;
    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();
  }

  /**
   * Show message details in modal
   */
  async showMessageDetails(messageId) {
    try {
      const response = await fetch(`/api/chats/${messageId}`);
      const data = await response.json();
      
      if (data.success) {
        const message = data.data;
        const modalBody = document.getElementById('messageDetails');
        
        modalBody.innerHTML = `
          <div class="row">
            <div class="col-md-6">
              <h6>Basic Information</h6>
              <table class="table table-sm">
                <tr><td><strong>ID:</strong></td><td>${message.id}</td></tr>
                <tr><td><strong>Platform:</strong></td><td>
                  <span class="badge platform-badge ${message.platform}">
                    <i class="bi bi-${message.platform === 'telegram' ? 'telegram' : 'discord'}"></i>
                    ${message.platform}
                  </span>
                </td></tr>
                <tr><td><strong>Type:</strong></td><td>
                  <span class="badge ${message.message_type === 'user' ? 'bg-primary' : 'bg-secondary'}">
                    ${message.message_type}
                  </span>
                </td></tr>
                <tr><td><strong>User:</strong></td><td>${this.escapeHtml(message.username || 'Unknown')}</td></tr>
                <tr><td><strong>User ID:</strong></td><td>${message.user_id || 'N/A'}</td></tr>
                <tr><td><strong>Chat ID:</strong></td><td>${message.chat_id || 'N/A'}</td></tr>
                <tr><td><strong>Created:</strong></td><td>${this.formatDate(message.created_at)} ${this.formatTime(message.created_at)}</td></tr>
              </table>
            </div>
            <div class="col-md-6">
              <h6>Message Content</h6>
              <div class="border rounded p-3 bg-light">
                ${message.message_text ? this.escapeHtml(message.message_text) : '<em>No text content</em>'}
              </div>
              
              ${message.raw_data ? `
                <h6 class="mt-3">Raw Data</h6>
                <details>
                  <summary class="btn btn-sm btn-outline-secondary">Show Raw Data</summary>
                  <pre class="mt-2 p-2 bg-dark text-light rounded" style="font-size: 0.8rem; max-height: 200px; overflow-y: auto;">${JSON.stringify(message.raw_data, null, 2)}</pre>
                </details>
              ` : ''}
            </div>
          </div>
        `;
        
        const modal = new bootstrap.Modal(document.getElementById('messageModal'));
        modal.show();
      } else {
        this.showError('Failed to load message details');
      }
    } catch (error) {
      console.error('Error loading message details:', error);
      this.showError('Network error occurred');
    }
  }

  /**
   * Refresh all data
   */
  async refresh() {
    console.log('🔄 Refreshing dashboard data...');
    await Promise.all([
      this.checkHealth(),
      this.loadStats(),
      this.loadMessages()
    ]);
    console.log('✅ Dashboard refreshed');
  }

  /**
   * Export data in specified format
   * @param {string} format - 'json' or 'csv'
   */
  async exportData(format) {
    // Build query parameters from current filters
    const params = new URLSearchParams();
    
    if (this.currentFilters.platform) {
      params.append('platform', this.currentFilters.platform);
    }
    if (this.currentFilters.messageType) {
      params.append('messageType', this.currentFilters.messageType);
    }
    if (this.currentFilters.search) {
      params.append('search', this.currentFilters.search);
    }
    
    params.append('format', format);

    // Create download link
    const url = `/api/chats/export?${params.toString()}`;
    
    // Get button reference and store original text
    const btn = document.getElementById(format === 'json' ? 'exportJsonBtn' : 'exportCsvBtn');
    const originalText = btn.innerHTML;

    try {
      // Show loading state
      btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Exporting...';
      btn.disabled = true;

      // Trigger download
      const link = document.createElement('a');
      link.href = url;
      link.download = '';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Show success message
      this.showSuccess(`${format.toUpperCase()} export started successfully!`);

    } catch (error) {
      console.error('Export error:', error);
      this.showError('Failed to export data');
    } finally {
      // Always reset button state after a short delay (for UX feedback)
      setTimeout(() => {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }, 1000);
    }
  }

  /**
   * Clear data with confirmation
   * @param {boolean} useFilters - Whether to apply current filters
   */
  async clearData(useFilters) {
    const filterText = useFilters ? 'filtered' : 'all';
    const message = useFilters 
      ? 'Are you sure you want to delete all messages matching current filters? This cannot be undone!'
      : 'Are you sure you want to delete ALL messages? This cannot be undone!';

    if (!confirm(message)) {
      return;
    }

    // Second confirmation for safety
    const confirmText = useFilters ? 'DELETE FILTERED' : 'DELETE ALL';
    const userInput = prompt(`Type "${confirmText}" to confirm deletion:`);
    
    if (userInput !== confirmText) {
      this.showError('Deletion cancelled - confirmation text did not match');
      return;
    }

    // Get button reference and store original text
    const btn = document.getElementById(useFilters ? 'clearFilteredBtn' : 'clearAllBtn');
    const originalText = btn.innerHTML;

    try {
      // Build query parameters
      const params = new URLSearchParams();
      params.append('confirm', 'true');
      
      if (useFilters) {
        if (this.currentFilters.platform) {
          params.append('platform', this.currentFilters.platform);
        }
        if (this.currentFilters.messageType) {
          params.append('messageType', this.currentFilters.messageType);
        }
      }

      // Show loading state
      btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Deleting...';
      btn.disabled = true;

      const response = await fetch(`/api/chats/clear?${params.toString()}`, {
        method: 'DELETE'
      });

      const result = await response.json();

      if (result.success) {
        this.showSuccess(`Successfully deleted ${result.deletedCount} messages`);
        await this.refresh(); // Reload data
      } else {
        throw new Error(result.error || 'Failed to clear data');
      }

    } catch (error) {
      console.error('Clear error:', error);
      this.showError('Failed to clear data: ' + error.message);
    } finally {
      // Always reset button state
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  }

  /**
   * Show database statistics
   */
  async showDatabaseStats() {
    try {
      // Show loading state
      const btn = document.getElementById('showStatsBtn');
      const originalText = btn.innerHTML;
      btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Loading...';
      btn.disabled = true;

      const response = await fetch('/api/chats/detailed-stats');
      const result = await response.json();

      if (result.success) {
        const stats = result.data;
        
        // Create stats modal content
        const statsHtml = `
          <div class="row">
            <div class="col-md-6">
              <h6>Total Messages</h6>
              <p class="display-6 text-primary">${stats.totalMessages.toLocaleString()}</p>
            </div>
            <div class="col-md-6">
              <h6>Platform Breakdown</h6>
              ${Object.entries(stats.platformCounts || {}).map(([platform, count]) => 
                `<p><strong>${platform}:</strong> ${count.toLocaleString()}</p>`
              ).join('')}
            </div>
          </div>
          
          ${stats.dateRange.oldest ? `
            <div class="row mt-3">
              <div class="col-md-6">
                <h6>Date Range</h6>
                <p><strong>Oldest:</strong><br>${new Date(stats.dateRange.oldest).toLocaleString()}</p>
                <p><strong>Newest:</strong><br>${new Date(stats.dateRange.newest).toLocaleString()}</p>
              </div>
            </div>
          ` : ''}
        `;

        // Show in modal
        document.getElementById('messageModalLabel').textContent = 'Database Statistics';
        document.getElementById('messageModalBody').innerHTML = statsHtml;
        
        const modal = new bootstrap.Modal(document.getElementById('messageModal'));
        modal.show();
      } else {
        throw new Error(result.error || 'Failed to fetch stats');
      }

      // Reset button
      btn.innerHTML = originalText;
      btn.disabled = false;

    } catch (error) {
      console.error('Stats error:', error);
      this.showError('Failed to load database statistics');
      
      // Reset button
      const btn = document.getElementById('showStatsBtn');
      btn.innerHTML = btn.innerHTML.replace('Loading...', 'Stats');
      btn.disabled = false;
    }
  }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new Dashboard();
}); 