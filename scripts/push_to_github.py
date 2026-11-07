import subprocess
import os

os.chdir('/home/eric/git/aildata')

# Get token from gh auth
token_res = subprocess.run(['gh', 'auth', 'token'], capture_output=True, text=True)
if token_res.returncode != 0:
    print("Failed to get gh auth token:", token_res.stderr)
    exit(1)

token = token_res.stdout.strip()
remote_url = f"https://x-access-token:{token}@github.com/kherinzink/aildata.git"

subprocess.run(['git', 'remote', 'set-url', 'origin', remote_url], check=True)
push_res = subprocess.run(['git', 'push', '-u', 'origin', 'main'])
exit(push_res.returncode)
