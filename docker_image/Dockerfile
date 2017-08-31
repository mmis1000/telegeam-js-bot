# FROM ubuntu
FROM debian:jessie

# 1. install common utils
RUN apt-get update -y \
    && apt-get install -y apt-utils \
                       sudo \
                       tmux \
                       nano \
                       vim \
                       curl \
                       wget \
                       less \
                       software-properties-common \
    && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# 2. install build essential for c and cpp
RUN apt-get update -y \
    && apt-get install -y build-essential \
    && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# 3. install python 2 and 3
RUN apt-get update -y \
    && apt-get install -y python3 \
                          python2.7 \
    && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# 4. install node.js  
RUN apt-get update -y \
    && apt-get install -y nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# 5. fix node.js path
RUN ln -s /usr/bin/nodejs /usr/bin/node

# 6. install npm
RUN apt-get update -y \
    && apt-get install -y npm \
    && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# 7. install java
RUN apt-get -y update \
    && apt-get -y --no-install-recommends install openjdk-7-jdk \
    && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# 8. install php
RUN apt-get -y update \
    && apt-get install -y php5-cli \
    && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# 9. add golang
RUN apt-get -y update \
    && apt-get install -y golang \
    && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# 10. add rust lang
RUN curl -sSf https://static.rust-lang.org/rustup.sh | sh; \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# 11. add clisp
RUN echo 'deb http://httpredir.debian.org/debian wheezy main' >> /etc/apt/sources.list \
    && apt-get -y update \
    && apt-get install -y clisp \
    && sed -i '/wheezy/d' /etc/apt/sources.list \
    && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# 12. add lua
RUN echo 'deb http://httpredir.debian.org/debian jessie-backports main' >> /etc/apt/sources.list \
    && apt-get -y update \
    && apt-get install -y lua5.3 \
    && sed -i '/jessie-backports/d' /etc/apt/sources.list \
    && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# 13. add csharp and probably other .net based language
RUN apt-get -y update \
    && apt-get install -y mono-xbuild mono-mcs mono-devel \
    && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# 14. add ruby
RUN apt-get -y update \
    && apt-get install -y ruby \
    && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# 15. add vb
RUN apt-get -y update \
    && apt-get install -y mono-vbnc \
    && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# 16. Install wine and related packages
RUN dpkg --add-architecture i386 \
    && apt-get update \
	&& apt-get install -y --no-install-recommends wine \
	                                              wine32 \
    && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# 17. Use the latest version of winetricks
RUN curl -SL 'https://raw.githubusercontent.com/Winetricks/winetricks/master/src/winetricks' -o /usr/local/bin/winetricks \
	&& chmod +x /usr/local/bin/winetricks

# username
ENV USER_NAME debian

# Replace shell with bash so we can source files
RUN mv /bin/sh /bin/sh_backup && ln -s /bin/bash /bin/sh

# setup another account
RUN addgroup $USER_NAME; \
    useradd $USER_NAME -s /bin/bash -m -g $USER_NAME -G sudo; \
    passwd $USER_NAME -d; \
    bash -c "echo $USER_NAME ALL=NOPASSWD: ALL > /etc/sudoers.d/myOverrides"

# 18. install nvm as user
USER $USER_NAME

ENV NVM_DIR /home/$USER_NAME/.nvm
ENV NODE_VERSION 4.4.4

# Install nvm with node and npm
RUN curl https://raw.githubusercontent.com/creationix/nvm/v0.20.0/install.sh | bash \
    && source $NVM_DIR/nvm.sh \
    && mkdir -p $NVM_DIR/versions \
    && nvm install $NODE_VERSION \
    && nvm alias default $NODE_VERSION \
    && nvm use default

ENV NODE_PATH $NVM_DIR/versions/v$NODE_VERSION/lib/node_modules
ENV PATH      $NVM_DIR/versions/v$NODE_VERSION/bin:$PATH

# switch back for other lib
USER root

# Replace shell back
RUN rm /bin/sh && mv /bin/sh_backup /bin/sh

# 19. install brainfuck
RUN npm install -y -g brainless; \
    npm cache clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# 20. install coffee script
RUN npm install -y -g coffee-script; \
    npm cache clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# remove unused
RUN apt-get purge -y software-properties-common; \
    apt-get autoclean -y

# Set the locale
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y locales
RUN sed -i -e 's/# en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen && \
    locale-gen
ENV LANG en_US.UTF-8
ENV LANGUAGE en_US:en
ENV LC_ALL en_US.UTF-8

WORKDIR /home/$USER_NAME
USER $USER_NAME

#setup wine
RUN winetricks > /dev/null

# clone slave files
COPY executer.js executer.js
COPY runner/*.js runner/