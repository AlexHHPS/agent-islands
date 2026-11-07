"""Exercise the actual C PTY protocol, not a mock subprocess."""
import os
import select
import signal
import struct
import subprocess
import tempfile
import time
import threading
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / "build" / "Agent Islands.app" / "Contents" / "MacOS" / "islands-pty"

def packet(proc, kind, body):
    proc.stdin.write(kind + struct.pack(">I", len(body)) + body)
    proc.stdin.flush()

def until(proc, expected, timeout=5):
    result = b""
    deadline = time.monotonic() + timeout
    while expected not in result and time.monotonic() < deadline:
        if select.select([proc.stdout], [], [], .1)[0]:
            chunk = os.read(proc.stdout.fileno(), 65536)
            if not chunk:
                break
            result += chunk
    assert expected in result, (expected, result)
    return result

with tempfile.TemporaryDirectory(prefix="islands-pty-") as root:
    proc = subprocess.Popen([str(HELPER), root, "/bin/cat"], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    packet(proc, b"D", "mensaje-ñ-島\n".encode())
    until(proc, "mensaje-ñ-島".encode())
    proc.stdin.close()
    proc.wait(timeout=4)
    print("PASS PTY: Unicode input/output and cleanup on EOF")

    echo = "import tty,os;tty.setraw(0);os.write(1,b'RAW-READY');exec('while True:\\n d=os.read(0,4096)\\n if not d: break\\n os.write(1,d)')"
    proc = subprocess.Popen([str(HELPER), root, sys.executable, "-c", echo], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    until(proc, b"RAW-READY")
    lines = [f"reference-{i:04d}: componente-ñ-島 " + "visual-context " * 8 for i in range(1200)]
    payload = ("\n".join(lines) + "\nEND-LARGE-REFERENCE\n").encode()
    sender = threading.Thread(target=packet, args=(proc, b"D", payload), daemon=True)
    sender.start()
    try:
        output = until(proc, b"END-LARGE-REFERENCE", timeout=15)
        sender.join(timeout=3)
        assert not sender.is_alive(), "Large input stopped making progress"
        assert output == payload, (len(output), len(payload))
        proc.stdin.close()
        proc.wait(timeout=4)
    finally:
        if proc.poll() is None:
            proc.terminate()
            proc.wait(timeout=4)
    print("PASS PTY: large visual-reference paste drains terminal echo without deadlock or lost Unicode")

    proc = subprocess.Popen([str(HELPER), root, "/bin/sh", "-c", "read line; stty size; pwd"], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    packet(proc, b"R", struct.pack(">HH", 111, 37))
    packet(proc, b"D", b"\n")
    output = until(proc, b"37 111")
    output += proc.stdout.read()
    proc.wait(timeout=4)
    assert root.encode() in output, output
    print("PASS PTY: resize and working directory")

    proc = subprocess.Popen([str(HELPER), root, "/bin/sh", "-c", "sleep 200 & echo CHILD:$!; wait"], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    output = until(proc, b"CHILD:")
    if b"\n" not in output:
        output += until(proc, b"\n")
    child = int(output.split(b"CHILD:",1)[1].strip().split()[0])
    proc.terminate()
    proc.wait(timeout=4)
    for _ in range(30):
        try:
            os.kill(child, 0)
        except ProcessLookupError:
            break
        time.sleep(.1)
    else:
        os.kill(child, signal.SIGKILL)
        raise AssertionError("Descendant survived terminal shutdown")
    print("PASS PTY: terminating a session also stops descendants")

    proc = subprocess.Popen([str(HELPER), root, "/not/a/real/program"], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    output = until(proc, b"execvp")
    proc.wait(timeout=4)
    assert proc.returncode == 127 and b"execvp" in output
    print("PASS PTY: launch errors are visible and exit nonzero")
