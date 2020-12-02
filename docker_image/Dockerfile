# FROM ubuntu
FROM debian:buster

ARG APT_MIRROR='opensource.nchc.org.tw'

# Username
ENV USER_NAME debian

ENV NVM_DIR /home/$USER_NAME/.nvm

ENV NODE_VERSION 14.15.1
ENV KOTLIN_VERSION=1.4.20

RUN sed --in-place "s/httpredir.debian.org/$APT_MIRROR/g" /etc/apt/sources.list \
    && sed --in-place "s/deb.debian.org/$APT_MIRROR/g" /etc/apt/sources.list

# 0. install eatmydata
RUN apt-get update -y \
    && apt-get install -y eatmydata \
    && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# 1. install common utils
RUN apt-get update -y \
    && eatmydata apt-get install -y apt-utils \
                       sudo \
                       tmux \
                       nano \
                       vim \
                       curl \
                       wget \
                       less \
                       zip \
                       software-properties-common \
    && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# 2. install build essential for c and cpp
RUN apt-get update -y \
    && eatmydata apt-get install -y build-essential \
    && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# 3. install python 2 and 3
RUN apt-get update -y \
    && eatmydata apt-get install -y python3 \
                          python2.7 \
    && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# 4. install node.js  
RUN curl -sL https://deb.nodesource.com/setup_14.x | eatmydata bash - \
    && apt-get -y update \
    && eatmydata apt-get install -y nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# 7. install java
RUN apt-get -y update \
    && eatmydata apt-get -y --no-install-recommends install openjdk-11-jdk \
    && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# 8. install php
RUN apt-get -y update \
    && eatmydata apt-get install -y php7.3-cli \
    && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# 9. add golang
RUN apt-get -y update \
    && eatmydata apt-get install -y golang \
    && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# 10. add rust lang
RUN curl https://sh.rustup.rs -sSf |  sh -s -- -y \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# 11. add clisp
RUN apt-get -y update \
    && eatmydata apt-get install -y sbcl \
    && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# 12. add lua
RUN apt-get -y update \
    && eatmydata apt-get install -y lua5.3 \
    && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# 13. add csharp and probably other .net based language
RUN apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys 3FA7E0328081BFF6A14DA29AA6A19B38D3D831EF \
    && echo "deb https://download.mono-project.com/repo/debian stable-buster main" | sudo tee /etc/apt/sources.list.d/mono-official-stable.list \
    && apt-get -y update \
    && eatmydata apt-get install -y mono-xbuild mono-mcs mono-devel \
    && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# 15. add vb
RUN apt-get -y update \
    && eatmydata apt-get install -y mono-vbnc \
    && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# 14. add ruby
RUN apt-get -y update \
    && eatmydata apt-get install -y ruby \
    && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*
# 16. add fsharp
RUN apt-get -y update \
    && eatmydata apt-get install -y fsharp \
    && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# 17. add haskell
RUN apt-get -y update \
    && eatmydata apt-get install -y haskell-platform \
    && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# add kotlin
RUN cd /usr/lib && \
    wget "https://github.com/JetBrains/kotlin/releases/download/v${KOTLIN_VERSION}/kotlin-compiler-${KOTLIN_VERSION}.zip" && \
    unzip kotlin-compiler-*.zip && \
    rm kotlin-compiler-*.zip && \
    rm -f kotlinc/bin/*.bat

# dependency issue
# 18. add swift
# RUN mkdir /opt/swift \
#     && cd /opt/swift/ \
#     && wget https://swift.org/builds/swift-4.0-release/ubuntu1610/swift-4.0-RELEASE/swift-4.0-RELEASE-ubuntu16.10.tar.gz \
#     && tar -xzf swift-4.0-RELEASE-ubuntu16.10.tar.gz \
#     && echo 'PATH="/opt/swift/swift-4.0-RELEASE-ubuntu16.10/usr/bin:$PATH"' > /etc/profile  \
#     && echo "deb http://$APT_MIRROR/debian testing main contrib non-free" > /etc/apt/sources.list.d/gcc.list \
#     && echo 'Package: gcc' > /etc/apt/preferences.d/gcc \
#     && echo 'Pin: release a=testing' >> /etc/apt/preferences.d/gcc \
#     && echo 'Pin-Priority: 100' >> /etc/apt/preferences.d/gcc \
#     && apt-get update \
#     && apt-get install -y -t testing gcc \
#     && rm -f /etc/apt/sources.list.d/gcc.list /etc/apt/preferences.d/gcc \
#     && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* \
#     && apt-get update \
#     && apt-get install -y curl gcc python-dev python-pip libffi-dev python-setuptools sqlite3 git-core git cmake ninja-build clang uuid-dev libicu-dev icu-devtools libbsd-dev libedit-dev libxml2-dev libsqlite3-dev swig libpython-dev libncurses5-dev pkg-config libpython2.7 libtinfo-dev \
#     && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* \
#     && ln -s /usr/lib/x86_64-linux-gnu/libstdc++.so.6 /usr/lib/libstdc++.so \
#     && wget http://ftp.us.debian.org/debian/pool/main/i/icu/libicu57_57.1-6_amd64.deb \
#     && dpkg -i libicu57_57.1-6_amd64.deb \
#     && apt-get install -f -y \
#     && rm -f libicu57_57.1-6_amd64.deb \
#     && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*
    
# ENV PATH /opt/swift/swift-4.0-RELEASE-ubuntu16.10/usr/bin:$PATH

# 19. add scala
RUN apt-get -y update \
    && eatmydata apt-get install -y scala \
    && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*
    
# 20. Install wine and related packages
RUN dpkg --add-architecture i386 \
    && apt-get update \
	&& eatmydata apt-get install -y --no-install-recommends wine \
	                                              wine32 \
    && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# 21. Use the latest version of winetricks
RUN curl -SL 'https://raw.githubusercontent.com/Winetricks/winetricks/master/src/winetricks' -o /usr/local/bin/winetricks \
	&& chmod +x /usr/local/bin/winetricks


# Replace shell with bash so we can source files
RUN mv /bin/sh /bin/sh_backup && ln -s /bin/bash /bin/sh

# setup another account
RUN addgroup $USER_NAME; \
    useradd $USER_NAME -s /bin/bash -m -g $USER_NAME -G sudo; \
    passwd $USER_NAME -d; \
    bash -c "echo $USER_NAME ALL=NOPASSWD: ALL > /etc/sudoers.d/myOverrides"

# install nvm as user
USER $USER_NAME

# Install nvm with node and npm
RUN curl https://raw.githubusercontent.com/creationix/nvm/v0.20.0/install.sh | bash \
    && source $NVM_DIR/nvm.sh \
    && mkdir -p $NVM_DIR/versions \
    && nvm install $NODE_VERSION \
    && nvm alias default $NODE_VERSION \
    && nvm use default

ENV NODE_PATH $NVM_DIR/versions/v$NODE_VERSION/lib/node_modules

# configuring all paths
ENV PATH      /usr/lib/kotlinc/bin:/root/.cargo/bin:$NVM_DIR/versions/v$NODE_VERSION/bin:$PATH

# Switch back for other lib
USER root

# Protect this path from being tampered
RUN chown -R root:root $NVM_DIR/versions/v$NODE_VERSION/

# Replace shell back
RUN rm /bin/sh && mv /bin/sh_backup /bin/sh

# 22. install brainfuck
RUN npm install -y -g brainless; \
    npm cache clean --force && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# 23. install coffee script
RUN npm install -y -g coffee-script; \
    npm cache clean --force && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Install gnu time for measurement
# RUN apt-get update \
#     && apt-get install -y time \
#     && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Remove unused files
# RUN apt-get purge -y software-properties-common; \
#     apt-get autoclean -y

# 24. Set the locale
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive eatmydata apt-get install -y locales \
    && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*
RUN sed -i -e 's/# en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen && \
    locale-gen
ENV LANG en_US.UTF-8
ENV LANGUAGE en_US:en
ENV LC_ALL en_US.UTF-8

WORKDIR /home/$USER_NAME
USER $USER_NAME

# Setup wine
RUN winetricks > /dev/null

USER root
WORKDIR /app/
RUN mkdir app

# 25. install my own time
RUN apt-get update \
    && eatmydata apt-get install -y automake texinfo git libcap-dev \
    && mkdir gnu_time\
    && cd gnu_time \
    && git init \
    && git remote add origin "https://github.com/mmis1000/gnu_time.git" \
    && git fetch --depth=1 origin 1e57444bdfca5d66074e227427fb59f68ec42949 \
    && git checkout 1e57444bdfca5d66074e227427fb59f68ec42949 \
    && git submodule update --progress --init --recursive \
    && ./bootstrap \
    && ./configure \
    && make \
    && cp time ../time \
    && cd ../ \
    && rm -rf gnu_time \
    && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*
    

# Clone slave files
COPY executer.js executer.js
COPY runner/*.js runner/
# COPY wrapper.c wrapper.c
# RUN gcc -O3 -std=c11 -o wrapper wrapper.c && \
RUN mkdir pids && \
    mkdir time_results