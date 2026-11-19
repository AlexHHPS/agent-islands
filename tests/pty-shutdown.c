#include <assert.h>

// Exercise the bounded shutdown path without depending on a child getting
// stuck inside macOS process teardown.
#define main pty_main
#define waitpid fixture_waitpid
#define kill fixture_kill
#define usleep fixture_usleep
#include "../native/pty.c"
#undef main
#undef waitpid
#undef kill
#undef usleep

static const pid_t child_pid = 123;
static int master_fd;
static int checks;
static int signals_sent;
static const int signals[] = {SIGHUP, SIGTERM, SIGKILL};

pid_t fixture_waitpid(pid_t pid, int *status, int options) {
    (void)status;
    assert(pid == child_pid);
    assert(options == WNOHANG);
    assert(fcntl(master_fd, F_GETFD) == -1 && errno == EBADF);
    assert(++checks <= 50);
    return 0;
}

int fixture_kill(pid_t pid, int sig) {
    assert(pid == -child_pid);
    assert(signals_sent < 3 && sig == signals[signals_sent]);
    signals_sent++;
    return 0;
}

int fixture_usleep(useconds_t interval) {
    (void)interval;
    return 0;
}

int main(void) {
    int fds[2];
    assert(pipe(fds) == 0);
    master_fd = fds[0];
    assert(finish_session(master_fd, child_pid, 0, 0) == 128 + SIGKILL);
    assert(signals_sent == 3 && checks > 0);
    close(fds[1]);
    return 0;
}
