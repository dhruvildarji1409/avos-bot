#!/usr/bin/env python3

import os
import time
import json
import sys
import base64
from pathlib import Path

# Handle import errors gracefully
try:
    import requests
    from openai import AzureOpenAI
    DEPENDENCIES_INSTALLED = True
except ImportError:
    DEPENDENCIES_INSTALLED = False
    print("Warning: Required dependencies not installed. Using simulated responses only.", file=sys.stderr)
    print("To install dependencies: pip install requests openai", file=sys.stderr)

# Read prompts from the JS file
def get_default_system_prompt():
    """Read the default system prompt from prompts.js config file."""
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        prompts_path = os.path.join(script_dir, "config", "prompts.js")
        
        if os.path.exists(prompts_path):
            with open(prompts_path, 'r') as f:
                content = f.read()
                # Simple extraction of the DEFAULT_LLM_PROMPT from the JS file
                start = content.find('DEFAULT_LLM_PROMPT = `') + len('DEFAULT_LLM_PROMPT = `')
                end = content.find('`;', start)
                if start > 0 and end > 0:
                    return content[start:end]
        
        # Fallback prompt if file not found or parsing fails
        return "You are a helpful AI assistant specialized in AVOS (Autonomous Vehicle Operating System) developed by NVIDIA. Provide accurate and helpful information about AVOS features, capabilities, and usage. If you don't know something, be honest about it. Please give small and precise answers. Don't give out of context answers. Please give answers in bullet points."
    except Exception as e:
        print(f"Error loading system prompt: {e}", file=sys.stderr)
        return "You are a helpful AI assistant specialized in AVOS (Autonomous Vehicle Operating System) developed by NVIDIA. Provide accurate and helpful information about AVOS features, capabilities, and usage. If you don't know something, be honest about it."

def basic_auth(p_client_id, p_client_secret):
    """Create Basic Auth header value."""
    token = base64.b64encode(f"{p_client_id}:{p_client_secret}".encode('utf-8')).decode("ascii")
    return f'Basic {token}'

def get_oauth_token(p_token_url, p_client_id, p_client_secret, p_scope):
    """Get OAuth token from server or cache."""
    if not DEPENDENCIES_INSTALLED:
        return None
        
    file_name = "py_llm_oauth_token.json"
    try:
        base_path = Path(__file__).parent
        file_path = Path.joinpath(base_path, file_name)
    except Exception as e:
        print(f"Error occurred while setting file path: {e}", file=sys.stderr)
        return None

    try:
        # Check if the token is cached
        if os.path.exists(file_path):
            with open(file_path, "r") as f:
                token = json.load(f)
                
                # Check if the token is expired
                if "expires_in" in token and "created_at" in token:
                    expiry_time = token["created_at"] + token["expires_in"]
                    if time.time() < expiry_time:
                        return token["access_token"]
        
        # Get a new token from the OAuth server
        payload = "grant_type=client_credentials&scope=" + p_scope
        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": basic_auth(p_client_id, p_client_secret)
        }
        
        response = requests.request("POST", p_token_url, headers=headers, data=payload)
        token = response.json()
        
        # Add creation timestamp
        token["created_at"] = time.time()
        
        with open(file_path, "w") as f:
            json.dump(token, f)
            
        return token["access_token"]
    except Exception as e:
        print(f"Error occurred while getting OAuth token: {e}", file=sys.stderr)
        return None

def get_azure_client():
    """Get authenticated Azure OpenAI client."""
    if not DEPENDENCIES_INSTALLED:
        return None
        
    try:
        # Azure OpenAI credentials
        client_id = "nvssa-prd-_lwo4JYj0iZDQaQhmQE64W5gl25gqmvjnBjvY-6YSuU"
        client_secret = "ssap-ryqWx5WbHYNulr9TPcA"
        token_url = "https://5kbfxgaqc3xgz8nhid1x1r8cfestoypn-trofuum-oc.ssa.nvidia.com/token"
        scope = "azureopenai-readwrite"

        token = get_oauth_token(token_url, client_id, client_secret, scope)
        if not token:
            return None
            
        api_base = "https://prod.api.nvidia.com/llm/v1/azure/openai"
        api_version = "2023-12-01-preview"

        client = AzureOpenAI(api_key=token, api_version=api_version, base_url=api_base)
        return client
    except Exception as e:
        print(f"Error creating Azure OpenAI client: {e}", file=sys.stderr)
        return None

def get_simulated_response(prompt, context=""):
    """Provide simulated responses when API is unavailable."""
    # The simulated knowledge base now comes from config/prompts.js
    # This is a simplified version as fallback
    avos_knowledge = {
        'avos': 'AVOS (Autonomous Vehicle Operating System) is NVIDIA\'s comprehensive software stack designed for autonomous vehicles. It provides a flexible, scalable platform that integrates perception, planning, and control systems necessary for self-driving capabilities.',
        'drive': 'NVIDIA DRIVE is a platform that uses AVOS and is designed for developing autonomous vehicles. It includes both hardware (like the DRIVE AGX Orin system-on-a-chip) and software components that work together to enable self-driving capabilities.',
        'driveos': 'DriveOS is the operating system layer of NVIDIA\'s autonomous vehicle software stack. It provides a foundation for running autonomous driving applications, managing hardware resources, and ensuring real-time performance for critical driving functions.',
        'ndas': 'NDAS (NVIDIA Data Annotation System) is a tool for labeling and annotating sensor data collected from vehicles. It helps create training datasets for machine learning models used in autonomous driving systems.',
        'feature': 'AVOS includes many features such as:\n- Sensor fusion for combining data from cameras, radar, and lidar\n- Perception systems for object detection and classification\n- Planning and decision-making algorithms\n- Control systems for vehicle operation\n- Simulation capabilities for testing and validation\n- Over-the-air update functionality',
        'dtsi': 'In the context of DriveOS, a DTSI (Device Tree Source Include) file is used to describe hardware components and their properties. The "startupcmd" DTSI file specifically contains commands that are executed during system startup to configure hardware components and initialize services.',
        'steps': 'To integrate DriveOS changes into NDAS, you would typically follow these steps:\n1. Develop and test your changes in a DriveOS development environment\n2. Document the changes thoroughly\n3. Submit the changes through the code review process\n4. Work with the NDAS team to integrate and test the changes\n5. Monitor and validate the integration through regression testing',
    }
    
    # Convert prompt to lowercase for easier matching
    prompt_lower = prompt.lower()
    
    # Default response
    response = "I don't have specific information about that aspect of AVOS. Could you ask something more general about AVOS capabilities or features?"
    
    # Try to find relevant information in our knowledge base
    for keyword, info in avos_knowledge.items():
        if keyword.lower() in prompt_lower:
            response = info
            break
    
    # Use context if available and we don't have a good response yet
    if context and "I don't have specific information" in response:
        response = f"Based on the available information: {context}\n\nHowever, please note that this information may be limited. For more detailed information, please consult the official NVIDIA AVOS documentation."
    
    # Special case for questions about the relationship between DriveOS and NDAS
    if 'driveos' in prompt_lower and 'ndas' in prompt_lower:
        response = avos_knowledge['steps']
    
    # Special case for questions about DTSI files
    if 'dtsi' in prompt_lower and 'startupcmd' in prompt_lower:
        response = avos_knowledge['dtsi']
    
    return response

def get_llm_response(prompt, context="", system_prompt=""):
    """Get response from LLM, falling back to simulated responses if unavailable."""
    if DEPENDENCIES_INSTALLED:
        try:
            # Get the Azure OpenAI client
            client = get_azure_client()
            
            if client:
                # Prepare messages
                messages = []
                
                # Add system prompt if provided, otherwise use default
                if system_prompt:
                    messages.append({"role": "system", "content": system_prompt})
                else:
                    messages.append({
                        "role": "system", 
                        "content": get_default_system_prompt()
                    })
                
                # Add context if provided
                if context:
                    messages.append({"role": "user", "content": f"Context information: {context}"})
                
                # Add user prompt
                messages.append({"role": "user", "content": prompt})
                
                # Call the OpenAI Chat Completion
                completion = client.chat.completions.create(
                    model="gpt-4o",
                    messages=messages,
                    max_tokens=1000
                )
                
                # Return the OpenAI response
                return completion.choices[0].message.content
        except Exception as e:
            print(f"Error calling LLM API: {e}", file=sys.stderr)
            print("Falling back to simulated response.", file=sys.stderr)
    
    # If dependencies aren't installed or API call failed, use simulated response
    return get_simulated_response(prompt, context)

if __name__ == "__main__":
    # This script can be called from command line with arguments:
    # arg1: user prompt
    # arg2 (optional): context
    # arg3 (optional): system prompt
    
    if len(sys.argv) < 2:
        print("Usage: python llm_client.py \"prompt\" [\"context\"] [\"system_prompt\"]")
        sys.exit(1)
    
    prompt = sys.argv[1]
    context = sys.argv[2] if len(sys.argv) > 2 else ""
    system_prompt = sys.argv[3] if len(sys.argv) > 3 else ""
    
    response = get_llm_response(prompt, context, system_prompt)
    print(response) 