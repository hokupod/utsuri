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
  UTSURI_SYSTEM_ERROR = 68
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

int main(int argc, char **argv) {
  if (argc != 7 || !valid_entry_name(argv[1]) || !valid_entry_name(argv[2])) {
    fprintf(stderr,
            "usage: utsuri-fs-ops SOURCE DESTINATION PARENT_DEV PARENT_INO "
            "SOURCE_DEV SOURCE_INO\n");
    return UTSURI_USAGE;
  }

  uint64_t expected_parent_dev;
  uint64_t expected_parent_ino;
  uint64_t expected_source_dev;
  uint64_t expected_source_ino;
  if (parse_uint64(argv[3], &expected_parent_dev) != 0 ||
      parse_uint64(argv[4], &expected_parent_ino) != 0 ||
      parse_uint64(argv[5], &expected_source_dev) != 0 ||
      parse_uint64(argv[6], &expected_source_ino) != 0) {
    fprintf(stderr, "invalid filesystem identity\n");
    return UTSURI_USAGE;
  }

  struct stat parent_stat;
  if (fstat(3, &parent_stat) != 0) {
    return fail_with_errno("fstat(parent)");
  }
  if (!S_ISDIR(parent_stat.st_mode) ||
      !same_identity(&parent_stat, expected_parent_dev, expected_parent_ino)) {
    fprintf(stderr, "parent directory identity changed\n");
    return UTSURI_IDENTITY_MISMATCH;
  }

  struct stat source_stat;
  if (fstatat(3, argv[1], &source_stat, AT_SYMLINK_NOFOLLOW) != 0) {
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

  if (rename_no_replace(3, argv[1], argv[2]) != 0) {
    if (errno == EINVAL) {
      fprintf(stderr, "rename-no-replace is unavailable: %s\n", strerror(errno));
      return UTSURI_UNSUPPORTED;
    }
    return fail_with_errno("rename-no-replace");
  }

  struct stat destination_stat;
  if (fstatat(3, argv[2], &destination_stat, AT_SYMLINK_NOFOLLOW) != 0) {
    return fail_with_errno("fstatat(published)");
  }
  if (!S_ISDIR(destination_stat.st_mode) ||
      !same_identity(&destination_stat, expected_source_dev, expected_source_ino)) {
    fprintf(stderr, "published directory identity changed\n");
    return UTSURI_IDENTITY_MISMATCH;
  }

  return UTSURI_OK;
}
