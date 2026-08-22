"""
Voice AI Assistant - Diagnostics Tools
Agentic tool calling for network diagnostics
"""

import time
import random
from langchain_core.tools import tool

@tool
def ping_ip(ip_address: str) -> str:
    """
    Simulates a network ping to an IP address. Use this when the user asks to check connectivity or ping a server.
    """
    print(f"\n   🛠️ [TOOL] Running ping against {ip_address}...")
    time.sleep(1) # Simulate network delay
    
    if "192.168" in ip_address or "10." in ip_address or "8.8.8.8" == ip_address:
        latency = random.randint(10, 40)
        return f"Ping successful. 0% packet loss. Average latency: {latency}ms."
    else:
        return f"Ping failed. Request timed out. 100% packet loss."

@tool
def get_router_status(router_ip: str) -> str:
    """
    Simulates retrieving the status of a router. Use this when the user asks to check the router's health, CPU, or uptime.
    """
    print(f"\n   🛠️ [TOOL] Fetching status for router at {router_ip}...")
    time.sleep(1.5)
    
    uptime = "45 days, 12 hours"
    cpu = random.randint(10, 85)
    mem = random.randint(40, 70)
    
    return f"Router Status for {router_ip}:\n- Uptime: {uptime}\n- CPU Load: {cpu}%\n- Memory Usage: {mem}%\n- Interfaces: 4 up, 1 down."

def get_all_tools():
    """Returns a list of all available tools for the LLM"""
    return [ping_ip, get_router_status]
