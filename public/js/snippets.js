// Snippets Manager
const SnippetsManager = {
    snippets: [],
    
    init: function() {
        // DOM elements
        this.snippetsBtn = document.getElementById('snippetsBtn');
        this.snippetsModal = document.getElementById('snippetsModal');
        this.snippetsList = document.getElementById('snippetsList');
        this.addSnippetBtn = document.getElementById('addSnippetBtn');
        
        // Terminal snippets dropdown elements
        this.terminalSnippetsBtn = document.getElementById('terminalSnippetsBtn');
        this.terminalSnippetsContent = document.getElementById('terminalSnippetsContent');
        
        // Snippet form elements
        this.snippetFormModal = document.getElementById('snippetFormModal');
        this.snippetForm = document.getElementById('snippetForm');
        this.snippetFormTitle = document.getElementById('snippetFormTitle');
        this.snippetId = document.getElementById('snippetId');
        this.snippetName = document.getElementById('snippetName');
        this.snippetContent = document.getElementById('snippetContent');
        this.snippetDescription = document.getElementById('snippetDescription');
        this.cancelSnippetBtn = document.getElementById('cancelSnippet');
        this.deleteSnippetBtn = document.getElementById('deleteSnippet');
        
        // Skip initialization if elements don't exist (e.g., on login page)
        if (!this.snippetsBtn || !this.terminalSnippetsBtn) return;
        
        // Close buttons for modals
        const closeButtons = document.querySelectorAll('.modal .close');
        closeButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                if (modal) {
                    modal.style.display = 'none';
                }
            });
        });
        
        // Event listeners
        this.snippetsBtn.addEventListener('click', this.openSnippetsModal.bind(this));
        this.addSnippetBtn.addEventListener('click', this.openAddSnippetForm.bind(this));
        this.snippetForm.addEventListener('submit', this.saveSnippet.bind(this));
        this.cancelSnippetBtn.addEventListener('click', this.closeSnippetForm.bind(this));
        this.deleteSnippetBtn.addEventListener('click', this.deleteSnippet.bind(this));
        
        // Terminal snippets dropdown toggle
        this.terminalSnippetsBtn.addEventListener('click', this.toggleTerminalSnippetsDropdown.bind(this));
        
        // Close terminal snippets dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.terminal-snippets-dropdown') && 
                this.terminalSnippetsContent.classList.contains('active')) {
                this.terminalSnippetsContent.classList.remove('active');
            }
        });
        
        // Close modals when clicking outside
        window.addEventListener('click', (e) => {
            if (e.target === this.snippetsModal) {
                this.snippetsModal.style.display = 'none';
            }
            if (e.target === this.snippetFormModal) {
                this.snippetFormModal.style.display = 'none';
            }
        });
        
        // Load snippets on init
        this.loadSnippets();
        this.loadTerminalSnippets();
    },
    
    openSnippetsModal: function() {
        this.snippetsModal.style.display = 'block';
        this.loadSnippets(); // Refresh the list
    },
    
    toggleTerminalSnippetsDropdown: function(e) {
        e.stopPropagation();
        this.terminalSnippetsContent.classList.toggle('active');
        
        // Reload snippets when opening the dropdown
        if (this.terminalSnippetsContent.classList.contains('active')) {
            this.loadTerminalSnippets();
        }
    },
    
    loadSnippets: function() {
        this.snippetsList.innerHTML = '<div class="loading">Loading...</div>';
        
        fetch('/api/snippets')
            .then(response => {
                if (response.ok) {
                    return response.json();
                }
                throw new Error('Failed to load snippets');
            })
            .then(data => {
                this.snippets = data;
                this.renderSnippetsList();
            })
            .catch(error => {
                console.error('Error loading snippets:', error);
                this.snippetsList.innerHTML = `<div class="error-message">Failed to load snippets: ${error.message}</div>`;
            });
    },
    
    loadTerminalSnippets: function() {
        this.terminalSnippetsContent.innerHTML = '<div class="loading-snippets">Loading snippets...</div>';
        
        fetch('/api/snippets')
            .then(response => {
                if (response.ok) {
                    return response.json();
                }
                throw new Error('Failed to load snippets');
            })
            .then(data => {
                this.snippets = data;
                this.renderTerminalSnippets();
            })
            .catch(error => {
                console.error('Error loading snippets:', error);
                this.terminalSnippetsContent.innerHTML = `<div class="error-message">Failed to load snippets: ${error.message}</div>`;
            });
    },
    
    renderSnippetsList: function() {
        if (this.snippets.length === 0) {
            this.snippetsList.innerHTML = '<div class="empty-message">No snippets saved yet. Click "Add Snippet" to create one.</div>';
            return;
        }
        
        this.snippetsList.innerHTML = '';
        
        this.snippets.forEach(snippet => {
            const snippetItem = document.createElement('div');
            snippetItem.className = 'snippet-item';
            
            const snippetHeader = document.createElement('div');
            snippetHeader.className = 'snippet-header';
            
            const snippetName = document.createElement('h4');
            snippetName.textContent = snippet.name;
            
            const actionButtons = document.createElement('div');
            actionButtons.className = 'snippet-actions';
            
            const useButton = document.createElement('button');
            useButton.className = 'use-snippet-btn';
            useButton.innerHTML = '<i class="fas fa-play"></i>';
            useButton.title = 'Use Snippet';
            useButton.addEventListener('click', () => this.pasteSnippetToTerminal(snippet));
            
            const editButton = document.createElement('button');
            editButton.className = 'edit-snippet-btn';
            editButton.innerHTML = '<i class="fas fa-edit"></i>';
            editButton.title = 'Edit Snippet';
            editButton.addEventListener('click', () => this.openEditSnippetForm(snippet));
            
            actionButtons.appendChild(useButton);
            actionButtons.appendChild(editButton);
            
            snippetHeader.appendChild(snippetName);
            snippetHeader.appendChild(actionButtons);
            
            const snippetDescription = document.createElement('div');
            snippetDescription.className = 'snippet-description';
            snippetDescription.textContent = snippet.description || '';
            
            snippetItem.appendChild(snippetHeader);
            snippetItem.appendChild(snippetDescription);
            
            this.snippetsList.appendChild(snippetItem);
        });
    },
    
    renderTerminalSnippets: function() {
        if (this.snippets.length === 0) {
            this.terminalSnippetsContent.innerHTML = '<div class="empty-terminal-snippets">No snippets available</div>';
            return;
        }
        
        this.terminalSnippetsContent.innerHTML = '';
        
        this.snippets.forEach(snippet => {
            const snippetItem = document.createElement('div');
            snippetItem.className = 'terminal-snippet-item';
            snippetItem.addEventListener('click', () => this.pasteSnippetToTerminal(snippet));
            
            const snippetName = document.createElement('div');
            snippetName.className = 'terminal-snippet-name';
            snippetName.textContent = snippet.name;
            
            const snippetDescription = document.createElement('div');
            snippetDescription.className = 'terminal-snippet-description';
            snippetDescription.title = snippet.description || '';
            snippetDescription.textContent = snippet.description || '';
            
            snippetItem.appendChild(snippetName);
            snippetItem.appendChild(snippetDescription);
            
            this.terminalSnippetsContent.appendChild(snippetItem);
        });
    },
    
    openAddSnippetForm: function() {
        this.snippetFormTitle.textContent = 'Add Snippet';
        this.snippetForm.reset();
        this.snippetId.value = '';
        this.deleteSnippetBtn.style.display = 'none';
        this.snippetFormModal.style.display = 'block';
    },
    
    openEditSnippetForm: function(snippet) {
        this.snippetFormTitle.textContent = 'Edit Snippet';
        this.snippetId.value = snippet._id;
        this.snippetName.value = snippet.name;
        this.snippetContent.value = snippet.content;
        this.snippetDescription.value = snippet.description || '';
        this.deleteSnippetBtn.style.display = 'inline-block';
        this.snippetFormModal.style.display = 'block';
    },
    
    closeSnippetForm: function() {
        this.snippetFormModal.style.display = 'none';
    },
    
    saveSnippet: function(e) {
        e.preventDefault();
        
        const snippetData = {
            name: this.snippetName.value,
            content: this.snippetContent.value,
            description: this.snippetDescription.value
        };
        
        const isEdit = !!this.snippetId.value;
        const url = isEdit ? `/api/snippets/${this.snippetId.value}` : '/api/snippets';
        const method = isEdit ? 'PUT' : 'POST';
        
        fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(snippetData)
        })
        .then(response => {
            if (response.ok) {
                return response.json();
            }
            throw new Error('Failed to save snippet');
        })
        .then(data => {
            this.closeSnippetForm();
            this.loadSnippets();
            this.loadTerminalSnippets();
        })
        .catch(error => {
            console.error('Error saving snippet:', error);
            alert(`Failed to save snippet: ${error.message}`);
        });
    },
    
    deleteSnippet: function() {
        if (!this.snippetId.value) return;
        
        if (!confirm('Are you sure you want to delete this snippet?')) {
            return;
        }
        
        fetch(`/api/snippets/${this.snippetId.value}`, {
            method: 'DELETE'
        })
        .then(response => {
            if (response.ok) {
                this.closeSnippetForm();
                this.loadSnippets();
                this.loadTerminalSnippets();
                return;
            }
            throw new Error('Failed to delete snippet');
        })
        .catch(error => {
            console.error('Error deleting snippet:', error);
            alert(`Failed to delete snippet: ${error.message}`);
        });
    },
    
    pasteSnippetToTerminal: function(snippet) {
        // Find the active terminal tab
        const activeTab = document.querySelector('.terminal-tab.active');
        if (!activeTab) {
            alert('No active terminal session found');
            return;
        }
        
        // Get the tab ID to identify the WebSocket connection
        const tabId = activeTab.getAttribute('data-tab-id');
        
        // Get the established WebSocket connection
        const wsConnection = window.terminalManager?.getTabWebSocket(tabId);
        if (!wsConnection) {
            alert('No active terminal connection found');
            return;
        }
        
        // If we're in the dropdown, close it
        if (this.terminalSnippetsContent.classList.contains('active')) {
            this.terminalSnippetsContent.classList.remove('active');
        }
        
        // If we're in the modal, close it
        if (this.snippetsModal.style.display === 'block') {
            this.snippetsModal.style.display = 'none';
        }
        
        // Send the snippet content to the terminal
        try {
            // Send the content line by line for better terminal compatibility
            const lines = snippet.content.split('\n');
            
            // Send each line with a small delay to ensure proper terminal processing
            lines.forEach((line, index) => {
                setTimeout(() => {
                    wsConnection.send(JSON.stringify({
                        type: 'input',
                        data: line + (index < lines.length - 1 ? '\n' : '')
                    }));
                }, index * 50); // 50ms delay between lines
            });
            
            console.log('Snippet pasted to terminal:', snippet.name);
        } catch (error) {
            console.error('Error pasting snippet to terminal:', error);
            alert('Failed to paste snippet to terminal: ' + error.message);
        }
    }
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    SnippetsManager.init();
}); 