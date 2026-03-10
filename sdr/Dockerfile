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

# Run rtl_ais: push UDP to the app container.
# -n: NMEA output, -h: host, -P: port
ENTRYPOINT ["/usr/local/bin/rtl_ais", "-n", "-h", "app", "-P", "10110"]
