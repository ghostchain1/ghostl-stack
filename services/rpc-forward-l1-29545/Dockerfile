FROM public.ecr.aws/docker/library/alpine:3.20
RUN apk add --no-cache socat bash curl
USER 65534:65534
ENTRYPOINT ["socat"]
