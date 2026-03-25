FROM mwader/static-ffmpeg:6.0 AS ffmpeg-source
FROM n8nio/n8n:latest
USER root
COPY --from=ffmpeg-source /ffmpeg /usr/local/bin/
COPY --from=ffmpeg-source /ffprobe /usr/local/bin/
USER node
