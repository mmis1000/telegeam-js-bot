FROM ubuntu

# install common utils
RUN apt-get update -y; \
    apt-get install -y apt-utils \
                       sudo \
                       tmux \
                       nano \
                       vim \
                       curl \
                       wget \
                       less \
                       software-properties-common; \
    apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# install build essential for c and cpp
RUN apt-get update -y; \
    apt-get install -y build-essential; \
    apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# install python 2 and 3
RUN apt-get update -y; \
    apt-get install -y python3 \
                       python2.7; \
    apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# install node.js
RUN apt-get update -y; \
    apt-get install -y nodejs; \
    apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# fix node.js path
RUN ln -s /usr/bin/nodejs /usr/bin/node

# install npm
RUN apt-get update -y; \
    apt-get install -y npm; \
    apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# install java
RUN add-apt-repository ppa:webupd8team/java; \
    apt-get -y update; \
    mkdir -p /usr/lib/mozilla/plugins; \
    echo debconf shared/accepted-oracle-license-v1-1 select true | debconf-set-selections; \
    echo debconf shared/accepted-oracle-license-v1-1 seen true | debconf-set-selections; \
    apt-get -y install oracle-jdk7-installer; \
    apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# install php
RUN apt-key adv --keyserver hkp://keyserver.ubuntu.com --recv-keys E5267A6C; \
    echo 'deb http://ppa.launchpad.net/ondrej/php5/ubuntu trusty main' > /etc/apt/sources.list.d/ondrej-php5-trusty.list; \
    apt-get update -y; \
    apt-get install -y php5; \
    apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# add golang
RUN add-apt-repository ppa:ubuntu-lxc/lxd-stable; \
    apt-get -y update; \
    apt-get install -y golang; \
    apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# install ruby
RUN apt-get install -y ruby2.3; \
    apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# add rust lang
RUN curl -sSf https://static.rust-lang.org/rustup.sh | sh; \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# install brainfuck
RUN npm install -y -g brainless; \
    npm cache clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# install coffee script
RUN npm install -y -g coffee-script; \
    npm cache clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# remove unused
RUN apt-get purge -y software-properties-common; \
    apt-get autoclean -y

# setup another account
RUN addgroup ubuntu; \
    useradd ubuntu -s /bin/bash -m -g ubuntu -G sudo; \
    passwd ubuntu -d; \
    bash -c "echo ubuntu ALL=NOPASSWD: ALL > /etc/sudoers.d/myOverrides"

WORKDIR /home/ubuntu

# clone slave files
COPY executer.js executer.js
COPY runner/*.js runner/
