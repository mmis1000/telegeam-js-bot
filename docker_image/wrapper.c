#include <stdio.h>
#include <stdlib.h>
#include <sys/types.h>
#include <unistd.h>
#include <pwd.h>
#include <string.h>   // for strerror()

unsigned long getGidFromUsername(const char *name)
{
    struct passwd *pwd = getpwnam(name); /* don't free, see getgrnam() for details */
    
    if(pwd == NULL) {
        return -1;
    }
    
    return (unsigned long)(pwd->pw_gid);
}

unsigned long getUidFromUsername(const char *name)
{
    struct passwd *pwd = getpwnam(name); /* don't free, see getpwnam() for details */
    
    if(pwd == NULL) {
        return -1;
    } 
    
    return (unsigned long)(pwd->pw_uid);
}

int main(int argc, char *argv[])
{
    FILE *pidFile;
    uid_t processUid;
    gid_t processGid;
   
    if (argc < 4) {
        printf("There should at lease 3 arguments\n");
        printf("Usage: wrapper <pid file path> <set user> <program path> [args..]\n");
        return 1;
    }
   
    // write pud file
    pidFile = fopen(argv[1], "w");
    
    if (NULL == pidFile) {
        printf("Open pid file failure");
        return 1;
    }
    
    unsigned long pid = (unsigned long)(getpid());
    fprintf(pidFile, "%lu\n", pid);
    fclose(pidFile);
    // set uid
    
    unsigned long uid = getUidFromUsername(argv[2]);
    unsigned long gid = getGidFromUsername(argv[2]);
    
    int result;
    
    result = setgid(gid);
    if (result != 0) {
        fprintf(stderr, "setgid failed\n");
        return 1;
    }
    
    result = setuid(uid);
    if (result != 0) {
        fprintf(stderr, "setuid failed\n");
        return 1;
    }
    
    char **newArgv = malloc((argc - 4 + 2) * sizeof(*newArgv));
    
    for (int i = 3; i < argc; i++) {
        newArgv[i - 3] = argv[i];
    }
    
    newArgv[argc - 3] = NULL;
    
    if (execvp(argv[3], newArgv) == -1) {
        perror("exec error");
    }
    
    return 1;
}