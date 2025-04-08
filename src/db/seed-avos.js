const mongoose = require('mongoose');
const ConfluenceData = require('../models/ConfluenceData');
require('dotenv').config();

// Sample AVOS data
const avosData = [
  {
    title: 'AVOS CI - End-to-End Jenkins Pipeline',
    content: `<h1>AVOS CI - End-to-End Jenkins Pipeline</h1>
    <p>This page describes the Continuous Integration (CI) pipeline for AVOS (Autonomous Vehicle Operating System).</p>
    <h2>Overview</h2>
    <p>The AVOS CI pipeline uses Jenkins to automate building, testing, and validating changes to the AVOS codebase. 
    The pipeline ensures high quality code through rigorous testing before merging into the main branch.</p>
    <h3>Pipeline Stages</h3>
    <ul>
      <li>Code Checkout - Clone the repository and specific branch</li>
      <li>Build - Compile source code and dependencies</li>
      <li>Unit Tests - Run automated unit tests</li>
      <li>Integration Tests - Verify component interactions</li>
      <li>System Tests - Test the complete system</li>
      <li>Code Quality - Run static analysis and linting</li>
      <li>Deploy - Deploy to test environments</li>
    </ul>`,
    url: 'https://confluence.nvidia.com/pages/viewpage.action?spaceKey=DSW&title=AVOS+CI+-+End-to-End+Jenkins+Pipeline',
    addedBy: 'System',
    tags: ['AVOS', 'CI', 'Jenkins']
  },
  {
    title: 'AVOS Architecture Overview',
    content: `<h1>AVOS Architecture Overview</h1>
    <p>AVOS (Autonomous Vehicle Operating System) is NVIDIA's comprehensive platform for autonomous vehicles.</p>
    <h2>Key Components</h2>
    <ul>
      <li>Perception - Sensor fusion and object detection</li>
      <li>Localization - High-precision mapping and positioning</li>
      <li>Planning - Path planning and decision making</li>
      <li>Control - Vehicle control systems</li>
      <li>Middleware - Communication framework</li>
    </ul>
    <h2>System Requirements</h2>
    <p>AVOS is designed to run on NVIDIA DRIVE hardware platforms, leveraging GPU acceleration for AI workloads.</p>`,
    url: 'https://confluence.nvidia.com/pages/viewpage.action?spaceKey=DSW&title=AVOS+Architecture+Overview',
    addedBy: 'System',
    tags: ['AVOS', 'Architecture']
  },
  {
    title: 'Integrating DriveOS Changes into NDAS',
    content: `<h1>Integrating DriveOS Changes into NDAS</h1>
    <p>This document outlines the process for integrating changes from DriveOS into NDAS (NVIDIA Drive Autonomous Stack).</p>
    <h2>Integration Steps</h2>
    <ol>
      <li>Develop and test your changes in a DriveOS development environment</li>
      <li>Document the changes thoroughly with comprehensive tests</li>
      <li>Submit the changes through the code review process</li>
      <li>Work with the NDAS team to integrate and test the changes</li>
      <li>Monitor and validate the integration through regression testing</li>
    </ol>
    <h2>Common Issues</h2>
    <p>Pay special attention to API compatibility and performance impacts when integrating DriveOS changes.</p>`,
    url: 'https://confluence.nvidia.com/pages/viewpage.action?spaceKey=DSW&title=Integrating+DriveOS+Changes+into+NDAS',
    addedBy: 'System',
    tags: ['AVOS', 'DriveOS', 'NDAS', 'Integration']
  }
];

// Main function to add sample data
async function addSampleData() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');
    
    // Delete existing data
    await ConfluenceData.deleteMany({});
    console.log('Cleared existing Confluence data');
    
    // Insert sample data
    for (const data of avosData) {
      const confluenceData = new ConfluenceData(data);
      await confluenceData.save();
      console.log(`Added: ${data.title}`);
    }
    
    console.log('Sample data has been added to the database');
    
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the script
addSampleData(); 