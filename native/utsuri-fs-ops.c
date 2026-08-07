// SPDX-License-Identifier: AGPL-3.0-or-later

#define _GNU_SOURCE

#include <errno.h>
#include <fcntl.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>

#if defined(__APPLE__)
#include <sys/stdio.h>
#elif defined(__linux__)
#include <linux/fs.h>
#include <sys/syscall.h>
#else
#error "utsuri-fs-ops supports only macOS and Linux"
#endif

enum {
  UTSURI_OK = 0,
  UTSURI_USAGE = 64,
  UTSURI_DESTINATION_EXISTS = 65,
  UTSURI_IDENTITY_MISMATCH = 66,
  UTSURI_UNSUPPORTED = 67,
  UTSURI_SYSTEM_ERROR = 68,
  UTSURI_PATH_INVALID = 69,
  UTSURI_FILE_TYPE = 70,
  UTSURI_FILE_SIZE = 71,
  UTSURI_FILE_MISSING = 72
};

static int parse_uint64(const char *text, uint64_t *value) {
  char *end = NULL;
  errno = 0;
  unsigned long long parsed = strtoull(text, &end, 10);
  if (errno != 0 || end == text || *end != '\0') {
    return -1;
  }
  *value = (uint64_t)parsed;
  return 0;
}

static int valid_entry_name(const char *name) {
  return name[0] != '\0' && strcmp(name, ".") != 0 && strcmp(name, "..") != 0 &&
         strchr(name, '/') == NULL;
}

static int same_identity(const struct stat *value, uint64_t expected_dev,
                         uint64_t expected_ino) {
  return (uint64_t)value->st_dev == expected_dev &&
         (uint64_t)value->st_ino == expected_ino;
}

static int rename_no_replace(int parent_fd, const char *source,
                             const char *destination) {
#if defined(__APPLE__)
  return renameatx_np(parent_fd, source, parent_fd, destination, RENAME_EXCL);
#elif defined(__linux__)
  return (int)syscall(SYS_renameat2, parent_fd, source, parent_fd, destination,
                      RENAME_NOREPLACE);
#endif
}

static int fail_with_errno(const char *operation) {
  int code = errno;
  if (code == EEXIST || code == ENOTEMPTY) {
    return UTSURI_DESTINATION_EXISTS;
  }
  if (code == ENOSYS || code == ENOTSUP || code == EOPNOTSUPP || code == EXDEV) {
    fprintf(stderr, "%s is unavailable: %s\n", operation, strerror(code));
    return UTSURI_UNSUPPORTED;
  }
  fprintf(stderr, "%s failed: %s\n", operation, strerror(code));
  return UTSURI_SYSTEM_ERROR;
}

static int contained_open_error(const char *operation) {
  int code = errno;
  if (code == ENOENT || code == ENOTDIR) {
    fprintf(stderr, "%s failed: contained path is missing\n", operation);
    return UTSURI_FILE_MISSING;
  }
  if (code == ELOOP) {
    fprintf(stderr, "%s failed: symbolic links are forbidden\n", operation);
    return UTSURI_FILE_TYPE;
  }
  fprintf(stderr, "%s failed: %s\n", operation, strerror(code));
  return UTSURI_SYSTEM_ERROR;
}

static int valid_relative_path(const char *value) {
  size_t length = strlen(value);
  if (length == 0 || value[0] == '/' || value[length - 1] == '/' ||
      strchr(value, '\\') != NULL) {
    return 0;
  }
  const char *segment = value;
  for (const char *cursor = value;; cursor++) {
    if (*cursor != '/' && *cursor != '\0') {
      continue;
    }
    size_t segment_length = (size_t)(cursor - segment);
    if (segment_length == 0 ||
        (segment_length == 1 && segment[0] == '.') ||
        (segment_length == 2 && segment[0] == '.' && segment[1] == '.')) {
      return 0;
    }
    if (*cursor == '\0') {
      return 1;
    }
    segment = cursor + 1;
  }
}

static int open_verified_directory(const char *root_path, uint64_t expected_dev,
                                   uint64_t expected_ino, int *root_fd) {
  int descriptor = open(root_path, O_RDONLY | O_CLOEXEC | O_DIRECTORY | O_NOFOLLOW);
  if (descriptor < 0) {
    if (errno == ENOENT || errno == ENOTDIR || errno == ELOOP) {
      fprintf(stderr, "root directory identity changed\n");
      return UTSURI_IDENTITY_MISMATCH;
    }
    return fail_with_errno("open(root)");
  }
  struct stat root_stat;
  if (fstat(descriptor, &root_stat) != 0) {
    int result = fail_with_errno("fstat(root)");
    close(descriptor);
    return result;
  }
  if (!S_ISDIR(root_stat.st_mode) ||
      !same_identity(&root_stat, expected_dev, expected_ino)) {
    fprintf(stderr, "root directory identity changed\n");
    close(descriptor);
    return UTSURI_IDENTITY_MISMATCH;
  }
  *root_fd = descriptor;
  return UTSURI_OK;
}

static int read_contained(int root_fd, const char *relative_path,
                          uint64_t maximum_bytes) {
  if (!valid_relative_path(relative_path)) {
    fprintf(stderr, "contained path must use safe relative components\n");
    return UTSURI_PATH_INVALID;
  }

  struct stat root_stat;
  if (fstat(root_fd, &root_stat) != 0) {
    return fail_with_errno("fstat(root)");
  }
  if (!S_ISDIR(root_stat.st_mode)) {
    fprintf(stderr, "contained root is not a directory\n");
    return UTSURI_IDENTITY_MISMATCH;
  }

  int directory_fd = dup(root_fd);
  if (directory_fd < 0) {
    return fail_with_errno("dup(root)");
  }
  const char *segment = relative_path;
  int file_fd = -1;
  for (const char *cursor = relative_path;; cursor++) {
    if (*cursor != '/' && *cursor != '\0') {
      continue;
    }
    size_t segment_length = (size_t)(cursor - segment);
    char *entry = malloc(segment_length + 1);
    if (entry == NULL) {
      close(directory_fd);
      errno = ENOMEM;
      return fail_with_errno("allocate(path component)");
    }
    memcpy(entry, segment, segment_length);
    entry[segment_length] = '\0';

    if (*cursor == '\0') {
      file_fd = openat(directory_fd, entry,
                       O_RDONLY | O_CLOEXEC | O_NOFOLLOW | O_NONBLOCK);
      free(entry);
      if (file_fd < 0) {
        int result = contained_open_error("openat(file)");
        close(directory_fd);
        return result;
      }
      break;
    }

    int next_fd = openat(directory_fd, entry,
                         O_RDONLY | O_CLOEXEC | O_DIRECTORY | O_NOFOLLOW);
    free(entry);
    if (next_fd < 0) {
      int result = contained_open_error("openat(directory)");
      close(directory_fd);
      return result;
    }
    close(directory_fd);
    directory_fd = next_fd;
    segment = cursor + 1;
  }
  close(directory_fd);

  struct stat file_stat;
  if (fstat(file_fd, &file_stat) != 0) {
    int result = fail_with_errno("fstat(file)");
    close(file_fd);
    return result;
  }
  if (!S_ISREG(file_stat.st_mode)) {
    fprintf(stderr, "contained input must be a regular file\n");
    close(file_fd);
    return UTSURI_FILE_TYPE;
  }
  if (file_stat.st_size < 0 || (uint64_t)file_stat.st_size > maximum_bytes) {
    fprintf(stderr, "contained input exceeds the byte limit\n");
    close(file_fd);
    return UTSURI_FILE_SIZE;
  }

  unsigned char buffer[65536];
  uint64_t total = 0;
  for (;;) {
    ssize_t count = read(file_fd, buffer, sizeof(buffer));
    if (count < 0) {
      if (errno == EINTR) {
        continue;
      }
      int result = fail_with_errno("read(file)");
      close(file_fd);
      return result;
    }
    if (count == 0) {
      break;
    }
    total += (uint64_t)count;
    if (total > maximum_bytes) {
      fprintf(stderr, "contained input grew beyond the byte limit\n");
      close(file_fd);
      return UTSURI_FILE_SIZE;
    }
    size_t written = 0;
    while (written < (size_t)count) {
      ssize_t output = write(STDOUT_FILENO, buffer + written,
                             (size_t)count - written);
      if (output < 0) {
        if (errno == EINTR) {
          continue;
        }
        int result = fail_with_errno("write(stdout)");
        close(file_fd);
        return result;
      }
      written += (size_t)output;
    }
  }
  close(file_fd);
  return UTSURI_OK;
}

static int publish_contained(int parent_fd, const char *source,
                             const char *destination,
                             const char *parent_dev_text,
                             const char *parent_ino_text,
                             const char *source_dev_text,
                             const char *source_ino_text) {
  if (!valid_entry_name(source) || !valid_entry_name(destination)) {
    fprintf(stderr, "publication entries must be safe names\n");
    return UTSURI_USAGE;
  }

  uint64_t expected_parent_dev;
  uint64_t expected_parent_ino;
  uint64_t expected_source_dev;
  uint64_t expected_source_ino;
  if (parse_uint64(parent_dev_text, &expected_parent_dev) != 0 ||
      parse_uint64(parent_ino_text, &expected_parent_ino) != 0 ||
      parse_uint64(source_dev_text, &expected_source_dev) != 0 ||
      parse_uint64(source_ino_text, &expected_source_ino) != 0) {
    fprintf(stderr, "invalid filesystem identity\n");
    return UTSURI_USAGE;
  }

  struct stat parent_stat;
  if (fstat(parent_fd, &parent_stat) != 0) {
    return fail_with_errno("fstat(parent)");
  }
  if (!S_ISDIR(parent_stat.st_mode) ||
      !same_identity(&parent_stat, expected_parent_dev, expected_parent_ino)) {
    fprintf(stderr, "parent directory identity changed\n");
    return UTSURI_IDENTITY_MISMATCH;
  }

  struct stat source_stat;
  if (fstatat(parent_fd, source, &source_stat, AT_SYMLINK_NOFOLLOW) != 0) {
    if (errno == ENOENT || errno == ELOOP) {
      fprintf(stderr, "source directory identity changed\n");
      return UTSURI_IDENTITY_MISMATCH;
    }
    return fail_with_errno("fstatat(source)");
  }
  if (!S_ISDIR(source_stat.st_mode) ||
      !same_identity(&source_stat, expected_source_dev, expected_source_ino)) {
    fprintf(stderr, "source directory identity changed\n");
    return UTSURI_IDENTITY_MISMATCH;
  }

  if (rename_no_replace(parent_fd, source, destination) != 0) {
    if (errno == EINVAL) {
      fprintf(stderr, "rename-no-replace is unavailable: %s\n", strerror(errno));
      return UTSURI_UNSUPPORTED;
    }
    return fail_with_errno("rename-no-replace");
  }

  struct stat destination_stat;
  if (fstatat(parent_fd, destination, &destination_stat, AT_SYMLINK_NOFOLLOW) != 0) {
    return fail_with_errno("fstatat(published)");
  }
  if (!S_ISDIR(destination_stat.st_mode) ||
      !same_identity(&destination_stat, expected_source_dev, expected_source_ino)) {
    fprintf(stderr, "published directory identity changed\n");
    return UTSURI_IDENTITY_MISMATCH;
  }

  return UTSURI_OK;
}

static int browser_launch(int argc, char **argv) {
#if defined(__linux__)
  const char *browser = getenv("UTSURI_BROWSER_EXECUTABLE");
  const char *cgroup_procs = getenv("UTSURI_BROWSER_CGROUP_PROCS");
  const char *cgroup_prefix = "/sys/fs/cgroup/";
  const char *cgroup_suffix = "/cgroup.procs";
  if (argc < 2 || browser == NULL || browser[0] != '/' ||
      cgroup_procs == NULL ||
      strncmp(cgroup_procs, cgroup_prefix, strlen(cgroup_prefix)) != 0 ||
      strstr(cgroup_procs, "..") != NULL) {
    fprintf(stderr, "browser memory boundary configuration is invalid\n");
    return UTSURI_PATH_INVALID;
  }
  size_t cgroup_length = strlen(cgroup_procs);
  size_t suffix_length = strlen(cgroup_suffix);
  if (cgroup_length <= suffix_length ||
      strcmp(cgroup_procs + cgroup_length - suffix_length, cgroup_suffix) != 0) {
    fprintf(stderr, "browser cgroup path is invalid\n");
    return UTSURI_PATH_INVALID;
  }

  int cgroup_fd = open(cgroup_procs, O_WRONLY | O_CLOEXEC | O_NOFOLLOW);
  if (cgroup_fd < 0) {
    return fail_with_errno("open(browser cgroup.procs)");
  }
  char process_text[32];
  int process_length = snprintf(process_text, sizeof(process_text), "%ld", (long)getpid());
  if (process_length <= 0 || process_length >= (int)sizeof(process_text)) {
    close(cgroup_fd);
    fprintf(stderr, "browser process identifier is invalid\n");
    return UTSURI_SYSTEM_ERROR;
  }
  if (write(cgroup_fd, process_text, (size_t)process_length) !=
      (ssize_t)process_length) {
    if (errno == 0) {
      errno = EIO;
    }
    int result = fail_with_errno("write(browser cgroup.procs)");
    close(cgroup_fd);
    return result;
  }
  if (close(cgroup_fd) != 0) {
    return fail_with_errno("close(browser cgroup.procs)");
  }

  char *browser_copy = strdup(browser);
  if (browser_copy == NULL) {
    return fail_with_errno("strdup(browser executable)");
  }
  unsetenv("UTSURI_BROWSER_EXECUTABLE");
  unsetenv("UTSURI_BROWSER_CGROUP_PROCS");
  argv[0] = browser_copy;
  execv(browser_copy, argv);
  int result = fail_with_errno("execv(browser)");
  free(browser_copy);
  return result;
#else
  (void)argc;
  (void)argv;
  fprintf(stderr, "browser cgroup launch is supported only on Linux\n");
  return UTSURI_UNSUPPORTED;
#endif
}

int main(int argc, char **argv) {
  if (getenv("UTSURI_BROWSER_EXECUTABLE") != NULL ||
      getenv("UTSURI_BROWSER_CGROUP_PROCS") != NULL) {
    return browser_launch(argc, argv);
  }
  if (argc >= 2 && strcmp(argv[1], "browser-launch") == 0) {
    argv[1] = argv[0];
    return browser_launch(argc - 1, argv + 1);
  }
  if (argc == 4 && strcmp(argv[1], "read-contained") == 0) {
    uint64_t maximum_bytes;
    if (parse_uint64(argv[3], &maximum_bytes) != 0) {
      fprintf(stderr, "invalid contained read byte limit\n");
      return UTSURI_USAGE;
    }
    return read_contained(3, argv[2], maximum_bytes);
  }
  if (argc == 7 && strcmp(argv[1], "read-contained-root") == 0) {
    uint64_t maximum_bytes;
    uint64_t expected_root_dev;
    uint64_t expected_root_ino;
    if (parse_uint64(argv[4], &maximum_bytes) != 0 ||
        parse_uint64(argv[5], &expected_root_dev) != 0 ||
        parse_uint64(argv[6], &expected_root_ino) != 0) {
      fprintf(stderr, "invalid contained read boundary\n");
      return UTSURI_USAGE;
    }
    int root_fd = -1;
    int opened = open_verified_directory(argv[2], expected_root_dev,
                                         expected_root_ino, &root_fd);
    if (opened != UTSURI_OK) {
      return opened;
    }
    int result = read_contained(root_fd, argv[3], maximum_bytes);
    close(root_fd);
    return result;
  }
  if (argc == 9 && strcmp(argv[1], "publish-contained") == 0) {
    uint64_t expected_parent_dev;
    uint64_t expected_parent_ino;
    if (parse_uint64(argv[5], &expected_parent_dev) != 0 ||
        parse_uint64(argv[6], &expected_parent_ino) != 0) {
      fprintf(stderr, "invalid publication root identity\n");
      return UTSURI_USAGE;
    }
    int parent_fd = -1;
    int opened = open_verified_directory(argv[2], expected_parent_dev,
                                         expected_parent_ino, &parent_fd);
    if (opened != UTSURI_OK) {
      return opened;
    }
    int result = publish_contained(parent_fd, argv[3], argv[4], argv[5],
                                   argv[6], argv[7], argv[8]);
    close(parent_fd);
    return result;
  }
  if (argc != 7) {
    fprintf(stderr,
            "usage: utsuri-fs-ops SOURCE DESTINATION PARENT_DEV PARENT_INO "
            "SOURCE_DEV SOURCE_INO\n"
            "   or: utsuri-fs-ops read-contained RELATIVE MAX_BYTES (root on fd 3)\n"
            "   or: utsuri-fs-ops read-contained-root ROOT RELATIVE MAX_BYTES ROOT_DEV ROOT_INO\n"
            "   or: utsuri-fs-ops publish-contained ROOT SOURCE DESTINATION PARENT_DEV PARENT_INO SOURCE_DEV SOURCE_INO\n"
            "   or: utsuri-fs-ops browser-launch CHROME_ARGS...\n");
    return UTSURI_USAGE;
  }
  return publish_contained(3, argv[1], argv[2], argv[3], argv[4], argv[5],
                           argv[6]);
}
