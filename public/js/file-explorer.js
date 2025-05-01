// File Explorer Manager
const FileExplorerManager = {
    currentPath: '/',
    activeServerId: null,
    activeServerInfo: null,
    
    init: function() {
        // DOM elements
        this.fileExplorerBtn = document.getElementById('fileExplorerBtn');
        this.fileExplorerModal = document.getElementById('fileExplorerModal');
        this.fileExplorerContent = document.getElementById('fileExplorerContent');
        this.currentPathDisplay = document.getElementById('currentPath');
        this.fileBreadcrumb = document.getElementById('fileBreadcrumb');
        this.refreshFilesBtn = document.getElementById('refreshFilesBtn');
        this.fileExplorerStatus = document.getElementById('fileExplorerStatus');
        
        // Skip initialization if elements don't exist
        if (!this.fileExplorerBtn || !this.fileExplorerModal) return;
        
        // Close button for modal
        const closeButton = this.fileExplorerModal.querySelector('.close');
        if (closeButton) {
            closeButton.addEventListener('click', () => {
                this.fileExplorerModal.style.display = 'none';
            });
        }
        
        // Event listeners
        this.fileExplorerBtn.addEventListener('click', this.openFileExplorer.bind(this));
        this.refreshFilesBtn.addEventListener('click', this.refreshCurrentDirectory.bind(this));
        
        // Close modal when clicking outside
        window.addEventListener('click', (e) => {
            if (e.target === this.fileExplorerModal) {
                this.fileExplorerModal.style.display = 'none';
            }
        });
        
        // Listen for breadcrumb clicks
        this.fileBreadcrumb.addEventListener('click', (e) => {
            const breadcrumbItem = e.target.closest('.breadcrumb-item');
            if (breadcrumbItem) {
                const path = breadcrumbItem.getAttribute('data-path');
                if (path) {
                    this.navigateToDirectory(path);
                }
            }
        });
    },
    
    openFileExplorer: function() {
        // Check if there's an active terminal tab
        const activeTab = window.terminalManager?.getActiveTab();
        if (!activeTab || !activeTab.serverId) {
            alert('Please connect to a server first');
            return;
        }
        
        // Set the active server info
        this.activeServerId = activeTab.serverId;
        this.activeServerInfo = {
            name: activeTab.serverName,
            id: activeTab.serverId
        };
        
        // Show the modal
        this.fileExplorerModal.style.display = 'block';
        
        // Reset the current path
        this.currentPath = '/';
        this.updateCurrentPathDisplay();
        this.updateBreadcrumb();
        
        // List the root directory files
        this.listDirectory('/');
    },
    
    navigateToDirectory: function(path) {
        if (!path) return;
        
        this.currentPath = path;
        this.updateCurrentPathDisplay();
        this.updateBreadcrumb();
        this.listDirectory(path);
    },
    
    refreshCurrentDirectory: function() {
        this.listDirectory(this.currentPath);
    },
    
    listDirectory: function(path) {
        if (!this.activeServerId) {
            this.showError('No active server connection');
            return;
        }
        
        // Show loading state
        this.fileExplorerContent.innerHTML = '<div class="loading">Loading files...</div>';
        this.updateStatus(`Loading directory: ${path}`);
        
        // Send an SFTP list directory command via the current server's terminal
        this.executeCommand(`ls -la "${path}"`, (output) => {
            if (output.includes('No such file or directory')) {
                this.showError(`Directory not found: ${path}`);
                return;
            }
            
            // Parse the ls output and render the file list
            this.parseAndRenderFileList(output, path);
        });
    },
    
    executeCommand: function(command, callback) {
        // We'll execute the command via the active terminal's WebSocket connection
        const activeTab = window.terminalManager?.getActiveTab();
        if (!activeTab || !activeTab.ws || activeTab.ws.readyState !== WebSocket.OPEN) {
            this.showError('No active terminal connection');
            return;
        }
        
        // Create a temporary hidden terminal to capture the command output
        const tempTerminal = document.createElement('div');
        tempTerminal.style.display = 'none';
        document.body.appendChild(tempTerminal);
        
        // Create a flag to track when we're done collecting output
        let collecting = false;
        let output = '';
        let outputMarker = '--- SFTP_OUTPUT_END ---';
        
        // Listen for terminal output
        const originalOnMessage = activeTab.ws.onmessage;
        activeTab.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                if (data.type === 'output') {
                    // Check if we've reached the end marker
                    if (data.data.includes(outputMarker)) {
                        collecting = false;
                        
                        // Get the output portion before the marker
                        const parts = output.split(outputMarker);
                        output = parts[0];
                        
                        // Clean up the output (remove command echo, etc.)
                        output = this.cleanCommandOutput(output, command);
                        
                        // Restore original message handler
                        activeTab.ws.onmessage = originalOnMessage;
                        
                        // Call the callback with the output
                        callback(output);
                        
                        // Clean up
                        tempTerminal.remove();
                        return;
                    }
                    
                    // If we're collecting output, append to our buffer
                    if (collecting) {
                        output += data.data;
                    }
                    
                    // Check if this output indicates the start of our command output
                    if (data.data.includes(command)) {
                        collecting = true;
                    }
                }
            } catch (error) {
                console.error('Error processing WebSocket message:', error);
            }
            
            // Call the original message handler
            if (originalOnMessage) {
                originalOnMessage(event);
            }
        };
        
        // Send the command followed by an echo to mark the end of output
        activeTab.ws.send(JSON.stringify({
            type: 'input',
            data: command + '\n'
        }));
        
        // Send a marker command to identify the end of output
        setTimeout(() => {
            activeTab.ws.send(JSON.stringify({
                type: 'input',
                data: `echo "${outputMarker}"\n`
            }));
        }, 500);
    },
    
    cleanCommandOutput: function(output, command) {
        // Remove the command echo line and any terminal control characters
        const lines = output.split('\n');
        let cleanedLines = [];
        let foundCommand = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Skip empty lines
            if (line.trim() === '') continue;
            
            // Skip the command echo line
            if (!foundCommand && line.includes(command)) {
                foundCommand = true;
                continue;
            }
            
            // Remove ANSI escape sequences
            const cleanedLine = line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
            
            cleanedLines.push(cleanedLine);
        }
        
        return cleanedLines.join('\n');
    },
    
    parseAndRenderFileList: function(output, path) {
        const lines = output.trim().split('\n');
        const files = [];
        
        // Skip the first line (total line) and parse the rest
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Skip empty lines
            if (line === '') continue;
            
            // Parse the ls -la output format
            // Example: "drwxr-xr-x 2 user group 4096 Jan 1 12:34 dirname"
            const parts = line.split(/\s+/);
            
            // Need at least 9 parts for a valid entry
            if (parts.length < 9) continue;
            
            const permissions = parts[0];
            const size = parts[4];
            
            // The date consists of 3 parts (Month Day Time/Year)
            const month = parts[5];
            const day = parts[6];
            const timeYear = parts[7];
            
            // The name is everything after the date parts
            let name = parts.slice(8).join(' ');
            
            // Skip . and .. entries
            if (name === '.' || name === '..') continue;
            
            const isDirectory = permissions.startsWith('d');
            const isSymlink = permissions.startsWith('l');
            const isExecutable = permissions.includes('x');
            
            // If a symlink, extract the target
            let symlinkTarget = '';
            if (isSymlink && name.includes(' -> ')) {
                const linkParts = name.split(' -> ');
                name = linkParts[0];
                symlinkTarget = linkParts[1];
            }
            
            files.push({
                name,
                permissions,
                size,
                date: `${month} ${day} ${timeYear}`,
                isDirectory,
                isSymlink,
                isExecutable,
                symlinkTarget,
                path: path + (path.endsWith('/') ? '' : '/') + name
            });
        }
        
        // Sort directories first, then files alphabetically
        files.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
        });
        
        // Render the files
        this.renderFileList(files, path);
    },
    
    renderFileList: function(files, path) {
        if (files.length === 0) {
            this.fileExplorerContent.innerHTML = '<div class="empty-directory">Directory is empty</div>';
            this.updateStatus(`Directory is empty: ${path}`);
            return;
        }
        
        this.fileExplorerContent.innerHTML = '';
        
        // Add parent directory entry if not at root
        if (path !== '/') {
            const parentPath = this.getParentDirectory(path);
            const parentDir = document.createElement('div');
            parentDir.className = 'file-item';
            parentDir.innerHTML = `
                <div class="file-icon directory">
                    <i class="fas fa-level-up-alt"></i>
                </div>
                <div class="file-details">
                    <div class="file-name">..</div>
                    <div class="file-meta">
                        <div class="file-permissions">drwxr-xr-x</div>
                    </div>
                </div>
            `;
            parentDir.addEventListener('click', () => {
                this.navigateToDirectory(parentPath);
            });
            this.fileExplorerContent.appendChild(parentDir);
        }
        
        // Add file entries
        files.forEach(file => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            
            let iconClass = 'file';
            let iconElement = 'fa-file';
            
            if (file.isDirectory) {
                iconClass = 'directory';
                iconElement = 'fa-folder';
            } else if (file.isSymlink) {
                iconClass = 'file';
                iconElement = 'fa-link';
            } else if (file.isExecutable) {
                iconClass = 'file-executable';
                iconElement = 'fa-file-code';
            } else if (this.isImageFile(file.name)) {
                iconClass = 'file-image';
                iconElement = 'fa-file-image';
            } else if (this.isDocumentFile(file.name)) {
                iconClass = 'file-document';
                iconElement = 'fa-file-alt';
            } else if (this.isArchiveFile(file.name)) {
                iconClass = 'file-archive';
                iconElement = 'fa-file-archive';
            }
            
            // Create actions div for icons if not a directory
            let actionsDiv = '';
            if (!file.isDirectory) {
                actionsDiv = `
                    <div class="file-actions">
                        <button class="file-action-btn download-btn" title="Download">
                            <i class="fas fa-download"></i>
                        </button>
                        <button class="file-action-btn edit-btn" title="Edit File">
                            <i class="fas fa-code"></i>
                        </button>
                        <button class="file-action-btn rename-btn" title="Rename File">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="file-action-btn delete-btn" title="Delete File">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                `;
            } else {
                // For directories, add rename and delete buttons
                actionsDiv = `
                    <div class="file-actions">
                        <button class="file-action-btn rename-btn" title="Rename Directory">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="file-action-btn delete-btn" title="Delete Directory">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                `;
            }
            
            fileItem.innerHTML = `
                <div class="file-icon ${iconClass}">
                    <i class="fas ${iconElement}"></i>
                </div>
                <div class="file-details">
                    <div class="file-name">${this.escapeHtml(file.name)}</div>
                    <div class="file-meta">
                        <div class="file-permissions">${file.permissions}</div>
                        <div class="file-size">${this.formatFileSize(file.size)}</div>
                        <div class="file-date">${file.date}</div>
                        ${actionsDiv}
                    </div>
                </div>
            `;
            
            // Add click handler for directories
            if (file.isDirectory) {
                fileItem.addEventListener('click', () => {
                    this.navigateToDirectory(file.path);
                });
                
                // Add rename button handler for directories
                const renameBtn = fileItem.querySelector('.rename-btn');
                if (renameBtn) {
                    renameBtn.addEventListener('click', (e) => {
                        e.stopPropagation(); // Prevent navigation
                        this.renameFile(file, true); // true indicates it's a directory
                    });
                }
                
                // Add delete button handler for directories
                const deleteBtn = fileItem.querySelector('.delete-btn');
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', (e) => {
                        e.stopPropagation(); // Prevent navigation
                        this.deleteFile(file, true); // true indicates it's a directory
                    });
                }
            } else {
                // For files, add click handlers for action buttons
                const downloadBtn = fileItem.querySelector('.download-btn');
                if (downloadBtn) {
                    downloadBtn.addEventListener('click', (e) => {
                        e.stopPropagation(); // Prevent any parent click handlers
                        this.downloadFile(file);
                    });
                }
                
                // Add edit button handler for files
                const editBtn = fileItem.querySelector('.edit-btn');
                if (editBtn) {
                    editBtn.addEventListener('click', (e) => {
                        e.stopPropagation(); // Prevent any parent click handlers
                        this.editFile(file);
                    });
                }
                
                // Add rename button handler for files
                const renameBtn = fileItem.querySelector('.rename-btn');
                if (renameBtn) {
                    renameBtn.addEventListener('click', (e) => {
                        e.stopPropagation(); // Prevent any parent click handlers
                        this.renameFile(file, false); // false indicates it's a file
                    });
                }
                
                const deleteBtn = fileItem.querySelector('.delete-btn');
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', (e) => {
                        e.stopPropagation(); // Prevent any parent click handlers
                        this.deleteFile(file, false); // false indicates it's a file
                    });
                }
            }
            
            this.fileExplorerContent.appendChild(fileItem);
        });
        
        this.updateStatus(`Loaded ${files.length} items`);
    },
    
    getParentDirectory: function(path) {
        if (path === '/' || !path) return '/';
        
        // Remove trailing slash if present
        if (path.endsWith('/') && path !== '/') {
            path = path.slice(0, -1);
        }
        
        // Get the parent directory
        const lastSlashIndex = path.lastIndexOf('/');
        if (lastSlashIndex <= 0) return '/';
        
        return path.substring(0, lastSlashIndex) || '/';
    },
    
    updateCurrentPathDisplay: function() {
        if (this.currentPathDisplay) {
            this.currentPathDisplay.textContent = this.currentPath;
        }
    },
    
    updateBreadcrumb: function() {
        if (!this.fileBreadcrumb) return;
        
        // Clear current breadcrumb except the root entry
        while (this.fileBreadcrumb.childNodes.length > 2) {
            this.fileBreadcrumb.removeChild(this.fileBreadcrumb.lastChild);
        }
        
        // If we're at the root, just show the root entry
        if (this.currentPath === '/') return;
        
        // Split the path and create breadcrumb items
        const pathParts = this.currentPath.split('/').filter(part => part !== '');
        let currentPath = '';
        
        pathParts.forEach((part, index) => {
            // Add separator
            const separator = document.createElement('span');
            separator.className = 'breadcrumb-separator';
            separator.textContent = '/';
            this.fileBreadcrumb.appendChild(separator);
            
            // Update current path
            currentPath += '/' + part;
            
            // Add path part
            const breadcrumbItem = document.createElement('span');
            breadcrumbItem.className = 'breadcrumb-item';
            breadcrumbItem.textContent = part;
            breadcrumbItem.setAttribute('data-path', currentPath);
            this.fileBreadcrumb.appendChild(breadcrumbItem);
        });
    },
    
    updateStatus: function(message) {
        if (this.fileExplorerStatus) {
            this.fileExplorerStatus.textContent = message;
        }
    },
    
    showError: function(message) {
        this.fileExplorerContent.innerHTML = `<div class="error-message">${message}</div>`;
        this.updateStatus(`Error: ${message}`);
    },
    
    isImageFile: function(filename) {
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];
        return imageExtensions.some(ext => filename.toLowerCase().endsWith(ext));
    },
    
    isDocumentFile: function(filename) {
        const docExtensions = ['.txt', '.md', '.doc', '.docx', '.pdf', '.odt', '.html', '.htm', '.xml', '.json', '.csv'];
        return docExtensions.some(ext => filename.toLowerCase().endsWith(ext));
    },
    
    isArchiveFile: function(filename) {
        const archiveExtensions = ['.zip', '.tar', '.gz', '.tgz', '.rar', '.7z', '.bz2', '.xz'];
        return archiveExtensions.some(ext => filename.toLowerCase().endsWith(ext));
    },
    
    formatFileSize: function(sizeInBytes) {
        const bytes = parseInt(sizeInBytes);
        if (isNaN(bytes)) return sizeInBytes;
        
        if (bytes === 0) return '0 B';
        
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        
        return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + units[i];
    },
    
    escapeHtml: function(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    },
    
    downloadFile: function(file) {
        // Show loading status
        this.updateStatus(`Downloading: ${file.name}...`);
        
        // Get the server ID
        const serverId = this.activeServerId;
        if (!serverId) {
            this.showError('No active server connection');
            return;
        }
        
        // Create fetch request
        fetch('/api/files/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                serverId: serverId,
                filePath: file.path
            })
        })
        .then(response => {
            // Check if the response is JSON (error) or a file (success)
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                // It's an error response
                return response.json().then(data => {
                    throw new Error(data.message || 'Download failed');
                });
            } else {
                // It's a file download
                return response.blob();
            }
        })
        .then(blob => {
            // Create object URL and trigger download
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = file.name;
            document.body.appendChild(a);
            a.click();
            
            // Clean up
            window.URL.revokeObjectURL(url);
            a.remove();
            
            this.updateStatus(`Downloaded: ${file.name}`);
        })
        .catch(error => {
            this.showError(`Download failed: ${error.message}`);
        });
    },
    
    deleteFile: function(file, isDirectory) {
        // Ask for confirmation before deleting
        const fileType = isDirectory ? 'directory' : 'file';
        const confirmMessage = `Are you sure you want to delete this ${fileType}?\n\n${file.name}`;
        
        if (!confirm(confirmMessage)) {
            return; // User cancelled
        }
        
        // Show loading status
        this.updateStatus(`Deleting: ${file.name}...`);
        
        // Get the server ID
        const serverId = this.activeServerId;
        if (!serverId) {
            this.showError('No active server connection');
            return;
        }
        
        // Create fetch request
        fetch('/api/files/delete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                serverId: serverId,
                filePath: file.path,
                isDirectory: isDirectory
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                this.updateStatus(`Deleted ${fileType}: ${file.name}`);
                // Refresh the current directory to show updated file list
                this.refreshCurrentDirectory();
            } else {
                throw new Error(data.message || `Failed to delete ${fileType}`);
            }
        })
        .catch(error => {
            this.showError(`Delete failed: ${error.message}`);
        });
    },
    
    renameFile: function(file, isDirectory) {
        // Ask for a new name
        const fileType = isDirectory ? 'directory' : 'file';
        const newName = prompt(`Enter new name for ${fileType}:`, file.name);
        
        // Check if user cancelled or entered an empty name
        if (!newName || newName.trim() === '') {
            return;
        }
        
        // Check if name is unchanged
        if (newName === file.name) {
            return;
        }
        
        // Validate filename (no slashes, etc.)
        if (newName.includes('/') || newName.includes('\\')) {
            alert('Filename cannot contain slashes');
            return;
        }
        
        // Get the parent directory
        const parentDir = this.getParentDirectory(file.path);
        
        // Construct the new path
        const newPath = parentDir + (parentDir.endsWith('/') ? '' : '/') + newName;
        
        // Show loading status
        this.updateStatus(`Renaming: ${file.name} to ${newName}...`);
        
        // Get the server ID
        const serverId = this.activeServerId;
        if (!serverId) {
            this.showError('No active server connection');
            return;
        }
        
        // Create fetch request
        fetch('/api/files/rename', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                serverId: serverId,
                oldPath: file.path,
                newPath: newPath,
                isDirectory: isDirectory
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                this.updateStatus(`Renamed ${fileType}: ${file.name} to ${newName}`);
                // Refresh the current directory to show updated file list
                this.refreshCurrentDirectory();
            } else {
                throw new Error(data.message || `Failed to rename ${fileType}`);
            }
        })
        .catch(error => {
            this.showError(`Rename failed: ${error.message}`);
        });
    },
    
    editFile: function(file) {
        // Check if the file is a text/code file that can be edited
        if (!this.isEditableFile(file.name)) {
            alert('This file type is not supported for editing. Only text-based files can be edited.');
            return;
        }
        
        // Show loading status
        this.updateStatus(`Loading file for editing: ${file.name}...`);
        
        // Get the server ID
        const serverId = this.activeServerId;
        if (!serverId) {
            this.showError('No active server connection');
            return;
        }
        
        // Fetch the file content
        fetch('/api/files/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                serverId: serverId,
                filePath: file.path
            })
        })
        .then(response => {
            // Check if the response is valid
            if (!response.ok) {
                return response.json().then(data => {
                    throw new Error(data.message || 'Failed to download file for editing');
                });
            }
            
            // Get the file content as text
            return response.text();
        })
        .then(content => {
            // Open the code editor modal with the file content
            this.openCodeEditorModal(file, content);
            this.updateStatus(`Loaded file for editing: ${file.name}`);
        })
        .catch(error => {
            this.showError(`Failed to load file for editing: ${error.message}`);
        });
    },
    
    isEditableFile: function(filename) {
        // List of file extensions that can be edited
        const editableExtensions = [
            // Code files
            '.js', '.jsx', '.ts', '.tsx', '.html', '.htm', '.css', '.scss', '.less',
            '.php', '.py', '.rb', '.java', '.c', '.cpp', '.h', '.cs', '.go', '.rs',
            '.swift', '.kt', '.kts', '.sh', '.bash', '.zsh', '.ps1',
            
            // Config files
            '.json', '.xml', '.yaml', '.yml', '.toml', '.ini', '.conf', '.config',
            
            // Text files
            '.txt', '.md', '.markdown', '.csv', '.tsv', '.log',
            
            // Other common text-based files
            '.env', '.gitignore', '.dockerignore', '.htaccess', 'Dockerfile', 'Makefile'
        ];
        
        // Convert filename to lowercase
        const lowerFilename = filename.toLowerCase();
        
        // Check if the file has a known editable extension
        for (const ext of editableExtensions) {
            if (lowerFilename.endsWith(ext)) {
                return true;
            }
        }
        
        // For files without extension, check if they're known config files
        const filenameOnly = lowerFilename.split('/').pop();
        const noExtensionEditableFiles = [
            'dockerfile', 'makefile', 'jenkinsfile', '.env', '.gitignore', 
            '.dockerignore', '.htaccess', 'readme', 'license', 'authors',
            'contributing', 'changelog'
        ];
        
        if (noExtensionEditableFiles.includes(filenameOnly)) {
            return true;
        }
        
        // Not an editable file
        return false;
    },
    
    openCodeEditorModal: function(file, content) {
        // Check if the code editor modal exists, create it if not
        let codeEditorModal = document.getElementById('codeEditorModal');
        
        if (!codeEditorModal) {
            // Create the modal container
            codeEditorModal = document.createElement('div');
            codeEditorModal.id = 'codeEditorModal';
            codeEditorModal.className = 'modal';
            
            // Create the modal content
            codeEditorModal.innerHTML = `
                <div class="modal-content code-editor-modal">
                    <div class="code-editor-header">
                        <div class="editor-file-path" id="editorFilePath"></div>
                        <div class="code-editor-actions">
                            <button id="saveCodeBtn" class="code-editor-btn save-btn">
                                <i class="fas fa-save"></i> Save
                            </button>
                            <span class="close">&times;</span>
                        </div>
                    </div>
                    <div class="code-editor-container">
                        <textarea id="codeEditorTextarea"></textarea>
                    </div>
                    <div id="editorStatus" class="editor-status"></div>
                </div>
            `;
            
            // Add to the document
            document.body.appendChild(codeEditorModal);
            
            // Set up event handlers
            const closeButton = codeEditorModal.querySelector('.close');
            closeButton.addEventListener('click', () => {
                codeEditorModal.style.display = 'none';
            });
            
            // Close when clicking outside
            window.addEventListener('click', (e) => {
                if (e.target === codeEditorModal) {
                    codeEditorModal.style.display = 'none';
                }
            });
            
            // Set up save button
            const saveCodeBtn = document.getElementById('saveCodeBtn');
            saveCodeBtn.addEventListener('click', () => {
                this.saveFile();
            });
        }
        
        // Set the file path in the header
        const editorFilePath = document.getElementById('editorFilePath');
        editorFilePath.textContent = file.path;
        
        // Store the current file info for saving
        this.currentEditingFile = file;
        
        // Set the content in the textarea
        const codeEditorTextarea = document.getElementById('codeEditorTextarea');
        codeEditorTextarea.value = content;
        
        // Clear status
        const editorStatus = document.getElementById('editorStatus');
        editorStatus.textContent = '';
        
        // Show the modal
        codeEditorModal.style.display = 'block';
    },
    
    saveFile: function() {
        // Get the current file being edited
        if (!this.currentEditingFile) {
            return;
        }
        
        // Get the updated content
        const codeEditorTextarea = document.getElementById('codeEditorTextarea');
        const content = codeEditorTextarea.value;
        
        // Show saving status
        const editorStatus = document.getElementById('editorStatus');
        editorStatus.textContent = 'Saving...';
        
        // Get the server ID
        const serverId = this.activeServerId;
        if (!serverId) {
            editorStatus.textContent = 'Error: No active server connection';
            return;
        }
        
        // Send the updated content to the server
        fetch('/api/files/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                serverId: serverId,
                filePath: this.currentEditingFile.path,
                content: content
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                editorStatus.textContent = 'File saved successfully';
                // Clear the status after a delay
                setTimeout(() => {
                    editorStatus.textContent = '';
                }, 3000);
            } else {
                throw new Error(data.message || 'Failed to save file');
            }
        })
        .catch(error => {
            editorStatus.textContent = `Error: ${error.message}`;
        });
    }
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    FileExplorerManager.init();
}); 