import http.server
import socketserver
import os
import sys
from typing import Any, Tuple

PORT: int = 8123
DIRECTORY: str = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def log_message(self, format: str, *args: Any) -> None:
        # Log to both stdout and stderr for visibility in command_status/read_terminal
        message: str = "%s - - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), format % args)
        sys.stderr.write(message)
        sys.stdout.write(message)
        sys.stdout.flush()

try:
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Server local: http://localhost:{PORT}")
        print(f"Acesso pelo celular: http://192.168.1.176:{PORT}")
        httpd.serve_forever()
except Exception as e:
    print(f"Error: {e}")
