document.addEventListener('DOMContentLoaded', () => {
    // Get the fullscreen button
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    const terminalContainer = document.getElementById('terminalContainer');
    const terminalToolbar = document.getElementById('terminalToolbar');
    const currentTerminalTitle = document.getElementById('currentTerminalTitle');
    const welcomeScreen = document.getElementById('welcomeScreen');
    
    // Fullscreen toggle state
    let isFullscreen = false;
    
    // Add click event listener to the fullscreen button
    fullscreenBtn.addEventListener('click', () => {
        toggleFullscreen();
    });
    
    // Function to toggle fullscreen mode
    function toggleFullscreen() {
        isFullscreen = !isFullscreen;
        
        if (isFullscreen) {
            // Enter native fullscreen
            if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen();
            } else if (document.documentElement.mozRequestFullScreen) { // Firefox
                document.documentElement.mozRequestFullScreen();
            } else if (document.documentElement.webkitRequestFullscreen) { // Chrome, Safari, Opera
                document.documentElement.webkitRequestFullscreen();
            } else if (document.documentElement.msRequestFullscreen) { // IE/Edge
                document.documentElement.msRequestFullscreen();
            }
            
            // Update button appearance
            terminalContainer.classList.add('fullscreen-terminal');
            fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i>';
            fullscreenBtn.title = 'Exit Fullscreen';
            
            // If a terminal tab is active, update the title
            updateActiveTerminalTitle();
        } else {
            // Exit native fullscreen
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.mozCancelFullScreen) { // Firefox
                document.mozCancelFullScreen();
            } else if (document.webkitExitFullscreen) { // Chrome, Safari, Opera
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) { // IE/Edge
                document.msExitFullscreen();
            }
            
            // Update button appearance
            terminalContainer.classList.remove('fullscreen-terminal');
            fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
            fullscreenBtn.title = 'Toggle Fullscreen';
        }
        
        // Resize any active terminals
        setTimeout(() => {
            // Access the terminal manager through the window object
            if (window.terminalManager) {
                window.terminalManager.resizeActiveTerminal();
            }
        }, 100);
    }
    
    // Listen for fullscreen change events
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    
    function handleFullscreenChange() {
        // Update isFullscreen state based on document's fullscreen state
        const newFullscreenState = !!document.fullscreenElement || 
                                 !!document.mozFullScreenElement || 
                                 !!document.webkitFullscreenElement || 
                                 !!document.msFullscreenElement;
        
        // Only update if the state has changed
        if (isFullscreen !== newFullscreenState) {
            isFullscreen = newFullscreenState;
            
            // Update the button and container
            if (isFullscreen) {
                terminalContainer.classList.add('fullscreen-terminal');
                fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i>';
                fullscreenBtn.title = 'Exit Fullscreen';
                
                // Update the terminal title to include exit instructions
                const activeTabTitle = currentTerminalTitle.textContent;
                currentTerminalTitle.innerHTML = `<i class="fas fa-expand-arrows-alt"></i> FULLSCREEN MODE: ${activeTabTitle} <span style="opacity: 0.7; font-size: 12px;">(Press ESC or click <i class="fas fa-compress"></i> to exit)</span>`;
            } else {
                terminalContainer.classList.remove('fullscreen-terminal');
                fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
                fullscreenBtn.title = 'Toggle Fullscreen';
                
                // Reset the title
                updateActiveTerminalTitle();
            }
            
            // Resize the terminal after a short delay to accommodate for layout changes
            setTimeout(() => {
                if (window.terminalManager) {
                    window.terminalManager.resizeActiveTerminal();
                }
            }, 100);
        }
    }
    
    // Function to update the title in the terminal toolbar
    function updateActiveTerminalTitle() {
        const activeTab = document.querySelector('.tab.active');
        if (activeTab) {
            const tabTitle = activeTab.querySelector('.tab-title').textContent;
            currentTerminalTitle.textContent = tabTitle || 'Terminal';
        } else {
            currentTerminalTitle.textContent = 'Terminal';
        }
    }
    
    // Update title when tab is changed
    const tabList = document.getElementById('tabList');
    if (tabList) {
        tabList.addEventListener('click', (e) => {
            // Wait a bit for the active tab to update
            setTimeout(updateActiveTerminalTitle, 10);
        });
    }
    
    // Keyboard shortcut for toggling fullscreen (F11)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'F11' && !e.repeat) {
            e.preventDefault(); // Prevent default F11 behavior
            toggleFullscreen();
        }
        
        // Note: we don't need to handle Escape key explicitly anymore
        // as the browser's fullscreen API handles it automatically
    });
    
    // Function to show toolbar when a terminal is active
    function showToolbar() {
        if (terminalToolbar) {
            terminalToolbar.classList.add('visible');
            updateActiveTerminalTitle();
        }
    }
    
    // Function to hide toolbar when no terminals are active
    function hideToolbar() {
        if (terminalToolbar) {
            terminalToolbar.classList.remove('visible');
            
            // If we're in fullscreen, exit when closing the terminal
            if (isFullscreen) {
                toggleFullscreen();
            }
        }
    }
    
    // Observer to watch for changes in the terminal container
    const observer = new MutationObserver((mutations) => {
        for (let mutation of mutations) {
            if (mutation.type === 'childList') {
                // Check if welcome screen is visible
                const isWelcomeVisible = welcomeScreen && 
                    getComputedStyle(welcomeScreen).display !== 'none';
                
                // Show toolbar only if welcome screen is not visible (meaning we have a terminal open)
                if (!isWelcomeVisible) {
                    showToolbar();
                } else {
                    hideToolbar();
                }
            }
        }
    });
    
    // Start observing the terminal container
    if (terminalContainer) {
        observer.observe(terminalContainer, { childList: true, subtree: true });
    }
    
    // Initial check in case terminals are already open
    if (welcomeScreen && getComputedStyle(welcomeScreen).display === 'none') {
        showToolbar();
    } else {
        hideToolbar();
    }
}); 