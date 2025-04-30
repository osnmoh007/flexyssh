/**
 * Identity Management JavaScript
 * Handles CRUD operations for user identities
 */

// DOM Elements
const identitiesModal = document.getElementById('identitiesModal');
const identityFormModal = document.getElementById('identityFormModal');
const manageIdentitiesBtn = document.getElementById('manageIdentitiesBtn');
const addIdentityBtn = document.getElementById('addIdentityBtn');
const identitiesList = document.getElementById('identitiesList');
const identityForm = document.getElementById('identityForm');
const identityFormTitle = document.getElementById('identityFormTitle');
const identityId = document.getElementById('identityId');
const identityName = document.getElementById('identityName');
const identityUsername = document.getElementById('identityUsername');
const identityAuthTypePassword = document.getElementById('identityAuthTypePassword');
const identityAuthTypeKey = document.getElementById('identityAuthTypeKey');
const identityPasswordSection = document.getElementById('identityPasswordSection');
const identityKeySection = document.getElementById('identityKeySection');
const identityPassword = document.getElementById('identityPassword');
const identityPrivateKey = document.getElementById('identityPrivateKey');
const identityKeyPassphrase = document.getElementById('identityKeyPassphrase');
const identityKeyFileInput = document.getElementById('identityKeyFileInput');
const identitySelectedFileName = document.getElementById('identitySelectedFileName');
const cancelIdentityBtn = document.getElementById('cancelIdentity');
const deleteIdentityBtn = document.getElementById('deleteIdentity');

// Identity Modal Controls
manageIdentitiesBtn.addEventListener('click', () => {
    loadIdentities();
    identitiesModal.style.display = 'block';
});

// Close modals when clicking the X or outside the modal
document.querySelectorAll('#identitiesModal .close, #identityFormModal .close').forEach(closeBtn => {
    closeBtn.addEventListener('click', () => {
        identitiesModal.style.display = 'none';
        identityFormModal.style.display = 'none';
    });
});

window.addEventListener('click', (e) => {
    if (e.target === identitiesModal) {
        identitiesModal.style.display = 'none';
    }
    if (e.target === identityFormModal) {
        identityFormModal.style.display = 'none';
    }
});

// Add Identity Button
addIdentityBtn.addEventListener('click', () => {
    resetIdentityForm();
    identityFormTitle.textContent = 'Add Identity';
    deleteIdentityBtn.style.display = 'none';
    identitiesModal.style.display = 'none';
    identityFormModal.style.display = 'block';
});

// Cancel Identity Button
cancelIdentityBtn.addEventListener('click', () => {
    identityFormModal.style.display = 'none';
    identitiesModal.style.display = 'block';
});

// Delete Identity Button
deleteIdentityBtn.addEventListener('click', async () => {
    if (!identityId.value) return;
    
    if (confirm('Are you sure you want to delete this identity?')) {
        try {
            const response = await fetch(`/api/identities/${identityId.value}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                identityFormModal.style.display = 'none';
                identitiesModal.style.display = 'block';
                loadIdentities();
            } else {
                const error = await response.json();
                alert(`Failed to delete identity: ${error.message}`);
            }
        } catch (err) {
            console.error('Error deleting identity:', err);
            alert('Failed to delete identity: ' + err.message);
        }
    }
});

// Toggle authentication sections based on selected auth type
identityAuthTypePassword.addEventListener('change', () => {
    if (identityAuthTypePassword.checked) {
        identityPasswordSection.style.display = 'block';
        identityKeySection.style.display = 'none';
        
        // Clear key data if switching from key to password
        identityPrivateKey.value = '';
        identityKeyPassphrase.value = '';
        identitySelectedFileName.textContent = 'No file selected';
    }
});

identityAuthTypeKey.addEventListener('change', () => {
    if (identityAuthTypeKey.checked) {
        identityPasswordSection.style.display = 'none';
        identityKeySection.style.display = 'block';
        
        // Clear password if switching from password to key
        identityPassword.value = '';
    }
});

// Handle key file input
identityKeyFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        const file = e.target.files[0];
        identitySelectedFileName.textContent = file.name;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            const keyData = event.target.result;
            
            // Upload the key to the server instead of storing it directly in the identity
            uploadKeyFile(keyData)
                .then(keyId => {
                    // Store the key file reference instead of the actual key
                    identityPrivateKey.value = `file:${keyId}`;
                })
                .catch(error => {
                    console.error('Error uploading key file:', error);
                    alert('Failed to upload key file: ' + error.message);
                    identitySelectedFileName.textContent = 'Upload failed';
                });
        };
        reader.readAsText(file);
    } else {
        identitySelectedFileName.textContent = 'No file selected';
    }
});

// Add event listener for manual key entry
identityPrivateKey.addEventListener('input', () => {
    if (identityPrivateKey.value && !identityPrivateKey.value.startsWith('file:')) {
        // User is manually typing or pasting key content
        identitySelectedFileName.textContent = 'Manually entered key';
    }
});

// Function to upload a key file to the server
async function uploadKeyFile(keyData) {
    const response = await fetch('/api/keys', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ keyData })
    });
    
    if (!response.ok) {
        throw new Error('Failed to upload SSH key');
    }
    
    const data = await response.json();
    return data.keyId;
}

// Handle Identity Form Submission
identityForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const identityData = {
        name: identityName.value,
        username: identityUsername.value,
        authType: identityAuthTypePassword.checked ? 'password' : 'key',
    };
    
    if (identityAuthTypePassword.checked && identityPassword.value) {
        identityData.password = identityPassword.value;
    } else if (identityAuthTypeKey.checked && identityPrivateKey.value) {
        // Pass the key data as is - could be a file reference or a raw key
        identityData.privateKey = identityPrivateKey.value;
        
        // If it's a raw key and not a file reference, upload it to save as a file
        if (identityPrivateKey.value && !identityPrivateKey.value.startsWith('file:')) {
            try {
                const keyId = await uploadKeyFile(identityPrivateKey.value);
                identityData.privateKey = `file:${keyId}`;
            } catch (error) {
                console.error('Error uploading raw key:', error);
                alert('Failed to upload key: ' + error.message);
                return;
            }
        }
        
        if (identityKeyPassphrase.value) {
            identityData.keyPassphrase = identityKeyPassphrase.value;
        }
    }
    
    try {
        const url = identityId.value 
            ? `/api/identities/${identityId.value}` 
            : '/api/identities';
        
        const method = identityId.value ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(identityData)
        });
        
        if (response.ok) {
            identityFormModal.style.display = 'none';
            identitiesModal.style.display = 'block';
            loadIdentities();
        } else {
            const error = await response.json();
            alert(`Failed to save identity: ${error.message}`);
        }
    } catch (err) {
        console.error('Error saving identity:', err);
        alert('Failed to save identity: ' + err.message);
    }
});

// Function to load all identities
async function loadIdentities() {
    try {
        identitiesList.innerHTML = '<div class="loading">Loading...</div>';
        
        const response = await fetch('/api/identities');
        if (!response.ok) {
            throw new Error('Failed to fetch identities');
        }
        
        const identities = await response.json();
        
        if (identities.length === 0) {
            identitiesList.innerHTML = '<div class="no-items">No identities found</div>';
            return;
        }
        
        identitiesList.innerHTML = '';
        identities.forEach(identity => {
            const identityElement = document.createElement('div');
            identityElement.className = 'identity-item';
            identityElement.dataset.id = identity._id;
            
            identityElement.innerHTML = `
                <div class="identity-info">
                    <div class="identity-name">${identity.name}</div>
                    <div class="identity-details">
                        <span class="identity-username">${identity.username}</span>
                        <span class="identity-auth-badge ${identity.authType}">${identity.authType}</span>
                    </div>
                </div>
                <div class="identity-actions">
                    <button class="edit-btn"><i class="fas fa-edit"></i></button>
                </div>
            `;
            
            const editBtn = identityElement.querySelector('.edit-btn');
            editBtn.addEventListener('click', () => editIdentity(identity._id));
            
            identitiesList.appendChild(identityElement);
        });
    } catch (err) {
        console.error('Error loading identities:', err);
        identitiesList.innerHTML = '<div class="error">Failed to load identities</div>';
    }
}

// Function to edit an identity
async function editIdentity(id) {
    try {
        const response = await fetch(`/api/identities/${id}`);
        if (!response.ok) {
            throw new Error('Failed to fetch identity');
        }
        
        const identity = await response.json();
        
        // Set form fields
        identityId.value = identity._id;
        identityName.value = identity.name;
        identityUsername.value = identity.username;
        
        if (identity.authType === 'password') {
            identityAuthTypePassword.checked = true;
            identityPasswordSection.style.display = 'block';
            identityKeySection.style.display = 'none';
            identityPassword.value = identity.password || '';
        } else {
            identityAuthTypeKey.checked = true;
            identityPasswordSection.style.display = 'none';
            identityKeySection.style.display = 'block';
            
            // Check if the key is stored as a file reference
            if (identity.privateKey && identity.privateKey.startsWith('file:')) {
                // For file-based keys, just store the reference and show a placeholder
                identityPrivateKey.value = identity.privateKey;
                identitySelectedFileName.textContent = 'Server-stored SSH key';
            } else {
                // For keys stored directly in the database (legacy)
                identityPrivateKey.value = identity.privateKey || '';
                identitySelectedFileName.textContent = 'Key loaded from database';
            }
            
            identityKeyPassphrase.value = identity.keyPassphrase || '';
        }
        
        // Update form title and show delete button
        identityFormTitle.textContent = 'Edit Identity';
        deleteIdentityBtn.style.display = 'inline-block';
        
        // Show the form modal
        identitiesModal.style.display = 'none';
        identityFormModal.style.display = 'block';
    } catch (err) {
        console.error('Error fetching identity:', err);
        alert('Failed to load identity: ' + err.message);
    }
}

// Reset identity form
function resetIdentityForm() {
    identityForm.reset();
    identityId.value = '';
    identityPrivateKey.value = '';
    identityKeyPassphrase.value = '';
    identitySelectedFileName.textContent = 'No file selected';
    identityPasswordSection.style.display = 'block';
    identityKeySection.style.display = 'none';
    identityAuthTypePassword.checked = true;
    
    // Reset file input
    if (identityKeyFileInput) {
        identityKeyFileInput.value = '';
    }
}

// Function to update form fields based on identity selection
function updateFormRequirements(useIdentity = false) {
    try {
        const manualIdentitySection = document.getElementById('manualIdentitySection');
        
        // These are the fields that need to be managed
        const usernameInput = document.getElementById('serverUsername');
        const passwordInput = document.getElementById('serverPassword');
        const privateKeyInput = document.getElementById('privateKey');
        
        if (useIdentity) {
            // Using an identity, hide manual section and remove required attributes
            if (manualIdentitySection) {
                manualIdentitySection.style.display = 'none';
            }
            
            if (usernameInput) {
                usernameInput.removeAttribute('required');
            }
            
            if (passwordInput) {
                passwordInput.removeAttribute('required');
            }
            
            if (privateKeyInput) {
                privateKeyInput.removeAttribute('required');
            }
        } else {
            // Using manual entry, show fields and set required attributes
            if (manualIdentitySection) {
                manualIdentitySection.style.display = 'block';
            }
            
            if (usernameInput) {
                usernameInput.setAttribute('required', 'required');
            }
            
            // Password and private key are not strictly required
        }
    } catch (error) {
        console.error('Error updating form requirements:', error);
    }
}

// On document load, setup identity selector in the server form
document.addEventListener('DOMContentLoaded', async () => {
    // Load identities into the server form dropdown
    await updateIdentitySelector();
    
    // Setup identity selector change event
    const identitySelector = document.getElementById('identitySelector');
    
    if (identitySelector) {
        // Remove any existing event listeners to prevent conflicts
        const newIdentitySelector = identitySelector.cloneNode(true);
        identitySelector.parentNode.replaceChild(newIdentitySelector, identitySelector);
        
        // Add the change event listener
        newIdentitySelector.addEventListener('change', () => {
            const useIdentity = newIdentitySelector.value !== 'manual';
            updateFormRequirements(useIdentity);
        });
        
        // Only set initial state if we're not already editing a server
        // Check if we're in edit mode by looking for editingServerId in the TerminalManager
        const isEditing = window.terminalManager && window.terminalManager.editingServerId;
        
        if (!isEditing) {
            // Set initial state based on current selection (only for new servers)
            const useIdentity = newIdentitySelector.value !== 'manual';
            updateFormRequirements(useIdentity);
        }
    }
});

// Update the identity selector in the server form
async function updateIdentitySelector(preserveSelection = false) {
    const identitySelector = document.getElementById('identitySelector');
    if (!identitySelector) return Promise.resolve();
    
    try {
        // Store current selection if we need to preserve it
        const currentSelectionId = preserveSelection ? identitySelector.value : null;
        
        const response = await fetch('/api/identities');
        if (!response.ok) {
            throw new Error('Failed to fetch identities');
        }
        
        const identities = await response.json();
        
        // Clear existing options except the first one (manual)
        while (identitySelector.options.length > 1) {
            identitySelector.remove(1);
        }
        
        // Add identity options
        identities.forEach(identity => {
            const option = document.createElement('option');
            option.value = identity._id;
            option.textContent = `${identity.name} (${identity.username})`;
            identitySelector.appendChild(option);
        });
        
        // Restore previous selection if it exists in the new list
        if (preserveSelection && currentSelectionId && currentSelectionId !== 'manual') {
            // Check if the option exists in the new list
            const optionExists = Array.from(identitySelector.options).some(
                option => option.value === currentSelectionId
            );
            
            if (optionExists) {
                identitySelector.value = currentSelectionId;
            }
        }
        
        return Promise.resolve();
    } catch (err) {
        console.error('Error loading identities for selector:', err);
        return Promise.reject(err);
    }
}

// Make updateIdentitySelector available globally
window.updateIdentitySelector = updateIdentitySelector;

// Make updateFormRequirements available globally
window.updateFormRequirements = updateFormRequirements; 