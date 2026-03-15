
import os
import re

filepath = r'd:\antigravity\NavisCore\frontend\src\App.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Extract SettingsModal function
match = re.search(r"function SettingsModal\(.*?\)\s*\{", content)
if not match:
    print("SettingsModal not found")
    exit()

start_pos = match.start()
stack = []
component_end = -1

for i in range(start_pos, len(content)):
    char = content[i]
    if char == '{':
        stack.append('{')
    elif char == '}':
        if stack:
            stack.pop()
            if not stack:
                component_end = i + 1
                break

if component_end == -1:
    print("Could not find end of SettingsModal")
    exit()

settings_modal_content = content[start_pos:component_end]

# Counter for <div and </div
open_divs = len(re.findall(r'<div', settings_modal_content))
close_divs = len(re.findall(r'</div', settings_modal_content))

print(f"Open <div: {open_divs}")
print(f"Close </div: {close_divs}")
print(f"Balance: {open_divs - close_divs}")

# Find problematic section by spliting by tab
tabs = ["general", "mqtt", "trail", "map", "coverage", "sdr", "hybrid"]
for tab in tabs:
    tab_match = re.search(f"activeTab === '{tab}' && \(", settings_modal_content)
    if tab_match:
        # Find the block (...)
        inner_start = tab_match.end()
        inner_stack = ["("]
        inner_end = -1
        for j in range(inner_start, len(settings_modal_content)):
            c = settings_modal_content[j]
            if c == '(': inner_stack.append('(')
            elif c == ')':
                inner_stack.pop()
                if not inner_stack:
                    inner_end = j + 1
                    break
        if inner_end != -1:
            tab_content = settings_modal_content[inner_start:inner_end]
            o = len(re.findall(r'<div', tab_content))
            c = len(re.findall(r'</div', tab_content))
            print(f"Tab '{tab}': Open={o}, Close={c}, Bal={o-c}")
