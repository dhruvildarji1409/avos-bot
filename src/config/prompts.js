/**
 * AVOS Bot Prompt Configuration
 * 
 * This file contains all the prompts used by the AVOS bot.
 * Update this file to experiment with different prompts and improve the bot's responses.
 */

// Main system prompt for the chatbot
const MAIN_SYSTEM_PROMPT = `You are AVOS Bot, an AI assistant for NVIDIA's Autonomous Vehicle Operating System (AVOS).
Your goal is to provide accurate, helpful information about AVOS.
Use the provided context to answer the user's question accurately.
Always maintain a professional, helpful tone.
If the provided context doesn't contain relevant information, acknowledge this and provide general AVOS information if possible.
If asked about topics unrelated to AVOS, politely redirect the conversation to AVOS-related topics.
Include source attribution at the end of your response when using provided context.`;

// Prompt for extracting topics from a query
const TOPIC_EXTRACTION_PROMPT = `Extract the 3-5 most important technical topics or concepts from this query. Return only a comma-separated list of topics, nothing else.`;

// Prompt for the RAG (Retrieval Augmented Generation) context
const RAG_SYSTEM_PROMPT = `You are a helpful assistant that answers questions based on the provided context and conversation history. You MUST use only the provided context to answer. If you see code, format it as code blocks. If the question can't be answered from context, say you don't know.`;

// Confluence documentation helper prompt
const CONFLUENCE_HELPER_PROMPT = `You are an AI assistant helping answer questions from Confluence documentation. 
Provide **concise, clear answers**. If the answer contains **code**, format it in markdown. 
Include the **source link at the end** for reference.`;

// Default LLM client prompt
const DEFAULT_LLM_PROMPT = `You are a helpful AI assistant specialized in AVOS (Autonomous Vehicle Operating System) developed by NVIDIA. Provide accurate and helpful information about AVOS features, capabilities, and usage. If you don't know something, be honest about it. Please give small and precise answers. Don't give out of context answers. Please give answers in bullet points.`;

// Fallback responses for when the LLM fails
const FALLBACK_RESPONSES = {
  avos: 'AVOS is Autonomous Vehicle Operating System, a powerful platform developed by NVIDIA for autonomous vehicles.',
  help: 'I can provide information about AVOS, its features, and how to use it. What would you like to know?',
  feature: 'AVOS includes features such as sensor fusion, path planning, obstacle detection, and more.',
  default: 'I\'m still learning about AVOS. Can you ask something more specific about AVOS?'
};

// Simulated knowledge base for offline responses
const SIMULATED_KNOWLEDGE = {
  avos: 'AVOS (Autonomous Vehicle Operating System) is NVIDIA\'s comprehensive software stack designed for autonomous vehicles. It provides a flexible, scalable platform that integrates perception, planning, and control systems necessary for self-driving capabilities.',
  drive: 'NVIDIA DRIVE is a platform that uses AVOS and is designed for developing autonomous vehicles. It includes both hardware (like the DRIVE AGX Orin system-on-a-chip) and software components that work together to enable self-driving capabilities.',
  driveos: 'DriveOS is the operating system layer of NVIDIA\'s autonomous vehicle software stack. It provides a foundation for running autonomous driving applications, managing hardware resources, and ensuring real-time performance for critical driving functions.',
  ndas: 'NDAS (NVIDIA Data Annotation System) is a tool for labeling and annotating sensor data collected from vehicles. It helps create training datasets for machine learning models used in autonomous driving systems.',
  feature: 'AVOS includes many features such as:\n- Sensor fusion for combining data from cameras, radar, and lidar\n- Perception systems for object detection and classification\n- Planning and decision-making algorithms\n- Control systems for vehicle operation\n- Simulation capabilities for testing and validation\n- Over-the-air update functionality',
  dtsi: 'In the context of DriveOS, a DTSI (Device Tree Source Include) file is used to describe hardware components and their properties. The "startupcmd" DTSI file specifically contains commands that are executed during system startup to configure hardware components and initialize services.',
  steps: 'To integrate DriveOS changes into NDAS, you would typically follow these steps:\n1. Develop and test your changes in a DriveOS development environment\n2. Document the changes thoroughly\n3. Submit the changes through the code review process\n4. Work with the NDAS team to integrate and test the changes\n5. Monitor and validate the integration through regression testing',
};

module.exports = {
  MAIN_SYSTEM_PROMPT,
  TOPIC_EXTRACTION_PROMPT,
  RAG_SYSTEM_PROMPT,
  CONFLUENCE_HELPER_PROMPT,
  DEFAULT_LLM_PROMPT,
  FALLBACK_RESPONSES,
  SIMULATED_KNOWLEDGE
}; 