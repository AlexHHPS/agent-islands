// A separate helper keeps fork() away from the multithreaded Cocoa runtime.
// stdin: [kind byte][length uint32 big endian][payload]. stdout: raw PTY bytes.
#include <util.h>
#include <sys/ioctl.h>
#include <sys/wait.h>
#include <poll.h>
#include <signal.h>
#include <unistd.h>
#include <stdlib.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <errno.h>
#include <fcntl.h>

static volatile sig_atomic_t dying = 0;
static void stop(int sig) { dying = sig; }
static int fullwrite(int fd, const void *p, size_t n) {
    const char *b = p;
    while (n) { ssize_t k = write(fd, b, n); if (k < 0 && errno == EINTR) continue;
        if (k <= 0) return -1; b += k; n -= k; }
    return 0;
}
int main(int argc, char **argv) {
    if (argc < 3) { fprintf(stderr, "usage: islands-pty cwd executable [args...]\n"); return 64; }
    int master; struct winsize ws = { .ws_row = 28, .ws_col = 90 };
    pid_t child = forkpty(&master, NULL, NULL, &ws);
    if (child < 0) { perror("forkpty"); return 71; }
    if (child == 0) {
        if (chdir(argv[1]) != 0) { perror("chdir"); _exit(72); }
        setenv("TERM", "xterm-256color", 1); setenv("COLORTERM", "truecolor", 1);
        execvp(argv[2], argv + 2); perror("execvp"); _exit(127);
    }
    // A blocking paste can fill the terminal's echo buffer while this same
    // process is waiting to finish writing. Drain output while input is queued.
    if (fcntl(master, F_SETFL, fcntl(master, F_GETFL) | O_NONBLOCK) < 0) {
        kill(-child, SIGTERM); close(master); waitpid(child, NULL, 0); return 71;
    }
    signal(SIGTERM, stop); signal(SIGINT, stop); signal(SIGHUP, stop); signal(SIGPIPE, SIG_IGN);
    unsigned char input[1048581]; size_t have = 0; int status = 0, reaped = 0;
    unsigned char *pending = NULL; size_t queued = 0, sent = 0;
    while (!dying) {
        struct pollfd fds[2] = {{STDIN_FILENO, POLLIN, 0}, {master, POLLIN | (sent < queued ? POLLOUT : 0), 0}};
        int ready = poll(fds, 2, 200);
        if (ready < 0 && errno != EINTR) break;
        if (fds[1].revents & (POLLIN | POLLHUP | POLLERR)) {
            char output[16384]; ssize_t n = read(master, output, sizeof output);
            if (n > 0) { if (fullwrite(STDOUT_FILENO, output, n) < 0) break; }
            else if (n == 0 || (n < 0 && errno != EINTR && errno != EAGAIN)) break;
        }
        if ((fds[1].revents & POLLOUT) && sent < queued) {
            ssize_t n = write(master, pending + sent, queued - sent);
            if (n > 0) { sent += (size_t)n; if (sent == queued) { sent = queued = 0; } }
            else if (n < 0 && errno != EINTR && errno != EAGAIN) break;
        }
        if (fds[0].revents & (POLLIN | POLLHUP | POLLERR | POLLNVAL)) {
            ssize_t n = read(STDIN_FILENO, input + have, sizeof input - have);
            if (n <= 0) break; have += n;
            while (have >= 5) {
                uint32_t len = ((uint32_t)input[1]<<24) | ((uint32_t)input[2]<<16) | ((uint32_t)input[3]<<8) | input[4];
                if (len > 1048576) { dying = SIGTERM; break; }
                if (have < len + 5) break;
                if (input[0] == 'D' && len) {
                    if (sent) { memmove(pending, pending + sent, queued - sent); queued -= sent; sent = 0; }
                    if (queued + len > 16 * 1048576) { dying = SIGTERM; break; }
                    unsigned char *grown = realloc(pending, queued + len);
                    if (!grown) { dying = SIGTERM; break; }
                    pending = grown; memcpy(pending + queued, input + 5, len); queued += len;
                }
                else if (input[0] == 'R' && len == 4) {
                    ws.ws_col = ((unsigned)input[5]<<8) | input[6];
                    ws.ws_row = ((unsigned)input[7]<<8) | input[8];
                    ioctl(master, TIOCSWINSZ, &ws);
                }
                memmove(input, input + len + 5, have - len - 5); have -= len + 5;
            }
        }
        pid_t r = waitpid(child, &status, WNOHANG);
        if (r == child) { reaped = 1; /* Drain remaining PTY bytes before exiting. */ }
    }
    free(pending);
    if (!reaped) {
        kill(-child, SIGHUP); kill(-child, SIGTERM);
        for (int i = 0; i < 20; i++) {
            if (waitpid(child, &status, WNOHANG) == child) { reaped = 1; break; }
            usleep(50000);
        }
        if (!reaped) { kill(-child, SIGKILL); waitpid(child, &status, 0); }
    }
    close(master);
    return WIFEXITED(status) ? WEXITSTATUS(status) : 128 + WTERMSIG(status);
}
