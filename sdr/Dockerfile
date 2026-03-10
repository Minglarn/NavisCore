FROM alpine:3.19 AS builder

RUN apk add --no-cache \
    git \
    build-base \
    librtlsdr-dev \
    libusb-dev \
    cmake \
    pkgconfig \
    zlib-dev \
    openssl-dev

WORKDIR /src
RUN git clone https://github.com/jvde-github/AIS-catcher.git . && \
    mkdir build && cd build && \
    cmake .. -DAIRSPY=OFF -DSDRPLAY=OFF -DAIRSPYHF=OFF -DHACKRF=OFF -DHYDRASDR=OFF -DZMQ=OFF -DPSQL=OFF -DNMEA2000=OFF -DSQLITE=OFF && \
    make -j$(nproc)

FROM alpine:3.19

RUN apk add --no-cache \
    librtlsdr \
    libusb \
    libstdc++ \
    libgcc \
    usbutils \
    tzdata \
    curl \
    jq

COPY --from=builder /src/build/AIS-catcher /usr/local/bin/AIS-catcher

# Ensure we have the udev rules available in container just in case, though host handles devices
COPY ./udev-rules/rtl-sdr.rules /etc/udev/rules.d/

# Add our custom startup script that handles ENV variables
COPY ./start.sh /start.sh
RUN chmod +x /start.sh

# Run the wrapper script instead of rtl_ais directly
ENTRYPOINT ["/start.sh"]
