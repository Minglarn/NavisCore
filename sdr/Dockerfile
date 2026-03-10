FROM alpine:3.19 AS builder

RUN apk add --no-cache \
    git \
    build-base \
    librtlsdr-dev \
    libusb-dev \
    cmake \
    pkgconfig

WORKDIR /src
RUN git clone https://github.com/dgiardini/rtl-ais.git . && \
    make

FROM alpine:3.19

RUN apk add --no-cache \
    librtlsdr \
    libusb \
    usbutils \
    tzdata

COPY --from=builder /src/rtl_ais /usr/local/bin/rtl_ais

# Ensure we have the udev rules available in container just in case, though host handles devices
COPY ./udev-rules/rtl-sdr.rules /etc/udev/rules.d/

# Add our custom startup script that handles ENV variables
COPY ./start.sh /start.sh
RUN chmod +x /start.sh

# Run the wrapper script instead of rtl_ais directly
ENTRYPOINT ["/start.sh"]
