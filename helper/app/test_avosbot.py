import requests
import json

url = "http://localhost:5000/chat"
payload = {
    "user_id": "test-user-123",
    "query": "What is container generation for 609 QNX safety?"
}
headers = {"Content-Type": "application/json"}

# Use stream=True to handle streaming response
with requests.post(url, json=payload, headers=headers, stream=True) as response:
    for line in response.iter_lines():
        if line:
            try:
                data = json.loads(line)
                status = data.get("status")
                
                if status == "info":
                    print(f"INFO: {data.get('message')}")
                elif status == "stream":
                    print(data.get("chunk"), end=" ", flush=True)
                elif status == "code":
                    print(f"\n{data.get('chunk')}\n")
                elif status == "success":
                    print("\n\nFINAL ANSWER:", data.get("answer"))
            except json.JSONDecodeError:
                print(f"Error parsing: {line}")