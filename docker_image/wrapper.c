#include <stdio.h>
#include <stdlib.h>
#include <sys/types.h>
#include <unistd.h>
#include <pwd.h>
#include <grp.h>
#include <errno.h>

int getGidFromUsername(const char *name)
{
    struct passwd *pwd = getpwnam(name); /* don't free, see getgrnam() for details */
    
    if(pwd == NULL) {
        return -1;
    }
    
    return (int)(pwd->pw_gid);
}

int getUidFromUsername(const char *name)
{
    struct passwd *pwd = getpwnam(name); /* don't free, see getpwnam() for details */
    
    if(pwd == NULL) {
        return -1;
    } 
    
    return (int)(pwd->pw_uid);
}

int main( int argc, char *argv[] )
{
    FILE *pidFile;
    uid_t processUid;
    gid_t processGid;
    
    // if (argc >= 4 ) {
    //     printf("The argument supplied is ");
    //     for (int i = 0; i < argc; i++) {
    //         printf("%s ", argv[i]);
    //     }
    //     printf("\n");
    // } 
   
    if (argc < 4) {
        printf("There should at lease 3 arguments\n");
        printf(" Usage: wrapper <pid file path> <set user> <program path> [args..]\n");
        return 1;
    }
   
    // write pud file
    pidFile = fopen(argv[1], "w");
    
    if (NULL == pidFile) {
        printf( "open failure" );
        return 1;
    }
    
    int pid = (int)(getpid());
    fprintf(pidFile, "%d\n", pid);
    fclose(pidFile);
    // set uid
    
    int uid = getUidFromUsername(argv[2]);
    int gid = getGidFromUsername(argv[2]);
    
    // printf("uid of user %s is %d\n", argv[2], uid);
    // printf("gid of user %s is %d\n", argv[2], gid);
    
    // printf("uid of current process is %d\n", getuid());
    // printf("gid of current process is %d\n", getgid());
    
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
    
    // printf("uid of current process is %d\n", getuid());
    // printf("gid of current process is %d\n", getgid());
    
    char **newArgv = malloc((argc - 4 + 2) * sizeof(char*));
    
    for (int i = 3; i < argc; i++) {
        newArgv[i - 3] = argv[i];
    }
    
    newArgv[argc - 3] = NULL;
    
    printf("New argv is ");
    for (int i = 0; i < argc - 2; i++) {
        printf("%s ", newArgv[i]);
    }
    printf("\n");
    
    if (execvp(argv[3], newArgv) == -1) {
        switch (errno) {
            case E2BIG:
                fprintf(stderr, "E2BIG");
            case EACCES:
                fprintf(stderr, "EACCES");
            case EFAULT:
                fprintf(stderr, "EFAULT");
            case EINVAL:
                fprintf(stderr, "EINVAL");
            case EIO:
                fprintf(stderr, "EIO");
            case EISDIR:
                fprintf(stderr, "EISDIR");
            case ELIBBAD:
                fprintf(stderr, "ELIBBAD");
            case ELOOP:
                fprintf(stderr, "ELOOP");
            case EMFILE:
                fprintf(stderr, "EMFILE");
            case ENAMETOOLONG:
                fprintf(stderr, "ENAMETOOLONG");
            case ENOENT:
                fprintf(stderr, "ENOENT");
            case ENOEXEC:
                fprintf(stderr, "ENOEXEC");
            case ENOTDIR:
                fprintf(stderr, "ENOTDIR");
            case EPERM:
                fprintf(stderr, "EPERM");
            case ETXTBSY:
                fprintf(stderr, "ETXTBSY");
            default:
                fprintf(stderr, "unknown error");
        }
    }
    
    return -1;
}