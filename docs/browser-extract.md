# Browser Extract Method for Confluence Pages

This guide explains how to use the Browser Extract method to add Confluence pages to the AVOS Bot knowledge base when the API method fails (common with personal spaces like `~username`).

## When to Use This Method

Use the Browser Extract method when:

1. You see the error "Confluence page not found" when trying to add a page via the API
2. The Confluence page is in a personal space (URL contains `~username`)
3. You can access the page in your browser but the API cannot

## Step-by-Step Instructions

### 1. Open the Confluence Page in Your Browser

- Navigate to the Confluence page you want to add
- Make sure you can see the full page content
- Log in if required to view the page

### 2. Open Developer Tools Console

- **Chrome/Edge**: Press `F12` or right-click on the page and select "Inspect", then click on the "Console" tab
- **Firefox**: Press `F12` or right-click and select "Inspect Element", then click on the "Console" tab
- **Safari**: Enable developer tools in Settings → Advanced, then right-click and select "Inspect Element"

### 3. Run the Extraction Script

- Copy the following script:

```javascript
(() => {
  // Get page content
  const pageTitle = document.title.split(' - ')[0].trim();
  const pageContent = document.querySelector('#main-content').innerHTML;
  const pageUrl = window.location.href;
  
  // Get page ID
  const pageIdMatch = pageUrl.match(/pageId=(\d+)/);
  const pageId = pageIdMatch ? pageIdMatch[1] : null;
  
  // Create result object
  const result = {
    title: pageTitle,
    content: pageContent,
    url: pageUrl,
    id: pageId
  };
  
  // Show the data
  console.log(JSON.stringify(result));
  
  // Copy to clipboard
  const textArea = document.createElement('textarea');
  textArea.value = JSON.stringify(result);
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand('copy');
  document.body.removeChild(textArea);
  
  console.log('✅ Page data copied to clipboard! Paste it in the admin panel.');
  return '✅ Page data copied to clipboard! Paste it in the admin panel.';
})()
```

- Paste it into the console and press Enter
- You should see a message saying "Page data copied to clipboard!"

### 4. Add to Knowledge Base

- Go to the AVOS Bot Admin Panel (http://localhost:3000/admin.html)
- Switch to the "Browser Extract" tab
- Paste the JSON data in the "Extracted JSON Data" field
- Enter your name in the "Added By" field
- Click "Process and Add Content"

### 5. Verify Content

- After the content is added, try asking a question about it in the chat interface
- The bot should be able to find and use the extracted content in its responses

## Troubleshooting

### Script doesn't copy anything to clipboard

Some browsers restrict clipboard access. In this case:

1. Look at the output in the console
2. Find the line that starts with a big JSON object (begins with `{"title":...`)
3. Right-click on this line and select "Copy object"
4. Paste this into the admin panel

### Content doesn't format correctly

If the content doesn't look right:

1. Try the "Manual Entry" tab instead
2. Copy just the text content from the page (not the HTML)
3. Add the title and URL manually

### Missing page ID

If the page ID cannot be extracted:

1. Look at the URL in your browser
2. Find the pageId parameter (e.g., `pageId=123456`)
3. Add this manually to the URL field in the "Manual Entry" tab

## Additional Notes

- This method only extracts the current page (not child pages)
- Some formatting may be lost in the extraction process
- Images and attachments are not included
- For best results, try using the direct page ID URL format: `https://confluence.nvidia.com/pages/viewpage.action?pageId=XXXXXXX` 