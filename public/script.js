document.addEventListener('DOMContentLoaded', () => {
    // Flags to prevent concurrent API calls
    window.isProcessingSendRequest = false;
    
    // Check if user is logged in
    const token = localStorage.getItem('auth_token');
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    
    // Set global variables for user ID and active session
    window.currentUserId = user.id || localStorage.getItem('userId') || 'guest';
    window.activeSession = { sessionId: null };
    
    // Also store user ID in a local variable for consistent access
    const userId = window.currentUserId;
    
    console.log("Initialized with user ID:", userId);
    
    if (!token) {
        // Redirect to login if not authenticated
        window.location.href = '/login';
        return;
    }

    const chatMessages = document.getElementById('chat-messages');
    const userInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-btn');
    const shareButton = document.createElement('button');
    const newChatButton = document.getElementById('new-chat-btn');
    const renameChatButton = document.getElementById('rename-chat-btn');
    const clearChatButton = document.getElementById('clear-chat-btn');
    const renameModal = document.getElementById('rename-modal');
    const confirmModal = document.getElementById('confirm-modal');
    const saveNameButton = document.getElementById('save-chat-name');
    const newChatNameInput = document.getElementById('new-chat-name');
    const closeModalButtons = document.querySelectorAll('.close-modal');
    const confirmOkButton = document.getElementById('confirm-ok');
    const confirmCancelButton = document.getElementById('confirm-cancel');
    const chatSessionsList = document.getElementById('chat-sessions-list');
    
    // Set up the Go Search button if it exists
    const goSearchButton = document.getElementById('go-search');
    if (goSearchButton) {
        goSearchButton.addEventListener('click', async () => {
            // Prevent concurrent API calls
            if (window.isProcessingSendRequest) {
                console.log("Request already in progress, please wait...");
                return;
            }
            
            window.isProcessingSendRequest = true;
            
            const messageInput = document.getElementById('message-input');
            const message = messageInput.value.trim();
            
            if (message) {
                try {
                    // Show typing indicator
                    document.getElementById('typing-indicator').style.display = 'block';
                    
                    console.log("Performing Confluence search for:", message);
                    
                    // Make API call to Confluence search
                    const response = await fetchWithAuth(`/api/confluence-mcp/search?query=${encodeURIComponent(message)}`);
                    
                    // Hide typing indicator first, before any potential errors
                    document.getElementById('typing-indicator').style.display = 'none';
                    
                    if (!response.ok) {
                        console.error(`Search failed with status: ${response.status}`);
                        addMessage(`Sorry, there was an error searching Confluence (${response.status}). Please try again later.`, false);
                        window.isProcessingSendRequest = false;
                        return;
                    }
                    
                    let data;
                    try {
                        data = await response.json();
                        console.log("Search results:", data);
                    } catch (jsonError) {
                        console.error("Failed to parse search results JSON:", jsonError);
                        addMessage("Sorry, there was an error processing the search results. Please try again later.", false);
                        window.isProcessingSendRequest = false;
                        return;
                    }
                    
                    // Format the search results as a message
                    let botReply = `Here are the search results from Confluence for "${message}":\n\n`;
                    
                    if (data && data.results && data.results.length > 0) {
                        data.results.forEach((result, index) => {
                            botReply += `${index + 1}. [${result.title}](${result.url})\n`;
                            if (result.excerpt) {
                                botReply += `   ${result.excerpt.replace(/<[^>]*>/g, '')}\n\n`;
                            }
                        });
                    } else {
                        botReply += "No results found in Confluence. Please try different search terms.";
                    }
                    
                    // Add bot message with the search results
                    const botMessageElement = addMessage(botReply, false, 'CONFLUENCE_SEARCH');
                    
                    // Update answer card
                    updateAnswerCard(botReply, null, 'CONFLUENCE_SEARCH');
                    
                    // Process sources in the reply if any
                    processSourcesInMessage(botReply, botMessageElement);
                    
                    // Also log this interaction to the chat history
                    const userId = window.currentUserId || localStorage.getItem('userId');
                    const activeSessionId = window.activeSession ? window.activeSession.sessionId : null;
                    
                    // Only try to save to history if we have user ID and session
                    if (userId && activeSessionId) {
                        try {
                            // Send message to server to save the conversation with a timeout
                            const savePromise = fetchWithAuth('/api/chat', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    userId: userId,
                                    message: `GO SEARCH: ${message}`,
                                    sessionId: activeSessionId,
                                    searchReply: botReply,
                                    isConfluenceSearch: true
                                })
                            });
                            
                            // Add a timeout for the save operation
                            const timeoutPromise = new Promise((_, reject) => {
                                setTimeout(() => reject(new Error('Save operation timed out')), 5000);
                            });
                            
                            // Race the save operation against the timeout
                            await Promise.race([savePromise, timeoutPromise])
                                .catch(error => {
                                    console.warn('Chat history save operation issue (search will still work):', error.message);
                                });
                        } catch (searchSaveError) {
                            console.error('Error saving search to history:', searchSaveError);
                            // Don't show error to user, just log it - the search already worked
                        }
                    }
                    
                    window.isProcessingSendRequest = false;
                } catch (error) {
                    console.error('Error searching Confluence:', error);
                    
                    // Hide typing indicator
                    document.getElementById('typing-indicator').style.display = 'none';
                    
                    // Add error message
                    addMessage("Sorry, there was an error searching Confluence. Please try again later.", false);
                    
                    window.isProcessingSendRequest = false;
                }
            } else {
                // If no message in input, get the last user message from the chat
                const messages = document.querySelectorAll('.message');
                let lastUserMessage = '';
                
                for (let i = messages.length - 1; i >= 0; i--) {
                    if (messages[i].classList.contains('user-message')) {
                        const content = messages[i].querySelector('.message-content');
                        if (content) {
                            lastUserMessage = content.textContent.trim();
                            break;
                        }
                    }
                }
                
                if (lastUserMessage) {
                    // Set the message input value and trigger click event
                    messageInput.value = lastUserMessage;
                    setTimeout(() => {
                        goSearchButton.click();
                    }, 100);
                } else {
                    alert('Please enter a search query first');
                    window.isProcessingSendRequest = false;
                }
            }
        });
    }

    // Create user profile element
    const userProfileContainer = document.createElement('div');
    userProfileContainer.className = 'user-profile';
    userProfileContainer.innerHTML = `
        <div class="user-avatar">
            <i class="fas fa-user"></i>
        </div>
        <div class="user-info">
            <div class="username">${user.username || 'User'}</div>
        </div>
        <div class="user-actions">
            <button id="logout-button" title="Logout">
                <i class="fas fa-sign-out-alt"></i>
            </button>
        </div>
    `;
    
    // Insert user profile at the top of sidebar
    const sidebarHeader = document.querySelector('.sidebar-header');
    sidebarHeader.parentNode.insertBefore(userProfileContainer, sidebarHeader);
    
    // Add logout handler
    document.getElementById('logout-button').addEventListener('click', () => {
        // Show confirmation modal
        document.getElementById('confirm-title').textContent = 'Logout';
        document.getElementById('confirm-message').textContent = 'Are you sure you want to logout?';
        confirmModal.style.display = 'block';
        
        // Set up the confirm action
        confirmOkButton.onclick = () => {
            // Clear auth tokens
            localStorage.removeItem('auth_token');
            localStorage.removeItem('user');
            
            // Redirect to login
            window.location.href = '/login';
            
            // Hide modal
            confirmModal.style.display = 'none';
        };
    });
    
    // Add share button to the UI
    shareButton.id = 'share-button';
    shareButton.className = 'action-button';
    shareButton.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg> Share';
    document.querySelector('.chat-input').appendChild(shareButton);
    
    // Track current session
    let currentSessionId = null;
    
    // Create fetch with auth headers
    const fetchWithAuth = async (url, options = {}) => {
        const headers = {
            ...options.headers,
            'Authorization': `Bearer ${token}`
        };
        
        const response = await fetch(url, {
            ...options,
            headers
        });
        
        // Handle token expiry - redirect to login
        if (response.status === 401) {
            localStorage.removeItem('auth_token');
            localStorage.removeItem('user');
            window.location.href = '/login';
            throw new Error('Authentication expired');
        }
        
        return response;
    };
    
    // Load chat sessions
    async function loadChatSessions() {
        try {
            const response = await fetchWithAuth(`/api/chat-sessions/${userId}`);
            
            if (!response.ok) {
                throw new Error('Failed to load chat sessions');
            }
            
            const data = await response.json();
            
            // Store active session globally
            if (data.activeSessionId) {
                window.activeSession = { sessionId: data.activeSessionId };
                currentSessionId = data.activeSessionId;
            }
            
            // Clear existing sessions
            while (chatSessionsList.firstChild) {
                chatSessionsList.removeChild(chatSessionsList.firstChild);
            }
            
            // Add section title
            if (data.sessions && data.sessions.length > 0) {
                const sectionTitle = document.createElement('div');
                sectionTitle.className = 'sessions-section-title';
                sectionTitle.textContent = 'Recent Conversations';
                chatSessionsList.appendChild(sectionTitle);
                
                data.sessions.forEach(session => {
                    const sessionDiv = document.createElement('div');
                    sessionDiv.className = 'chat-session';
                    sessionDiv.dataset.sessionId = session.sessionId;
                    if (session.sessionId === data.activeSessionId) {
                        sessionDiv.classList.add('active');
                        currentSessionId = session.sessionId;
                        document.getElementById('current-chat-name').textContent = session.sessionName;
                    }
                    
                    // Add chat icon
                    const iconContainer = document.createElement('div');
                    iconContainer.className = 'session-icon';
                    iconContainer.innerHTML = '<i class="fas fa-comments"></i>';
                    
                    const sessionInfo = document.createElement('div');
                    sessionInfo.className = 'session-info';
                    
                    const sessionName = document.createElement('div');
                    sessionName.className = 'session-name';
                    sessionName.textContent = session.sessionName;
                    
                    const sessionTime = document.createElement('div');
                    sessionTime.className = 'session-time';
                    // Format date as a relative time (today, yesterday, or date)
                    const date = new Date(session.lastUpdatedAt);
                    const today = new Date();
                    const yesterday = new Date(today);
                    yesterday.setDate(yesterday.getDate() - 1);
                    
                    let dateText;
                    if (date.toDateString() === today.toDateString()) {
                        dateText = 'Today';
                    } else if (date.toDateString() === yesterday.toDateString()) {
                        dateText = 'Yesterday';
                    } else {
                        dateText = date.toLocaleDateString();
                    }
                    
                    sessionTime.textContent = dateText;
                    
                    // Add message count badge if available
                    if (session.messages && session.messages.length > 0) {
                        const badgeSpan = document.createElement('span');
                        badgeSpan.className = 'message-count';
                        badgeSpan.textContent = session.messages.length;
                        sessionTime.appendChild(document.createTextNode(' • '));
                        sessionTime.appendChild(badgeSpan);
                        sessionTime.appendChild(document.createTextNode(' messages'));
                    }
                    
                    sessionInfo.appendChild(sessionName);
                    sessionInfo.appendChild(sessionTime);
                    
                    sessionDiv.appendChild(iconContainer);
                    sessionDiv.appendChild(sessionInfo);
                    
                    // Add click event to load session
                    sessionDiv.addEventListener('click', () => {
                        loadChatSession(session.sessionId);
                    });
                    
                    chatSessionsList.appendChild(sessionDiv);
                });
            } else {
                // Create a placeholder message if no sessions
                const noSessionsDiv = document.createElement('div');
                noSessionsDiv.className = 'no-sessions';
                noSessionsDiv.innerHTML = `
                    <i class="fas fa-lightbulb" style="font-size: 24px; color: #faad14; margin-bottom: 10px;"></i>
                    <p>No previous conversations yet.</p>
                    <p>Start a new chat by clicking the 'New Chat' button above!</p>
                `;
                chatSessionsList.appendChild(noSessionsDiv);
            }
        } catch (error) {
            console.error('Error loading chat sessions:', error);
            // Create error message
            const errorDiv = document.createElement('div');
            errorDiv.className = 'session-error';
            errorDiv.textContent = 'Failed to load sessions. Try refreshing.';
            chatSessionsList.appendChild(errorDiv);
        }
    }
    
    // Load a specific chat session
    async function loadChatSession(sessionId) {
        try {
            // Set this session as active
            const activateResponse = await fetchWithAuth('/api/chat-sessions/set-active', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    userId, 
                    sessionId 
                }),
            });
            
            if (!activateResponse.ok) {
                throw new Error('Failed to set active session');
            }
            
            // Update active session globally
            window.activeSession = { sessionId: sessionId };
            currentSessionId = sessionId;
            
            // Get session messages
            const messagesResponse = await fetchWithAuth(`/api/chat-sessions/${userId}/${sessionId}`);
            
            if (!messagesResponse.ok) {
                throw new Error('Failed to load chat session messages');
            }
            
            const data = await messagesResponse.json();
            
            // Update UI - mark active in sidebar
            const sessions = chatSessionsList.querySelectorAll('.chat-session');
            sessions.forEach(s => {
                s.classList.remove('active');
                if (s.dataset.sessionId === sessionId) {
                    s.classList.add('active');
                }
            });
            
            // Update chat name
            document.getElementById('current-chat-name').textContent = data.sessionName;
            
            // Clear existing messages
            while (chatMessages.firstChild) {
                chatMessages.removeChild(chatMessages.firstChild);
            }
            
            // Add messages to the chat
            if (data.messages && data.messages.length > 0) {
                data.messages.forEach(msg => {
                    addMessage(msg.message, msg.sender === 'user', msg.promptSource);
                });
            } else {
                // Add welcome message if no messages
                const welcomeDiv = document.createElement('div');
                welcomeDiv.className = 'welcome-message';
                
                const welcomeTitle = document.createElement('h1');
                welcomeTitle.textContent = 'Welcome to Chat Bot';
                
                const welcomeText = document.createElement('p');
                welcomeText.textContent = 'Ask me anything about NVIDIA\'s technologies';
                
                welcomeDiv.appendChild(welcomeTitle);
                welcomeDiv.appendChild(welcomeText);
                
                chatMessages.appendChild(welcomeDiv);
            }
        } catch (error) {
            console.error('Error loading chat session:', error);
            addMessage('Sorry, there was an error loading the chat session. Please try again.', false);
        }
    }
    
    // Initial loading of sessions
    loadChatSessions();
    
    // Check URL for shared chat history
    const urlParams = new URLSearchParams(window.location.search);
    const sharedChatId = urlParams.get('shared');
    const sharedTokenId = urlParams.get('share');
    
    if (sharedChatId) {
        loadSharedChatHistory(sharedChatId);
    } else if (sharedTokenId) {
        loadSharedChatByToken(sharedTokenId);
    }
    
    // Function to add a message to the chat
    function addMessage(message, isUser = false, promptSource = '') {
        if (!message) {
            console.error("Attempted to add empty message");
            return document.createElement('div'); // Return dummy element to avoid errors
        }
        
        // Check if the message is already in the chat (to avoid duplicates)
        const existingMessages = document.querySelectorAll('.message-content');
        for (let i = 0; i < existingMessages.length; i++) {
            if (existingMessages[i].textContent.trim() === message.trim()) {
                console.log("Duplicate message detected, skipping:", message.substring(0, 50) + "...");
                return existingMessages[i].parentElement;
            }
        }
        
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message');
        
        // Add the correct classes based on message type
        if (isUser) {
            messageDiv.classList.add('user');
            messageDiv.classList.add('user-message');  // Add both classes for compatibility
        } else {
            messageDiv.classList.add('bot');
            messageDiv.classList.add('bot-message');  // Add both classes for compatibility
        }
        
        const messageContent = document.createElement('div');
        messageContent.classList.add('message-content');
        
        // Handle newlines and links in the message
        const formattedMessage = message
            .split('\n')
            .map(line => {
                // Check if the line appears to be a URL or markdown link
                if (line.trim().startsWith('- http') || line.trim().startsWith('http')) {
                    const url = line.trim().startsWith('- ') ? line.trim().substring(2) : line.trim();
                    return `<a href="${url}" target="_blank">${url}</a>`;
                } else if (line.match(/\[.*?\]\(.*?\)/)) {
                    // Handle markdown links [title](url)
                    return line.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');
                }
                return line;
            })
            .join('<br>');
        
        messageContent.innerHTML = formattedMessage;
        
        // Add prompt source if available - MOVED INSIDE messageContent
        if (!isUser && promptSource && promptSource !== '') {
            const sourceElement = document.createElement('div');
            sourceElement.classList.add('prompt-source');
            sourceElement.textContent = `Source: ${promptSource}`;
            messageContent.insertBefore(sourceElement, messageContent.firstChild);
        }
        
        messageDiv.appendChild(messageContent);
        chatMessages.appendChild(messageDiv);
        
        // Scroll to the bottom of the chat
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        return messageDiv;
    }
    
    // Function to load shared chat history by user ID
    async function loadSharedChatHistory(sharedUserId) {
        try {
            const response = await fetch(`/api/chat-history/${sharedUserId}`);
            
            if (!response.ok) {
                throw new Error('Failed to load shared chat history');
            }
            
            const data = await response.json();
            
            // Clear existing messages
            while (chatMessages.firstChild) {
                chatMessages.removeChild(chatMessages.firstChild);
            }
            
            // Add loaded messages to the chat
            data.messages.forEach(msg => {
                addMessage(msg.message, msg.sender === 'user', msg.promptSource);
            });
            
            // Add info message about shared chat
            const infoDiv = document.createElement('div');
            infoDiv.classList.add('message', 'bot', 'info');
            
            const infoContent = document.createElement('div');
            infoContent.classList.add('message-content');
            
            const infoParagraph = document.createElement('p');
            infoParagraph.textContent = `You are viewing a shared chat history. Any new messages will be saved to your own chat.`;
            
            infoContent.appendChild(infoParagraph);
            infoDiv.appendChild(infoContent);
            chatMessages.appendChild(infoDiv);
            
        } catch (error) {
            console.error('Error:', error);
            addMessage('Sorry, there was an error loading the shared chat history.', false);
        }
    }
    
    // Function to load shared chat by token
    async function loadSharedChatByToken(token) {
        try {
            const response = await fetch(`/api/chat-history/token/${token}`);
            
            if (!response.ok) {
                throw new Error('Failed to load shared chat history');
            }
            
            const data = await response.json();
            
            // Clear existing messages
            while (chatMessages.firstChild) {
                chatMessages.removeChild(chatMessages.firstChild);
            }
            
            // Add loaded messages to the chat
            data.messages.forEach(msg => {
                addMessage(msg.message, msg.sender === 'user', msg.promptSource);
            });
            
            // Add info message about shared chat
            const infoDiv = document.createElement('div');
            infoDiv.classList.add('message', 'bot', 'info');
            
            const infoContent = document.createElement('div');
            infoContent.classList.add('message-content');
            
            const infoParagraph = document.createElement('p');
            infoParagraph.textContent = `You are viewing a shared chat history. Any new messages will be saved to your own chat.`;
            
            infoContent.appendChild(infoParagraph);
            infoDiv.appendChild(infoContent);
            chatMessages.appendChild(infoDiv);
            
        } catch (error) {
            console.error('Error:', error);
            addMessage('Sorry, there was an error loading the shared chat history. It may have expired.', false);
        }
    }
    
    // Function to generate and show share link
    async function generateShareLink() {
        try {
            // Generate a secure share link with expiration
            const response = await fetch(`/api/chat-history/${userId}/share`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ expiration: 24 }), // 24 hours expiration
            });
            
            if (!response.ok) {
                throw new Error('Failed to generate share link');
            }
            
            const data = await response.json();
            const shareLink = data.shareUrl;
            
            // Create modal for sharing
            const modal = document.createElement('div');
            modal.className = 'share-modal';
            
            const modalContent = document.createElement('div');
            modalContent.className = 'share-modal-content';
            
            const closeBtn = document.createElement('span');
            closeBtn.className = 'close-button';
            closeBtn.innerHTML = '&times;';
            closeBtn.onclick = () => {
                document.body.removeChild(modal);
            };
            
            const title = document.createElement('h3');
            title.textContent = 'Share this conversation';
            
            const shareInput = document.createElement('input');
            shareInput.type = 'text';
            shareInput.value = shareLink;
            shareInput.readOnly = true;
            
            const copyBtn = document.createElement('button');
            copyBtn.textContent = 'Copy Link';
            copyBtn.onclick = () => {
                shareInput.select();
                document.execCommand('copy');
                copyBtn.textContent = 'Copied!';
                setTimeout(() => {
                    copyBtn.textContent = 'Copy Link';
                }, 2000);
            };
            
            const expirationNote = document.createElement('p');
            expirationNote.className = 'expiration-note';
            const expirationDate = new Date(data.shareExpiration);
            expirationNote.textContent = `This link will expire on ${expirationDate.toLocaleString()}`;
            
            modalContent.appendChild(closeBtn);
            modalContent.appendChild(title);
            modalContent.appendChild(shareInput);
            modalContent.appendChild(copyBtn);
            modalContent.appendChild(expirationNote);
            modal.appendChild(modalContent);
            
            document.body.appendChild(modal);
            
            // Select the input for easy copying
            shareInput.select();
            
        } catch (error) {
            console.error('Error:', error);
            addMessage('Sorry, there was an error generating the share link.', false);
        }
    }
    
    // Function to send a message to the bot
    async function sendMessage(message) {
        if (!message.trim()) return;
        
        // Prevent concurrent API calls
        if (window.isProcessingSendRequest) {
            console.log("Send request already in progress, please wait...");
            return;
        }
        
        window.isProcessingSendRequest = true;
        
        // Clear the input
        document.getElementById('message-input').value = '';
        
        // Add user message to UI
        addMessage(message, true);
        
        // Show typing indicator
        document.getElementById('typing-indicator').style.display = 'block';
        
        try {
            // Get active session ID if available, fallback to local variable
            const activeSessionId = window.activeSession?.sessionId || currentSessionId;
            
            console.log("Sending message with:", {
                userId: window.currentUserId || userId,
                message,
                sessionId: activeSessionId
            });
            
            // Send message to server
            const response = await fetchWithAuth('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId: window.currentUserId || userId,
                    message,
                    sessionId: activeSessionId
                })
            });
            
            // Hide typing indicator
            document.getElementById('typing-indicator').style.display = 'none';
            
            if (!response.ok) {
                console.error(`Server returned error: ${response.status} ${response.statusText}`);
                addMessage("Sorry, there was an error processing your request. Please try again later.", false);
                window.isProcessingSendRequest = false;
                return;
            }
            
            let data;
            try {
                data = await response.json();
                console.log("Got response:", data);
            } catch (jsonError) {
                console.error("Failed to parse response JSON:", jsonError);
                addMessage("Sorry, there was an error processing the server response. Please try again later.", false);
                window.isProcessingSendRequest = false;
                return;
            }
            
            // Validate the response data
            if (!data || typeof data.reply !== 'string') {
                console.error("Invalid response data:", data);
                addMessage("Sorry, the server returned an invalid response. Please try again later.", false);
                window.isProcessingSendRequest = false;
                return;
            }
            
            // Add bot response to UI with prompt source
            const botMessageElement = addMessage(data.reply, false, data.promptSource || 'DEFAULT');
            
            // Update answer card
            updateAnswerCard(data.reply, null, data.promptSource || 'DEFAULT');
            
            // Update session if one was returned
            if (data.sessionId) {
                // Update local and global session IDs
                currentSessionId = data.sessionId;
                window.activeSession = { sessionId: data.sessionId };
                
                // Also reload the session list to reflect any changes
                try {
                    await loadChatSessions();
                } catch (sessionError) {
                    console.error("Failed to reload chat sessions:", sessionError);
                    // Don't show error to user for this non-critical operation
                }
            }
            
            // Process sources in the reply if any
            processSourcesInMessage(data.reply, botMessageElement);
            
            window.isProcessingSendRequest = false;
        } catch (error) {
            console.error('Error sending message:', error);
            
            // Hide typing indicator
            document.getElementById('typing-indicator').style.display = 'none';
            
            // Add error message
            addMessage("Sorry, there was an error processing your request. Please try again later.", false);
            
            window.isProcessingSendRequest = false;
        }
    }
    
    // Event listener for send button
    sendButton.addEventListener('click', () => {
        const message = userInput.value.trim();
        if (message) {
            // Send the message to the bot
            sendMessage(message);
        }
    });
    
    // Event listener for share button
    shareButton.addEventListener('click', () => {
        // Check if there are messages to share
        if (chatMessages.querySelectorAll('.message').length > 0) {
            generateShareLink();
        } else {
            addMessage('There are no messages to share yet. Start a conversation first!', false);
        }
    });
    
    // Event listener for Enter key
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendButton.click();
        }
    });
    
    // Event listener for rename chat button
    renameChatButton.addEventListener('click', () => {
        // Populate input with current name
        newChatNameInput.value = document.getElementById('current-chat-name').textContent;
        // Show rename modal
        renameModal.style.display = 'block';
    });
    
    // Event listener for clear chat button
    clearChatButton.addEventListener('click', () => {
        // Set up confirm modal
        document.getElementById('confirm-title').textContent = 'Clear Chat';
        document.getElementById('confirm-message').textContent = 'Are you sure you want to clear all messages in this chat? This cannot be undone.';
        // Show confirm modal
        confirmModal.style.display = 'block';
        
        // Set up the confirm action
        confirmOkButton.onclick = async () => {
            if (currentSessionId) {
                try {
                    const response = await fetch(`/api/chat-sessions/${userId}/${currentSessionId}/clear`, {
                        method: 'PUT'
                    });
                    
                    if (!response.ok) {
                        throw new Error('Failed to clear chat session');
                    }
                    
                    // Clear messages in UI
                    while (chatMessages.firstChild) {
                        chatMessages.removeChild(chatMessages.firstChild);
                    }
                    
                    // Add welcome message back
                    const welcomeDiv = document.createElement('div');
                    welcomeDiv.className = 'welcome-message';
                    
                    const welcomeTitle = document.createElement('h1');
                    welcomeTitle.textContent = 'Welcome to Chat Bot';
                    
                    const welcomeText = document.createElement('p');
                    welcomeText.textContent = 'Ask me anything about NVIDIA\'s technologies';
                    
                    welcomeDiv.appendChild(welcomeTitle);
                    welcomeDiv.appendChild(welcomeText);
                    
                    chatMessages.appendChild(welcomeDiv);
                } catch (error) {
                    console.error('Error:', error);
                    addMessage('Sorry, there was an error clearing the chat. Please try again.', false);
                }
            } else {
                // Just clear UI if no session
                while (chatMessages.firstChild) {
                    chatMessages.removeChild(chatMessages.firstChild);
                }
                
                // Add welcome message back
                const welcomeDiv = document.createElement('div');
                welcomeDiv.className = 'welcome-message';
                
                const welcomeTitle = document.createElement('h1');
                welcomeTitle.textContent = 'Welcome to Chat Bot';
                
                const welcomeText = document.createElement('p');
                welcomeText.textContent = 'Ask me anything about NVIDIA\'s technologies';
                
                welcomeDiv.appendChild(welcomeTitle);
                welcomeDiv.appendChild(welcomeText);
                
                chatMessages.appendChild(welcomeDiv);
            }
            
            // Hide modal
            confirmModal.style.display = 'none';
        };
        
        // Cancel action
        confirmCancelButton.onclick = () => {
            confirmModal.style.display = 'none';
        };
    });
    
    // Event listener for save button in rename modal
    saveNameButton.addEventListener('click', async () => {
        const newName = newChatNameInput.value.trim();
        if (newName) {
            if (currentSessionId) {
                try {
                    const response = await fetch('/api/chat-sessions/rename', {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            userId,
                            sessionId: currentSessionId,
                            newName
                        }),
                    });
                    
                    if (!response.ok) {
                        throw new Error('Failed to rename chat session');
                    }
                    
                    // Update name in UI
                    document.getElementById('current-chat-name').textContent = newName;
                } catch (error) {
                    console.error('Error:', error);
                    addMessage('Sorry, there was an error renaming the chat. Please try again.', false);
                }
            } else {
                // Just update UI if no session
                document.getElementById('current-chat-name').textContent = newName;
            }
            
            // Hide modal
            renameModal.style.display = 'none';
        }
    });
    
    // Close modals when clicking X
    closeModalButtons.forEach(button => {
        button.addEventListener('click', () => {
            renameModal.style.display = 'none';
            confirmModal.style.display = 'none';
        });
    });
    
    // Close modals when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === renameModal) {
            renameModal.style.display = 'none';
        }
        if (e.target === confirmModal) {
            confirmModal.style.display = 'none';
        }
    });
    
    // Event listener for new chat button
    newChatButton.addEventListener('click', async () => {
        try {
            // Create a new chat session
            const response = await fetch('/api/chat-sessions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ userId }),
            });
            
            if (!response.ok) {
                throw new Error('Failed to create new chat session');
            }
            
            const data = await response.json();
            currentSessionId = data.sessionId;
            
            // Clear existing messages
            while (chatMessages.firstChild) {
                chatMessages.removeChild(chatMessages.firstChild);
            }
            
            // Add welcome message
            const welcomeDiv = document.createElement('div');
            welcomeDiv.className = 'welcome-message';
            
            const welcomeTitle = document.createElement('h1');
            welcomeTitle.textContent = 'Welcome to Chat Bot';
            
            const welcomeText = document.createElement('p');
            welcomeText.textContent = 'Ask me anything about NVIDIA\'s technologies';
            
            welcomeDiv.appendChild(welcomeTitle);
            welcomeDiv.appendChild(welcomeText);
            
            chatMessages.appendChild(welcomeDiv);
            
            // Update current chat name
            document.getElementById('current-chat-name').textContent = data.sessionName || 'New Chat';
            
            // Refresh the session list
            loadChatSessions();
            
        } catch (error) {
            console.error('Error:', error);
            addMessage('Sorry, there was an error creating a new chat session. Please try again.', false);
        }
    });
    
    // Function to update answer card (modify this to include prompt source)
    function updateAnswerCard(content, sources = null, promptSource = '') {
        // Disabled per user request
        return;
    }
    
    // Add CSS for modal
    const style = document.createElement('style');
    style.textContent = `
        .share-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        }
        
        .share-modal-content {
            background-color: white;
            padding: 20px;
            border-radius: 5px;
            width: 90%;
            max-width: 500px;
            position: relative;
        }
        
        .close-button {
            position: absolute;
            top: 10px;
            right: 10px;
            font-size: 24px;
            cursor: pointer;
        }
        
        .share-modal-content h3 {
            margin-top: 0;
            margin-bottom: 20px;
        }
        
        .share-modal-content input {
            width: 100%;
            padding: 10px;
            margin-bottom: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
        }
        
        .share-modal-content button {
            padding: 8px 16px;
            background-color: #4CAF50;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        
        .expiration-note {
            font-size: 12px;
            color: #666;
            margin-top: 10px;
        }
        
        .action-button {
            background-color: #f0f0f0;
            border: none;
            border-radius: 4px;
            padding: 8px 12px;
            margin-left: 8px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 5px;
        }
        
        .action-button:hover {
            background-color: #e0e0e0;
        }
        
        /* Enhanced styles for chat sessions */
        .chat-session {
            padding: 12px 15px;
            border-radius: 8px;
            margin: 8px 0;
            cursor: pointer;
            transition: all 0.2s ease;
            border-left: 3px solid transparent;
            background-color: #f8f8f8;
            display: flex;
            align-items: center;
            gap: 12px;
        }
        
        .chat-session:hover {
            background-color: #f0f0f0;
            transform: translateX(3px);
        }
        
        .chat-session.active {
            background-color: #e6f7ff;
            border-left: 3px solid #1890ff;
        }
        
        .session-icon {
            color: #8c8c8c;
            font-size: 18px;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }
        
        .chat-session.active .session-icon {
            color: #1890ff;
        }
        
        .session-info {
            flex-grow: 1;
            overflow: hidden;
        }
        
        .session-name {
            font-weight: 500;
            margin-bottom: 4px;
            color: #333;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        .chat-session.active .session-name {
            color: #1890ff;
            font-weight: 600;
        }
        
        .session-time {
            font-size: 12px;
            color: #888;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        
        .message-count {
            background-color: #1890ff;
            color: white;
            border-radius: 10px;
            padding: 1px 6px;
            font-size: 10px;
            font-weight: bold;
        }
        
        .no-sessions {
            text-align: center;
            color: #888;
            padding: 20px;
            font-style: italic;
            display: flex;
            flex-direction: column;
            align-items: center;
            background-color: #fafafa;
            border-radius: 8px;
            margin-top: 15px;
        }
        
        .no-sessions p {
            margin: 5px 0;
        }
        
        .user-profile {
            display: flex;
            align-items: center;
            padding: 15px;
            background-color: #fafafa;
            border-radius: 8px;
            margin-bottom: 20px;
        }
        
        .user-avatar {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background-color: #1890ff;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            margin-right: 12px;
        }
        
        .user-info {
            flex-grow: 1;
            overflow: hidden;
        }
        
        .username {
            font-weight: 600;
            color: #262626;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        .user-actions button {
            background: none;
            border: none;
            font-size: 16px;
            color: #8c8c8c;
            cursor: pointer;
            padding: 5px;
            border-radius: 4px;
            transition: all 0.2s ease;
        }
        
        .user-actions button:hover {
            color: #ff4d4f;
            background-color: #fff1f0;
        }
        
        .sessions-section-title {
            font-size: 14px;
            font-weight: 600;
            color: #595959;
            margin: 15px 0 10px 5px;
            padding-bottom: 8px;
            border-bottom: 1px solid #f0f0f0;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .session-error {
            text-align: center;
            color: #ff4d4f;
            padding: 15px;
            border: 1px solid #ffccc7;
            background-color: #fff2f0;
            border-radius: 4px;
            margin: 10px 0;
        }
        
        /* Enhanced new chat button */
        .new-chat-btn {
            background-color: #52c41a;
            color: white;
            border: none;
            padding: 10px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 600;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            box-shadow: 0 2px 0 rgba(0,0,0,0.1);
            transition: all 0.3s ease;
            width: 100%;
            margin-bottom: 15px;
        }
        
        .new-chat-btn:hover {
            background-color: #73d13d;
            transform: translateY(-2px);
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        
        .new-chat-btn:active {
            transform: translateY(1px);
            box-shadow: 0 1px 0 rgba(0,0,0,0.1);
        }
        
        .new-chat-btn i {
            font-size: 14px;
        }
        
        /* Improved sidebar header */
        .sidebar-header {
            padding: 15px;
            border-bottom: 1px solid #f0f0f0;
            margin-bottom: 10px;
        }
        
        /* Chat sessions container */
        .chat-sessions-container {
            overflow-y: auto;
            max-height: calc(100vh - 180px);
            padding: 0 15px;
        }
        
        .chat-sessions {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        
        /* Styling for prompt source */
        .prompt-source {
            font-size: 12px;
            color: #666;
            margin-bottom: 8px;
            padding: 4px 8px;
            background-color: rgba(0, 0, 0, 0.05);
            border-radius: 4px;
            display: inline-block;
            border-left: 2px solid #1890ff;
        }
        
        .prompt-source-info {
            font-size: 12px;
            color: #666;
            margin-bottom: 10px;
            padding: 5px 10px;
            background-color: #f1f1f1;
            border-radius: 4px;
            border-left: 3px solid #1890ff;
        }
        
        .message-sources {
            margin-top: 10px;
            border-top: 1px solid #e0e0e0;
            padding-top: 8px;
        }
        
        .message-sources h4 {
            font-size: 14px;
            margin: 0 0 5px 0;
            color: #555;
        }
        
        .message-sources ul {
            margin: 0;
            padding-left: 20px;
        }
        
        .message-sources li {
            font-size: 12px;
            margin-bottom: 3px;
        }
        
        .message-sources a {
            color: #1890ff;
            text-decoration: none;
        }
        
        .message-sources a:hover {
            text-decoration: underline;
        }
    `;
    document.head.appendChild(style);

    // Helper function to extract sources from content
    function extractSourcesFromContent(content) {
        try {
            if (!content || typeof content !== 'string') {
                console.warn("Invalid content provided to extractSourcesFromContent");
                return [];
            }
            
            const sources = [];
            const sourceRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
            let match;
            
            // Check if there's a "Sources:" section
            const sourcesIndex = content.indexOf('Sources:');
            if (sourcesIndex !== -1) {
                const sourcesSection = content.substring(sourcesIndex);
                
                // Extract all markdown links from the sources section
                while ((match = sourceRegex.exec(sourcesSection)) !== null) {
                    if (match[1] && match[2]) {
                        sources.push({
                            title: match[1],
                            url: match[2]
                        });
                    }
                }
            }
            
            return sources;
        } catch (error) {
            console.error("Error extracting sources from content:", error);
            return [];
        }
    }

    // Helper function to process sources in a message
    function processSourcesInMessage(message, messageElement) {
        try {
            if (!message || !messageElement) {
                return;
            }
            
            // Extract sources from the message
            const sources = extractSourcesFromContent(message);
            
            // If sources are found, create a sources section in the message
            if (sources && sources.length > 0) {
                const sourcesContainer = document.createElement('div');
                sourcesContainer.classList.add('message-sources');
                
                const sourcesTitle = document.createElement('h4');
                sourcesTitle.textContent = 'Sources:';
                sourcesContainer.appendChild(sourcesTitle);
                
                const sourcesList = document.createElement('ul');
                sources.forEach(source => {
                    const sourceItem = document.createElement('li');
                    const sourceLink = document.createElement('a');
                    sourceLink.href = source.url;
                    sourceLink.textContent = source.title;
                    sourceLink.target = '_blank';
                    sourceItem.appendChild(sourceLink);
                    sourcesList.appendChild(sourceItem);
                });
                
                sourcesContainer.appendChild(sourcesList);
                messageElement.appendChild(sourcesContainer);
            }
        } catch (error) {
            console.error("Error processing sources in message:", error);
            // Don't add an error message to the UI for this non-critical feature
        }
    }
}); 