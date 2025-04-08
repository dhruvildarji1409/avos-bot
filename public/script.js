document.addEventListener('DOMContentLoaded', () => {
    // Check if user is logged in
    const token = localStorage.getItem('auth_token');
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    
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
    
    // Get userId from logged in user
    const userId = user.id;
    
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
            
            // Get session messages
            const messagesResponse = await fetchWithAuth(`/api/chat-sessions/${userId}/${sessionId}`);
            
            if (!messagesResponse.ok) {
                throw new Error('Failed to load chat session messages');
            }
            
            const data = await messagesResponse.json();
            
            // Update current session
            currentSessionId = sessionId;
            
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
                    addMessage(msg.message, msg.sender === 'user');
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
    function addMessage(message, isUser = false) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message');
        messageDiv.classList.add(isUser ? 'user' : 'bot');
        
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
        
        messageDiv.appendChild(messageContent);
        chatMessages.appendChild(messageDiv);
        
        // Scroll to the bottom of the chat
        chatMessages.scrollTop = chatMessages.scrollHeight;
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
                addMessage(msg.message, msg.sender === 'user');
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
                addMessage(msg.message, msg.sender === 'user');
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
        try {
            const response = await fetchWithAuth('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    userId, 
                    message,
                    sessionId: currentSessionId 
                }),
            });
            
            if (!response.ok) {
                throw new Error('Failed to send message');
            }
            
            const data = await response.json();
            
            // Update currentSessionId if returned from API
            if (data.sessionId) {
                currentSessionId = data.sessionId;
            }
            
            // Add bot's response to the chat
            addMessage(data.reply, false);
            
        } catch (error) {
            console.error('Error:', error);
            addMessage('Sorry, there was an error processing your request. Please try again.', false);
        }
    }
    
    // Event listener for send button
    sendButton.addEventListener('click', () => {
        const message = userInput.value.trim();
        if (message) {
            // Add user's message to the chat
            addMessage(message, true);
            
            // Send the message to the bot
            sendMessage(message);
            
            // Clear the input field
            userInput.value = '';
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
    `;
    document.head.appendChild(style);
}); 