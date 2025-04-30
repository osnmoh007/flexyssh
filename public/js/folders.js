class FolderManager {
    constructor() {
        // Initialize after DOM is fully loaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initialize());
        } else {
            this.initialize();
        }
        
        // Store currently editing folder ID
        this.editingFolderId = null;
    }

    initialize() {
        // Save element references
        this.addFolderBtn = document.getElementById('addFolderBtn');
        this.folderModal = document.getElementById('folderModal');
        this.folderForm = document.getElementById('folderForm');
        this.folderNameInput = document.getElementById('folderName');
        this.folderColorInput = document.getElementById('folderColor');
        this.cancelFolderBtn = document.getElementById('cancelFolder');
        this.folderModalTitle = this.folderModal?.querySelector('h2');
        this.deleteFolderBtn = document.getElementById('deleteFolder');
        
        // Modal close button
        this.folderModalCloseBtn = this.folderModal?.querySelector('.close');
        
        // Add event listeners
        this.setupEventListeners();
        
        // Load folders on start
        this.loadFolders();
    }
    
    setupEventListeners() {
        // Add folder button
        if (this.addFolderBtn) {
            this.addFolderBtn.addEventListener('click', () => this.openFolderModal());
        } else {
            console.error('Add folder button not found in the DOM');
        }
        
        // Folder form submit
        if (this.folderForm) {
            this.folderForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveFolder();
            });
        } else {
            console.error('Folder form not found in the DOM');
        }
        
        // Cancel folder button
        if (this.cancelFolderBtn) {
            this.cancelFolderBtn.addEventListener('click', () => {
                this.folderModal.style.display = 'none';
            });
        }
        
        // Delete folder button
        if (this.deleteFolderBtn) {
            this.deleteFolderBtn.addEventListener('click', () => {
                this.deleteFolder();
            });
        }
        
        // Modal close button
        if (this.folderModalCloseBtn) {
            this.folderModalCloseBtn.addEventListener('click', () => {
                this.folderModal.style.display = 'none';
            });
        }
        
        // Close modal when clicking outside
        window.addEventListener('click', (e) => {
            if (this.folderModal && e.target === this.folderModal) {
                this.folderModal.style.display = 'none';
            }
        });
    }
    
    openFolderModal(folder = null) {
        if (this.folderModal) {
            // Reset form
            this.folderForm.reset();
            
            // Set editing state
            this.editingFolderId = folder ? folder._id : null;
            
            // Update modal title
            if (this.folderModalTitle) {
                this.folderModalTitle.textContent = folder ? 'Edit Folder' : 'Add Folder';
            }
            
            // Set values if editing
            if (folder) {
                this.folderNameInput.value = folder.name || '';
                this.folderColorInput.value = folder.color || '#007acc';
                
                // Show delete button when editing
                if (this.deleteFolderBtn) {
                    this.deleteFolderBtn.style.display = 'inline-block';
                }
            } else {
                // Set a default color for new folders
                this.folderColorInput.value = '#007acc';
                
                // Hide delete button for new folders
                if (this.deleteFolderBtn) {
                    this.deleteFolderBtn.style.display = 'none';
                }
            }
            
            // Display the modal
            this.folderModal.style.display = 'block';
            
            // Focus on the name input
            this.folderNameInput.focus();
        }
    }
    
    // Method to edit a folder by ID
    editFolder(folderId) {
        // Find the folder by ID
        const folder = this.folders.find(f => f._id === folderId);
        if (folder) {
            this.openFolderModal(folder);
        } else {
            console.error(`Folder with ID ${folderId} not found`);
        }
    }
    
    async saveFolder() {
        try {
            const folderName = this.folderNameInput.value.trim();
            const folderColor = this.folderColorInput.value;
            
            if (!folderName) {
                alert('Please enter a folder name');
                return;
            }
            
            const isEdit = !!this.editingFolderId;
            const url = isEdit ? `/api/folders/${this.editingFolderId}` : '/api/folders';
            const method = isEdit ? 'PUT' : 'POST';
            
            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    name: folderName,
                    color: folderColor
                })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || `Failed to ${isEdit ? 'update' : 'save'} folder`);
            }
            
            const result = await response.json();
            
            // Close the modal
            this.folderModal.style.display = 'none';
            
            // Reset editing state
            this.editingFolderId = null;
            
            // Reload folders
            this.loadFolders();
            
            // Refresh server list if Terminal Manager is available
            if (window.terminalManager) {
                window.terminalManager.loadServers();
            }
            
        } catch (error) {
            console.error(`Error ${this.editingFolderId ? 'updating' : 'saving'} folder:`, error);
            alert(`Error ${this.editingFolderId ? 'updating' : 'saving'} folder: ${error.message}`);
        }
    }
    
    async deleteFolder() {
        if (!this.editingFolderId) return;
        
        if (!confirm('Are you sure you want to delete this folder? Servers in this folder will be moved to Uncategorized.')) {
            return;
        }
        
        try {
            const response = await fetch(`/api/folders/${this.editingFolderId}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to delete folder');
            }
            
            // Close the modal
            this.folderModal.style.display = 'none';
            
            // Reset editing state
            this.editingFolderId = null;
            
            // Reload folders
            this.loadFolders();
            
            // Refresh server list if Terminal Manager is available
            if (window.terminalManager) {
                window.terminalManager.loadServers();
            }
            
        } catch (error) {
            console.error('Error deleting folder:', error);
            alert(`Error deleting folder: ${error.message}`);
        }
    }
    
    async loadFolders() {
        try {
            const response = await fetch('/api/folders');
            
            if (!response.ok) {
                throw new Error('Failed to load folders');
            }
            
            const folders = await response.json();
            
            // Store folders in the instance
            this.folders = folders;
        } catch (error) {
            console.error('Error loading folders:', error);
        }
    }
}

// Create a folder manager instance
window.folderManager = new FolderManager(); 