document.addEventListener('DOMContentLoaded', () => {
    const chatMessages = document.getElementById('chat-messages');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const shareButton = document.createElement('button');
    
    // Add share button to the UI
    shareButton.id = 'share-button';
    shareButton.className = 'action-button';
    shareButton.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg> Share';
    document.querySelector('.chat-input').appendChild(shareButton);
    
    // Generate a random user ID for this session
    const userId = 'user_' + Math.random().toString(36).substring(2, 12);
    
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
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ userId, message }),
            });
            
            if (!response.ok) {
                throw new Error('Failed to send message');
            }
            
            const data = await response.json();
            
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
    `;
    document.head.appendChild(style);
}); 