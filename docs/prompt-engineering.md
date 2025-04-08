# Prompt Engineering Guide for AVOS Bot

This document provides guidance on how to modify and improve the prompts used by AVOS Bot to enhance its responses.

## Overview

All prompts used by the AVOS Bot are centralized in one file: `src/config/prompts.js`. This makes it easy to experiment with different prompts without having to modify multiple files in the codebase.

## Prompt File Location

```
src/config/prompts.js
```

## Available Prompts

The prompt file contains the following prompts that you can modify:

1. **MAIN_SYSTEM_PROMPT**: The primary system prompt used by the chatbot when answering user queries. This defines the bot's personality, tone, and behavior.

2. **TOPIC_EXTRACTION_PROMPT**: Used to extract key topics from a user query for better context retrieval.

3. **RAG_SYSTEM_PROMPT**: Used for Retrieval Augmented Generation when working with context information.

4. **CONFLUENCE_HELPER_PROMPT**: Used when processing Confluence documentation.

5. **DEFAULT_LLM_PROMPT**: The default system prompt used by the LLM client if no specific prompt is provided.

6. **FALLBACK_RESPONSES**: Predefined answers used when the LLM service fails.

7. **SIMULATED_KNOWLEDGE**: A knowledge base for offline responses when the LLM service is unavailable.

## Prompt Engineering Tips

When modifying prompts, keep these tips in mind:

### For MAIN_SYSTEM_PROMPT

1. **Be specific about the bot's role**: Clearly define what AVOS is and what the bot can help with.
2. **Set clear boundaries**: Specify how to handle questions outside the bot's knowledge domain.
3. **Define the tone**: Specify how formal or conversational the bot should be.
4. **Give formatting instructions**: Specify how to format code, lists, or technical explanations.
5. **Context usage**: Explain how the bot should use provided context information.

### For FALLBACK_RESPONSES

These responses should be concise and accurate, as they're used when the LLM fails. Make sure to cover the most common AVOS-related topics.

### For SIMULATED_KNOWLEDGE

This knowledge base should contain accurate information about key AVOS concepts, as it's used when offline or when the LLM service is unavailable.

## Example Modifications

### Improving Conciseness

If you want more concise responses, modify the MAIN_SYSTEM_PROMPT:

```javascript
const MAIN_SYSTEM_PROMPT = `You are AVOS Bot, an AI assistant for NVIDIA's Autonomous Vehicle Operating System (AVOS).
Your goal is to provide accurate, concise information about AVOS.
Use the provided context to answer the user's question in 2-3 sentences maximum.
Always maintain a professional tone.
If the provided context doesn't contain relevant information, acknowledge this briefly.`;
```

### Adding More Technical Detail

If you want more technical responses:

```javascript
const MAIN_SYSTEM_PROMPT = `You are AVOS Bot, an AI assistant for NVIDIA's Autonomous Vehicle Operating System (AVOS).
Your goal is to provide detailed technical information about AVOS.
Include specific technical details, component names, and architecture information when available.
Format code examples and commands with proper syntax highlighting.
Always cite sources when using provided context.`;
```

## Testing Prompt Changes

After modifying prompts in the prompts.js file:

1. Save the file
2. Restart the AVOS Bot server
3. Test the bot with various questions to see the effect of your changes
4. Iterate and refine the prompts based on the quality of responses

## Best Practices

1. **Keep backups**: Before making significant changes, save a copy of the original prompts.
2. **Make incremental changes**: Change one aspect of a prompt at a time to see its specific effect.
3. **Use consistent language**: Maintain a consistent tone and style across all prompts.
4. **Test edge cases**: Test how the bot responds to unusual or out-of-scope questions.
5. **Include constraints**: When needed, add constraints to prevent overly verbose or off-topic responses.

By carefully refining these prompts, you can significantly improve the quality, accuracy, and usefulness of the AVOS Bot's responses. 