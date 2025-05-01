// File Upload Manager
const FileUploadManager = {
    init: function() {
        // DOM elements
        this.uploadFileBtn = document.getElementById('uploadFileBtn');
        this.fileUploadModal = document.getElementById('fileUploadModal');
        this.fileUploadForm = document.getElementById('fileUploadForm');
        this.uploadDestination = document.getElementById('uploadDestination');
        this.fileToUpload = document.getElementById('fileToUpload');
        this.selectedFileName = document.getElementById('selectedUploadFileName');
        this.uploadProgress = document.getElementById('uploadProgress');
        this.progressFill = document.getElementById('progressFill');
        this.progressText = document.getElementById('progressText');
        this.uploadError = document.getElementById('uploadError');
        this.cancelUploadBtn = document.getElementById('cancelUpload');
        
        // Verify that we found all required DOM elements
        if (!this.uploadDestination) {
            console.error('Could not find upload destination field');
        }
        
        // Skip initialization if elements don't exist
        if (!this.uploadFileBtn || !this.fileUploadModal) {
            console.error('Required elements for file upload are missing');
            return;
        }
        
        // Close button for modal
        const closeButton = this.fileUploadModal.querySelector('.close');
        if (closeButton) {
            closeButton.addEventListener('click', () => {
                this.fileUploadModal.style.display = 'none';
            });
        }
        
        // Event listeners
        this.uploadFileBtn.addEventListener('click', this.openUploadModal.bind(this));
        this.fileToUpload.addEventListener('change', this.handleFileSelection.bind(this));
        this.fileUploadForm.addEventListener('submit', this.uploadFile.bind(this));
        this.cancelUploadBtn.addEventListener('click', () => {
            this.fileUploadModal.style.display = 'none';
        });
        
        // Close modal when clicking outside
        window.addEventListener('click', (e) => {
            if (e.target === this.fileUploadModal) {
                this.fileUploadModal.style.display = 'none';
            }
        });
    },
    
    openUploadModal: function() {
        // Get current directory and server directly from the DOM display
        const currentPathDisplay = document.getElementById('currentPath');
        const currentPath = currentPathDisplay ? currentPathDisplay.textContent : null;
        
        // Reference FileExplorerManager for the server ID
        const serverId = FileExplorerManager.activeServerId;
        
        if (!serverId) {
            alert('No active server connection');
            return;
        }
        
        // Store the current path temporarily
        const pathToUpload = currentPath && currentPath.trim() !== '' ? currentPath : null;
        
        if (!pathToUpload) {
            console.error('No current path found in the file explorer');
            alert('Unable to determine current directory. Please try again.');
            return;
        }
        
        // First reset the form to clear any previous values
        this.fileUploadForm.reset();
        
        // Then set the upload destination to the current directory
        this.uploadDestination.value = pathToUpload;
        
        // Reset file selection display
        this.selectedFileName.textContent = 'No file selected';
        
        // Reset any validation errors
        this.resetValidationErrors();
        
        // Show the modal
        this.fileUploadModal.style.display = 'block';
        
        // Additional validation to ensure the path is set
        if (!this.uploadDestination.value) {
            console.error('Path not set properly in form');
            this.uploadDestination.value = pathToUpload;
        }
    },
    
    handleFileSelection: function(event) {
        const file = event.target.files[0];
        if (file) {
            this.selectedFileName.textContent = file.name;
        } else {
            this.selectedFileName.textContent = 'No file selected';
        }
    },
    
    uploadFile: function(event) {
        event.preventDefault();
        
        // Reset previous error states
        this.resetValidationErrors();
        
        const serverId = FileExplorerManager.activeServerId;
        
        // Get the current path from the DOM again to ensure it's the latest
        const currentPathDisplay = document.getElementById('currentPath');
        const currentPathFromDOM = currentPathDisplay ? currentPathDisplay.textContent : null;
        
        console.log('Debug - Upload path from form:', this.uploadDestination.value);
        console.log('Debug - Current path from DOM:', currentPathFromDOM);
        
        // Use the DOM path if the form value is empty
        let remotePath = this.uploadDestination.value;
        if (!remotePath && currentPathFromDOM) {
            console.log('Debug - Using path from DOM instead');
            remotePath = currentPathFromDOM;
            this.uploadDestination.value = remotePath;
        }
        
        const file = this.fileToUpload.files[0];
        
        // Check if all required fields are present
        if (!serverId) {
            this.showError('No active server connection. Please connect to a server first.');
            return;
        }
        
        if (!remotePath) {
            this.showError('Upload destination path is not specified.');
            this.uploadDestination.classList.add('validation-error');
            return;
        }
        
        if (!file) {
            this.showError('Please select a file to upload.');
            this.fileToUpload.parentElement.classList.add('validation-error');
            return;
        }
        
        // Create form data
        const formData = new FormData();
        formData.append('serverId', serverId);
        
        // One final check - make sure we have the correct path in the form data
        if (remotePath === '/') {
            // Double check if there's a better path in the DOM
            if (currentPathFromDOM && currentPathFromDOM !== '/' && currentPathFromDOM.trim() !== '') {
                console.log('Debug - Using current DOM path instead of root');
                remotePath = currentPathFromDOM;
            }
        }
        
        // At this point we must have a path, so force '/' if we don't
        if (!remotePath || remotePath.trim() === '') {
            console.log('Debug - Forcing root path as fallback');
            remotePath = '/';
        }
        
        formData.append('remotePath', remotePath);
        formData.append('file', file);
        
        // Show progress bar
        this.uploadProgress.style.display = 'block';
        this.uploadError.style.display = 'none';
        
        // Create AJAX request
        const xhr = new XMLHttpRequest();
        
        // Progress event
        xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
                const percentComplete = Math.round((event.loaded / event.total) * 100);
                this.progressFill.style.width = percentComplete + '%';
                this.progressText.textContent = percentComplete + '%';
            }
        });
        
        // Load event
        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                // Success
                const response = JSON.parse(xhr.responseText);
                this.progressFill.style.width = '100%';
                this.progressText.textContent = 'Upload complete!';
                
                // Close modal after a brief delay and refresh directory
                setTimeout(() => {
                    this.fileUploadModal.style.display = 'none';
                    // Refresh the file explorer
                    FileExplorerManager.refreshCurrentDirectory();
                }, 1000);
            } else {
                // Error
                let errorMessage = 'Upload failed';
                try {
                    const response = JSON.parse(xhr.responseText);
                    if (response.message) {
                        errorMessage = response.message;
                    } else if (xhr.status === 413) {
                        errorMessage = 'File too large. Please select a smaller file.';
                    } else if (xhr.status === 401) {
                        errorMessage = 'Authentication error. Please reconnect to the server.';
                    } else if (xhr.status === 403) {
                        errorMessage = 'Permission denied. You do not have access to upload to this location.';
                    } else if (xhr.status === 404) {
                        errorMessage = 'Server or path not found. Please check your connection.';
                    } else if (xhr.status === 500) {
                        errorMessage = 'Server error occurred while uploading. Please try again later.';
                    } else {
                        errorMessage = `Upload failed with status ${xhr.status}: ${xhr.statusText}`;
                    }
                } catch (e) {
                    errorMessage = `Upload failed with status ${xhr.status}: ${xhr.statusText}`;
                }
                this.showError(errorMessage);
            }
        });
        
        // Error event
        xhr.addEventListener('error', () => {
            this.showError('Network error occurred during upload');
        });
        
        // Abort event
        xhr.addEventListener('abort', () => {
            this.showError('Upload was aborted');
        });
        
        // Open and send the request
        xhr.open('POST', '/api/files/upload');
        xhr.send(formData);
    },
    
    showError: function(message) {
        this.uploadError.textContent = message;
        this.uploadError.style.display = 'block';
        
        // Make progress bar red to indicate error
        this.progressFill.style.backgroundColor = '#f44336';
        
        // Make sure progress bar is visible
        this.uploadProgress.style.display = 'block';
        
        // Shake the error message briefly for attention
        this.uploadError.classList.add('shake');
        setTimeout(() => {
            this.uploadError.classList.remove('shake');
        }, 500);
        
        // Update progress text
        this.progressText.textContent = 'Failed';
    },
    
    resetValidationErrors: function() {
        // Clear any existing error states
        this.uploadError.style.display = 'none';
        this.uploadProgress.style.display = 'none';
        this.progressFill.style.backgroundColor = '#007acc'; // Reset to original color
        this.progressFill.style.width = '0%'; // Reset progress width
        this.progressText.textContent = '0%'; // Reset progress text
        this.uploadDestination.classList.remove('validation-error');
        this.fileToUpload.parentElement.classList.remove('validation-error');
    }
};

// Initialize when document is loaded
document.addEventListener('DOMContentLoaded', () => {
    FileUploadManager.init();
}); 