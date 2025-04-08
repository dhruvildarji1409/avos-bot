document.addEventListener('DOMContentLoaded', () => {
    const confluenceForm = document.getElementById('confluence-form');
    const manualForm = document.getElementById('manual-form');
    const browserExtractForm = document.getElementById('browser-extract-form');
    const statusMessage = document.getElementById('status-message');
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    const extractPageIdButton = document.getElementById('extract-page-id');
    const pageIdResult = document.getElementById('page-id-result');
    
    // Tab switching
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all buttons and contents
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            // Add active class to clicked button and corresponding content
            button.classList.add('active');
            const tabId = button.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
            
            // Clear status message when switching tabs
            statusMessage.style.display = 'none';
        });
    });
    
    // Extract Page ID from URL
    extractPageIdButton.addEventListener('click', () => {
        const url = document.getElementById('confluence-url').value;
        
        if (!url) {
            pageIdResult.innerHTML = '<p class="error">Please enter a URL first</p>';
            pageIdResult.style.display = 'block';
            return;
        }
        
        try {
            // Try to extract pageId
            const urlObj = new URL(url);
            const params = new URLSearchParams(urlObj.search);
            const pageId = params.get('pageId');
            
            if (pageId) {
                const pageIdUrl = `${urlObj.origin}/pages/viewpage.action?pageId=${pageId}`;
                pageIdResult.innerHTML = `
                    <p><strong>Extracted Page ID:</strong> ${pageId}</p>
                    <p><strong>Direct Page ID URL:</strong> <a href="${pageIdUrl}" target="_blank">${pageIdUrl}</a></p>
                    <p>Using the Page ID URL often works better for API access.</p>
                `;
                // Update the URL input with the pageId URL
                document.getElementById('confluence-url').value = pageIdUrl;
            } else {
                pageIdResult.innerHTML = `
                    <p>Could not find a Page ID in this URL.</p>
                    <p>If you're having trouble accessing this page via the API, try the "Browser Extract" method instead.</p>
                `;
            }
            
            pageIdResult.style.display = 'block';
        } catch (error) {
            pageIdResult.innerHTML = `<p class="error">Invalid URL: ${error.message}</p>`;
            pageIdResult.style.display = 'block';
        }
    });
    
    // Function to display status message
    function showMessage(message, isError = false) {
        statusMessage.innerHTML = message;
        statusMessage.className = 'status-message';
        statusMessage.classList.add(isError ? 'error' : 'success');
        statusMessage.style.display = 'block';
        
        // Auto-hide the message after 10 seconds only if it's a success message
        if (!isError) {
            setTimeout(() => {
                statusMessage.className = 'status-message';
                statusMessage.style.display = 'none';
            }, 10000);
        }
    }
    
    // Function to display loading indicator with progress updates
    function showLoading(isLoading, progressMessage = null) {
        let loadingIndicator = document.getElementById('loading-indicator');
        
        if (!loadingIndicator && isLoading) {
            loadingIndicator = document.createElement('div');
            loadingIndicator.id = 'loading-indicator';
            loadingIndicator.innerHTML = `
                <div class="loading-spinner"></div>
                <p id="loading-message">Processing Confluence page. This may take a moment...</p>
                <div class="progress-container">
                    <div id="loading-progress-bar" class="progress-bar"></div>
                </div>
            `;
            document.querySelector('.tab-content.active').appendChild(loadingIndicator);
        }
        
        if (loadingIndicator) {
            if (isLoading) {
                loadingIndicator.style.display = 'flex';
                
                // Update progress message if provided
                if (progressMessage) {
                    const loadingMessage = document.getElementById('loading-message');
                    if (loadingMessage) {
                        loadingMessage.textContent = progressMessage;
                    }
                }
            } else {
                loadingIndicator.style.display = 'none';
            }
        }
    }
    
    // Function to update progress bar
    function updateProgress(percent) {
        const progressBar = document.getElementById('loading-progress-bar');
        if (progressBar) {
            progressBar.style.width = `${percent}%`;
        }
    }
    
    // Event listener for the browser extract form submission
    browserExtractForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const jsonData = document.getElementById('extracted-json').value;
        const addedBy = document.getElementById('browser-extract-added-by').value;
        
        if (!jsonData || !addedBy) {
            showMessage('Please fill in all required fields', true);
            return;
        }
        
        // Show loading indicator
        showLoading(true, 'Processing extracted content...');
        updateProgress(20);
        
        try {
            // Parse the JSON data
            const extractedData = JSON.parse(jsonData);
            
            if (!extractedData.title || !extractedData.content || !extractedData.url) {
                throw new Error('Invalid data format. Make sure the JSON contains title, content, and url fields.');
            }
            
            updateProgress(50);
            
            // Send to API for processing
            const response = await fetch('/api/confluence', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: extractedData.title,
                    content: extractedData.content,
                    url: extractedData.url,
                    addedBy,
                    tags: ['AVOS', 'Browser-Extracted']
                }),
            });
            
            updateProgress(80);
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to process extracted content');
            }
            
            const data = await response.json();
            
            // Hide loading indicator
            showLoading(false);
            updateProgress(100);
            
            // Show success message
            showMessage(`Successfully added "${extractedData.title}" to the database!`);
            browserExtractForm.reset();
            
        } catch (error) {
            // Hide loading indicator
            showLoading(false);
            
            // Show error message
            if (error.name === 'SyntaxError') {
                showMessage('Invalid JSON format. Make sure you copied the entire JSON output from the console.', true);
            } else {
                showMessage(`Error: ${error.message}`, true);
            }
        }
    });
    
    // Event listener for the Confluence form submission
    confluenceForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const confluenceUrl = document.getElementById('confluence-url').value;
        const addedBy = document.getElementById('added-by').value;
        
        if (!confluenceUrl || !addedBy) {
            showMessage('Please fill in all required fields', true);
            return;
        }
        
        // Show loading indicator
        showLoading(true, 'Starting Confluence page extraction...');
        updateProgress(10);
        
        try {
            // First step: Extract URL info
            showLoading(true, 'Analyzing Confluence URL...');
            updateProgress(20);
            
            // Send the request
            const response = await fetch('/api/confluence/fetch', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url: confluenceUrl, addedBy }),
            });
            
            updateProgress(50);
            showLoading(true, 'Processing content and generating embeddings...');
            
            // Check for non-OK response
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to add Confluence content');
            }
            
            updateProgress(80);
            showLoading(true, 'Finalizing and saving to database...');
            
            const data = await response.json();
            
            // Hide loading indicator
            showLoading(false);
            updateProgress(100);
            
            // Show success message with details
            let successMessage = `<strong>Successfully added:</strong> "${data.title}"<br>`;
            
            if (data.childrenCount) {
                successMessage += `<strong>Child pages:</strong> ${data.childrenCount} pages were also added.<br>`;
            }
            
            successMessage += `<strong>URL:</strong> <a href="${data.url}" target="_blank">${data.url}</a><br>`;
            successMessage += `<strong>Added on:</strong> ${new Date(data.addedAt).toLocaleString()}<br>`;
            
            showMessage(successMessage);
            confluenceForm.reset();
            
        } catch (error) {
            // Hide loading indicator
            showLoading(false);
            
            // Show detailed error message
            let errorMessage;
            
            if (error.message.includes('page not found')) {
                errorMessage = `<strong>Error:</strong> The Confluence page could not be found.<br>
                <strong>URL:</strong> ${confluenceUrl}<br>
                <strong>Possible reasons:</strong>
                <ul>
                    <li>The page doesn't exist or has been deleted</li>
                    <li>You don't have permission to access this page</li>
                    <li>The page is in a personal space (~username) which may require special permissions</li>
                </ul>
                <strong>Suggestions:</strong>
                <ul>
                    <li>Check if you can access the page in your browser</li>
                    <li>Try using a page ID instead of space/title if available</li>
                    <li>Try the "Browser Extract" method instead</li>
                </ul>`;
            } else {
                errorMessage = `<strong>Error:</strong> ${error.message || 'Failed to add Confluence content'}<br>
                <strong>URL:</strong> ${confluenceUrl}`;
            }
            
            showMessage(errorMessage, true);
        }
    });
    
    // Event listener for the manual form submission
    manualForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const title = document.getElementById('title').value;
        const content = document.getElementById('content').value;
        const url = document.getElementById('manual-url').value;
        const addedBy = document.getElementById('manual-added-by').value;
        const tags = document.getElementById('tags').value.split(',').map(tag => tag.trim()).filter(tag => tag);
        
        if (!title || !content || !url || !addedBy) {
            showMessage('Please fill in all required fields', true);
            return;
        }
        
        // Show loading indicator
        showLoading(true, 'Processing content and generating embeddings...');
        updateProgress(20);
        
        try {
            updateProgress(40);
            const response = await fetch('/api/confluence', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ title, content, url, addedBy, tags }),
            });
            
            updateProgress(80);
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to add content');
            }
            
            const data = await response.json();
            
            // Hide loading indicator
            showLoading(false);
            updateProgress(100);
            
            // Show success message
            showMessage(`Content "${title}" successfully added to the database!`);
            manualForm.reset();
            
        } catch (error) {
            // Hide loading indicator
            showLoading(false);
            showMessage(`Error: ${error.message || 'Failed to add content'}`, true);
        }
    });
}); 