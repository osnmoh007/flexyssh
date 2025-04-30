class TerminalManager {
    constructor() {
        // Tab management
        this.tabs = [];
        this.activeTabId = null;
        
        // Terminal options
        this.terminalOptions = {
            cursorBlink: true,
            fontSize: 14,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            scrollback: 1000,
            theme: {
                background: '#1e1e1e',
                foreground: '#f0f0f0'
            }
        };
        
        // Element references
        this.ws = null;
        this.connected = false;
        this.connectionForm = null;
        this.connectButton = null;
        this.savedServers = [];
        this.activeServerId = null;
        this.editingServerId = null;

        // Initialize after DOM is fully loaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initialize());
        } else {
        this.initialize();
        }
    }

    initialize() {
        // Save element references
        this.terminalContainer = document.getElementById('terminalContainer');
        this.tabList = document.getElementById('tabList');
        this.welcomeScreen = document.getElementById('welcomeScreen');
        this.addServerBtn = document.getElementById('addServerBtn');
        this.refreshButton = document.getElementById('refreshBtn');
        this.closeAllTabsBtn = document.getElementById('closeAllTabsBtn');
        
        // Check if required elements exist
        if (!this.terminalContainer) {
            console.error('Terminal container not found in the DOM');
            return;
        }
        
        if (!this.tabList) {
            console.error('Tab list not found in the DOM');
            return;
        }
        
        // Modal elements
        this.saveServerModal = document.getElementById('saveServerModal');
        this.saveServerForm = document.getElementById('saveServerForm');
        this.closeModalBtn = document.querySelector('.close');
        this.cancelSaveBtn = document.getElementById('cancelSave');
        
        // Authentication type radio buttons
        this.authTypePassword = document.getElementById('authTypePassword');
        this.authTypeKey = document.getElementById('authTypeKey');
        this.passwordSection = document.getElementById('passwordSection');
        this.keySection = document.getElementById('keySection');
        this.keyFileInput = document.getElementById('keyFileInput');
        this.selectedFileName = document.getElementById('selectedFileName');
        this.privateKeyTextarea = document.getElementById('privateKey');
        
        // Add auth type change handlers
        if (this.authTypePassword && this.authTypeKey) {
            this.authTypePassword.addEventListener('change', () => this.toggleAuthSections());
            this.authTypeKey.addEventListener('change', () => this.toggleAuthSections());
        }
        
        // Add key file upload handler
        if (this.keyFileInput) {
            this.keyFileInput.addEventListener('change', (e) => this.handleKeyFileSelection(e));
        }
        
        // Show welcome screen initially
        if (this.welcomeScreen) {
            this.welcomeScreen.style.display = 'flex';
        }

        // Handle window resize
        window.addEventListener('resize', () => {
            this.resizeActiveTerminal();
        });
        
        // Setup add server button
        if (this.addServerBtn) {
            this.addServerBtn.addEventListener('click', () => {
            this.openSaveModal();
        });
        } else {
            console.error('Add server button not found in the DOM');
        }
        
        // Setup refresh button
        if (this.refreshButton) {
        this.refreshButton.addEventListener('click', () => {
            this.loadServers();
        });
        } else {
            console.error('Refresh button not found in the DOM');
        }
        
        // Setup close all tabs button
        if (this.closeAllTabsBtn) {
            this.closeAllTabsBtn.addEventListener('click', () => {
                this.closeAllTabs();
            });
        } else {
            console.error('Close all tabs button not found in the DOM');
        }
        
        // Modal event listeners
        if (this.closeModalBtn) {
        this.closeModalBtn.addEventListener('click', () => {
            this.saveServerModal.style.display = 'none';
        });
        } else {
            console.error('Close modal button not found in the DOM');
        }
        
        if (this.cancelSaveBtn) {
        this.cancelSaveBtn.addEventListener('click', () => {
            this.saveServerModal.style.display = 'none';
        });
        } else {
            console.error('Cancel save button not found in the DOM');
        }
        
        window.addEventListener('click', (e) => {
            if (this.saveServerModal && e.target === this.saveServerModal) {
                this.saveServerModal.style.display = 'none';
            }
        });
        
        // Handle save server form submission
        if (this.saveServerForm) {
            this.saveServerForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                this.saveServer(); // Use our saveServer method
            });
        } else {
            console.error('Save server form not found in the DOM');
        }
        
        // Load saved servers on start
        this.loadServers();
    }
    
    toggleAuthSections() {
        if (this.authTypePassword && this.authTypePassword.checked) {
            this.passwordSection.style.display = 'block';
            this.keySection.style.display = 'none';
        } else if (this.authTypeKey && this.authTypeKey.checked) {
            this.passwordSection.style.display = 'none';
            this.keySection.style.display = 'block';
        }
    }
    
    resizeActiveTerminal() {
        const activeTab = this.tabs.find(tab => tab.id === this.activeTabId);
        if (activeTab && activeTab.fitAddon) {
            activeTab.fitAddon.fit();
            if (activeTab.ws && activeTab.ws.readyState === WebSocket.OPEN) {
                this.sendResize(activeTab);
            }
        }
    }
    
    handleKeyFileSelection(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        // Update the displayed filename
        if (this.selectedFileName) {
            this.selectedFileName.textContent = file.name;
        }
        
        // Read the file contents
        const reader = new FileReader();
        reader.onload = (e) => {
            // Get the key data
            const keyData = e.target.result;
            
            // Check if key appears to be valid
            if (!keyData.includes('-----BEGIN') || !keyData.includes('-----END')) {
                console.warn('Warning: Key file may not be a valid SSH key');
                alert('Warning: The selected file may not be a valid SSH private key. Please ensure you selected the correct file.');
            }
            
            // Upload the key to the server
            this.uploadKeyFile(keyData);
        };
        reader.onerror = (error) => {
            console.error('Error reading key file:', error);
            alert('Error reading key file. Please try again.');
        };
        
        // Read the file as text
        reader.readAsText(file);
    }
    
    uploadKeyFile(keyData) {
        fetch('/api/keys', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ keyData })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to upload SSH key');
            }
            return response.json();
        })
        .then(data => {
            
            // Store the key file reference in the textarea
            // This will be saved in the database as a reference to the file
            if (this.privateKeyTextarea) {
                this.privateKeyTextarea.value = `file:${data.keyId}`;
            }
        })
        .catch(error => {
            console.error('Error uploading SSH key:', error);
            alert('Failed to upload SSH key: ' + error.message);
        });
    }
    
    openSaveModal(server = null) {
        if (!this.saveServerModal) {
            console.error('Save server modal not found in the DOM');
            return;
        }
        
        // Clear the form
        const serverNameInput = document.getElementById('serverName');
        const serverHostInput = document.getElementById('serverHost');
        const serverUsernameInput = document.getElementById('serverUsername');
        const serverPasswordInput = document.getElementById('serverPassword');
        const serverPortInput = document.getElementById('serverPort');
        const privateKeyInput = document.getElementById('privateKey');
        const keyPassphraseInput = document.getElementById('keyPassphrase');
        const authTypePassword = document.getElementById('authTypePassword');
        const authTypeKey = document.getElementById('authTypeKey');
        const identitySelector = document.getElementById('identitySelector');
        const folderSelector = document.getElementById('folderSelector');
        const manualIdentitySection = document.getElementById('manualIdentitySection');
        
        if (serverNameInput) serverNameInput.value = server ? server.name : '';
        if (serverHostInput) serverHostInput.value = server ? server.host : '';
        if (serverUsernameInput) {
            serverUsernameInput.value = server ? server.username : '';
        }
        if (serverPasswordInput) serverPasswordInput.value = ''; // Don't fill password for security
        
        // Load folders for the folder dropdown
        this.loadFolders(folderSelector, server);
        
        // Reset identity selector to manual mode for new servers
        if (identitySelector) {
            // Default to manual mode for new servers
            if (!server) {
                identitySelector.value = 'manual';
                
                // Update form requirements for manual entry
                if (window.updateFormRequirements) {
                    window.updateFormRequirements(false);
                }
            }
            
            // Make sure the identity dropdown is updated with the latest identities
            if (window.updateIdentitySelector) {
                // We'll set the identity after the dropdown is updated
                const hasIdentityId = !!server && !!server.identityId;
                
                // Get identity information for later use
                let identityIdStr = '';
                let identityName = '';
                
                if (hasIdentityId) {
                    identityIdStr = typeof server.identityId === 'object' 
                        ? (server.identityId._id || '') 
                        : server.identityId;
                        
                    identityName = typeof server.identityId === 'object' 
                        ? server.identityId.name 
                        : (server.identityName || '');
                }
                
                // Update the identity selector with new options
                window.updateIdentitySelector().then(() => {
                    // After updating options, set the identity if one exists
                    if (hasIdentityId) {
                        
                        // Try to find and select the identity option
                        const options = identitySelector.options;
                        
                        // Attempt to match by ID
                        let found = false;
                        for (let i = 0; i < options.length; i++) {
                            if (options[i].value === identityIdStr) {
                                identitySelector.value = identityIdStr;
                                found = true;
                                break;
                            }
                        }
                        
                        // If identity not found but we have the name, log a warning
                        if (!found && identityName) {
                            console.warn(`Identity with ID ${identityIdStr} (${identityName}) not found in dropdown. It may have been deleted.`);
                            
                            // Force manual mode and show a warning to the user
                            identitySelector.value = 'manual';
                            
                            // Show warning
                            setTimeout(() => {
                                alert(`Note: This server was previously using identity "${identityName}" which is no longer available. You'll need to select a different identity or enter credentials manually.`);
                            }, 500);
                        }
                        
                        // Update form fields based on identity selection
                        const useIdentity = identitySelector.value !== 'manual';
                        if (window.updateFormRequirements) {
                            // Call the update function with the selected state
                            window.updateFormRequirements(useIdentity);
                        }
                    }
                }).catch(err => {
                    console.error('Error updating identity selector:', err);
                });
            }
            
            // Update form fields based on identity selection
            const useIdentity = identitySelector.value !== 'manual';
            if (window.updateFormRequirements) {
                // Call the update function with the selected state
                window.updateFormRequirements(useIdentity);
                
                // If we have a populated identity object but couldn't find it in the dropdown,
                // we might need to show username from the identity in the manual fields
                if (server && server.identityId && typeof server.identityId === 'object' && identitySelector.value === 'manual') {
                    const serverUsernameInput = document.getElementById('serverUsername');
                    if (serverUsernameInput && server.identityId.username) {
                        serverUsernameInput.value = server.identityId.username;
                    }
                }
            }
        }
        
        // Handle SSH key display for editing
        if (privateKeyInput) {
            if (server && server.privateKey && server.privateKey.startsWith('file:')) {
                // For server-side stored keys, show a placeholder message
                const keyId = server.privateKey.replace('file:', '');
                privateKeyInput.value = `file:${keyId}`;
                if (this.selectedFileName) {
                    this.selectedFileName.textContent = '[Server-stored SSH key]';
                }
            } else {
                privateKeyInput.value = ''; // Don't show the actual key for security
            }
        }
        
        if (keyPassphraseInput) keyPassphraseInput.value = ''; // Don't fill passphrase for security
        if (serverPortInput) serverPortInput.value = server ? server.port : '22';
        
        // Reset the file input
        if (this.keyFileInput) this.keyFileInput.value = '';
        if (this.selectedFileName && (!server || !server.privateKey || !server.privateKey.startsWith('file:'))) {
            this.selectedFileName.textContent = 'No file selected';
        }
        
        // Set authentication type
        if (server && server.authType) {
            if (server.authType === 'key' && authTypeKey) {
                authTypeKey.checked = true;
            } else if (authTypePassword) {
                authTypePassword.checked = true;
            }
            
            // Toggle auth sections based on selection
            this.toggleAuthSections();
        } else {
            // Default to password auth for new servers
            if (authTypePassword) authTypePassword.checked = true;
            this.toggleAuthSections();
        }
        
        // Update form for edit mode if server provided
        const modalTitle = this.saveServerModal.querySelector('h2');
        if (modalTitle) {
            modalTitle.textContent = server ? 'Edit Server' : 'Add Server';
        }
        
        // Store the server ID if editing
        this.editingServerId = server ? server._id : null;
        
        this.saveServerModal.style.display = 'block';
    }
    
    // Add a method to load folders for the dropdown
    loadFolders(folderSelector, server = null) {
        if (!folderSelector) return;
        
        // Save the current selection to restore it after updating
        const currentValue = folderSelector.value;
        const serverId = server ? server._id : null;
        const serverFolderId = server && server.folderId ? 
            (typeof server.folderId === 'object' ? server.folderId._id : server.folderId) : '';
        
        // Clear options except the "No Folder" option
        while (folderSelector.options.length > 1) {
            folderSelector.remove(1);
        }
        
        // Fetch folders
        fetch('/api/folders')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to fetch folders');
                }
                return response.json();
            })
            .then(folders => {
                // Add folder options
                folders.forEach(folder => {
                    const option = document.createElement('option');
                    option.value = folder._id;
                    option.textContent = folder.name;
                    
                    // Add color indicator
                    if (folder.color) {
                        option.style.backgroundColor = folder.color + '20'; // 20 = 12.5% opacity
                        option.style.borderLeft = `4px solid ${folder.color}`;
                        option.style.paddingLeft = '8px';
                    }
                    
                    folderSelector.appendChild(option);
                });
                
                // Set selected folder if editing a server
                if (server && serverFolderId) {
                    folderSelector.value = serverFolderId;
                } else if (currentValue) {
                    // Otherwise restore previous selection
                    folderSelector.value = currentValue;
                }
            })
            .catch(error => {
                console.error('Error loading folders:', error);
            });
    }
    
    editServer(server) {
        // Fetch full server details before opening the modal
        if (server && server._id) {
            
            // Show loading state in the modal title
            this.openSaveModal(server);
            const modalTitle = this.saveServerModal.querySelector('h2');
            if (modalTitle) {
                modalTitle.textContent = 'Loading Server Details...';
            }
            
            // Fetch complete server details from the API
            fetch(`/api/servers/${server._id}`)
                .then(response => {
                    if (!response.ok) {
                        throw new Error('Failed to fetch server details');
                    }
                    return response.json();
                })
                .then(fullServerDetails => {
                    // Extract identity information for logging
                    let identityId = 'none';
                    let identityName = 'none';
                    
                    if (fullServerDetails.identityId) {
                        if (typeof fullServerDetails.identityId === 'object') {
                            identityId = fullServerDetails.identityId._id || 'unknown';
                            identityName = fullServerDetails.identityId.name || 'unnamed';
                        } else {
                            identityId = fullServerDetails.identityId;
                            identityName = fullServerDetails.identityName || 'unnamed';
                        }
                    }
                    
                    // Close and reopen the modal with the full details
                    this.saveServerModal.style.display = 'none';
                    this.openSaveModal(fullServerDetails);
                })
                .catch(error => {
                    console.error('Error fetching server details:', error);
                    
                    // Update modal to show error
                    if (modalTitle) {
                        modalTitle.textContent = 'Error Loading Server';
                    }
                    alert(`Failed to load server details: ${error.message}`);
                });
        } else {
            // Fallback to basic open if no server ID
            this.openSaveModal(server);
        }
    }
    
    async saveServer() {
        try {
            // Basic validation for all modes
            const nameInput = document.getElementById('serverName');
            const hostInput = document.getElementById('serverHost');
            const folderSelector = document.getElementById('folderSelector');
            
            if (!nameInput || !nameInput.value.trim()) {
                alert('Please enter a server name');
                if (nameInput) nameInput.focus();
                return;
            }
            
            if (!hostInput || !hostInput.value.trim()) {
                alert('Please enter a host address');
                if (hostInput) hostInput.focus();
                return;
            }
            
            // Check if using a saved identity or manual entry
            const identitySelector = document.getElementById('identitySelector');
            let serverData = {
                name: nameInput.value.trim(),
                host: hostInput.value.trim(),
                port: parseInt(document.getElementById('serverPort')?.value || '22') || 22
            };
            
            // Add folder ID if selected
            if (folderSelector && folderSelector.value) {
                serverData.folderId = folderSelector.value;
            }
            
            if (identitySelector && identitySelector.value !== 'manual') {
                // Using a saved identity - store a reference to the identity
                const identityId = identitySelector.value;
                
                // Store the identity ID as a proper reference
                serverData.identityId = identityId;
                
                // We also store these for display purposes and backward compatibility
                // but the identityId field will be the authoritative source
                try {
                    const response = await fetch(`/api/identities/${identityId}`);
                    if (!response.ok) {
                        throw new Error('Failed to fetch identity details');
                    }
                    
                    const identity = await response.json();
                    
                    // Apply identity details for display purposes
                    serverData.username = identity.username;
                    serverData.authType = identity.authType;
                } catch (error) {
                    console.error('Error loading identity details:', error);
                    alert('Failed to load identity details, but will still save reference to identity.');
                }
            } else {
                // Manual entry - use form fields and validate
                const usernameInput = document.getElementById('serverUsername');
                
                if (!usernameInput || !usernameInput.value.trim()) {
                    alert('Please enter a username');
                    if (usernameInput) usernameInput.focus();
                    return;
                }
                
                const authTypeKeyRadio = document.getElementById('authTypeKey');
                const authType = authTypeKeyRadio && authTypeKeyRadio.checked ? 'key' : 'password';
                
                serverData.username = usernameInput.value.trim();
                serverData.authType = authType;
                
                if (authType === 'password') {
                    // Password is optional but recommended
                    serverData.password = document.getElementById('serverPassword')?.value || '';
                } else {
                    // Key is required for key auth
                    const privateKeyInput = document.getElementById('privateKey');
                    
                    if (!privateKeyInput || !privateKeyInput.value.trim()) {
                        alert('Please provide an SSH private key by uploading a file or pasting the key content.');
                        if (privateKeyInput) privateKeyInput.focus();
                        return;
                    }
                    
                    serverData.privateKey = privateKeyInput.value.trim();
                    serverData.keyPassphrase = document.getElementById('keyPassphrase')?.value || '';
                }
            }
            
            // Determine if this is an edit or new server
            const isEdit = !!this.editingServerId;
            const url = isEdit ? `/api/servers/${this.editingServerId}` : '/api/servers';
            const method = isEdit ? 'PUT' : 'POST';            
            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(serverData)
            });
            
            if (!response.ok) {
                throw new Error(`Failed to ${isEdit ? 'update' : 'save'} server`);
            }
            
            const data = await response.json();
            
            this.saveServerModal.style.display = 'none';
            this.saveServerForm.reset();
            this.editingServerId = null;
            
            // Show success message in active terminal or create a notification
            const activeTab = this.getActiveTab();
            if (activeTab && activeTab.term) {
                activeTab.term.writeln(`\r\nServer ${isEdit ? 'updated' : 'saved'} successfully with auth type: ${serverData.authType}`);
            }
            
            this.loadServers();
            
        } catch (error) {
            console.error(`Error saving server:`, error);
            alert('Failed to save server: ' + error.message);
            
            // Show error in active terminal if available
            const activeTab = this.getActiveTab();
            if (activeTab && activeTab.term) {
                activeTab.term.writeln(`\r\nError saving server: ` + error.message);
            }
        }
    }
    
    loadServers() {
        const serverList = document.getElementById('serverList');
        if (!serverList) {
            console.error('Server list element not found in the DOM');
            return;
        }
        
        serverList.innerHTML = '<div class="loading">Loading...</div>';
        
        fetch('/api/servers')
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to fetch servers');
            }
            return response.json();
        })
        .then(servers => {
            this.savedServers = servers;
            this.renderServerList();
        })
        .catch(error => {
            console.error('Error loading servers:', error);
                if (serverList) {
            serverList.innerHTML = `<div class="error">Error loading servers: ${error.message}</div>`;
                }
        });
    }
    
    renderServerList() {
        const serverList = document.getElementById('serverList');
        if (!serverList) {
            console.error('Server list element not found in the DOM');
            return;
        }
        
        serverList.innerHTML = '';
        
        if (!this.savedServers || this.savedServers.length === 0) {
            serverList.innerHTML = '<div class="no-servers">No saved servers</div>';
            return;
        }
        
        // Fetch all folders to show folder information
        fetch('/api/folders')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to fetch folders');
                }
                return response.json();
            })
            .then(folders => {
                // Create a map of folder IDs to folder objects for easy lookup
                const folderMap = new Map();
                folders.forEach(folder => {
                    folderMap.set(folder._id, folder);
                });
                
                // Group servers by folder
                const serversByFolder = {};
                serversByFolder['uncategorized'] = [];
                
                // Sort servers into folders
                this.savedServers.forEach(server => {
                    if (!server || !server._id) {
                        console.error('Invalid server data:', server);
                        return;
                    }
                    
                    if (server.folderId && folderMap.has(typeof server.folderId === 'object' ? server.folderId._id : server.folderId)) {
                        const folderId = typeof server.folderId === 'object' ? server.folderId._id : server.folderId;
                        if (!serversByFolder[folderId]) {
                            serversByFolder[folderId] = [];
                        }
                        serversByFolder[folderId].push(server);
                    } else {
                        serversByFolder['uncategorized'].push(server);
                    }
                });
                
                // Render each folder group
                const sortedFolderIds = [...folderMap.keys()].sort((a, b) => {
                    const folderA = folderMap.get(a);
                    const folderB = folderMap.get(b);
                    return folderA.name.localeCompare(folderB.name);
                });
                
                // Render servers with folders first
                sortedFolderIds.forEach(folderId => {
                    if (serversByFolder[folderId] && serversByFolder[folderId].length > 0) {
                        const folder = folderMap.get(folderId);
                        this.renderFolderGroup(serverList, folder, serversByFolder[folderId]);
                    }
                });
                
                // Then render uncategorized servers
                if (serversByFolder['uncategorized'].length > 0) {
                    this.renderUncategorizedServers(serverList, serversByFolder['uncategorized']);
                }
            })
            .catch(error => {
                console.error('Error loading folders:', error);
                // Fallback to simple list if folder loading fails
                this.renderSimpleServerList(serverList);
            });
    }
    
    renderFolderGroup(serverList, folder, servers) {
        // Create folder header
        const folderHeader = document.createElement('div');
        folderHeader.className = 'folder-header';
        
        // Create folder name div with edit button
        const folderNameDiv = document.createElement('div');
        folderNameDiv.className = 'folder-name';
        folderNameDiv.style.borderLeft = `3px solid ${folder.color || '#007acc'}`;
        folderNameDiv.innerHTML = `
            <i class="fas fa-chevron-down folder-collapse-icon"></i>
            <i class="fas fa-folder"></i> 
            <span class="folder-label">${folder.name}</span> 
            <span class="server-count">(${servers.length})</span>
            <button class="folder-edit-btn" title="Edit Folder"><i class="fas fa-edit"></i></button>
        `;
        
        folderHeader.appendChild(folderNameDiv);
        
        // Add event listener to the edit button
        const editBtn = folderNameDiv.querySelector('.folder-edit-btn');
        if (editBtn) {
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (window.folderManager) {
                    window.folderManager.editFolder(folder._id);
                } else {
                    console.error('Folder manager not available');
                }
            });
        }
        
        // Create servers container for collapse/expand functionality
        const serversContainer = document.createElement('div');
        serversContainer.className = 'folder-servers';
        serversContainer.setAttribute('data-folder-id', folder._id);
        
        // Add click handler to the folder name for collapse/expand
        folderNameDiv.addEventListener('click', (e) => {
            // Don't trigger if clicking the edit button
            if (e.target.closest('.folder-edit-btn')) {
                return;
            }
            
            // Toggle collapsed state
            const isCollapsed = serversContainer.classList.toggle('collapsed');
            
            // Update icon
            const collapseIcon = folderNameDiv.querySelector('.folder-collapse-icon');
            if (collapseIcon) {
                collapseIcon.className = isCollapsed 
                    ? 'fas fa-chevron-right folder-collapse-icon' 
                    : 'fas fa-chevron-down folder-collapse-icon';
            }
            
            // Save collapsed state to localStorage
            try {
                const collapsedFolders = JSON.parse(localStorage.getItem('collapsedFolders') || '{}');
                collapsedFolders[folder._id] = isCollapsed;
                localStorage.setItem('collapsedFolders', JSON.stringify(collapsedFolders));
            } catch (err) {
                console.error('Error saving collapsed state:', err);
            }
        });
        
        serverList.appendChild(folderHeader);
        serverList.appendChild(serversContainer);
        
        // Check if the folder should be collapsed (from localStorage)
        try {
            const collapsedFolders = JSON.parse(localStorage.getItem('collapsedFolders') || '{}');
            if (collapsedFolders[folder._id]) {
                serversContainer.classList.add('collapsed');
                const collapseIcon = folderNameDiv.querySelector('.folder-collapse-icon');
                if (collapseIcon) {
                    collapseIcon.className = 'fas fa-chevron-right folder-collapse-icon';
                }
            }
        } catch (err) {
            console.error('Error loading collapsed state:', err);
        }
        
        // Render servers in this folder
        servers.forEach(server => {
            this.renderServerItem(serversContainer, server, folder);
        });
    }
    
    renderUncategorizedServers(serverList, servers) {
        if (servers.length === 0) return;
        
        // Create uncategorized header
        const uncategorizedHeader = document.createElement('div');
        uncategorizedHeader.className = 'folder-header';
        
        // Create folder name div with collapse icon
        const folderNameDiv = document.createElement('div');
        folderNameDiv.className = 'folder-name';
        folderNameDiv.innerHTML = `
            <i class="fas fa-chevron-down folder-collapse-icon"></i>
            <i class="fas fa-server"></i> 
            <span class="folder-label">Uncategorized</span> 
            <span class="server-count">(${servers.length})</span>
        `;
        
        uncategorizedHeader.appendChild(folderNameDiv);
        
        // Create servers container for collapse/expand functionality
        const serversContainer = document.createElement('div');
        serversContainer.className = 'folder-servers';
        serversContainer.setAttribute('data-folder-id', 'uncategorized');
        
        // Add click handler to the folder name for collapse/expand
        folderNameDiv.addEventListener('click', (e) => {
            // Toggle collapsed state
            const isCollapsed = serversContainer.classList.toggle('collapsed');
            
            // Update icon
            const collapseIcon = folderNameDiv.querySelector('.folder-collapse-icon');
            if (collapseIcon) {
                collapseIcon.className = isCollapsed 
                    ? 'fas fa-chevron-right folder-collapse-icon' 
                    : 'fas fa-chevron-down folder-collapse-icon';
            }
            
            // Save collapsed state to localStorage
            try {
                const collapsedFolders = JSON.parse(localStorage.getItem('collapsedFolders') || '{}');
                collapsedFolders['uncategorized'] = isCollapsed;
                localStorage.setItem('collapsedFolders', JSON.stringify(collapsedFolders));
            } catch (err) {
                console.error('Error saving collapsed state:', err);
            }
        });
        
        serverList.appendChild(uncategorizedHeader);
        serverList.appendChild(serversContainer);
        
        // Check if the uncategorized section should be collapsed (from localStorage)
        try {
            const collapsedFolders = JSON.parse(localStorage.getItem('collapsedFolders') || '{}');
            if (collapsedFolders['uncategorized']) {
                serversContainer.classList.add('collapsed');
                const collapseIcon = folderNameDiv.querySelector('.folder-collapse-icon');
                if (collapseIcon) {
                    collapseIcon.className = 'fas fa-chevron-right folder-collapse-icon';
                }
            }
        } catch (err) {
            console.error('Error loading collapsed state:', err);
        }
        
        // Render uncategorized servers
        servers.forEach(server => {
            this.renderServerItem(serversContainer, server, null);
        });
    }
    
    renderSimpleServerList(serverList) {
        // Fallback to render all servers without folders
        this.savedServers.forEach(server => {
            if (!server || !server._id) {
                console.error('Invalid server data:', server);
                return;
            }
            
            this.renderServerItem(serverList, server, null);
        });
    }
    
    renderServerItem(serverList, server, folder = null) {
        const serverItem = document.createElement('div');
        serverItem.className = 'server-item';
        serverItem.setAttribute('data-id', server._id); // Add data-id attribute
        
        // Apply folder color to the server item's left border if available
        if (folder && folder.color) {
            // Store the folder color as a data attribute for use in event handlers
            serverItem.setAttribute('data-folder-color', folder.color);
            // Apply the color to the left border
            serverItem.style.borderLeftColor = folder.color;
            // Add a subtle background tint (10 = 6% opacity)
            serverItem.style.backgroundColor = `${folder.color}10`;
        }
        
        const serverInfo = document.createElement('div');
        serverInfo.className = 'server-info';
        
        const serverName = document.createElement('div');
        serverName.className = 'server-name';
        serverName.textContent = server.name;
        
        const serverDetails = document.createElement('div');
        serverDetails.className = 'server-details';
        serverDetails.textContent = `${server.username || 'user'}@${server.host || 'unknown'}${server.port !== 22 ? ':'+server.port : ''}`;
        
        serverInfo.appendChild(serverName);
        serverInfo.appendChild(serverDetails);
        
        const serverActions = document.createElement('div');
        serverActions.className = 'server-actions';
        
        // Create edit button with icon
        const editBtn = document.createElement('button');
        editBtn.innerHTML = '<i class="fas fa-edit"></i>';
        editBtn.title = 'Edit Server';
        editBtn.className = 'edit-btn';
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent connect
            this.editServer(server);
        });
        
        // Create delete button with icon
        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
        deleteBtn.title = 'Delete Server';
        deleteBtn.className = 'delete-btn';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent connect
            this.deleteServer(server._id);
        });
        
        serverActions.appendChild(editBtn);
        serverActions.appendChild(deleteBtn);
        
        serverItem.appendChild(serverInfo);
        serverItem.appendChild(serverActions);
        
        // Make the item use double-click for connection (instead of single-click)
        serverItem.addEventListener('dblclick', () => {
            this.connectToSavedServer(server);
        });
        
        // Single click now just selects/highlights the server item
        serverItem.addEventListener('click', () => {
            // Remove active class from all server items
            const allServerItems = document.querySelectorAll('.server-item');
            allServerItems.forEach(item => item.classList.remove('active'));
            
            // Add active class to this server item
            serverItem.classList.add('active');
            
            // Ensure that border color remains based on folder but with 'active' styling
            if (folder && folder.color) {
                // When active, we keep the border color from the folder
                serverItem.style.borderLeftColor = folder.color;
                // But adjust the background color to show it's active while keeping a hint of the folder color
                serverItem.style.backgroundColor = folder.color + '20'; // 20 = 12.5% opacity, slightly darker
            }
        });
        
        serverList.appendChild(serverItem);
    }
    
    connectToSavedServer(server) {
        
        // Create a new tab for this server (always create a new connection)
        this.createTab(server);
    }
    
    createTab(server) {
        // Hide welcome screen
        if (this.welcomeScreen) {
            this.welcomeScreen.style.display = 'none';
        }
        
        // Show toolbar
        this.showToolbar();
        
        // Generate unique tab ID
        const tabId = 'tab-' + Date.now();
        
        // Count existing tabs for this server to create a numbered indicator
        const existingTabsForServer = this.tabs.filter(tab => tab.serverId === server._id).length;
        
        // Create tab element
        const tabElement = document.createElement('div');
        tabElement.className = 'tab';
        tabElement.setAttribute('data-tab-id', tabId);
        
        const tabTitle = document.createElement('div');
        tabTitle.className = 'tab-title';
        
        // Add number to tab title if this is not the first tab for this server
        if (existingTabsForServer > 0) {
            tabTitle.textContent = `${server.name} (${existingTabsForServer + 1})`;
        } else {
            tabTitle.textContent = server.name;
        }
        
        const tabClose = document.createElement('div');
        tabClose.className = 'tab-close';
        tabClose.innerHTML = '×';
        tabClose.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeTab(tabId);
        });
        
        tabElement.appendChild(tabTitle);
        tabElement.appendChild(tabClose);
        
        tabElement.addEventListener('click', () => {
            this.activateTab(tabId);
        });
        
        // Create terminal container
        const terminalTab = document.createElement('div');
        terminalTab.className = 'terminal-tab';
        terminalTab.setAttribute('data-tab-id', tabId);
        
        // Add elements to DOM first, before initializing the terminal
        this.tabList.appendChild(tabElement);
        this.terminalContainer.appendChild(terminalTab);
        
        // Give the DOM a moment to update before initializing the terminal
        setTimeout(() => {
            // Initialize terminal
            try {
                const term = new Terminal(this.terminalOptions);
                const fitAddon = new FitAddon.FitAddon();
                term.loadAddon(fitAddon);
                
                // Make sure the terminal container exists in the DOM
                if (!document.body.contains(terminalTab)) {
                    console.error('Terminal tab is not in the DOM');
                    return;
                }
                
                term.open(terminalTab);
                
                try {
                    fitAddon.fit();
                } catch (fitError) {
                    console.error('Error fitting terminal:', fitError);
                }
                
                // Handle terminal input
                term.onData((data) => {
                    this.sendInput(data, tabId);
                });
                
                // Add tab to tabs array
                const tab = {
                    id: tabId,
                    serverId: server._id,
                    serverName: server.name,
                    connectionNumber: existingTabsForServer + 1,
                    element: tabElement,
                    terminal: terminalTab,
                    term: term,
                    fitAddon: fitAddon,
                    ws: null,
                    connected: false
                };
                
                this.tabs.push(tab);
                
                // Activate the new tab
                this.activateTab(tabId);
                
                // Connect to the server
                const connectionLabel = existingTabsForServer > 0 ? ` (Connection #${existingTabsForServer + 1})` : '';
                term.writeln(`Connecting to ${server.name}${connectionLabel} (${server.username}@${server.host})...`);
                
                // Use the current hostname with the correct protocol
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const wsUrl = `${protocol}//${window.location.host}`;
                
                term.writeln(`Opening WebSocket connection to ${wsUrl}`);
                
                // Create new connection for this tab
                this.initializeWebSocket(tab, wsUrl, server._id);
            } catch (error) {
                console.error('Error initializing terminal:', error);
                // Handle initialization error - show message to user
                const errorDiv = document.createElement('div');
                errorDiv.className = 'terminal-error';
                errorDiv.textContent = 'Failed to initialize terminal: ' + error.message;
                terminalTab.appendChild(errorDiv);
            }
        }, 0);
    }
    
    initializeWebSocket(tab, wsUrl, serverId) {
        try {
            // Create WebSocket connection with a unique session ID
            const sessionId = Date.now() + '-' + Math.floor(Math.random() * 1000000);
            const ws = new WebSocket(`${wsUrl}/api/connect/${serverId}?session=${sessionId}`);
            tab.ws = ws;
            
            ws.onopen = () => {
                tab.connected = true;
                tab.term.writeln('WebSocket connected');
                
                // Send connection request with serverId
                ws.send(JSON.stringify({
                    type: 'connect_saved',
                    serverId: serverId
                }));
                
                tab.term.writeln('Establishing SSH connection...');
                tab.term.writeln(''); // Add some space
            };
            
            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    
                    if (data.type === 'output') {
                        tab.term.write(data.data);
                        
                        // Check if this appears to be a password prompt
                        if (data.data.toLowerCase().includes('password') || 
                            data.data.toLowerCase().includes('passphrase')) {
                            
                            // Add a visual cue to help the user understand they should type
                            setTimeout(() => {
                                if (tab.ws && tab.ws.readyState === WebSocket.OPEN && tab.connected) {
                                    tab.term.write('\x1b[33m(Type your password directly in the terminal)\x1b[0m');
                                }
                            }, 200);
                        }
                    } else if (data.type === 'error') {
                        tab.term.writeln('\r\n\x1b[31mERROR: ' + data.message + '\x1b[0m');
                    } else if (data.type === 'disconnect') {
                        tab.term.writeln('\r\n\x1b[33mDisconnected: ' + data.reason + '\x1b[0m');
                        tab.connected = false;
                        // Show reconnect button or message
                        this.showReconnectOption(tab);
                    }
                } catch (parseError) {
                    console.error('Failed to parse WebSocket message:', parseError);
                    tab.term.writeln('\r\n\x1b[31mError: Failed to process server response\x1b[0m');
                }
            };
            
            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                tab.term.writeln('\r\n\x1b[31mConnection error. Please check your network connection and try again.\x1b[0m');
                tab.connected = false;
                this.showReconnectOption(tab);
            };
            
            ws.onclose = (event) => {
                if (tab.connected) { // Only show message if we were connected
                    tab.term.writeln('\r\n\x1b[33mConnection closed. ' + (event.wasClean ? 'Clean disconnect.' : 'Connection lost.') + '\x1b[0m');
                    if (event.code !== 1000) {
                        tab.term.writeln(`\x1b[33mCode: ${event.code}, Reason: ${event.reason || 'No reason provided'}\x1b[0m`);
                    }
                }
                tab.connected = false;
                this.showReconnectOption(tab);
            };
        } catch (error) {
            console.error('Failed to initialize WebSocket:', error);
            tab.term.writeln('\r\n\x1b[31mFailed to establish connection: ' + error.message + '\x1b[0m');
            this.showReconnectOption(tab);
        }
    }
    
    showReconnectOption(tab) {
        // Create a reconnect button that appears in the terminal
        const reconnectMsg = document.createElement('div');
        reconnectMsg.className = 'terminal-reconnect';
        reconnectMsg.innerHTML = '<span class="terminal-reconnect-msg">Connection lost. </span>' +
                                '<button class="terminal-reconnect-btn">Reconnect</button>';
        
        tab.terminal.appendChild(reconnectMsg);
        
        // Add click event to reconnect button
        const reconnectBtn = reconnectMsg.querySelector('.terminal-reconnect-btn');
        reconnectBtn.addEventListener('click', () => {
            // Remove the reconnect message
            reconnectMsg.remove();
            
            // Clear terminal and show reconnecting message
            tab.term.clear();
            tab.term.writeln('Reconnecting...');
            
            // Get server details from tab
            const serverId = tab.serverId;
            
            // Use the current hostname with the correct protocol
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}`;
            
            // Initialize new WebSocket connection
            this.initializeWebSocket(tab, wsUrl, serverId);
        });
    }
    
    activateTab(tabId) {
        // Deactivate all tabs
        this.tabs.forEach(tab => {
            tab.element.classList.remove('active');
            tab.terminal.classList.remove('active');
        });
        
        // Find and activate the requested tab
        const tabToActivate = this.tabs.find(tab => tab.id === tabId);
        if (tabToActivate) {
            tabToActivate.element.classList.add('active');
            tabToActivate.terminal.classList.add('active');
            this.activeTabId = tabId;
            
            // Resize the terminal to fit its container
            if (tabToActivate.fitAddon) {
                setTimeout(() => {
                    tabToActivate.fitAddon.fit();
                    if (tabToActivate.ws && tabToActivate.connected) {
                        this.sendResize(tabToActivate);
                    }
                }, 0);
            }
        }
    }
    
    closeTab(tabId) {
        const tabIndex = this.tabs.findIndex(tab => tab.id === tabId);
        if (tabIndex === -1) return;
        
        const tab = this.tabs[tabIndex];
        
        // Close the WebSocket connection if open
        if (tab.ws) {
            tab.ws.close();
        }
        
        // Remove DOM elements
        tab.element.remove();
        tab.terminal.remove();
        
        // Remove from tabs array
        this.tabs.splice(tabIndex, 1);
        
        // If this was the active tab, activate another one
        if (this.activeTabId === tabId) {
            if (this.tabs.length > 0) {
                // Activate the tab to the left, or the first tab
                const newActiveIndex = Math.max(0, tabIndex - 1);
                this.activateTab(this.tabs[newActiveIndex].id);
            } else {
                // No more tabs, show welcome screen
                this.activeTabId = null;
                if (this.welcomeScreen) {
                    this.welcomeScreen.style.display = 'flex';
                }
                // Hide toolbar
                this.hideToolbar();
            }
        }
    }
    
    closeAllTabs() {
        // Create a copy of the tabs array since we'll be modifying it
        const tabsCopy = [...this.tabs];
        
        // Close each tab
        tabsCopy.forEach(tab => {
            this.closeTab(tab.id);
        });
        
        // Hide toolbar after all tabs are closed
        this.hideToolbar();
    }
    
    getActiveTab() {
        return this.tabs.find(tab => tab.id === this.activeTabId);
    }
    
    sendResize(tab) {
        if (tab && tab.ws && tab.ws.readyState === WebSocket.OPEN && tab.term) {
            tab.ws.send(JSON.stringify({
                type: 'resize',
                cols: tab.term.cols,
                rows: tab.term.rows
            }));
        }
    }

    sendInput(data, tabId) {
        const tab = this.tabs.find(tab => tab.id === tabId);
        if (tab && tab.ws && tab.ws.readyState === WebSocket.OPEN) {
            tab.ws.send(JSON.stringify({
                type: 'input',
                data: data
            }));
        }
    }
    
    deleteServer(id) {
        if (!confirm('Are you sure you want to delete this server?')) {
            return;
        }
        
        // Close any tabs connected to this server
        const tabsToClose = this.tabs.filter(tab => tab.serverId === id);
        tabsToClose.forEach(tab => {
            this.closeTab(tab.id);
        });
        
        fetch(`/api/servers/${id}`, {
            method: 'DELETE'
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to delete server');
            }
            return response.json();
        })
        .then(() => {
            const activeTab = this.getActiveTab();
            if (activeTab && activeTab.term) {
                activeTab.term.writeln('\r\nServer deleted successfully');
            }
            this.loadServers();
        })
        .catch(error => {
            console.error('Error deleting server:', error);
            const activeTab = this.getActiveTab();
            if (activeTab && activeTab.term) {
                activeTab.term.writeln('\r\nError deleting server: ' + error.message);
            }
        });
    }
    
    // Helper methods for toolbar visibility
    showToolbar() {
        const toolbar = document.getElementById('terminalToolbar');
        if (toolbar) {
            toolbar.classList.add('visible');
        }
    }
    
    hideToolbar() {
        const toolbar = document.getElementById('terminalToolbar');
        if (toolbar) {
            toolbar.classList.remove('visible');
        }
    }
}

// Initialize the terminal manager when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // Check if required scripts are loaded
    if (typeof Terminal === 'undefined' || typeof FitAddon === 'undefined') {
        console.error('Terminal or FitAddon not found. Make sure xterm.js and its addons are properly loaded.');
        return;
    }
    
    // Create the terminal manager and make it globally accessible
    window.terminalManager = new TerminalManager();
}); 